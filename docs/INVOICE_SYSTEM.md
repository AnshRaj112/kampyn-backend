# Invoice System Documentation

## Overview

The KAMPYN invoice system automatically generates two invoices for every order:
1. **Vendor Invoice**: Contains the order total minus platform fee, sent to the vendor
2. **Platform Invoice**: Contains the platform fee plus GST, sent to the admin

## Features

- ✅ Automatic invoice generation after order completion
- ✅ Razorpay integration for professional invoice creation
- ✅ PDF generation and Cloudinary storage
- ✅ Separate invoices for vendors and platform
- ✅ GST calculation and breakdown
- ✅ Bulk download functionality
- ✅ Date range filtering and search
- ✅ Role-based access control

## System Architecture

### Models

#### Invoice Model (`models/invoice/Invoice.js`)
- Stores invoice metadata, financial details, and file URLs
- Supports both vendor and platform invoice types
- Includes Razorpay integration fields
- Automatic invoice number generation

### Utilities

#### Invoice Utils (`utils/invoiceUtils.js`)
- **PDF Generation**: Creates professional PDF invoices using PDFKit
- **Razorpay Integration**: Creates invoices via Razorpay API
- **Cloudinary Upload**: Stores PDFs in cloud storage
- **Invoice Creation**: Handles both vendor and platform invoice generation

### Controllers

#### Invoice Controller (`controllers/invoiceController.js`)
- **Vendor Invoices**: Get invoices for specific vendors
- **Admin Invoices**: Get platform invoices for admin
- **University Invoices**: Get invoices for specific universities
- **Bulk Download**: Export multiple invoices by date range
- **Statistics**: Get invoice counts and amounts

### Routes

#### Invoice Routes (`routes/invoiceRoutes.js`)
- **Public**: Order invoices, invoice details, downloads
- **Vendor**: Vendor-specific invoice access
- **University**: University-wide invoice access
- **Admin**: Platform invoice management and bulk operations

## API Endpoints

### Public Routes
```
GET /api/invoices/order/:orderId     - Get invoices for specific order
GET /api/invoices/:invoiceId         - Get invoice details
GET /api/invoices/download/:invoiceId - Download invoice PDF
```

### Vendor Routes
```
GET /api/invoices/vendor/:vendorId   - Get vendor invoices (authenticated)
```

### University Routes
```
GET /api/invoices/university/:uniId  - Get university invoices (authenticated)
```

### Admin Routes
```
GET /api/invoices/admin              - Get platform invoices
GET /api/invoices/stats              - Get invoice statistics
POST /api/invoices/bulk-download     - Get invoices for bulk export
POST /api/invoices/generate-order-invoices - Manually generate invoices
```

### Admin Dashboard Routes
```
GET /admin/invoices                  - Admin invoice management page
GET /admin/invoices/stats            - Invoice statistics
POST /admin/invoices/bulk-download   - Bulk download
POST /admin/invoices/generate-order-invoices - Manual generation
```

## Invoice Generation Flow

### 1. Order Completion
When an order is successfully paid:
- Payment verification completes
- Order is created in database
- Invoice generation is triggered asynchronously

### 2. Invoice Data Preparation
```javascript
const orderDataForInvoice = {
  orderId: order._id,
  orderNumber: order.orderNumber,
  vendorId,
  total: finalTotal,
  collectorName,
  collectorPhone,
  address,
  items: cart.map(item => ({
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    kind: item.kind,
    gstPercentage: item.gstPercentage || 0,
    unit: item.unit,
    packable: item.packable
  })),
  packagingCharge: orderDetails.packingCharge || 0,
  deliveryCharge: orderDetails.deliveryCharge || 0
};
```

### 3. Dual Invoice Creation
- **Vendor Invoice**: `total - platformFee` (no platform GST)
- **Platform Invoice**: `platformFee + GST` (18% GST on platform fee)

### 4. Razorpay Integration
- Creates professional invoices via Razorpay API
- Includes customer details, line items, and notes
- Sets expiration dates (30 days)

### 5. PDF Generation
- Uses PDFKit to create branded PDF invoices
- Includes company header, invoice details, items table, and totals
- Professional formatting with proper spacing

### 6. Cloud Storage
- Uploads PDF to Cloudinary
- Stores in 'invoices' folder
- Generates public URLs for download

## Financial Calculations

### Platform Fee Structure
- **Base Platform Fee**: ₹2 (fixed)
- **GST on Platform Fee**: ₹2 × 18% = ₹0.36
- **Total Platform Invoice**: ₹2.36

### Vendor Invoice
- **Order Total**: User pays full amount
- **Vendor Receives**: Total - ₹2 (platform fee)
- **Platform Keeps**: ₹2 + GST

### Example Calculation
```
Order Total: ₹150
Platform Fee: ₹2
GST on Platform: ₹0.36
Vendor Invoice: ₹148
Platform Invoice: ₹2.36
```

## Frontend Components

### Admin Invoice Management (`/admin/invoices`)
- **Statistics Dashboard**: Shows invoice counts and amounts
- **Filtering**: Date range, status, vendor, university
- **Invoice Table**: Displays all invoices with actions
- **Bulk Operations**: Export and download functionality

### Vendor Invoice Access
- Vendors can view their invoices
- Download PDF copies
- Access Razorpay invoice URLs

### University Invoice Access
- University admins can view all invoices
- Filter by vendor, type, and date range
- Access to both vendor and platform invoices

## Security & Permissions

### Role-Based Access
- **Public**: Basic invoice viewing and downloads
- **Vendor**: Access to own invoices only
- **University**: Access to university invoices
- **Admin**: Full access to all invoices and management

### Required Permissions
- `viewInvoices`: View invoice lists and details
- `downloadInvoices`: Access bulk download functionality
- `generateInvoices`: Manually generate invoices

## Configuration

### Environment Variables
```bash
# Razorpay Configuration
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### Dependencies
```json
{
  "razorpay": "^2.9.6",
  "pdfkit": "^0.14.0",
  "cloudinary": "^2.6.0"
}
```

## Usage Examples

### Generate Invoices for Existing Order
```javascript
// Admin can manually generate invoices for orders
POST /api/admin/invoices/generate-order-invoices
{
  "orderId": "order_id_here"
}
```

### Bulk Download by Date Range
```javascript
POST /api/invoices/bulk-download
{
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "vendorId": "optional_vendor_id",
  "uniId": "optional_university_id"
}
```

### Get Invoice Statistics
```javascript
GET /api/invoices/stats?startDate=2024-01-01&endDate=2024-01-31
```

## Error Handling

### Invoice Generation Failures
- Invoice generation runs asynchronously
- Payment processing continues even if invoice generation fails
- Errors are logged but don't affect order completion
- Manual invoice generation available for failed cases

### Common Issues
- **Missing Dependencies**: Ensure all required packages are installed
- **API Keys**: Verify Razorpay and Cloudinary credentials
- **File Permissions**: Check temporary file creation permissions
- **Memory Issues**: Large PDFs may require increased memory limits

## Monitoring & Maintenance

### Logs to Monitor
- Invoice generation success/failure
- PDF upload status
- Razorpay API responses
- File storage operations

### Regular Maintenance
- Clean up temporary files
- Monitor Cloudinary storage usage
- Review Razorpay invoice statuses
- Archive old invoices as needed

## Future Enhancements

### Planned Features
- **Email Notifications**: Send invoices via email
- **Payment Integration**: Link invoices to payment status
- **Advanced Filtering**: More sophisticated search and filter options
- **Invoice Templates**: Customizable invoice designs
- **Bulk Operations**: ZIP file generation for multiple invoices
- **Analytics Dashboard**: Advanced reporting and insights

### Integration Opportunities
- **Accounting Software**: Export to QuickBooks, Xero, etc.
- **Tax Reporting**: Automated GST filing support
- **Customer Portal**: User invoice access
- **Mobile App**: Invoice viewing on mobile devices

## Support & Troubleshooting

### Common Questions
1. **Q**: Why aren't invoices being generated?
   **A**: Check Razorpay and Cloudinary credentials, verify dependencies

2. **Q**: Can I regenerate invoices for existing orders?
   **A**: Yes, use the admin endpoint to manually generate invoices

3. **Q**: How do I access vendor invoices?
   **A**: Vendors can access their invoices through authenticated endpoints

4. **Q**: What if PDF generation fails?
   **A**: Check file permissions and memory limits, review error logs

### Getting Help
- Check server logs for detailed error messages
- Verify all environment variables are set
- Ensure required dependencies are installed
- Test with a simple order first

## Conclusion

The KAMPYN invoice system provides a comprehensive solution for automatic invoice generation, professional presentation, and efficient management. It ensures transparency in financial transactions while maintaining security and providing role-based access control.

For technical support or feature requests, please contact the development team.
