# Invoice Configuration Guide

This document describes the configuration options available for invoice generation in the BitesBay system.

## Environment Variables

### Razorpay Invoice Configuration

The following environment variables control Razorpay invoice creation behavior:

#### `ENABLE_RAZORPAY_INVOICES`
- **Default**: `true`
- **Description**: Set to `false` to completely disable Razorpay invoice creation
- **Use Case**: Useful when you want to generate only local invoices without external service dependencies

```bash
# Disable Razorpay invoices
ENABLE_RAZORPAY_INVOICES=false
```

#### `SKIP_RAZORPAY_FOR_INCOMPLETE_DATA`
- **Default**: `true`
- **Description**: Set to `true` to skip Razorpay invoice creation for orders with insufficient customer data
- **Use Case**: Prevents trust issues by only creating Razorpay invoices when customer data is complete

```bash
# Skip Razorpay for incomplete data
SKIP_RAZORPAY_FOR_INCOMPLETE_DATA=true
```

#### `MIN_CUSTOMER_DATA_QUALITY`
- **Default**: `70`
- **Description**: Minimum customer data quality score (0-100) required to proceed with Razorpay
- **Use Case**: Higher values require more complete customer information before creating Razorpay invoices

```bash
# Require high-quality customer data
MIN_CUSTOMER_DATA_QUALITY=85
```

## Customer Data Validation

The system automatically validates customer data before creating Razorpay invoices:

### Required Fields
- **Customer Name**: Must be present, not contain suspicious patterns (test, demo, sample)
- **Phone Number**: Must be a valid 10-digit Indian mobile number
- **Billing Address**: Must be present and not contain test patterns

### Suspicious Pattern Detection
The system automatically detects and rejects:
- Names containing: `test`, `customer`, `demo`, `sample`
- Phone numbers: `0000000000`, `9999999999`
- Addresses containing: `test`

### Data Sanitization
- Removes special characters (except spaces, hyphens, underscores)
- Limits name length to 50 characters
- Normalizes whitespace
- Provides fallback values for missing data

## Fallback Behavior

When Razorpay invoice creation fails or is skipped:

1. **Local Invoice Generation**: Continues with local invoice creation
2. **PDF Generation**: Generates and uploads PDF to Cloudinary
3. **Database Storage**: Saves invoice data to local database
4. **Error Logging**: Logs detailed error information for debugging

## Error Handling

### Trust Issues
- **Error Code**: `show_original_customer_untrusted`
- **Cause**: Customer data flagged as suspicious by Razorpay
- **Solution**: Ensure customer data is complete and valid

### Validation Failures
- **Phone Format**: Must be 10-digit Indian mobile number
- **Name Quality**: Must not contain suspicious patterns
- **Address Quality**: Must be real address without test patterns

## Best Practices

1. **Collect Complete Customer Data**: Ensure all required fields are filled
2. **Validate Phone Numbers**: Use real, valid Indian mobile numbers
3. **Use Real Addresses**: Avoid placeholder or test addresses
4. **Monitor Logs**: Check console logs for validation failures
5. **Test with Real Data**: Use actual customer information for testing

## Troubleshooting

### Common Issues

#### "Customer is marked as untrusted"
- **Cause**: Insufficient or suspicious customer data
- **Solution**: Verify customer name, phone, and address are complete and valid

#### "Invalid phone number format"
- **Cause**: Phone number doesn't match Indian mobile format
- **Solution**: Ensure phone number is 10 digits starting with 6-9

#### "Invalid billing address"
- **Cause**: Address contains test patterns or is missing
- **Solution**: Provide real, complete billing address

### Debug Information

The system provides detailed logging:
- Original customer data
- Sanitized customer data
- Validation results
- Error details and reasons
- Fallback decisions

Check console logs for detailed information about invoice generation process.
