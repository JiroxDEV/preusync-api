/**
 * ============================================================================
 * Proyecto: PreuSync API
 * Archivo: schedule.service.js
 * Versión: v2.1.0
 * Descripción: Servicio de gestión de horarios. Implementa Multi-Tenancy
 *              para filtrar horarios por institución educativa.
 * Autor: JiroxDEV
 * Licensed under the GNU Affero General Public License v3
 * ============================================================================
 */

import { supabase } from '../config/supabase.js';

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
 * Obtiene el horario completo de un grupo específico en una escuela.
 */
export async function getSchedule(group, schoolId) {
  if (!group || !group.trim() || !schoolId) {
    log('❌ Datos insuficientes para consultar horario (Grupo o SchoolId faltante)', 'WARN');
    throw new Error('Grupo y Escuela obligatorios');
  }

  const { data, error } = await supabase
    .from('schedules')
    .select('*')
    .eq('group', group.trim())
    .eq('school_id', schoolId);

  if (error) {
    logError(`❌ Fallo al obtener horario del grupo: ${group} en escuela: ${schoolId}`, error);
    throw new Error(`Error al recuperar horario: ${error.message}`);
  }

  return data.map(row => ({
    id: row.id,
    group: row.group,
    shift: row.shift,
    day: row.day,
    subject: row.subject,
    scheduleType: row.schedule_type,
    schoolId: row.school_id
  }));
}

/**
 * Recupera los grupos únicos de una escuela específica.
 */
export async function getGroupsBySchool(schoolId) {
  if (!schoolId) throw new Error('ID de escuela obligatorio');

  const { data, error } = await supabase
    .from('schedules')
    .select('group')
    .eq('school_id', schoolId)
    .order('group');

  if (error) throw new Error(`Error al listar grupos: ${error.message}`);

  const groupsSet = new Set();
  data.forEach(row => { if (row.group) groupsSet.add(row.group.trim()); });
  return Array.from(groupsSet).sort();
}

/**
 * Obtiene la totalidad de los horarios registrados (Uso administrativo).
 */
export async function getAllSchedules() {
  const { data, error } = await supabase.from('schedules').select('*');
  if (error) throw new Error(`Fallo al recuperar todos los horarios: ${error.message}`);
  return data.map(row => ({
    id: row.id,
    group: row.group,
    shift: row.shift,
    day: row.day,
    subject: row.subject,
    scheduleType: row.schedule_type,
    schoolId: row.school_id
  }));
}

// ==================== MANTENIMIENTO ====================

/**
 * Inserta o actualiza una entrada de horario (Atomic Upsert).
 */
export async function upsertSchedule(scheduleData, adminId) {
  const { group, shift, day, subject, scheduleType, schoolId } = scheduleData;
  if (!group || shift === undefined || !day || !subject || !schoolId) {
    throw new Error('Campos obligatorios faltantes para el horario');
  }

  const existing = await supabase
    .from('schedules')
    .select('id')
    .eq('group', group)
    .eq('shift', shift)
    .eq('day', day)
    .eq('school_id', schoolId)
    .maybeSingle();

  const entry = {
    group,
    shift,
    day,
    subject,
    schedule_type: scheduleType || 'Normal',
    school_id: schoolId
  };

  let result;
  if (existing.data) {
    const { data, error } = await supabase
      .from('schedules')
      .update(entry)
      .eq('id', existing.data.id)
      .select('id')
      .single();
    if (error) throw new Error('Fallo al actualizar entrada de horario');
    result = data;
  } else {
    const { data, error } = await supabase
      .from('schedules')
      .insert(entry)
      .select('id')
      .single();
    if (error) throw new Error('Fallo al insertar nueva entrada de horario');
    result = data;
  }
  return { success: true, id: result.id };
}
