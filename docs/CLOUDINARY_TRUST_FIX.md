# Cloudinary Trust Issue Fix Guide

## Problem Description

The error `{"error":{"message":"Customer is marked as untrusted","code":"show_original_customer_untrusted"}}` occurs when Cloudinary blocks access to files due to account trust issues.

## Root Causes

1. **Account Verification**: Your Cloudinary account may not be fully verified
2. **API Key Permissions**: Insufficient permissions on your API keys
3. **Account Restrictions**: Cloudinary may have placed restrictions on your account
4. **Suspicious Activity**: Multiple failed uploads or unusual usage patterns

## Solutions Implemented

### 1. Enhanced Upload Configuration

The system now includes:
- Trust-related upload parameters
- Account status verification
- Retry mechanism with exponential backoff
- Fallback upload methods

### 2. Environment Variables

Add these to your `.env` file:

```bash
# Cloudinary Trust Settings
CLOUDINARY_ENABLE_TRUST_CHECK=true
CLOUDINARY_MAX_RETRIES=3
CLOUDINARY_RETRY_DELAY=1000
CLOUDINARY_ENABLE_FALLBACK=true
```

### 3. Account Verification Steps

1. **Verify Your Cloudinary Account**:
   - Log into your Cloudinary dashboard
   - Check if your account shows as "Verified" or "Trusted"
   - Look for any warning messages or restrictions

2. **Check API Key Permissions**:
   - Ensure your API key has "Upload" permissions
   - Verify the key hasn't expired
   - Check if there are IP restrictions

3. **Review Account Status**:
   - Check for any account suspensions
   - Verify billing status
   - Look for usage limits or quotas

### 4. Immediate Fixes

#### Option A: Update Environment Variables
```bash
# Set these in your .env file
CLOUDINARY_ENABLE_TRUST_CHECK=false
CLOUDINARY_ENABLE_FALLBACK=true
```

#### Option B: Use Fallback Upload
The system will automatically try alternative upload methods if the primary method fails.

#### Option C: Disable Trust Checks
```bash
CLOUDINARY_ENABLE_TRUST_CHECK=false
```

### 5. Long-term Solutions

1. **Contact Cloudinary Support**:
   - Explain your use case
   - Request account verification
   - Ask about trust restrictions

2. **Improve Account Standing**:
   - Ensure consistent, legitimate usage
   - Avoid rapid upload bursts
   - Use proper file naming conventions

3. **Alternative Storage**:
   - Consider AWS S3 as backup
   - Use local file storage temporarily
   - Implement hybrid storage strategy

## Testing the Fix

1. **Restart your server** after making changes
2. **Generate a test invoice** to verify upload works
3. **Check console logs** for detailed error information
4. **Monitor Cloudinary dashboard** for upload success

### 🧪 **Testing with the Debug Script**

I've created a comprehensive test script to help debug PDF upload issues:

```bash
# Run the test script
cd bitesbay-backend
node scripts/test-pdf-upload.js
```

This script will:
- ✅ Test basic Cloudinary connectivity
- 📄 Generate a test PDF
- 🔄 Try multiple upload strategies
- 📊 Provide detailed logging
- 🎯 Identify which upload method works

### 🔍 **What the Test Script Checks**

1. **Connectivity Test**: Verifies your Cloudinary credentials work
2. **PDF Generation**: Creates a test PDF to ensure PDFKit works
3. **Upload Strategies**: Tests different Cloudinary upload options:
   - Standard PDF upload
   - PDF as image upload
   - PDF with minimal options
   - PDF without access_mode restriction

### 📋 **Running the Test**

```bash
# Make sure you're in the backend directory
cd bitesbay-backend

# Install dependencies if needed
npm install

# Run the test
node scripts/test-pdf-upload.js
```

### 📊 **Expected Output**

```
🚀 Starting PDF upload tests...

🔧 Cloudinary configuration loaded
☁️ Cloud name: your_cloud_name
🔑 API key: ***1234
🔐 API secret: ***abcd

🔍 Testing Cloudinary connectivity...
✅ Connectivity test passed
🔗 Test file URL: https://res.cloudinary.com/...

📄 Generating test PDF...
✅ Test PDF generated (1234 bytes)

📤 Testing PDF upload...
🔄 Testing strategy: Standard PDF upload
📁 Temp file created: /tmp/test-standard-pdf-upload.pdf (1234 bytes)
✅ Strategy "Standard PDF upload" successful
🔗 Result URL: https://res.cloudinary.com/...

🎉 PDF upload test completed successfully!
✅ Working strategy: Standard PDF upload
🔗 PDF URL: https://res.cloudinary.com/...
```

## Monitoring and Debugging

The system now provides detailed logging:
- Account verification status
- Upload attempts and retries
- Fallback method usage
- Specific error details

Check your console logs for:
```
🔧 Cloudinary configuration loaded: {...}
✅ Cloudinary account status verified
🔄 Upload attempt 1/3 for invoice_123.pdf
✅ Upload successful on attempt 1
```

## Common Error Messages

- `Customer is marked as untrusted`: Account trust issue
- `Invalid API key`: Check your credentials
- `Access denied`: Permission or IP restriction
- `Quota exceeded`: Usage limit reached

## Support Resources

- [Cloudinary Support](https://support.cloudinary.com/)
- [Cloudinary Documentation](https://cloudinary.com/documentation)
- [Account Verification Guide](https://cloudinary.com/documentation/account_verification)

## Emergency Fallback

If all else fails, the system will:
1. Log detailed error information
2. Attempt alternative upload methods
3. Provide fallback URLs when possible
4. Continue with local invoice generation
