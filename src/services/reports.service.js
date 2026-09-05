/**
 * ============================================================================
 * Proyecto: PreuSync API
 * Archivo: reports.service.js
 * Versión: v1.0.0
 * Descripción: Servicio para la gestión de reportes de errores. Integra
 *              el almacenamiento en Supabase con la creación automatizada
 *              de Issues en GitHub mediante su API REST.
 * Autor: JiroxDEV
 * Licensed under the GNU Affero General Public License v3
 * Licensed under the GNU Affero General Public License v3
 * ============================================================================
 */

import { supabaseAdmin } from '../config/supabase.js';

// Sistema de logs interno para el servicio de reportes.
const log = (message, level = 'INFO', metadata = {}) => {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(metadata).length ? ` | ${JSON.stringify(metadata)}` : '';
  console.log(`[${timestamp}] [ReportsService] [${level}] ${message}${metaStr}`);
};

const logError = (message, error, metadata = {}) => {
  log(`${message}: ${error.message}`, 'ERROR', { ...metadata, stack: error.stack });
};

/**
 * Registra un nuevo reporte de error en la base de datos y opcionalmente en GitHub.
 * @param {Object} reportData Datos del reporte (título, descripción, stack trace, etc).
 * @param {string} userId ID del usuario que envía el reporte (opcional).
 */
export async function createReport(reportData, userId = null) {
  const { title, description, stackTrace, deviceInfo } = reportData;

  if (!title || !description) {
    throw new Error('El título y la descripción son obligatorios para procesar el reporte');
  }

  // 1. Almacenamiento en Supabase como respaldo y auditoría interna.
  const reportRow = {
    title: title.trim(),
    description: description.trim(),
    stack_trace: stackTrace || '',
    device_info: deviceInfo || '',
    user_id: userId,
    status: 'pending'
  };

  // Se utiliza supabaseAdmin para evitar restricciones de RLS al insertar reportes desde el servidor.
  const { data: dbRecord, error: dbError } = await supabaseAdmin
    .from('bug_reports')
    .insert([reportRow])
    .select()
    .single();

  if (dbError) {
    logError('❌ Error al guardar el reporte en Supabase', dbError);
    const detailedError = new Error(`Error DB: ${dbError.message}`);
    detailedError.details = dbError.details;
    detailedError.hint = dbError.hint;
    throw detailedError;
  }

  log(`✅ Reporte guardado en Supabase (ID: ${dbRecord.id})`);

  // 2. Integración con GitHub: Crea un Issue de forma automatizada.
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_OWNER = process.env.GITHUB_OWNER;
  const GITHUB_REPO = process.env.GITHUB_REPO;

  if (GITHUB_TOKEN && GITHUB_OWNER && GITHUB_REPO) {
    try {
      const githubBody = `
### Descripción del usuario
${description}

### Información del Dispositivo
${deviceInfo || 'No disponible'}

### Stack Trace
\`\`\`
${stackTrace || 'No disponible'}
\`\`\`

---
**Reporte ID (Supabase):** ${dbRecord.id}
**Usuario ID:** ${userId || 'Anónimo'}
      `;

      // Petición POST a la API de GitHub para crear el Issue.
      const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: `[BUG] ${title}`,
          body: githubBody,
          labels: ['bug', 'app-report']
        })
      });

      const ghData = await response.json();

      if (response.ok) {
        log(`🚀 GitHub Issue creado exitosamente: ${ghData.html_url}`);
        // Actualizamos el registro en Supabase con la URL del Issue generado.
        await supabaseAdmin
          .from('bug_reports')
          .update({ github_issue_url: ghData.html_url, status: 'sent' })
          .eq('id', dbRecord.id);

        return { success: true, reportId: dbRecord.id, githubUrl: ghData.html_url };
      } else {
        log(`⚠️ Error en API de GitHub: ${ghData.message}`, 'WARN');
      }
    } catch (ghError) {
      logError('⚠️ Error de conexión con la API de GitHub', ghError);
    }
  } else {
    log('ℹ️ Integración con GitHub omitida (variables de entorno no configuradas)', 'INFO');
  }

  return { success: true, reportId: dbRecord.id, githubUrl: null };
}


