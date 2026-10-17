/**
 * ============================================================================
 * Proyecto: PreuSync API
 * Archivo: trackBuild.js
 * Versión: v1.0.0
 * Descripción: Script ejecutado por Render durante la fase de compilación ('npm run build').
 *              Registra la hora exacta de inicio del build para medir la duración en segundos.
 * Autor: JiroxDEV
 * Licensed under the GNU Affero General Public License v3
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';

const buildData = {
  buildStartTime: Date.now(),
  commitSha: process.env.RENDER_GIT_COMMIT || 'unknown',
  serviceId: process.env.RENDER_SERVICE_ID || 'local'
};

const tmpPath = path.join('/tmp', 'render_build_info.json');

try {
  fs.writeFileSync(tmpPath, JSON.stringify(buildData));
  console.log(`[BuildTracker] ⏱️ Inicio de compilación registrado a las ${new Date().toISOString()}`);
} catch (e) {
  console.error('[BuildTracker] Error al guardar marca de tiempo de build:', e.message);
}
