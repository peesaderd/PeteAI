# OpenHands + OpenCode Go API Integration

## Structure

```
/
├── opencode.json              # OpenCode CLI config (provider: opencode-go, model: deepseek-v4-flash)
├── openhands-settings.json    # OpenHands LLM config (OpenAI-compatible proxy via OpenCode Go API)
├── patches/
│   └── docker_runtime.py.patch  # Patch for runtime container
├── docker-compose.yml         # Docker Compose for OpenHands + runtime
├── .gitignore
└── README.md
```

## Usage

1. Replace `YOUR_API_KEY_HERE` in all config files with your actual OpenCode API key
2. Run `docker compose up -d` to start OpenHands
3. Apply patch to runtime if needed:
   ```bash
   cd /path/to/openhands && git apply patches/docker_runtime.py.patch
   ```

## Endpoints

| Service | URL |
|---|---|
| OpenHands UI | http://localhost:3001 |
| LLM API (OpenCode Go) | https://opencode.ai/zen/go/v1 |
| Model | openai/deepseek-v4-flash |
