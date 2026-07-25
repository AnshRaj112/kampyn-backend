const { validateTheme } = require("../theme/themeValidate");
const { resolveTheme, flattenToCssVars, brandingToThemeTokens } = require("../theme/themeResolve");

function assert(condition, message) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exitCode = 1;
  } else {
    console.log("ok:", message);
  }
}

// Valid sparse theme
{
  const { ok, errors, theme } = validateTheme({
    version: 1,
    tokens: { color: { primary: "#112233" } },
    components: { button: { addToCart: { background: "#ff0000" } } },
  });
  assert(ok, "accepts valid sparse theme");
  assert(theme.tokens.color.primary === "#112233", "preserves primary");
  assert(errors.length === 0, "no errors on valid theme");
}

// Reject CSS injection
{
  const { ok } = validateTheme({
    tokens: { color: { primary: "red; } html { background: url(javascript:alert(1))" } },
  });
  assert(!ok, "rejects unsafe color string");
}

// Reject unknown keys
{
  const { ok, errors } = validateTheme({
    tokens: { color: { neonGlow: "#fff" } },
  });
  assert(!ok, "rejects unknown token key");
  assert(errors.some((e) => e.includes("neonGlow")), "mentions unknown key");
}

// Branding adapter + resolve
{
  const sparse = brandingToThemeTokens({
    primaryColor: "#aabbcc",
    font: "Inter",
  });
  const resolved = resolveTheme(sparse, null);
  assert(resolved.tokens.color.primary === "#aabbcc", "branding maps to primary");
  assert(resolved.tokens.typography.fontFamily === "Inter", "branding maps font");
  assert(resolved.tokens.color.secondary === "#4ea199", "defaults fill secondary");

  const vars = flattenToCssVars(resolved, sparse);
  assert(vars["--kampyn-color-primary"] === "#aabbcc", "emits kampyn css var");
  assert(vars["--primary-color"] === "#aabbcc", "emits legacy bridge var");
}

if (process.exitCode) {
  console.error("theme unit checks failed");
  process.exit(1);
} else {
  console.log("All theme unit checks passed");
}
