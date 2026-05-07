const path = require('path');

const ERP_ROOT = path.resolve(__dirname);

module.exports = {
  apps: [
    {
      name: "erp-server",
      cwd: path.join(ERP_ROOT, "packages/server"),
      script: "dist/index.js",
      env: {
        PORT: "3000",
        NODE_ENV: "production",
        DB_PATH: path.join(ERP_ROOT, "packages/server/data/erp.db"),
        JWT_SECRET: "erp-core-jwt-secret-2026",
        TENANT_ID: "t_001",
        KB_URL: "http://127.0.0.1:3100",
        SIYUAN_URL: "http://127.0.0.1:54511",
        SIYUAN_API_TOKEN: "w8qyx729d7pm5zqn",
        TELEGRAM_BOT_TOKEN: "8797457294:AAETDne97sVGENdcd_yrXV8_xSRkshNKwfQ",
        ORCHESTRATOR_URL: "http://localhost:54516",
        LLM_PROVIDERS_ENCRYPTION_KEY: "erp-core-llm-encryption-key-2026!!"
      }
    },
    {
      name: "knowledge-base",
      cwd: path.join(ERP_ROOT, "packages/knowledge-base"),
      script: "dist/index.js",
      env: {
        PORT: "3100",
        NODE_ENV: "production",
        DB_PATH: path.join(ERP_ROOT, "packages/knowledge-base/data/kb.db")
      }
    },
    {
      name: "sync-siyuan",
      cwd: path.join(ERP_ROOT, "packages/sync-siyuan"),
      script: "dist/index.js",
      env: {
        SYNC_PORT: "54513",
        SIYUAN_URL: "http://127.0.0.1:54511",
        SIYUAN_API_TOKEN: "w8qyx729d7pm5zqn",
        KB_URL: "http://127.0.0.1:3100",
        SYNC_INTERVAL: "60000"
      }
    },
    {
      name: "ai-orchestrator",
      cwd: path.join(ERP_ROOT, "packages/ai-orchestrator"),
      script: "dist/index.js",
      env: {
        PORT: "54516",
        NODE_ENV: "production",
        KB_URL: "http://127.0.0.1:3100",
        SIYUAN_URL: "http://127.0.0.1:54511",
        SIYUAN_API_TOKEN: "w8qyx729d7pm5zqn",
        AGENT_LOOP_ENABLED: "false",
        LLM_API_KEY: "sk-759b9e5043b4480c84a87eb59d5b814f",
        LLM_BASE_URL: "https://api.deepseek.com/v1",
        LLM_MODEL: "deepseek-chat"
      }
    },
    // system-agent, task-manager, ai-docs-updater, telegram-bot
    // are not built yet — add them to ecosystem when they exist
  ]
};
