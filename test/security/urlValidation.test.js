/**
 * Security Tests for URL Validation
 * 
 * Tests to ensure the secure URL validation prevents
 * CVE-2025-56200 validator.js vulnerability attacks.
 * 
 * @author KAMPYN Backend Team
 * @version 1.0.0
 * @since October 2025
 */

const { 
  validateURL, 
  validateRedirectURL, 
  validateApiURL,
  validateWebURL,
  runSecurityTests 
} = require('../../utils/secureUrlValidation');

describe('Secure URL Validation Tests', () => {
  
  describe('validateURL()', () => {
    
    describe('Malicious URL Protection', () => {
      const maliciousUrls = [
        'javascript:alert("XSS")',
        'data:text/html,<script>alert("XSS")</script>',
        'vbscript:msgbox("XSS")',
        'file:///etc/passwd',
        'ftp://malicious.com',
        'http://evil.com@trusted.com',
        'http://trusted.com.evil.com',
        'http://trusted.com\\.evil.com',
        'javascript://example.com/%0aalert(1)',
        'data://text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
        'vbscript://example.com/msgbox("XSS")',
        'file:///etc/passwd%00.html',
        'ftp://malicious.com@trusted.com'
      ];

      test('should reject all malicious URLs', () => {
        maliciousUrls.forEach(url => {
          const result = validateURL(url);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.code).toBeDefined();
        });
      });
    });

    describe('Valid URL Acceptance', () => {
      const validUrls = [
        'https://kampyn.com',
        'https://api.kampyn.com/orders',
        'http://localhost:3000',
        'https://kampyn.com/path?query=value',
        'https://kampyn.com/path#fragment',
        'http://127.0.0.1:3000'
      ];

      test('should accept all valid URLs', () => {
        validUrls.forEach(url => {
          const result = validateURL(url);
          expect(result.valid).toBe(true);
          expect(result.parsedUrl).toBeDefined();
          expect(result.hostname).toBeDefined();
        });
      });
    });

    describe('Protocol Validation', () => {
      test('should reject non-HTTP protocols by default', () => {
        const result = validateURL('ftp://example.com');
        expect(result.valid).toBe(false);
        expect(result.code).toBe('INVALID_PROTOCOL');
      });

      test('should accept custom allowed protocols', () => {
        const result = validateURL('ftp://example.com', {
          allowedProtocols: ['http:', 'https:', 'ftp:']
        });
        expect(result.valid).toBe(true);
      });

      test('should require HTTPS when specified', () => {
        const result = validateURL('http://kampyn.com', {
          requireHttps: true
        });
        expect(result.valid).toBe(false);
        expect(result.code).toBe('HTTPS_REQUIRED');
      });
    });

    describe('Host Validation', () => {
      test('should reject unauthorized hosts', () => {
        const result = validateURL('https://malicious.com');
        expect(result.valid).toBe(false);
        expect(result.code).toBe('INVALID_HOST');
      });

      test('should accept localhost in development', () => {
        const result = validateURL('http://localhost:3000');
        expect(result.valid).toBe(true);
      });

      test('should reject localhost when disabled', () => {
        const result = validateURL('http://localhost:3000', {
          allowLocalhost: false
        });
        expect(result.valid).toBe(false);
      });
    });

    describe('Input Validation', () => {
      test('should handle null/undefined input', () => {
        expect(validateURL(null).valid).toBe(false);
        expect(validateURL(undefined).valid).toBe(false);
        expect(validateURL('').valid).toBe(false);
      });

      test('should handle non-string input', () => {
        expect(validateURL(123).valid).toBe(false);
        expect(validateURL({}).valid).toBe(false);
        expect(validateURL([]).valid).toBe(false);
      });

      test('should trim whitespace', () => {
        const result = validateURL('  https://kampyn.com  ');
        expect(result.valid).toBe(true);
      });
    });

    describe('Length Validation', () => {
      test('should reject URLs that are too long', () => {
        const longUrl = 'https://kampyn.com/' + 'a'.repeat(3000);
        const result = validateURL(longUrl);
        expect(result.valid).toBe(false);
        expect(result.code).toBe('URL_TOO_LONG');
      });
    });
  });

  describe('validateRedirectURL()', () => {
    test('should require HTTPS for redirects', () => {
      const result = validateRedirectURL('http://kampyn.com');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('HTTPS_REQUIRED');
    });

    test('should reject localhost for redirects', () => {
      const result = validateRedirectURL('https://localhost');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_HOST');
    });

    test('should accept valid HTTPS redirects', () => {
      const result = validateRedirectURL('https://kampyn.com/dashboard');
      expect(result.valid).toBe(true);
    });
  });

  describe('validateApiURL()', () => {
    test('should accept HTTP and HTTPS for API URLs', () => {
      expect(validateApiURL('http://api.kampyn.com').valid).toBe(true);
      expect(validateApiURL('https://api.kampyn.com').valid).toBe(true);
    });

    test('should accept localhost for API URLs', () => {
      expect(validateApiURL('http://localhost:3000/api').valid).toBe(true);
    });
  });

  describe('validateWebURL()', () => {
    test('should be less strict than redirect validation', () => {
      expect(validateWebURL('http://kampyn.com').valid).toBe(true);
      expect(validateWebURL('https://kampyn.com').valid).toBe(true);
    });
  });

  describe('Security Test Suite', () => {
    test('should pass all security tests', () => {
      const results = runSecurityTests();
      
      console.log('Security Test Results:', {
        passed: results.passed,
        failed: results.failed,
        total: results.tests.length
      });
      
      expect(results.failed).toBe(0);
      expect(results.passed).toBe(results.tests.length);
    });

    test('should log failed tests for debugging', () => {
      const results = runSecurityTests();
      
      const failedTests = results.tests.filter(test => !test.passed);
      if (failedTests.length > 0) {
        console.log('Failed Tests:');
        failedTests.forEach(test => {
          console.log(`  ${test.index}. ${test.url}`);
          console.log(`     Expected: ${test.expected}, Got: ${test.actual}`);
          console.log(`     Error: ${test.error}`);
        });
      }
    });
  });

  describe('CVE-2025-56200 Specific Tests', () => {
    test('should prevent URL validation bypass attacks', () => {
      // These are the specific attack vectors mentioned in CVE-2025-56200
      const bypassAttempts = [
        'javascript://example.com/%0aalert(1)',
        'data://text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
        'vbscript://example.com/msgbox("XSS")',
        'file:///etc/passwd%00.html',
        'javascript:alert(String.fromCharCode(88,83,83))',
        'data:text/html;charset=utf-8,<script>alert("XSS")</script>'
      ];

      bypassAttempts.forEach(url => {
        const result = validateURL(url);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    test('should handle protocol parsing correctly', () => {
      // Test that our validation correctly parses protocols using ':'
      // instead of '://' like the vulnerable validator.js
      const testUrls = [
        'http://kampyn.com',
        'https://kampyn.com',
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>'
      ];

      testUrls.forEach(url => {
        const result = validateURL(url);
        
        if (url.startsWith('http')) {
          expect(result.valid).toBe(true);
        } else {
          expect(result.valid).toBe(false);
        }
      });
    });
  });
});
