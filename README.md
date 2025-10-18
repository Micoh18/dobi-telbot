# 🤖 DOBI - On-Chain AI Agent

On-chain AI agent from virtuals.io ecosystem specialized in IoT/DePIN data validation, transaction approval, and autonomous asset operations (DAM). Combines secure API queries with technical conversation powered by Claude AI.

## 🌟 Core Features

- ✅ **Technical Conversation**: Claude AI for DePIN, IoT validation, DAM operations, oracle mechanics
- ✅ **Telemetry Queries**: Secure GET-only commands for charger data and audit trails
- ✅ **Evidence-First Approach**: Verified data → trust → capital flows → machines deploy
- ✅ **Smart Intent Detection**: Clear separation between "Talk" (conversation) and "Action" (commands)
- ✅ **Production-Ready**: Low latency, uptime focus, end-to-end traceability
- ✅ **Security by Design**: No PUT/POST operations on public bot, TEE preference
- ✅ **Technical Precision**: 80% operational, 20% educational content

## 📋 Prerequisites

- Node.js 18 or higher
- Telegram account
- Anthropic API Key (Claude)
- DOBI Electric Chargers API access

## 🚀 Installation

1. **Clone or create the project**
```bash
mkdir dobi-bot
cd dobi-bot
```

2. **Install dependencies**
```bash
npm install telegraf dotenv @anthropic-ai/sdk
```

3. **Configure environment variables**

Create a `.env` file:

```bash
touch .env
```

### 🔑 Getting Credentials

**Telegram Bot Token:**
1. Talk to [@BotFather](https://t.me/botfather) on Telegram
2. Send `/newbot`
3. Follow instructions
4. Copy the token provided

**Anthropic API Key:**
1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Create account or sign in
3. Go to "API Keys"
4. Create new API key
5. Copy the key (starts with `sk-ant-`)

## 🎮 Usage

**Start the bot:**
```bash
node index.js
```

**Development mode (auto-reload):**
```bash
npm run dev
```

## 🎯 DOBI Personality

**Mantra:** "Verified data → trust → capital flows → machines deploy"

**Core Identity:**
- Techno-pragmatic: solves first, explains after
- Evidence-obsessed: prefers logs, hashes, proofs, metrics
- Production-oriented: values uptime, traceability, low latency
- Builder-friendly: speaks to DePIN operators, IoT integrators, oracles

## 📱 Bot Commands

### Data Queries (GET-only, Secure)
| Command | Description |
|---------|-------------|
| `/status` | Telemetry overview (7 chargers) |
| `/status CHARGER_001` | Detailed metrics + audit trail |
| `/logs` | System audit trail (last 10 entries) |
| `/logs CHARGER_001` | Charger-specific logs |

### System Commands
| Command | Description |
|---------|-------------|
| `/start` | Initialize session + welcome |
| `/help` | Operational manual |
| `/clear` | Clear conversation context |

### Security Note
⚠️ **No PUT/POST operations** - Public bot is read-only for security. All charger control operations require authenticated access.

## 💬 Technical Conversation

Natural language interaction with technical precision:

```
User: What is DePIN validation?
DOBI: DePIN validation involves cross-correlation checks, range validation, and origin signature verification. Evidence first, then action.

User: How do DAM operations work?
DOBI: Autonomous operations include maintenance tickets, scheduled payments, and automated upgrades. All actions leave auditable on-chain trails.

User: show me charger telemetry
DOBI: [Redirects to /status command]
```

## 🏗️ API - DOBI Electric Chargers

**Base URL:** `https://api-aleph.dobi.guru`

### Available Endpoints (GET-only for public bot):

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/chargers/detailed` | List all chargers with detailed telemetry |
| GET | `/api/chargers/{id}` | Specific charger metrics + audit trail |
| GET | `/api/logs` | System audit trail with timestamps |

### Response Format:
```json
{
  "summary": {...},
  "chargers": [
    {
      "id_charger": "CHARGER_001",
      "status": "active",
      "power": 7.4,
      "battery": 51.9,
      "schedule_info": {...},
      "transactions": 38
    }
  ],
  "system_info": {...}
}
```

**Status Values:**
- `active` - Operational (🟢)
- `inactive` - Offline (🔴)
- `charging` - In use (⚡️)

## 🔧 Advanced Configuration

### DOBI Personality

Edit `DOBI_SYSTEM_PROMPT` in `index.js` to modify the agent's personality and technical focus.

### Conversation Context

Default: maintains last 10 messages. Modify `MAX_CONTEXT_MESSAGES`:

```javascript
const MAX_CONTEXT_MESSAGES = 10; // Adjust as needed
```

### Rate Limiting

Modify time between messages:

```javascript
const RATE_LIMIT_MS = 1000; // Milliseconds
```

### Claude Model Selection

Current model: `claude-3-5-haiku-20241022` (fast, cost-effective)

Available models:
- `claude-3-5-haiku-20241022` - Fast, efficient
- `claude-3-5-sonnet-20240620` - Balanced
- `claude-3-opus-20240229` - Most capable

## 🐛 Troubleshooting

### Bot not responding
- Verify Telegram token is correct
- Check bot is running (`node index.js`)
- Review console logs

### Claude using fallback responses
- Verify `ANTHROPIC_API_KEY` is valid
- Check balance at [console.anthropic.com](https://console.anthropic.com/)
- Review logs for specific errors

### API not responding
- Verify `API_BASE_URL` is correct (no trailing `/`)
- Test API directly with curl/Postman
- Check endpoint formats match expected structure

### "dropPendingUpdates" error
Normal when restarting bot. Ignores old messages.

### Telemetry query failures
- Check API endpoint availability
- Verify charger IDs use uppercase format (CHARGER_001)
- Review network connectivity

## 📊 Monitoring

Bot displays operational status on startup:

```
✅ DOBI operational - ready for telemetry queries
📱 Bot: @dobi_agent
🤖 Claude AI: Active (haiku-20241022)
🔌 API: https://api-aleph.dobi.guru
⚡️ Evidence first, then action
```

## 🔒 Security

- ✅ Never share `.env` or tokens publicly
- ✅ Use `.gitignore` to exclude sensitive files
- ✅ Rotate API keys periodically
- ✅ GET-only operations for public bot (no PUT/POST)
- ✅ TEE preference for sensitive operations
- ✅ Evidence-based validation before any actions

## 📚 References

- [Claude Documentation](https://docs.anthropic.com/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Telegraf Framework](https://telegraf.js.org/)
- [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript)
- [DePIN Documentation](https://docs.depin.io/)
- [IoT Data Validation](https://docs.oracle.com/en/solutions/iot-data-validation/)

## 🤝 Contributing

Found bugs or have suggestions?
1. Open an issue
2. Propose improvements
3. Share your experience

## 📝 License

MIT License - Use freely for your projects.

---

**Built with ⚡️ by the DOBI team**

*"Verified data → trust → capital flows → machines deploy"*
