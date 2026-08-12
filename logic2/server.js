import express from "express";
import cors from "cors";

import connectDB from "./config/db.js";
import waterLevelRoutes from "./routes/waterLevelRoutes.js";

const app = express();

connectDB();

app.use(cors());
app.use(express.json());

app.use("/api/water-levels", waterLevelRoutes);

app.listen(5000, () => {
  console.log("Server running on port 5000");
});