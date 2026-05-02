const cloudinary = require("../../config/cloudinary");
const logger = require("../../utils/pinoLogger");
const GuestHouse = require("../../models/account/GuestHouse");
const GuestHouseRoom = require("../../models/account/GuestHouseRoom");

const uploadSingleFile = async (file, folder) => {
  const b64 = Buffer.from(file.buffer).toString("base64");
  const dataURI = `data:${file.mimetype};base64,${b64}`;
  const result = await cloudinary.uploader.upload(dataURI, { folder });
  return result.secure_url;
};

const uploadMultipleFiles = async (files = [], folder) => {
  if (!Array.isArray(files) || files.length === 0) return [];
  return Promise.all(files.map((file) => uploadSingleFile(file, folder)));
};

exports.createGuestHouseRoom = async (req, res) => {
  try {
    const uniId = req.uni?._id;
    if (!uniId) {
      return res.status(401).json({ success: false, message: "Unauthorized: university context missing" });
    }

    const { guestHouseId, roomName, roomCount, price, services } = req.body;
    if (!guestHouseId || !roomName || roomCount === undefined || price === undefined) {
      return res.status(400).json({
        success: false,
        message: "guestHouseId, roomName, roomCount and price are required",
      });
    }
    const parsedRoomCount = Number(roomCount);
    const parsedPrice = Number(price);
    if (!Number.isFinite(parsedRoomCount) || parsedRoomCount < 1) {
      return res.status(400).json({
        success: false,
        message: "roomCount must be a number greater than 0",
      });
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({
        success: false,
        message: "price must be a valid non-negative number",
      });
    }

    const guestHouse = await GuestHouse.findOne({ _id: guestHouseId, uniId }).select("_id totalRooms");
    if (!guestHouse) {
      return res.status(404).json({
        success: false,
        message: "Guest house not found for this university",
      });
    }

    const existingAggregation = await GuestHouseRoom.aggregate([
      { $match: { guestHouseId: guestHouse._id } },
      { $group: { _id: "$guestHouseId", totalAssignedRooms: { $sum: "$roomCount" } } },
    ]);
    const currentAssignedRooms = existingAggregation[0]?.totalAssignedRooms || 0;
    if (currentAssignedRooms + parsedRoomCount > guestHouse.totalRooms) {
      return res.status(400).json({
        success: false,
        message: `Room count exceeds guest house capacity. Assigned: ${currentAssignedRooms}, trying to add: ${parsedRoomCount}, capacity: ${guestHouse.totalRooms}`,
      });
    }

    const coverFile = req.files?.coverImage?.[0];
    const detailedFiles = req.files?.detailedImage || [];
    if (!coverFile || !Array.isArray(detailedFiles) || detailedFiles.length === 0) {
      return res.status(400).json({
        success: false,
        message: "coverImage and at least one detailedImage are required",
      });
    }

    const [coverImageUrl, detailedImageUrls] = await Promise.all([
      uploadSingleFile(coverFile, "guest_house_rooms/cover"),
      uploadMultipleFiles(detailedFiles, "guest_house_rooms/detailed"),
    ]);

    const normalizedServices = Array.isArray(services)
      ? services.map((item) => String(item).trim()).filter(Boolean)
      : typeof services === "string"
        ? services.split(",").map((item) => item.trim()).filter(Boolean)
        : [];

    const room = await GuestHouseRoom.create({
      uniId,
      guestHouseId,
      roomName: String(roomName).trim(),
      roomCount: parsedRoomCount,
      price: parsedPrice,
      coverImage: coverImageUrl,
      detailedImages: detailedImageUrls,
      services: normalizedServices,
      isActive: true,
    });

    return res.status(201).json({
      success: true,
      message: "Room details added successfully",
      data: room,
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A room with this name already exists in this guest house",
      });
    }
    logger.error({ error: error.message }, "Failed to create guest house room");
    return res.status(500).json({
      success: false,
      message: "Failed to add room details",
    });
  }
};

exports.listGuestHouseRooms = async (req, res) => {
  try {
    const uniId = req.uni?._id;
    if (!uniId) {
      return res.status(401).json({ success: false, message: "Unauthorized: university context missing" });
    }

    const { guestHouseId } = req.query;
    const query = { uniId };
    if (guestHouseId) query.guestHouseId = guestHouseId;

    const rooms = await GuestHouseRoom.find(query)
      .populate("guestHouseId", "name")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      data: rooms,
      total: rooms.length,
    });
  } catch (error) {
    logger.error({ error: error.message }, "Failed to list guest house rooms");
    return res.status(500).json({
      success: false,
      message: "Failed to fetch room details",
    });
  }
};

exports.listGuestHouseRoomsForUsers = async (req, res) => {
  try {
    const { guestHouseId } = req.params;
    if (!guestHouseId) {
      return res.status(400).json({
        success: false,
        message: "guestHouseId is required",
      });
    }

    const rooms = await GuestHouseRoom.find({ guestHouseId, isActive: true })
      .select("roomName roomCount price coverImage detailedImages services isActive")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      data: rooms,
      total: rooms.length,
    });
  } catch (error) {
    logger.error({ error: error.message }, "Failed to fetch user-side room details");
    return res.status(500).json({
      success: false,
      message: "Failed to fetch room details",
    });
  }
};

exports.updateGuestHouseRoom = async (req, res) => {
  try {
    const uniId = req.uni?._id;
    if (!uniId) {
      return res.status(401).json({ success: false, message: "Unauthorized: university context missing" });
    }

    const { roomId } = req.params;
    const { guestHouseId, roomName, roomCount, price, services, isActive, replaceDetailedImages } = req.body;

    const room = await GuestHouseRoom.findOne({ _id: roomId, uniId });
    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    const targetGuestHouseId = guestHouseId || room.guestHouseId?.toString();
    const targetGuestHouse = await GuestHouse.findOne({ _id: targetGuestHouseId, uniId }).select("_id totalRooms");
    if (!targetGuestHouse) {
      return res.status(404).json({
        success: false,
        message: "Parent guest house not found",
      });
    }

    if (roomName !== undefined) room.roomName = String(roomName).trim();

    const nextRoomCount = roomCount !== undefined ? Number(roomCount) : Number(room.roomCount || 0);
    if (!Number.isFinite(nextRoomCount) || nextRoomCount < 1) {
      return res.status(400).json({
        success: false,
        message: "roomCount must be a number greater than 0",
      });
    }

    const existingAggregation = await GuestHouseRoom.aggregate([
      {
        $match: {
          guestHouseId: targetGuestHouse._id,
          _id: { $ne: room._id },
        },
      },
      { $group: { _id: "$guestHouseId", totalAssignedRooms: { $sum: "$roomCount" } } },
    ]);
    const currentAssignedRoomsExcludingThis = existingAggregation[0]?.totalAssignedRooms || 0;
    const adjustedAssignedRooms = currentAssignedRoomsExcludingThis + nextRoomCount;
    if (adjustedAssignedRooms > targetGuestHouse.totalRooms) {
      return res.status(400).json({
        success: false,
        message: `Room count exceeds guest house capacity. Assigned (excluding this row): ${currentAssignedRoomsExcludingThis}, requested for this room: ${nextRoomCount}, capacity: ${targetGuestHouse.totalRooms}`,
      });
    }

    room.guestHouseId = targetGuestHouse._id;
    room.roomCount = nextRoomCount;
    if (services !== undefined) {
      room.services = Array.isArray(services)
        ? services.map((item) => String(item).trim()).filter(Boolean)
        : typeof services === "string"
          ? services.split(",").map((item) => item.trim()).filter(Boolean)
          : [];
    }
    if (price !== undefined) {
      const parsedPrice = Number(price);
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({
          success: false,
          message: "price must be a valid non-negative number",
        });
      }
      room.price = parsedPrice;
    } else if (room.price === undefined || room.price === null) {
      return res.status(400).json({
        success: false,
        message: "price is required for this room",
      });
    }
    if (isActive !== undefined) {
      room.isActive = String(isActive) === "true" || isActive === true;
    }

    const coverFile = req.files?.coverImage?.[0];
    const detailedFiles = req.files?.detailedImage || [];

    if (coverFile) {
      room.coverImage = await uploadSingleFile(coverFile, "guest_house_rooms/cover");
    }

    if (Array.isArray(detailedFiles) && detailedFiles.length > 0) {
      const uploadedDetailedImages = await uploadMultipleFiles(detailedFiles, "guest_house_rooms/detailed");
      const shouldReplaceDetailed = String(replaceDetailedImages) === "true";
      room.detailedImages = shouldReplaceDetailed
        ? uploadedDetailedImages
        : [...(room.detailedImages || []), ...uploadedDetailedImages];
    } else if (String(replaceDetailedImages) === "true") {
      return res.status(400).json({
        success: false,
        message: "Please upload at least one detailed image when replacing existing detailed images",
      });
    }

    await room.save();
    return res.json({
      success: true,
      message: "Room updated successfully",
      data: room,
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A room with this name already exists in this guest house",
      });
    }
    logger.error({ error: error.message }, "Failed to update guest house room");
    return res.status(500).json({
      success: false,
      message: "Failed to update room details",
    });
  }
};

