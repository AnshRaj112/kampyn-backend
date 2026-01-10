const express = require("express");
const { sendContactEmail } = require("../controllers/contact/contactController");

const router = express.Router();

router.post("/", sendContactEmail);

module.exports = router;
