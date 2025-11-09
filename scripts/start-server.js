#!/usr/bin/env node

const logger = require('../utils/pinoLogger');

logger.info({ nodeVersion: process.version, nodeEnv: process.env.NODE_ENV || 'development' }, 'Starting KAMPYN Backend Server');

// Check for debug module issues before starting
try {
  require('debug');
  logger.info('Debug module is available');
} catch (error) {
  logger.error({ error: error.message }, 'Debug module issue detected');
  logger.info('Attempting to fix debug module...');
  
  // Try to completely remove and reinstall debug module
  const { execSync } = require('child_process');
  const fs = require('fs');
  const path = require('path');
  
  try {
    // Remove debug module completely
    const debugPath = path.join(process.cwd(), 'node_modules', 'debug');
    if (fs.existsSync(debugPath)) {
      logger.info('Removing existing debug module...');
      execSync(`rm -rf "${debugPath}"`, { stdio: 'inherit' });
    }
    
    // Reinstall debug module
    logger.info('Reinstalling debug module...');
    execSync('npm install debug@4.3.4 --no-save', { stdio: 'inherit' });
    
    // Verify the installation
    if (fs.existsSync(debugPath)) {
      const packageJsonPath = path.join(debugPath, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        logger.info({ version: packageJson.version, main: packageJson.main }, 'Debug module reinstalled successfully');
        
        // Check if main entry file exists
        const mainEntryPath = path.join(debugPath, packageJson.main);
        if (fs.existsSync(mainEntryPath)) {
          logger.info('Debug main entry file exists');
        } else {
          logger.error({ mainEntryPath }, 'Debug main entry file still missing');
          // Create a fallback debug module
          logger.info('Creating fallback debug module...');
          createFallbackDebugModule(debugPath);
        }
      }
    }
  } catch (installError) {
    logger.error({ error: installError.message }, 'Failed to reinstall debug module');
    logger.info('Creating fallback debug module...');
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
      logger.info('Fallback debug module copied successfully');
    } else {
      // Create a simple index.js that provides basic debug functionality
      const indexJs = `
module.exports = function(namespace) {
  return function() {
    // Simple fallback debug function that does nothing in production
    if (process.env.NODE_ENV !== 'production') {
      const logger = require('${path.join(process.cwd(), 'utils', 'pinoLogger')}');
      logger.debug.apply(logger, [namespace, ...arguments]);
    }
  };
};

module.exports.enable = function() {};
module.exports.disable = function() {};
module.exports.enabled = function() { return false; };
`;
      
      fs.writeFileSync(indexPath, indexJs);
      logger.info('Fallback debug module created successfully');
    }
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to create fallback debug module');
  }
}

// Start the server
try {
  require('../index.js');
  logger.info('Server started successfully');
} catch (error) {
  logger.error({ error: error.message, stack: error.stack }, 'Server startup failed');
  process.exit(1);
} 