# OpenAI Realtime Voice Server

A WebSocket bridge server that connects Twilio Media Streams to OpenAI's Realtime API for ultra-low latency voice AI.

## Architecture

```
[Phone Call] → [Twilio] → [This Server (WebSocket)] → [OpenAI Realtime API]
                                    ↑                            ↓
                              [Audio Response] ← [AI Processing (~300ms)]
```

## Features

- 🚀 **Ultra-low latency**: ~300ms response time vs ~10s with traditional STT→LLM→TTS
- 🎙️ **Real-time voice**: Bidirectional audio streaming
- 🛠️ **Function calling**: Supports order management functions
- 📦 **Session management**: Handles multiple concurrent calls
- 🔒 **Secure**: API key authentication for server-to-server communication

## Deployment

### Railway (Recommended)

1. Create a new project on [Railway](https://railway.app)
2. Connect this repository
3. Set the root directory to `apps/realtime-server`
4. Add environment variables:

```env
OPENAI_API_KEY=sk-...
APP_URL=https://ia-agent-app-app.vercel.app
INTERNAL_API_KEY=your-secret-key
PORT=8080
LOG_LEVEL=info
```

5. Deploy!

### Local Development

```bash
# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env
# Edit .env with your values

# Run in development mode
pnpm dev
```

## API Endpoints

### Health Check

```
GET /health
```

Returns server status and active sessions.

### TwiML Start

```
POST /twiml/start?orgId=xxx
```

Returns TwiML to start a Media Stream connection. Called by Twilio when a call needs voice AI.

### WebSocket

```
ws://host:port/ws/twilio?orgId=xxx&callSid=xxx&from=xxx
```

Twilio Media Stream WebSocket endpoint.

## Integration with Main App

This server communicates with the main Vercel app to:

1. **Fetch org configuration**: Menu, system prompt, settings
2. **Submit orders**: When a customer confirms their order

### Required API Routes on Vercel App

- `GET /api/realtime/org-config?orgId=xxx` - Returns org configuration
- `POST /api/realtime/submit-order` - Receives confirmed orders

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key with Realtime access |
| `APP_URL` | Yes | URL of the main Vercel app |
| `INTERNAL_API_KEY` | No | Secret key for server-to-server auth |
| `PORT` | No | Server port (default: 8080) |
| `HOST` | No | Server host (default: 0.0.0.0) |
| `LOG_LEVEL` | No | Log level: debug, info, warn, error |

## Twilio Configuration

Update your Twilio phone number webhook to point to the TwiML endpoint:

```
Voice Webhook: https://your-railway-app.up.railway.app/twiml/start?orgId=YOUR_ORG_ID
```

## License

Private - IA Agent App
