/**
 * ============================================================================
 * Proyecto: PreuSync API
 * Archivo: storage.js
 * Versión: v1.0.0
 * Descripción: Utilidades para la gestión de archivos en Supabase Storage.
 *              Maneja la subida, borrado y listado de imágenes con control
 *              de tamaños y tipos MIME permitidos.
 * Autor: JiroxDEV
 * Licensed under the GNU Affero General Public License v3
 * ============================================================================
 */

import { supabase } from '../config/supabase.js';

// ==================== CONFIGURACIÓN DE LOGS ====================

const log = (message, level = 'INFO', metadata = {}) => {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(metadata).length ? ` | ${JSON.stringify(metadata)}` : '';
  console.log(`[${timestamp}] [Storage] [${level}] ${message}${metaStr}`);
};

const logError = (message, error, metadata = {}) => {
  log(`${message}: ${error.message}`, 'ERROR', { ...metadata, stack: error.stack });
};

// ==================== CONSTANTES DE SEGURIDAD ====================

const BUCKET_NAME = 'user-files';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // Límite de 10MB por archivo.
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml'
];

// ==================== OPERACIONES DE STORAGE ====================

/**
 * Sube una imagen codificada en base64 al almacenamiento en la nube.
 * @param {string} base64Data Cadena base64 de la imagen.
 * @param {string} mimeType Tipo de imagen (ej. image/png).
 * @param {string} filePath Ruta lógica de destino en el bucket.
 * @returns {Promise<string>} URL pública de acceso a la imagen.
 */
export async function uploadImage(base64Data, mimeType, filePath) {
  log(`📤 Iniciando subida de imagen a: ${filePath}`, 'INFO', { mimeType });

  if (!supabase) {
    log('❌ Cliente de Supabase no inicializado', 'ERROR');
    throw new Error('Servicio de almacenamiento no disponible');
  }

  // 1. Verificación y creación automática del bucket si no existe.
  try {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
      logError('❌ No se pudo listar los buckets', listError);
      throw new Error('Fallo en el servicio de Storage');
    }
    const bucketExists = buckets.some(b => b.name === BUCKET_NAME);
    if (!bucketExists) {
      log(`⚠️ El bucket "${BUCKET_NAME}" no existe. Creándolo...`, 'WARN');
      const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: MAX_FILE_SIZE
      });
      if (createError) {
        logError(`❌ Error al crear el bucket "${BUCKET_NAME}"`, createError);
        throw new Error('No se pudo configurar el almacenamiento');
      }
      log(`✅ Bucket "${BUCKET_NAME}" configurado correctamente`, 'INFO');
    }
  } catch (bucketError) {
    logError('❌ Fallo en validación de bucket', bucketError);
    throw new Error('Error de infraestructura de almacenamiento');
  }

  // 2. Limpieza de cabeceras data:image/... de la cadena base64.
  if (!base64Data || typeof base64Data !== 'string') {
    throw new Error('Datos de imagen inválidos');
  }

  let cleanBase64 = base64Data;
  if (base64Data.includes(';base64,')) {
    cleanBase64 = base64Data.split(';base64,')[1];
  }

  // 3. Control de peso del archivo.
  const approximateSize = Buffer.from(cleanBase64, 'base64').length;
  if (approximateSize > MAX_FILE_SIZE) {
    log(`❌ Archivo demasiado pesado: ${approximateSize} bytes`, 'WARN');
    throw new Error(`El archivo supera el límite de ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
  }

  // 4. Conversión a Buffer binario para la subida.
  let buffer;
  try {
    buffer = Buffer.from(cleanBase64, 'base64');
  } catch (decodeError) {
    logError('❌ Fallo al decodificar base64', decodeError);
    throw new Error('Formato de datos corrupto');
  }

  // 5. Transferencia al Storage de Supabase.
  log(`📤 Transfiriendo archivo binario a ${BUCKET_NAME}/${filePath}`, 'INFO');
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, buffer, {
      contentType: mimeType || 'image/jpeg',
      cacheControl: '3600',
      upsert: true // Permite actualizar imágenes existentes en la misma ruta.
    });

  if (error) {
    logError(`❌ Fallo en la subida física de ${filePath}`, error);
    throw new Error(`Error de transferencia: ${error.message}`);
  }

  log(`✅ Archivo subido exitosamente: ${filePath}`, 'INFO');

  // 6. Generación de la URL pública para visualización en la App.
  const { publicUrl } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filePath);

  log(`✅ URL pública generada: ${publicUrl}`, 'INFO');
  return publicUrl;
}

// ==================== UTILIDADES DE MANTENIMIENTO ====================

/**
 * Borra una imagen del servidor.
 */
export async function deleteImage(filePath) {
  log(`🗑️ Eliminando imagen: ${filePath}`, 'INFO');

  if (!filePath) throw new Error('Ruta de archivo obligatoria');

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([filePath]);

  if (error) {
    logError(`❌ Fallo al borrar imagen: ${filePath}`, error);
    throw new Error('No se pudo eliminar el archivo');
  }

  log(`✅ Imagen eliminada con éxito: ${filePath}`, 'INFO');
  return { success: true };
}

/**
 * Lista los archivos contenidos en una carpeta del bucket.
 */
export async function listImages(folderPath) {
  log(`📂 Listando contenido de: ${folderPath}`, 'INFO');

  if (!folderPath) throw new Error('Ruta de carpeta obligatoria');

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .list(folderPath);

  if (error) {
    logError(`❌ Fallo al listar archivos en ${folderPath}`, error);
    throw new Error('Error al consultar el directorio');
  }

  const files = data?.map(file => file.name) || [];
  log(`✅ Encontradas ${files.length} imágenes en ${folderPath}`, 'INFO');
  return files;
}

/**
 * Borra recursivamente todas las imágenes de un directorio (limpieza de usuario).
 */
export async function deleteFolderImages(folderPath) {
  log(`🗑️ Limpieza masiva de carpeta: ${folderPath}`, 'WARN');

  const files = await listImages(folderPath);
  if (files.length === 0) return { success: true, deleted: 0 };

  const filePaths = files.map(file => `${folderPath}/${file}`);
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove(filePaths);

  if (error) {
    logError(`❌ Fallo al vaciar carpeta: ${folderPath}`, error);
    throw new Error('Error en limpieza masiva');
  }

  log(`✅ Eliminadas ${filePaths.length} imágenes de ${folderPath}`, 'INFO');
  return { success: true, deleted: filePaths.length };
}


