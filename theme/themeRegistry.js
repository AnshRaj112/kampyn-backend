/**
 * Tenant theme registry — single source of truth for allowed keys, defaults, and CSS var names.
 * Adding a customizable piece = register here; no Mongo migration required.
 */

const THEME_SCHEMA_VERSION = 1;
const MAX_THEME_BYTES = 100 * 1024;

const ALLOWED_FONTS = [
  "Poppins",
  "Inter",
  "Outfit",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
];

const DEFAULT_TOKENS = {
  color: {
    primary: "#01796f",
    secondary: "#4ea199",
    accent: "#01796f",
    background: "#D6E6F3",
    surface: "#ffffff",
    surfaceElevated: "#ffffff",
    border: "#e2e8f0",
    text: "#0f172a",
    textMuted: "#64748b",
    textInverse: "#ffffff",
    success: "#16a34a",
    warning: "#d97706",
    error: "#dc2626",
    info: "#0284c7",
  },
  typography: {
    fontFamily: "Poppins",
    fontFamilyDisplay: "Poppins",
    fontSizeBase: "16px",
    fontWeightNormal: "400",
    fontWeightMedium: "500",
    fontWeightBold: "700",
    lineHeight: "1.5",
  },
  shape: {
    radiusSm: "0.25rem",
    radiusMd: "0.5rem",
    radiusLg: "0.75rem",
    radiusFull: "9999px",
  },
  elevation: {
    shadowSm: "0 1px 2px rgba(15, 23, 42, 0.06)",
    shadowMd: "0 4px 12px rgba(15, 23, 42, 0.08)",
    shadowLg: "0 12px 32px rgba(15, 23, 42, 0.12)",
  },
  assets: {
    logo: "",
    favicon: "",
  },
};

const PAGE_IDS = [
  "home",
  "restaurant",
  "menu",
  "cart",
  "checkout",
  "orders",
  "wallet",
  "membership",
  "profile",
  "login",
  "signup",
  "vendorDashboard",
  "uniDashboard",
  "analytics",
  "settings",
  "search",
  "favorites",
  "guestHouse",
  "auditorium",
];

const PAGE_PROPS = ["background", "surface", "text", "accent"];

const COMPONENT_CATALOG = {
  card: {
    ids: [
      "dish",
      "restaurant",
      "vendor",
      "membership",
      "wallet",
      "analytics",
      "statistics",
      "offer",
      "coupon",
      "category",
      "profile",
      "order",
      "notification",
    ],
    props: [
      "background",
      "border",
      "radius",
      "shadow",
      "hoverBackground",
      "hoverShadow",
      "title",
      "description",
      "price",
      "badge",
    ],
  },
  button: {
    ids: [
      "primary",
      "secondary",
      "destructive",
      "ghost",
      "addToCart",
      "checkout",
      "buyNow",
      "login",
      "signup",
      "save",
      "cancel",
      "delete",
      "confirm",
      "continue",
      "pay",
      "applyCoupon",
      "viewDetails",
      "trackOrder",
    ],
    props: [
      "background",
      "text",
      "border",
      "radius",
      "hover",
      "disabled",
      "active",
      "icon",
    ],
  },
  nav: {
    ids: ["navbar", "sidebar", "bottomNav", "drawer", "breadcrumbs", "tabs"],
    props: ["background", "active", "inactive", "hover", "indicator"],
  },
  form: {
    ids: ["input", "select", "checkbox", "radio", "switch", "datePicker", "search"],
    props: ["background", "border", "focus", "placeholder", "label", "error", "success"],
  },
  table: {
    ids: ["default"],
    props: ["header", "row", "alternateRow", "hover", "border", "pagination", "sortIndicator"],
  },
  dialog: {
    ids: ["default"],
    props: ["background", "header", "footer", "overlay", "closeButton"],
  },
  alert: {
    ids: ["success", "warning", "error", "info"],
    props: ["background", "border", "text", "icon"],
  },
  badge: {
    ids: ["new", "popular", "veg", "nonVeg", "bestseller", "premium", "discount"],
    props: ["background", "text", "border"],
  },
  icon: {
    ids: ["default"],
    props: ["default", "active", "disabled"],
  },
  chart: {
    ids: ["default"],
    props: ["line", "bar", "pie", "axis", "grid", "tooltip"],
  },
  misc: {
    ids: [
      "chip",
      "tag",
      "accordion",
      "tooltip",
      "progress",
      "skeleton",
      "loader",
      "emptyState",
      "timeline",
      "toast",
      "pagination",
      "footer",
      "header",
      "fab",
      "divider",
    ],
    props: ["background", "border", "text", "accent"],
  },
};

/** CSS var name helpers */
function tokenCssVar(group, key) {
  return `--kampyn-${group}-${key}`;
}

function pageCssVar(pageId, prop) {
  return `--kampyn-page-${pageId}-${prop}`;
}

function componentCssVar(category, id, prop) {
  return `--kampyn-component-${category}-${id}-${prop}`;
}

function getDefaultTheme() {
  return {
    version: THEME_SCHEMA_VERSION,
    tokens: JSON.parse(JSON.stringify(DEFAULT_TOKENS)),
    pages: {},
    components: {},
  };
}

module.exports = {
  THEME_SCHEMA_VERSION,
  MAX_THEME_BYTES,
  ALLOWED_FONTS,
  DEFAULT_TOKENS,
  PAGE_IDS,
  PAGE_PROPS,
  COMPONENT_CATALOG,
  tokenCssVar,
  pageCssVar,
  componentCssVar,
  getDefaultTheme,
};
