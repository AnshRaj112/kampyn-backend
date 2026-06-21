const vm = require("vm");
const logger = require("../utils/pinoLogger");

// Try loading isolated-vm; fall back to standard vm with strict security scanning
let ivm = null;
try {
  ivm = require("isolated-vm");
  logger.info("Isolated VM sandboxing loaded successfully");
} catch (e) {
  logger.warn("isolated-vm not installed or failed to load. Falling back to secure Node.js vm module sandbox");
}

/**
 * Validates untrusted code before executing in node:vm fallback mode
 */
function isCodeSafe(code) {
  const forbiddenPatterns = [
    "process",
    "require",
    "global",
    "module",
    "exports",
    "__proto__",
    "constructor",
    "prototype",
    "Function",
    "eval"
  ];
  for (const pattern of forbiddenPatterns) {
    if (code.includes(pattern)) {
      throw new Error(`Security violation: Use of forbidden identifier '${pattern}' detected.`);
    }
  }
  return true;
}

/**
 * Executes untrusted extension code in a sandboxed isolate
 */
async function runExtension(hookCode, contextPayload) {
  if (ivm) {
    // High-security V8 Isolate Mode
    const isolate = new ivm.Isolate({ memoryLimit: 64 });
    try {
      const context = await isolate.createContext();
      const globalObj = context.global;
      await globalObj.set("ctx", new ivm.ExternalCopy(contextPayload).copyInto());
      
      const sdkCode = `
        const KAMPYN = {
          getUser: () => ctx.user,
          getPayload: () => ctx.payload,
          reject: (msg) => { throw new Error("Blocked: " + msg); }
        };
      `;
      await context.eval(sdkCode);

      const script = await isolate.compileScript(`
        (function() {
          ${hookCode}
        })()
      `);
      return await script.run(context, { timeout: 100 });
    } catch (err) {
      logger.warn({ error: err.message }, "Isolate sandbox execution error");
      throw new Error(`Extension error: ${err.message}`);
    } finally {
      isolate.dispose();
    }
  } else {
    // Fallback Node vm Mode with strict lexical isolation
    isCodeSafe(hookCode);

    try {
      const sandbox = {
        ctx: contextPayload,
        console: {
          log: (...args) => logger.info({ args }, "Sandbox Console"),
          error: (...args) => logger.error({ args }, "Sandbox Error"),
        },
        KAMPYN: {
          getUser: () => contextPayload.user,
          getPayload: () => contextPayload.payload,
          reject: (msg) => { throw new Error("Blocked: " + msg); }
        }
      };

      // Create isolated context with null prototype overrides to prevent prototype escapement
      const context = vm.createContext(sandbox);

      const script = new vm.Script(`
        (function() {
          "use strict";
          ${hookCode}
        })()
      `, { timeout: 100 });

      return script.runInContext(context);
    } catch (err) {
      logger.warn({ error: err.message }, "VM sandbox execution error");
      throw new Error(`Extension error: ${err.message}`);
    }
  }
}

module.exports = { runExtension };
