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
  
  // Try to completely remove and reinstall debug module
  const { execSync } = require('child_process');
  const fs = require('fs');
  const path = require('path');
  
  try {
    // Remove debug module completely
    const debugPath = path.join(process.cwd(), 'node_modules', 'debug');
    if (fs.existsSync(debugPath)) {
      console.log('🗑️  Removing existing debug module...');
      execSync(`rm -rf "${debugPath}"`, { stdio: 'inherit' });
    }
    
    // Reinstall debug module
    console.log('📦 Reinstalling debug module...');
    execSync('npm install debug@4.3.4 --no-save', { stdio: 'inherit' });
    
    // Verify the installation
    if (fs.existsSync(debugPath)) {
      const packageJsonPath = path.join(debugPath, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        console.log('✅ Debug module reinstalled successfully');
        console.log('Debug package version:', packageJson.version);
        console.log('Debug package main entry:', packageJson.main);
        
        // Check if main entry file exists
        const mainEntryPath = path.join(debugPath, packageJson.main);
        if (fs.existsSync(mainEntryPath)) {
          console.log('✅ Debug main entry file exists');
        } else {
          console.error('❌ Debug main entry file still missing:', mainEntryPath);
          // Create a fallback debug module
          console.log('🔧 Creating fallback debug module...');
          createFallbackDebugModule(debugPath);
        }
      }
    }
  } catch (installError) {
    console.error('❌ Failed to reinstall debug module:', installError.message);
    console.log('🔧 Creating fallback debug module...');
    createFallbackDebugModule(path.join(process.cwd(), 'node_modules', 'debug'));
  }
}

// Function to create a fallback debug module
function createFallbackDebugModule(debugPath) {
  const fs = require('fs');
  const path = require('path');
  
  try {
    // Create the debug directory if it doesn't exist
    if (!fs.existsSync(debugPath)) {
      fs.mkdirSync(debugPath, { recursive: true });
    }
    
    // Create a simple package.json
    const packageJson = {
      "name": "debug",
      "version": "4.3.4",
      "main": "./index.js",
      "description": "Fallback debug module"
    };
    
    fs.writeFileSync(path.join(debugPath, 'package.json'), JSON.stringify(packageJson, null, 2));
    
    // Copy the fallback debug module
    const fallbackPath = path.join(process.cwd(), 'debug-fallback.js');
    const indexPath = path.join(debugPath, 'index.js');
    
    if (fs.existsSync(fallbackPath)) {
      fs.copyFileSync(fallbackPath, indexPath);
      console.log('✅ Fallback debug module copied successfully');
    } else {
      // Create a simple index.js that provides basic debug functionality
      const indexJs = `
module.exports = function(namespace) {
  return function() {
    // Simple fallback debug function that does nothing in production
    if (process.env.NODE_ENV !== 'production') {
      console.log.apply(console, [namespace, ...arguments]);
    }
  };
};

module.exports.enable = function() {};
module.exports.disable = function() {};
module.exports.enabled = function() { return false; };
`;
      
      fs.writeFileSync(indexPath, indexJs);
      console.log('✅ Fallback debug module created successfully');
    }
  } catch (error) {
    console.error('❌ Failed to create fallback debug module:', error.message);
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