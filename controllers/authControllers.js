const bcrypt = require("bcryptjs");
const User = require("../models/user");
const jwt = require("jsonwebtoken");
const config = require("../config");
const Jimp = require("jimp");
const path = require("path");
const fs = require("fs/promises");
const gravatar = require("gravatar");
const transporter = require("../nodemailerConfig");
const { v4: uuidv4 } = require("uuid");

const registerUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const verificationToken = uuidv4();

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "Email in use" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const avatarURL = gravatar.url(email);

    const newUser = new User({
      email,
      password: hashedPassword,
      verificationToken,
    });

    const mailOptions = {
      from: "webnezha@meta.ua", //  Для тестування замініть на свій мейл
      to: email,
      subject: "Підтвердження email",
      text: `Перейдіть за посиланням для верифікації email: /users/verify/${verificationToken}`,
    };

    await transporter.sendMail(mailOptions);
    await newUser.save();

    res.status(201).json({
      user: {
        email: newUser.email,
        subscription: newUser.subscription,
        avatarURL,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Email or password is wrong" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Email or password is wrong" });
    }

    const token = jwt.sign({ userId: user._id }, config.jwtSecret, {
      expiresIn: "3h",
    });

    user.token = token;
    await user.save();

    res.status(200).json({
      token,
      user: {
        email: user.email,
        subscription: user.subscription,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};

const logoutUser = async (req, res) => {
  try {
    const { _id } = req.user;

    await User.findByIdAndUpdate(_id, { token: "" });

    res.json({
      message: "Logout success",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};

const getCurrentUser = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ message: "Not authorized" });
    }

    res.status(200).json({
      email: user.email,
      subscription: user.subscription,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};

const setUserAvatar = async (req, res) => {
  try {
    const { file } = req;

    if (!file) {
      return res.status(400).json({ message: "No file provided" });
    }
    const image = await Jimp.read(file.path);
    await image.cover(250, 250).write(file.path);

    const newAvatarName = `${req.user.id}${path.extname(file.originalname)}`;
    await fs.rename(file.path, `public/avatars/${newAvatarName}`);

    req.user.avatarURL = `/avatars/${newAvatarName}`;
    await req.user.save();

    res.json({ avatarURL: req.user.avatarURL });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const verifyUser = async (req, res) => {
  try {
    const { verificationToken } = req.params;
    console.log(verificationToken);

    const user = await User.findOne({ verificationToken });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.verify) {
      return res
        .status(400)
        .json({ message: "Verification has already been passed" });
    }
    await User.findByIdAndUpdate(user._id, {
      verify: true,
      verificationCode: "",
    });

    return res.status(200).json({ message: "Verification successful" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.verify) {
      return res
        .status(400)
        .json({ message: "Verification has already been passed" });
    }
    const mailOptions = {
      from: "webnezha@mata.ua",
      to: email,
      subject: "Повторна відправка email для верифікації",
      text: `Перейдіть за посиланням для верифікації email: /users/verify/${user.verificationToken}`,
    };

    await transporter.sendMail(mailOptions);

    return res.status(200).json({ message: "Verification email sent" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports = {
  registerUser,
  loginUser,
  logoutUser,
  getCurrentUser,
  setUserAvatar,
  verifyUser,
  resendVerification,
};
