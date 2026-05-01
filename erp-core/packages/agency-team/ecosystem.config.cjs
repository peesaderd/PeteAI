module.exports = {
  apps: [{
    name: 'agency-team',
    script: 'dist/index.js',
    cwd: '/root/erp-core/erp-core/packages/agency-team',
    env: {
      PORT: '54515',
      NODE_ENV: 'production',
    },
    watch: false,
    max_memory_restart: '500M',
    error_file: '/var/log/agency-team/error.log',
    out_file: '/var/log/agency-team/out.log',
    merge_logs: true,
    autorestart: true,
  }]
};
