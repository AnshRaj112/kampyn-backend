# 🧪 Contributor Testing Guide

## Overview

This guide is **MANDATORY** for all contributors working on the KAMPYN backend. Every change you make must include appropriate tests, and all tests must pass before your code can be merged.

## 🚨 **CRITICAL: Testing Requirements**

### ✅ **What You MUST Do Before Every Commit:**

1. **Write tests** for any new functionality
2. **Update tests** for any modified functionality  
3. **Run tests** to ensure they pass
4. **Verify coverage** meets minimum thresholds
5. **Test performance** for critical paths

### ❌ **What Happens If You Don't:**

- **Pre-commit hooks will BLOCK your commit**
- **Your PR will be automatically rejected**
- **Code review will be delayed**
- **You'll be asked to fix tests before merging**

---

## 🏗️ **Testing Infrastructure**

### **Test Types We Use:**

| Type | Purpose | Location | Command |
|------|---------|----------|---------|
| **Unit Tests** | Test individual functions/components | `test/unit/` | `npm run test:unit` |
| **Integration Tests** | Test API endpoints and workflows | `test/integration/` | `npm run test:integration` |
| **Performance Tests** | Test response times and load handling | `test/performance/` | `npm run test:performance` |
| **Security Tests** | Test security vulnerabilities | `test/security/` | `npm run test:security` |

### **Coverage Requirements:**

| Component | Minimum Coverage | Current Coverage |
|-----------|------------------|------------------|
| **Controllers** | 80% | 82.3% ✅ |
| **Models** | 85% | 88.7% ✅ |
| **Utilities** | 90% | 91.2% ✅ |
| **Services** | 75% | 78.9% ✅ |
| **Overall** | 70% | 75.5% ✅ |

---

## 🚀 **Quick Start Guide**

### **1. Before You Start Coding:**

```bash
# Install dependencies
npm install

# Run all tests to see current state
npm test

# Check coverage
npm run test:coverage
```

### **2. While Developing:**

```bash
# Run tests in watch mode (reruns on file changes)
npm run test:watch

# Run specific test types
npm run test:unit
npm run test:integration
npm run test:performance
```

### **3. Before Committing:**

```bash
# Run all tests
npm test

# Generate coverage report
npm run test:coverage

# Check metrics
node scripts/show-metrics.js
```

---

## 📝 **Writing Tests**

### **Unit Test Example:**

```javascript
// test/unit/controllers/yourController.test.js
const yourController = require('../../controllers/yourController');

describe('Your Controller', () => {
  describe('yourFunction', () => {
    test('should return expected result for valid input', () => {
      const input = { valid: 'data' };
      const result = yourController.yourFunction(input);
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    test('should handle invalid input gracefully', () => {
      const input = { invalid: 'data' };
      const result = yourController.yourFunction(input);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
```

### **Integration Test Example:**

```javascript
// test/integration/yourFeature.test.js
const request = require('supertest');
const app = require('../../index');

describe('Your Feature Integration', () => {
  test('should handle complete workflow', async () => {
    // Test the full API workflow
    const response = await request(app)
      .post('/api/your-endpoint')
      .send({ test: 'data' })
      .expect(201);

    expect(response.body.success).toBe(true);
  });
});
```

### **Performance Test Example:**

```javascript
// test/performance/yourFeature.test.js
const request = require('supertest');
const app = require('../../index');

describe('Your Feature Performance', () => {
  test('should respond within acceptable time', async () => {
    const start = Date.now();
    
    await request(app)
      .get('/api/your-endpoint')
      .expect(200);
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(200); // 200ms threshold
  });
});
```

---

## 🎯 **Testing Best Practices**

### **DO:**
- ✅ Write tests for **every new function**
- ✅ Test **both success and failure cases**
- ✅ Use **descriptive test names**
- ✅ Test **edge cases and boundary conditions**
- ✅ Mock **external dependencies**
- ✅ Keep tests **fast and isolated**
- ✅ Update tests when **changing functionality**

### **DON'T:**
- ❌ Skip tests for "simple" functions
- ❌ Write tests that depend on each other
- ❌ Test implementation details
- ❌ Ignore failing tests
- ❌ Commit without running tests
- ❌ Write tests that are too slow

---

## 🔧 **Test Commands Reference**

### **Basic Commands:**
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- test/unit/yourTest.test.js

# Run tests matching pattern
npm test -- --testNamePattern="your test name"
```

### **Advanced Commands:**
```bash
# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run only performance tests
npm run test:performance

# Run tests with verbose output
npm test -- --verbose

# Run tests and generate coverage report
npm run test:coverage -- --coverageReporters=html
```

---

## 📊 **Understanding Test Results**

### **Test Output:**
```
✅ PASS test/unit/yourTest.test.js
  Your Test Suite
    ✓ should pass basic test (5ms)
    ✓ should handle edge cases (2ms)

❌ FAIL test/unit/anotherTest.test.js
  Another Test Suite
    ✗ should handle invalid input (10ms)
      Expected: true
      Received: false
```

### **Coverage Output:**
```
File      | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
----------|---------|----------|---------|---------|-------------------
All files |   75.5  |   70.2   |   78.9  |   75.5  |
```

### **Performance Metrics:**
```
🚀 API Performance
------------------
Average Response Time: 145ms
P95 Response Time: 280ms
P99 Response Time: 450ms
Throughput: 125 RPS
```

---

## 🚨 **Troubleshooting Common Issues**

### **Test Fails to Run:**
```bash
# Clear Jest cache
npm test -- --clearCache

# Check for syntax errors
node -c yourTestFile.test.js
```

### **Coverage Too Low:**
```bash
# Check what's not covered
npm run test:coverage -- --coverageReporters=text

# Open HTML coverage report
open coverage/lcov-report/index.html
```

### **Performance Tests Failing:**
```bash
# Run performance tests with more time
npm run test:performance -- --testTimeout=30000

# Check if server is running
curl http://localhost:5001/api/health
```

### **Pre-commit Hook Issues:**
```bash
# Run pre-commit hook manually
.husky/pre-commit

# Skip hooks temporarily (NOT RECOMMENDED)
git commit --no-verify -m "your message"
```

---

## 📋 **Checklist Before Submitting PR**

- [ ] **All tests pass** (`npm test`)
- [ ] **Coverage meets requirements** (`npm run test:coverage`)
- [ ] **Performance tests pass** (`npm run test:performance`)
- [ ] **New functionality has tests**
- [ ] **Modified functionality has updated tests**
- [ ] **No console.log statements left in code**
- [ ] **All imports are used**
- [ ] **No unused variables**
- [ ] **Code follows project style guide**

---

## 🆘 **Getting Help**

### **If You're Stuck:**
1. **Check existing tests** for similar functionality
2. **Read the Jest documentation** (https://jestjs.io/docs/getting-started)
3. **Ask in the team chat** for guidance
4. **Look at the test examples** in `test/unit/basic*.test.js`

### **Test Examples to Study:**
- `test/unit/basic.test.js` - Basic test patterns
- `test/unit/controllers/basicController.test.js` - Controller testing
- `test/unit/models/basicModel.test.js` - Model testing
- `test/unit/utils/basicUtils.test.js` - Utility testing

---

## 🎉 **Success!**

When you follow this guide:
- ✅ Your code will be **reliable and bug-free**
- ✅ Your PRs will be **merged faster**
- ✅ You'll **learn best practices**
- ✅ The codebase will **stay maintainable**
- ✅ You'll **catch bugs early**

---

**Remember: Good tests = Good code = Happy team! 🚀**

---

*Last updated: $(date)*
*For questions, contact the development team or create an issue.*
