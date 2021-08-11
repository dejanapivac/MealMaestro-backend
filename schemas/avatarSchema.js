const mongoose = require("mongoose");

const avatarSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  url: {
    type: String,
    required: true,
  },
});

const Avatar = mongoose.model("Avatar", avatarSchema);
module.exports = Avatar;
