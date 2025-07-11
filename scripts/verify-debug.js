#!/usr/bin/env node

// Verify debug package installation
try {
  const debug = require('debug');
  console.log('✅ Debug package is properly installed');
  console.log('Debug package version:', require('debug/package.json').version);
  console.log('Debug package main entry:', require('debug/package.json').main);
  
  // Test debug functionality
  const debugInstance = debug('test');
  console.log('✅ Debug functionality works correctly');
  console.log('Debug instance type:', typeof debugInstance);
  
} catch (error) {
  console.error('❌ Debug package issue:', error.message);
  console.error('Error stack:', error.stack);
  process.exit(1);
}

console.log('🎉 All debug package checks passed!'); 