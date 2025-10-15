# 🤖 DOBI - Telegram Bot con Claude AI

Bot de Telegram inteligente que combina comandos específicos para consultar APIs con conversación natural potenciada por Claude AI de Anthropic.

## 🌟 Características

- ✅ **Conversación Natural**: Usa Claude AI para responder preguntas sobre DePIN, RWAs y blockchain
- ✅ **Comandos de Status**: Consulta el estado de cargadores desde tu API
- ✅ **Detección Inteligente**: Distingue automáticamente entre conversación y comandos
- ✅ **Contexto Conversacional**: Recuerda mensajes recientes para conversaciones coherentes
- ✅ **Rate Limiting**: Protección contra spam
- ✅ **Error Handling**: Manejo robusto de errores con mensajes útiles
- ✅ **Formateo Rico**: Mensajes con HTML, emojis y formato profesional

## 📋 Prerequisitos

- Node.js 18 o superior
- Cuenta de Telegram
- API Key de Anthropic (Claude)
- API de cargadores funcionando

## 🚀 Instalación

1. **Clonar o crear el proyecto**
```bash
mkdir dobi-bot
cd dobi-bot
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**

Crea un archivo `.env` basado en `.env.example`:

```bash
cp .env.example .env
```

Edita `.env` con tus credenciales:

```env
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxx
API_BASE_URL=https://tu-api.com
```

### 🔑 Obtener credenciales

**Telegram Bot Token:**
1. Habla con [@BotFather](https://t.me/botfather) en Telegram
2. Envía `/newbot`
3. Sigue las instrucciones
4. Copia el token que te da

**Anthropic API Key:**
1. Ve a [console.anthropic.com](https://console.anthropic.com/)
2. Crea una cuenta o inicia sesión
3. Ve a "API Keys"
4. Crea una nueva API key
5. Copia la key (empieza con `sk-ant-`)

## 🎮 Uso

**Iniciar el bot:**
```bash
npm start
```

**Modo desarrollo (auto-reload):**
```bash
npm run dev
```

## 📱 Comandos del Bot

### Consultas
| Comando | Descripción |
|---------|-------------|
| `/status` | Ver todos los cargadores con información detallada |
| `/status charger_001` | Ver detalle completo de un cargador específico |
| `/logs` | Ver logs del sistema (últimos 10) |
| `/logs charger_001` | Ver logs de un cargador específico |
| `/logs --blockchain` | Ver logs incluyendo datos de blockchain |

### Acciones
| Comando | Descripción |
|---------|-------------|
| `/action charger_001 turn_on` | Encender un cargador |
| `/action charger_001 turn_off` | Apagar un cargador |
| `/action charger_001 restart` | Reiniciar un cargador |
| `/action charger_001 recharge_battery` | Recargar batería al 100% |
| `/action charger_001 create_ticket` | Crear ticket de soporte |
| `/action charger_001 pay_costs` | Pagar costos operativos (40% balance) |
| `/action charger_001 send_to_owner` | Enviar balance al propietario |

### Transacciones
| Comando | Descripción |
|---------|-------------|
| `/tx charger_001` | Simular transacción con monto aleatorio |
| `/tx charger_001 50.5` | Simular transacción por $50.5 |

### Generales
| Comando | Descripción |
|---------|-------------|
| `/start` | Iniciar el bot y ver bienvenida |
| `/help` | Ver ayuda y todos los comandos |
| `/clear` | Limpiar historial de conversación |

## 💬 Conversación Natural

Simplemente escribe de forma natural:

```
Usuario: ¿Qué es DePIN?
DOBI: DePIN (Decentralized Physical Infrastructure Networks) son redes...

Usuario: ¿Y cómo funciona con blockchain?
DOBI: Las redes DePIN usan blockchain para...

Usuario: muéstrame el status de charger_001
DOBI: [Muestra información del cargador]
```

## 🏗️ API - DOBI Electric Chargers

**Base URL:** `https://api-aleph.dobi.guru`

### Endpoints principales:

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/chargers/detailed` | Lista todos los cargadores con info detallada |
| GET | `/api/chargers/{id}` | Detalle de un cargador específico |
| POST | `/api/chargers/{id}/action` | Ejecutar acción (turn_on, turn_off, etc) |
| POST | `/api/chargers/{id}/simulate_transaction` | Simular transacción |
| GET | `/api/logs` | Obtener logs del sistema |

Ver documentación completa en [`API_REAL.md`](./API_REAL.md)

**Valores de status:**
- `available` / `idle` - Disponible (🟢)
- `charging` - En uso (⚡️)
- `offline` / `error` - Fuera de línea (🔴)
- `maintenance` - Mantenimiento (🟡)

## 🔧 Configuración Avanzada

### Personalidad de DOBI

Edita `DOBI_SYSTEM_PROMPT` en `index.js` para cambiar la personalidad del bot.

### Contexto Conversacional

Por defecto, mantiene los últimos 10 mensajes. Modifica `MAX_CONTEXT_MESSAGES`:

```javascript
const MAX_CONTEXT_MESSAGES = 10; // Ajustar según necesites
```

### Rate Limiting

Modifica el tiempo entre mensajes:

```javascript
const RATE_LIMIT_MS = 1000; // Milisegundos
```

## 🐛 Troubleshooting

### El bot no responde
- Verifica que el token de Telegram sea correcto
- Comprueba que el bot esté corriendo (`npm start`)
- Revisa los logs en la consola

### Claude no responde (usa fallback)
- Verifica que `ANTHROPIC_API_KEY` sea válida
- Comprueba tu balance en [console.anthropic.com](https://console.anthropic.com/)
- Revisa los logs para ver errores específicos

### La API no responde
- Verifica que `API_BASE_URL` sea correcta (sin `/` final)
- Comprueba que la API esté funcionando (prueba con curl/Postman)
- Revisa que los endpoints sigan el formato esperado

### Error "dropPendingUpdates"
Es normal al reiniciar el bot. Ignora mensajes antiguos.

## 📊 Monitoreo

El bot muestra información útil al iniciar:

```
✅ DOBI está online y listo para trabajar
📱 Bot username: @tu_bot
🤖 Claude AI: Activado
🔌 API: https://tu-api.com
```

## 🔒 Seguridad

- ✅ Nunca compartas tu `.env` o tokens
- ✅ Usa `.gitignore` para excluir archivos sensibles
- ✅ Rota tus API keys periódicamente
- ✅ Implementa autenticación en tu API si es necesario

## 📚 Referencias

- [Documentación de Claude](https://docs.anthropic.com/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Telegraf Framework](https://telegraf.js.org/)
- [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript)

## 🤝 Contribuir

Si encuentras bugs o tienes sugerencias:
1. Abre un issue
2. Propón mejoras
3. Comparte tu experiencia

## 📝 Licencia

MIT License - Úsalo libremente para tus proyectos.

---

**Hecho con ⚡️ por el equipo DOBI**

