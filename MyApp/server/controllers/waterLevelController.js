import WaterLevel from "../models/WaterLevel.js";
import WaterLevelDailyHistory from "../models/WaterLevelDailyHistory.js";
import mongoose from "mongoose";


// ======================================================
// HELPER FUNCTIONS
// ======================================================

const getPhilippineDate = (date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value])
  );

  return `${values.year}-${values.month}-${values.day}`;
};


const isValidCameraId = (cameraId) => {
  return /^[a-zA-Z0-9_-]{1,50}$/.test(cameraId);
};


const isValidHistoryDate = (date) => {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
};


const getISOWeek = (date) => {
  const tempDate = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate()
    )
  );

  const dayNumber = tempDate.getUTCDay() || 7;

  tempDate.setUTCDate(
    tempDate.getUTCDate() + 4 - dayNumber
  );

  const yearStart = new Date(
    Date.UTC(tempDate.getUTCFullYear(), 0, 1)
  );

  const weekNumber = Math.ceil(
    ((tempDate - yearStart) / 86400000 + 1) / 7
  );

  return {
    year: tempDate.getUTCFullYear(),
    week: weekNumber,
  };
};


const getAnalyticsGroupKey = (dateString, period) => {
  const date = new Date(`${dateString}T00:00:00.000Z`);

  if (period === "weekly") {
    const { year, week } = getISOWeek(date);

    return `${year}-W${String(week).padStart(2, "0")}`;
  }

  if (period === "monthly") {
    return dateString.slice(0, 7);
  }

  if (period === "yearly") {
    return dateString.slice(0, 4);
  }

  return dateString;
};

// ======================================================
// CREATE WATER-LEVEL READING
// POST /api/water-levels
// ======================================================

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

    // Validate water level
    if (!Number.isFinite(waterValue)) {
      return res.status(400).json({
        success: false,
        message: "water_level must be a valid finite number.",
      });
    }

    // Validate warning and danger levels
    if (
      !Number.isFinite(warningValue) ||
      !Number.isFinite(dangerValue)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "warning_level and danger_level must be valid finite numbers.",
      });
    }

    if (waterValue < 0) {
      return res.status(400).json({
        success: false,
        message: "water_level cannot be negative.",
      });
    }

    if (warningValue < 0) {
      return res.status(400).json({
        success: false,
        message: "warning_level cannot be negative.",
      });
    }

    if (dangerValue <= warningValue) {
      return res.status(400).json({
        success: false,
        message:
          "danger_level must be greater than warning_level.",
      });
    }

    // Validate camera ID
    const normalizedCameraId = String(camera_id).trim();

    if (!isValidCameraId(normalizedCameraId)) {
      return res.status(400).json({
        success: false,
        message:
          "camera_id may only contain letters, numbers, underscores and hyphens.",
      });
    }

    // Validate timestamp
    const capturedAt = timestamp
      ? new Date(timestamp)
      : new Date();

    if (Number.isNaN(capturedAt.getTime())) {
      return res.status(400).json({
        success: false,
        message: "timestamp must be a valid date.",
      });
    }

    // Server calculates the official status
    const status =
      waterValue >= dangerValue
        ? "DANGER"
        : waterValue >= warningValue
          ? "WARNING"
          : "SAFE";

    // Save the raw water-level reading
    const RAW_RETENTION_DAYS = 30;

const newData = await WaterLevel.create({
  water_level: waterValue,
  warning_level: warningValue,
  danger_level: dangerValue,
  status,
  camera_id: normalizedCameraId,
  timestamp: capturedAt,
  received_at: new Date(),
  expires_at: new Date(
    Date.now() + RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000
  ),
});

    // Use Philippine date for daily history grouping
    const date = getPhilippineDate(capturedAt);

    const statusCounter =
      status === "DANGER"
        ? "danger_count"
        : status === "WARNING"
          ? "warning_count"
          : "safe_count";

    // Update or create the daily summary
    await WaterLevelDailyHistory.updateOne(
      {
        camera_id: normalizedCameraId,
        date,
      },
      {
        $min: {
          minimum_level: waterValue,
        },

        $max: {
          maximum_level: waterValue,
        },

        $inc: {
          total_level: waterValue,
          reading_count: 1,
          [statusCounter]: 1,
        },

        $set: {
          latest_level: waterValue,
          latest_status: status,
          latest_timestamp: capturedAt,
        },
      },
      {
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.status(201).json({
      success: true,
      message: "Water-level reading recorded successfully.",
      data: newData,
    });
  } catch (error) {
    console.error("createWaterLevel error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to record the water-level reading.",
    });
  }
};


// ======================================================
// GET RAW WATER-LEVEL READINGS
// GET /api/water-levels
//
// Examples:
// /api/water-levels
// /api/water-levels?camera_id=cam_1
// /api/water-levels?camera_id=cam_1&page=1&limit=100
// /api/water-levels?start_date=2026-06-01&end_date=2026-06-30
// ======================================================

export const getWaterLevels = async (req, res) => {
  try {
    const {
      camera_id,
      start_date,
      end_date,
      status,
      page = 1,
      limit = 100,
    } = req.query;

    const pageNumber = Math.max(
      Number.parseInt(page, 10) || 1,
      1
    );

    const limitNumber = Math.min(
      Math.max(Number.parseInt(limit, 10) || 100, 1),
      500
    );

    const filter = {};

    // Filter by camera
    if (camera_id) {
      const normalizedCameraId = String(camera_id).trim();

      if (!isValidCameraId(normalizedCameraId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid camera_id.",
        });
      }

      filter.camera_id = normalizedCameraId;
    }

    // Filter by status
    if (status) {
      const normalizedStatus = String(status).toUpperCase();

      if (
        !["SAFE", "WARNING", "DANGER"].includes(
          normalizedStatus
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "status must be SAFE, WARNING or DANGER.",
        });
      }

      filter.status = normalizedStatus;
    }

    // Filter by timestamp
    if (start_date || end_date) {
      filter.timestamp = {};

      if (start_date) {
        const startDate = new Date(start_date);

        if (Number.isNaN(startDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: "start_date must be a valid date.",
          });
        }

        filter.timestamp.$gte = startDate;
      }

      if (end_date) {
        const endDate = new Date(end_date);

        if (Number.isNaN(endDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: "end_date must be a valid date.",
          });
        }

        /*
         * When end_date is YYYY-MM-DD, include the entire day.
         * Example: 2026-06-30 becomes before 2026-07-01.
         */
        if (isValidHistoryDate(String(end_date))) {
          endDate.setUTCDate(endDate.getUTCDate() + 1);
          filter.timestamp.$lt = endDate;
        } else {
          filter.timestamp.$lte = endDate;
        }
      }
    }

    const skip = (pageNumber - 1) * limitNumber;

    const [data, total] = await Promise.all([
      WaterLevel.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),

      WaterLevel.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        total_pages: Math.ceil(total / limitNumber),
        has_next_page: skip + data.length < total,
        has_previous_page: pageNumber > 1,
      },
    });
  } catch (error) {
    console.error("getWaterLevels error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve water-level readings.",
    });
  }
};


// ======================================================
// GET LATEST WATER-LEVEL READING
// GET /api/water-levels/latest/:camera_id
//
// Example:
// /api/water-levels/latest/cam_1
// ======================================================

export const getLatestWaterLevel = async (req, res) => {
  try {
    const cameraId = String(
      req.params.camera_id || ""
    ).trim();

    if (!isValidCameraId(cameraId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid camera_id.",
      });
    }

    const data = await WaterLevel.findOne({
      camera_id: cameraId,
    })
      .sort({ timestamp: -1 })
      .select(
        "water_level warning_level danger_level status camera_id timestamp"
      )
      .lean();

    /*
     * Return an empty object to preserve your original
     * frontend and Unity behavior.
     */
    if (!data) {
      return res.status(200).json({});
    }

    return res.status(200).json({
      water_level: data.water_level,
      warning_level: data.warning_level,
      danger_level: data.danger_level,
      status: data.status,
      camera_id: data.camera_id,
      timestamp: data.timestamp,
    });
  } catch (error) {
    console.error("getLatestWaterLevel error:", error);

    return res.status(500).json({});
  }
};

// ======================================================
// GET RAW WATER-LEVEL HISTORY BY CAMERA
// GET /api/water-levels/history/:camera_id
// ======================================================

export const getWaterLevelHistoryByCamera = async (req, res) => {
  try {
    const cameraId = String(req.params.camera_id || "").trim();

    if (!isValidCameraId(cameraId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid camera_id.",
      });
    }

    const data = await WaterLevel.find({
      camera_id: cameraId,
    })
      .sort({ timestamp: 1 })
      .select(
        "water_level warning_level danger_level status camera_id timestamp"
      )
      .lean();

    return res.status(200).json(data);
  } catch (error) {
    console.error("getWaterLevelHistoryByCamera error:", error);

    return res.status(500).json([]);
  }
};


// ======================================================
// GET DAILY WATER-LEVEL HISTORY
// GET /api/water-levels/history/daily
//
// Examples:
// /api/water-levels/history/daily
// /api/water-levels/history/daily?camera_id=cam_1
// /api/water-levels/history/daily?camera_id=cam_1&page=1&limit=31
// /api/water-levels/history/daily?start_date=2026-06-01&end_date=2026-06-30
// ======================================================

export const getDailyWaterLevelHistory = async (req, res) => {
  try {
    const {
      camera_id = "cam_1",
      start_date,
      end_date,
      page = 1,
      limit = 31,
    } = req.query;

    const normalizedCameraId = String(camera_id).trim();

    if (!isValidCameraId(normalizedCameraId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid camera_id.",
      });
    }

    const pageNumber = Math.max(
      Number.parseInt(page, 10) || 1,
      1
    );

    const limitNumber = Math.min(
      Math.max(Number.parseInt(limit, 10) || 31, 1),
      366
    );

    const filter = {
      camera_id: normalizedCameraId,
    };

    if (start_date || end_date) {
      filter.date = {};

      if (start_date) {
        if (!isValidHistoryDate(String(start_date))) {
          return res.status(400).json({
            success: false,
            message: "start_date must use YYYY-MM-DD format.",
          });
        }

        filter.date.$gte = String(start_date);
      }

      if (end_date) {
        if (!isValidHistoryDate(String(end_date))) {
          return res.status(400).json({
            success: false,
            message: "end_date must use YYYY-MM-DD format.",
          });
        }

        filter.date.$lte = String(end_date);
      }
    }

    const skip = (pageNumber - 1) * limitNumber;

    const [records, total] = await Promise.all([
      WaterLevelDailyHistory.find(filter)
        .sort({ date: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),

      WaterLevelDailyHistory.countDocuments(filter),
    ]);

    const data = records.map((record) => {
      const averageLevel =
        record.reading_count > 0
          ? Number(
              (
                record.total_level /
                record.reading_count
              ).toFixed(2)
            )
          : 0;

      return {
        _id: record._id,
        camera_id: record.camera_id,
        date: record.date,

        minimum_level: record.minimum_level,
        maximum_level: record.maximum_level,
        average_level: averageLevel,

        latest_level: record.latest_level,
        latest_status: record.latest_status,
        latest_timestamp: record.latest_timestamp,

        reading_count: record.reading_count,

        safe_count: record.safe_count || 0,
        warning_count: record.warning_count || 0,
        danger_count: record.danger_count || 0,

        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
    });

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        total_pages: Math.ceil(total / limitNumber),
        has_next_page: skip + data.length < total,
        has_previous_page: pageNumber > 1,
      },
    });
  } catch (error) {
    console.error(
      "getDailyWaterLevelHistory error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve daily history.",
    });
  }
};


// ======================================================
// DELETE DAILY WATER-LEVEL HISTORY
// DELETE /api/water-levels/history/daily/:id
// ======================================================

export const deleteDailyWaterLevelHistory = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    const deletedRecord =
      await WaterLevelDailyHistory.findByIdAndDelete(id);

    if (!deletedRecord) {
      return res.status(404).json({
        success: false,
        message: "Daily history record not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Daily history record deleted successfully.",
      data: deletedRecord,
    });
  } catch (error) {
    console.error(
      "deleteDailyWaterLevelHistory error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to delete the history record.",
    });
  }
};


// ======================================================
// GET WATER-LEVEL ANALYTICS
// GET /api/water-levels/analytics
//
// Examples:
// /api/water-levels/analytics?camera_id=cam_1&period=weekly
// /api/water-levels/analytics?camera_id=cam_1&period=monthly
// /api/water-levels/analytics?camera_id=cam_1&period=yearly
// /api/water-levels/analytics?camera_id=cam_1&period=monthly&start_date=2026-01-01&end_date=2026-12-31
// ======================================================

export const getWaterLevelAnalytics = async (req, res) => {
  try {
    const {
      camera_id = "cam_1",
      period = "monthly",
      start_date,
      end_date,
    } = req.query;

    const normalizedCameraId = String(camera_id).trim();

    if (!isValidCameraId(normalizedCameraId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid camera_id.",
      });
    }

    const normalizedPeriod = String(period).toLowerCase();

    if (
      !["weekly", "monthly", "yearly"].includes(
        normalizedPeriod
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "period must be weekly, monthly, or yearly.",
      });
    }

    const filter = {
      camera_id: normalizedCameraId,
    };

    if (start_date || end_date) {
      filter.date = {};

      if (start_date) {
        if (!isValidHistoryDate(String(start_date))) {
          return res.status(400).json({
            success: false,
            message:
              "start_date must use YYYY-MM-DD format.",
          });
        }

        filter.date.$gte = String(start_date);
      }

      if (end_date) {
        if (!isValidHistoryDate(String(end_date))) {
          return res.status(400).json({
            success: false,
            message:
              "end_date must use YYYY-MM-DD format.",
          });
        }

        filter.date.$lte = String(end_date);
      }
    }

    const records = await WaterLevelDailyHistory.find(filter)
      .sort({ date: 1 })
      .lean();

    const groupedAnalytics = {};

    records.forEach((record) => {
      const groupKey = getAnalyticsGroupKey(
        record.date,
        normalizedPeriod
      );

      if (!groupedAnalytics[groupKey]) {
        groupedAnalytics[groupKey] = {
          period: normalizedPeriod,
          label: groupKey,
          camera_id: normalizedCameraId,

          start_date: record.date,
          end_date: record.date,

          days_count: 0,
          reading_count: 0,

          total_level: 0,
          minimum_level: record.minimum_level,
          maximum_level: record.maximum_level,

          safe_count: 0,
          warning_count: 0,
          danger_count: 0,

          latest_level: record.latest_level,
          latest_status: record.latest_status,
          latest_timestamp: record.latest_timestamp,
        };
      }

      const group = groupedAnalytics[groupKey];

      group.days_count += 1;
      group.reading_count += Number(record.reading_count || 0);
      group.total_level += Number(record.total_level || 0);

      group.minimum_level = Math.min(
        group.minimum_level,
        Number(record.minimum_level || 0)
      );

      group.maximum_level = Math.max(
        group.maximum_level,
        Number(record.maximum_level || 0)
      );

      group.safe_count += Number(record.safe_count || 0);
      group.warning_count += Number(record.warning_count || 0);
      group.danger_count += Number(record.danger_count || 0);

      if (record.date < group.start_date) {
        group.start_date = record.date;
      }

      if (record.date > group.end_date) {
        group.end_date = record.date;
      }

      const currentLatest = group.latest_timestamp
        ? new Date(group.latest_timestamp).getTime()
        : 0;

      const recordLatest = record.latest_timestamp
        ? new Date(record.latest_timestamp).getTime()
        : 0;

      if (recordLatest >= currentLatest) {
        group.latest_level = record.latest_level;
        group.latest_status = record.latest_status;
        group.latest_timestamp = record.latest_timestamp;
      }
    });

    const data = Object.values(groupedAnalytics)
      .map((group) => ({
        ...group,

        average_level:
          group.reading_count > 0
            ? Number(
                (
                  group.total_level / group.reading_count
                ).toFixed(2)
              )
            : 0,
      }))
      .sort((a, b) => b.label.localeCompare(a.label));

    return res.status(200).json({
      success: true,
      period: normalizedPeriod,
      camera_id: normalizedCameraId,
      data,
    });
  } catch (error) {
    console.error("getWaterLevelAnalytics error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve water-level analytics.",
    });
  }
};
