/**
 * ============================================================================
 * Proyecto: PreuSync API
 * Archivo: news.service.js
 * Versión: v1.0.0
 * Descripción: Servicio para la gestión de noticias. Maneja la creación,
 *              edición, recuperación por rangos y subida de imágenes.
 * Autor: JiroxDEV
 * Licensed under the GNU Affero General Public License v3
 * Licensed under the GNU Affero General Public License v3
 * ============================================================================
 */

import { supabase } from '../config/supabase.js';
import { uploadImage } from '../utils/storage.js';

// Logger interno para el servicio de noticias.
const log = (message, level = 'INFO', metadata = {}) => {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(metadata).length ? ` | ${JSON.stringify(metadata)}` : '';
  console.log(`[${timestamp}] [NewsService] [${level}] ${message}${metaStr}`);
};

const logError = (message, error, metadata = {}) => {
  log(`${message}: ${error.message}`, 'ERROR', { ...metadata, stack: error.stack });
};

// ==================== CREACIÓN DE NOTICIAS ====================

/**
 * Crea una nueva noticia en la base de datos.
 * @param {Object} newsData Datos de la noticia (encabezado, detalles, etc).
 * @param {string} userId ID del usuario que crea la noticia (staff/admin).
 */
export async function addNews(newsData, userId) {
  const required = ['headline', 'details', 'source', 'url'];
  for (const field of required) {
    if (!newsData[field] || !newsData[field].trim()) {
      throw new Error(`Campo obligatorio faltante: ${field}`);
    }
  }

  let imageUrl = '';
  // Si se incluye una imagen en base64, se sube al almacenamiento.
  if (newsData.imageBase64 && newsData.imageBase64.trim()) {
    try {
      const filePath = `news/${userId}/${Date.now()}.jpg`;
      imageUrl = await uploadImage(newsData.imageBase64, newsData.mimetype || 'image/jpeg', filePath);
    } catch (err) {
      logError('Fallo en la subida de imagen, se continuará sin ella', err);
    }
  }

  const news = {
    headline: newsData.headline.trim(),
    details: newsData.details.trim(),
    image_url: imageUrl,
    source: newsData.source.trim(),
    url: newsData.url.trim(),
    importance: parseInt(newsData.importance) || 0
  };

  const { data, error } = await supabase.from('news').insert(news).select('id').single();
  if (error) {
    logError(`❌ Error al crear noticia por el usuario: ${userId}`, error);
    throw new Error(`Fallo al añadir noticia: ${error.message}`);
  }

  log(`✅ Noticia creada con éxito (ID: ${data.id}) por usuario: ${userId}`, 'INFO');
  return { id: data.id, imageUrl };
}

// ==================== EDICIÓN Y CONSULTA ====================

/**
 * Actualiza los datos de una noticia existente.
 */
export async function editNews(newsId, userId, updateData) {
  const { data: news, error: fetchError } = await supabase
    .from('news')
    .select('id')
    .eq('id', newsId)
    .single();

  if (fetchError) throw new Error('Noticia no encontrada');

  const { error } = await supabase
    .from('news')
    .update(updateData)
    .eq('id', newsId);

  if (error) throw new Error('Fallo al actualizar la noticia');
  return { success: true };
}

/**
 * Obtiene las noticias más importantes (mayor relevancia).
 */
export async function getTopNews(limit = 5) {
  const { data, error } = await supabase
    .from('news')
    .select('*')
    .order('importance', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Fallo al obtener noticias: ${error.message}`);
  return data.map(row => ({
    id: row.id,
    headline: row.headline,
    details: row.details,
    imageUrl: row.image_url,
    source: row.source,
    url: row.url,
    importance: row.importance,
    createdAt: row.created_at
  }));
}

/**
 * Recupera un rango de noticias ordenadas por fecha (para paginación).
 */
export async function getNewsRange(start = 0, count = 10) {
  const { data, error } = await supabase
    .from('news')
    .select('*')
    .order('created_at', { ascending: false })
    .range(start, start + count - 1);

  if (error) throw new Error(`Fallo al obtener noticias: ${error.message}`);
  return data.map(row => ({
    id: row.id,
    headline: row.headline,
    details: row.details,
    imageUrl: row.image_url,
    source: row.source,
    url: row.url,
    importance: row.importance,
    createdAt: row.created_at
  }));
}

/**
 * Obtiene la información detallada de una noticia específica.
 */
export async function getNewsById(newsId) {
  const { data, error } = await supabase
    .from('news')
    .select('*')
    .eq('id', newsId)
    .single();

  if (error) throw new Error('Noticia no encontrada');
  return {
    id: data.id,
    headline: data.headline,
    details: data.details,
    imageUrl: data.image_url,
    source: data.source,
    url: data.url,
    importance: data.importance,
    createdAt: data.created_at
  };
}


