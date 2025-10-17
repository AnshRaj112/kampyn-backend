/**
 * Secure URL Validation Utility
 * 
 * This module provides secure URL validation functions to replace
 * vulnerable validator.js isURL() function and prevent XSS and
 * Open Redirect attacks.
 * 
 * @author KAMPYN Backend Team
 * @version 1.0.0
 * @since October 2025
 */

const logger = require('./logger');

/**
 * Allowed protocols for URL validation
 */
const ALLOWED_PROTOCOLS = {
  WEB: ['http:', 'https:'],
  SECURE: ['https:'],
  ALL: ['http:', 'https:', 'ftp:', 'mailto:', 'tel:']
};

/**
 * Allowed hosts for KAMPYN application
 */
const ALLOWED_HOSTS = [
  'kampyn.com',
  'api.kampyn.com',
  'localhost',
  '127.0.0.1'
];

/**
 * Common malicious patterns to block
 */
const MALICIOUS_PATTERNS = [
  /javascript:/i,
  /data:/i,
  /vbscript:/i,
  /file:/i,
  /ftp:/i,
  /@/g, // User info in URLs
  /\\/g // Backslashes
];

/**
 * Validates a URL string for security and format
 * 
 * @param {string} url - The URL to validate
 * @param {Object} options - Validation options
 * @param {string[]} options.allowedProtocols - Allowed protocols (default: ['http:', 'https:'])
 * @param {string[]} options.allowedHosts - Allowed hosts (default: ALLOWED_HOSTS)
 * @param {boolean} options.requireHttps - Require HTTPS protocol (default: false)
 * @param {boolean} options.allowLocalhost - Allow localhost URLs (default: true)
 * @param {boolean} options.strictMode - Enable strict validation (default: true)
 * @returns {Object} Validation result with valid flag and details
 */
const validateURL = (url, options = {}) => {
  const {
    allowedProtocols = ALLOWED_PROTOCOLS.WEB,
    allowedHosts = ALLOWED_HOSTS,
    requireHttps = false,
    allowLocalhost = true,
    strictMode = true
  } = options;

  // Input validation
  if (!url || typeof url !== 'string') {
    return {
      valid: false,
      error: 'Invalid input: URL must be a non-empty string',
      code: 'INVALID_INPUT'
    };
  }

  // Trim whitespace
  const trimmedUrl = url.trim();
  
  if (!trimmedUrl) {
    return {
      valid: false,
      error: 'Invalid input: URL cannot be empty',
      code: 'EMPTY_URL'
    };
  }

  // Check for malicious patterns
  if (strictMode) {
    for (const pattern of MALICIOUS_PATTERNS) {
      if (pattern.test(trimmedUrl)) {
        logger.warn('Malicious URL pattern detected', { url: trimmedUrl, pattern: pattern.toString() });
        return {
          valid: false,
          error: 'Malicious URL pattern detected',
          code: 'MALICIOUS_PATTERN'
        };
      }
    }
  }

  try {
    // Use native URL constructor for secure parsing
    const parsedUrl = new URL(trimmedUrl);
    
    // Validate protocol
    if (!allowedProtocols.includes(parsedUrl.protocol)) {
      return {
        valid: false,
        error: `Protocol '${parsedUrl.protocol}' not allowed`,
        code: 'INVALID_PROTOCOL',
        details: { protocol: parsedUrl.protocol, allowed: allowedProtocols }
      };
    }

    // Require HTTPS for sensitive operations
    if (requireHttps && parsedUrl.protocol !== 'https:') {
      return {
        valid: false,
        error: 'HTTPS protocol required',
        code: 'HTTPS_REQUIRED'
      };
    }

    // Validate hostname
    const hostname = parsedUrl.hostname.toLowerCase();
    
    // Allow localhost in development
    if (allowLocalhost && (hostname === 'localhost' || hostname === '127.0.0.1')) {
      return {
        valid: true,
        parsedUrl,
        hostname: 'localhost'
      };
    }

    // Check against allowed hosts
    if (allowedHosts.length > 0 && !allowedHosts.includes(hostname)) {
      return {
        valid: false,
        error: `Host '${hostname}' not allowed`,
        code: 'INVALID_HOST',
        details: { hostname, allowed: allowedHosts }
      };
    }

    // Additional security checks
    if (strictMode) {
      // Check for suspicious characters in path
      if (/[<>"']/.test(parsedUrl.pathname)) {
        return {
          valid: false,
          error: 'Suspicious characters in URL path',
          code: 'SUSPICIOUS_CHARS'
        };
      }

      // Check for excessive length
      if (trimmedUrl.length > 2048) {
        return {
          valid: false,
          error: 'URL too long',
          code: 'URL_TOO_LONG'
        };
      }
    }

    return {
      valid: true,
      parsedUrl,
      hostname,
      protocol: parsedUrl.protocol
    };

  } catch (error) {
    logger.warn('URL parsing error', { url: trimmedUrl, error: error.message });
    return {
      valid: false,
      error: 'Invalid URL format',
      code: 'INVALID_FORMAT',
      details: { originalError: error.message }
    };
  }
};

/**
 * Validates a redirect URL with strict security rules
 * 
 * @param {string} url - The redirect URL to validate
 * @returns {Object} Validation result
 */
const validateRedirectURL = (url) => {
  return validateURL(url, {
    allowedProtocols: ALLOWED_PROTOCOLS.SECURE,
    allowedHosts: ALLOWED_HOSTS.filter(host => host !== 'localhost' && host !== '127.0.0.1'),
    requireHttps: true,
    allowLocalhost: false,
    strictMode: true
  });
};

/**
 * Validates an API endpoint URL
 * 
 * @param {string} url - The API URL to validate
 * @returns {Object} Validation result
 */
const validateApiURL = (url) => {
  return validateURL(url, {
    allowedProtocols: ALLOWED_PROTOCOLS.WEB,
    allowedHosts: ALLOWED_HOSTS,
    requireHttps: false,
    allowLocalhost: true,
    strictMode: true
  });
};

/**
 * Validates a web URL (for general web links)
 * 
 * @param {string} url - The web URL to validate
 * @returns {Object} Validation result
 */
const validateWebURL = (url) => {
  return validateURL(url, {
    allowedProtocols: ALLOWED_PROTOCOLS.WEB,
    allowedHosts: ALLOWED_HOSTS,
    requireHttps: false,
    allowLocalhost: true,
    strictMode: false
  });
};

/**
 * Express middleware for URL validation
 * 
 * @param {string} fieldName - The field name to validate (default: 'url')
 * @param {Object} options - Validation options
 * @returns {Function} Express middleware function
 */
const urlValidationMiddleware = (fieldName = 'url', options = {}) => {
  return (req, res, next) => {
    const url = req.body[fieldName] || req.query[fieldName] || req.params[fieldName];
    
    if (url) {
      const validation = validateURL(url, options);
      
      if (!validation.valid) {
        logger.warn('URL validation failed', {
          url,
          error: validation.error,
          code: validation.code,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
        
        return res.status(400).json({
          success: false,
          message: 'Invalid URL',
          error: validation.error,
          code: validation.code
        });
      }
      
      // Add validated URL to request object
      req.validatedUrl = validation.parsedUrl;
    }
    
    next();
  };
};

/**
 * Express middleware specifically for redirect URL validation
 * 
 * @param {string} fieldName - The field name to validate (default: 'redirect')
 * @returns {Function} Express middleware function
 */
const redirectValidationMiddleware = (fieldName = 'redirect') => {
  return urlValidationMiddleware(fieldName, {
    allowedProtocols: ALLOWED_PROTOCOLS.SECURE,
    allowedHosts: ALLOWED_HOSTS.filter(host => host !== 'localhost' && host !== '127.0.0.1'),
    requireHttps: true,
    allowLocalhost: false,
    strictMode: true
  });
};

/**
 * Sanitizes a URL by removing potentially dangerous elements
 * 
 * @param {string} url - The URL to sanitize
 * @returns {string} Sanitized URL
 */
const sanitizeURL = (url) => {
  if (!url || typeof url !== 'string') {
    return '';
  }

  let sanitized = url.trim();
  
  // Remove user info (username:password@)
  sanitized = sanitized.replace(/^[^:]+:[^@]+@/, '');
  
  // Remove fragments for security
  sanitized = sanitized.split('#')[0];
  
  // Remove suspicious characters
  sanitized = sanitized.replace(/[<>"']/g, '');
  
  return sanitized;
};

/**
 * Tests the URL validation with common attack vectors
 * 
 * @returns {Object} Test results
 */
const runSecurityTests = () => {
  const testCases = [
    // Malicious URLs that should be blocked
    { url: 'javascript:alert("XSS")', shouldBeValid: false },
    { url: 'data:text/html,<script>alert("XSS")</script>', shouldBeValid: false },
    { url: 'vbscript:msgbox("XSS")', shouldBeValid: false },
    { url: 'file:///etc/passwd', shouldBeValid: false },
    { url: 'ftp://malicious.com', shouldBeValid: false },
    { url: 'http://evil.com@trusted.com', shouldBeValid: false },
    { url: 'http://trusted.com.evil.com', shouldBeValid: false },
    { url: 'http://trusted.com\\.evil.com', shouldBeValid: false },
    
    // Valid URLs that should be allowed
    { url: 'https://kampyn.com', shouldBeValid: true },
    { url: 'https://api.kampyn.com/orders', shouldBeValid: true },
    { url: 'http://localhost:3000', shouldBeValid: true },
    { url: 'https://kampyn.com/path?query=value', shouldBeValid: true }
  ];

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  testCases.forEach((testCase, index) => {
    const result = validateURL(testCase.url);
    const passed = result.valid === testCase.shouldBeValid;
    
    results.tests.push({
      index: index + 1,
      url: testCase.url,
      expected: testCase.shouldBeValid,
      actual: result.valid,
      passed,
      error: result.error || null
    });

    if (passed) {
      results.passed++;
    } else {
      results.failed++;
    }
  });

  return results;
};

module.exports = {
  validateURL,
  validateRedirectURL,
  validateApiURL,
  validateWebURL,
  urlValidationMiddleware,
  redirectValidationMiddleware,
  sanitizeURL,
  runSecurityTests,
  ALLOWED_PROTOCOLS,
  ALLOWED_HOSTS
};
