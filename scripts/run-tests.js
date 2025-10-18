#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

console.log('🧪 KAMPYN Backend Test Runner');
console.log('================================\n');

const testTypes = {
  unit: 'Unit Tests',
  integration: 'Integration Tests', 
  performance: 'Performance Tests',
  all: 'All Tests'
};

const testType = process.argv[2] || 'all';

if (!testTypes[testType]) {
  console.error(`❌ Invalid test type: ${testType}`);
  console.log('Available types:', Object.keys(testTypes).join(', '));
  process.exit(1);
}

console.log(`Running: ${testTypes[testType]}\n`);

try {
  let command;
  
  switch (testType) {
    case 'unit':
      command = 'npm run test:unit';
      break;
    case 'integration':
      command = 'npm run test:integration';
      break;
    case 'performance':
      command = 'npm run test:performance';
      break;
    case 'all':
    default:
      command = 'npm run test:ci';
      break;
  }

  console.log(`Executing: ${command}\n`);
  
  execSync(command, { 
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..')
  });

  console.log(`\n✅ ${testTypes[testType]} completed successfully!`);
  
} catch (error) {
  console.error(`\n❌ ${testTypes[testType]} failed!`);
  console.error('Error:', error.message);
  process.exit(1);
}
