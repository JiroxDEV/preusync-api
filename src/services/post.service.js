/**
 * ============================================================================
 * Proyecto: PreuSync API
 * Archivo: post.service.js
 * Versión: v1.1.0
 * Descripción: Servicio de gestión de publicaciones (posts). Maneja creación,
 *              edición, borrado, reportes y consultas resilientes a RLS.
 * Autor: JiroxDEV
 * Licensed under the GNU Affero General Public License v3
 * ============================================================================
 */

import { supabase, supabaseAdmin } from '../config/supabase.js';
import { uploadImage } from '../utils/storage.js';

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
 */
export async function addPost(postData, userId) {
  if (!postData.title || !postData.details) {
    throw new Error('El título y los detalles son campos obligatorios');
  }

  const db = supabaseAdmin || supabase;
  let imageUrl = '';

  if (postData.imageBase64 && postData.imageBase64.trim()) {
    try {
      const filePath = `posts/${userId}/${Date.now()}.jpg`;
      imageUrl = await uploadImage(postData.imageBase64, postData.mimetype || 'image/jpeg', filePath);
    } catch (err) {
      logError('Error al subir imagen del post, se omite', err);
    }
  }

  const post = {
    title: postData.title.trim(),
    details: postData.details.trim(),
    image_url: imageUrl,
    author_id: userId
  };

  log(`💾 Creando nuevo post para usuario: ${userId}`);

  const { data, error } = await db.from('posts').insert(post).select('id').single();
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
  const db = supabaseAdmin || supabase;
  const { data: post, error: fetchError } = await db
    .from('posts')
    .select('author_id')
    .eq('id', postId)
    .single();

  if (fetchError) throw new Error('Publicación no encontrada');
  if (post.author_id !== userId) throw new Error('Acción no autorizada');

  const { error } = await db
    .from('posts')
    .update(updateData)
    .eq('id', postId);

  if (error) throw new Error('Fallo al actualizar el post');
  return { success: true };
}

// ==================== CONSULTAS Y LISTADOS ====================

/**
 * Obtiene publicaciones destacadas ordenadas por fecha o score.
 */
export async function getTopPosts(limit = 5, userId = null) {
  const db = supabaseAdmin || supabase;

  let { data, error } = await db
    .from('posts')
    .select('*, profiles(username, avatar_url)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    log(`⚠️ getTopPosts uniones explícitas fallaron, intentando select llano... (${error.message})`, 'WARN');
    const plain = await db.from('posts').select('*').order('created_at', { ascending: false }).limit(limit);
    if (plain.error) throw new Error(`Error al obtener posts top: ${plain.error.message}`);
    data = plain.data;
  }

  data = data || [];

  return data.map(row => ({
    id: row.id,
    title: row.title || '',
    details: row.details || '',
    imageUrl: row.image_url || '',
    author: row.profiles ? row.profiles.username : 'Comunidad',
    authorAvatar: row.profiles ? row.profiles.avatar_url : '',
    likes: row.likes || 0,
    dislikes: row.dislikes || 0,
    score: row.score || 0,
    userVote: 'none',
    createdAt: row.created_at
  }));
}

/**
 * Recupera un rango de publicaciones ordenadas por fecha de creación.
 */
export async function getPostsRange(start = 0, count = 10, userId = null) {
  const db = supabaseAdmin || supabase;

  let { data, error } = await db
    .from('posts')
    .select('*, profiles(username, avatar_url)')
    .order('created_at', { ascending: false })
    .range(start, start + count - 1);

  if (error) {
    log(`⚠️ getPostsRange uniones explícitas fallaron, intentando consulta plana... (${error.message})`, 'WARN');
    const plain = await db.from('posts').select('*').order('created_at', { ascending: false }).range(start, start + count - 1);
    if (plain.error) throw new Error(`Error al obtener rango de posts: ${plain.error.message}`);
    data = plain.data;
  }

  data = data || [];

  return data.map(row => ({
    id: row.id,
    title: row.title || '',
    details: row.details || '',
    imageUrl: row.image_url || '',
    author: row.profiles ? row.profiles.username : 'Comunidad',
    authorAvatar: row.profiles ? row.profiles.avatar_url : '',
    likes: row.likes || 0,
    dislikes: row.dislikes || 0,
    score: row.score || 0,
    userVote: 'none',
    createdAt: row.created_at
  }));
}

/**
 * Obtiene todas las publicaciones de un usuario específico.
 */
export async function getPostsByAuthor(authorId, start = 0, count = 10) {
  if (!authorId) throw new Error('Se requiere el ID del autor');
  const db = supabaseAdmin || supabase;

  let { data, error } = await db
    .from('posts')
    .select('*, profiles(username, avatar_url)')
    .eq('author_id', authorId)
    .order('created_at', { ascending: false })
    .range(start, start + count - 1);

  if (error) {
    const plain = await db.from('posts').select('*').eq('author_id', authorId).order('created_at', { ascending: false }).range(start, start + count - 1);
    if (plain.error) throw new Error(`Fallo al consultar publicaciones personales: ${plain.error.message}`);
    data = plain.data;
  }

  log(`📊 Consultados ${data?.length || 0} posts del autor: ${authorId}`, 'INFO');

  return (data || []).map(row => ({
    id: row.id,
    title: row.title || '',
    details: row.details || '',
    imageUrl: row.image_url || '',
    author: row.profiles ? row.profiles.username : 'Usuario',
    authorAvatar: row.profiles ? row.profiles.avatar_url : '',
    likes: row.likes || 0,
    dislikes: row.dislikes || 0,
    score: row.score || 0,
    createdAt: row.created_at
  }));
}

// ==================== ESTADÍSTICAS Y MANTENIMIENTO ====================

/**
 * Calcula contadores acumulados de actividad para un perfil de usuario.
 */
export async function getUserStats(userId) {
  if (!userId) throw new Error('ID de usuario obligatorio');
  const db = supabaseAdmin || supabase;

  const { count: postCount, error: postError } = await db
    .from('posts')
    .select('*', { count: 'exact', head: true })
    .eq('author_id', userId);

  if (postError) {
    logError(`❌ Fallo en conteo de posts: ${userId}`, postError);
    return { postCount: 0, totalLikes: 0, totalDislikes: 0 };
  }

  const { data: sums, error: sumsError } = await db
    .from('posts')
    .select('likes')
    .eq('author_id', userId);

  let totalLikes = 0;
  if (sums) {
    sums.forEach(post => {
      totalLikes += post.likes || 0;
    });
  }

  log(`📊 Estadísticas finales: posts=${postCount}, likes=${totalLikes}`, 'INFO');

  return { postCount: postCount || 0, totalLikes, totalDislikes: 0 };
}

/**
 * Elimina una publicación. Requiere comprobación de autoría.
 */
export async function deletePost(postId, userId) {
  const db = supabaseAdmin || supabase;
  const { data: post, error: fetchError } = await db
    .from('posts')
    .select('author_id')
    .eq('id', postId)
    .single();

  if (fetchError) throw new Error('Publicación inexistente');
  if (post.author_id !== userId) throw new Error('Borrador no autorizado');

  const { error } = await db.from('posts').delete().eq('id', postId);
  if (error) throw new Error('Fallo al eliminar de la DB');
  return { success: true };
}

/**
 * Registra una denuncia sobre un post.
 */
export async function reportPost(postId, userId, reason = '') {
  const db = supabaseAdmin || supabase;
  const { data: post, error: fetchError } = await db
    .from('posts')
    .select('id')
    .eq('id', postId)
    .single();

  if (fetchError) throw new Error('Post no encontrado');

  const { error } = await db
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
  const db = supabaseAdmin || supabase;
  const { data, error } = await db
    .from('posts')
    .select('*, profiles(username, avatar_url)')
    .eq('id', postId)
    .single();

  if (error) throw new Error('Post no disponible');
  return {
    id: data.id,
    title: data.title || '',
    details: data.details || '',
    imageUrl: data.image_url || '',
    author: data.profiles ? data.profiles.username : 'Comunidad',
    authorAvatar: data.profiles ? data.profiles.avatar_url : '',
    likes: data.likes || 0,
    dislikes: data.dislikes || 0,
    score: data.score || 0,
    createdAt: data.created_at
  };
}
