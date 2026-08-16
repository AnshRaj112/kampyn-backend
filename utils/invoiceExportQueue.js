/**
 * In-process invoice ZIP export queue.
 * Heavy ZIP work runs off the HTTP request path with bounded concurrency.
 * ISSUE-KMP-002 — Redis/Bull workers (ISSUE-KMP-007 / ISSUE-KMP-048) are not required
 * for this control; a process-local queue still keeps ZIP generation off the request thread.
 */

const crypto = require('crypto');
const fs = require('fs');
const logger = require('./pinoLogger');

const DEFAULT_MAX_CONCURRENT = Number(process.env.INVOICE_EXPORT_MAX_CONCURRENT) || 1;
const DEFAULT_MAX_QUEUED = Number(process.env.INVOICE_EXPORT_MAX_QUEUED) || 8;
const DEFAULT_TTL_MS = Number(process.env.INVOICE_EXPORT_JOB_TTL_MS) || 15 * 60 * 1000;

function createInvoiceExportQueue(options = {}) {
  const maxConcurrent = options.maxConcurrent || DEFAULT_MAX_CONCURRENT;
  const maxQueued = options.maxQueued || DEFAULT_MAX_QUEUED;
  const ttlMs = options.ttlMs || DEFAULT_TTL_MS;
  const processJob = options.processJob;
  const nowFn = options.now || (() => Date.now());
  const schedule = options.schedule || ((fn) => setImmediate(fn));

  /** @type {Map<string, object>} */
  const jobs = new Map();
  const waitQueue = [];
  let active = 0;
  let draining = false;

  function purgeExpired() {
    const now = nowFn();
    for (const [id, job] of jobs.entries()) {
      if (job.expiresAt && now > job.expiresAt) {
        cleanupFile(job);
        jobs.delete(id);
      }
    }
  }

  function cleanupFile(job) {
    if (job && job.zipPath) {
      try {
        if (fs.existsSync(job.zipPath)) fs.unlinkSync(job.zipPath);
      } catch (err) {
        logger.warn({ error: err.message, jobId: job.id }, 'Failed to remove expired export ZIP');
      }
    }
    if (job && job.tempDir) {
      try {
        if (fs.existsSync(job.tempDir)) fs.rmSync(job.tempDir, { recursive: true, force: true });
      } catch (err) {
        logger.warn({ error: err.message, jobId: job.id }, 'Failed to remove export temp dir');
      }
    }
  }

  function publicView(job) {
    if (!job) return null;
    return {
      jobId: job.id,
      status: job.status,
      error: job.error || null,
      invoiceCount: job.invoiceCount || 0,
      createdAt: job.createdAt,
      completedAt: job.completedAt || null
    };
  }

  function enqueue(payload) {
    purgeExpired();
    const queuedCount = waitQueue.length + (active > 0 ? active : 0);
    if (waitQueue.length >= maxQueued) {
      return {
        ok: false,
        status: 429,
        message: 'Export queue is full. Retry after an in-flight export completes.'
      };
    }

    const id = crypto.randomUUID();
    const job = {
      id,
      status: 'queued',
      actorKey: payload.actorKey,
      actorType: payload.actorType,
      actorId: payload.actorId,
      query: payload.query,
      startDate: payload.startDate,
      endDate: payload.endDate,
      invoiceCount: payload.invoiceCount || 0,
      zipPath: null,
      tempDir: null,
      filename: payload.filename,
      error: null,
      createdAt: new Date(nowFn()).toISOString(),
      completedAt: null,
      expiresAt: nowFn() + ttlMs
    };
    jobs.set(id, job);
    waitQueue.push(id);
    schedule(drain);
    return { ok: true, job, queuedAhead: queuedCount };
  }

  async function drain() {
    if (draining) return;
    draining = true;
    try {
      while (active < maxConcurrent && waitQueue.length > 0) {
        const id = waitQueue.shift();
        const job = jobs.get(id);
        if (!job || job.status !== 'queued') continue;
        active += 1;
        job.status = 'processing';
        run(job).finally(() => {
          active = Math.max(0, active - 1);
          schedule(drain);
        });
      }
    } finally {
      draining = false;
    }
  }

  async function run(job) {
    if (typeof processJob !== 'function') {
      job.status = 'failed';
      job.error = 'Export processor is not configured';
      job.completedAt = new Date(nowFn()).toISOString();
      return;
    }
    try {
      const result = await processJob(job);
      job.zipPath = result.zipPath;
      job.tempDir = result.tempDir;
      job.invoiceCount = result.invoiceCount != null ? result.invoiceCount : job.invoiceCount;
      job.filename = result.filename || job.filename;
      job.completedAt = new Date(nowFn()).toISOString();
      job.expiresAt = nowFn() + ttlMs;
      job.status = 'completed';
    } catch (err) {
      job.status = 'failed';
      job.error = err.message || 'Export failed';
      job.completedAt = new Date(nowFn()).toISOString();
      logger.error({ error: err.message, jobId: job.id }, 'Invoice export job failed');
    }
  }

  function getJob(jobId) {
    purgeExpired();
    return jobs.get(jobId) || null;
  }

  function assertOwner(job, actorKey) {
    if (!job) return { ok: false, status: 404, message: 'Export job not found' };
    if (job.actorKey !== actorKey) {
      return { ok: false, status: 403, message: 'Access denied for this export job' };
    }
    return { ok: true };
  }

  function markDownloaded(job) {
    // Keep the file until TTL so a retry can re-download, but do not block the queue.
    if (job) job.downloadedAt = new Date(nowFn()).toISOString();
  }

  function size() {
    return { jobs: jobs.size, waiting: waitQueue.length, active };
  }

  function reset() {
    for (const job of jobs.values()) cleanupFile(job);
    jobs.clear();
    waitQueue.length = 0;
    active = 0;
    draining = false;
  }

  return {
    enqueue,
    getJob,
    publicView,
    assertOwner,
    markDownloaded,
    size,
    reset,
    drain
  };
}

module.exports = {
  createInvoiceExportQueue,
  DEFAULT_MAX_CONCURRENT,
  DEFAULT_MAX_QUEUED,
  DEFAULT_TTL_MS
};
