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
    {
      name: "system-agent",
      cwd: path.join(ERP_ROOT, "packages/system-agent"),
      script: "dist/index.js",
      env: {
        PORT: "54520",
        NODE_ENV: "production"
      }
    },
    {
      name: "task-manager",
      cwd: path.join(ERP_ROOT, "packages/task-manager"),
      script: "dist/index.js",
      env: {
        PORT: "54519",
        NODE_ENV: "production"
      }
    },
    {
      name: "ai-docs-updater",
      cwd: path.join(ERP_ROOT, "packages/ai-docs-updater"),
      script: "dist/index.js",
      env: {
        AI_DOCS_PORT: "54517",
        SIYUAN_URL: "http://127.0.0.1:54511",
        SIYUAN_API_TOKEN: "w8qyx729d7pm5zqn",
        ERP_ROOT: ERP_ROOT,
        UPDATE_INTERVAL: "300000"
      }
    },
    {
      name: "telegram-bot",
      cwd: path.join(ERP_ROOT, "packages/telegram-bot"),
      script: "dist/index.js",
      env: {
        TELEGRAM_BOT_TOKEN: "8635403645:AAEY_O9EoaStBI6JI8xi3OW38Tgspf8orBI",
        ORCHESTRATOR_URL: "http://127.0.0.1:54516",
        BOT_LANGUAGE: "th",
        WEBHOOK_PORT: "54521",
        WEBHOOK_PATH: "/webhook"
      }
    }
  ]
};
