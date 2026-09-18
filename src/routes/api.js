/**
 * ============================================================================
 * Proyecto: PreuSync API
 * Archivo: api.js
 * Versión: v1.1.0
 * Descripción: Definición de todas las rutas de la API REST.
 * Autor: JiroxDEV
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
import * as schoolService from '../services/school.service.js';
import { authenticate, optionalAuthenticate } from '../middleware/auth.js';
import { supabase, supabaseAdmin } from '../config/supabase.js';

const router = express.Router();

// Logger local.
const log = (message, level = 'INFO', metadata = {}) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [API] [${level}] ${message}`);
};

const logError = (message, error, metadata = {}) => {
  log(`${message}: ${error.message}`, 'ERROR');
};

router.get('/ping', (req, res) => res.json({ message: 'pong' }));

// --- VERSIONES ---
router.get('/version/latest', optionalAuthenticate, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('app_versions').select('*').order('version_code', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// --- AUTH ---
router.post('/auth/signup', async (req, res) => {
  try {
    const result = await authService.signUp(req.body.username, req.body.password, req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/auth/login', async (req, res) => {
  try {
    const result = await authService.login(req.body.username, req.body.password);
    res.json({ success: true, data: result });
  } catch (error) {
    let status = error.message === 'Usuario no encontrado' ? 404 : 401;
    res.status(status).json({ success: false, error: error.message });
  }
});

router.post('/auth/refresh', async (req, res) => {
  try {
    const result = await authService.refreshSession(req.body.refreshToken);
    res.json({ success: true, data: result });
  } catch (error) { res.status(401).json({ success: false, error: error.message }); }
});

router.post('/auth/logout', authenticate, async (req, res) => {
  try { await authService.logout(req.user.id); res.json({ success: true }); }
  catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.get('/auth/me', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', req.user.id).single();
    if (error) throw error;
    res.json({ success: true, user: req.user, profile: data });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.put('/auth/me', authenticate, async (req, res) => {
  try { const result = await authService.updateUser(req.user.id, req.body); res.json({ success: true, data: result }); }
  catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.get('/auth/exists/:username', async (req, res) => {
  try { const result = await authService.checkUsernameExists(req.params.username); res.json({ success: true, ...result }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// --- POSTS ---
router.get('/posts/range', async (req, res) => {
  try { const data = await postService.getPostsRange(req.query.start, req.query.count, req.user?.id); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/posts', authenticate, async (req, res) => {
  try { const data = await postService.addPost(req.body, req.user.id); res.status(201).json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/posts/:id/vote', authenticate, async (req, res) => {
  try { const data = await voteService.setVote(req.params.id, req.user.id, req.body.voteType); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

// --- NEWS ---
router.get('/news/range', async (req, res) => {
  try { const data = await newsService.getNewsRange(req.query.start, req.query.count); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// --- EVENTS ---
router.get('/events/school', async (req, res) => {
  try { const data = await eventService.getEventsRange('school', req.query.start, req.query.count, req.query.schoolId); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// --- SCHEDULE ---
router.get('/schedule', async (req, res) => {
  try { const data = await scheduleService.getSchedule(req.query.group, req.query.schoolId); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, error: error.message }); }
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
    const data = await schoolService.getGroups(schoolId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- NACIONAL ---
router.get('/schools/provinces', async (req, res) => {
  try { const data = await schoolService.getProvinces(); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/schools/municipalities', async (req, res) => {
  try { const data = await schoolService.getMunicipalities(req.query.provinceId); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/schools/institutions', async (req, res) => {
  try { const data = await schoolService.getSchools(req.query.municipalityId); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/schools/responsibilities', async (req, res) => {
  try { const data = await schoolService.getResponsibilities(); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// --- EPHEMERIS ---
router.get('/ephemeris', async (req, res) => {
  try { const data = await ephemerisService.getEphemeridesByDate(req.query.date, req.query.year); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

// --- REPORTS ---
router.post('/reports', optionalAuthenticate, async (req, res) => {
  try { const data = await reportsService.createReport(req.body, req.user?.id); res.status(201).json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

export default router;
