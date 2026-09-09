/**
 * ============================================================================
 * Proyecto: PreuSync API
 * Archivo: school.service.js
 * Versión: v2.0.0
 * Descripción: Servicio de gestión de instituciones y ubicaciones geográficas.
 *              Soporta la jerarquía nacional: Provincias > Municipios > Escuelas.
 * Autor: JiroxDEV
 * Licensed under the GNU Affero General Public License v3
 * ============================================================================
 */

import { supabase } from '../config/supabase.js';

const log = (message, level = 'INFO') => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [SchoolService] [${level}] ${message}`);
};

/**
 * Obtiene el listado completo de provincias.
 */
export async function getProvinces() {
  log('Consultando todas las provincias');
  const { data, error } = await supabase
    .from('provinces')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  return data;
}

/**
 * Obtiene los municipios asociados a una provincia.
 */
export async function getMunicipalities(provinceId) {
  log(`Consultando municipios para la provincia: ${provinceId}`);
  const { data, error } = await supabase
    .from('municipalities')
    .select('*')
    .eq('province_id', provinceId)
    .order('name', { ascending: true });

  if (error) throw error;
  return data;
}

/**
 * Obtiene las instituciones educativas asociadas a un municipio.
 */
export async function getSchools(municipalityId) {
  log(`Consultando escuelas para el municipio: ${municipalityId}`);
  const { data, error } = await supabase
    .from('schools')
    .select('*')
    .eq('municipality_id', municipalityId)
    .order('name', { ascending: true });

  if (error) throw error;
  return data;
}

/**
 * Obtiene los grupos asociados a una escuela.
 */
export async function getGroups(schoolId) {
  log(`Consultando grupos para la escuela: ${schoolId}`);
  const { data, error } = await supabase
    .from('school_groups')
    .select('*')
    .eq('school_id', schoolId)
    .order('name', { ascending: true });

  if (error) throw error;
  return data;
}

/**
 * Obtiene el listado de responsabilidades disponibles para docentes.
 */
export async function getResponsibilities() {
  log('Consultando catálogo de responsabilidades');
  const { data, error } = await supabase
    .from('responsibilities')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  return data;
}

/**
 * Recupera la información de una escuela específica por su ID.
 */
export async function getSchoolById(schoolId) {
  const { data, error } = await supabase
    .from('schools')
    .select('*, municipalities(name, provinces(name))')
    .eq('id', schoolId)
    .single();

  if (error) throw error;
  return data;
}
