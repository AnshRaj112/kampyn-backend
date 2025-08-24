/**
 * Test script for customer name sanitization
 * This script tests various customer name scenarios to ensure they're properly sanitized for Razorpay
 */

// Test customer names that might cause issues
const testNames = [
  'John Doe',
  'John@Doe',
  'John#Doe',
  'John$Doe',
  'John%Doe',
  'John^Doe',
  'John&Doe',
  'John*Doe',
  'John(Doe)',
  'John[Doe]',
  'John{Doe}',
  'John<Doe>',
  'John/Doe',
  'John\\Doe',
  'John|Doe',
  'John;Doe',
  'John:Doe',
  'John"Doe',
  "John'Doe",
  'John`Doe',
  'John~Doe',
  'John!Doe',
  'John?Doe',
  'John.Doe',
  'John,Doe',
  'John+Doe',
  'John=Doe',
  'John_Doe',
  'John-Doe',
  '   John   Doe   ',
  'John    Doe',
  'John\nDoe',
  'John\tDoe',
  'John\rDoe',
  'John\fDoe',
  'John\vDoe',
  'John\u0000Doe', // Null character
  'John\u0001Doe', // Start of heading
  'John\u0002Doe', // Start of text
  'John\u0003Doe', // End of text
  'John\u0004Doe', // End of transmission
  'John\u0005Doe', // Enquiry
  'John\u0006Doe', // Acknowledge
  'John\u0007Doe', // Bell
  'John\u0008Doe', // Backspace
  'John\u0009Doe', // Horizontal tab
  'John\u000ADoe', // Line feed
  'John\u000BDoe', // Vertical tab
  'John\u000CDoe', // Form feed
  'John\u000DDoe', // Carriage return
  'John\u000EDoe', // Shift out
  'John\u000FDoe', // Shift in
  'John\u0010Doe', // Data link escape
  'John\u0011Doe', // Device control 1
  'John\u0012Doe', // Device control 2
  'John\u0013Doe', // Device control 3
  'John\u0014Doe', // Device control 4
  'John\u0015Doe', // Negative acknowledge
  'John\u0016Doe', // Synchronous idle
  'John\u0017Doe', // End of transmission block
  'John\u0018Doe', // Cancel
  'John\u0019Doe', // End of medium
  'John\u001ADoe', // Substitute
  'John\u001BDoe', // Escape
  'John\u001CDoe', // File separator
  'John\u001DDoe', // Group separator
  'John\u001EDoe', // Record separator
  'John\u001FDoe', // Unit separator
  'John\u007FDoe', // Delete
  'John\u0080Doe', // Padding character
  'John\u0081Doe', // High octet preset
  'John\u0082Doe', // Break permitted here
  'John\u0083Doe', // No break here
  'John\u0084Doe', // Index
  'John\u0085Doe', // Next line
  'John\u0086Doe', // Start of selected area
  'John\u0087Doe', // End of selected area
  'John\u0088Doe', // Character tabulation set
  'John\u0089Doe', // Character tabulation with justification
  'John\u008ADoe', // Line tabulation set
  'John\u008BDoe', // Partial line forward
  'John\u008CDoe', // Partial line backward
  'John\u008DDoe', // Reverse line feed
  'John\u008EDoe', // Single shift 2
  'John\u008FDoe', // Single shift 3
  'John\u0090Doe', // Device control string
  'John\u0091Doe', // Private use 1
  'John\u0092Doe', // Private use 2
  'John\u0093Doe', // Set transmit state
  'John\u0094Doe', // Cancel character
  'John\u0095Doe', // Message waiting
  'John\u0096Doe', // Start of protected area
  'John\u0097Doe', // End of protected area
  'John\u0098Doe', // Start of string
  'John\u0099Doe', // Single graphic character introducer
  'John\u009ADoe', // Single character introducer
  'John\u009BDoe', // Control sequence introducer
  'John\u009CDoe', // String terminator
  'John\u009DDoe', // Operating system command
  'John\u009EDoe', // Privacy message
  'John\u009FDoe', // Application program command
  '', // Empty string
  null, // Null
  undefined, // Undefined
  '   ', // Only spaces
  '\n\t\r', // Only whitespace characters
  'A'.repeat(100), // Very long name
  'A'.repeat(51), // Name just over limit
  'A'.repeat(50), // Name at limit
  'A'.repeat(49), // Name just under limit
];

/**
 * Sanitize customer name for Razorpay
 * @param {string} customerName - The original customer name
 * @returns {string} - The sanitized customer name
 */
function sanitizeCustomerName(customerName) {
  if (!customerName) return 'Customer';
  
  const trimmed = customerName.toString().trim();
  if (trimmed.length === 0) return 'Customer';
  
  // Remove special characters except spaces
  const sanitized = trimmed
    .replace(/[^\w\s]/g, '') // Remove special characters except spaces
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim()
    .substring(0, 50); // Limit to 50 characters
  
  return sanitized || 'Customer';
}

/**
 * Test the sanitization function
 */
function testSanitization() {
  console.log('🧪 Testing customer name sanitization...\n');
  
  testNames.forEach((name, index) => {
    const sanitized = sanitizeCustomerName(name);
    const original = name === null ? 'null' : name === undefined ? 'undefined' : `"${name}"`;
    
    console.log(`Test ${index + 1}:`);
    console.log(`  Original: ${original}`);
    console.log(`  Sanitized: "${sanitized}"`);
    console.log(`  Length: ${sanitized.length}`);
    console.log(`  Valid: ${sanitized.length > 0 && sanitized.length <= 50}`);
    console.log('');
  });
  
  // Test edge cases
  console.log('🔍 Edge case tests:');
  
  const edgeCases = [
    { name: 'John Doe', expected: 'John Doe' },
    { name: 'John@Doe', expected: 'JohnDoe' },
    { name: '   John   Doe   ', expected: 'John Doe' },
    { name: '', expected: 'Customer' },
    { name: null, expected: 'Customer' },
    { name: undefined, expected: 'Customer' },
    { name: 'A'.repeat(100), expected: 'A'.repeat(50) },
    { name: 'A'.repeat(51), expected: 'A'.repeat(50) },
    { name: 'A'.repeat(50), expected: 'A'.repeat(50) },
    { name: 'A'.repeat(49), expected: 'A'.repeat(49) },
  ];
  
  edgeCases.forEach((testCase, index) => {
    const result = sanitizeCustomerName(testCase.name);
    const passed = result === testCase.expected;
    
    console.log(`  Test ${index + 1}: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`    Input: ${testCase.name === null ? 'null' : testCase.name === undefined ? 'undefined' : `"${testCase.name}"`}`);
    console.log(`    Expected: "${testCase.expected}"`);
    console.log(`    Got: "${result}"`);
    console.log('');
  });
}

// Run the tests
if (require.main === module) {
  testSanitization();
}

module.exports = { sanitizeCustomerName };
