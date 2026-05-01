const GuestHouse = require("../../models/account/GuestHouse");
const Otp = require("../../models/users/Otp");
const logger = require("../../utils/pinoLogger");
const cloudinary = require("../../config/cloudinary");
const { hashPassword } = require("../../utils/authUtils");
const sendOtpEmail = require("../../utils/sendOtp");
const crypto = require("crypto");

const generateOtp = () => crypto.randomInt(100000, 999999).toString();

const uploadImagesToCloudinary = async (files = []) => {
  if (!Array.isArray(files) || files.length === 0) return [];

  const uploads = files.map(async (file) => {
    const b64 = Buffer.from(file.buffer).toString("base64");
    const dataURI = `data:${file.mimetype};base64,${b64}`;
    const result = await cloudinary.uploader.upload(dataURI, {
      folder: "guest_house_images",
    });
    return result.secure_url;
  });

  return Promise.all(uploads);
};

exports.createGuestHouse = async (req, res) => {
  try {
    const uniId = req.uni?._id;
    if (!uniId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: university context missing",
      });
    }

    const {
      name,
      totalRooms,
      contactNumber,
      location,
      managerName,
      managerEmail,
      email,
      password,
      description,
      amenities,
    } = req.body;

    if (!name || !totalRooms || !contactNumber || !location || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "name, totalRooms, contactNumber, location, email and password are required",
      });
    }
    if (!Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one guest house image is required",
      });
    }

    const parsedRooms = Number(totalRooms);
    if (!Number.isFinite(parsedRooms) || parsedRooms < 1) {
      return res.status(400).json({
        success: false,
        message: "totalRooms must be a number greater than 0",
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingGuestHouse = await GuestHouse.findOne({ email: normalizedEmail }).select("_id");
    if (existingGuestHouse) {
      return res.status(409).json({
        success: false,
        message: "Guest house email already exists",
      });
    }

    const hashedPassword = await hashPassword(String(password));

    const normalizedAmenities = Array.isArray(amenities)
      ? amenities.map((item) => String(item).trim()).filter(Boolean)
      : typeof amenities === "string"
        ? amenities.split(",").map((item) => item.trim()).filter(Boolean)
        : [];
    const uploadedImages = await uploadImagesToCloudinary(req.files || []);

    const guestHouse = await GuestHouse.create({
      uniId,
      name: String(name).trim(),
      totalRooms: parsedRooms,
      contactNumber: String(contactNumber).trim(),
      location: String(location).trim(),
      managerName: managerName ? String(managerName).trim() : "",
      managerEmail: managerEmail ? String(managerEmail).trim().toLowerCase() : "",
      email: normalizedEmail,
      password: hashedPassword,
      description: description ? String(description).trim() : "",
      amenities: normalizedAmenities,
      images: uploadedImages,
      isActive: true,
      isVerified: false,
    });

    const otp = generateOtp();
    await Otp.deleteMany({ email: normalizedEmail });
    await new Otp({ email: normalizedEmail, otp }).save();
    await sendOtpEmail(normalizedEmail, otp);

    const safeGuestHouse = guestHouse.toObject();
    delete safeGuestHouse.password;

    return res.status(201).json({
      success: true,
      message: "Guest house created successfully. OTP sent for verification.",
      data: safeGuestHouse,
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A guest house with this name already exists for your university",
      });
    }

    logger.error({ error: error.message }, "Failed to create guest house");
    return res.status(500).json({
      success: false,
      message: "Failed to create guest house",
    });
  }
};

exports.listGuestHousesByUniversity = async (req, res) => {
  try {
    const uniId = req.uni?._id;
    if (!uniId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: university context missing",
      });
    }

    const guestHouses = await GuestHouse.find({ uniId })
      .select("-password -__v")
      .sort({ createdAt: -1 })
      .lean();

    const totalGuestHouses = guestHouses.length;
    const totalRooms = guestHouses.reduce((sum, item) => sum + (item.totalRooms || 0), 0);
    const activeGuestHouses = guestHouses.filter((item) => item.isActive).length;

    return res.json({
      success: true,
      data: guestHouses,
      summary: {
        totalGuestHouses,
        totalRooms,
        activeGuestHouses,
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, "Failed to fetch guest houses");
    return res.status(500).json({
      success: false,
      message: "Failed to fetch guest houses",
    });
  }
};

exports.listGuestHousesForUsers = async (req, res) => {
  try {
    const { uniId } = req.params;
    if (!uniId) {
      return res.status(400).json({
        success: false,
        message: "uniId is required",
      });
    }

    const guestHouses = await GuestHouse.find({ uniId, isActive: true })
      .select("name totalRooms contactNumber location managerName managerEmail description amenities images isActive createdAt")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      data: guestHouses,
      total: guestHouses.length,
    });
  } catch (error) {
    logger.error({ error: error.message }, "Failed to fetch user-side guest houses");
    return res.status(500).json({
      success: false,
      message: "Failed to fetch guest houses",
    });
  }
};

exports.updateGuestHouse = async (req, res) => {
  try {
    const uniId = req.uni?._id;
    const { guestHouseId } = req.params;
    if (!uniId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: university context missing",
      });
    }

    const guestHouse = await GuestHouse.findOne({ _id: guestHouseId, uniId });
    if (!guestHouse) {
      return res.status(404).json({
        success: false,
        message: "Guest house not found",
      });
    }

    const {
      name,
      totalRooms,
      contactNumber,
      location,
      managerName,
      managerEmail,
      description,
      amenities,
      isActive,
      replaceImages,
    } = req.body;

    if (name !== undefined) guestHouse.name = String(name).trim();
    if (totalRooms !== undefined) {
      const parsedRooms = Number(totalRooms);
      if (!Number.isFinite(parsedRooms) || parsedRooms < 1) {
        return res.status(400).json({
          success: false,
          message: "totalRooms must be a number greater than 0",
        });
      }
      guestHouse.totalRooms = parsedRooms;
    }
    if (contactNumber !== undefined) guestHouse.contactNumber = String(contactNumber).trim();
    if (location !== undefined) guestHouse.location = String(location).trim();
    if (managerName !== undefined) guestHouse.managerName = String(managerName).trim();
    if (managerEmail !== undefined) guestHouse.managerEmail = String(managerEmail).trim().toLowerCase();
    if (description !== undefined) guestHouse.description = String(description).trim();
    if (isActive !== undefined) guestHouse.isActive = String(isActive) === "true" || isActive === true;

    if (amenities !== undefined) {
      guestHouse.amenities = Array.isArray(amenities)
        ? amenities.map((item) => String(item).trim()).filter(Boolean)
        : typeof amenities === "string"
          ? amenities.split(",").map((item) => item.trim()).filter(Boolean)
          : [];
    }

    const uploadedImages = await uploadImagesToCloudinary(req.files || []);
    if (uploadedImages.length > 0) {
      const shouldReplace = String(replaceImages) === "true";
      guestHouse.images = shouldReplace ? uploadedImages : [...guestHouse.images, ...uploadedImages];
    }

    await guestHouse.save();
    const safeGuestHouse = guestHouse.toObject();
    delete safeGuestHouse.password;
    return res.json({
      success: true,
      message: "Guest house updated successfully",
      data: safeGuestHouse,
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A guest house with this name already exists for your university",
      });
    }
    logger.error({ error: error.message }, "Failed to update guest house");
    return res.status(500).json({
      success: false,
      message: "Failed to update guest house",
    });
  }
};

exports.deleteGuestHouse = async (req, res) => {
  try {
    const uniId = req.uni?._id;
    const { guestHouseId } = req.params;
    if (!uniId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: university context missing",
      });
    }

    const deleted = await GuestHouse.findOneAndDelete({ _id: guestHouseId, uniId });
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Guest house not found",
      });
    }

    return res.json({
      success: true,
      message: "Guest house deleted successfully",
    });
  } catch (error) {
    logger.error({ error: error.message }, "Failed to delete guest house");
    return res.status(500).json({
      success: false,
      message: "Failed to delete guest house",
    });
  }
};

