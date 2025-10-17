const fs = require('fs');
const path = require('path');

console.log('🔧 Setting up environment variables for Razorpay...\n');

// Backend .env file
const backendEnvPath = path.join(__dirname, '..', '.env');
const backendEnvContent = `# Database Configuration
MONGO_URI_USER=mongodb://localhost:27017/bitesbay_users
MONGO_URI_ORDER=mongodb://localhost:27017/bitesbay_orders
MONGO_URI_ITEM=mongodb://localhost:27017/bitesbay_items
MONGO_URI_INVENTORY=mongodb://localhost:27017/bitesbay_inventory
MONGO_URI_ACCOUNT=mongodb://localhost:27017/bitesbay_accounts
MONGO_URI_CACHE=mongodb://localhost:27017/bitesbay_cache

# Razorpay Configuration
RAZORPAY_KEY_ID=rzp_test_kR4r4rtzasoKWl
RAZORPAY_KEY_SECRET=your_actual_razorpay_secret_key_here

# Server Configuration
PORT=3000
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your_jwt_secret_here

# Other Configuration
CORS_ORIGIN=http://localhost:3000
`;

// Frontend .env.local file
const frontendEnvPath = path.join(__dirname, '..', 'bitesbay-frontend', '.env.local');
const frontendEnvContent = `# Razorpay Configuration
# Note: NEXT_PUBLIC_ variables are exposed to the browser
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_kR4r4rtzasoKWl
NEXT_PUBLIC_RAZORPAY_KEY_SECRET=your_actual_razorpay_secret_key_here

# Backend URL
NEXT_PUBLIC_BACKEND_URL=http://localhost:3000

# Other Configuration
NEXT_PUBLIC_APP_NAME=KAMPYN
NEXT_PUBLIC_APP_VERSION=1.0.0

# Feature Flags
NEXT_PUBLIC_DIRECT_RAZORPAY_API=true
NEXT_PUBLIC_RAZORPAY_FALLBACK=true
`;

try {
  // Create backend .env file
  if (!fs.existsSync(backendEnvPath)) {
    fs.writeFileSync(backendEnvPath, backendEnvContent);
    console.log('✅ Created backend .env file');
  } else {
    console.log('ℹ️  Backend .env file already exists');
  }
  
  // Create frontend .env.local file
  if (!fs.existsSync(frontendEnvPath)) {
    // Ensure directory exists
    const frontendDir = path.dirname(frontendEnvPath);
    if (!fs.existsSync(frontendDir)) {
      fs.mkdirSync(frontendDir, { recursive: true });
    }
    
    fs.writeFileSync(frontendEnvPath, frontendEnvContent);
    console.log('✅ Created frontend .env.local file');
  } else {
    console.log('ℹ️  Frontend .env.local file already exists');
  }
  
  console.log('\n📝 IMPORTANT: Update the following in your environment files:');
  console.log('\n1. Backend (.env):');
  console.log('   - Replace "your_actual_razorpay_secret_key_here" with your actual Razorpay secret key');
  console.log('   - Update database URIs if different');
  console.log('   - Update JWT_SECRET for security');
  
  console.log('\n2. Frontend (.env.local):');
  console.log('   - Replace "your_actual_razorpay_secret_key_here" with your actual Razorpay secret key');
  console.log('   - Update BACKEND_URL if different');
  
  console.log('\n🔑 To get your Razorpay secret key:');
  console.log('   1. Go to https://dashboard.razorpay.com/');
  console.log('   2. Navigate to Settings > API Keys');
  console.log('   3. Copy the "Secret Key" (not the Key ID)');
  
  console.log('\n🚀 Next steps:');
  console.log('   1. Update the secret keys in both .env files');
  console.log('   2. Run: node scripts/check-invoice-entities.js');
  console.log('   3. If entities are missing, run: node scripts/create-missing-entities.js');
  console.log('   4. Restart your backend server');
  console.log('   5. Test the Razorpay integration');
  
} catch (error) {
  console.error('❌ Error creating environment files:', error);
}
