/**
 * URL validation utilities for secure URL handling
 * Prevents URL-based attacks like SSRF and malicious redirects
 */

/**
 * Validates if a URL belongs to an allowed host
 * @param {string} url - The URL to validate
 * @param {string[]} allowedHosts - Array of allowed hostnames
 * @returns {boolean} - True if URL is safe, false otherwise
 */
function isValidUrl(url, allowedHosts) {
  try {
    const urlObj = new URL(url);
    return allowedHosts.includes(urlObj.hostname);
  } catch (error) {
    // Invalid URL format
    return false;
  }
}

/**
 * Validates Cloudinary URLs specifically
 * @param {string} url - The URL to validate
 * @returns {boolean} - True if it's a valid Cloudinary URL
 */
function isValidCloudinaryUrl(url) {
  const allowedCloudinaryHosts = [
    'res.cloudinary.com',
    'cloudinary.com'
  ];
  
  return isValidUrl(url, allowedCloudinaryHosts);
}

/**
 * Validates Razorpay URLs specifically
 * @param {string} url - The URL to validate
 * @returns {boolean} - True if it's a valid Razorpay URL
 */
function isValidRazorpayUrl(url) {
  const allowedRazorpayHosts = [
    'api.razorpay.com',
    'razorpay.com'
  ];
  
  return isValidUrl(url, allowedRazorpayHosts);
}

/**
 * Validates if a URL is safe for external requests
 * @param {string} url - The URL to validate
 * @returns {boolean} - True if URL is safe for external requests
 */
function isSafeExternalUrl(url) {
  const allowedHosts = [
    'res.cloudinary.com',
    'cloudinary.com',
    'api.razorpay.com',
    'razorpay.com'
  ];
  
  return isValidUrl(url, allowedHosts);
}

module.exports = {
  isValidUrl,
  isValidCloudinaryUrl,
  isValidRazorpayUrl,
  isSafeExternalUrl
};
