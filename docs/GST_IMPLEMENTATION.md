# GST Implementation for KAMPYN Invoices

## Overview

This document outlines the implementation of GST (Goods and Services Tax) functionality in the KAMPYN invoice system. The implementation includes detailed GST calculations, HSN codes, vendor location tracking, and comprehensive invoice breakdowns.

## Features Implemented

### 1. GST Number Management
- **University GST Numbers**: Each university must have a GST number
- **Vendor GST Numbers**: Vendors can optionally have their own GST numbers
- **GST Preference**: Vendors can choose to use either their own GST number or the university's GST number

### 2. Enhanced Invoice Details
- **Vendor Location**: Displays vendor location on invoices
- **GST Number Display**: Shows which GST number is being used (vendor or university)
- **HSN Codes**: Includes HSN (Harmonized System of Nomenclature) codes for each item
- **Detailed GST Breakdown**: 
  - Price before GST
  - GST percentage
  - CGST amount and percentage
  - SGST amount and percentage
  - Total after GST

### 3. Comprehensive Financial Breakdown
- **Subtotal before GST**: Base amount excluding taxes
- **Individual Item GST**: GST calculation for each item
- **Total GST Amounts**: Sum of all GST, CGST, and SGST
- **Additional Charges**: Packaging and delivery charges
- **Final Total**: Complete amount including all taxes and charges

## Database Schema Changes

### University Model (`models/account/Uni.js`)
```javascript
// Added GST Information
gstNumber: { type: String, required: true, unique: true }
```

### Vendor Model (`models/account/Vendor.js`)
```javascript
// Added GST Information
gstNumber: { type: String }, // Optional - vendor can have their own GST number
useUniGstNumber: { type: Boolean, default: true } // Whether to use university's GST number
```

### Invoice Model (`models/invoice/Invoice.js`)
```javascript
// Added GST Information
vendorLocation: { type: String, required: true }
gstNumber: { type: String, required: true }
gstNumberType: { type: String, enum: ["vendor", "university"], required: true }

// Enhanced financial details
subtotalBeforeGst: { type: Number, required: true }
cgstAmount: { type: Number, required: true }
sgstAmount: { type: Number, required: true }

// Enhanced items with GST breakdown
items: [{
  // ... existing fields
  priceBeforeGst: Number,
  hsnCode: String,
  cgstPercentage: Number,
  sgstPercentage: Number,
  cgstAmount: Number,
  sgstAmount: Number,
  totalAfterGst: Number
}]
```

## GST Calculation Logic

### 1. GST Number Selection
```javascript
// Determine which GST number to use
const effectiveGstNumber = vendor.useUniGstNumber ? 
  university.gstNumber : 
  (vendor.gstNumber || university.gstNumber);

const gstNumberType = vendor.useUniGstNumber ? 'university' : 'vendor';
```

### 2. Item GST Calculation
```javascript
const priceBeforeGst = item.price / (1 + (item.gstPercentage || 0) / 100);
const gstAmount = item.price - priceBeforeGst;
const cgstAmount = gstAmount / 2; // CGST is half of total GST
const sgstAmount = gstAmount / 2; // SGST is half of total GST
```

### 3. Total GST Aggregation
```javascript
const totalGstAmount = itemsWithGst.reduce((sum, item) => sum + item.gstAmount, 0);
const totalCgstAmount = itemsWithGst.reduce((sum, item) => sum + item.cgstAmount, 0);
const totalSgstAmount = itemsWithGst.reduce((sum, item) => sum + item.sgstAmount, 0);
```

## Invoice Generation Process

### 1. Vendor Invoice
- Calculates GST for each item based on item's GST percentage
- Includes vendor location and GST number information
- Shows detailed breakdown of CGST and SGST for each item
- Displays HSN codes for all items

### 2. Platform Invoice
- Fixed ₹2 platform fee with 18% GST breakdown
- Uses the same GST number as the vendor invoice
- Shows CGST (9%) and SGST (9%) separately

## PDF Invoice Layout

### Header Section
- Company name (KAMPYN)
- Invoice type (Vendor/Platform)
- Invoice number and order details
- Date and due date

### GST Information Section
- GST number display
- GST number type (vendor/university)

### Vendor and University Details
- Vendor name and location
- University name

### Customer Information
- Customer name, phone, and address

### Items Table
| Column | Description |
|--------|-------------|
| Item | Item name (truncated to 12 chars) |
| HSN | HSN code for the item |
| Qty | Quantity ordered |
| Price | Unit price (including GST) |
| Before GST | Price excluding GST |
| GST% | GST percentage for the item |
| CGST | CGST amount for the item |
| SGST | SGST amount for the item |
| Total | Total price for the item |

### Financial Summary
- Subtotal (before GST)
- Total CGST
- Total SGST
- Total GST
- Packaging charge (if applicable)
- Delivery charge (if applicable)
- **Final Total Amount**

## Setup and Configuration

### 1. Run the GST Implementation Script
```bash
cd bitesbay-backend
node scripts/add-gst-numbers.js
```

This script will:
- Add fake GST numbers to existing universities
- Update vendor schema with new GST fields
- Set default GST preferences for vendors

### 2. Environment Variables
Ensure the following environment variables are set:
```bash
MONGODB_URI=your_mongodb_connection_string
```

### 3. Restart Application
After running the script, restart your application to load the new models.

## Testing the Implementation

### 1. Verify GST Numbers
- Check that universities have GST numbers assigned
- Verify vendor GST preferences are set correctly

### 2. Generate Test Invoices
- Create a test order
- Generate invoices for the order
- Verify that invoices include all GST information

### 3. Check PDF Output
- Download generated invoices
- Verify GST breakdown is correct
- Check that HSN codes are displayed
- Confirm vendor location is shown

## API Endpoints

The existing invoice endpoints remain unchanged, but now return enhanced data:

### GET `/invoices/:invoiceId`
Returns invoice with all GST details:
```json
{
  "success": true,
  "data": {
    "invoiceNumber": "V2024120001",
    "gstNumber": "27ABCDE1234F1Z5",
    "gstNumberType": "university",
    "vendorLocation": "Mumbai",
    "subtotalBeforeGst": 100.00,
    "cgstAmount": 9.00,
    "sgstAmount": 9.00,
    "gstAmount": 18.00,
    "items": [
      {
        "name": "Item Name",
        "hsnCode": "HSN123",
        "priceBeforeGst": 50.00,
        "cgstAmount": 4.50,
        "sgstAmount": 4.50,
        "gstAmount": 9.00
      }
    ]
  }
}
```

## Troubleshooting

### Common Issues

1. **GST Numbers Not Showing**
   - Ensure the GST implementation script has been run
   - Check that universities have GST numbers assigned
   - Verify vendor GST preferences are set

2. **GST Calculations Incorrect**
   - Check item GST percentages in the database
   - Verify HSN codes are present for items
   - Ensure price calculations include GST

3. **PDF Generation Errors**
   - Check that all required fields are present
   - Verify GST calculations are complete
   - Ensure item data includes all required fields

### Debug Logging

The system includes comprehensive logging for GST operations:
```javascript
console.log('🏷️ GST Information:', {
  vendorGstNumber: vendor.gstNumber,
  universityGstNumber: university.gstNumber,
  effectiveGstNumber: effectiveGstNumber,
  gstNumberType: gstNumberType
});
```

## Future Enhancements

### 1. GST Rate Management
- Dynamic GST rate updates
- Different rates for different item categories
- Seasonal rate changes

### 2. Advanced Tax Features
- Input tax credit calculations
- Reverse charge mechanism
- Export/import GST handling

### 3. Compliance Features
- GST return generation
- Tax period reporting
- Audit trail for tax calculations

## Support and Maintenance

For issues related to GST implementation:
1. Check the application logs for GST-related errors
2. Verify database schema updates were applied correctly
3. Ensure all required fields are populated
4. Test with sample data to isolate issues

## Compliance Notes

- This implementation follows standard Indian GST calculation methods
- CGST and SGST are calculated as equal halves of total GST
- HSN codes should be accurate for proper tax classification
- GST numbers should be validated for format and authenticity in production

---

**Last Updated**: October 2025
**Version**: 1.0.0
**Author**: KAMPYN Development Team
