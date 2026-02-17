module.exports = {
  apps: [
    {
      name: "kampyn-api",
      script: "scripts/start-server.js",
      instances: "max",
      exec_mode: "cluster",
      watch: false,
      max_memory_restart: "700M",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
