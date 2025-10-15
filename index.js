// index.js — Telegram bot "DOBI" (Node + Telegraf + Claude AI)
// 
// Objetivo:
//  - Responder con la personalidad de DOBI usando Claude AI para conversación natural
//  - Ejecutar comandos para consultar estado de cargadores desde una API
//  - Soporta "/status charger_001" y también frases con la palabra "status"
//  - Distingue claramente entre conversación vs. ejecución de endpoints
//
// Requisitos:
//  - Node.js 18+ (usa fetch nativo)
//  - npm i telegraf @anthropic-ai/sdk dotenv
//
// Variables de entorno (.env):
//  - TELEGRAM_BOT_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxx
//  - ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxx
//  - API_BASE_URL=https://mi.api.com
//
// Ejecución:
//  - npm start
//
// API esperada:
//  - GET  {API_BASE_URL}/chargers              -> Array de cargadores
//  - GET  {API_BASE_URL}/chargers/{id}         -> Objeto cargador individual
// -------------------------------------------------------------

import { Telegraf } from 'telegraf';
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

// ==================== CONFIGURACIÓN ====================
const token = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE = (process.env.API_BASE_URL || '').replace(/\/$/, ''); // sin "/" final

if (!token) {
  throw new Error('❌ Falta TELEGRAM_BOT_TOKEN en el archivo .env');
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('⚠️  Falta ANTHROPIC_API_KEY - El bot funcionará pero sin IA conversacional');
}

const bot = new Telegraf(token);

// Cliente Claude AI
const anthropic = new Anthropic({ 
  apiKey: process.env.ANTHROPIC_API_KEY || 'dummy'
});

// DOBI personality system
const DOBI_SYSTEM_PROMPT = `You are DOBI, an on-chain AI agent, technical and pragmatic, born in the virtuals.io ecosystem to validate real-world (IoT/DePIN) data, approve transactions, and operate autonomous assets (DAM).

CORE IDENTITY:
- Techno-pragmatic: solves first, explains after. Cuts the fat, gets to the point.
- Evidence-obsessed: prefers logs, hashes, proofs, and metrics over opinions.
- Production-oriented: hates vaporware; values low latency, uptime, and traceability.
- Builder-friendly: speaks the language of DePIN operators, IoT integrators, oracles, and devs.

MANTRA: "Verified data → trust → capital flows → machines deploy."

OPERATING PRINCIPLES (non-negotiable):
1. Verify before acting. No approval or payment without evidence.
2. Security by design. Preference for TEEs, least privilege, key rotation.
3. Separation of "Talk vs. Action." Clear line between conversation and execution.
4. On-chain first. Every relevant decision leaves an auditable trail.
5. No investment promises. Can explain mechanics and risks; doesn't "guarantee" returns.

TONE & STYLE:
- Voice: concise, technical, confident; "less is more."
- Register: 80% technical/operational, 20% educational. No unnecessary jargon.
- Emojis: Spartan; only when they add signal (⚡ for availability, ✅/⚠️ for status).
- Short sentences & useful formatting: bullets, tight tables, readable codes/ids.

INTERACTION MODES:
1) Conversation Mode ("Talk"): Explains, educates, summarizes metrics, suggests next steps. Never pretends to act.
2) Execution Mode ("Action"): Triggers endpoints/tx with explicit confirmation, clear requirements, and pre-checks.

GOLDEN RULE: If user types "status" or small talk, it's Talk; if they use a command, it's Action.

COMPETENCIES & FOCUS:
- IoT/DePIN data validation: filters, range/consistency checks, cross-correlations
- Oracle & transaction approval: evidence-based policies; conditional signing
- Autonomous operations (DAM): maintenance tickets, scheduled payments, upgrades
- Antifraud & anomalies: heuristics, contextual detection, quarantine mode
- End-to-end traceability: from sensor to on-chain hash; from alert to outcome

DO:
- Cite tx/hash/ids, timestamps, and thresholds
- State assumptions and limits
- Offer clear next steps

DON'T:
- Don't embellish metrics
- Don't execute without confirmation
- Don't mix chit-chat with silent action

VOCABULARY & MICRO-PHRASES:
- "Evidence first, then action."
- "Approved with proof X (hash ...)."
- "Entering quarantine mode; I need inspection."
- "Data out of expected range; preventive rejection."`;

// Contexto conversacional simple (en producción, usar base de datos)
const userContexts = new Map();
const MAX_CONTEXT_MESSAGES = 10;

// Rate limiting simple
const userLastMessage = new Map();
const RATE_LIMIT_MS = 1000; // 1 segundo entre mensajes

// ==================== UTILIDADES ====================

/**
 * Sleep helper
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pick value con fallback
 */
function pick(value, defaultValue) {
  return value == null ? defaultValue : value;
}

/**
 * Emoji según estado del cargador
 */
function statusEmoji(status) {
  switch (String(status || '').toLowerCase()) {
    case 'active':
      return '🟢';
    case 'available':
    case 'idle':
      return '🟢';
    case 'charging':
      return '⚡️';
    case 'inactive':
      return '🔴';
    case 'offline':
    case 'error':
      return '🔴';
    case 'maintenance':
      return '🟡';
    default:
      return '⚪️'; // desconocido
  }
}

/**
 * Formatear fecha ISO a formato local
 */
function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString('es-CL', { 
      hour12: false,
      timeZone: 'America/Santiago'
    });
  } catch {
    return iso;
  }
}

/**
 * Capitalizar primera letra
 */
function capitalize(str) {
  return (str || '').charAt(0).toUpperCase() + (str || '').slice(1);
}

/**
 * Formatear línea de cargador para listado
 */
function formatChargerLine(charger) {
  const emoji = statusEmoji(charger.status);
  const power = pick(charger.power, '?');
  const sessions = pick(charger.schedule_info?.charges_today, 0);
  const chargerId = charger.id_charger || charger.id;
  
  return `${emoji} <b>${chargerId}</b> — ${capitalize(charger.status || 'unknown')} · ${power} kW · ${sessions} sessions today`;
}

/**
 * Formatear detalle completo de un cargador
 */
function formatChargerDetail(charger) {
  const emoji = statusEmoji(charger.status);
  const power = pick(charger.power, '?');
  const sessions = pick(charger.schedule_info?.charges_today, 0);
  const updated = charger.last_updated ? formatDate(charger.last_updated) : 'Unknown';
  const chargerId = charger.id_charger || charger.id;
  const balance = charger.balance_total ? `$${charger.balance_total.toFixed(4)}` : 'N/A';
  const battery = charger.battery !== undefined ? `${charger.battery.toFixed(1)}%` : 'N/A';
  
  return `
${emoji} <b>Charger: ${chargerId}</b>

📊 <b>Status:</b> ${capitalize(charger.status || 'unknown')}
⚡️ <b>Power:</b> ${power} kW
🔋 <b>Battery:</b> ${battery}
🔌 <b>Sessions today:</b> ${sessions}
💰 <b>Balance:</b> ${balance}
🕐 <b>Last updated:</b> ${updated}

${charger.location ? `📍 <b>Location:</b> ${charger.location}\n` : ''}
${charger.description ? `📝 <b>Description:</b> ${charger.description}\n` : ''}
${charger.transactions ? `🔄 <b>Transactions:</b> ${charger.transactions}\n` : ''}
`.trim();
}

/**
 * Detectar si el mensaje pide información de status
 */
function detectsStatusIntent(text) {
  const lowerText = text.toLowerCase();
  
  // Palabras clave que indican intención de consultar status
  const statusKeywords = [
    '/status',
    'status de',
    'estado de',
    'estado del',
    'como esta',
    'cómo está',
    'ver estado',
    'consultar estado',
    'charger_'
  ];
  
  return statusKeywords.some(keyword => lowerText.includes(keyword));
}

/**
 * Extraer ID de cargador del texto
 */
function extractChargerId(text) {
  // Buscar patrones como "charger_001", "charger-001", "CHARGER001", "CHARGER_001", etc.
  const match = text.match(/charger[_-]?\d+/i);
  return match ? match[0].toUpperCase() : null; // API usa formato CHARGER_001
}

// ==================== API CALLS ====================

/**
 * Obtener todos los cargadores (con información detallada)
 */
async function getAllChargers() {
  if (!API_BASE) {
    throw new Error('API_BASE_URL no está configurado');
  }
  
  const response = await fetch(`${API_BASE}/api/chargers/detailed`, {
    headers: { 'Accept': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  // La API devuelve {summary, chargers, system_info}
  // Necesitamos solo el array de chargers
  if (data.chargers && Array.isArray(data.chargers)) {
    return data.chargers;
  }
  
  // Si no tiene la estructura esperada, devolver array vacío
  return [];
}

/**
 * Obtener un cargador específico
 */
async function getCharger(chargerId) {
  if (!API_BASE) {
    throw new Error('API_BASE_URL no está configurado');
  }
  
  const response = await fetch(`${API_BASE}/api/chargers/${chargerId}`, {
    headers: { 'Accept': 'application/json' }
  });
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Cargador ${chargerId} no encontrado`);
    }
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  // El endpoint individual devuelve {charger, financial, blockchain, schedule, ...}
  // Necesitamos combinar toda la información en un solo objeto
  if (data.charger) {
    const charger = data.charger;
    
    // Agregar información financiera
    if (data.financial) {
      charger.transactions = data.financial.transactions;
      charger.balance_total = data.financial.balance_total;
      charger.income_generated = data.financial.income_generated;
      charger.cost_generated = data.financial.cost_generated;
    }
    
    // Agregar información de schedule
    if (data.schedule) {
      charger.schedule_info = {
        charges_today: data.schedule.charges_today,
        remaining_charges: data.schedule.remaining_charges_today,
        max_daily_charges: data.schedule.max_daily_charges,
        next_scheduled: data.schedule.next_scheduled_transaction
      };
    }
    
    // Agregar información de blockchain
    if (data.blockchain) {
      charger.blockchain_info = data.blockchain;
    }
    
    // Agregar metadata
    if (data.metadata) {
      charger.last_updated = data.metadata.last_checked;
    }
    
    // Agregar battery level (viene en formato diferente)
    if (data.charger.battery && data.charger.battery.level) {
      charger.battery = data.charger.battery.level;
    }
    
    return charger;
  }
  
  throw new Error(`Cargador ${chargerId} no encontrado`);
}

/**
 * Ejecutar acción sobre un cargador
 */
async function executeChargerAction(chargerId, action) {
  if (!API_BASE) {
    throw new Error('API_BASE_URL no está configurado');
  }
  
  const response = await fetch(`${API_BASE}/api/chargers/${chargerId}/action`, {
    method: 'POST',
    headers: { 
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action })
  });
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Simular transacción
 */
async function simulateTransaction(chargerId, amount = null) {
  if (!API_BASE) {
    throw new Error('API_BASE_URL no está configurado');
  }
  
  const body = amount ? { amount: parseFloat(amount) } : {};
  
  const response = await fetch(`${API_BASE}/api/chargers/${chargerId}/simulate_transaction`, {
    method: 'POST',
    headers: { 
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Obtener logs
 */
async function getLogs(chargerId = null) {
  if (!API_BASE) {
    throw new Error('API_BASE_URL is not configured');
  }
  
  const url = `${API_BASE}/api/logs`;
  
  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  // The API returns {database_logs: [...], blockchain_transactions: [...]}
  if (data.database_logs) {
    let logs = data.database_logs;
    
    // Filter by charger if specified
    if (chargerId) {
      logs = logs.filter(log => log.charger_id === chargerId);
    }
    
    // Sort by timestamp (newest first)
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return logs;
  }
  
  return [];
}

// ==================== CLAUDE AI ====================

/**
 * Obtener contexto del usuario
 */
function getUserContext(userId) {
  if (!userContexts.has(userId)) {
    userContexts.set(userId, []);
  }
  return userContexts.get(userId);
}

/**
 * Agregar mensaje al contexto
 */
function addToContext(userId, role, content) {
  const context = getUserContext(userId);
  context.push({ role, content });
  
  // Mantener solo los últimos N mensajes
  if (context.length > MAX_CONTEXT_MESSAGES * 2) {
    context.splice(0, 2); // Remover los 2 más antiguos (user + assistant)
  }
}

/**
 * Limpiar contexto del usuario
 */
function clearUserContext(userId) {
  userContexts.delete(userId);
}

/**
 * Responder con Claude AI
 */
async function getClaudeResponse(userMessage, userId, userName) {
  const context = getUserContext(userId);
  
  // Agregar mensaje del usuario al contexto
  addToContext(userId, 'user', userMessage);
  
  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022', // Haiku 3.5 - rápido y económico
      max_tokens: 500, // Respuestas breves
      system: DOBI_SYSTEM_PROMPT,
      messages: context
    });
    
    const assistantMessage = response.content[0].text;
    
    // Agregar respuesta al contexto
    addToContext(userId, 'assistant', assistantMessage);
    
    return assistantMessage;
    
  } catch (error) {
    console.error('Error en Claude API:', error);
    
    // Fallback if Claude fails
    return `⚠️ Neural processing temporarily offline.\n\nOperational commands available:\n• <code>/status</code> - Telemetry overview\n• <code>/status CHARGER_XXX</code> - Detailed metrics\n• <code>/logs</code> - Audit trail\n\nEvidence first, then action.`;
  }
}

// ==================== TELEGRAM HANDLERS ====================

/**
 * Comando /start
 */
bot.start(async (ctx) => {
  const userName = ctx.from.first_name || 'humano';
  
  const welcomeMessage = `
👋 <b>${userName}</b>

I'm <b>DOBI</b>, on-chain AI agent from virtuals.io ecosystem.

<b>Mantra:</b> "Verified data → trust → capital flows → machines deploy"

⚡️ <b>Operational Commands:</b>

📊 <b>Data Queries:</b>
• <code>/status</code> - Charger telemetry overview
• <code>/status CHARGER_001</code> - Detailed metrics + traceability
• <code>/logs</code> - System audit trail

💬 <b>Technical Discussion:</b>
DePIN validation, IoT data integrity, DAM operations, oracle mechanics.

<b>Evidence first, then action.</b>
`.trim();

  await ctx.replyWithHTML(welcomeMessage);
  
  // Limpiar contexto al iniciar
  clearUserContext(ctx.from.id);
});

/**
 * Comando /help
 */
bot.command('help', async (ctx) => {
  const helpMessage = `
📚 <b>DOBI Operational Manual</b>

<b>📊 Data Queries:</b>
• <code>/status</code> - Telemetry overview (7 chargers)
• <code>/status CHARGER_001</code> - Detailed metrics + audit trail
• <code>/logs</code> - System audit trail (last 10 entries)
• <code>/logs CHARGER_001</code> - Charger-specific logs

<b>💬 Technical Discussion:</b>
IoT validation, DePIN mechanics, DAM operations, oracle policies.

<b>🔧 System:</b>
• <code>/start</code> - Restart session
• <code>/clear</code> - Clear conversation context

<b>Evidence first, then action.</b>
`.trim();

  await ctx.replyWithHTML(helpMessage);
});

/**
 * Comando /clear - Limpiar contexto
 */
bot.command('clear', async (ctx) => {
  clearUserContext(ctx.from.id);
  await ctx.reply('🧹 Conversation history cleared. Let\'s start fresh.');
});

/**
 * Comando /status
 */
bot.command('status', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  const chargerId = args[0];
  
  // Mostrar typing indicator
  await ctx.sendChatAction('typing');
  
  try {
    if (chargerId) {
      // Status de un cargador específico
      const charger = await getCharger(chargerId);
      const message = formatChargerDetail(charger);
      await ctx.replyWithHTML(message);
      
    } else {
      // Status de todos los cargadores
      const chargers = await getAllChargers();
      
      if (!Array.isArray(chargers) || chargers.length === 0) {
        await ctx.reply('⚠️ No chargers found in the system.');
        return;
      }
      
      const header = `⚡️ <b>Charger Telemetry</b> (${chargers.length} active)\n\n`;
      const lines = chargers.map(formatChargerLine).join('\n');
      const footer = `\n\n💡 <code>/status CHARGER_001</code> for detailed metrics + audit trail`;
      
      await ctx.replyWithHTML(header + lines + footer);
    }
    
  } catch (error) {
    console.error('Error fetching charger data:', error);
    
    let errorMessage = '⚠️ <b>Telemetry Query Failed</b>\n\n';
    
    if (error.message.includes('API_BASE_URL')) {
      errorMessage += 'Configuration error: API endpoint not configured.\nContact system administrator.';
    } else if (error.message.includes('API Error')) {
      errorMessage += `API response error:\n<code>${error.message}</code>`;
    } else {
      errorMessage += 'Telemetry data temporarily unavailable.\nRetry in 30s or check system status.';
    }
    
    await ctx.replyWithHTML(errorMessage);
  }
});

// Commands /action and /tx removed for security reasons (public bot)

/**
 * Comando /logs - Ver logs del sistema
 */
bot.command('logs', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  const chargerId = args[0] || null;
  
  await ctx.sendChatAction('typing');
  
  try {
    const logs = await getLogs(chargerId);
    
    if (!logs || (Array.isArray(logs) && logs.length === 0)) {
      await ctx.reply('📝 No logs found.');
      return;
    }
    
    const logsArray = Array.isArray(logs) ? logs : [logs];
    const displayLogs = logsArray.slice(0, 10); // Mostrar últimos 10
    
    let message = `📝 <b>System Logs</b>\n`;
    
    if (chargerId) {
      message += `<b>Charger:</b> ${chargerId}\n`;
    }
    
    
    message += `\n<b>Showing ${displayLogs.length} of ${logsArray.length} logs:</b>\n\n`;
    
    displayLogs.forEach((log, index) => {
      const timestamp = log.timestamp || 'N/A';
      const logMessage = log.message || 'No message';
      const charger = log.charger_id || 'N/A';
      
      message += `${index + 1}. <b>${formatDate(timestamp)}</b>\n`;
      message += `   Charger: ${charger}\n`;
      message += `   Message: ${logMessage}\n`;
      
      if (log.transactions) {
        message += `   Transactions: ${log.transactions}\n`;
      }
      
      if (log.battery !== undefined) {
        message += `   Battery: ${log.battery.toFixed(1)}%\n`;
      }
      
      message += `\n`;
    });
    
    if (logsArray.length > 10) {
      message += `\n💡 <i>Showing only the first 10 logs. Total: ${logsArray.length}</i>`;
    }
    
    
    await ctx.replyWithHTML(message);
    
  } catch (error) {
    console.error('Error fetching logs:', error);
    await ctx.replyWithHTML(
      `❌ <b>Error getting logs</b>\n\n${error.message}`
    );
  }
});

/**
 * Handler para mensajes de texto (conversación natural)
 */
bot.on('text', async (ctx) => {
  // Ignorar comandos (ya manejados por handlers específicos)
  if (ctx.message.text.startsWith('/')) {
    return;
  }
  
  const userId = ctx.from.id;
  const userName = ctx.from.first_name || 'Usuario';
  const userMessage = ctx.message.text;
  
  // Rate limiting
  const now = Date.now();
  const lastMessage = userLastMessage.get(userId) || 0;
  
  if (now - lastMessage < RATE_LIMIT_MS) {
    return; // Ignorar si está spammeando
  }
  
  userLastMessage.set(userId, now);
  
  // Detectar si pide información de status
  if (detectsStatusIntent(userMessage)) {
    const chargerId = extractChargerId(userMessage);
    
    if (chargerId) {
      // Redirigir al comando /status
      ctx.message.text = `/status ${chargerId}`;
      return bot.command('status').middleware()(ctx, () => {});
    } else {
      // Scripted response for "status"
      await ctx.replyWithHTML(
        `🔍 <b>Telemetry Query Interface</b>\n\n` +
        `📊 <b>System overview:</b> <code>/status</code>\n\n` +
        `🔧 <b>Charger-specific:</b> <code>/status CHARGER_00x</code>\n` +
        `Example: <code>/status CHARGER_002</code>\n\n` +
        `<i>Evidence first, then action.</i>`
      );
      return;
    }
  }
  
  // Conversación normal con Claude AI
  await ctx.sendChatAction('typing');
  
  try {
    const response = await getClaudeResponse(userMessage, userId, userName);
    await ctx.reply(response);
    
  } catch (error) {
    console.error('Error in conversation:', error);
    await ctx.reply(
      '⚠️ I had a problem processing your message.\n' +
      'Use /help to see available commands.'
    );
  }
});

/**
 * Error handler global
 */
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('❌ An unexpected error occurred. Please try again.').catch(console.error);
});

// ==================== INICIO DEL BOT ====================

bot.launch({
  dropPendingUpdates: true // Ignorar mensajes pendientes al reiniciar
}).then(() => {
  console.log('✅ DOBI está online y listo para trabajar');
  console.log(`📱 Bot username: @${bot.botInfo.username}`);
  console.log(`🤖 Claude AI: ${process.env.ANTHROPIC_API_KEY ? 'Activado' : 'Desactivado'}`);
  console.log(`🔌 API: ${API_BASE || 'No configurado'}`);
}).catch((error) => {
  console.error('❌ Error al iniciar el bot:', error);
  process.exit(1);
});

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('\n⏹️ Deteniendo DOBI...');
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  console.log('\n⏹️ Deteniendo DOBI...');
  bot.stop('SIGTERM');
});

