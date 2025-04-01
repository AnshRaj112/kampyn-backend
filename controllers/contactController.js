const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

exports.sendContactEmail = (req, res) => {
    const { name, email, message } = req.body;

    console.log("Contact data received:", { name, email, message });

    const mailOptions = {
        from: email,
        to: process.env.EMAIL_USER,
        subject: `New message from ${name}`,
        text: `You have a new message from:
        Name: ${name}
        Email: ${email}
        Message: ${message}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log("Email error:", error);
            return res.status(500).json({ message: "Error sending email" });
        }
        console.log("Email sent:", info.response);
        res.status(200).json({ message: "Email sent successfully" });
    });
};
