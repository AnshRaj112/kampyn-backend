const TenantConfiguration = require("../models/account/TenantConfiguration");
const SystemAuditLog = require("../models/account/SystemAuditLog");
const logger = require("../utils/pinoLogger");
const crypto = require("crypto");

/**
 * Promotes configuration between environments (e.g. UAT to PROD)
 */
exports.promoteConfiguration = async (req, res) => {
  try {
    const { sourceEnv, targetEnv } = req.body;
    const tenantId = req.tenantId;
    const actorId = req.admin?.adminId || req.uni?._id || req.user?._id; // Resolve actor context safely

    if (!tenantId) {
      return res.status(400).json({ success: false, message: "Tenant context missing." });
    }

    if (req.uni && String(req.uni._id) !== String(tenantId)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only promote configurations for your own university."
      });
    }

    if (!["DEV", "TEST", "UAT"].includes(sourceEnv) || !["TEST", "UAT", "PROD"].includes(targetEnv)) {
      return res.status(400).json({ success: false, message: "Invalid source or target environments." });
    }

    // 1. Fetch source active config
    const sourceConfig = await TenantConfiguration.findOne({ tenantId, environment: sourceEnv, status: "active" }).lean();
    if (!sourceConfig) {
      return res.status(404).json({ success: false, message: `Active source configuration not found in environment: ${sourceEnv}` });
    }

    // 2. Fetch current target configuration for versioning backup
    const targetConfig = await TenantConfiguration.findOne({ tenantId, environment: targetEnv, status: "active" });

    // 3. Clone configuration values
    const newConfigData = {
      tenantId: sourceConfig.tenantId,
      branding: sourceConfig.branding,
      modules: sourceConfig.modules,
      navigation: sourceConfig.navigation,
      permissions: sourceConfig.permissions,
      environment: targetEnv,
      version: targetConfig ? targetConfig.version + 1 : 1,
      status: "active",
      updatedBy: actorId
    };

    // Calculate cryptographic checksum to verify configuration payload integrity
    const payloadStr = JSON.stringify({
      branding: newConfigData.branding,
      modules: newConfigData.modules,
      navigation: newConfigData.navigation,
      permissions: newConfigData.permissions
    });
    newConfigData.checksum = crypto.createHash("sha256").update(payloadStr).digest("hex");

    // 4. Deactivate old target configurations
    if (targetConfig) {
      targetConfig.status = "inactive";
      await targetConfig.save();
    }

    // 5. Create new promoted configuration
    const promotedConfig = await TenantConfiguration.create(newConfigData);

    // 6. Record audit log (impersonated log or super admin log)
    try {
      await SystemAuditLog.create({
        actorId,
        tenantId,
        actionType: "CONFIG_PROMOTION",
        description: `Promoted configurations from ${sourceEnv} to ${targetEnv} (Version: ${newConfigData.version})`,
        previousState: targetConfig ? { _id: targetConfig._id, version: targetConfig.version } : null,
        newState: { _id: promotedConfig._id, version: promotedConfig.version },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"]
      });
    } catch (auditError) {
      logger.warn({ error: auditError.message }, "System audit log entry creation failed, continuing promotion completion");
    }

    res.json({
      success: true,
      message: `Configurations promoted to ${targetEnv} successfully.`,
      version: newConfigData.version,
      checksum: newConfigData.checksum
    });

  } catch (error) {
    logger.error({ error: error.message }, "Error executing promotion pipeline");
    res.status(500).json({ success: false, message: "Configuration promotion failed." });
  }
};

/**
 * Reverts back to a historical version of configuration
 */
exports.rollbackConfiguration = async (req, res) => {
  try {
    const { targetVersion, environment } = req.body;
    const tenantId = req.tenantId;
    const actorId = req.admin?.adminId || req.uni?._id || req.user?._id;

    if (!tenantId || !environment || !targetVersion) {
      return res.status(400).json({ success: false, message: "Missing required fields: targetVersion, environment" });
    }

    if (req.uni && String(req.uni._id) !== String(tenantId)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only rollback configurations for your own university."
      });
    }

    const currentConfig = await TenantConfiguration.findOne({ tenantId, environment, status: "active" });
    const targetConfig = await TenantConfiguration.findOne({ tenantId, environment, version: targetVersion });

    if (!targetConfig) {
      return res.status(404).json({ success: false, message: `Configuration version ${targetVersion} not found for this tenant environment.` });
    }

    if (currentConfig) {
      currentConfig.status = "inactive";
      await currentConfig.save();
    }

    targetConfig.status = "active";
    await targetConfig.save();

    logger.info({ tenantId, environment, targetVersion }, "Configuration rolled back successfully");

    res.json({
      success: true,
      message: `Successfully rolled back ${environment} configuration to version ${targetVersion}`
    });
  } catch (error) {
    logger.error({ error: error.message }, "Error executing configuration rollback");
    res.status(500).json({ success: false, message: "Configuration rollback failed." });
  }
};
