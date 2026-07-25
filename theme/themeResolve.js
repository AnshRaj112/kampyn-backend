const {
  getDefaultTheme,
  DEFAULT_TOKENS,
  tokenCssVar,
  pageCssVar,
  componentCssVar,
  THEME_SCHEMA_VERSION,
} = require("./themeRegistry");

function deepMerge(base, overlay) {
  if (!overlay || typeof overlay !== "object") return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(overlay)) {
    if (v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object") {
      out[k] = deepMerge(base[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Map legacy Tenant.branding into a sparse theme tokens patch.
 */
function brandingToThemeTokens(branding) {
  branding = branding || {};
  const tokens = { color: {}, typography: {}, assets: {} };
  if (branding.primaryColor) tokens.color.primary = branding.primaryColor;
  if (branding.secondaryColor) tokens.color.secondary = branding.secondaryColor;
  if (branding.backgroundColor) tokens.color.background = branding.backgroundColor;
  if (branding.font) tokens.typography.fontFamily = branding.font;
  if (branding.logo !== undefined) tokens.assets.logo = branding.logo;
  if (branding.favicon !== undefined) tokens.assets.favicon = branding.favicon;

  if (Object.keys(tokens.color).length === 0) delete tokens.color;
  if (Object.keys(tokens.typography).length === 0) delete tokens.typography;
  if (Object.keys(tokens.assets).length === 0) delete tokens.assets;
  if (Object.keys(tokens).length === 0) return null;

  return { version: THEME_SCHEMA_VERSION, tokens };
}

/**
 * Project theme tokens back to legacy branding shape for backward compatibility.
 */
function themeToBranding(theme, existingBranding) {
  existingBranding = existingBranding || {};
  const tokens = theme?.tokens || {};
  const color = tokens.color || {};
  const typography = tokens.typography || {};
  const assets = tokens.assets || {};

  return {
    logo: assets.logo !== undefined ? assets.logo : existingBranding.logo || "",
    favicon: assets.favicon !== undefined ? assets.favicon : existingBranding.favicon || "",
    primaryColor: color.primary || existingBranding.primaryColor || DEFAULT_TOKENS.color.primary,
    secondaryColor: color.secondary || existingBranding.secondaryColor || DEFAULT_TOKENS.color.secondary,
    font: typography.fontFamily || existingBranding.font || DEFAULT_TOKENS.typography.fontFamily,
    backgroundColor:
      color.background !== undefined
        ? color.background
        : existingBranding.backgroundColor || DEFAULT_TOKENS.color.background,
  };
}

/**
 * Merge sparse tenant theme with defaults. Optionally fold legacy branding when theme is empty.
 */
function resolveTheme(sparseTheme, branding) {
  const defaults = getDefaultTheme();
  let sparse = sparseTheme && typeof sparseTheme === "object" ? sparseTheme : null;

  if (!sparse || (!sparse.tokens && !sparse.pages && !sparse.components)) {
    const fromBranding = brandingToThemeTokens(branding);
    sparse = fromBranding || { version: THEME_SCHEMA_VERSION };
  } else if (branding && (!sparse.tokens?.assets || !sparse.tokens?.color?.primary)) {
    // Fill gaps from branding without overwriting explicit theme tokens
    const fromBranding = brandingToThemeTokens(branding);
    if (fromBranding) {
      sparse = {
        ...sparse,
        tokens: deepMerge(fromBranding.tokens || {}, sparse.tokens || {}),
      };
      // Prefer explicit theme over branding: deepMerge(base, overlay) — overlay wins
      sparse.tokens = deepMerge(fromBranding.tokens || {}, sparse.tokens || {});
    }
  }

  return {
    version: THEME_SCHEMA_VERSION,
    tokens: deepMerge(defaults.tokens, sparse.tokens || {}),
    pages: sparse.pages || {},
    components: sparse.components || {},
  };
}

/**
 * Flatten resolved + sparse overrides into CSS custom property map.
 * Always emits full token set; emits page/component vars only when overridden.
 */
function flattenToCssVars(resolved, sparse) {
  const vars = {};
  const tokens = resolved.tokens || DEFAULT_TOKENS;

  for (const [group, values] of Object.entries(tokens)) {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined || value === null || value === "") continue;
      vars[tokenCssVar(group, key)] = String(value);
    }
  }

  const pages = sparse?.pages || resolved.pages || {};
  for (const [pageId, overrides] of Object.entries(pages)) {
    for (const [prop, value] of Object.entries(overrides || {})) {
      if (value == null || value === "") continue;
      vars[pageCssVar(pageId, prop)] = String(value);
    }
  }

  const components = sparse?.components || resolved.components || {};
  for (const [category, ids] of Object.entries(components)) {
    for (const [id, props] of Object.entries(ids || {})) {
      for (const [prop, value] of Object.entries(props || {})) {
        if (value == null || value === "") continue;
        vars[componentCssVar(category, id, prop)] = String(value);
      }
    }
  }

  // Legacy bridge vars
  if (tokens.color?.primary) {
    vars["--primary-color"] = tokens.color.primary;
  }
  if (tokens.color?.secondary) {
    vars["--secondary-color"] = tokens.color.secondary;
  }
  if (tokens.color?.background) {
    vars["--background-color"] = tokens.color.background;
  }
  if (tokens.typography?.fontFamily) {
    vars["--font-family"] = tokens.typography.fontFamily;
  }

  return vars;
}

function mergeThemeSparse(base, patch) {
  const a = base && typeof base === "object" ? base : { version: THEME_SCHEMA_VERSION };
  const b = patch && typeof patch === "object" ? patch : {};
  return {
    version: THEME_SCHEMA_VERSION,
    tokens: deepMerge(a.tokens || {}, b.tokens || {}),
    pages: deepMerge(a.pages || {}, b.pages || {}),
    components: deepMerge(a.components || {}, b.components || {}),
  };
}

function stripEmpty(theme) {
  const cleaned = JSON.parse(JSON.stringify(theme || {}));
  cleaned.version = THEME_SCHEMA_VERSION;

  const prune = (obj) => {
    if (!obj || typeof obj !== "object") return obj;
    for (const k of Object.keys(obj)) {
      if (obj[k] && typeof obj[k] === "object" && !Array.isArray(obj[k])) {
        prune(obj[k]);
        if (Object.keys(obj[k]).length === 0) delete obj[k];
      } else if (obj[k] === undefined || obj[k] === null || obj[k] === "") {
        delete obj[k];
      }
    }
    return obj;
  };

  if (cleaned.tokens) prune(cleaned.tokens);
  if (cleaned.pages) prune(cleaned.pages);
  if (cleaned.components) prune(cleaned.components);
  if (cleaned.tokens && Object.keys(cleaned.tokens).length === 0) delete cleaned.tokens;
  if (cleaned.pages && Object.keys(cleaned.pages).length === 0) delete cleaned.pages;
  if (cleaned.components && Object.keys(cleaned.components).length === 0) delete cleaned.components;
  return cleaned;
}

module.exports = {
  deepMerge,
  brandingToThemeTokens,
  themeToBranding,
  resolveTheme,
  flattenToCssVars,
  mergeThemeSparse,
  stripEmpty,
};
