/**
 * ============================================================================
 * Proyecto: PreuSync API
 * Archivo: post.service.js
 * Versión: v1.0.0
 * Descripción: Servicio de gestión de publicaciones (posts). Maneja la creación,
 *              edición, borrado, reportes y estadísticas del usuario.
 * Autor: JiroxDEV
 * Licensed under the GNU Affero General Public License v3
 * Licensed under the GNU Affero General Public License v3
 * ============================================================================
 */

import { supabase } from '../config/supabase.js';
import { uploadImage } from '../utils/storage.js';

// Logger de actividad para el servicio de publicaciones.
const log = (message, level = 'INFO', metadata = {}) => {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(metadata).length ? ` | ${JSON.stringify(metadata)}` : '';
  console.log(`[${timestamp}] [PostService] [${level}] ${message}${metaStr}`);
};

const logError = (message, error, metadata = {}) => {
  log(`${message}: ${error.message}`, 'ERROR', { ...metadata, stack: error.stack });
};

// ==================== OPERACIONES CRUD ====================

/**
 * Registra una nueva publicación de la comunidad.
 * @param {Object} postData Datos del post (título, detalles, imagen).
 * @param {string} userId ID del autor del post.
 */
export async function addPost(postData, userId) {
  if (!postData.title || !postData.details) {
    throw new Error('El título y los detalles son campos obligatorios');
  }

  let imageUrl = '';
  // Soporte para subida de imagen adjunta opcional.
  if (postData.imageBase64 && postData.imageBase64.trim()) {
    try {
      const filePath = `posts/${userId}/${Date.now()}.jpg`;
      imageUrl = await uploadImage(postData.imageBase64, postData.mimetype || 'image/jpeg', filePath);
    } catch (err) {
      logError('Error al subir imagen del post, se omite', err);
    }
  }

  const post = {
    title: postData.title,
    details: postData.details,
    image_url: imageUrl,
    author_id: userId,
    likes: 0,
    dislikes: 0,
    score: 0
  };

  const { data, error } = await supabase.from('posts').insert(post).select('id').single();
  if (error) {
    logError(`❌ Error al crear post para el usuario: ${userId}`, error);
    throw new Error(`Fallo al publicar: ${error.message}`);
  }

  log(`✅ Post publicado con éxito (ID: ${data.id}) por usuario: ${userId}`, 'INFO');
  return { id: data.id, imageUrl };
}

/**
 * Modifica el contenido de un post existente si el usuario es el autor.
 */
export async function editPost(postId, userId, updateData) {
  const { data: post, error: fetchError } = await supabase
    .from('posts')
    .select('author_id')
    .eq('id', postId)
    .single();

  if (fetchError) throw new Error('Publicación no encontrada');
  if (post.author_id !== userId) throw new Error('Acción no autorizada');

  const { error } = await supabase
    .from('posts')
    .update(updateData)
    .eq('id', postId);

  if (error) throw new Error('Fallo al actualizar el post');
  return { success: true };
}

// ==================== CONSULTAS Y LISTADOS ====================

/**
 * Obtiene publicaciones destacadas ordenadas por score (relevancia).
 */
export async function getTopPosts(limit = 5, userId = null) {
  let query = supabase
    .from('posts')
    .select('*, profiles!posts_author_id_fkey(username, avatar_url)')
    .order('score', { ascending: false })
    .limit(limit);

  const { data, error } = await query;
  if (error) throw new Error(`Error al obtener posts top: ${error.message}`);

  // Inyectar el voto del usuario actual si está autenticado.
  let userVotes = {};
  if (userId) {
    const { data: votes } = await supabase
      .from('votes')
      .select('post_id, vote_type')
      .eq('user_id', userId);
    votes.forEach(v => userVotes[v.post_id] = v.vote_type);
  }

  return data.map(row => ({
    id: row.id,
    title: row.title,
    details: row.details,
    imageUrl: row.image_url,
    author: row.profiles.username,
    authorAvatar: row.profiles.avatar_url,
    likes: row.likes,
    dislikes: row.dislikes,
    score: row.score,
    userVote: userVotes[row.id] || 'none',
    createdAt: row.created_at
  }));
}

/**
 * Recupera un rango de publicaciones ordenadas por fecha de creación.
 */
export async function getPostsRange(start = 0, count = 10, userId = null) {
  let query = supabase
    .from('posts')
    .select('*, profiles!posts_author_id_fkey(username, avatar_url)')
    .order('created_at', { ascending: false })
    .range(start, start + count - 1);

  const { data, error } = await query;
  if (error) throw new Error(`Error al obtener rango de posts: ${error.message}`);

  let userVotes = {};
  if (userId) {
    const { data: votes } = await supabase
      .from('votes')
      .select('post_id, vote_type')
      .eq('user_id', userId);
    votes.forEach(v => userVotes[v.post_id] = v.vote_type);
  }

  return data.map(row => ({
    id: row.id,
    title: row.title,
    details: row.details,
    imageUrl: row.image_url,
    author: row.profiles.username,
    authorAvatar: row.profiles.avatar_url,
    likes: row.likes,
    dislikes: row.dislikes,
    score: row.score,
    userVote: userVotes[row.id] || 'none',
    createdAt: row.created_at
  }));
}

/**
 * Obtiene todas las publicaciones de un usuario específico.
 */
export async function getPostsByAuthor(authorId, start = 0, count = 10) {
  if (!authorId) throw new Error('Se requiere el ID del autor');

  const { data, error } = await supabase
    .from('posts')
    .select('*, profiles!posts_author_id_fkey(username, avatar_url)')
    .eq('author_id', authorId)
    .order('created_at', { ascending: false })
    .range(start, start + count - 1);

  if (error) {
    logError(`❌ Error al obtener posts del autor: ${authorId}`, error);
    throw new Error(`Fallo al consultar publicaciones personales: ${error.message}`);
  }

  log(`📊 Consultados ${data?.length || 0} posts del autor: ${authorId}`, 'INFO');

  return data.map(row => ({
    id: row.id,
    title: row.title,
    details: row.details,
    imageUrl: row.image_url,
    author: row.profiles.username,
    authorAvatar: row.profiles.avatar_url,
    likes: row.likes,
    dislikes: row.dislikes,
    score: row.score,
    createdAt: row.created_at
  }));
}

// ==================== ESTADÍSTICAS Y MANTENIMIENTO ====================

/**
 * Calcula contadores acumulados de actividad para un perfil de usuario.
 */
export async function getUserStats(userId) {
  if (!userId) throw new Error('ID de usuario obligatorio');

  // Conteo total de publicaciones.
  const { count: postCount, error: postError } = await supabase
    .from('posts')
    .select('*', { count: 'exact', head: true })
    .eq('author_id', userId);

  if (postError) {
    logError(`❌ Fallo en conteo de posts: ${userId}`, postError);
    throw new Error(`Error en estadísticas: ${postError.message}`);
  }

  // Suma de reacciones recibidas en sus publicaciones.
  const { data: sums, error: sumsError } = await supabase
    .from('posts')
    .select('likes, dislikes')
    .eq('author_id', userId);

  if (sumsError) {
    logError(`❌ Fallo al sumar reacciones: ${userId}`, sumsError);
    throw new Error(`Error en suma de votos: ${sumsError.message}`);
  }

  let totalLikes = 0, totalDislikes = 0;
  sums.forEach(post => {
    totalLikes += post.likes || 0;
    totalDislikes += post.dislikes || 0;
  });

  log(`📊 Estadísticas finales: posts=${postCount}, likes=${totalLikes}, dislikes=${totalDislikes}`, 'INFO');

  return { postCount, totalLikes, totalDislikes };
}

/**
 * Elimina una publicación. Requiere comprobación de autoría.
 */
export async function deletePost(postId, userId) {
  const { data: post, error: fetchError } = await supabase
    .from('posts')
    .select('author_id')
    .eq('id', postId)
    .single();

  if (fetchError) throw new Error('Publicación inexistente');
  if (post.author_id !== userId) throw new Error('Borrador no autorizado');

  const { error } = await supabase.from('posts').delete().eq('id', postId);
  if (error) throw new Error('Fallo al eliminar de la DB');
  return { success: true };
}

/**
 * Registra una denuncia sobre un post.
 */
export async function reportPost(postId, userId, reason = '') {
  const { data: post, error: fetchError } = await supabase
    .from('posts')
    .select('id')
    .eq('id', postId)
    .single();

  if (fetchError) throw new Error('Post no encontrado');

  const { error } = await supabase
    .from('reports')
    .insert({
      post_id: postId,
      reporter_id: userId,
      reason: reason || ''
    });

  if (error) throw new Error('Fallo al enviar denuncia');
  return { success: true };
}

/**
 * Obtiene un post individual por su ID único.
 */
export async function getPostById(postId) {
  const { data, error } = await supabase
    .from('posts')
    .select('*, profiles!posts_author_id_fkey(username, avatar_url)')
    .eq('id', postId)
    .single();

  if (error) throw new Error('Post no disponible');
  return {
    id: data.id,
    title: data.title,
    details: data.details,
    imageUrl: data.image_url,
    author: data.profiles.username,
    authorAvatar: data.profiles.avatar_url,
    likes: data.likes,
    dislikes: data.dislikes,
    score: data.score,
    createdAt: data.created_at
  };
}


