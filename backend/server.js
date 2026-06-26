import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import connectDB from "./utils/db.js";
import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/authRoutes.js";
import groupRoutes from "./routes/groupRoutes.js";
import expenseRoutes from "./routes/expenseRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

// Load environment variables from .env
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// Core middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/health",  healthRoutes);
app.use("/api/auth",    authRoutes);
app.use("/api/groups",  groupRoutes);
app.use("/api/groups",  expenseRoutes);
app.use("/api/groups",  paymentRoutes);   // ← payments live under /api/groups/:groupId/payments

// 404 + error handling (must come after routes)
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
