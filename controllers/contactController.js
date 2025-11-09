const nodemailer = require("nodemailer");
const ContactMessage = require("../models/users/ContactMessage"); // adjust the path as needed
const logger = require("../utils/pinoLogger");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

exports.sendContactEmail = async (req, res) => {
  const { name, email, message } = req.body;

  logger.info("Contact data received:", { name, email, message });

  try {
    // Save the contact message to MongoDB
    const newMessage = new ContactMessage({ name, email, message });
    await newMessage.save();

    // Send the email notification
    const mailOptions = {
      from: email,
      to: process.env.EMAIL_USER,
      subject: `New message from ${name}`,
      text: `You have a new message from:
Name: ${name}
Email: ${email}
Message: ${message}`,
    };

    await transporter.sendMail(mailOptions);
    logger.info("Email sent successfully");

    res
      .status(200)
      .json({ message: "Message received and email sent successfully" });
  } catch (error) {
    logger.error("Error:", error);
    res.status(500).json({ message: "Failed to send message or email" });
  }
};
