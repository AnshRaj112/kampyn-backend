# ZIP Download Guide for Invoices

This guide explains how to use the new ZIP download functionality for invoices, which allows you to download multiple invoices as a single compressed file.

## 🚀 Features

- **Order-based ZIP**: Download all invoices for a specific order
- **Bulk ZIP with filters**: Download multiple invoices based on date range and other criteria
- **Multiple source support**: Downloads from Cloudinary, Razorpay, and local files
- **Smart fallbacks**: Creates placeholder files for unavailable invoices
- **Maximum compression**: Uses ZIP level 9 compression for smaller file sizes
- **Automatic cleanup**: Removes temporary files after download

## 📋 Available Endpoints

### 1. Order ZIP Download
```
GET /api/invoices/order/:orderId/download
```
Downloads all invoices for a specific order as a ZIP file.

**Example:**
```bash
curl -X GET "http://localhost:5001/api/invoices/order/68a7eabe7070357cae6a51ad/download" \
     -o "order_invoices.zip"
```

### 2. Bulk ZIP Download
```
POST /api/invoices/bulk-zip-download
```
Downloads multiple invoices based on filters as a ZIP file.

**Request Body:**
```json
{
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "vendorId": "optional_vendor_id",
  "uniId": "optional_university_id",
  "invoiceType": "vendor", // or "platform"
  "recipientType": "vendor" // or "admin"
}
```

**Example:**
```bash
curl -X POST "http://localhost:5001/api/invoices/bulk-zip-download" \
     -H "Content-Type: application/json" \
     -d '{
       "startDate": "2024-01-01",
       "endDate": "2024-01-31"
     }' \
     -o "bulk_invoices.zip"
```

## 🔄 Download Priority

The system tries to download invoices in this order:

1. **Cloudinary URLs** - Direct PDF download from Cloudinary
2. **Razorpay URLs** - Direct PDF download from Razorpay
3. **Razorpay API** - Fetch via Razorpay API and download PDF
4. **Local Files** - Read from local uploads directory

## 📁 ZIP File Structure

### Successful Invoices
```
invoice_INV001_vendor_order_ORD123.pdf
invoice_INV002_platform_order_ORD123.pdf
```

### Placeholder Files (for unavailable invoices)
```
invoice_INV003_vendor_order_ORD123_NOT_AVAILABLE.txt
invoice_INV004_platform_order_ORD123_ERROR.txt
```

## 🧪 Testing

### Test Scripts
1. **`test-zip-download.js`** - Tests both ZIP download endpoints
2. **`test-download-api.js`** - Tests individual invoice downloads

### Running Tests
```bash
# Test ZIP downloads
node scripts/test-zip-download.js

# Test individual downloads
node scripts/test-download-api.js
```

## ⚠️ Important Notes

### Timeouts
- **Order ZIP**: 60 seconds timeout
- **Bulk ZIP**: 120 seconds timeout
- Adjust timeouts for large numbers of invoices

### File Sizes
- ZIP files are created in memory and temporary storage
- Large ZIP files may consume significant memory
- Temporary files are automatically cleaned up

### Error Handling
- Invoices that can't be downloaded are included as text placeholders
- The ZIP creation continues even if some invoices fail
- Check server logs for detailed error information

## 🔧 Configuration

### Environment Variables
Ensure these are set for proper functionality:
```env
RAZORPAY_KEY_ID=your_razorpay_key
RAZORPAY_KEY_SECRET=your_razorpay_secret
CLOUDINARY_CLOUD_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_key
CLOUDINARY_API_SECRET=your_cloudinary_secret
```

### Dependencies
```json
{
  "archiver": "^6.0.1",
  "node-fetch": "^3.3.2"
}
```

## 📊 Monitoring

### Server Logs
The system provides detailed logging:
```
📦 ZIP download request for order: 68a7eabe7070357cae6a51ad
📄 Found 3 invoices for order ORD123
☁️ Downloading from Cloudinary: INV001
✅ Downloaded from Cloudinary: 24576 bytes
✅ Added to ZIP: invoice_INV001_vendor_order_ORD123.pdf
📊 ZIP Summary: 2 invoices added, 1 skipped
✅ ZIP created successfully: 51200 bytes
🧹 Temporary files cleaned up
```

### Response Headers
```http
Content-Type: application/zip
Content-Disposition: attachment; filename="invoices_ORD123.zip"
Content-Length: 51200
```

## 🚨 Troubleshooting

### Common Issues

1. **404 - No invoices found**
   - Check if the order ID exists
   - Verify invoices exist for the order
   - Check date range for bulk downloads

2. **500 - ZIP creation failed**
   - Check server logs for detailed error
   - Verify all dependencies are installed
   - Check available disk space

3. **Empty ZIP files**
   - Verify PDF URLs are accessible
   - Check Cloudinary/Razorpay credentials
   - Ensure invoices have PDF data

4. **Timeout errors**
   - Increase timeout values
   - Check network connectivity to external services
   - Consider reducing the number of invoices in bulk downloads

### Debug Mode
Enable detailed logging by checking server console output for:
- Download progress
- File sizes
- Error details
- Cleanup operations

## 🔮 Future Enhancements

- **Progress tracking** for large ZIP files
- **Streaming downloads** for very large files
- **Custom file naming** options
- **Password protection** for sensitive ZIP files
- **Email delivery** of ZIP files
- **Scheduled ZIP generation** and delivery

## 📞 Support

For issues or questions:
1. Check server logs for detailed error messages
2. Verify all dependencies are installed
3. Test with smaller date ranges first
4. Ensure external services (Cloudinary/Razorpay) are accessible
