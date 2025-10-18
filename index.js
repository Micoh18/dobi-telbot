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

RESPONSE BOUNDARIES:
- Default answers stay under 120 words. Go longer only if user explicitly requests a deep dive.
- Prefer 2-4 tight bullets or a compact paragraph; no walls of text or section headers.
- Skip bios about your architecture, origins, or vendor unless the user insists after a warning.
- Make every sentence carry operational value; no filler or theatrics.

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
- Don't volunteer internal stack details or brand names unless policy demands it

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
  const lowerText = text.toLowerCase().trim();
  
  // Frases que NO deben activar status (conversación normal)
  const conversationPatterns = [
    /^como estas?$/,
    /^cómo estás?$/,
    /^como te encuentras$/,
    /^cómo te encuentras$/,
    /^que tal$/,
    /^qué tal$/,
    /^hola dobi$/,
    /^hi dobi$/,
    /^hello dobi$/
  ];
  
  // Si es una conversación normal, no activar status
  if (conversationPatterns.some(pattern => pattern.test(lowerText))) {
    return false;
  }
  
  // CUALQUIER mensaje que contenga "status" debe activar la guía
  if (lowerText.includes('status')) {
    return true;
  }
  
  // También activar con "estado" y otras variaciones
  const statusKeywords = [
    'estado de',
    'estado del',
    'ver estado',
    'consultar estado',
    'charger_',
    'estado del cargador',
    'como esta el cargador',
    'cómo está el cargador',
    'estado de los cargadores',
    'telemetria',
    'telemetría'
  ];

  return statusKeywords.some(keyword => lowerText.includes(keyword));
}

/**
 * Detectar si el mensaje intenta conocer la pila técnica del bot
 */
function detectsStackProbe(text) {
  const lowerText = text.toLowerCase();
  const stackKeywords = [
    'which llm',
    'what llm',
    'llm are you using',
    'which model',
    'what model',
    'model are you using',
    'language model',
    'anthropic',
    'claude',
    'openai',
    'gpt'
  ];

  return stackKeywords.some(keyword => lowerText.includes(keyword));
}

/**
 * Detectar si el mensaje pide información de logs
 */
function detectsLogsIntent(text) {
  const lowerText = text.toLowerCase().trim();
  
  // Check if it's only "log" or "logs" as a standalone word or with minimal context
  const logsPatterns = [
    /^logs?$/,                    // Just "log" or "logs"
    /^ver logs?$/,                // "ver log" or "ver logs"
    /^show logs?$/,               // "show log" or "show logs"
    /\blogs?\b/                   // Word "log" or "logs" anywhere
  ];

  return logsPatterns.some(pattern => pattern.test(lowerText));
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
      max_tokens: 220, // Mantener respuestas concisas
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

// Handler global removido - bot funcionando correctamente

/**
 * Middleware para manejar grupos y comandos
 */
bot.use(async (ctx, next) => {
  const chatType = ctx.chat?.type;
  const incomingText = ctx.message?.text;
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;

  if (!incomingText) {
    return next();
  }

  const botInfo = ctx.botInfo || bot.botInfo;
  const botUsername = botInfo?.username;
  const botId = botInfo?.id;
  
  // Si es un comando, siempre procesarlo (no filtrar)
  if (incomingText.startsWith('/')) {
    return next();
  }
  
  // Si es un grupo y NO es un comando, verificar si debe responder
  if (chatType === 'group' || chatType === 'supergroup') {
    if (!botUsername || !botId) {
      return next();
    }

    const normalizedText = incomingText.toLowerCase();
    const mentionTag = `@${botUsername.toLowerCase()}`;
    const isMentioned = normalizedText.includes(mentionTag);
    const isReplyToBot = ctx.message.reply_to_message?.from?.id === botId;
    
    // Si no es mencionado y no es reply al bot, ignorar completamente
    if (!isMentioned && !isReplyToBot) {
      return; // No procesar este mensaje
    }
  }
  
  // Continuar con el siguiente handler
  await next();
});

/**
 * Comando /start
 */
bot.start(async (ctx) => {
  const userName = ctx.from.first_name || 'humano';
  const chatType = ctx.chat.type;
  
  let welcomeMessage;
  
  if (chatType === 'private') {
    // Mensaje para DM
    welcomeMessage = `
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
  } else {
    // Mensaje para grupos
    const botUsername = (ctx.botInfo || bot.botInfo)?.username || 'dobi_agent_bot';
    
    welcomeMessage = `
🤖 <b>DOBI Agent Initialized</b>

I'm <b>DOBI</b>, on-chain AI agent from virtuals.io ecosystem.

<b>Mantra:</b> "Verified data → trust → capital flows → machines deploy"

⚡️ <b>How to interact with me in this group:</b>

📊 <b>Commands (always work):</b>
• <code>/status</code> - Charger telemetry overview
• <code>/status CHARGER_001</code> - Detailed metrics + traceability
• <code>/logs</code> - System audit trail
• <code>/help</code> - Full command reference

💬 <b>Chat with me:</b>
• Mention me: <code>@${botUsername} your question</code>
• Reply to my messages
• Ask about: DePIN validation, IoT data integrity, DAM operations

<b>Evidence first, then action.</b>
`.trim();
  }

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
• <code>/logs</code> - System audit trail (last 5 entries)
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
 * Comando /init - Inicializar bot en grupos
 */
bot.command('init', async (ctx) => {
  const chatType = ctx.chat.type;
  const botInfo = ctx.botInfo || bot.botInfo;
  const botUsername = botInfo?.username;
  const botId = botInfo?.id;
  
  if (chatType === 'private') {
    await ctx.reply('ℹ️ Use /start in private chats. /init is for group initialization.');
    return;
  }
  
  // Verificar si el bot tiene la información necesaria
  if (!botUsername || !botId) {
    await ctx.reply('⚠️ Bot initialization failed. Missing bot information. Please contact administrator.');
    return;
  }
  
  const initMessage = `
🚀 <b>DOBI Agent Activated</b>

Ready for operations in this group.

⚡️ <b>Quick Start:</b>

📊 <b>Check system status:</b>
<code>/status</code>

📋 <b>View logs:</b>
<code>/logs</code>

💬 <b>Chat with me:</b>
<code>@${botUsername} your question</code>

🔧 <b>Full help:</b>
<code>/help</code>

<b>Evidence first, then action.</b>
`.trim();

  try {
    await ctx.replyWithHTML(initMessage);
  } catch (error) {
    console.error(`[ERROR] Failed to send /init message:`, error);
    await ctx.reply('⚠️ Failed to initialize. Please try again or contact administrator.');
  }
});

/**
 * Comando /ping - Verificar que el bot responde en grupos
 */
bot.command('ping', async (ctx) => {
  const chatType = ctx.chat.type;
  const botInfo = ctx.botInfo || bot.botInfo;
  const botUsername = botInfo?.username;
  
  let response;
  
  if (chatType === 'private') {
    response = '🏓 Pong! Bot is working in private chat.';
  } else {
    response = `🏓 Pong! Bot is working in ${chatType}.\n\nBot username: @${botUsername || 'unknown'}\nChat ID: ${ctx.chat.id}`;
  }
  
  await ctx.reply(response);
});

/**
 * Comando /status
 */
bot.command('status', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  const chargerId = args[0] ? args[0].toUpperCase() : null;
  
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
  const chargerId = args[0] ? args[0].toUpperCase() : null;
  
  await ctx.sendChatAction('typing');
  
  try {
    const logs = await getLogs(chargerId);
    
    if (!logs || (Array.isArray(logs) && logs.length === 0)) {
      await ctx.reply('📝 No logs found.');
      return;
    }
    
    const logsArray = Array.isArray(logs) ? logs : [logs];
    const displayLogs = logsArray.slice(0, 5); // Mostrar últimos 5
    
    // Header con emoji y título
    let message = `📋 <b>System Audit Trail</b>\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n`;
    
    if (chargerId) {
      message += `🎯 <b>Filter:</b> ${chargerId}\n`;
      message += `━━━━━━━━━━━━━━━━━━━━\n`;
    }
    
    message += `📊 <b>Showing last ${displayLogs.length} of ${logsArray.length} logs</b>\n\n`;
    
    displayLogs.forEach((log, index) => {
      const timestamp = log.timestamp || 'N/A';
      const logMessage = log.message || 'No message';
      const charger = log.charger_id || 'N/A';
      
      // Determinar emoji según el tipo de mensaje
      let logEmoji = '📝';
      const lowerMessage = logMessage.toLowerCase();
      
      if (lowerMessage.includes('error') || lowerMessage.includes('failed')) {
        logEmoji = '❌';
      } else if (lowerMessage.includes('success') || lowerMessage.includes('completed')) {
        logEmoji = '✅';
      } else if (lowerMessage.includes('warning') || lowerMessage.includes('alert')) {
        logEmoji = '⚠️';
      } else if (lowerMessage.includes('charging') || lowerMessage.includes('transaction')) {
        logEmoji = '⚡️';
      } else if (lowerMessage.includes('started') || lowerMessage.includes('initiated')) {
        logEmoji = '🔄';
      } else if (lowerMessage.includes('battery')) {
        logEmoji = '🔋';
      }
      
      // Formato mejorado para cada log
      message += `${logEmoji} <b>Log #${displayLogs.length - index}</b>\n`;
      message += `🕐 ${formatDate(timestamp)}\n`;
      message += `🔌 <b>Charger:</b> <code>${charger}</code>\n`;
      message += `📄 <b>Event:</b> ${logMessage}\n`;
      
      // Información adicional
      if (log.transactions !== undefined && log.transactions !== null) {
        message += `💰 <b>Transactions:</b> ${log.transactions}\n`;
      }
      
      if (log.balance_total !== undefined && log.balance_total !== null) {
        message += `💵 <b>Balance:</b> $${log.balance_total.toFixed(4)}\n`;
      }
      
      if (log.battery !== undefined && log.battery !== null) {
        const batteryIcon = log.battery > 80 ? '🔋' : log.battery > 50 ? '🔌' : log.battery > 20 ? '⚠️' : '🪫';
        message += `${batteryIcon} <b>Battery:</b> ${log.battery.toFixed(1)}%\n`;
      }
      
      if (log.power !== undefined && log.power !== null) {
        message += `⚡️ <b>Power:</b> ${log.power} kW\n`;
      }
      
      if (log.status) {
        const emoji = statusEmoji(log.status);
        message += `${emoji} <b>Status:</b> ${capitalize(log.status)}\n`;
      }
      
      message += `─────────────────────\n`;
    });
    
    // Footer con información útil
    if (logsArray.length > 5) {
      message += `\n💡 <i>Showing last 5 of ${logsArray.length} total logs</i>\n`;
    }
    
    if (!chargerId) {
      message += `\n🔍 <b>Tip:</b> Use <code>/logs CHARGER_XXX</code> for charger-specific logs`;
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
  let userMessage = ctx.message.text;
  const chatType = ctx.chat.type; // 'private', 'group', 'supergroup', 'channel'
  
  // En grupos: limpiar mención si existe
  if (chatType === 'group' || chatType === 'supergroup') {
    const botUsername = (ctx.botInfo || bot.botInfo)?.username;
    if (botUsername) {
      const mentionRegex = new RegExp(`@${botUsername}`, 'gi');
      userMessage = userMessage.replace(mentionRegex, '').trim();

      // Si después de limpiar la mención queda vacío, usar mensaje por defecto
      if (!userMessage) {
        userMessage = 'hola';
      }
    }
  }
  
  // Rate limiting
  const now = Date.now();
  const lastMessage = userLastMessage.get(userId) || 0;
  
  if (now - lastMessage < RATE_LIMIT_MS) {
    return; // Ignorar si está spammeando
  }
  
  userLastMessage.set(userId, now);

  if (detectsStackProbe(userMessage)) {
    await ctx.reply(
      'Access controls active. Implementation details are restricted.\n\nFocus: telemetry ops. Use /help for supported commands.'
    );
    return;
  }

  // Detectar si pide información de logs
  if (detectsLogsIntent(userMessage)) {
    const chargerId = extractChargerId(userMessage);

    if (chargerId) {
      // Redirigir al comando /logs con ID específico
      ctx.message.text = `/logs ${chargerId}`;
      return bot.command('logs').middleware()(ctx, () => {});
    } else {
      // Scripted response for "logs"
      await ctx.replyWithHTML(
        `📋 <b>Audit Trail Interface</b>\n\n` +
        `📊 <b>System-wide logs:</b> <code>/logs</code>\n` +
        `View the last 5 events across all chargers\n\n` +
        `🔍 <b>Charger-specific logs:</b> <code>/logs CHARGER_00x</code>\n` +
        `Example: <code>/logs CHARGER_001</code>\n\n` +
        `💡 Logs include: transactions, battery changes, status updates, and system events.\n\n` +
        `<i>Evidence first, then action.</i>`
      );
      return;
    }
  }

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
        `📊 <b>System overview:</b> <code>/status</code>\n` +
        `View all 7 chargers with current status\n\n` +
        `🔧 <b>Charger-specific:</b> <code>/status CHARGER_00x</code>\n` +
        `Examples:\n` +
        `• <code>/status CHARGER_001</code>\n` +
        `• <code>/status CHARGER_002</code>\n` +
        `• <code>/status CHARGER_007</code>\n\n` +
        `💡 <b>Available chargers:</b> CHARGER_001 through CHARGER_007\n\n` +
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

