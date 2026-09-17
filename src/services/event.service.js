/**
 * ============================================================================
 * Proyecto: PreuSync API
 * Archivo: event.service.js
 * Versión: v1.0.0
 * Descripción: Servicio de gestión de eventos (escolares y externos).
 *              Controla el registro de actividades, su ubicación y persistencia.
 * Autor: JiroxDEV
 * Licensed under the GNU Affero General Public License v3
 * ============================================================================
 */

import { supabase } from '../config/supabase.js';
import { uploadImage } from '../utils/storage.js';

// Logger para el seguimiento de eventos programados.
const log = (message, level = 'INFO', metadata = {}) => {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(metadata).length ? ` | ${JSON.stringify(metadata)}` : '';
  console.log(`[${timestamp}] [EventService] [${level}] ${message}${metaStr}`);
};

const logError = (message, error, metadata = {}) => {
  log(`${message}: ${error.message}`, 'ERROR', { ...metadata, stack: error.stack });
};

// ==================== CREACIÓN DE EVENTOS ====================

/**
 * Registra un nuevo evento en la base de datos.
 * @param {Object} eventData Datos del evento (título, detalles, fecha, hora, lugar).
 * @param {string} userId ID del staff que organiza el evento.
 */
export async function addEvent(eventData, userId) {
  const required = ['title', 'details', 'date', 'time', 'location'];
  for (const field of required) {
    if (!eventData[field] || !eventData[field].trim()) {
      throw new Error(`Campo obligatorio faltante para el evento: ${field}`);
    }
  }

  // Clasificación del evento (por defecto 'school').
  const eventType = eventData.eventType === 'external' ? 'external' : 'school';
  let imageUrl = '';

  // Procesado de imagen si se adjunta póster o foto del evento.
  if (eventData.imageBase64 && eventData.imageBase64.trim()) {
    try {
      const filePath = `events/${userId}/${Date.now()}.jpg`;
      imageUrl = await uploadImage(eventData.imageBase64, eventData.mimetype || 'image/jpeg', filePath);
    } catch (err) {
      logError('Fallo al subir imagen del evento, continuando sin ella', err);
    }
  }

  const event = {
    title: eventData.title.trim(),
    details: eventData.details.trim(),
    image_url: imageUrl,
    date: eventData.date.trim(),
    time: eventData.time.trim(),
    location: eventData.location.trim(),
    event_type: eventType
  };

  const { data, error } = await supabase.from('events').insert(event).select('id').single();
  if (error) {
    logError(`❌ Error al crear evento por el usuario: ${userId}`, error);
    throw new Error(`Fallo al añadir el evento: ${error.message}`);
  }

  log(`✅ Evento "${event.title}" creado con éxito (ID: ${data.id}) por usuario: ${userId}`, 'INFO');
  return { id: data.id, imageUrl };
}

// ==================== EDICIÓN Y BORRADO ====================

/**
 * Modifica los datos de un evento existente.
 */
export async function editEvent(eventId, userId, updateData) {
  const { data: event, error: fetchError } = await supabase
    .from('events')
    .select('id')
    .eq('id', eventId)
    .single();

  if (fetchError) throw new Error('Evento no encontrado');

  const { error } = await supabase
    .from('events')
    .update(updateData)
    .eq('id', eventId);

  if (error) throw new Error('Fallo al actualizar el evento en la DB');
  return { success: true };
}

/**
 * Elimina definitivamente un evento.
 */
export async function deleteEvent(eventId, userId) {
  const { error } = await supabase.from('events').delete().eq('id', eventId);
  if (error) throw new Error('Fallo al eliminar el evento');
  return { success: true };
}

// ==================== CONSULTAS ====================

/**
 * Obtiene un rango de eventos filtrados por tipo y escuela para el listado cronológico.
 */
export async function getEventsRange(eventType = 'school', start = 0, count = 10, schoolId = null) {
  if (!['school', 'external'].includes(eventType)) {
    throw new Error('Tipo de evento inválido');
  }

  let query = supabase
    .from('events')
    .select('*')
    .eq('event_type', eventType)
    .order('date', { ascending: true }) // Ordenamos por fecha más cercana.
    .range(start, start + count - 1);

  // Filtramos por el ID de la escuela si se proporciona (Multi-Tenancy).
  if (schoolId) {
    query = query.eq('school_id', schoolId);
  }

  const { data, error } = await query;

  if (error) throw new Error(`Fallo al recuperar eventos: ${error.message}`);
  return data.map(row => ({
    id: row.id,
    title: row.title,
    details: row.details,
    imageUrl: row.image_url,
    date: row.date,
    time: row.time,
    location: row.location,
    eventType: row.event_type,
    createdAt: row.created_at
  }));
}

/**
 * Recupera la información completa de un evento por su identificador.
 */
export async function getEventById(eventId) {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .single();

  if (error) throw new Error('El evento ya no está disponible');
  return {
    id: data.id,
    title: data.title,
    details: data.details,
    imageUrl: data.image_url,
    date: data.date,
    time: data.time,
    location: data.location,
    eventType: data.event_type,
    createdAt: data.created_at
  };
}


