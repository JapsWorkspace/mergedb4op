import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DashboardShell from "../layout/DashboardShell";
import "../css/DigitalTwin.css";
import { API_BASE_URL } from "../../config/api";
import {
  DEFAULT_CAMERA_ID,
  formatDateTime,
  formatLevel,
  getRecordExplanation,
  getRecordLabel,
  getRecordRange,
  getRecordSummary,
  getStatusLabel,
  getStatusTone,
  groupRawHistoryByDay,
  normalizeAnalyticsHistory,
  normalizeCameraIds,
  normalizeDailyHistory,
  normalizeLatestReading,
  PERIOD_OPTIONS,
  toNumber,
} from "./waterTwinUtils";

const LOGIC2_BASE_URL = String(process.env.REACT_APP_LOGIC2_API_URL || "").replace(
  /\/+$/,
  ""
);
const IS_LOCAL_HOST =
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1"].includes(window.location.hostname);
const WATER_LEVEL_API_BASES = IS_LOCAL_HOST
  ? [API_BASE_URL, LOGIC2_BASE_URL].filter(Boolean)
  : [API_BASE_URL];
const DEFAULT_FILTERS = {
  period: "daily",
  startDate: "",
  endDate: "",
};

const fetchFromAnyBase = async (path) => {
  let lastError = null;

  for (const baseUrl of WATER_LEVEL_API_BASES) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "GET",
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        return { data, baseUrl, status: response.status };
      }

      if (response.status === 404) {
        lastError = new Error(`Route not found on ${baseUrl}`);
        continue;
      }

      const message = await response.text();
      lastError = new Error(message || `Request failed on ${baseUrl}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Failed to fetch water level records.");
};

const deleteFromAnyBase = async (path) => {
  let lastError = null;

  for (const baseUrl of WATER_LEVEL_API_BASES) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        return { data, baseUrl, status: response.status };
      }

      if (response.status === 404) {
        lastError = new Error(`Route not found on ${baseUrl}`);
        continue;
      }

      const message = await response.text();
      lastError = new Error(message || `Request failed on ${baseUrl}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Failed to delete water level history.");
};

export default function UnityDigitalTwin() {
  const iframeRef = useRef(null);
  const [allReadings, setAllReadings] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(DEFAULT_CAMERA_ID);
  const [filterDraft, setFilterDraft] = useState(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS);
  const [latestReading, setLatestReading] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const cameraIds = useMemo(
    () => normalizeCameraIds(allReadings, [DEFAULT_CAMERA_ID]),
    [allReadings]
  );

  const period = appliedFilters.period;
  const isDailyMode = period === "daily";
  const status = latestReading?.status || "SAFE";
  const statusTone = getStatusTone(status);
  const statusLabel = getStatusLabel(status);

  const currentLevel = toNumber(latestReading?.water_level, 0);
  const warningLevel = toNumber(latestReading?.warning_level, 8);
  const dangerLevel = toNumber(latestReading?.danger_level, 10);
  const totalReadings = records.reduce(
    (sum, record) => sum + toNumber(record?.readingCount, 0),
    0
  );
  const dangerReadings = records.reduce(
    (sum, record) => sum + toNumber(record?.dangerCount, 0),
    0
  );
  const weightedLevelTotal = records.reduce(
    (sum, record) =>
      sum + toNumber(record?.averageLevel, 0) * toNumber(record?.readingCount, 0),
    0
  );
  const overallAverageLevel =
    totalReadings > 0 ? weightedLevelTotal / totalReadings : null;
  const highestLevel =
    records.length > 0
      ? Math.max(...records.map((record) => toNumber(record?.highestLevel, 0)))
      : null;
  const latestTimestamp =
    latestReading?.timestamp || latestReading?.createdAt || lastSyncedAt;

  const loadCameraCatalog = useCallback(async () => {
    try {
      const { data } = await fetchFromAnyBase("/api/water-levels?limit=250");
      const items = Array.isArray(data?.data) ? data.data : [];
      setAllReadings(items);

      const ids = normalizeCameraIds(items, [DEFAULT_CAMERA_ID]);
      if (!ids.includes(selectedCamera)) {
        setSelectedCamera(ids[0] || DEFAULT_CAMERA_ID);
      }
    } catch (catalogError) {
      console.warn("Unable to load camera catalog:", catalogError);
    }
  }, [selectedCamera]);

  const loadSelectedCameraData = useCallback(async (cameraId, filters) => {
    if (!cameraId) return;

    const nextFilters = filters || DEFAULT_FILTERS;
    const { period: selectedPeriod, startDate, endDate } = nextFilters;

    if (startDate && endDate && startDate > endDate) {
      setError("Start date cannot be later than end date.");
      setLoading(false);
      setHistoryLoading(false);
      return;
    }

    setLoading(true);
    setHistoryLoading(true);
    setError("");

    const latestRequest = fetchFromAnyBase(
      `/api/water-levels/latest/${encodeURIComponent(cameraId)}`
    );
    const rawHistoryRequest = fetchFromAnyBase(
      `/api/water-levels/history/${encodeURIComponent(cameraId)}`
    );

    const historyParams = new URLSearchParams({
      camera_id: cameraId,
    });

    let historyPath = "";

    if (selectedPeriod === "daily") {
      historyParams.append("page", "1");
      historyParams.append("limit", String(31));

      if (startDate) historyParams.append("start_date", startDate);
      if (endDate) historyParams.append("end_date", endDate);

      historyPath = `/api/water-levels/history/daily?${historyParams.toString()}`;
    } else {
      historyParams.append("period", selectedPeriod);

      if (startDate) historyParams.append("start_date", startDate);
      if (endDate) historyParams.append("end_date", endDate);

      historyPath = `/api/water-levels/analytics?${historyParams.toString()}`;
    }

    const historyRequest = fetchFromAnyBase(historyPath);

    const [latestResult, historyResult, rawHistoryResult] =
      await Promise.allSettled([
        latestRequest,
        historyRequest,
        rawHistoryRequest,
      ]);

    const nextErrors = [];
    let nextLatest = null;
    let nextRecords = [];

    if (latestResult.status === "fulfilled") {
      nextLatest = normalizeLatestReading(latestResult.value?.data, cameraId);
    } else {
      nextErrors.push(
        latestResult.reason?.message ||
          "Unable to load the latest Digital Twin reading."
      );
    }

    const historyPayload =
      historyResult.status === "fulfilled" ? historyResult.value?.data : null;
    const rawHistoryPayload =
      rawHistoryResult.status === "fulfilled" ? rawHistoryResult.value?.data : [];
    const rawHistoryItems = Array.isArray(rawHistoryPayload?.data)
      ? rawHistoryPayload.data
      : Array.isArray(rawHistoryPayload)
        ? rawHistoryPayload
        : [];

    if (selectedPeriod === "daily") {
      const dailyItems = Array.isArray(historyPayload?.data)
        ? historyPayload.data
        : Array.isArray(historyPayload)
          ? historyPayload
          : [];

      if (dailyItems.length > 0) {
        nextRecords = normalizeDailyHistory(dailyItems);
      } else {
        nextRecords = groupRawHistoryByDay(rawHistoryItems);
      }
    } else {
      const analyticsItems = Array.isArray(historyPayload?.data)
        ? historyPayload.data
        : Array.isArray(historyPayload)
          ? historyPayload
          : [];
      nextRecords = normalizeAnalyticsHistory(analyticsItems);
    }

    if (historyResult.status === "rejected") {
      nextErrors.push(
        historyResult.reason?.message || "Unable to load water-level history."
      );
    }

    if (selectedPeriod === "daily" && nextRecords.length === 0) {
      nextErrors.push("No water-level data found for the selected camera.");
    }

    setLatestReading(nextLatest);
    setRecords(nextRecords);
    setError(nextErrors.join(" "));
    setLastSyncedAt(new Date().toISOString());
    setLoading(false);
    setHistoryLoading(false);
  }, []);

  const refreshAllData = useCallback(async () => {
    await loadCameraCatalog();
    await loadSelectedCameraData(selectedCamera, appliedFilters);
  }, [appliedFilters, loadCameraCatalog, loadSelectedCameraData, selectedCamera]);

  useEffect(() => {
    loadCameraCatalog();
  }, [loadCameraCatalog]);

  useEffect(() => {
    loadSelectedCameraData(selectedCamera, appliedFilters);
  }, [appliedFilters, loadSelectedCameraData, selectedCamera]);

  useEffect(() => {
    if (!cameraIds.includes(selectedCamera)) {
      setSelectedCamera(cameraIds[0] || DEFAULT_CAMERA_ID);
    }
  }, [cameraIds, selectedCamera]);

  useEffect(() => {
    if (!iframeRef.current?.contentWindow) return;

    iframeRef.current.contentWindow.postMessage(
      {
        type: "SAGIP_WATER_LEVEL_UPDATE",
        payload: {
          camera_id: latestReading?.camera_id || selectedCamera,
          water_level: currentLevel,
          warning_level: warningLevel,
          danger_level: dangerLevel,
          status,
          timestamp: latestTimestamp || null,
          history: records.slice(0, 8),
        },
      },
      "*"
    );
  }, [
    currentLevel,
    dangerLevel,
    latestReading?.camera_id,
    latestTimestamp,
    records,
    selectedCamera,
    status,
    warningLevel,
  ]);

  const handleFilterChange = (field, value) => {
    setFilterDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleApplyFilters = async (event) => {
    event.preventDefault();

    if (
      filterDraft.startDate &&
      filterDraft.endDate &&
      filterDraft.startDate > filterDraft.endDate
    ) {
      setError("Start date cannot be later than end date.");
      return;
    }

    setAppliedFilters(filterDraft);
  };

  const handleResetFilters = () => {
    setFilterDraft(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setError("");
  };

  const handleDelete = async (record) => {
    if (!record?.id) {
      setError("Only daily records can be deleted.");
      return;
    }

    const confirmed = window.confirm(
      `Delete the daily history record for ${record.date || record.label}?`
    );

    if (!confirmed) return;

    try {
      setDeletingId(record.id);
      setError("");

      await deleteFromAnyBase(`/api/water-levels/history/daily/${record.id}`);
      await loadSelectedCameraData(selectedCamera, appliedFilters);
    } catch (deleteError) {
      setError(
        deleteError?.message || "An error occurred while deleting the record."
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <DashboardShell>
      <div className="digital-twin-page">
        <section className="digital-twin-guidance-grid">
          <article className="digital-twin-guidance-card safe">
            <span>SAFE</span>
            <strong>Water level is below warning.</strong>
            <p>
              Citizens should stay informed, especially during heavy rain or
              typhoon conditions.
            </p>
          </article>

          <article className="digital-twin-guidance-card warning">
            <span>WARNING</span>
            <strong>Water level is rising.</strong>
            <p>
              Prepare emergency supplies, monitor advisories, and avoid
              rivers, bridges, and flood-prone roads.
            </p>
          </article>

          <article className="digital-twin-guidance-card danger">
            <span>DANGER</span>
            <strong>Flood risk is high.</strong>
            <p>
              Follow MDRRMO instructions, avoid flooded areas, and prepare for
              possible evacuation when advised.
            </p>
          </article>
        </section>

        <form className="digital-twin-filter-bar" onSubmit={handleApplyFilters}>
          <label className="digital-twin-filter-field">
            <span>Information View</span>
            <select
              value={filterDraft.period}
              onChange={(event) => handleFilterChange("period", event.target.value)}
            >
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="digital-twin-filter-field">
            <span>Start Date</span>
            <input
              type="date"
              value={filterDraft.startDate}
              onChange={(event) =>
                handleFilterChange("startDate", event.target.value)
              }
            />
          </label>

          <label className="digital-twin-filter-field">
            <span>End Date</span>
            <input
              type="date"
              value={filterDraft.endDate}
              onChange={(event) =>
                handleFilterChange("endDate", event.target.value)
              }
            />
          </label>

          <div className="digital-twin-filter-actions">
            <button
              type="button"
              className="digital-twin-secondary-btn"
              onClick={handleResetFilters}
            >
              Reset
            </button>

            <button type="submit" className="digital-twin-primary-btn">
              Apply
            </button>
          </div>
        </form>

        {error ? (
          <div className="digital-twin-banner error">{error}</div>
        ) : loading ? (
          <div className="digital-twin-banner loading">
            Syncing water-level data...
          </div>
        ) : null}

        <section className="digital-twin-metric-grid">
          <article className="digital-twin-metric-card current">
            <span>Current Level</span>
            <strong>{formatLevel(currentLevel)}</strong>
            <small>
              {latestReading ? `Camera ${latestReading.camera_id}` : "No live reading"}
            </small>
          </article>

          <article className="digital-twin-metric-card average">
            <span>Average Level</span>
            <strong>{formatLevel(overallAverageLevel)}</strong>
            <small>Average from selected {period} records</small>
          </article>

          <article className="digital-twin-metric-card highest">
            <span>Highest Level</span>
            <strong>{formatLevel(highestLevel)}</strong>
            <small>Highest recorded level in selected period</small>
          </article>

          <article className="digital-twin-metric-card danger">
            <span>Danger Readings</span>
            <strong>{dangerReadings}</strong>
            <small>Out of {totalReadings} total readings</small>
          </article>
        </section>

        <section className="digital-twin-workspace">
          <div className="digital-twin-main-panel">
            <div className="digital-twin-panel-head">
              <div>
                <h2>Unity Digital Twin</h2>
              </div>

              <div className="digital-twin-toolbar">
                <label className="digital-twin-camera-picker">
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
              </div>
            </div>

            <div className="digital-twin-frame-wrap">
              <iframe
                ref={iframeRef}
                title="Sagip Bayan Digital Twin"
                src="/unity/digital-twin/index.html"
                className="digital-twin-frame"
                allowFullScreen
              />
            </div>

            {historyLoading ? (
              <div className="digital-twin-inline-alert loading">
                Syncing history...
              </div>
            ) : null}
          </div>

          <aside className="digital-twin-side-panel">
            <section className="digital-twin-side-card">
              <div className="digital-twin-side-head">
                <h3>Live Reading</h3>
                <span className={`digital-twin-status-chip ${statusTone}`}>
                  {statusLabel}
                </span>
              </div>

              <div className="digital-twin-reading-grid">
                <div>
                  <span>Camera</span>
                  <strong>{latestReading?.camera_id || selectedCamera}</strong>
                </div>

                <div>
                  <span>Water Level</span>
                  <strong>{formatLevel(currentLevel)}</strong>
                </div>

                <div>
                  <span>Warning</span>
                  <strong>{formatLevel(warningLevel)}</strong>
                </div>

                <div>
                  <span>Danger</span>
                  <strong>{formatLevel(dangerLevel)}</strong>
                </div>
              </div>
            </section>

          </aside>
        </section>

        <section className="digital-twin-table-panel">
          <div className="digital-twin-table-header">
            <div>
              <h2>
                {isDailyMode
                  ? "Daily Water-Level Information"
                  : `${period.charAt(0).toUpperCase()}${period.slice(
                      1
                    )} Water-Level Summary`}
              </h2>
            </div>

            <button
              type="button"
              className="digital-twin-refresh-btn"
              onClick={() => loadSelectedCameraData(selectedCamera, appliedFilters)}
            >
              <span className="digital-twin-btn-mark" aria-hidden="true">
                ↻
              </span>
              Refresh Table
            </button>
          </div>

          {historyLoading ? (
            <div className="digital-twin-table-empty">Loading water-level rows...</div>
          ) : records.length === 0 ? (
            <div className="digital-twin-table-empty">No water-level information found.</div>
          ) : (
            <div className="digital-twin-table-wrap">
              <table className="digital-twin-table">
                <thead>
                  <tr>
                    <th>{isDailyMode ? "Date" : "Period"}</th>
                    <th>Date Covered</th>
                    <th>Average Level</th>
                    <th>Highest Level</th>
                    <th>Latest Status</th>
                    <th>Reading Summary</th>
                    <th>Citizen Explanation</th>
                    <th>Last Updated</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.id}>
                      <td>{getRecordLabel(record, period)}</td>
                      <td>{getRecordRange(record, period)}</td>
                      <td>{formatLevel(record.averageLevel)}</td>
                      <td>{formatLevel(record.highestLevel)}</td>
                      <td>
                        <span className={`digital-twin-table-badge ${getStatusTone(
                          record.latestStatus
                        )}`}>
                          {getStatusLabel(record.latestStatus)}
                        </span>
                      </td>
                      <td>{getRecordSummary(record)}</td>
                      <td>{getRecordExplanation(record)}</td>
                      <td>{formatDateTime(record.latestTimestamp)}</td>
                      <td>
                        {isDailyMode && record.id ? (
                          <button
                            type="button"
                            className="digital-twin-row-delete"
                            onClick={() => handleDelete(record)}
                            disabled={deletingId === record.id}
                          >
                            {deletingId === record.id ? "Deleting..." : "Delete"}
                          </button>
                        ) : (
                          <span className="digital-twin-row-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}

