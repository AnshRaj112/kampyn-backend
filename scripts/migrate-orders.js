#!/usr/bin/env node

// Script to migrate existing orders to have orderNumber
const { migrateOrderNumbers } = require('../utils/migrateOrderNumbers');
const mongoose = require('mongoose');
require('dotenv').config();

async function runMigration() {
  try {
    console.log('Starting migration...');
    await migrateOrderNumbers();
    
    console.log('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration(); 