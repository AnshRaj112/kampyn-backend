const { ApiHit, DailyApiStats } = require('../models/ServerMonitoring');
const logger = require('../utils/pinoLogger');

// Track API hits
async function trackApiHit(req, res, next) {
  const startTime = Date.now();
  
  // Skip tracking for health checks and static files
  if (req.path === '/api/health' || req.path.startsWith('/uploads')) {
    return next();
  }

  // Track response finish (handles both success and error cases)
  const originalEnd = res.end.bind(res);
  const originalJson = res.json.bind(res);
  
  res.end = function(chunk, encoding) {
    const responseTime = Date.now() - startTime;
    const statusCode = res.statusCode || 200;
    
    // Track asynchronously without blocking the response
    trackHitAsync(req, statusCode, responseTime).catch(err => {
      logger.error({ error: err.message }, 'Error tracking API hit');
    });
    
    return originalEnd(chunk, encoding);
  };

  res.json = function(data) {
    const responseTime = Date.now() - startTime;
    const statusCode = res.statusCode || 200;
    
    // Track asynchronously without blocking the response
    trackHitAsync(req, statusCode, responseTime).catch(err => {
      logger.error({ error: err.message }, 'Error tracking API hit');
    });
    
    return originalJson(data);
  };

  next();
}

async function trackHitAsync(req, statusCode, responseTime) {
  try {
    const now = new Date();
    const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const month = date.substring(0, 7); // YYYY-MM
    const year = date.substring(0, 4); // YYYY
    const hour = now.getHours();
    const minute = now.getMinutes();
    
    const endpoint = req.path;
    const method = req.method;
    
    // Get IP address (handle various proxy scenarios)
    let ipAddress = req.ip || 
                   (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : null) ||
                   req.headers['x-real-ip'] ||
                   req.connection?.remoteAddress ||
                   req.socket?.remoteAddress ||
                   'unknown';
    
    // Clean up IP address
    if (ipAddress && ipAddress !== 'unknown') {
      ipAddress = ipAddress.replace(/^::ffff:/, ''); // Remove IPv6 prefix
    }
    
    // Get user agent
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    // Get user ID if available
    const userId = req.user?.userId || req.user?.id || null;
    
    // Determine if it's an auth endpoint
    const isAuthEndpoint = endpoint.includes('/auth/login') || 
                          endpoint.includes('/auth/signup') ||
                          endpoint.includes('/auth/register') ||
                          endpoint.includes('/auth/logout');
    
    // Categorize endpoint
    const endpointCategory = categorizeEndpoint(endpoint);

    // Create API hit record
    await ApiHit.create({
      date,
      month,
      year,
      hour,
      minute,
      endpoint,
      method,
      statusCode,
      responseTime,
      ipAddress,
      userAgent,
      userId,
      isAuthEndpoint,
      endpointCategory,
      timestamp: now
    });

    // Update daily stats (upsert)
    await updateDailyStats(date, hour, endpoint, method, statusCode, responseTime);
  } catch (error) {
    // Don't throw - we don't want to break the request if tracking fails
    logger.error({ error: error.message }, 'Error in trackHitAsync');
  }
}

// Helper function to categorize endpoints
function categorizeEndpoint(endpoint) {
  if (endpoint.includes('/auth/')) return 'auth';
  if (endpoint.includes('/order')) return 'order';
  if (endpoint.includes('/item') || endpoint.includes('/foods')) return 'item';
  if (endpoint.includes('/payment') || endpoint.includes('/razorpay')) return 'payment';
  if (endpoint.includes('/cart')) return 'cart';
  if (endpoint.includes('/inventory')) return 'inventory';
  if (endpoint.includes('/vendor')) return 'vendor';
  if (endpoint.includes('/admin')) return 'admin';
  if (endpoint.includes('/university') || endpoint.includes('/uni')) return 'university';
  if (endpoint.includes('/contact')) return 'contact';
  if (endpoint.includes('/review')) return 'review';
  if (endpoint.includes('/invoice')) return 'invoice';
  return 'other';
}

async function updateDailyStats(date, hour, endpoint, method, statusCode, responseTime) {
  try {
    const update = {
      $inc: {
        totalHits: 1,
        [`hitsByHour.${hour}`]: 1,
        [`hitsByEndpoint.${endpoint}`]: 1,
        [`hitsByMethod.${method}`]: 1,
        [`hitsByStatusCode.${statusCode}`]: 1
      },
      $set: {
        lastUpdated: new Date()
      }
    };

    // Calculate average response time
    const existing = await DailyApiStats.findOne({ date });
    if (existing) {
      const currentAvg = existing.averageResponseTime || 0;
      const currentCount = existing.totalHits || 0;
      const newAvg = ((currentAvg * currentCount) + responseTime) / (currentCount + 1);
      update.$set.averageResponseTime = newAvg;
    } else {
      update.$set.averageResponseTime = responseTime;
    }

    await DailyApiStats.findOneAndUpdate(
      { date },
      update,
      { upsert: true, new: true }
    );
  } catch (error) {
    logger.error({ error: error.message }, 'Error updating daily stats');
  }
}

module.exports = {
  trackApiHit
};

