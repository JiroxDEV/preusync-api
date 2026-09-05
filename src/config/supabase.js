/**
 * ============================================================================
 * Proyecto: PreuSync API
 * Archivo: supabase.js
 * Versión: v1.0.0
 * Descripción: Configuración y cliente de Supabase. Gestiona la conexión
 *              pública y administrativa (service role), además de utilidades
 *              de diagnóstico de red y base de datos.
 * Autor: JiroxDEV
 * Licensed under the GNU Affero General Public License v3
 * Licensed under the GNU Affero General Public License v3
 * ============================================================================
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import dns from 'node:dns/promises';

// Carga de variables de entorno para obtener las claves de Supabase.
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Sistema de logs específico para el módulo de Supabase.
const log = (message, level = 'INFO') => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [Supabase] [${level}] ${message}`);
};

// Validación crítica de variables obligatorias antes de iniciar el cliente.
if (!supabaseUrl) {
  log('❌ SUPABASE_URL no definida en .env', 'ERROR');
  throw new Error('SUPABASE_URL faltante');
}

if (!supabaseAnonKey) {
  log('❌ SUPABASE_ANON_KEY no definida en .env', 'ERROR');
  throw new Error('SUPABASE_ANON_KEY faltante');
}

try {
  new URL(supabaseUrl);
} catch (error) {
  log(`❌ SUPABASE_URL inválida: ${supabaseUrl}`, 'ERROR');
  throw new Error(`SUPABASE_URL no válida: ${supabaseUrl}`);
}

log(`🔑 Inicializando cliente Supabase para: ${supabaseUrl}`, 'INFO');

/**
 * Cliente público (Anon): Sujeto a políticas de RLS.
 * Se usa para peticiones generales desde la App.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  },
  db: {
    schema: 'public'
  }
});

log('✅ Cliente público (anon) creado con éxito', 'INFO');

/**
 * Cliente administrativo (Admin): Bypass de RLS mediante service_role key.
 * Se usa exclusivamente para operaciones del servidor que requieren privilegios elevados
 * (ej. creación de reportes, gestión de perfiles).
 */
export const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      db: {
        schema: 'public'
      }
    })
  : null;

if (supabaseAdmin) {
  log('✅ Cliente administrativo (admin) creado con éxito', 'INFO');
} else {
  log('⚠️ Cliente administrativo no disponible (Falta SUPABASE_SERVICE_ROLE_KEY)', 'WARN');
}

/**
 * Realiza una prueba de resolución DNS para descartar problemas de conectividad en Render.
 */
export async function testDnsResolution() {
  const hosts = ['google.com', 'github.com'];
  const supabaseHost = new URL(supabaseUrl).hostname;
  hosts.push(supabaseHost);

  log(`🔍 Iniciando diagnóstico diferencial de DNS...`, 'INFO');

  for (const host of hosts) {
    try {
      const result = await dns.lookup(host, { family: 4 });
      log(`✅ Resuelto ${host} -> ${result.address}`, 'INFO');
    } catch (error) {
      log(`❌ Error al resolver ${host}: ${error.message}`, 'ERROR');
    }
  }
}

/**
 * Verifica la conexión real con Supabase consultando la tabla de versiones.
 */
export async function testSupabaseConnection() {
  try {
    log('🔍 Probando conexión con Supabase...', 'INFO');
    const { data, error } = await supabase
      .from('app_versions')
      .select('version_code')
      .limit(1);
    if (error) {
      log(`❌ Prueba de conexión fallida: ${error.message}`, 'ERROR');
      return { success: false, error: error.message };
    }
    log(`✅ Conexión establecida. Registros encontrados: ${data ? data.length : 0}`, 'INFO');
    return { success: true, data };
  } catch (error) {
    log(`❌ Excepción en prueba de conexión: ${error.message}`, 'ERROR');
    return { success: false, error: error.message };
  }
}

/**
 * Comprueba la integridad y existencia de todas las tablas core del proyecto.
 */
export async function diagnoseTables() {
  const tables = ['profiles', 'posts', 'news', 'events', 'schedules', 'ephemerides', 'bug_reports', 'votes'];
  const results = {};
  log('🔍 Iniciando diagnóstico de integridad de tablas...', 'INFO');
  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table).select('*').limit(1);
      if (error) {
        results[table] = { exists: false, error: error.message };
        log(`❌ La tabla "${table}" no existe o es inaccesible: ${error.message}`, 'ERROR');
      } else {
        results[table] = { exists: true, hasData: data && data.length > 0 };
        log(`✅ Tabla "${table}" verificada${data && data.length > 0 ? ' (con datos)' : ' (vacía)'}`, 'INFO');
      }
    } catch (error) {
      results[table] = { exists: false, error: error.message };
      log(`❌ Error al comprobar tabla "${table}": ${error.message}`, 'ERROR');
    }
  }
  return results;
}

export const SUPABASE_URL = supabaseUrl;

log('✅ Configuración de Supabase cargada correctamente', 'INFO');


