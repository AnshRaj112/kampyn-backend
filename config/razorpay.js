require('dotenv').config();

const razorpayConfig = {
  keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_kR4r4rtzasoKWl',
  keySecret: process.env.RAZORPAY_KEY_SECRET || '',
  apiBase: 'https://api.razorpay.com/v1',
  currency: 'INR',
  environment: process.env.NODE_ENV || 'development'
};

// Validate configuration
if (!razorpayConfig.keySecret) {
  console.warn('⚠️ RAZORPAY_KEY_SECRET not found in environment variables');
  console.warn('⚠️ Razorpay API calls will fail without proper authentication');
}

if (!razorpayConfig.keyId) {
  console.warn('⚠️ RAZORPAY_KEY_ID not found in environment variables');
  console.warn('⚠️ Using default test key: rzp_test_kR4r4rtzasoKWl');
}

console.log('🔑 Razorpay Configuration:', {
  keyId: razorpayConfig.keyId,
  environment: razorpayConfig.environment,
  apiBase: razorpayConfig.apiBase,
  hasSecret: !!razorpayConfig.keySecret
});

module.exports = razorpayConfig;
