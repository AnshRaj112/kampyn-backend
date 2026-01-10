const express = require("express");
const { getTeamMembers } = require("../controllers/team/teamController");

const router = express.Router();

router.get("/", getTeamMembers); // GET /team

module.exports = router;
