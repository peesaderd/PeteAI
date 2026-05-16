module.exports = {
  apps: [{
    name: "ai-orchestrator",
    script: "./dist/index.js",
    env: {
      MAINTENANCE_KEY: "openhands-maintenance-key-2026"
    },
    kill_timeout: 15000,
    listen_timeout: 10000
  }]
};
