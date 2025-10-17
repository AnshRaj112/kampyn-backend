#!/usr/bin/env node

/**
 * CI/CD Setup Validation Script
 * 
 * This script helps validate the CI/CD pipeline configuration
 * and provides helpful information for setup.
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 KAMPYN Backend CI/CD Setup Validation\n');

// Check if required files exist
const requiredFiles = [
  '.github/workflows/deploy.yml',
  'render.yaml',
  'package.json',
  'index.js'
];

console.log('📁 Checking required files...');
let allFilesExist = true;

requiredFiles.forEach(file => {
  const exists = fs.existsSync(path.join(__dirname, '..', file));
  console.log(`${exists ? '✅' : '❌'} ${file}`);
  if (!exists) allFilesExist = false;
});

if (!allFilesExist) {
  console.log('\n❌ Some required files are missing. Please ensure all files are present.');
  process.exit(1);
}

// Validate package.json
console.log('\n📦 Validating package.json...');
try {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  
  // Check for required scripts
  const requiredScripts = ['start'];
  requiredScripts.forEach(script => {
    if (packageJson.scripts && packageJson.scripts[script]) {
      console.log(`✅ ${script} script found`);
    } else {
      console.log(`❌ ${script} script missing`);
      allFilesExist = false;
    }
  });
  
  // Check for required dependencies
  const requiredDeps = ['express', 'dotenv'];
  requiredDeps.forEach(dep => {
    if (packageJson.dependencies && packageJson.dependencies[dep]) {
      console.log(`✅ ${dep} dependency found`);
    } else {
      console.log(`❌ ${dep} dependency missing`);
      allFilesExist = false;
    }
  });
  
} catch (error) {
  console.log('❌ Error reading package.json:', error.message);
  allFilesExist = false;
}

// Check for health endpoint in index.js
console.log('\n🏥 Checking health endpoint...');
try {
  const indexContent = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  if (indexContent.includes('/api/health')) {
    console.log('✅ Health endpoint found in index.js');
  } else {
    console.log('❌ Health endpoint not found in index.js');
    allFilesExist = false;
  }
} catch (error) {
  console.log('❌ Error reading index.js:', error.message);
  allFilesExist = false;
}

// Summary
console.log('\n📋 Setup Summary:');
if (allFilesExist) {
  console.log('✅ All validations passed! Your CI/CD pipeline is ready for setup.');
  console.log('\n📖 Next steps:');
  console.log('1. Create a Render web service');
  console.log('2. Get your Render API token and service ID');
  console.log('3. Add GitHub secrets (RENDER_TOKEN, RENDER_SERVICE_ID)');
  console.log('4. Configure environment variables in Render');
  console.log('5. Disable auto-deploy in Render');
  console.log('\n📚 See CI_CD_SETUP.md for detailed instructions.');
} else {
  console.log('❌ Some validations failed. Please fix the issues above before proceeding.');
  process.exit(1);
}

// Environment variables checklist
console.log('\n🔧 Environment Variables Checklist:');
const envVars = [
  'NODE_ENV',
  'PORT',
  'MONGO_URL',
  'FRONTEND_URL'
];

envVars.forEach(envVar => {
  console.log(`- ${envVar}`);
});

console.log('\n💡 Tip: Make sure to set these environment variables in your Render service dashboard.'); 