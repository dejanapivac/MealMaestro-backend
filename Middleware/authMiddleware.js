import asyncHandler from "../utils/asyncHandler";
import ErrorHandler from "../utils/errorHandler";
import User from "../schemas/userSchema";
import Avatar from "../schemas/avatarSchema";
import jwt from "jsonwebtoken";

exports.signup = asyncHandler(async (req, res, next) => {
  let avatar = await Avatar.find({
    url: req.body.avatar,
  });

  const user = await User.create({
    username: req.body.username,
    email: req.body.email,
    password: req.body.password,
    password_confirm: req.body.password_confirm,
    preferences: req.body.preferences,
    servings: req.body.servings,
    avatar: avatar[0],
  });
  createToken(user, 201, res);
});

exports.login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return next(new ErrorHandler("Email and password are required", 400));
  }
  const user = await User.findOne({
    $or: [{ email }, { username: email }],
  }).select("+password");
  if (!user || !(await user.isPasswordCorrect(password, user.password))) {
    return next(new ErrorHandler("Email or password are incorrect", 401));
  }
  createToken(user, 200, res);
});

//// TOKENI ----------------------------------
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const createToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  user.password = undefined;
  res.status(statusCode).json({
    status: "success",
    token,
    data: {
      user,
    },
  });
};