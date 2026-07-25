const crypto = require("crypto");
const Tenant = require("../../models/account/Tenant");
const TenantConfiguration = require("../../models/account/TenantConfiguration");
const SystemAuditLog = require("../../models/account/SystemAuditLog");
const logger = require("../../utils/pinoLogger");
const { validateTheme, applyResetScope } = require("../../theme/themeValidate");
const {
  themeToBranding,
  brandingToThemeTokens,
  mergeThemeSparse,
  stripEmpty,
  resolveTheme,
} = require("../../theme/themeResolve");
const { THEME_SCHEMA_VERSION } = require("../../theme/themeRegistry");

function assertTenantAccess(req, tenantId) {
  if (req.uni && String(req.uni._id) !== String(tenantId)) {
    return {
      ok: false,
      status: 403,
      message: "Access denied. You can only customize configurations for your own university.",
    };
  }
  return { ok: true };
}

function clearTenantCache(tenant) {
  try {
    const tenantMiddleware = require("../../middleware/tenantMiddleware");
    if (tenantMiddleware && typeof tenantMiddleware.clearCache === "function") {
      tenantMiddleware.clearCache(tenant._id.toString());
      tenantMiddleware.clearCache(tenant.slug);
    }
  } catch (err) {
    logger.warn({ error: err.message }, "Failed to clear tenant cache");
  }
}

async function getOrCreateDevConfig(tenantId, tenant) {
  let devConfig = await TenantConfiguration.findOne({
    tenantId,
    environment: "DEV",
    status: "active",
  });

  if (!devConfig) {
    const latestConfig = await TenantConfiguration.findOne({ tenantId, environment: "DEV" })
      .sort({ version: -1 })
      .lean();
    const nextVersion = latestConfig ? latestConfig.version + 1 : 1;

    const modules = [
      {
        name: "food",
        enabled: (tenant.enabledModules || []).includes("food"),
        features: new Map(),
      },
    ];

    const payloadStr = JSON.stringify({
      branding: tenant.branding,
      theme: tenant.theme || null,
      modules,
      navigation: { header: tenant.navigation || [] },
    });

    devConfig = new TenantConfiguration({
      tenantId,
      environment: "DEV",
      version: nextVersion,
      status: "active",
      branding: tenant.branding,
      theme: tenant.theme || null,
      navigation: { header: tenant.navigation || [] },
      modules,
      checksum: crypto.createHash("sha256").update(payloadStr).digest("hex"),
    });
    await devConfig.save();
  }

  return devConfig;
}

function recomputeChecksum(devConfig) {
  const payloadStr = JSON.stringify({
    branding: devConfig.branding,
    theme: devConfig.theme,
    modules: devConfig.modules,
    navigation: devConfig.navigation,
    permissions: devConfig.permissions,
  });
  return crypto.createHash("sha256").update(payloadStr).digest("hex");
}

async function safeAudit(payload) {
  try {
    await SystemAuditLog.create(payload);
  } catch (err) {
    logger.warn({ error: err.message }, "Theme audit log failed");
  }
}

/**
 * GET /api/tenant/theme/draft
 */
exports.getThemeDraft = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const access = assertTenantAccess(req, tenantId);
    if (!access.ok) return res.status(access.status).json({ success: false, message: access.message });

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ success: false, message: "Tenant not found." });
    }

    const devConfig = await getOrCreateDevConfig(tenantId, tenant);
    const draft =
      devConfig.theme ||
      tenant.theme ||
      brandingToThemeTokens(tenant.branding) || {
        version: THEME_SCHEMA_VERSION,
      };

    res.json({
      success: true,
      data: {
        theme: draft,
        published: tenant.theme || null,
        version: devConfig.version,
        updatedAt: devConfig.updatedAt,
        defaults: resolveTheme(null, null).tokens,
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, "Error loading theme draft");
    res.status(500).json({ success: false, message: "Failed to load theme draft." });
  }
};

/**
 * PUT /api/tenant/theme/draft
 */
exports.saveThemeDraft = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const access = assertTenantAccess(req, tenantId);
    if (!access.ok) return res.status(access.status).json({ success: false, message: access.message });

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ success: false, message: "Tenant not found." });
    }

    const { theme: incoming, merge } = req.body;
    const { ok, errors, theme } = validateTheme(incoming || {});
    if (!ok) {
      return res.status(400).json({ success: false, message: "Invalid theme", errors });
    }

    const devConfig = await getOrCreateDevConfig(tenantId, tenant);
    const previous = devConfig.theme;

    let nextTheme = theme;
    if (merge) {
      nextTheme = stripEmpty(mergeThemeSparse(devConfig.theme || {}, theme));
      const revalidated = validateTheme(nextTheme);
      if (!revalidated.ok) {
        return res.status(400).json({ success: false, message: "Invalid merged theme", errors: revalidated.errors });
      }
      nextTheme = revalidated.theme;
    }

    nextTheme = stripEmpty(nextTheme);
    devConfig.theme = nextTheme;
    // Keep branding projection in sync for studio/promotion
    devConfig.branding = themeToBranding(nextTheme, tenant.branding);
    devConfig.checksum = recomputeChecksum(devConfig);
    await devConfig.save();

    const actorId = req.uni?._id || req.admin?.adminId || tenantId;
    await safeAudit({
      actorId,
      tenantId,
      actionType: "THEME_DRAFT_SAVE",
      description: `Saved theme draft for tenant: ${tenant.name}`,
      previousState: previous,
      newState: nextTheme,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({
      success: true,
      message: "Theme draft saved.",
      data: { theme: nextTheme, version: devConfig.version, checksum: devConfig.checksum },
    });
  } catch (error) {
    logger.error({ error: error.message }, "Error saving theme draft");
    res.status(500).json({ success: false, message: "Failed to save theme draft." });
  }
};

/**
 * POST /api/tenant/theme/publish
 */
exports.publishTheme = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const access = assertTenantAccess(req, tenantId);
    if (!access.ok) return res.status(access.status).json({ success: false, message: access.message });

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ success: false, message: "Tenant not found." });
    }

    const devConfig = await getOrCreateDevConfig(tenantId, tenant);
    const draft = devConfig.theme || brandingToThemeTokens(tenant.branding) || { version: THEME_SCHEMA_VERSION };
    const { ok, errors, theme } = validateTheme(draft);
    if (!ok) {
      return res.status(400).json({ success: false, message: "Draft theme is invalid", errors });
    }

    const published = stripEmpty(theme);
    const previousTheme = tenant.theme;
    const previousBranding = { ...tenant.branding?.toObject?.() } || { ...tenant.branding };

    const branding = themeToBranding(published, tenant.branding);
    const themeVersion = (tenant.themeVersion || 0) + 1;

    await Tenant.findByIdAndUpdate(tenantId, {
      $set: {
        theme: published,
        themeVersion,
        branding,
      },
    });

    clearTenantCache(tenant);

    const actorId = req.uni?._id || req.admin?.adminId || tenantId;
    await safeAudit({
      actorId,
      tenantId,
      actionType: "THEME_PUBLISH",
      description: `Published theme v${themeVersion} for tenant: ${tenant.name}`,
      previousState: { theme: previousTheme, branding: previousBranding },
      newState: { theme: published, branding, themeVersion },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({
      success: true,
      message: "Theme published successfully.",
      data: { theme: published, branding, themeVersion },
    });
  } catch (error) {
    logger.error({ error: error.message }, "Error publishing theme");
    res.status(500).json({ success: false, message: "Failed to publish theme." });
  }
};

/**
 * POST /api/tenant/theme/reset
 * Body: { scope: "all" | "tokens" | "components.button.addToCart" | ... }
 */
exports.resetTheme = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const access = assertTenantAccess(req, tenantId);
    if (!access.ok) return res.status(access.status).json({ success: false, message: access.message });

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ success: false, message: "Tenant not found." });
    }

    const scope = req.body?.scope || "all";
    const devConfig = await getOrCreateDevConfig(tenantId, tenant);
    const previous = devConfig.theme;
    const nextTheme = stripEmpty(applyResetScope(devConfig.theme || {}, scope));

    const { ok, errors, theme } = validateTheme(nextTheme);
    if (!ok && scope !== "all") {
      return res.status(400).json({ success: false, message: "Reset produced invalid theme", errors });
    }

    devConfig.theme = scope === "all" ? { version: THEME_SCHEMA_VERSION } : theme || nextTheme;
    if (scope === "all") {
      // Restore branding defaults projection
      const { DEFAULT_TOKENS } = require("../../theme/themeRegistry");
      devConfig.branding = {
        logo: "",
        favicon: "",
        primaryColor: DEFAULT_TOKENS.color.primary,
        secondaryColor: DEFAULT_TOKENS.color.secondary,
        font: DEFAULT_TOKENS.typography.fontFamily,
        backgroundColor: DEFAULT_TOKENS.color.background,
      };
    } else {
      devConfig.branding = themeToBranding(devConfig.theme, tenant.branding);
    }
    devConfig.checksum = recomputeChecksum(devConfig);
    await devConfig.save();

    const actorId = req.uni?._id || req.admin?.adminId || tenantId;
    await safeAudit({
      actorId,
      tenantId,
      actionType: "THEME_RESET",
      description: `Reset theme scope '${scope}' for tenant: ${tenant.name}`,
      previousState: previous,
      newState: devConfig.theme,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({
      success: true,
      message: `Theme reset (${scope}).`,
      data: { theme: devConfig.theme, version: devConfig.version },
    });
  } catch (error) {
    logger.error({ error: error.message }, "Error resetting theme");
    res.status(500).json({ success: false, message: "Failed to reset theme." });
  }
};

/**
 * GET /api/tenant/theme/export
 */
exports.exportTheme = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const access = assertTenantAccess(req, tenantId);
    if (!access.ok) return res.status(access.status).json({ success: false, message: access.message });

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ success: false, message: "Tenant not found." });
    }

    const source = req.query.source === "published" ? "published" : "draft";
    let theme;
    if (source === "published") {
      theme = tenant.theme || brandingToThemeTokens(tenant.branding) || { version: THEME_SCHEMA_VERSION };
    } else {
      const devConfig = await getOrCreateDevConfig(tenantId, tenant);
      theme = devConfig.theme || tenant.theme || brandingToThemeTokens(tenant.branding) || {
        version: THEME_SCHEMA_VERSION,
      };
    }

    res.json({
      success: true,
      data: {
        exportedAt: new Date().toISOString(),
        schemaVersion: THEME_SCHEMA_VERSION,
        tenantSlug: tenant.slug,
        source,
        theme,
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, "Error exporting theme");
    res.status(500).json({ success: false, message: "Failed to export theme." });
  }
};

/**
 * POST /api/tenant/theme/import
 * Body: { theme } or full export wrapper { theme, schemaVersion }
 */
exports.importTheme = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const access = assertTenantAccess(req, tenantId);
    if (!access.ok) return res.status(access.status).json({ success: false, message: access.message });

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ success: false, message: "Tenant not found." });
    }

    const incoming = req.body?.theme || req.body;
    const { ok, errors, theme } = validateTheme(incoming || {});
    if (!ok) {
      return res.status(400).json({ success: false, message: "Invalid import payload", errors });
    }

    const devConfig = await getOrCreateDevConfig(tenantId, tenant);
    const previous = devConfig.theme;
    const nextTheme = stripEmpty(theme);

    devConfig.theme = nextTheme;
    devConfig.branding = themeToBranding(nextTheme, tenant.branding);
    devConfig.checksum = recomputeChecksum(devConfig);
    await devConfig.save();

    const actorId = req.uni?._id || req.admin?.adminId || tenantId;
    await safeAudit({
      actorId,
      tenantId,
      actionType: "THEME_IMPORT",
      description: `Imported theme draft for tenant: ${tenant.name}`,
      previousState: previous,
      newState: nextTheme,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({
      success: true,
      message: "Theme imported into draft.",
      data: { theme: nextTheme, version: devConfig.version },
    });
  } catch (error) {
    logger.error({ error: error.message }, "Error importing theme");
    res.status(500).json({ success: false, message: "Failed to import theme." });
  }
};
