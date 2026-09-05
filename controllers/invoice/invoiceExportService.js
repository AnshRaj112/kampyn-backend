/**
 * Orchestrates bulk invoice export requests: auth actor, caps, rate limit, enqueue, audit.
 * HTTP handlers stay thin so ZIP work never runs on the request thread.
 */

const Invoice = require('../../models/invoice/Invoice');
const InvoiceExportLog = require('../../models/invoice/InvoiceExportLog');
const SystemAuditLog = require('../../models/account/SystemAuditLog');
const {
  MAX_EXPORT_ROWS,
  evaluateBulkExportRequest,
  overRowCapMessage,
  resolveExportActor
} = require('../../utils/invoiceExportGuard');
const { createInvoiceExportQueue } = require('../../utils/invoiceExportQueue');
const { buildBulkInvoiceZip } = require('../../utils/invoiceZipBuilder');
const logger = require('../../utils/pinoLogger');

const exportQueue = createInvoiceExportQueue({
  processJob: (job) => buildBulkInvoiceZip(job)
});

function jsonError(status, message, extra) {
  return { status, body: { success: false, message, ...extra } };
}

async function writeExportAudit({ actor, action, jobId, invoiceCount, filters, req }) {
  const payload = {
    actorId: actor.id,
    actorType: actor.type,
    action,
    jobId: jobId || undefined,
    invoiceCount: invoiceCount || 0,
    filters: {
      startDate: filters.startDate,
      endDate: filters.endDate,
      vendorId: filters.vendorId || null,
      uniId: filters.uniId || null,
      invoiceType: filters.invoiceType || null,
      recipientType: filters.recipientType || null
    },
    ipAddress: req.ip,
    userAgent: req.headers && req.headers['user-agent']
  };

  await InvoiceExportLog.create(payload);

  const tenantId = req.tenantId || filters.uniId;
  if (tenantId) {
    try {
      await SystemAuditLog.create({
        actorId: actor.id,
        tenantId,
        actionType: 'INVOICE_BULK_EXPORT',
        description: `Invoice ${action} export (${invoiceCount} invoices) by ${actor.type} ${actor.id}`,
        newState: { jobId, action, invoiceCount, filters: payload.filters },
        ipAddress: req.ip,
        userAgent: req.headers && req.headers['user-agent']
      });
    } catch (err) {
      logger.warn({ error: err.message }, 'SystemAuditLog invoice export write skipped');
    }
  }
}

async function requestBulkZipExport(req) {
  const preview = evaluateBulkExportRequest(req);
  if (!preview.ok) {
    return jsonError(preview.status, preview.message, {
      retryAfterSeconds: preview.retryAfterSeconds
    });
  }

  const count = await Invoice.countDocuments(preview.query);

  if (count === 0) {
    return jsonError(404, 'No invoices found for the specified criteria');
  }
  if (count > MAX_EXPORT_ROWS) {
    return jsonError(400, overRowCapMessage(count));
  }

  const queued = exportQueue.enqueue({
    actorKey: preview.actor.key,
    actorType: preview.actor.type,
    actorId: preview.actor.id,
    query: preview.query,
    startDate: preview.filters.startDate,
    endDate: preview.filters.endDate,
    invoiceCount: count,
    filename: `bulk_invoices_${preview.filters.startDate}_to_${preview.filters.endDate}.zip`
  });

  if (!queued.ok) {
    return jsonError(queued.status, queued.message);
  }

  try {
    await writeExportAudit({
      actor: preview.actor,
      action: 'bulk_zip',
      jobId: queued.job.id,
      invoiceCount: count,
      filters: preview.filters,
      req
    });
  } catch (err) {
    logger.error({ error: err.message }, 'Failed to write invoice export audit log');
    // Do not acknowledge a sensitive financial export if its mandatory audit
    // record could not be written. The queued job may still be visible to the
    // worker, but the caller receives no successful export response.
    return jsonError(500, 'Failed to record invoice export audit log');
  }

  return {
    status: 202,
    body: {
      success: true,
      message: 'Export queued. Poll the job status endpoint until the ZIP is ready.',
      data: {
        jobId: queued.job.id,
        status: 'queued',
        invoiceCount: count,
        statusUrl: `/api/invoices/bulk-zip-jobs/${queued.job.id}`,
        downloadUrl: `/api/invoices/bulk-zip-jobs/${queued.job.id}/file`
      }
    }
  };
}

async function requestBulkMetadataExport(req) {
  const preview = evaluateBulkExportRequest(req);
  if (!preview.ok) {
    return jsonError(preview.status, preview.message, {
      retryAfterSeconds: preview.retryAfterSeconds
    });
  }

  const count = await Invoice.countDocuments(preview.query);

  if (count === 0) {
    return jsonError(404, 'No invoices found for the specified criteria');
  }
  if (count > MAX_EXPORT_ROWS) {
    return jsonError(400, overRowCapMessage(count));
  }

  const invoices = await Invoice.find(preview.query)
    .sort({ createdAt: -1 })
    .limit(MAX_EXPORT_ROWS)
    .lean();

  try {
    await writeExportAudit({
      actor: preview.actor,
      action: 'bulk_metadata',
      invoiceCount: invoices.length,
      filters: preview.filters,
      req
    });
  } catch (err) {
    logger.error({ error: err.message }, 'Failed to write invoice export audit log');
    return jsonError(500, 'Failed to record invoice export audit log');
  }

  return {
    status: 200,
    body: {
      success: true,
      data: {
        invoices,
        totalCount: invoices.length,
        dateRange: { startDate: preview.filters.startDate, endDate: preview.filters.endDate }
      }
    }
  };
}

function getExportJobForActor(req) {
  const actor = resolveExportActor(req);
  if (!actor.ok) return jsonError(actor.status, actor.message);

  const job = exportQueue.getJob(req.params.jobId);
  const owner = exportQueue.assertOwner(job, actor.key);
  if (!owner.ok) return jsonError(owner.status, owner.message);

  return { status: 200, body: { success: true, data: exportQueue.publicView(job) }, job };
}

module.exports = {
  exportQueue,
  requestBulkZipExport,
  requestBulkMetadataExport,
  getExportJobForActor,
  writeExportAudit
};
