module.exports = {
  apps: [
    {
      name: "erp-server",
      cwd: "/root/erp-core/erp-core/packages/server",
      script: "dist/index.js",
      env: {
        PORT: "3000",
        NODE_ENV: "production",
        DB_PATH: "/root/erp-core/erp-core/packages/server/data/erp.db",
        JWT_SECRET: "erp-core-jwt-secret-2026",
        TENANT_ID: "t_001",
        KB_URL: "http://127.0.0.1:3100",
        SIYUAN_URL: "http://127.0.0.1:54511",
        SIYUAN_API_TOKEN: "w8qyx729d7pm5zqn"
      }
    },
    {
      name: "knowledge-base",
      cwd: "/root/erp-core/erp-core/packages/knowledge-base",
      script: "dist/index.js",
      env: {
        PORT: "3100",
        NODE_ENV: "production",
        DB_PATH: "/root/erp-core/erp-core/packages/knowledge-base/data/kb.db"
      }
    },
    {
      name: "sync-siyuan",
      cwd: "/root/erp-core/erp-core/packages/sync-siyuan",
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
      cwd: "/root/erp-core/erp-core/packages/ai-orchestrator",
      script: "dist/index.js",
      env: {
        PORT: "54516",
        NODE_ENV: "production",
        KB_URL: "http://127.0.0.1:3100",
        SIYUAN_URL: "http://127.0.0.1:54511",
        SIYUAN_API_TOKEN: "w8qyx729d7pm5zqn"
      }
    },
    {
      name: "system-agent",
      cwd: "/root/erp-core/erp-core/packages/system-agent",
      script: "dist/index.js",
      env: {
        PORT: "54520",
        NODE_ENV: "production"
      }
    },
    {
      name: "task-manager",
      cwd: "/root/erp-core/erp-core/packages/task-manager",
      script: "dist/index.js",
      env: {
        PORT: "54519",
        NODE_ENV: "production"
      }
    },
    {
      name: "ai-docs-updater",
      cwd: "/root/erp-core/erp-core/packages/ai-docs-updater",
      script: "dist/index.js",
      env: {
        AI_DOCS_PORT: "54517",
        SIYUAN_URL: "http://127.0.0.1:54511",
        SIYUAN_API_TOKEN: "w8qyx729d7pm5zqn",
        ERP_ROOT: "/root/erp-core/erp-core",
        UPDATE_INTERVAL: "300000"
      }
    }
  ]
};
