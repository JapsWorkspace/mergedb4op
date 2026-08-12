import { useCallback, useEffect, useState } from "react";
import StatusBadge from "./StatusBadge";

const API_URL = "http://localhost:5000";
const CAMERA_ID = "cam_1";

const PERIODS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

function WaterLevelDailyHistory() {
  
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [period, setPeriod] = useState("daily");

  const [records, setRecords] = useState([]);
  const [latest, setLatest] = useState({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const isDailyMode = period === "daily";

  const fetchWaterLevelData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const query = new URLSearchParams({
  camera_id: CAMERA_ID,
});

      if (startDate) query.append("start_date", startDate);
      if (endDate) query.append("end_date", endDate);

      let mainUrl = "";

      if (period === "daily") {
        query.append("page", "1");
        query.append("limit", "100");

        mainUrl = `${API_URL}/api/water-levels/history/daily?${query.toString()}`;
      } else {
        query.append("period", period);

        mainUrl = `${API_URL}/api/water-levels/analytics?${query.toString()}`;
      }

      const mainResponse = await fetch(mainUrl);
      const mainResult = await mainResponse.json();

      if (!mainResponse.ok) {
        throw new Error(
          mainResult.message ||
            "Unable to retrieve water-level records."
        );
      }

      const latestResponse = await fetch(
  `${API_URL}/api/water-levels/latest/${CAMERA_ID}`
);

      const latestResult = await latestResponse.json();

      setRecords(mainResult.data || []);
      setLatest(latestResult || {});
    } catch (requestError) {
      console.error(requestError);

      setError(
        requestError.message ||
          "An error occurred while retrieving water-level information."
      );
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, period]);

  useEffect(() => {
    fetchWaterLevelData();
  }, [fetchWaterLevelData]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchWaterLevelData();
    }, 15000);

    return () => clearInterval(interval);
  }, [fetchWaterLevelData]);

  const handleSubmit = (event) => {
    event.preventDefault();

    if (startDate && endDate && startDate > endDate) {
      setError("Start date cannot be later than end date.");
      return;
    }

    fetchWaterLevelData();
  };

  const handleReset = () => {
  setStartDate("");
  setEndDate("");
  setPeriod("daily");
  setError("");
};

  const handleDelete = async (record) => {
    if (!record._id) {
      setError("Only daily records can be deleted.");
      return;
    }

    const confirmed = window.confirm(
      `Delete the daily history record for ${record.date}?`
    );

    if (!confirmed) return;

    try {
      setDeletingId(record._id);
      setError("");

      const response = await fetch(
        `${API_URL}/api/water-levels/history/daily/${record._id}`,
        {
          method: "DELETE",
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || "Unable to delete the record."
        );
      }

      setRecords((currentRecords) =>
        currentRecords.filter((item) => item._id !== record._id)
      );

      await fetchWaterLevelData();
    } catch (deleteError) {
      console.error(deleteError);

      setError(
        deleteError.message ||
          "An error occurred while deleting the record."
      );
    } finally {
      setDeletingId(null);
    }
  };

  const formatLevel = (value) => {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "—";
    }

    return `${number.toFixed(2)} m`;
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "—";

    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const getStatusInformation = (status) => {
    const normalizedStatus = String(status || "NO DATA").toUpperCase();

    if (normalizedStatus === "DANGER") {
      return {
        title: "Danger water level detected",
        meaning:
          "The water level has reached or exceeded the danger threshold. Flooding may already be occurring or may occur soon in low-lying areas.",
        action:
          "Avoid flooded roads, prepare for possible evacuation, secure important documents, and follow official MDRRMO announcements.",
      };
    }

    if (normalizedStatus === "WARNING") {
      return {
        title: "Water level is rising",
        meaning:
          "The water level has reached the warning threshold. Conditions may worsen if rain continues or upstream water increases.",
        action:
          "Stay alert, monitor updates, charge phones, prepare emergency supplies, and avoid unnecessary travel near waterways.",
      };
    }

    if (normalizedStatus === "SAFE") {
      return {
        title: "Water level is currently safe",
        meaning:
          "The latest water-level reading is below the warning threshold.",
        action:
          "Continue monitoring updates, especially during heavy rain or typhoon conditions.",
      };
    }

    return {
      title: "No current water-level data",
      meaning:
        "The system has not received a recent water-level reading from this camera.",
      action:
        "Wait for the monitoring system to update or check the camera connection.",
    };
  };

  const getRecordLabel = (record) => {
    if (period === "daily") return record.date;

    return record.label || "—";
  };

  const getDateRange = (record) => {
    if (period === "daily") return record.date || "—";

    if (record.start_date && record.end_date) {
      return `${record.start_date} to ${record.end_date}`;
    }

    return "—";
  };

  const getRecordExplanation = (record) => {
    const dangerCount = Number(record.danger_count || 0);
    const warningCount = Number(record.warning_count || 0);
    const safeCount = Number(record.safe_count || 0);
    const total = dangerCount + warningCount + safeCount;

    if (total === 0) {
      return "No classification data available.";
    }

    if (dangerCount > 0) {
      return `${dangerCount} out of ${total} readings reached danger level. Citizens should review this period carefully.`;
    }

    if (warningCount > 0) {
      return `${warningCount} out of ${total} readings reached warning level. Water rise was observed during this period.`;
    }

    return `All ${total} readings were within safe level during this period.`;
  };

  const totalReadings = records.reduce(
    (total, record) => total + Number(record.reading_count || 0),
    0
  );

  const totalDangerReadings = records.reduce(
    (total, record) => total + Number(record.danger_count || 0),
    0
  );

  const highestLevel =
    records.length > 0
      ? Math.max(
          ...records.map((record) =>
            Number(record.maximum_level || 0)
          )
        )
      : null;

  const weightedTotal = records.reduce(
    (total, record) =>
      total +
      Number(record.average_level || 0) *
        Number(record.reading_count || 0),
    0
  );

  const overallAverage =
    totalReadings > 0 ? weightedTotal / totalReadings : null;

  const latestInfo = getStatusInformation(latest.status);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <p style={styles.headerLabel}>
            SagipBayan Information Management
          </p>

          <h1 style={styles.headerTitle}>
            Public Water-Level Information
          </h1>

          <p style={styles.headerSubtitle}>
            Citizen-readable monitoring data for awareness,
            preparedness, and safety guidance.
          </p>
        </div>

        <div style={styles.headerStatus}>
          <span style={styles.statusLabel}>
            Current status
          </span>

          <StatusBadge status={latest.status} />
        </div>
      </header>

      <main style={styles.content}>
        <section style={styles.noticePanel}>
          <div>
            <p style={styles.noticeLabel}>
              Latest Public Advisory
            </p>

            <h2 style={styles.noticeTitle}>
              {latestInfo.title}
            </h2>

            <p style={styles.noticeText}>
              {latestInfo.meaning}
            </p>

            <p style={styles.noticeAction}>
              <strong>Recommended action:</strong>{" "}
              {latestInfo.action}
            </p>
          </div>

          <div style={styles.noticeReading}>
            <span style={styles.readingLabel}>
              Latest reading
            </span>

            <strong>{formatLevel(latest.water_level)}</strong>

            <small>
              Updated: {formatTimestamp(latest.timestamp)}
            </small>
          </div>
        </section>

       <section style={styles.infoGrid}>
  <article style={styles.infoCard}>
    <h3 style={styles.infoTitle}>SAFE</h3>
    <p style={styles.infoText}>
      The water level is currently below the warning threshold.
      Citizens should stay informed, especially during heavy rain
      or typhoon conditions.
    </p>
  </article>

  <article style={styles.infoCard}>
    <h3 style={styles.infoTitle}>WARNING</h3>
    <p style={styles.infoText}>
      The water level is rising. Prepare emergency supplies,
      monitor official advisories, and avoid rivers, bridges,
      and flood-prone roads.
    </p>
  </article>

  <article style={styles.infoCard}>
    <h3 style={styles.infoTitle}>DANGER</h3>
    <p style={styles.infoText}>
      The water level has reached a dangerous level. Follow
      MDRRMO instructions, avoid flooded areas, and prepare for
      possible evacuation when advised.
    </p>
  </article>
</section>

        <form style={styles.filters} onSubmit={handleSubmit}>
          

          <div style={styles.field}>
            <label style={styles.label} htmlFor="period">
              Information View
            </label>

            <select
              id="period"
              style={styles.input}
              value={period}
              onChange={(event) =>
                setPeriod(event.target.value)
              }
            >
              {PERIODS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label} htmlFor="startDate">
              Start Date
            </label>

            <input
              id="startDate"
              type="date"
              style={styles.input}
              value={startDate}
              onChange={(event) =>
                setStartDate(event.target.value)
              }
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label} htmlFor="endDate">
              End Date
            </label>

            <input
              id="endDate"
              type="date"
              style={styles.input}
              value={endDate}
              onChange={(event) =>
                setEndDate(event.target.value)
              }
            />
          </div>

          <div style={styles.buttons}>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={handleReset}
            >
              Reset
            </button>

            <button
              type="submit"
              style={styles.primaryButton}
            >
              Apply
            </button>
          </div>
        </form>

        {error && <div style={styles.error}>{error}</div>}

        <section style={styles.cardGrid}>
          <article style={styles.card}>
            <p style={styles.cardLabel}>Current Level</p>

            <h2 style={styles.cardValue}>
              {formatLevel(latest.water_level)}
            </h2>

            <p style={styles.cardDescription}>
              Latest received reading from the monitoring station
            </p>
          </article>

          <article style={styles.card}>
            <p style={styles.cardLabel}>Average Level</p>

            <h2 style={styles.cardValue}>
              {formatLevel(overallAverage)}
            </h2>

            <p style={styles.cardDescription}>
              Average from selected {period} records
            </p>
          </article>

          <article style={styles.card}>
            <p style={styles.cardLabel}>Highest Level</p>

            <h2 style={styles.cardValue}>
              {formatLevel(highestLevel)}
            </h2>

            <p style={styles.cardDescription}>
              Highest recorded level in selected period
            </p>
          </article>

          <article style={styles.card}>
            <p style={styles.cardLabel}>Danger Readings</p>

            <h2 style={styles.cardValue}>
              {totalDangerReadings}
            </h2>

            <p style={styles.cardDescription}>
              Out of {totalReadings} total readings
            </p>
          </article>
        </section>

        <section style={styles.tablePanel}>
          <div style={styles.tableHeader}>
            <div>
              <h2 style={styles.tableTitle}>
                {isDailyMode
                  ? "Daily Water-Level Information"
                  : `${period.charAt(0).toUpperCase()}${period.slice(
                      1
                    )} Water-Level Summary`}
              </h2>

              <p style={styles.tableDescription}>
                This section converts sensor readings into
                citizen-friendly information for awareness and
                preparedness.
              </p>
            </div>

            <button
              type="button"
              style={styles.refreshButton}
              onClick={fetchWaterLevelData}
              disabled={loading}
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>

          {loading ? (
            <div style={styles.message}>
              Loading water-level information...
            </div>
          ) : records.length === 0 ? (
            <div style={styles.message}>
              No water-level information found.
            </div>
          ) : (
            <div style={styles.tableContainer}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>
                      {isDailyMode ? "Date" : "Period"}
                    </th>
                    <th style={styles.th}>Date Covered</th>
                    <th style={styles.th}>Average Level</th>
                    <th style={styles.th}>Highest Level</th>
                    <th style={styles.th}>Latest Status</th>
                    <th style={styles.th}>Reading Summary</th>
                    <th style={styles.th}>Citizen Explanation</th>
                    <th style={styles.th}>Last Updated</th>
                    <th style={styles.th}>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {records.map((record) => (
                    <tr
                      key={
                        record._id ||
                        `${record.label}-${record.start_date}`
                      }
                    >
                      <td style={styles.td}>
                        <strong>{getRecordLabel(record)}</strong>
                      </td>

                      <td style={styles.td}>
                        {getDateRange(record)}
                      </td>

                      <td style={styles.td}>
                        <strong>
                          {formatLevel(record.average_level)}
                        </strong>
                      </td>

                      <td style={styles.td}>
                        {formatLevel(record.maximum_level)}
                      </td>

                      <td style={styles.td}>
                        <StatusBadge status={record.latest_status} />
                      </td>

                      <td style={styles.td}>
                        <div style={styles.readingSummary}>
                          <span>
                            Total:{" "}
                            <strong>
                              {Number(
                                record.reading_count || 0
                              ).toLocaleString()}
                            </strong>
                          </span>

                          <span>
                            Safe: {record.safe_count || 0}
                          </span>

                          <span>
                            Warning: {record.warning_count || 0}
                          </span>

                          <span>
                            Danger: {record.danger_count || 0}
                          </span>
                        </div>
                      </td>

                      <td style={styles.explanationCell}>
                        {getRecordExplanation(record)}
                      </td>

                      <td style={styles.td}>
                        {formatTimestamp(record.latest_timestamp)}
                      </td>

                      <td style={styles.td}>
                        {isDailyMode ? (
                          <button
                            type="button"
                            style={{
                              ...styles.deleteButton,
                              opacity:
                                deletingId === record._id
                                  ? 0.6
                                  : 1,
                              cursor:
                                deletingId === record._id
                                  ? "not-allowed"
                                  : "pointer",
                            }}
                            onClick={() => handleDelete(record)}
                            disabled={deletingId === record._id}
                          >
                            {deletingId === record._id
                              ? "Deleting..."
                              : "Delete"}
                          </button>
                        ) : (
                          <span style={styles.calculatedBadge}>
                            Calculated
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#eef4f8",
    fontFamily: '"Poppins", "Segoe UI", Arial, Helvetica, sans-serif',
    color: "#172033",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "24px",
    padding: "34px 48px",
    backgroundColor: "#082f49",
    color: "#ffffff",
  },

  headerLabel: {
    margin: "0 0 8px",
    fontSize: "15px",
    fontWeight: "800",
    letterSpacing: "1.4px",
    textTransform: "uppercase",
    color: "#bae6fd",
  },

  headerTitle: {
    margin: 0,
    fontSize: "42px",
    fontWeight: "900",
    lineHeight: "1.1",
  },

  headerSubtitle: {
    margin: "12px 0 0",
    maxWidth: "760px",
    color: "#dbeafe",
    fontSize: "18px",
    lineHeight: "1.6",
  },

  headerStatus: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: "8px",
  },

  statusLabel: {
    fontSize: "15px",
    fontWeight: "700",
    color: "#bae6fd",
  },

  content: {
    maxWidth: "1500px",
    margin: "0 auto",
    padding: "34px 28px 55px",
  },

  noticePanel: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "stretch",
    gap: "28px",
    padding: "32px",
    marginBottom: "26px",
    backgroundColor: "#ffffff",
    borderLeft: "8px solid #0369a1",
    borderRadius: "18px",
    boxShadow: "0 10px 30px rgba(8, 47, 73, 0.1)",
  },

  noticeLabel: {
    margin: "0 0 10px",
    fontSize: "15px",
    fontWeight: "900",
    color: "#0369a1",
    textTransform: "uppercase",
    letterSpacing: "1.2px",
  },

  noticeTitle: {
    margin: "0 0 14px",
    color: "#082f49",
    fontSize: "32px",
    fontWeight: "900",
    lineHeight: "1.2",
  },

  noticeText: {
    margin: "0 0 14px",
    color: "#334155",
    fontSize: "18px",
    lineHeight: "1.7",
  },

  noticeAction: {
    margin: 0,
    color: "#172033",
    fontSize: "18px",
    lineHeight: "1.7",
  },

  noticeReading: {
    minWidth: "270px",
    padding: "24px",
    backgroundColor: "#e0f2fe",
    borderRadius: "16px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: "8px",
  },

  readingLabel: {
    display: "block",
    marginBottom: "6px",
    fontSize: "14px",
    fontWeight: "900",
    color: "#0369a1",
    textTransform: "uppercase",
    letterSpacing: "0.8px",
  },

  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "18px",
    marginBottom: "26px",
  },

  infoCard: {
    padding: "26px",
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    boxShadow: "0 8px 25px rgba(8, 47, 73, 0.08)",
  },

  infoTitle: {
    margin: "0 0 12px",
    color: "#082f49",
    fontSize: "26px",
    fontWeight: "900",
    letterSpacing: "0.8px",
  },

  infoText: {
    margin: 0,
    color: "#334155",
    fontSize: "17px",
    lineHeight: "1.7",
  },

  filters: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: "16px",
    padding: "22px",
    marginBottom: "26px",
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    boxShadow: "0 8px 25px rgba(8, 47, 73, 0.08)",
  },

  field: {
    display: "flex",
    flexDirection: "column",
    flex: "1 1 180px",
    gap: "8px",
  },

  label: {
    fontSize: "15px",
    fontWeight: "800",
    color: "#334155",
  },

  input: {
    height: "46px",
    padding: "0 14px",
    border: "1px solid #cbd5e1",
    borderRadius: "10px",
    outline: "none",
    backgroundColor: "#ffffff",
    fontSize: "16px",
    fontFamily: '"Poppins", "Segoe UI", Arial, Helvetica, sans-serif',
  },

  buttons: {
    display: "flex",
    gap: "10px",
  },

  primaryButton: {
    height: "46px",
    padding: "0 22px",
    border: "none",
    borderRadius: "10px",
    backgroundColor: "#0369a1",
    color: "#ffffff",
    fontSize: "15px",
    fontWeight: "800",
    cursor: "pointer",
    fontFamily: '"Poppins", "Segoe UI", Arial, Helvetica, sans-serif',
  },

  secondaryButton: {
    height: "46px",
    padding: "0 22px",
    border: "1px solid #cbd5e1",
    borderRadius: "10px",
    backgroundColor: "#f1f5f9",
    color: "#334155",
    fontSize: "15px",
    fontWeight: "800",
    cursor: "pointer",
    fontFamily: '"Poppins", "Segoe UI", Arial, Helvetica, sans-serif',
  },

  error: {
    padding: "16px 18px",
    marginBottom: "22px",
    border: "1px solid #fecaca",
    borderRadius: "12px",
    backgroundColor: "#fef2f2",
    color: "#991b1b",
    fontSize: "16px",
    fontWeight: "700",
  },

  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "20px",
    marginBottom: "26px",
  },

  card: {
    minHeight: "155px",
    padding: "24px",
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    boxShadow: "0 8px 25px rgba(8, 47, 73, 0.08)",
  },

  cardLabel: {
    margin: "0 0 14px",
    color: "#64748b",
    fontSize: "15px",
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: "0.8px",
  },

  cardValue: {
    margin: "0 0 14px",
    color: "#082f49",
    fontSize: "40px",
    fontWeight: "900",
    lineHeight: "1.1",
  },

  cardDescription: {
    margin: 0,
    color: "#475569",
    fontSize: "16px",
    lineHeight: "1.5",
  },

  tablePanel: {
    padding: "26px",
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    boxShadow: "0 8px 25px rgba(8, 47, 73, 0.08)",
  },

  tableHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "22px",
    marginBottom: "22px",
  },

  tableTitle: {
    margin: "0 0 7px",
    color: "#082f49",
    fontSize: "28px",
    fontWeight: "900",
  },

  tableDescription: {
    margin: 0,
    color: "#475569",
    fontSize: "17px",
    lineHeight: "1.5",
  },

  refreshButton: {
    minHeight: "44px",
    padding: "0 18px",
    border: "none",
    borderRadius: "10px",
    backgroundColor: "#0369a1",
    color: "#ffffff",
    fontSize: "15px",
    fontWeight: "800",
    cursor: "pointer",
    fontFamily: '"Poppins", "Segoe UI", Arial, Helvetica, sans-serif',
  },

  tableContainer: {
    overflowX: "auto",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
  },

  table: {
    width: "100%",
    minWidth: "1450px",
    borderCollapse: "collapse",
  },

  th: {
    padding: "16px",
    textAlign: "left",
    backgroundColor: "#f1f5f9",
    color: "#334155",
    borderBottom: "1px solid #e2e8f0",
    fontSize: "14px",
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },

  td: {
    padding: "16px",
    borderBottom: "1px solid #e2e8f0",
    fontSize: "15px",
    whiteSpace: "nowrap",
    color: "#334155",
  },

  explanationCell: {
    padding: "16px",
    borderBottom: "1px solid #e2e8f0",
    fontSize: "16px",
    minWidth: "340px",
    maxWidth: "460px",
    lineHeight: "1.6",
    whiteSpace: "normal",
    color: "#334155",
  },

  readingSummary: {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    fontSize: "15px",
    lineHeight: "1.4",
  },

  message: {
    padding: "55px",
    textAlign: "center",
    color: "#64748b",
    fontSize: "18px",
    fontWeight: "700",
  },

  deleteButton: {
    minHeight: "36px",
    padding: "0 15px",
    border: "1px solid #ef4444",
    borderRadius: "8px",
    backgroundColor: "#fef2f2",
    color: "#b91c1c",
    fontSize: "13px",
    fontWeight: "800",
    fontFamily: '"Poppins", "Segoe UI", Arial, Helvetica, sans-serif',
  },

  calculatedBadge: {
    display: "inline-block",
    padding: "7px 12px",
    borderRadius: "999px",
    backgroundColor: "#e0f2fe",
    color: "#0369a1",
    fontSize: "13px",
    fontWeight: "800",
  },
};

export default WaterLevelDailyHistory;
