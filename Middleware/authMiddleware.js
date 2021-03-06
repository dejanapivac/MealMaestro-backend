import asyncHandler from "../utils/asyncHandler";
import ErrorHandler from "../utils/errorHandler";
import User from "../schemas/userSchema";
import Avatar from "../schemas/avatarSchema";
import { promisify } from "util";
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

exports.protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return next(new ErrorHandler("You are not logged in", 401));
  }

  const decoded_payload = await promisify(jwt.verify)(
    token,
    process.env.JWT_SECRET
  );

  const currentUser = await User.findById(decoded_payload.id);

  if (!currentUser) {
    return next(new ErrorHandler("User with this token no longer exists", 401));
  }

  if (currentUser.hasChangedPassword(decoded_payload.iat)) {
    return next(new ErrorHandler("Password changed, log in again.", 401));
  }

  req.user = currentUser;
  next();
});

exports.changePassword = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id).select("+password");

  if (
    !(await user.isPasswordCorrect(req.body.currentPassword, user.password))
  ) {
    return next(new ErrorHandler("Wrong current password", 401));
  }

  user.password = req.body.newPassword;
  user.password_confirm = req.body.confirmPassword;
  await user.save();

  createToken(user, 200, res);
});

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const createToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  const cookie_options = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" ? true : false,
  };

  res.cookie("jwt", token, cookie_options);

  user.password = undefined;

  res.status(statusCode).json({
    status: "success",
    token,
    data: {
      user,
    },
  });
};
