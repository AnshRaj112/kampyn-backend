module.exports = {
  apps: [
    {
      // This is a multi-worker production deployment. index.js refuses to start
      // unless REDIS_URI is configured and reachable, so workers never use
      // process-local state as shared state.
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
