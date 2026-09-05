/**
 * ============================================================================
 * Proyecto: PreuSync API
 * Archivo: auth.js
 * Versión: v1.0.0
 * Descripción: Middlewares de autenticación. Verifica la validez de los tokens
 *              JWT de Supabase y gestiona el acceso a rutas protegidas.
 * Autor: JiroxDEV
 * Licensed under the GNU Affero General Public License v3
 * Licensed under the GNU Affero General Public License v3
 * ============================================================================
 */

import { supabase } from '../config/supabase.js';

// Sistema de logs para el proceso de autenticación.
const log = (message, level = 'INFO', metadata = {}) => {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(metadata).length ? ` | ${JSON.stringify(metadata)}` : '';
  console.log(`[${timestamp}] [AuthMiddleware] [${level}] ${message}${metaStr}`);
};

const logError = (message, error, metadata = {}) => {
  log(`${message}: ${error.message}`, 'ERROR', { ...metadata, stack: error.stack });
};

/**
 * Middleware Obligatorio: Rechaza la petición si el token no es válido.
 */
export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    log('⚠️ No se proporcionó cabecera de autorización', 'WARN', { path: req.path });
    return res.status(401).json({ success: false, error: 'Token no proporcionado' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    log('⚠️ Formato de cabecera inválido', 'WARN', { path: req.path });
    return res.status(401).json({ success: false, error: 'Formato de token inválido (Use: Bearer <token>)' });
  }

  const token = parts[1];
  if (!token || token.length < 10) {
    return res.status(401).json({ success: false, error: 'Token inválido' });
  }

  if (!supabase) {
    log('❌ Cliente Supabase no disponible', 'ERROR');
    return res.status(500).json({ success: false, error: 'Servicio de autenticación no disponible' });
  }

  try {
    // Validación del token con el servidor de Supabase Auth.
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error) {
      logError('❌ Falló la validación del token', error);
      if (error.message.includes('expired')) {
        return res.status(401).json({ success: false, error: 'La sesión ha expirado' });
      }
      return res.status(401).json({ success: false, error: 'Autenticación fallida' });
    }

    if (!user) {
      return res.status(401).json({ success: false, error: 'Usuario no encontrado' });
    }

    // Comprobación adicional: Verificar si el usuario está baneado en la tabla de perfiles.
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('status')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.status === 'banned') {
        log('⛔ Intento de acceso de usuario baneado', 'WARN', { userId: user.id });
        return res.status(403).json({ success: false, error: 'Esta cuenta ha sido suspendida' });
      }
    } catch (profileCheckError) {
      log('⚠️ Error al comprobar estado del perfil', 'WARN');
    }

    // Inyectamos el objeto de usuario en la petición para uso en los controladores.
    req.user = {
      id: user.id,
      email: user.email,
      ...user
    };

    log('✅ Autenticación exitosa', 'INFO', { userId: user.id, path: req.path });
    next();
  } catch (error) {
    logError('❌ Error inesperado en middleware auth', error);
    return res.status(500).json({ success: false, error: 'Error interno de autenticación' });
  }
}

/**
 * Middleware Opcional: Identifica al usuario si el token es válido,
 * pero permite continuar si no hay token o es inválido.
 */
export async function optionalAuthenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    req.user = null;
    return next();
  }

  try {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      const { data: { user } } = await supabase.auth.getUser(parts[1]);
      if (user) {
        req.user = { id: user.id, email: user.email, ...user };
      }
    }
  } catch (error) {
    req.user = null;
  }
  next();
}

export default {
  authenticate,
  optionalAuthenticate
};


