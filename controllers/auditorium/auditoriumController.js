const Auditorium = require("../../models/account/Auditorium");
const logger = require("../../utils/pinoLogger");
const cloudinary = require("../../config/cloudinary");

const uploadImagesToCloudinary = async (files = []) => {
  if (!Array.isArray(files) || files.length === 0) return [];
  const uploads = files.map(async (file) => {
    const b64 = Buffer.from(file.buffer).toString("base64");
    const dataURI = `data:${file.mimetype};base64,${b64}`;
    const result = await cloudinary.uploader.upload(dataURI, {
      folder: "auditorium_images",
    });
    return result.secure_url;
  });
  return Promise.all(uploads);
};

const resolveAuditoriumImagesFromRequest = (req) => {
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

exports.createAuditorium = async (req, res) => {
  try {
    const uniId = req.uni?._id;
    if (!uniId) return res.status(401).json({ success: false, message: "Unauthorized: university context missing" });

    const { name, sittingSpace, pricePerDay, location, contactNumber, description, amenities, rules } = req.body;
    if (!name || !sittingSpace || pricePerDay === undefined || !location || !contactNumber) {
      return res.status(400).json({
        success: false,
        message: "name, sittingSpace, pricePerDay, location and contactNumber are required",
      });
    }

    const parsedSittingSpace = Number(sittingSpace);
    if (!Number.isFinite(parsedSittingSpace) || parsedSittingSpace < 1) {
      return res.status(400).json({ success: false, message: "sittingSpace must be a number greater than 0" });
    }
    const parsedPricePerDay = Number(pricePerDay);
    if (!Number.isFinite(parsedPricePerDay) || parsedPricePerDay < 0) {
      return res.status(400).json({ success: false, message: "pricePerDay must be a non-negative number" });
    }

    const { coverFile, additionalFiles } = resolveAuditoriumImagesFromRequest(req);
    if (!coverFile) return res.status(400).json({ success: false, message: "Auditorium cover image is required" });

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

    const auditorium = await Auditorium.create({
      uniId,
      name: String(name).trim(),
      sittingSpace: parsedSittingSpace,
      pricePerDay: parsedPricePerDay,
      location: String(location).trim(),
      contactNumber: String(contactNumber).trim(),
      description: description ? String(description).trim() : "",
      amenities: normalizedAmenities,
      rules: rules ? String(rules).trim() : "",
      coverImage,
      additionalImages,
      images: [coverImage, ...additionalImages].filter(Boolean),
      isActive: true,
    });

    return res.status(201).json({
      success: true,
      message: "Auditorium created successfully",
      data: auditorium,
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An auditorium with this name already exists for your university",
      });
    }
    logger.error({ error: error.message }, "Failed to create auditorium");
    return res.status(500).json({ success: false, message: "Failed to create auditorium" });
  }
};

exports.listAuditoriumsByUniversity = async (req, res) => {
  try {
    const uniId = req.uni?._id;
    if (!uniId) return res.status(401).json({ success: false, message: "Unauthorized: university context missing" });
    const auditoriums = await Auditorium.find({ uniId }).sort({ createdAt: -1 }).lean();
    const totalAuditoriums = auditoriums.length;
    const activeAuditoriums = auditoriums.filter((a) => a.isActive).length;
    return res.json({ success: true, data: auditoriums, summary: { totalAuditoriums, activeAuditoriums } });
  } catch (error) {
    logger.error({ error: error.message }, "Failed to fetch auditoriums");
    return res.status(500).json({ success: false, message: "Failed to fetch auditoriums" });
  }
};

exports.listAuditoriumsForUsers = async (req, res) => {
  try {
    const { uniId } = req.params;
    if (!uniId) return res.status(400).json({ success: false, message: "uniId is required" });
    const auditoriums = await Auditorium.find({ uniId, isActive: true }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: auditoriums, total: auditoriums.length });
  } catch (error) {
    logger.error({ error: error.message }, "Failed to fetch public auditoriums");
    return res.status(500).json({ success: false, message: "Failed to fetch auditoriums" });
  }
};

exports.updateAuditorium = async (req, res) => {
  try {
    const uniId = req.uni?._id;
    const { auditoriumId } = req.params;
    if (!uniId) return res.status(401).json({ success: false, message: "Unauthorized: university context missing" });

    const auditorium = await Auditorium.findOne({ _id: auditoriumId, uniId });
    if (!auditorium) return res.status(404).json({ success: false, message: "Auditorium not found" });

    const {
      name,
      sittingSpace,
      pricePerDay,
      location,
      contactNumber,
      description,
      amenities,
      rules,
      isActive,
      replaceImages,
      replaceAdditionalImages,
    } = req.body;

    if (name !== undefined) auditorium.name = String(name).trim();
    if (sittingSpace !== undefined) {
      const parsedSittingSpace = Number(sittingSpace);
      if (!Number.isFinite(parsedSittingSpace) || parsedSittingSpace < 1) {
        return res.status(400).json({ success: false, message: "sittingSpace must be a number greater than 0" });
      }
      auditorium.sittingSpace = parsedSittingSpace;
    }
    if (pricePerDay !== undefined) {
      const parsedPricePerDay = Number(pricePerDay);
      if (!Number.isFinite(parsedPricePerDay) || parsedPricePerDay < 0) {
        return res.status(400).json({ success: false, message: "pricePerDay must be a non-negative number" });
      }
      auditorium.pricePerDay = parsedPricePerDay;
    }
    if (location !== undefined) auditorium.location = String(location).trim();
    if (contactNumber !== undefined) auditorium.contactNumber = String(contactNumber).trim();
    if (description !== undefined) auditorium.description = String(description).trim();
    if (rules !== undefined) auditorium.rules = String(rules).trim();
    if (isActive !== undefined) auditorium.isActive = String(isActive) === "true" || isActive === true;
    if (amenities !== undefined) {
      auditorium.amenities = Array.isArray(amenities)
        ? amenities.map((item) => String(item).trim()).filter(Boolean)
        : typeof amenities === "string"
          ? amenities.split(",").map((item) => item.trim()).filter(Boolean)
          : [];
    }

    const { coverFile, additionalFiles } = resolveAuditoriumImagesFromRequest(req);
    const [uploadedCoverImage, uploadedAdditionalImages] = await Promise.all([
      coverFile ? uploadImagesToCloudinary([coverFile]) : Promise.resolve([]),
      uploadImagesToCloudinary(additionalFiles || []),
    ]);
    if (uploadedCoverImage.length > 0) auditorium.coverImage = uploadedCoverImage[0];
    if (uploadedAdditionalImages.length > 0) {
      const shouldReplaceAdditionalImages =
        String(replaceAdditionalImages) === "true" || String(replaceImages) === "true";
      auditorium.additionalImages = shouldReplaceAdditionalImages
        ? uploadedAdditionalImages
        : [...(auditorium.additionalImages || []), ...uploadedAdditionalImages];
    }
    auditorium.images = [auditorium.coverImage, ...(auditorium.additionalImages || [])].filter(Boolean);

    await auditorium.save();
    return res.json({ success: true, message: "Auditorium updated successfully", data: auditorium });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An auditorium with this name already exists for your university",
      });
    }
    logger.error({ error: error.message }, "Failed to update auditorium");
    return res.status(500).json({ success: false, message: "Failed to update auditorium" });
  }
};

exports.deleteAuditorium = async (req, res) => {
  try {
    const uniId = req.uni?._id;
    const { auditoriumId } = req.params;
    if (!uniId) return res.status(401).json({ success: false, message: "Unauthorized: university context missing" });
    const deleted = await Auditorium.findOneAndDelete({ _id: auditoriumId, uniId });
    if (!deleted) return res.status(404).json({ success: false, message: "Auditorium not found" });
    return res.json({ success: true, message: "Auditorium deleted successfully" });
  } catch (error) {
    logger.error({ error: error.message }, "Failed to delete auditorium");
    return res.status(500).json({ success: false, message: "Failed to delete auditorium" });
  }
};
