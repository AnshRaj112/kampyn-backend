const assert = require("assert");
const path = require("path");

const cachePath = path.resolve(__dirname, "../utils/tenantCache.js");

function loadCache(environment) {
  const original = {
    NODE_ENV: process.env.NODE_ENV,
    REDIS_URI: process.env.REDIS_URI,
  };
  Object.assign(process.env, environment);
  if (environment.NODE_ENV === undefined) delete process.env.NODE_ENV;
  if (environment.REDIS_URI === undefined) delete process.env.REDIS_URI;
  delete require.cache[cachePath];
  const cache = require(cachePath);
  return { cache, restore() {
    if (original.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original.NODE_ENV;
    if (original.REDIS_URI === undefined) delete process.env.REDIS_URI;
    else process.env.REDIS_URI = original.REDIS_URI;
    delete require.cache[cachePath];
  } };
}

async function run() {
  const development = loadCache({ NODE_ENV: "development", REDIS_URI: undefined });
  try {
    const readiness = await development.cache.initialize();
    assert.deepStrictEqual(readiness, { configured: false, required: false, connected: false, mode: "memory" });
    await development.cache.set("tenant:test", { enabled: true });
    assert.deepStrictEqual(await development.cache.get("tenant:test"), { enabled: true });
  } finally {
    development.restore();
  }

  const production = loadCache({ NODE_ENV: "production", REDIS_URI: undefined });
  try {
    await assert.rejects(production.cache.initialize(), /REDIS_URI is required/);
    const readiness = await production.cache.getReadiness();
    assert.strictEqual(readiness.required, true);
    assert.strictEqual(readiness.connected, false);
  } finally {
    production.restore();
  }

  console.log("Redis shared-state regression tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
