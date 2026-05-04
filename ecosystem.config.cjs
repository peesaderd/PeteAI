module.exports = {
  apps: [{
    name: "erp-server",
    script: "/root/erp-core/erp-core/packages/server/dist/index.js",
    cwd: "/root/erp-core/erp-core",
    env: {
      TELEGRAM_BOT_TOKEN: "8797457294:AAETDne97sVGENdcd_yrXV8_xSRkshNKwfQ",
      ORCHESTRATOR_URL: "http://localhost:54516",
      NODE_ENV: "production"
    }
  }]
};
