module.exports = {
  apps: [{
    name: "ai-orchestrator",
    script: "dist/index.js",
    cwd: "/workspace/PeteAI/erp-core/packages/ai-orchestrator",
    env: {
      ORCHESTRATOR_PORT: "54516",
      NODE_ENV: "production",
      AGENT_LOOP_V2_ENABLED: "true",
      SIYUAN_URL: "http://89.167.82.205:54511",
      SIYUAN_TOKEN: "w8qyx729d7pm5zqn",
      LLM_API_KEY: "sk-762b2269fca7488dace6b8c1fb4afa42",
      LLM_BASE_URL: "https://api.deepseek.com/v1"
    },
    kill_timeout: 5000,
    listen_timeout: 3000
  }]
};
