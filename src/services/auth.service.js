/**
 * ============================================================================
 * Proyecto: PreuSync API
 * Archivo: auth.service.js
 * Versión: v1.2.0
 * Descripción: Servicio de autenticación y gestión de usuarios. Incluye lógica
 *              de auto-recuperación para usuarios huérfanos en Supabase Auth.
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
 * Soporta auto-recuperación de perfiles para usuarios existentes en Auth sin fila en DB.
 */
export async function signUp(username, password, userData) {
  log(`🔐 Iniciando proceso de registro para: ${username}`);

  // Validación de unicidad de nombre de usuario en perfiles existentes.
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

  const email = `${username}@preusync.com`.toLowerCase();
  let authData;

  // Intento de creación en Supabase Auth
  const { data: signUpData, error: authError } = await supabase.auth.signUp({ email, password });

  if (authError) {
    const errText = authError.message ? authError.message.toLowerCase() : '';
    if (errText.includes('already registered') || errText.includes('already exists')) {
      log(`⚠️ El usuario ${username} ya existe en Auth. Probando autenticación para auto-recuperación de perfil...`, 'WARN');
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        logError(`❌ Contraseña incorrecta para usuario existente en Auth: ${username}`, signInError);
        throw new Error('El nombre de usuario ya está registrado');
      }
      authData = signInData;
    } else {
      logError(`❌ Fallo en registro de autenticación para ${email}`, authError);
      throw new Error(authError.message);
    }
  } else {
    authData = signUpData;
  }

  if (!supabaseAdmin) {
    log('❌ supabaseAdmin no disponible. Verifique SUPABASE_SERVICE_ROLE_KEY', 'ERROR');
    throw new Error('Error de configuración en el servidor');
  }

  // Construcción del objeto de perfil utilizando nombres de columna exactos de Supabase.
  const profile = {
    id: authData.user.id,
    username: username.trim(),
    first_name: userData.firstName || '',
    last_name: userData.lastName || '',
    full_name: ((userData.firstName || '').trim() + ' ' + (userData.lastName || '').trim()).trim(),
    id_card: userData.idCard || '',
    role: userData.role || 'student',
    status: 'verified',
    avatar_url: userData.avatar || '',
    school_id: userData.schoolId || null,
    group_id: userData.groupId || null,
    tutee: userData.tutee || '',
    responsibilities: userData.responsibilities || ''
  };

  log(`💾 Insertando/Restaurando perfil para ${username}`, 'INFO', { profile });

  // Inserción del perfil mediante cliente Admin para ignorar políticas de RLS restrictivas.
  const { error: insertError } = await supabaseAdmin.from('profiles').upsert(profile);
  if (insertError) {
    logError(`❌ Error al crear perfil para el usuario: ${authData.user.id}`, insertError);
    throw new Error(`Fallo en la creación del perfil: ${insertError.message}`);
  }

  log(`✅ Usuario ${username} registrado y configurado exitosamente (ID: ${authData.user.id})`, 'INFO');
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

  const email = `${username}@preusync.com`.toLowerCase();

  // 1. Validación de credenciales con Supabase Auth
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    logError(`❌ Fallo en el login para ${username}`, error);
    throw new Error('Credenciales inválidas');
  }

  // 2. Búsqueda del perfil en la base de datos
  let { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*, schools(name)')
    .ilike('username', username)
    .maybeSingle();

  // Auto-recuperación si el perfil no existía en la DB
  if (!profile) {
    log(`⚠️ Perfil faltante para usuario autenticado ${username}. Creando perfil por defecto...`, 'WARN');
    const fallbackProfile = {
      id: data.user.id,
      username: username.trim(),
      full_name: username.trim(),
      role: 'student',
      status: 'verified'
    };
    if (supabaseAdmin) {
      await supabaseAdmin.from('profiles').upsert(fallbackProfile);
      profile = fallbackProfile;
    } else {
      throw new Error('Usuario no encontrado');
    }
  }

  // Bloqueo de acceso para usuarios baneados.
  if (profile.status === 'banned') {
    log(`⛔ Usuario ${username} está baneado`, 'WARN');
    throw new Error('Esta cuenta ha sido suspendida');
  }

  // Mapeo para compatibilidad con el frontend.
  if (profile.schools) {
    profile.school = profile.schools.name;
    delete profile.schools;
  }

  log(`✅ Usuario ${username} ha iniciado sesión exitosamente (ID: ${data.user.id})`, 'INFO');
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
    .select('username, first_name, last_name, full_name, avatar_url, role, school_id, group_id, status, schools(name)')
    .ilike('username', username)
    .maybeSingle();

  if (error || !data) {
    logError(`❌ Usuario no encontrado: ${username}`, error || new Error('No existe el perfil'));
    throw new Error('Usuario no encontrado');
  }

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

  const allowedFields = ['first_name', 'last_name', 'full_name', 'id_card', 'role', 'school_id', 'group_id', 'tutee', 'responsibilities', 'avatar_url', 'status'];
  const updated = { ...existing };
  allowedFields.forEach(f => { if (updateData[f] !== undefined) updated[f] = updateData[f]; });

  if (updateData.username && updateData.username !== existing.username) {
    const { data: conflict } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .ilike('username', updateData.username)
      .maybeSingle();
    if (conflict) throw new Error('El nombre de usuario ya está en uso');
    updated.username = updateData.username;
  }

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
 * Verifica si un nombre de usuario existe en la plataforma.
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

  const { valid } = await verifyPassword(profile.username, password);
  if (!valid) throw new Error('Contraseña incorrecta');

  const { error: delProfile } = await supabaseAdmin
    .from('profiles')
    .delete()
    .eq('id', userId);

  if (delProfile) {
    logError(`❌ Error al eliminar perfil: ${userId}`, delProfile);
    throw new Error('Fallo al eliminar datos del perfil');
  }

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
