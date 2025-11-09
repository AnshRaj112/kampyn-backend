require('dotenv').config();
const logger = require('../utils/pinoLogger');

const razorpayConfig = {
  keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_kR4r4rtzasoKWl',
  keySecret: process.env.RAZORPAY_KEY_SECRET || '',
  apiBase: 'https://api.razorpay.com/v1',
  currency: 'INR',
  environment: process.env.NODE_ENV || 'development'
};

// Validate configuration
if (!razorpayConfig.keySecret) {
  logger.warn('RAZORPAY_KEY_SECRET not found in environment variables');
  logger.warn('Razorpay API calls will fail without proper authentication');
}

if (!razorpayConfig.keyId) {
  logger.warn('RAZORPAY_KEY_ID not found in environment variables');
  logger.warn({ defaultKey: 'rzp_test_kR4r4rtzasoKWl' }, 'Using default test key');
}

logger.info({
  keyId: razorpayConfig.keyId,
  environment: razorpayConfig.environment,
  apiBase: razorpayConfig.apiBase,
  hasSecret: !!razorpayConfig.keySecret
}, 'Razorpay Configuration');

module.exports = razorpayConfig;
