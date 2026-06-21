const assert = require("assert");
const sanitizeMiddleware = require("../middleware/sanitizeMiddleware");

console.log("🔍 Running Sanitizer Middleware Tests...\n");

// Mock Express req, res, next
const runMiddleware = (payload) => {
  const req = {
    body: JSON.parse(JSON.stringify(payload.body || {})),
    query: JSON.parse(JSON.stringify(payload.query || {})),
    params: JSON.parse(JSON.stringify(payload.params || {}))
  };
  const res = {};
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  sanitizeMiddleware(req, res, next);
  return { req, nextCalled };
};

// 1. Test NoSQL Injection Protection
console.log("--- Test 1: NoSQL Injection (Keys starting with $) ---");
const nosqlPayload = {
  body: {
    username: "john_doe",
    password: { $gt: "" },
    roles: ["admin", { $ne: "user" }],
    deepNested: {
      active: true,
      query: {
        $where: "arbitrary-js-here",
        field: "val"
      }
    }
  }
};

const result1 = runMiddleware(nosqlPayload);
try {
  // $gt and $where and $ne should be stripped out
  assert.deepStrictEqual(result1.req.body.password, {});
  assert.deepStrictEqual(result1.req.body.roles, ["admin", {}]);
  assert.deepStrictEqual(result1.req.body.deepNested.query, { field: "val" });
  assert.strictEqual(result1.nextCalled, true);
  console.log("✅ NoSQL Injection keys successfully stripped!");
} catch (err) {
  console.error("❌ NoSQL Injection test failed:", err.message);
  console.error("Actual body:", JSON.stringify(result1.req.body, null, 2));
}

// 2. Test XSS Injection Protection
console.log("\n--- Test 2: XSS Injection (HTML and script tags) ---");
const xssPayload = {
  body: {
    comment: "Hello <script>alert('xss')</script> World!",
    htmlField: "<div>Safe Div</div> <img src=x onerror=alert('img')>",
    hrefAttr: "javascript:alert('href')",
    eventAttr: 'Click <button onclick="doSomething()">Here</button>'
  }
};

const result2 = runMiddleware(xssPayload);
try {
  assert.strictEqual(result2.req.body.comment, "Hello  World!");
  assert.strictEqual(result2.req.body.htmlField, "Safe Div ");
  assert.strictEqual(result2.req.body.hrefAttr, "alert('href')");
  assert.strictEqual(result2.req.body.eventAttr, "Click Here");
  console.log("✅ XSS Injection scripts and event handlers successfully stripped!");
} catch (err) {
  console.error("❌ XSS Injection test failed:", err.message);
  console.error("Actual body:", JSON.stringify(result2.req.body, null, 2));
}

console.log("\n🚀 Sanitizer Verification Complete!");
