/**
 * ============================================================================
 * Proyecto: PreuSync API
 * Archivo: auth.service.js
 * Versión: v1.0.0
 * Descripción: Servicio de autenticación y gestión de usuarios. Maneja el
 *              registro, login, perfiles públicos, actualización de datos
 *              y renovación de sesiones (refresh tokens).
 * Autor: JiroxDEV
 * Licensed under the GNU Affero General Public License v3
 * ============================================================================
 */

import { supabase, supabaseAdmin } from '../config/supabase.js';

// Sistema de logs interno para trazabilidad de autenticación.
const log = (message, level = 'INFO', metadata = {}) => {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(metadata).length ? ` | ${JSON.stringify(metadata)}` : '';
  console.log(`[${timestamp}] [AuthService] [${level}] ${message}${metaStr}`);
};

const logError = (message, error, metadata = {}) => {
  log(`${message}: ${error.message}`, 'ERROR', { ...metadata, stack: error.stack });
};

// ==================== REGISTRO (SIGNUP) ====================

/**
 * Registra un nuevo usuario creando la cuenta en Auth y su perfil en la DB.
 */
export async function signUp(username, password, userData) {
  log(`🔐 Iniciando proceso de registro para: ${username}`);

  // Validación de unicidad de nombre de usuario (ignora mayúsculas/minúsculas).
  const { data: existingUser } = await supabase
    .from('profiles')
    .select('username')
    .ilike('username', username)
    .maybeSingle();
  if (existingUser) throw new Error('El nombre de usuario ya está en uso');

  // Validación de unicidad de Cédula de Identidad si se proporciona.
  if (userData.idCard) {
    const { data: existingId } = await supabase
      .from('profiles')
      .select('id_card')
      .eq('id_card', userData.idCard)
      .maybeSingle();
    if (existingId) throw new Error('El número de carnet ya está registrado');
  }

  // Creación del usuario en el sistema de autenticación de Supabase (email ficticio interno).
  const email = `${username}@preusync.com`.toLowerCase();
  const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
  if (authError) {
    logError(`❌ Fallo en registro de autenticación para ${email}`, authError);
    throw new Error(authError.message);
  }

  if (!supabaseAdmin) {
    log('❌ supabaseAdmin no disponible. Verifique SUPABASE_SERVICE_ROLE_KEY', 'ERROR');
    throw new Error('Error de configuración en el servidor');
  }

  // Construcción del objeto de perfil con nombres y apellidos segmentados.
  const profile = {
    id: authData.user.id,
    username: username.trim(),
    first_name: userData.firstName || '',
    last_name: userData.lastName || '',
    full_name: (userData.firstName || '') + ' ' + (userData.lastName || ''),
    id_card: userData.idCard || '',
    role: userData.role || 'student',
    status: 'verified',
    avatar_url: '',
    school_id: userData.schoolId || null,
    group_id: userData.groupId || null,
    group: userData.groupName || '', // Para compatibilidad visual rápida
    tutee: userData.tutee || '',
    responsibilities: userData.responsibilities || ''
  };

  // Inserción del perfil mediante cliente Admin para ignorar políticas de RLS restrictivas.
  const { error: insertError } = await supabaseAdmin.from('profiles').insert(profile);
  if (insertError) {
    logError(`❌ Error al crear perfil para el usuario: ${authData.user.id}`, insertError);
    // Rollback: Si falla la creación del perfil, eliminamos el usuario de Auth para evitar inconsistencias.
    try {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      log(`🗑️ Usuario de autenticación ${authData.user.id} eliminado por fallo en perfil`, 'INFO');
    } catch (cleanupError) {
      logError('⚠️ No se pudo limpiar el usuario de autenticación', cleanupError);
    }
    throw new Error(`Fallo en la creación del perfil: ${insertError.message}`);
  }

  log(`✅ Usuario ${username} creado exitosamente (ID: ${authData.user.id})`, 'INFO');
  return {
    user: authData.user,
    profile,
    sessionToken: authData.session?.access_token || null
  };
}

// ==================== INICIO DE SESIÓN (LOGIN) ====================

/**
 * Autentica al usuario y retorna tokens de acceso y renovación.
 */
export async function login(username, password) {
  log(`🔐 Intento de inicio de sesión: ${username}`);

  // Primero verificamos que el perfil exista y no esté bloqueado.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*, schools(name)')
    .ilike('username', username)
    .maybeSingle();

  if (profileError) {
    logError(`❌ Error de DB al buscar usuario: ${username}`, profileError);
    throw new Error('Error de base de datos');
  }
  if (!profile) throw new Error('Usuario no encontrado');

  // Mapeo para compatibilidad con el frontend (nombre de la escuela).
  if (profile.schools) {
    profile.school = profile.schools.name;
    delete profile.schools;
  }

  // Bloqueo de acceso para usuarios baneados.
  if (profile.status === 'banned') {
    log(`⛔ Usuario ${username} está baneado`, 'WARN');
    throw new Error(`Esta cuenta ha sido suspendida`);
  }

  const email = `${username}@preusync.com`.toLowerCase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    logError(`❌ Fallo en el login para ${username}`, error);
    throw new Error('Credenciales inválidas');
  }

  log(`✅ Usuario ${username} ha iniciado sesión (ID: ${data.user.id})`, 'INFO');
  return {
    user: data.user,
    profile,
    sessionToken: data.session.access_token,
    refreshToken: data.session.refresh_token
  };
}

// ==================== PERFILES PÚBLICOS ====================

/**
 * Obtiene la información pública de un usuario mediante su username.
 */
export async function getUserByUsername(username) {
  log(`👤 Obteniendo perfil público: ${username}`, 'INFO');

  const { data, error } = await supabase
    .from('profiles')
    .select('username, first_name, last_name, full_name, avatar_url, role, "group", status, schools(name)')
    .ilike('username', username)
    .maybeSingle();

  if (error || !data) {
    logError(`❌ Usuario no encontrado: ${username}`, error || new Error('No existe el perfil'));
    throw new Error('Usuario no encontrado');
  }

  // Mapeo para el frontend.
  if (data.schools) {
    data.school = data.schools.name;
    delete data.schools;
  }
  return data;
}

// ==================== ACTUALIZACIÓN DE DATOS ====================

/**
 * Actualiza campos específicos del perfil del usuario.
 */
export async function updateUser(userId, updateData) {
  log(`📝 Actualizando perfil del usuario: ${userId}`, 'INFO');

  if (!supabaseAdmin) throw new Error('Service role key no configurada');

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (fetchError) throw new Error('Perfil no encontrado');

  // Campos permitidos para actualización directa.
  const allowedFields = ['first_name', 'last_name', 'full_name', 'id_card', 'role', 'school_id', 'group', 'tutee', 'responsibilities', 'avatar_url', 'status'];
  const updated = { ...existing };
  allowedFields.forEach(f => { if (updateData[f] !== undefined) updated[f] = updateData[f]; });

  // Si se cambia el username, verificar que el nuevo no esté ocupado.
  if (updateData.username && updateData.username !== existing.username) {
    const { data: conflict } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .ilike('username', updateData.username)
      .maybeSingle();
    if (conflict) throw new Error('El nombre de usuario ya está en uso');
    updated.username = updateData.username;
  }

  // Sincronización automática de full_name si cambian nombres o apellidos.
  if (updateData.first_name !== undefined || updateData.last_name !== undefined) {
    updated.full_name = (updated.first_name || '') + ' ' + (updated.last_name || '');
  }

  const { error } = await supabaseAdmin
    .from('profiles')
    .update(updated)
    .eq('id', userId);

  if (error) {
    logError(`❌ Fallo al actualizar perfil: ${userId}`, error);
    throw new Error('Error al guardar los cambios');
  }

  log(`✅ Perfil actualizado para el usuario: ${userId}`, 'INFO');
  return { success: true, data: updated };
}

// ==================== GESTIÓN DE SESIONES ====================

/**
 * Renueva el token de acceso utilizando un token de refresco válido.
 */
export async function refreshSession(refreshToken) {
  log('🔄 Renovando sesión...');
  if (!refreshToken) throw new Error('Token de refresco obligatorio');

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error) {
    logError('❌ Fallo al renovar sesión', error);
    throw new Error('Sesión expirada o inválida');
  }

  log(`✅ Sesión renovada para el usuario: ${data.user.id}`, 'INFO');
  return {
    user: data.user,
    sessionToken: data.session.access_token,
    refreshToken: data.session.refresh_token
  };
}

/**
 * Cierra la sesión activa.
 */
export async function logout(userId) {
  log(`🔐 Logout registrado para: ${userId}`, 'INFO');
  // En Supabase client-side esto invalida localmente; aquí registramos la intención.
  return { success: true };
}

/**
 * Verifica si la contraseña es correcta (usado para cambios sensibles).
 */
export async function verifyPassword(username, password) {
  log(`🔑 Verificando contraseña para: ${username}`, 'INFO');
  const email = `${username}@preusync.com`.toLowerCase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    log(`❌ Verificación de contraseña fallida para ${username}`, 'WARN');
    return { valid: false };
  }
  log(`✅ Contraseña verificada para ${username}`, 'INFO');
  return { valid: true };
}

/**
 * Verifica si un nombre de usuario existe en la plataforma (Útil para Tutores).
 */
export async function checkUsernameExists(username) {
  log(`🔍 Verificando existencia de usuario: ${username}`);
  const { data, error } = await supabase
    .from('profiles')
    .select('username')
    .ilike('username', username)
    .maybeSingle();

  if (error) {
    logError(`❌ Error al verificar usuario: ${username}`, error);
    throw new Error('Error al verificar usuario');
  }
  return { exists: !!data };
}

// ==================== ELIMINACIÓN DE CUENTA ====================

/**
 * Elimina permanentemente la cuenta y el perfil del usuario.
 */
export async function deleteAccount(userId, password) {
  log(`🗑️ Solicitud de eliminación de cuenta para: ${userId}`, 'WARN');

  const { data: profile, error: fetchError } = await supabaseAdmin
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .single();

  if (fetchError || !profile) throw new Error('Perfil no encontrado');

  // Obligatorio verificar contraseña antes de una acción destructiva.
  const { valid } = await verifyPassword(profile.username, password);
  if (!valid) throw new Error('Contraseña incorrecta');

  // Eliminación del perfil en la DB.
  const { error: delProfile } = await supabaseAdmin
    .from('profiles')
    .delete()
    .eq('id', userId);

  if (delProfile) {
    logError(`❌ Error al eliminar perfil: ${userId}`, delProfile);
    throw new Error('Fallo al eliminar datos del perfil');
  }

  // Eliminación del usuario en el sistema de Auth.
  if (supabaseAdmin) {
    try {
      await supabaseAdmin.auth.admin.deleteUser(userId);
    } catch (err) {
      logError(`⚠️ No se pudo eliminar el usuario de autenticación ${userId}`, err);
    }
  }

  log(`✅ Cuenta eliminada exitosamente para: ${userId}`, 'INFO');
  return { success: true };
}


