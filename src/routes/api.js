/**
 * ============================================================================
 * Proyecto: PreuSync API
 * Archivo: api.js
 * Versión: v1.0.0
 * Descripción: Definición de todas las rutas (endpoints) de la API REST.
 *              Organiza el acceso a servicios de autenticación, comunidad,
 *              noticias, eventos, horarios y reportes.
 * Autor: JiroxDEV
 * Licensed under the GNU Affero General Public License v3
 * Licensed under the GNU Affero General Public License v3
 * Licensed under the GNU Affero General Public License v3
 * ============================================================================
 */

import express from 'express';
import * as authService from '../services/auth.service.js';
import * as postService from '../services/post.service.js';
import * as voteService from '../services/vote.service.js';
import * as newsService from '../services/news.service.js';
import * as eventService from '../services/event.service.js';
import * as scheduleService from '../services/schedule.service.js';
import * as ephemerisService from '../services/ephemeris.service.js';
import * as reportsService from '../services/reports.service.js';
import { authenticate, optionalAuthenticate } from '../middleware/auth.js';
import { supabase, supabaseAdmin } from '../config/supabase.js';

const router = express.Router();

// Logger local para el enrutador.
const log = (message, level = 'INFO', metadata = {}) => {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(metadata).length ? ` | ${JSON.stringify(metadata)}` : '';
  console.log(`[${timestamp}] [API] [${level}] ${message}${metaStr}`);
};

const logError = (message, error, metadata = {}) => {
  log(`${message}: ${error.message}`, 'ERROR', { ...metadata, stack: error.stack });
};

// ============================================================================
// 1. COMPROBACIÓN DE SALUD (HEALTH)
// ============================================================================

/**
 * Endpoint básico para verificar que la API responde.
 */
router.get('/ping', (req, res) => {
  res.json({ message: 'pong', timestamp: new Date().toISOString() });
});

// ============================================================================
// 2. GESTIÓN DE VERSIONES
// ============================================================================

/**
 * Obtiene la última versión disponible para comprobación de actualizaciones en la App.
 * Soporta autenticación opcional.
 */
router.get('/version/latest', optionalAuthenticate, async (req, res) => {
  try {
    const { data: latestData, error: latestError } = await supabaseAdmin
      .from('app_versions')
      .select('version_code, version_name, details')
      .order('version_code', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestError) throw latestError;
    if (!latestData) {
      return res.status(404).json({ success: false, error: 'No se encontraron datos de versión' });
    }
    res.json({ success: true, data: latestData });
  } catch (error) {
    logError('❌ Error inesperado en /version/latest', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 3. RUTAS DE AUTENTICACIÓN Y CUENTA
// ============================================================================

/**
 * Registra un nuevo usuario y crea su perfil inicial.
 */
router.post('/auth/signup', async (req, res) => {
  const { username, password, firstName, lastName, ...userData } = req.body;
  try {
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Usuario y contraseña son obligatorios' });
    }
    userData.firstName = firstName || '';
    userData.lastName = lastName || '';
    const result = await authService.signUp(username, password, userData);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    logError(`❌ Fallo en el registro: ${username}`, error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Valida credenciales y retorna sesión JWT.
 */
router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Credenciales obligatorias' });
    }
    const result = await authService.login(username, password);
    res.json({ success: true, data: result });
  } catch (error) {
    logError(`❌ Error de acceso: ${username}`, error);
    res.status(401).json({ success: false, error: error.message });
  }
});

/**
 * Renueva el token de acceso mediante el refresh token.
 */
router.post('/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  try {
    const result = await authService.refreshSession(refreshToken);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(401).json({ success: false, error: error.message });
  }
});

/**
 * Finaliza la sesión actual (invocación formal).
 */
router.post('/auth/logout', authenticate, async (req, res) => {
  try {
    await authService.logout(req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Obtiene el perfil privado completo del usuario autenticado.
 */
router.get('/auth/me', authenticate, async (req, res) => {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error) throw new Error('Perfil no encontrado');
    res.json({ success: true, user: req.user, profile });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Actualiza los campos permitidos del perfil.
 */
router.put('/auth/me', authenticate, async (req, res) => {
  try {
    const result = await authService.updateUser(req.user.id, req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Verifica la contraseña (bloqueo de seguridad para edición sensible).
 */
router.post('/auth/verify-password', authenticate, async (req, res) => {
  const { password } = req.body;
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', req.user.id)
      .single();
    if (!profile) throw new Error('Perfil no encontrado');
    const result = await authService.verifyPassword(profile.username, password);
    res.json({ success: true, valid: result.valid });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Elimina permanentemente la cuenta.
 */
router.delete('/auth/me', authenticate, async (req, res) => {
  const { password } = req.body;
  try {
    if (!password) throw new Error('Contraseña obligatoria para eliminar la cuenta');
    await authService.deleteAccount(req.user.id, password);
    res.json({ success: true, message: 'Cuenta eliminada con éxito' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Busca un perfil público de usuario.
 */
router.get('/auth/user/:username', async (req, res) => {
  const { username } = req.params;
  try {
    const data = await authService.getUserByUsername(username);
    res.json({ success: true, data });
  } catch (error) {
    res.status(404).json({ success: false, error: error.message });
  }
});

/**
 * Verifica si un usuario existe (Sin devolver datos privados).
 */
router.get('/auth/exists/:username', async (req, res) => {
  try {
    const result = await authService.checkUsernameExists(req.params.username);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 4. RUTAS DE PUBLICACIONES (POSTS)
// ============================================================================

/**
 * Crea una nueva publicación de la comunidad.
 */
router.post('/posts', authenticate, async (req, res) => {
  try {
    const result = await postService.addPost(req.body, req.user.id);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/posts/:id', authenticate, async (req, res) => {
  try {
    const result = await postService.editPost(req.params.id, req.user.id, req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Obtiene las publicaciones más destacadas (score más alto).
 */
router.get('/posts/top', async (req, res) => {
  const limit = parseInt(req.query.limit) || 5;
  const userId = req.user?.id;
  try {
    const posts = await postService.getTopPosts(limit, userId);
    res.json({ success: true, data: posts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Obtiene un rango de posts para scroll infinito.
 */
router.get('/posts/range', async (req, res) => {
  const start = parseInt(req.query.start) || 0;
  const count = parseInt(req.query.count) || 10;
  const userId = req.user?.id;
  try {
    const posts = await postService.getPostsRange(start, count, userId);
    res.json({ success: true, data: posts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/posts/:id', authenticate, async (req, res) => {
  try {
    await postService.deletePost(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Reporta un post por contenido inadecuado.
 */
router.post('/posts/:id/report', authenticate, async (req, res) => {
  const { reason } = req.body;
  try {
    await postService.reportPost(req.params.id, req.user.id, reason || '');
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/posts/:id', async (req, res) => {
  try {
    const post = await postService.getPostById(req.params.id);
    res.json({ success: true, data: post });
  } catch (error) {
    res.status(404).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 5. RUTAS DE VOTOS (INTERACCIÓN)
// ============================================================================

/**
 * Registra un voto (like/dislike/none) en una publicación.
 */
router.post('/posts/:id/vote', authenticate, async (req, res) => {
  const { voteType } = req.body;
  try {
    const result = await voteService.setVote(req.params.id, req.user.id, voteType);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 6. RUTAS DE NOTICIAS
// ============================================================================

router.post('/news', authenticate, async (req, res) => {
  try {
    const result = await newsService.addNews(req.body, req.user.id);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/news/:id', authenticate, async (req, res) => {
  try {
    const result = await newsService.editNews(req.params.id, req.user.id, req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/news/top', async (req, res) => {
  const limit = parseInt(req.query.limit) || 5;
  try {
    const news = await newsService.getTopNews(limit);
    res.json({ success: true, data: news });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/news/range', async (req, res) => {
  const start = parseInt(req.query.start) || 0;
  const count = parseInt(req.query.count) || 10;
  try {
    const news = await newsService.getNewsRange(start, count);
    res.json({ success: true, data: news });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/news/:id', async (req, res) => {
  try {
    const news = await newsService.getNewsById(req.params.id);
    res.json({ success: true, data: news });
  } catch (error) {
    res.status(404).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 7. RUTAS DE EVENTOS
// ============================================================================

router.post('/events', authenticate, async (req, res) => {
  try {
    const result = await eventService.addEvent(req.body, req.user.id);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/events/:id', authenticate, async (req, res) => {
  try {
    const result = await eventService.editEvent(req.params.id, req.user.id, req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.delete('/events/:id', authenticate, async (req, res) => {
  try {
    await eventService.deleteEvent(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/events/school', async (req, res) => {
  const start = parseInt(req.query.start) || 0;
  const count = parseInt(req.query.count) || 10;
  const { schoolId } = req.query;
  try {
    const events = await eventService.getEventsRange('school', start, count, schoolId);
    res.json({ success: true, data: events });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/events/external', async (req, res) => {
  const start = parseInt(req.query.start) || 0;
  const count = parseInt(req.query.count) || 10;
  const { schoolId } = req.query;
  try {
    const events = await eventService.getEventsRange('external', start, count, schoolId);
    res.json({ success: true, data: events });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 8. RUTAS DE HORARIO Y GRUPOS ESCOLARES
// ============================================================================

/**
 * Obtiene el horario de clases filtrado por grupo y escuela.
 */
router.get('/schedule', async (req, res) => {
  const { group, schoolId } = req.query;
  try {
    if (!group || !schoolId) {
      return res.status(400).json({ success: false, error: 'Se requiere grupo y escuela' });
    }
    const schedule = await scheduleService.getSchedule(group, schoolId);
    res.json({ success: true, data: schedule });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Obtiene la lista de todos los grupos registrados en una escuela.
 */
router.get('/groups', async (req, res) => {
  const { schoolId } = req.query;
  try {
    if (!schoolId) {
      return res.status(400).json({ success: false, error: 'ID de escuela obligatorio' });
    }
    const groups = await scheduleService.getGroupsBySchool(schoolId);
    res.json({ success: true, data: groups });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== LOCALIZACIONES (NACIONAL) ====================

router.get('/schools/provinces', async (req, res) => {
  try {
    const data = await schoolService.getProvinces();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/schools/municipalities', async (req, res) => {
  const { provinceId } = req.query;
  try {
    const data = await schoolService.getMunicipalities(provinceId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/schools/institutions', async (req, res) => {
  const { municipalityId } = req.query;
  try {
    const data = await schoolService.getSchools(municipalityId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/schools/responsibilities', async (req, res) => {
  try {
    const data = await schoolService.getResponsibilities();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 9. RUTAS DE EFEMÉRIDES
// ============================================================================

router.post('/ephemeris', authenticate, async (req, res) => {
  try {
    const result = await ephemerisService.addEphemeris(req.body, req.user.id);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/ephemeris/:id', authenticate, async (req, res) => {
  try {
    const result = await ephemerisService.editEphemeris(req.params.id, req.user.id, req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.delete('/ephemeris/:id', authenticate, async (req, res) => {
  try {
    await ephemerisService.deleteEphemeris(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Consulta efemérides por fecha (DD/MM).
 */
router.get('/ephemeris', async (req, res) => {
  const { date, year } = req.query;
  try {
    const data = await ephemerisService.getEphemeridesByDate(date, year);
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 10. RUTAS DE PERFIL – PUBLICACIONES PERSONALES Y ESTADÍSTICAS
// ============================================================================

/**
 * Obtiene solo las publicaciones creadas por el usuario autenticado.
 */
router.get('/profile/posts', authenticate, async (req, res) => {
  const start = parseInt(req.query.start) || 0;
  const count = parseInt(req.query.count) || 10;
  try {
    const posts = await postService.getPostsByAuthor(req.user.id, start, count);
    res.json({ success: true, data: posts });
  } catch (error) {
    logError(`❌ Fallo al obtener posts personales: ${req.user.id}`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Obtiene contadores acumulados de posts y reacciones del usuario.
 */
router.get('/profile/stats', authenticate, async (req, res) => {
  try {
    const stats = await postService.getUserStats(req.user.id);
    res.json({ success: true, data: stats });
  } catch (error) {
    logError(`❌ Fallo al obtener estadísticas del perfil: ${req.user.id}`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 11. RUTAS DE REPORTES DE ERRORES (CRASHES)
// ============================================================================

/**
 * Recibe reportes técnicos de errores desde la aplicación Android.
 * Integrado con el sistema de incidencias de GitHub.
 */
router.post('/reports', optionalAuthenticate, async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const result = await reportsService.createReport(req.body, userId);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    logError('❌ Error en el receptor de reportes /reports', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.details || null,
      hint: error.hint || null
    });
  }
});

// ============================================================================
// EXPORTACIÓN DEL ENRUTADOR
// ============================================================================

export default router;


