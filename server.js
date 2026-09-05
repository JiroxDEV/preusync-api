/**
 * ============================================================================
 * Proyecto: PreuSync API
 * Archivo: server.js
 * Versión: v1.1.0
 * Descripción: Punto de entrada principal del servidor Express. Configura
 *              middlewares, rutas, diagnósticos de inicio y tareas programadas.
 * Autor: JiroxDEV
 * Licensed under the GNU Affero General Public License v3
 * Licensed under the GNU Affero General Public License v3
 * Licensed under the GNU Affero General Public License v3
 * ============================================================================
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import morgan from 'morgan';
import dns from 'node:dns';
import apiRoutes from './src/routes/api.js';
import { testSupabaseConnection, diagnoseTables, testDnsResolution, supabase } from './src/config/supabase.js';

// Optimización DNS para entornos de despliegue (como Render) evitando errores ENOTFOUND.
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1']);

// Inicialización de variables de entorno (.env).
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// ============================================================================
// 1. MIDDLEWARES DE SEGURIDAD Y RENDIMIENTO
// ============================================================================

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(compression());

// Configuración de CORS permisiva para facilitar la comunicación con la App Android.
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Logger de peticiones HTTP.
app.use(morgan(isProduction ? 'combined' : 'dev'));

// Límite de payload aumentado para soportar subida de imágenes en base64.
app.use(express.json({ limit: '10mb' }));

// ============================================================================
// 2. SISTEMA DE LOGS CENTRALIZADO
// ============================================================================

const log = (message, level = 'INFO') => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [SERVER] [${level}] ${message}`);
};

// ============================================================================
// 3. DEFINICIÓN DE RUTAS
// ============================================================================

// Endpoint de monitoreo para servicios de Keep-Alive (UptimeRobot, etc).
app.get('/health', (req, res) => {
  log('Solicitud de comprobación de salud recibida', 'INFO');
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime()
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'PreuSync API',
    version: '0.4.0',
    status: 'operational',
    documentation: 'https://github.com/JiroxDEV/PreuSync-backend'
  });
});

// Rutas principales de la API.
app.use('/api', apiRoutes);

// ============================================================================
// 4. MANEJO DE ERRORES Y RUTAS NO ENCONTRADAS
// ============================================================================

app.use((req, res) => {
  log(`404 - Ruta no encontrada: ${req.method} ${req.originalUrl}`, 'WARN');
  res.status(404).json({
    success: false,
    error: 'Endpoint no encontrado'
  });
});

app.use((err, req, res, next) => {
  log(`500 - Error interno: ${err.message}`, 'ERROR');
  log(err.stack, 'ERROR');
  res.status(500).json({
    success: false,
    error: isProduction ? 'Error interno del servidor' : err.message
  });
});

// ============================================================================
// 5. INICIALIZACIÓN DEL SERVIDOR
// ============================================================================

app.listen(PORT, async () => {
  log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`, 'INFO');
  log(`📦 Entorno: ${process.env.NODE_ENV || 'development'}`, 'INFO');

  // Autodiagnóstico al iniciar para asegurar conectividad con la base de datos.
  try {
    await testDnsResolution();
    const connection = await testSupabaseConnection();
    if (connection.success) {
      await diagnoseTables();
    } else {
      log('❌ Falló la conexión con Supabase durante el arranque', 'ERROR');
    }
  } catch (diagError) {
    log(`⚠️ El autodiagnóstico falló: ${diagError.message}`, 'WARN');
  }

  log(`🔑 Supabase URL: ${process.env.SUPABASE_URL ? '✓ Configurada' : '✗ Faltante'}`, 'INFO');
  log(`🔑 Supabase Service Role: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ Configurada' : '✗ Faltante (Funciones admin limitadas)'}`, 'INFO');

  // ==================== TAREA DE SUPERVIVENCIA (Keep-Alive) ====================
  // Realiza una consulta mínima cada 6 horas para evitar la pausa automática de Supabase.
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  setInterval(async () => {
    try {
      log('📡 Ejecutando consulta de supervivencia (Keep-Alive)...', 'INFO');
      const { error } = await supabase.from('app_versions').select('version_code').limit(1);
      if (error) throw error;
      log('✅ Keep-Alive exitoso: Supabase sigue activo', 'INFO');
    } catch (error) {
      log(`⚠️ Falló el Keep-Alive: ${error.message}`, 'WARN');
    }
  }, SIX_HOURS);
});

// ============================================================================
// 6. GESTIÓN DE SEÑALES DE SISTEMA
// ============================================================================

process.on('SIGTERM', () => {
  log('Señal SIGTERM recibida: cerrando servidor de forma grácil', 'INFO');
  process.exit(0);
});

process.on('SIGINT', () => {
  log('Señal SIGINT recibida: cerrando servidor de forma grácil', 'INFO');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  log(`Excepción no capturada: ${err.message}`, 'ERROR');
  log(err.stack, 'ERROR');
});

process.on('unhandledRejection', (reason, promise) => {
  log(`Rechazo no manejado en: ${promise} Razón: ${reason}`, 'ERROR');
});


