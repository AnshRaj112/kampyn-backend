#!/usr/bin/env node

console.log('🚀 Starting KIITBites Backend Server...');
console.log('Node.js version:', process.version);
console.log('NODE_ENV:', process.env.NODE_ENV || 'development');

// Check for debug module issues before starting
try {
  require('debug');
  console.log('✅ Debug module is available');
} catch (error) {
  console.error('❌ Debug module issue detected:', error.message);
  console.log('🔄 Attempting to fix debug module...');
  
  // Try to reinstall debug module
  const { execSync } = require('child_process');
  try {
    execSync('npm install debug@4.3.4 --no-save', { stdio: 'inherit' });
    console.log('✅ Debug module reinstalled successfully');
  } catch (installError) {
    console.error('❌ Failed to reinstall debug module:', installError.message);
    console.log('⚠️  Continuing with server startup...');
  }
}

// Start the server
try {
  require('../index.js');
  console.log('✅ Server started successfully');
} catch (error) {
  console.error('❌ Server startup failed:', error.message);
  console.error('Error stack:', error.stack);
  process.exit(1);
} 