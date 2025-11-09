const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");
const razorpayConfig = require("../config/razorpay");
const logger = require("../utils/pinoLogger");

// Initialize Razorpay with configuration
const razorpay = new Razorpay({
  key_id: razorpayConfig.keyId,
  key_secret: razorpayConfig.keySecret,
});

// GET /razorpay/key
router.get("/key", (req, res) => {
  res.json({
    success: true,
    key: razorpayConfig.keyId,
    environment: razorpayConfig.environment
  });
});

// GET /razorpay/invoices/:invoiceId
router.get("/invoices/:invoiceId", async (req, res) => {
  try {
    const { invoiceId } = req.params;
    
    logger.info("📄 Fetching Razorpay invoice:", invoiceId);
    
    const invoice = await razorpay.invoices.fetch(invoiceId);
    
    logger.info("✅ Razorpay invoice fetched:", invoice.id);
    
    res.json({
      success: true,
      data: invoice
    });
  } catch (error) {
    logger.error("❌ Error fetching Razorpay invoice:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch invoice from Razorpay",
      error: error.message
    });
  }
});

// GET /razorpay/invoices/:invoiceId/pdf
router.get("/invoices/:invoiceId/pdf", async (req, res) => {
  try {
    const { invoiceId } = req.params;
    
    logger.info("📄 Getting PDF for Razorpay invoice:", invoiceId);
    
    // Get invoice details first
    const invoice = await razorpay.invoices.fetch(invoiceId);
    
    // Generate PDF download URL
    const pdfUrl = `${razorpayConfig.apiBase}/invoices/${invoiceId}/pdf`;
    
    logger.info("✅ PDF URL generated for invoice:", invoiceId);
    
    res.json({
      success: true,
      pdfUrl: pdfUrl
    });
  } catch (error) {
    logger.error("❌ Error getting invoice PDF:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get invoice PDF from Razorpay",
      error: error.message
    });
  }
});

// POST /razorpay/invoices
router.post("/invoices", async (req, res) => {
  try {
    const invoiceData = req.body;
    
    logger.info("📄 Creating Razorpay invoice:", invoiceData);
    
    const invoice = await razorpay.invoices.create(invoiceData);
    
    logger.info("✅ Razorpay invoice created:", invoice.id);
    
    res.json({
      success: true,
      data: invoice
    });
  } catch (error) {
    logger.error("❌ Error creating Razorpay invoice:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create invoice on Razorpay",
      error: error.message
    });
  }
});

// POST /razorpay/create-order
router.post("/create-order", async (req, res) => {
  try {
    const { amount, currency = "INR", receipt } = req.body;

    if (!amount || !receipt) {
      return res.status(400).json({
        success: false,
        message: "Amount and receipt are required"
      });
    }

    logger.info("💳 Creating Razorpay order:", {
      amount,
      currency,
      receipt
    });

    const razorpayOrder = await razorpay.orders.create({
      amount: amount,
      currency: currency,
      receipt: receipt,
      payment_capture: 1,
    });

    logger.info("💳 Razorpay order created:", {
      id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency
    });

    res.json({
      success: true,
      id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      receipt: razorpayOrder.receipt
    });
  } catch (error) {
    logger.error("❌ Error creating Razorpay order:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create Razorpay order"
    });
  }
});

module.exports = router; 