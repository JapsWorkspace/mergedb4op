import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE_URL } from "../../config/api";
import {
  DAILY_HISTORY_LIMIT,
  DEFAULT_CAMERA_ID,
  formatDateTime,
  formatLevel,
  formatShortDate,
  getStatusLabel,
  getStatusTone,
  normalizeCameraIds,
  normalizeDailyHistory,
  normalizeLatestReading,
  toNumber,
} from "../DigitalTwin/waterTwinUtils";

const BASE_URL = API_BASE_URL;

async function fetchJson(path) {
  const response = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Request failed.");
  }

  return response.json();
}

export default function PublicDigitalTwinPanel() {
  const iframeRef = useRef(null);
  const [allReadings, setAllReadings] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(DEFAULT_CAMERA_ID);
  const [latestReading, setLatestReading] = useState(null);
  const [dailyHistory, setDailyHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState("");

  const cameraIds = useMemo(
    () => normalizeCameraIds(allReadings, [DEFAULT_CAMERA_ID]),
    [allReadings]
  );

  const currentLevel = toNumber(latestReading?.water_level, 0);
  const warningLevel = toNumber(latestReading?.warning_level, 8);
  const dangerLevel = toNumber(latestReading?.danger_level, 10);
  const currentStatus = String(latestReading?.status || "SAFE").toUpperCase();
  const statusTone = getStatusTone(currentStatus);
  const statusLabel = getStatusLabel(currentStatus);
  const selectedHistory = dailyHistory.slice(0, DAILY_HISTORY_LIMIT);
  const latestTimestamp =
    latestReading?.timestamp || latestReading?.createdAt || lastSyncedAt;

  const loadCameraCatalog = useCallback(async () => {
    try {
      const data = await fetchJson("/api/water-levels?limit=200");
      const items = Array.isArray(data?.data) ? data.data : [];
      setAllReadings(items);

      const nextCameraIds = normalizeCameraIds(items, [DEFAULT_CAMERA_ID]);
      if (!nextCameraIds.includes(selectedCamera)) {
        setSelectedCamera(nextCameraIds[0] || DEFAULT_CAMERA_ID);
      }
    } catch (catalogError) {
      console.warn("Unable to load camera catalog:", catalogError);
    }
  }, [selectedCamera]);

  const loadSelectedCameraData = useCallback(async (cameraId) => {
    if (!cameraId) return;

    setLoading(true);
    setHistoryLoading(true);
    setError("");

    const [latestResult, historyResult] = await Promise.allSettled([
      fetchJson(`/api/water-levels/latest/${encodeURIComponent(cameraId)}`),
      fetchJson(
        `/api/water-levels/history/daily?camera_id=${encodeURIComponent(
          cameraId
        )}&page=1&limit=${DAILY_HISTORY_LIMIT}`
      ),
    ]);

    if (latestResult.status === "fulfilled") {
      setLatestReading(normalizeLatestReading(latestResult.value, cameraId));
    } else {
      setLatestReading(null);
    }

    if (historyResult.status === "fulfilled") {
      const historyItems = Array.isArray(historyResult.value?.data?.data)
        ? historyResult.value.data.data
        : Array.isArray(historyResult.value?.data)
          ? historyResult.value.data
          : [];

      const nextHistory = normalizeDailyHistory(historyItems).slice(
        0,
        DAILY_HISTORY_LIMIT
      );
      setDailyHistory(nextHistory);
    } else {
      setDailyHistory([]);
    }

    const errors = [];

    if (latestResult.status === "rejected") {
      errors.push(
        latestResult.reason?.message ||
          "Unable to load the latest Digital Twin reading."
      );
    }

    if (historyResult.status === "rejected") {
      errors.push(
        historyResult.reason?.message ||
          "Unable to load recent Digital Twin history."
      );
    }

    setError(errors.join(" "));
    setLastSyncedAt(new Date().toISOString());
    setLoading(false);
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    loadCameraCatalog();
  }, [loadCameraCatalog]);

  useEffect(() => {
    loadSelectedCameraData(selectedCamera);
  }, [loadSelectedCameraData, selectedCamera]);

  useEffect(() => {
    if (!iframeRef.current?.contentWindow) return;

    iframeRef.current.contentWindow.postMessage(
      {
        type: "SAGIP_WATER_LEVEL_UPDATE",
        payload: {
          camera_id: selectedCamera,
          water_level: currentLevel,
          warning_level: warningLevel,
          danger_level: dangerLevel,
          status: currentStatus,
          timestamp: latestTimestamp || null,
          history: dailyHistory,
        },
      },
      "*"
    );
  }, [
    currentLevel,
    currentStatus,
    dailyHistory,
    dangerLevel,
    latestTimestamp,
    selectedCamera,
    warningLevel,
  ]);

  return (
    <div className="landing-twin-stage">
      <div className="landing-twin-data-card landing-twin-data-card--public">
        <div className="landing-twin-topbar landing-twin-topbar--public">
          <div>
            <span className="landing-twin-kicker">Public Water Monitoring</span>
            <h2>Digital Twin</h2>
          </div>

          <div className={`landing-twin-status-pill ${statusTone}`}>
            <span className="landing-twin-status-dot" aria-hidden="true" />
            {statusLabel}
          </div>
        </div>

        <div className="landing-twin-toolbar landing-twin-toolbar--public">
          <label className="landing-twin-camera-picker">
            <span>Camera</span>
            <select
              value={selectedCamera}
              onChange={(event) => setSelectedCamera(event.target.value)}
            >
              {cameraIds.map((cameraId) => (
                <option key={cameraId} value={cameraId}>
                  {cameraId}
                </option>
              ))}
            </select>
          </label>

          <div className="landing-twin-sync-chip">
            Last synced: {formatDateTime(lastSyncedAt)}
          </div>
        </div>

        <div className="landing-twin-summary-grid landing-twin-summary-grid--compact">
          <article className="landing-twin-summary-card landing-twin-summary-card--compact">
            <span>Current Level</span>
            <strong>{formatLevel(currentLevel)}</strong>
          </article>

          <article className="landing-twin-summary-card landing-twin-summary-card--compact">
            <span>Warning Level</span>
            <strong>{formatLevel(warningLevel)}</strong>
          </article>

          <article className="landing-twin-summary-card landing-twin-summary-card--compact">
            <span>Danger Level</span>
            <strong>{formatLevel(dangerLevel)}</strong>
          </article>
        </div>

        {error ? (
          <div className="landing-twin-inline-alert error">{error}</div>
        ) : loading ? (
          <div className="landing-twin-inline-alert loading">
            Loading Digital Twin data...
          </div>
        ) : null}

        <div className="landing-twin-board landing-twin-board--public">
          <div className="landing-twin-frame-card">
            <iframe
              ref={iframeRef}
              title="SagipBayan Digital Twin"
              src="/unity/digital-twin/index.html"
              className="landing-twin-frame"
              allowFullScreen
            />
          </div>

          <aside className="landing-twin-history-card">
            <div className="landing-twin-history-head">
              <div>
                <h3>Recent History</h3>
                <span>{selectedCamera}</span>
              </div>

              <small className="landing-twin-history-sync">
                {formatDateTime(latestTimestamp)}
              </small>
            </div>

            {historyLoading ? (
              <div className="landing-twin-history-empty">Loading history...</div>
            ) : selectedHistory.length ? (
              <div className="landing-twin-history-list">
                {selectedHistory.map((entry) => (
                  <div
                    key={`${entry.camera_id}-${entry.date}`}
                    className="landing-twin-history-item"
                  >
                    <div className="landing-twin-history-copy">
                      <strong>{formatShortDate(entry.date)}</strong>
                      <span>
                        {formatLevel(entry.lowestLevel)} to{" "}
                        {formatLevel(entry.highestLevel)}
                      </span>
                    </div>

                    <div className="landing-twin-history-meta">
                      <span
                        className={`landing-twin-history-status ${getStatusTone(
                          entry.latestStatus
                        )}`}
                      >
                        {getStatusLabel(entry.latestStatus)}
                      </span>
                      <small>{formatLevel(entry.latestLevel)}</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="landing-twin-history-empty">
                No daily history for this camera yet.
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
