# Invoice API Endpoints

## Overview

This document describes the available API endpoints for accessing and downloading invoices in the BitesBay system.

## Base URL

```
http://localhost:5001/api/invoices
```

## Available Endpoints

### 1. Get Invoices by Order ID

**Endpoint:** `GET /invoices/order/:orderId`

**Description:** Retrieves all invoices associated with a specific order.

**Example:**
```bash
GET http://localhost:5001/api/invoices/order/68a7eabe7070357cae6a51ad
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "invoice_id_here",
      "invoiceNumber": "INV001",
      "invoiceType": "vendor",
      "pdfUrl": "https://cloudinary.com/...",
      "razorpayInvoiceUrl": "https://api.razorpay.com/...",
      "totalAmount": 100,
      "status": "sent"
    }
  ]
}
```

### 2. Download Order Invoices

**Endpoint:** `GET /invoices/order/:orderId/download`

**Description:** Provides download links for all invoices associated with an order.

**Example:**
```bash
GET http://localhost:5001/api/invoices/order/68a7eabe7070357cae6a51ad/download
```

**Response:**
```json
{
  "success": true,
  "data": {
    "orderNumber": "ORD001",
    "invoices": [
      {
        "_id": "invoice_id_here",
        "invoiceNumber": "INV001",
        "downloadUrl": "/api/invoices/invoice_id_here/download",
        "viewUrl": "https://cloudinary.com/..."
      }
    ],
    "message": "Use the downloadUrl to download individual invoices"
  }
}
```

### 3. Get Specific Invoice

**Endpoint:** `GET /invoices/:invoiceId`

**Description:** Retrieves details of a specific invoice by its ID.

**Example:**
```bash
GET http://localhost:5001/api/invoices/invoice_id_here
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "invoice_id_here",
    "invoiceNumber": "INV001",
    "invoiceType": "vendor",
    "pdfUrl": "https://cloudinary.com/...",
    "razorpayInvoiceUrl": "https://api.razorpay.com/...",
    "totalAmount": 100,
    "status": "sent"
  }
}
```

### 4. Download Specific Invoice PDF

**Endpoint:** `GET /invoices/:invoiceId/download`

**Description:** Downloads a specific invoice PDF file.

**Example:**
```bash
GET http://localhost:5001/api/invoices/invoice_id_here/download
```

**Behavior:**
- **Local Files**: Serves the PDF directly with proper headers
- **Cloudinary URLs**: Redirects to the Cloudinary URL
- **Razorpay URLs**: Redirects to the Razorpay invoice URL

## How to Use

### Step 1: Get Order Invoices
```bash
curl http://localhost:5001/api/invoices/order/68a7eabe7070357cae6a51ad
```

### Step 2: Extract Invoice IDs
From the response, extract the `_id` of the invoice you want to download.

### Step 3: Download Invoice
```bash
curl http://localhost:5001/api/invoices/{invoice_id}/download
```

## Frontend Integration

### React/Next.js Example
```javascript
// Get invoices for an order
const getInvoices = async (orderId) => {
  const response = await fetch(`/api/invoices/order/${orderId}`);
  const data = await response.json();
  return data.data;
};

// Download a specific invoice
const downloadInvoice = async (invoiceId) => {
  const response = await fetch(`/api/invoices/${invoiceId}/download`);
  
  if (response.redirected) {
    // Handle redirect (Cloudinary/Razorpay)
    window.open(response.url, '_blank');
  } else {
    // Handle direct download (local file)
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice_${invoiceId}.pdf`;
    a.click();
  }
};
```

## Error Handling

### Common Error Responses

**404 - Order Not Found**
```json
{
  "success": false,
  "message": "Order not found"
}
```

**404 - Invoice Not Found**
```json
{
  "success": false,
  "message": "Invoice not found"
}
```

**404 - PDF Not Available**
```json
{
  "success": false,
  "message": "PDF not available for this invoice"
}
```

**500 - Server Error**
```json
{
  "success": false,
  "message": "Failed to fetch order invoices",
  "error": "Error details"
}
```

## Testing

Use the provided test script to verify all endpoints work:

```bash
cd bitesbay-backend
node scripts/test-invoice-api.js
```

## Notes

- **Authentication**: Currently disabled for testing purposes
- **File Types**: Supports PDF downloads from Cloudinary, Razorpay, and local storage
- **Redirects**: Some endpoints redirect to external services (Cloudinary/Razorpay)
- **Local Storage**: Fallback to local file storage when Cloudinary fails
