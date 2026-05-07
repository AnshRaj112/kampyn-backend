const express = require("express");
const upload = require("../middleware/upload");
const { uniAuthMiddleware } = require("../middleware/auth/uniAuthMiddleware");
const {
  createAuditorium,
  listAuditoriumsByUniversity,
  listAuditoriumsForUsers,
  updateAuditorium,
  deleteAuditorium,
} = require("../controllers/auditorium/auditoriumController");

const router = express.Router();

router.get("/public/:uniId", listAuditoriumsForUsers);

router.use(uniAuthMiddleware);
router.get("/", listAuditoriumsByUniversity);
router.post(
  "/",
  upload.fields([
    { name: "coverImage", maxCount: 1 },
    { name: "additionalImages", maxCount: 10 },
    { name: "images", maxCount: 10 },
  ]),
  createAuditorium
);
router.put(
  "/:auditoriumId",
  upload.fields([
    { name: "coverImage", maxCount: 1 },
    { name: "additionalImages", maxCount: 10 },
    { name: "images", maxCount: 10 },
  ]),
  updateAuditorium
);
router.delete("/:auditoriumId", deleteAuditorium);

module.exports = router;
