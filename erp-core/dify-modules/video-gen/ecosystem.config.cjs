module.exports = {
  apps: [{
    name: "video-gen",
    cwd: "/home/openhands/erp-core/erp-core/dify-modules/video-gen",
    script: "/usr/bin/python3",
    args: "/home/openhands/erp-core/erp-core/dify-modules/video-gen/server.py",
    interpreter: "none",
    restart_delay: 5000,
    max_restarts: 10,
    autorestart: true,
    env: {
      PYTHONUNBUFFERED: "1"
    }
  }]
};
