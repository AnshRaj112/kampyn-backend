const assert = require("assert");

if (!process.env.REDIS_URI) {
  console.log("Redis integration test skipped: REDIS_URI is not configured.");
  process.exit(0);
}

process.env.NODE_ENV = "production";
const tenantCache = require("../utils/tenantCache");

async function run() {
  await tenantCache.initialize();
  const key = `kampyn:test:redis:${process.pid}:${Date.now()}`;
  const value = { shared: true };
  await tenantCache.set(key, value, 10000);
  assert.deepStrictEqual(await tenantCache.get(key), value);
  await tenantCache.del(key);
  assert.strictEqual(await tenantCache.get(key), null);
  console.log("Redis integration test passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
