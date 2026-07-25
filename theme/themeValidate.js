const {
  THEME_SCHEMA_VERSION,
  MAX_THEME_BYTES,
  ALLOWED_FONTS,
  DEFAULT_TOKENS,
  PAGE_IDS,
  PAGE_PROPS,
  COMPONENT_CATALOG,
} = require("./themeRegistry");

const HEX_RE = /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/;
const RGB_RE = /^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*[\d.]+\s*)?\)$/;
const HSL_RE = /^hsla?\(\s*[\d.]+\s*,\s*[\d.]+%\s*,\s*[\d.]+%(?:\s*,\s*[\d.]+\s*)?\)$/;
const LENGTH_RE = /^-?[\d.]+(px|rem|em|%|vh|vw)?$/;
const SHADOW_FORBIDDEN = /(url\s*\(|expression\s*\(|@import|<\/?style|javascript:)/i;

function isSafeColor(value) {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (v.length > 64) return false;
  if (SHADOW_FORBIDDEN.test(v)) return false;
  return HEX_RE.test(v) || RGB_RE.test(v) || HSL_RE.test(v);
}

function isSafeLength(value) {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (v.length > 32) return false;
  if (SHADOW_FORBIDDEN.test(v)) return false;
  return LENGTH_RE.test(v) || v === "0";
}

function isSafeShadow(value) {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (v.length > 200) return false;
  if (SHADOW_FORBIDDEN.test(v)) return false;
  if (v === "none") return true;
  // Allow typical box-shadow: numbers, colors, commas
  return /^[\d.\s,#%()a-zA-Z+-]+$/.test(v);
}

function isSafeFont(value) {
  return typeof value === "string" && ALLOWED_FONTS.includes(value);
}

function isSafeUrl(value) {
  if (value === "" || value == null) return true;
  if (typeof value !== "string" || value.length > 2048) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function propType(group, key) {
  if (group === "color") return "color";
  if (group === "assets") return key === "logo" || key === "favicon" ? "url" : "string";
  if (group === "typography") {
    if (key === "fontFamily" || key === "fontFamilyDisplay") return "font";
    if (key.startsWith("fontWeight") || key === "lineHeight") return "string";
    return "length";
  }
  if (group === "shape") return "length";
  if (group === "elevation") return "shadow";
  return "color";
}

function validatePropValue(type, value, path, errors) {
  if (value == null || value === undefined) return;
  switch (type) {
    case "color":
      if (!isSafeColor(value)) errors.push(`Invalid color at ${path}`);
      break;
    case "length":
      if (!isSafeLength(value)) errors.push(`Invalid length at ${path}`);
      break;
    case "shadow":
      if (!isSafeShadow(value)) errors.push(`Invalid shadow at ${path}`);
      break;
    case "font":
      if (!isSafeFont(value)) errors.push(`Font not allowlisted at ${path}`);
      break;
    case "url":
      if (!isSafeUrl(value)) errors.push(`Invalid URL at ${path}`);
      break;
    case "string":
      if (typeof value !== "string" || value.length > 64 || SHADOW_FORBIDDEN.test(value)) {
        errors.push(`Invalid string at ${path}`);
      }
      break;
    default:
      errors.push(`Unknown type at ${path}`);
  }
}

/**
 * Validate a sparse theme document. Returns { ok, errors, theme }.
 */
function validateTheme(input) {
  const errors = [];

  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["Theme must be an object"], theme: null };
  }

  let raw;
  try {
    raw = JSON.stringify(input);
  } catch {
    return { ok: false, errors: ["Theme is not serializable"], theme: null };
  }
  if (raw.length > MAX_THEME_BYTES) {
    return { ok: false, errors: [`Theme exceeds ${MAX_THEME_BYTES} bytes`], theme: null };
  }

  const theme = {
    version: THEME_SCHEMA_VERSION,
    tokens: {},
    pages: {},
    components: {},
  };

  if (input.version != null && Number(input.version) !== THEME_SCHEMA_VERSION) {
    // Accept and coerce to current version; reject unknown future majors only if > current + buffer
    if (Number(input.version) > THEME_SCHEMA_VERSION + 5) {
      errors.push(`Unsupported theme version: ${input.version}`);
    }
  }

  if (input.tokens && typeof input.tokens === "object") {
    for (const [group, defaults] of Object.entries(DEFAULT_TOKENS)) {
      const incoming = input.tokens[group];
      if (!incoming || typeof incoming !== "object") continue;
      theme.tokens[group] = {};
      for (const key of Object.keys(defaults)) {
        if (incoming[key] === undefined) continue;
        const type = propType(group, key);
        validatePropValue(type, incoming[key], `tokens.${group}.${key}`, errors);
        theme.tokens[group][key] = incoming[key];
      }
      // Reject unknown token keys
      for (const key of Object.keys(incoming)) {
        if (!(key in defaults)) {
          errors.push(`Unknown token key tokens.${group}.${key}`);
        }
      }
    }
    for (const group of Object.keys(input.tokens)) {
      if (!(group in DEFAULT_TOKENS)) {
        errors.push(`Unknown token group: ${group}`);
      }
    }
  }

  if (input.pages && typeof input.pages === "object") {
    for (const [pageId, overrides] of Object.entries(input.pages)) {
      if (!PAGE_IDS.includes(pageId)) {
        errors.push(`Unknown pageId: ${pageId}`);
        continue;
      }
      if (!overrides || typeof overrides !== "object") continue;
      theme.pages[pageId] = {};
      for (const [prop, value] of Object.entries(overrides)) {
        if (!PAGE_PROPS.includes(prop)) {
          errors.push(`Unknown page prop pages.${pageId}.${prop}`);
          continue;
        }
        validatePropValue("color", value, `pages.${pageId}.${prop}`, errors);
        theme.pages[pageId][prop] = value;
      }
    }
  }

  if (input.components && typeof input.components === "object") {
    for (const [category, idsMap] of Object.entries(input.components)) {
      const catalog = COMPONENT_CATALOG[category];
      if (!catalog) {
        errors.push(`Unknown component category: ${category}`);
        continue;
      }
      if (!idsMap || typeof idsMap !== "object") continue;
      theme.components[category] = {};
      for (const [id, props] of Object.entries(idsMap)) {
        if (!catalog.ids.includes(id)) {
          errors.push(`Unknown component id: ${category}.${id}`);
          continue;
        }
        if (!props || typeof props !== "object") continue;
        theme.components[category][id] = {};
        for (const [prop, value] of Object.entries(props)) {
          if (!catalog.props.includes(prop)) {
            errors.push(`Unknown component prop: ${category}.${id}.${prop}`);
            continue;
          }
          const type =
            prop === "radius"
              ? "length"
              : prop === "shadow" || prop === "hoverShadow"
                ? "shadow"
                : "color";
          validatePropValue(type, value, `components.${category}.${id}.${prop}`, errors);
          theme.components[category][id][prop] = value;
        }
      }
    }
  }

  // Strip empty nested objects
  if (Object.keys(theme.tokens).length === 0) delete theme.tokens;
  else {
    for (const g of Object.keys(theme.tokens)) {
      if (Object.keys(theme.tokens[g]).length === 0) delete theme.tokens[g];
    }
    if (Object.keys(theme.tokens).length === 0) delete theme.tokens;
  }
  if (Object.keys(theme.pages).length === 0) delete theme.pages;
  if (Object.keys(theme.components).length === 0) delete theme.components;

  return { ok: errors.length === 0, errors, theme: errors.length === 0 ? theme : null };
}

/**
 * Deep-set / delete by dotted path for reset scope.
 * scope examples: "all", "tokens", "tokens.color.primary", "components.button.addToCart"
 */
function applyResetScope(theme, scope) {
  if (!scope || scope === "all") {
    return { version: THEME_SCHEMA_VERSION };
  }

  const next = JSON.parse(JSON.stringify(theme || { version: THEME_SCHEMA_VERSION }));
  const parts = scope.split(".");

  if (parts.length === 1) {
    delete next[parts[0]];
    return next;
  }

  let cursor = next;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cursor[parts[i]] || typeof cursor[parts[i]] !== "object") {
      return next;
    }
    cursor = cursor[parts[i]];
  }
  delete cursor[parts[parts.length - 1]];

  // Clean empty parents lightly
  return next;
}

module.exports = {
  validateTheme,
  applyResetScope,
  isSafeColor,
  isSafeFont,
  isSafeUrl,
};
