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

const resolveGuestHouseImagesFromRequest = (req) => {
  const fieldFiles = req.files && !Array.isArray(req.files) ? req.files : null;
  const arrayFiles = Array.isArray(req.files) ? req.files : [];

  if (fieldFiles) {
    const coverFile = fieldFiles.coverImage?.[0] || null;
    const additionalFiles = Array.isArray(fieldFiles.additionalImages) ? fieldFiles.additionalImages : [];
    return { coverFile, additionalFiles };
  }

  const [coverFile, ...additionalFiles] = arrayFiles;
  return { coverFile: coverFile || null, additionalFiles };
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
    const { coverFile, additionalFiles } = resolveGuestHouseImagesFromRequest(req);
    if (!coverFile) {
      return res.status(400).json({
        success: false,
        message: "Guest house cover image is required",
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
    const [uploadedCoverImage, uploadedAdditionalImages] = await Promise.all([
      uploadImagesToCloudinary([coverFile]),
      uploadImagesToCloudinary(additionalFiles || []),
    ]);
    const coverImage = uploadedCoverImage[0] || "";
    const additionalImages = uploadedAdditionalImages;

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
      coverImage,
      additionalImages,
      images: [coverImage, ...additionalImages].filter(Boolean),
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
    const normalizedGuestHouses = guestHouses.map((item) => {
      const fallbackImages = Array.isArray(item.images) ? item.images : [];
      const normalizedCoverImage = item.coverImage || fallbackImages[0] || "";
      const normalizedAdditionalImages =
        Array.isArray(item.additionalImages) && item.additionalImages.length > 0
          ? item.additionalImages
          : fallbackImages.slice(1);
      return {
        ...item,
        coverImage: normalizedCoverImage,
        additionalImages: normalizedAdditionalImages,
        images: [normalizedCoverImage, ...normalizedAdditionalImages].filter(Boolean),
      };
    });

    const totalGuestHouses = normalizedGuestHouses.length;
    const totalRooms = normalizedGuestHouses.reduce((sum, item) => sum + (item.totalRooms || 0), 0);
    const activeGuestHouses = normalizedGuestHouses.filter((item) => item.isActive).length;

    return res.json({
      success: true,
      data: normalizedGuestHouses,
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
      .select("name totalRooms contactNumber location managerName managerEmail description amenities coverImage additionalImages images isActive createdAt")
      .sort({ createdAt: -1 })
      .lean();
    const normalizedGuestHouses = guestHouses.map((item) => {
      const fallbackImages = Array.isArray(item.images) ? item.images : [];
      const normalizedCoverImage = item.coverImage || fallbackImages[0] || "";
      const normalizedAdditionalImages =
        Array.isArray(item.additionalImages) && item.additionalImages.length > 0
          ? item.additionalImages
          : fallbackImages.slice(1);
      return {
        ...item,
        coverImage: normalizedCoverImage,
        additionalImages: normalizedAdditionalImages,
        images: [normalizedCoverImage, ...normalizedAdditionalImages].filter(Boolean),
      };
    });

    return res.json({
      success: true,
      data: normalizedGuestHouses,
      total: normalizedGuestHouses.length,
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
      replaceAdditionalImages,
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

    const { coverFile, additionalFiles } = resolveGuestHouseImagesFromRequest(req);
    const [uploadedCoverImage, uploadedAdditionalImages] = await Promise.all([
      coverFile ? uploadImagesToCloudinary([coverFile]) : Promise.resolve([]),
      uploadImagesToCloudinary(additionalFiles || []),
    ]);

    if (uploadedCoverImage.length > 0) {
      guestHouse.coverImage = uploadedCoverImage[0];
    }

    if (uploadedAdditionalImages.length > 0) {
      const shouldReplaceAdditionalImages =
        String(replaceAdditionalImages) === "true" || String(replaceImages) === "true";
      guestHouse.additionalImages = shouldReplaceAdditionalImages
        ? uploadedAdditionalImages
        : [...(guestHouse.additionalImages || []), ...uploadedAdditionalImages];
    }

    // Keep legacy `images` in sync for backward compatibility.
    guestHouse.images = [
      guestHouse.coverImage,
      ...(guestHouse.additionalImages || []),
    ].filter(Boolean);

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

