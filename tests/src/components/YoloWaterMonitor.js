import React, { useEffect, useState } from "react";
import { API_BASE_URL } from "../config/api";

export default function YoloWaterMonitor() {
  const [running, setRunning] = useState(false);
  const [waterLevel, setWaterLevel] = useState(null);
  const [loading, setLoading] = useState(false);

  const startYolo = async () => {
    const response = await fetch(`${API_BASE_URL}/api/yolo/start`, {
      method: "POST",
      credentials: "include",
    });

    return response.json();
  };

  const stopYolo = async () => {
    const response = await fetch(`${API_BASE_URL}/api/yolo/stop`, {
      method: "POST",
      credentials: "include",
    });

    return response.json();
  };

  const getYoloStatus = async () => {
    const response = await fetch(`${API_BASE_URL}/api/yolo/status`, {
      credentials: "include",
    });

    return response.json();
  };

  const getLatestWaterLevel = async (cameraId = "cam_1") => {
    const response = await fetch(
      `${API_BASE_URL}/api/water-levels/latest/${cameraId}`,
      {
        credentials: "include",
      }
    );

    return response.json();
  };

  const checkStatus = async () => {
    try {
      const data = await getYoloStatus();
      setRunning(Boolean(data.running));
    } catch (error) {
      console.error("YOLO status error:", error);
    }
  };

  const loadLatestWaterLevel = async () => {
    try {
      const data = await getLatestWaterLevel("cam_1");
      setWaterLevel(data);
    } catch (error) {
      console.error("Water level error:", error);
    }
  };

  const handleStart = async () => {
    try {
      setLoading(true);

      const data = await startYolo();

      if (!data.success) {
        alert(data.message || "Failed to start YOLO");
        return;
      }

      alert(data.message || "YOLO started");
      checkStatus();
      loadLatestWaterLevel();
    } catch (error) {
      console.error("Start YOLO error:", error);
      alert("Failed to start YOLO");
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    try {
      setLoading(true);

      const data = await stopYolo();

      if (!data.success) {
        alert(data.message || "Failed to stop YOLO");
        return;
      }

      alert(data.message || "YOLO stopped");
      checkStatus();
    } catch (error) {
      console.error("Stop YOLO error:", error);
      alert("Failed to stop YOLO");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
    loadLatestWaterLevel();

    const interval = setInterval(() => {
      checkStatus();
      loadLatestWaterLevel();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>YOLO TEST PAGE LOADED</h1>
      <h2>YOLO Water Level Monitor</h2>

      <p>
        <strong>YOLO Status:</strong>{" "}
        <span style={{ color: running ? "green" : "red" }}>
          {running ? "Running" : "Not Running"}
        </span>
      </p>

      <button onClick={handleStart} disabled={loading || running}>
        {loading ? "Loading..." : "Start YOLO"}
      </button>

      <button
        onClick={handleStop}
        disabled={loading || !running}
        style={{ marginLeft: 10 }}
      >
        {loading ? "Loading..." : "Stop YOLO"}
      </button>

      <hr />

      <h3>Latest Water Level</h3>

      <p>
        <strong>Camera:</strong> {waterLevel?.camera_id || "No data yet"}
      </p>

      <p>
        <strong>Water Level:</strong>{" "}
        {waterLevel?.water_level ?? "No data yet"} m
      </p>

      <p>
        <strong>Status:</strong> {waterLevel?.status || "No data yet"}
      </p>

      <p>
        <strong>Updated:</strong> {waterLevel?.timestamp || "No data yet"}
      </p>
    </div>
  );
}
