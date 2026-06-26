import jwt from "jsonwebtoken";

/**
 * Signs a JWT containing the user's id, expiring in 7 days.
 */
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

export default generateToken;
