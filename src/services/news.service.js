/**
 * ============================================================================
 * Proyecto: PreuSync API
 * Archivo: news.service.js
 * Versión: v2.0.0
 * Descripción: Servicio para la gestión de noticias.
 *              Vinculado al nodo especializado dbNews (DB 5).
 * Autor: JiroxDEV
 * Licensed under the GNU Affero General Public License v3
 * ============================================================================
 */

import { dbNews } from '../config/supabase.js';
import { uploadImage } from '../utils/storage.js';

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
 */
export async function addNews(newsData, userId) {
  const required = ['headline', 'details', 'source'];
  for (const field of required) {
    if (!newsData[field] || !newsData[field].trim()) {
      throw new Error(`Campo obligatorio faltante: ${field}`);
    }
  }

  let imageUrl = '';

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
    url: newsData.url ? newsData.url.trim() : 'https://preusync.com'
  };

  const { data, error } = await dbNews.from('news').insert(news).select('id').single();
  if (error) {
    logError(`❌ Error al crear noticia por el usuario: ${userId}`, error);
    throw new Error(`Fallo al añadir noticia: ${error.message}`);
  }

  log(`✅ Noticia creada con éxito (ID: ${data.id}) por usuario: ${userId}`, 'INFO');
  return { id: data.id, imageUrl };
}

// ==================== EDICIÓN Y CONSULTA ====================

export async function editNews(newsId, userId, updateData) {
  const { data: news, error: fetchError } = await dbNews
    .from('news')
    .select('id')
    .eq('id', newsId)
    .single();

  if (fetchError) throw new Error('Noticia no encontrada');

  const { error } = await dbNews
    .from('news')
    .update(updateData)
    .eq('id', newsId);

  if (error) throw new Error('Fallo al actualizar la noticia');
  return { success: true };
}

export async function getTopNews(limit = 5) {
  const { data, error } = await dbNews
    .from('news')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Fallo al obtener noticias: ${error.message}`);
  return (data || []).map(row => ({
    id: row.id,
    headline: row.headline || '',
    details: row.details || '',
    imageUrl: row.image_url || '',
    source: row.source || 'PreuSync',
    url: row.url || '',
    createdAt: row.created_at
  }));
}

export async function getNewsRange(start = 0, count = 10) {
  const { data, error } = await dbNews
    .from('news')
    .select('*')
    .order('created_at', { ascending: false })
    .range(start, start + count - 1);

  if (error) throw new Error(`Fallo al obtener noticias: ${error.message}`);
  return (data || []).map(row => ({
    id: row.id,
    headline: row.headline || '',
    details: row.details || '',
    imageUrl: row.image_url || '',
    source: row.source || 'PreuSync',
    url: row.url || '',
    createdAt: row.created_at
  }));
}

export async function getNewsById(newsId) {
  const { data, error } = await dbNews
    .from('news')
    .select('*')
    .eq('id', newsId)
    .single();

  if (error) throw new Error('Noticia no encontrada');
  return {
    id: data.id,
    headline: data.headline || '',
    details: data.details || '',
    imageUrl: data.image_url || '',
    source: data.source || 'PreuSync',
    url: data.url || '',
    createdAt: data.created_at
  };
}
