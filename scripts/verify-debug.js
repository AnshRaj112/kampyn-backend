#!/usr/bin/env node

console.log('🔍 Starting debug package verification...');
console.log('Node.js version:', process.version);
console.log('Current working directory:', process.cwd());

// Check if node_modules exists
const fs = require('fs');
const path = require('path');

const nodeModulesPath = path.join(process.cwd(), 'node_modules');
if (fs.existsSync(nodeModulesPath)) {
  console.log('✅ node_modules directory exists');
} else {
  console.error('❌ node_modules directory does not exist');
  process.exit(1);
}

// Check if debug package exists
const debugPath = path.join(nodeModulesPath, 'debug');
if (fs.existsSync(debugPath)) {
  console.log('✅ debug package directory exists');
  
  // Check package.json
  const packageJsonPath = path.join(debugPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    console.log('✅ debug package.json exists');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    console.log('Debug package version:', packageJson.version);
    console.log('Debug package main entry:', packageJson.main);
    
    // Check if main entry file exists
    const mainEntryPath = path.join(debugPath, packageJson.main);
    if (fs.existsSync(mainEntryPath)) {
      console.log('✅ Debug main entry file exists:', mainEntryPath);
    } else {
      console.error('❌ Debug main entry file does not exist:', mainEntryPath);
      process.exit(1);
    }
  } else {
    console.error('❌ debug package.json does not exist');
    process.exit(1);
  }
} else {
  console.error('❌ debug package directory does not exist');
  process.exit(1);
}

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