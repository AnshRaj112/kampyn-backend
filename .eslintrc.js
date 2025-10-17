module.exports = {
  env: {
    node: true,
    es2021: true,
  },
  globals: {
    // Express.js globals
    'app': 'readonly',
    'express': 'readonly',
    'mongoose': 'readonly',
    'User': 'readonly',
    'Admin': 'readonly',
    'Vendor': 'readonly',
    'Uni': 'readonly',
    'Order': 'readonly',
    'Item': 'readonly',
    'Food': 'readonly',
    'FoodCourt': 'readonly',
    'Cart': 'readonly',
    'Invoice': 'readonly',
    'Payment': 'readonly',
    'Review': 'readonly',
    'Service': 'readonly',
    'Team': 'readonly',
    'Feature': 'readonly',
    'Contact': 'readonly',
    'BillingInfo': 'readonly',
    'Favourite': 'readonly',
    'Inventory': 'readonly',
    'InventoryReport': 'readonly',
    'VendorCart': 'readonly',
    'VendorPayment': 'readonly',
    'VendorTransfer': 'readonly',
    'ExpressOrder': 'readonly',
    'Raw': 'readonly',
    'Retail': 'readonly',
    'Cluster_Accounts': 'readonly',
    'Cluster_Order': 'readonly',
    'getModel': 'readonly',
    'getAllSpecialsByUniId': 'readonly',
    'checkSubscriptionStatus': 'readonly',
    'cancelOrderAtomically': 'readonly',
    'cleanupOrderAtomically': 'readonly',
    'sanitizeCustomerName': 'readonly',
  },
  extends: [
    'eslint:recommended',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    // Security-related rules
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
    'no-alert': 'error',
    'no-console': 'off', // Allow console.log in backend applications
    
    // Code quality rules
    'no-unused-vars': 'off', // Many unused vars in existing codebase
    'no-undef': 'error',
    'no-redeclare': 'error',
    'no-duplicate-case': 'error',
    'no-empty': 'warn',
    'no-extra-semi': 'error',
    'no-func-assign': 'error',
    'no-irregular-whitespace': 'error',
    'no-unreachable': 'error',
    'use-isnan': 'error',
    'valid-typeof': 'error',
    
    // Best practices (relaxed for existing codebase)
    'eqeqeq': 'off', // Allow == and != for existing code
    'no-caller': 'error',
    'no-else-return': 'off', // Allow else after return
    'no-eq-null': 'off', // Allow == null and != null
    'no-extra-bind': 'error',
    'no-floating-decimal': 'error',
    'no-lone-blocks': 'error',
    'no-loop-func': 'error',
    'no-multi-spaces': 'off', // Allow multiple spaces
    'no-multi-str': 'error',
    'no-new': 'error',
    'no-new-wrappers': 'error',
    'no-octal': 'error',
    'no-octal-escape': 'error',
    'no-param-reassign': 'warn',
    'no-proto': 'error',
    'no-return-assign': 'error',
    'no-self-compare': 'error',
    'no-sequences': 'error',
    'no-throw-literal': 'error',
    'no-unused-expressions': 'error',
    'no-void': 'error',
    'no-with': 'error',
    'radix': 'off', // Allow parseInt without radix for existing code
    'wrap-iife': 'error',
    'yoda': 'error',
    'no-inner-declarations': 'off', // Allow inner function declarations
    'no-empty': 'off', // Allow empty blocks
    'no-script-url': 'off', // Allow javascript: URLs in test cases
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    'coverage/',
    '*.min.js',
    'test/',
    'tests/',
    '__tests__/',
    '*.test.js',
    '*.spec.js',
    'debug-fallback.js',
    'test-*.js',
    'scripts/',
    'data.json',
    'security-report.json',
  ],
};
