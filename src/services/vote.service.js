/**
 * ============================================================================
 * Proyecto: PreuSync API
 * Archivo: vote.service.js
 * Versión: v1.0.0
 * Descripción: Servicio de interacción mediante votos (likes/dislikes).
 *              Utiliza funciones RPC de Postgres para asegurar atomicidad.
 * Autor: JiroxDEV
 * Licensed under the GNU Affero General Public License v3
 * ============================================================================
 */

import { supabase } from '../config/supabase.js';

// Logger de eventos para el sistema de votación.
const log = (message, level = 'INFO', metadata = {}) => {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(metadata).length ? ` | ${JSON.stringify(metadata)}` : '';
  console.log(`[${timestamp}] [VoteService] [${level}] ${message}${metaStr}`);
};

const logError = (message, error, metadata = {}) => {
  log(`${message}: ${error.message}`, 'ERROR', { ...metadata, stack: error.stack });
};

// ==================== ACCIONES DE VOTO ====================

/**
 * Registra o actualiza el voto de un usuario en una publicación.
 * @param {string} postId ID de la publicación.
 * @param {string} userId ID del usuario que vota.
 * @param {string} voteType Tipo de voto ('like', 'dislike', 'none').
 */
export async function setVote(postId, userId, voteType) {
  if (!postId || !userId) throw new Error('Se requiere ID de post y de usuario');
  if (!['like', 'dislike', 'none'].includes(voteType)) {
    throw new Error('Tipo de voto inválido');
  }

  // Comprobación de seguridad: No se permite votar en publicaciones propias.
  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('author_id')
    .eq('id', postId)
    .single();

  if (postError) throw new Error('Publicación no encontrada');
  if (post.author_id === userId) throw new Error('No puedes votar en tus propias publicaciones');

  // Ejecución de la lógica de negocio en base de datos para evitar condiciones de carrera.
  const { data, error } = await supabase.rpc('handle_vote', {
    p_post_id: postId,
    p_user_id: userId,
    p_vote_type: voteType
  });

  if (error) {
    logError(`❌ Fallo al procesar voto para el post ${postId}`, error);
    throw new Error(`Error en el servidor de votos: ${error.message}`);
  }

  log(`✅ Voto registrado: ${voteType} en post ${postId} por usuario ${userId}`, 'INFO');
  return data;
}

// ==================== CONSULTAS DE VOTOS ====================

/**
 * Obtiene el estado actual del voto de un usuario específico en un post.
 */
export async function getUserVote(postId, userId) {
  const { data, error } = await supabase
    .from('votes')
    .select('vote_type')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`Fallo al consultar voto: ${error.message}`);
  return data?.vote_type || 'none';
}

/**
 * Recupera el historial completo de votos realizados por un usuario.
 */
export async function getUserVotes(userId) {
  const { data, error } = await supabase
    .from('votes')
    .select('post_id, vote_type')
    .eq('user_id', userId);

  if (error) throw new Error(`Fallo al obtener historial de votos: ${error.message}`);
  return data;
}

/**
 * Consulta los contadores acumulados de reacciones para un post.
 */
export async function getPostVoteCounts(postId) {
  const { data, error } = await supabase
    .from('posts')
    .select('likes, dislikes')
    .eq('id', postId)
    .single();

  if (error) throw new Error(`Fallo al obtener contadores: ${error.message}`);
  return { likes: data.likes, dislikes: data.dislikes };
}


