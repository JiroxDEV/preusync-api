/**
 * ============================================================================
 * Proyecto: PreuSync API
 * Archivo: schedule.service.js
 * Versión: v2.5.0
 * Descripción: Servicio de gestión de horarios escolares dinámicos unificados.
 *              Soporta resolución relacional por group_id y school_id.
 * Autor: JiroxDEV
 * Licensed under the GNU Affero General Public License v3
 * ============================================================================
 */

import { supabase, supabaseAdmin } from '../config/supabase.js';

const log = (message, level = 'INFO', metadata = {}) => {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(metadata).length ? ` | ${JSON.stringify(metadata)}` : '';
  console.log(`[${timestamp}] [ScheduleService] [${level}] ${message}${metaStr}`);
};

const logError = (message, error, metadata = {}) => {
  log(`${message}: ${error.message}`, 'ERROR', { ...metadata, stack: error.stack });
};

// ==================== CONSULTA DE HORARIOS ====================

/**
 * Obtiene el horario dinámico de un grupo específico en una escuela.
 */
export async function getSchedule(group, schoolId) {
  if (!group || !group.trim() || !schoolId) {
    log('❌ Datos insuficientes para consultar horario (Grupo o SchoolId faltante)', 'WARN');
    throw new Error('Grupo y Escuela obligatorios');
  }

  const db = supabaseAdmin || supabase;

  // 1. Obtener el UUID del grupo en school_groups
  let groupId = null;
  const { data: groupRow } = await db
    .from('school_groups')
    .select('id')
    .eq('name', group.trim())
    .eq('school_id', schoolId)
    .maybeSingle();

  if (groupRow) {
    groupId = groupRow.id;
  }

  // 2. Consultar schedules por group_id
  let query = db.from('schedules').select('*').eq('school_id', schoolId);
  if (groupId) {
    query = query.eq('group_id', groupId);
  } else {
    query = query.eq('group_name', group.trim());
  }

  let { data, error } = await query.order('shift', { ascending: true });

  if (error || !data || data.length === 0) {
    const fallbackRes = await db
      .from('schedules')
      .select('*')
      .or(`group_name.eq.${group.trim()},group.eq.${group.trim()}`)
      .eq('school_id', schoolId)
      .order('shift', { ascending: true });

    if (!fallbackRes.error && fallbackRes.data && fallbackRes.data.length > 0) {
      data = fallbackRes.data;
    }
  }

  log(`📅 Recuperados ${data?.length || 0} registros de horario para grupo: ${group}`, 'INFO');

  return (data || []).map(row => ({
    id: row.id,
    group: group.trim(),
    shift: row.shift,
    timeRange: row.time_range || row.timeRange || '',
    day: row.day,
    subject: row.subject,
    schoolId: row.school_id
  }));
}

/**
 * Recupera los grupos oficiales de una escuela específica (Desde tabla school_groups).
 */
export async function getGroupsBySchool(schoolId) {
  if (!schoolId) throw new Error('ID de escuela obligatorio');
  const db = supabaseAdmin || supabase;

  const { data, error } = await db
    .from('school_groups')
    .select('id, name')
    .eq('school_id', schoolId)
    .order('name');

  if (error) throw new Error(`Error al listar grupos: ${error.message}`);
  return data || [];
}

/**
 * Obtiene la totalidad de los horarios registrados (Uso administrativo).
 */
export async function getAllSchedules() {
  const db = supabaseAdmin || supabase;
  const { data, error } = await db.from('schedules').select('*');
  if (error) throw new Error(`Fallo al recuperar todos los horarios: ${error.message}`);
  return (data || []).map(row => ({
    id: row.id,
    group: row.group_name || row.group || '',
    shift: row.shift,
    timeRange: row.time_range || row.timeRange || '',
    day: row.day,
    subject: row.subject,
    schoolId: row.school_id
  }));
}

// ==================== MANTENIMIENTO ====================

/**
 * Inserta o actualiza una entrada de horario (Atomic Upsert).
 */
export async function upsertSchedule(scheduleData, adminId) {
  const { group, shift, timeRange, day, subject, schoolId } = scheduleData;
  if (!group || shift === undefined || !day || !subject || !schoolId) {
    throw new Error('Campos obligatorios faltantes para el horario');
  }

  const db = supabaseAdmin || supabase;

  let groupId = null;
  const { data: groupRow } = await db
    .from('school_groups')
    .select('id')
    .eq('name', group.trim())
    .eq('school_id', schoolId)
    .maybeSingle();

  if (groupRow) groupId = groupRow.id;

  const entry = {
    group_id: groupId,
    shift,
    time_range: timeRange || '',
    day,
    subject,
    school_id: schoolId
  };

  let result;
  const existing = await db
    .from('schedules')
    .select('id')
    .eq('group_id', groupId)
    .eq('shift', shift)
    .eq('day', day)
    .eq('school_id', schoolId)
    .maybeSingle();

  if (existing.data) {
    const { data, error } = await db
      .from('schedules')
      .update(entry)
      .eq('id', existing.data.id)
      .select('id')
      .single();
    if (error) throw new Error('Fallo al actualizar entrada de horario');
    result = data;
  } else {
    const { data, error } = await db
      .from('schedules')
      .insert(entry)
      .select('id')
      .single();
    if (error) throw new Error('Fallo al insertar nueva entrada de horario');
    result = data;
  }
  return { success: true, id: result.id };
}
