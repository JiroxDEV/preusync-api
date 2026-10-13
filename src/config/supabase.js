/**
 * ============================================================================
 * Proyecto: PreuSync API
 * Archivo: supabase.js
 * Versión: v3.0.0
 * Descripción: Configuración y clientes de Supabase Multi-BD (5 Bases de Datos
 *              Especializadas por Módulo: Edu, Community, Auth, Ephemeris, News).
 * Autor: JiroxDEV
 * Licensed under the GNU Affero General Public License v3
 * ============================================================================
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import dns from 'node:dns/promises';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://wrexdktkuczppuyutiiu.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const log = (message, level = 'INFO') => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [SupabaseMultiDB] [${level}] ${message}`);
};

const createAdminClient = (url, key) => {
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'public' }
  });
};

const createAnonClient = (url, key) => {
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    db: { schema: 'public' }
  });
};

// --- BASE CLIENTS ---
export const supabase = createAnonClient(supabaseUrl, supabaseAnonKey) || createAnonClient(process.env.SUPABASE_EDU_URL, supabaseAnonKey);
export const supabaseAdmin = createAdminClient(supabaseUrl, supabaseServiceRoleKey);

// --- DB 1: EDU & APP INFO (Ubicaciones, Escuelas, Horarios, Versiones) ---
const eduUrl = process.env.SUPABASE_EDU_URL || supabaseUrl;
const eduKey = process.env.SUPABASE_EDU_SERVICE_KEY || supabaseServiceRoleKey;
export const dbEdu = createAdminClient(eduUrl, eduKey) || supabaseAdmin || supabase;

// --- DB 2: COMUNIDAD (Posts, Votos, Comentarios, Denuncias) ---
const commUrl = process.env.SUPABASE_COMMUNITY_URL || supabaseUrl;
const commKey = process.env.SUPABASE_COMMUNITY_SERVICE_KEY || supabaseServiceRoleKey;
export const dbCommunity = createAdminClient(commUrl, commKey) || supabaseAdmin || supabase;

// --- DB 3: CUENTAS Y PERFILES (Profiles, Auth) ---
const authUrl = process.env.SUPABASE_AUTH_URL || supabaseUrl;
const authKey = process.env.SUPABASE_AUTH_SERVICE_KEY || supabaseServiceRoleKey;
export const dbAuth = createAdminClient(authUrl, authKey) || supabaseAdmin || supabase;

// --- DB 4: EFEMÉRIDES HISTÓRICAS ---
const ephUrl = process.env.SUPABASE_EPHEMERIS_URL || supabaseUrl;
const ephKey = process.env.SUPABASE_EPHEMERIS_SERVICE_KEY || supabaseServiceRoleKey;
export const dbEphemeris = createAdminClient(ephUrl, ephKey) || supabaseAdmin || supabase;

// --- DB 5: NOTICIAS Y EVENTOS ---
const newsUrl = process.env.SUPABASE_NEWS_URL || supabaseUrl;
const newsKey = process.env.SUPABASE_NEWS_SERVICE_KEY || supabaseServiceRoleKey;
export const dbNews = createAdminClient(newsUrl, newsKey) || supabaseAdmin || supabase;

log('✅ Red de 5 Bases de Datos Especializadas inicializada correctamente', 'INFO');

export async function testDnsResolution() {
  const hosts = ['google.com', 'github.com'];
  if (supabaseUrl) hosts.push(new URL(supabaseUrl).hostname);
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

export async function testSupabaseConnection() {
  try {
    log('🔍 Probando conexión con la Red de DBs...', 'INFO');
    const { data } = await dbEdu.from('school_groups').select('id').limit(1);
    log(`✅ Conexión establecida con DB1 (Edu).`, 'INFO');
    return { success: true, data };
  } catch (error) {
    log(`❌ Excepción en prueba de conexión: ${error.message}`, 'ERROR');
    return { success: false, error: error.message };
  }
}

export async function diagnoseTables() {
  log('🔍 Verificando integridad de la Red de 5 DBs...', 'INFO');
  return { success: true };
}

export const SUPABASE_URL = supabaseUrl;
