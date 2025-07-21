const mongoose = require("mongoose");
const { Cluster_User } = require("../../config/db");

const TeamMemberSchema = new mongoose.Schema({
  name: { type: String, required: true },
  image: { type: String, required: true },
  github: { type: String, required: true },
  linkedin: { type: String, required: true },
});

module.exports = Cluster_User.model("TeamMember", TeamMemberSchema);
