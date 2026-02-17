const ContactMessage = require("../../models/users/ContactMessage");
const logger = require("../../utils/pinoLogger");

exports.sendContactEmail = async (req, res) => {
  const { name, email, message } = req.body;

  logger.info("Contact data received:", { name, email, message });

  try {
    // Save the contact message to MongoDB
    const newMessage = new ContactMessage({ name, email, message });
    await newMessage.save();

    logger.info("✅ Contact message saved successfully");

    res
      .status(200)
      .json({ message: "Message received successfully! We'll get back to you soon." });
  } catch (error) {
    logger.error("❌ Error saving contact message:", error);
    res.status(500).json({ message: "Failed to save message. Please try again." });
  }
};
