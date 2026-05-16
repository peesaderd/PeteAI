module.exports = {
  apps: [
    {
      name: "image-gen",
      cwd: "/home/openhands/erp-core/erp-core/dify-modules/image-gen",
      script: "/usr/bin/docker",
      args: "run --rm --name dify-image-gen -v /home/openhands/erp-core/erp-core/dify-modules/image-gen/workflow_dsl.json:/app/workflow_dsl.json alpine:latest sh -c 'echo Image Gen module loaded && sleep infinity'",
      interpreter: "none",
      restart_delay: 5000,
      max_restarts: 5,
      autorestart: true
    }
  ]
};
