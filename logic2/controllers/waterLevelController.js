import WaterLevel from "../models/WaterLevel.js";

export const createWaterLevel = async (req, res) => {
  try {
    const {
      water_level,
      warning_level = 8,
      danger_level = 10,
      camera_id = "cam_1",
      timestamp,
    } = req.body;

    const waterValue = Number(water_level);
    const warningValue = Number(warning_level);
    const dangerValue = Number(danger_level);

    if (Number.isNaN(waterValue)) {
      return res.status(400).json({
        message: "water_level must be a valid number",
      });
    }

    const status =
      waterValue >= dangerValue
        ? "DANGER"
        : waterValue >= warningValue
        ? "WARNING"
        : "SAFE";

    const newData = new WaterLevel({
      water_level: waterValue,
      warning_level: warningValue,
      danger_level: dangerValue,
      status,
      camera_id,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
    });

    await newData.save();

    res.status(201).json(newData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getWaterLevels = async (req, res) => {
  try {
    const data = await WaterLevel.find().sort({ timestamp: -1 });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getLatestWaterLevel = async (req, res) => {
  try {
    const data = await WaterLevel.findOne({
      camera_id: req.params.camera_id,
    })
      .sort({ timestamp: -1 })
      .lean();

    if (!data) return res.json({});

    res.json({
      water_level: data.water_level,
      warning_level: data.warning_level,
      danger_level: data.danger_level,
      status: data.status,
      camera_id: data.camera_id,
      timestamp: data.timestamp,
    });
  } catch (err) {
    res.status(500).json({});
  }
};

export const getWaterLevelHistoryByCamera = async (req, res) => {
  try {
    const data = await WaterLevel.find({
      camera_id: req.params.camera_id,
    })
      .sort({ timestamp: 1 })
      .lean();

    res.json(
      data.map((item) => ({
        _id: item._id,
        water_level: item.water_level,
        warning_level: item.warning_level,
        danger_level: item.danger_level,
        status: item.status,
        camera_id: item.camera_id,
        timestamp: item.timestamp,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }))
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
