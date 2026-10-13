/**
 * ============================================================================
 * Proyecto: PreuSync API
 * Archivo: server.js
 * Versión: v1.3.0
 * Descripción: Punto de entrada del servidor Express. Implementa Ping Cruzado
 *              entre Nodos Render para mantener el cluster activo 24/7.
 * Autor: JiroxDEV
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
import { telemetryMiddleware } from './src/services/telemetry.service.js';

// Optimización DNS para entornos de despliegue (como Render) evitando errores ENOTFOUND.
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1']);

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

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(morgan(isProduction ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(telemetryMiddleware);

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

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime()
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'PreuSync API Cluster',
    version: '0.7.1',
    status: 'operational',
    documentation: 'https://github.com/JiroxDEV/PreuSync-backend'
  });
});

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
// 5. INICIALIZACIÓN Y PING CRUZADO MULTI-NODO
// ============================================================================

function startCrossNodePing() {
  const nodeUrls = (process.env.NODE_URLS || '').split(',').map(u => u.trim()).filter(Boolean);
  if (nodeUrls.length <= 1) return;

  log(`📡 Activando sistema de Ping Cruzado entre ${nodeUrls.length} Nodos Render...`, 'INFO');

  const TEN_MINUTES = 10 * 60 * 1000;
  setInterval(async () => {
    log('🔄 Ejecutando Ping Cruzado a Nodos Hermanos de Render...', 'INFO');
    for (const targetUrl of nodeUrls) {
      try {
        const pingUrl = `${targetUrl.replace(/\/$/, '')}/health`;
        const res = await fetch(pingUrl, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          log(`✅ Nodo Hermano Activo: ${targetUrl}`, 'INFO');
        }
      } catch (err) {
        log(`⚠️ No se pudo contactar nodo ${targetUrl}: ${err.message}`, 'WARN');
      }
    }
  }, TEN_MINUTES);
}

app.listen(PORT, async () => {
  log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`, 'INFO');
  log(`📦 Entorno: ${process.env.NODE_ENV || 'development'}`, 'INFO');

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
  log(`🔑 Supabase Service Role: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ Configurada' : '✗ Faltante'}`, 'INFO');

  startCrossNodePing();
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
