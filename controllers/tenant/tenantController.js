const Tenant = require("../../models/account/Tenant");
const SystemAuditLog = require("../../models/account/SystemAuditLog");
const jwt = require("jsonwebtoken");
const logger = require("../../utils/pinoLogger");

/**
 * Public endpoint to fetch active tenant configuration
 */
exports.getTenantConfig = async (req, res) => {
  try {
    const tenant = req.tenant; // Automatically resolved by tenantMiddleware
    if (!tenant) {
      return res.status(404).json({ success: false, message: "Tenant context not found." });
    }

    res.json({
      success: true,
      data: {
        _id: tenant._id,
        name: tenant.name,
        slug: tenant.slug,
        branding: tenant.branding,
        enabledModules: tenant.enabledModules,
        navigation: tenant.navigation || [],
        widgets: tenant.widgets || ["StatCard", "SystemAlerts"],
        workflows: tenant.workflows || { approvalRole: "Warden", outingLimit: 3 }
      }
    });
  } catch (error) {
    logger.error({ error: error.message }, "Error fetching tenant configuration");
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

/**
 * Super Admin switches context to a specific tenant
 */
exports.switchTenantContext = async (req, res) => {
  try {
    const { tenantId } = req.body;
    const actorId = req.admin.adminId;

    if (!tenantId) {
      return res.status(400).json({ success: false, message: "tenantId is required." });
    }

    const targetTenant = await Tenant.findById(tenantId);
    if (!targetTenant) {
      return res.status(404).json({ success: false, message: "Target tenant not found." });
    }

    if (targetTenant.status !== "active") {
      return res.status(400).json({ success: false, message: "Cannot switch to an inactive tenant." });
    }

    // Write system audit log
    await SystemAuditLog.create({
      actorId,
      tenantId: targetTenant._id,
      actionType: "TENANT_SWITCH",
      description: `Super Admin switched session to tenant context: '${targetTenant.name}' (${targetTenant.slug}).`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });

    // Sign a short-lived impersonation token (15 mins TTL)
    const impersonationToken = jwt.sign(
      { 
        userId: actorId, 
        role: "super_admin", 
        impersonatedTenantId: targetTenant._id.toString() 
      },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    // Set token in cookie (same settings as standard tokens but with 15m maxAge)
    res.cookie("impersonationToken", impersonationToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
      maxAge: 15 * 60 * 1000, // 15 mins
      path: "/"
    });

    res.json({
      success: true,
      message: `Successfully switched to tenant context: ${targetTenant.name}`,
      token: impersonationToken
    });
  } catch (error) {
    logger.error({ error: error.message }, "Error during switchTenantContext");
    res.status(500).json({ success: false, message: "Failed to switch tenant context." });
  }
};

/**
 * Super Admin updates branding for the resolved tenant
 */
exports.updateTenantBranding = async (req, res) => {
  try {
    const actorId = req.admin.adminId;
    const tenantId = req.tenantId;
    const { logo, favicon, primaryColor, secondaryColor, font } = req.body;

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ success: false, message: "Tenant not found." });
    }

    const previousBranding = { ...tenant.branding };
    
    // Perform update
    if (logo !== undefined) tenant.branding.logo = logo;
    if (favicon !== undefined) tenant.branding.favicon = favicon;
    if (primaryColor !== undefined) tenant.branding.primaryColor = primaryColor;
    if (secondaryColor !== undefined) tenant.branding.secondaryColor = secondaryColor;
    if (font !== undefined) tenant.branding.font = font;

    await Tenant.findByIdAndUpdate(tenantId, { $set: { branding: tenant.branding } });

    await SystemAuditLog.create({
      actorId,
      tenantId,
      actionType: "BRANDING_UPDATE",
      description: `Updated branding configurations for tenant: ${tenant.name}`,
      previousState: previousBranding,
      newState: tenant.branding,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });

    res.json({
      success: true,
      message: "Branding updated successfully.",
      branding: tenant.branding
    });
  } catch (error) {
    logger.error({ error: error.message }, "Error updating branding configuration");
    res.status(500).json({ success: false, message: "Failed to update branding configuration." });
  }
};

/**
 * Super Admin updates modules for the resolved tenant
 */
exports.updateTenantModules = async (req, res) => {
  try {
    const actorId = req.admin.adminId;
    const tenantId = req.tenantId;
    const { enabledModules } = req.body;

    if (!Array.isArray(enabledModules)) {
      return res.status(400).json({ success: false, message: "enabledModules must be an array." });
    }

    const allowedModules = ["food", "hostel", "auditorium", "library", "transport", "laundry"];
    const invalidModules = enabledModules.filter(mod => !allowedModules.includes(mod));
    if (invalidModules.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid modules specified: ${invalidModules.join(", ")}. Allowed modules: ${allowedModules.join(", ")}`
      });
    }

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ success: false, message: "Tenant not found." });
    }

    const previousModules = [...tenant.enabledModules];
    tenant.enabledModules = enabledModules;
    await Tenant.findByIdAndUpdate(tenantId, { $set: { enabledModules } });

    await SystemAuditLog.create({
      actorId,
      tenantId,
      actionType: "MODULE_TOGGLE",
      description: `Modified enabled modules list for tenant: ${tenant.name}`,
      previousState: previousModules,
      newState: enabledModules,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });

    res.json({
      success: true,
      message: "Modules configuration updated successfully.",
      enabledModules
    });
  } catch (error) {
    logger.error({ error: error.message }, "Error updating modules configuration");
    res.status(500).json({ success: false, message: "Failed to update modules configuration." });
  }
};

/**
 * Super Admin updates suspension status for the resolved tenant
 */
exports.updateTenantStatus = async (req, res) => {
  try {
    const actorId = req.admin.adminId;
    const tenantId = req.tenantId;
    const { status } = req.body;

    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({ success: false, message: "Status must be 'active' or 'inactive'." });
    }

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ success: false, message: "Tenant not found." });
    }

    const previousStatus = tenant.status;
    tenant.status = status;
    await Tenant.findByIdAndUpdate(tenantId, { $set: { status } });

    await SystemAuditLog.create({
      actorId,
      tenantId,
      actionType: "TENANT_SUSPENSION",
      description: `Changed tenant status to '${status}' for tenant: ${tenant.name}`,
      previousState: { status: previousStatus },
      newState: { status },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });

    res.json({
      success: true,
      message: `Tenant status successfully updated to '${status}'.`,
      status
    });
  } catch (error) {
    logger.error({ error: error.message }, "Error updating tenant status");
    res.status(500).json({ success: false, message: "Failed to update tenant status." });
  }
};

/**
 * Saves entire Tenant Studio configuration (branding, navigation, widgets, workflows)
 * Updates both Tenant model and DEV environment TenantConfiguration with checksum
 */
exports.updateTenantStudioConfig = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { branding, navigation, widgets, workflows } = req.body;

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ success: false, message: "Tenant not found." });
    }

    // 1. Update branding details in primary Tenant model
    if (branding) {
      if (branding.logo !== undefined) tenant.branding.logo = branding.logo;
      if (branding.favicon !== undefined) tenant.branding.favicon = branding.favicon;
      if (branding.primaryColor !== undefined) tenant.branding.primaryColor = branding.primaryColor;
      if (branding.secondaryColor !== undefined) tenant.branding.secondaryColor = branding.secondaryColor;
      if (branding.font !== undefined) tenant.branding.font = branding.font;
    }

    // 2. Update navigation structure
    if (navigation) {
      if (!Array.isArray(navigation)) {
        return res.status(400).json({ success: false, message: "navigation must be an array." });
      }
      tenant.navigation = navigation;
    }

    // 3. Update dashboard widgets list
    if (widgets) {
      if (!Array.isArray(widgets)) {
        return res.status(400).json({ success: false, message: "widgets must be an array." });
      }
      tenant.widgets = widgets;
    }

    // 4. Update approval workflows settings
    if (workflows) {
      if (workflows.approvalRole !== undefined) tenant.workflows.approvalRole = workflows.approvalRole;
      if (workflows.outingLimit !== undefined) tenant.workflows.outingLimit = Number(workflows.outingLimit);
    }

    // Save primary model
    await Tenant.findByIdAndUpdate(tenantId, {
      $set: {
        branding: tenant.branding,
        navigation: tenant.navigation,
        widgets: tenant.widgets,
        workflows: tenant.workflows
      }
    });

    // 5. Sync snapshot configuration to TenantConfiguration DEV environment
    const TenantConfiguration = require("../../models/account/TenantConfiguration");
    const crypto = require("crypto");
    
    let devConfig = await TenantConfiguration.findOne({ tenantId, environment: "DEV", status: "active" });
    
    // Map active modules
    const modules = [
      {
        name: "food",
        enabled: tenant.enabledModules.includes("food"),
        features: new Map([["selectedWidgets", tenant.widgets || []]])
      },
      {
        name: "hostel",
        enabled: tenant.enabledModules.includes("hostel"),
        features: new Map([
          ["approvalRole", tenant.workflows.approvalRole || "Warden"],
          ["outingLimit", tenant.workflows.outingLimit || 3]
        ])
      }
    ];

    if (!devConfig) {
      // Find highest version or start with 1
      const latestConfig = await TenantConfiguration.findOne({ tenantId, environment: "DEV" }).sort({ version: -1 }).lean();
      const nextVersion = latestConfig ? latestConfig.version + 1 : 1;

      devConfig = new TenantConfiguration({
        tenantId,
        environment: "DEV",
        version: nextVersion,
        status: "active",
        branding: tenant.branding,
        navigation: { header: tenant.navigation },
        modules,
        checksum: "temp"
      });
    } else {
      devConfig.branding = tenant.branding;
      devConfig.navigation = { header: tenant.navigation };
      devConfig.modules = modules;
    }

    // Calculate checksum of the payload to enforce promotion verification
    const payloadStr = JSON.stringify({
      branding: devConfig.branding,
      modules: devConfig.modules,
      navigation: devConfig.navigation,
      permissions: devConfig.permissions
    });
    devConfig.checksum = crypto.createHash("sha256").update(payloadStr).digest("hex");
    await devConfig.save();

    // Log the change
    try {
      const actorId = req.uni?._id || req.admin?.adminId || tenantId;
      await SystemAuditLog.create({
        actorId,
        tenantId,
        actionType: "CONFIG_SAVE",
        description: `Updated Tenant Studio DEV configurations (Version: ${devConfig.version})`,
        newState: {
          branding: tenant.branding,
          navigation: tenant.navigation,
          widgets: tenant.widgets,
          workflows: tenant.workflows
        },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"]
      });
    } catch (auditErr) {
      logger.warn({ error: auditErr.message }, "Audit log creation failed during config update");
    }

    res.json({
      success: true,
      message: "Tenant Studio configurations saved successfully to DEV environment.",
      data: {
        branding: tenant.branding,
        navigation: tenant.navigation,
        widgets: tenant.widgets,
        workflows: tenant.workflows,
        version: devConfig.version,
        checksum: devConfig.checksum
      }
    });

  } catch (error) {
    logger.error({ error: error.message }, "Error updating Tenant Studio configurations");
    res.status(500).json({ success: false, message: "Failed to update configurations.", error: error.message });
  }
};

