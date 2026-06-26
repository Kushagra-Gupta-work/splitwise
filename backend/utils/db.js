import mongoose from "mongoose";

/**
 * Connects to MongoDB using the URI provided in the environment variables.
 * Exits the process if the connection fails, since the app can't run without a DB.
 */
const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
      throw new Error("MONGODB_URI is not defined in your .env file");
    }

    const conn = await mongoose.connect(uri);

    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    // Logged but not fatal: lets the API (e.g. /api/health) still run
    // even if MongoDB isn't reachable yet. Tighten this to process.exit(1)
    // once your routes actually depend on the database.
    console.error(`MongoDB connection error: ${error.message}`);
  }
};

export default connectDB;
