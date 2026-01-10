const TeamMember = require("../../models/users/Team");

// Fetch all team members
const getTeamMembers = async (req, res) => {
  try {
    const members = await TeamMember.find();
    res.json(members);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Add a new team member
// const addTeamMember = async (req, res) => {
//   const { name, image, github, linkedin } = req.body;
//   if (!name || !image || !github || !linkedin) {
//     return res.status(400).json({ message: "All fields are required" });
//   }

//   try {
//     const newMember = new TeamMember({ name, image, github, linkedin });
//     await newMember.save();
//     res.status(201).json(newMember);
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };

module.exports = { getTeamMembers };
