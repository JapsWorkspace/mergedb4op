import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  FaChartColumn,
  FaCircleCheck,
  FaCircleInfo,
  FaClockRotateLeft,
  FaFileCircleCheck,
  FaRankingStar,
  FaShieldHalved,
  FaTriangleExclamation,
  FaWandMagicSparkles,
} from "react-icons/fa6";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Tooltip as ChartTooltip,
  Legend,
} from "chart.js";
import { Bar, Line, Doughnut } from "react-chartjs-2";

import "../css/IncidentAnalytics.css";
import { API_BASE_URL } from "../../config/api";

const BASE_URL = API_BASE_URL;

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  ChartTooltip,
  Legend
);

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatWhole(value) {
  return new Intl.NumberFormat().format(safeNumber(value));
}

function titleCase(value = "") {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasChartValues(chartData) {
  if (!chartData?.datasets?.length) return false;
  return chartData.datasets.some((dataset) =>
    toArray(dataset.data).some((value) => safeNumber(value) > 0)
  );
}

function getSeverityClass(severity) {
  const normalized = String(severity || "").toLowerCase();
  if (normalized === "critical") return "critical";
  if (normalized === "warning") return "warning";
  if (normalized === "notice") return "notice";
  if (normalized === "success") return "success";
  return "info";
}

function formatDateLabel(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "2-digit",
  });
}

function ChartOrEmpty({ chartData, element, message = "No data available yet." }) {
  if (!hasChartValues(chartData)) {
    return (
      <div className="analytics-empty-state">
        <div className="analytics-empty-state-title">No data yet</div>
        <div className="analytics-empty-state-copy">{message}</div>
      </div>
    );
  }

  return element;
}

function KpiCard({ tone, icon, label, value, sub, urgent }) {
  return (
    <div className={`incident-kpi-card ${tone} ${urgent ? "urgent" : ""}`}>
      <div className="incident-kpi-top">
        <span className="incident-kpi-icon">{icon}</span>
        {urgent && <span className="incident-kpi-alert">!</span>}
      </div>
      <div className="incident-kpi-label">{label}</div>
      <div className="incident-kpi-value">{value}</div>
      <div className="incident-kpi-sub">{sub}</div>
    </div>
  );
}

function RankingCard({ title, subtitle, icon, rows, emptyTitle, emptyText }) {
  return (
    <div className="a-card incident-ranking-card">
      <div className="a-card-head">
        <div>
          <div className="a-card-title">
            {icon} {title}
          </div>
          <div className="incident-card-subtitle">{subtitle}</div>
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="incident-ranking-list">
          {rows.slice(0, 3).map((item, index) => (
            <div key={item.key || `${title}-${index}`} className="incident-ranking-row">
              <div className={`incident-rank-badge rank-${index + 1}`}>#{index + 1}</div>

              <div className="incident-ranking-main">
                <div className="incident-ranking-title">{item.title}</div>
                <div className="incident-ranking-meta">{item.meta}</div>
              </div>

              <div className="incident-ranking-value">{item.value}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="analytics-empty-state">
          <div className="analytics-empty-state-title">{emptyTitle}</div>
          <div className="analytics-empty-state-copy">{emptyText}</div>
        </div>
      )}
    </div>
  );
}

export default function IncidentAnalytics() {
  const isMountedRef = useRef(true);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [overview, setOverview] = useState({
    summary: {},
    statusBreakdown: {},
    verificationBreakdown: {},
    topIncidentTypes: [],
    levelBreakdown: [],
    topLocations: [],
    incidentTrend: [],
    urgentIncidents: [],
  });

  const [incidentAi, setIncidentAi] = useState({
    source: "rule_based_fallback",
    aiAvailable: false,
    model: "",
    overallSeverity: "info",
    executiveSummary: "",
    priorityActions: [],
    insights: [],
    fallbackReason: "",
  });

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchIncidentAnalytics = useCallback(async (backgroundRefresh = false) => {
    isMountedRef.current = true;

    if (backgroundRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [overviewRes, aiRes] = await Promise.allSettled([
        axios.get(`${BASE_URL}/api/incident-analytics/overview`, {
          withCredentials: true,
        }),
        axios.get(`${BASE_URL}/api/incident-analytics/ai-insights`, {
          withCredentials: true,
        }),
      ]);

      if (!isMountedRef.current) return;

      if (overviewRes.status === "fulfilled") {
        setOverview(overviewRes.value?.data || {});
      }

      if (aiRes.status === "fulfilled") {
        setIncidentAi(aiRes.value?.data || {});
      }
    } catch (error) {
      console.error("Incident analytics fetch error:", error);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchIncidentAnalytics(false);

    const interval = setInterval(() => {
      fetchIncidentAnalytics(true);
    }, 60000);

    return () => clearInterval(interval);
  }, [fetchIncidentAnalytics]);

  const summary = overview?.summary || {};

  const warningSummary = useMemo(() => {
    const issues = [];

    if (safeNumber(summary.unresolvedIncidents) > 0) {
      issues.push(`${formatWhole(summary.unresolvedIncidents)} unresolved incident`);
    }

    if (safeNumber(summary.verificationPending) > 0) {
      issues.push(`${formatWhole(summary.verificationPending)} pending verification`);
    }

    if (safeNumber(summary.verificationRejected) > 0) {
      issues.push(`${formatWhole(summary.verificationRejected)} rejected evidence`);
    }

    if (safeNumber(summary.averageConfidence) > 0 && safeNumber(summary.averageConfidence) < 60) {
      issues.push(`${formatWhole(summary.averageConfidence)}% average confidence`);
    }

    if (issues.length === 0) {
      return {
        tone: "success",
        title: "Incident monitoring looks stable",
        text: "No urgent unresolved incident or verification bottleneck detected.",
      };
    }

    return {
      tone: safeNumber(summary.unresolvedIncidents) > 0 ? "warning" : "notice",
      title: "Incident monitoring needs follow-up",
      text: issues.join(" • "),
    };
  }, [summary]);

  const commonChartOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        title: { display: false },
        tooltip: {
          backgroundColor: "#052e16",
          titleColor: "#ffffff",
          bodyColor: "#dcfce7",
          padding: 10,
          cornerRadius: 10,
        },
      },
      scales: {
        x: {
          ticks: { color: "#14532d", font: { size: 11, weight: "700" } },
          grid: { color: "rgba(20, 83, 45, 0.08)" },
          border: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: "#14532d",
            font: { size: 11, weight: "700" },
            precision: 0,
            stepSize: 1,
            callback: (value) => {
              return Number.isInteger(value) ? value : "";
            },
          },
          grid: { color: "rgba(20, 83, 45, 0.08)" },
          border: { display: false },
        },
      },
    };
  }, []);

  const statusRows = useMemo(() => {
    const statusBreakdown = overview?.statusBreakdown || {};

    return [
      {
        label: "Reported",
        value: safeNumber(statusBreakdown.reported),
        tone: "warning",
      },
      {
        label: "On Process",
        value: safeNumber(statusBreakdown.onProcess),
        tone: "info",
      },
      {
        label: "Resolved",
        value: safeNumber(statusBreakdown.resolved),
        tone: "success",
      },
    ];
  }, [overview]);

  const maxStatusValue = useMemo(() => {
    return Math.max(...statusRows.map((item) => safeNumber(item.value)), 1);
  }, [statusRows]);

  const statusChart = useMemo(() => {
    return {
      labels: statusRows.map((item) => item.label),
      datasets: [
        {
          label: "Incidents",
          data: statusRows.map((item) => item.value),
          backgroundColor: ["#f59e0b", "#2563eb", "#16a34a"],
          borderRadius: 10,
          borderSkipped: false,
          maxBarThickness: 52,
        },
      ],
    };
  }, [statusRows]);

  const typeRows = useMemo(() => {
    return toArray(overview?.topIncidentTypes)
      .map((item) => ({
        type: item.type || "Unspecified",
        count: safeNumber(item.count),
      }))
      .slice(0, 3);
  }, [overview]);

  const maxTypeValue = useMemo(() => {
    return Math.max(...typeRows.map((item) => item.count), 1);
  }, [typeRows]);

  const typeChart = useMemo(() => {
    return {
      labels: typeRows.map((item) => titleCase(item.type)),
      datasets: [
        {
          label: "Reports",
          data: typeRows.map((item) => item.count),
          backgroundColor: "#16a34a",
          borderRadius: 10,
          borderSkipped: false,
          maxBarThickness: 52,
        },
      ],
    };
  }, [typeRows]);

  const verificationRows = useMemo(() => {
    const breakdown = overview?.verificationBreakdown || {};

    return [
      { label: "Approved", value: safeNumber(breakdown.approved) },
      { label: "Pending", value: safeNumber(breakdown.pending) },
      { label: "Rejected", value: safeNumber(breakdown.rejected) },
      { label: "Unverified", value: safeNumber(breakdown.unverified) },
    ];
  }, [overview]);

  const verificationChart = useMemo(() => {
    return {
      labels: verificationRows.map((item) => item.label),
      datasets: [
        {
          label: "Verification",
          data: verificationRows.map((item) => item.value),
          backgroundColor: ["#16a34a", "#eab308", "#dc2626", "#64748b"],
          borderWidth: 0,
        },
      ],
    };
  }, [verificationRows]);

  const doughnutOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#14532d",
            font: { size: 11, weight: "700" },
            usePointStyle: true,
            boxWidth: 8,
          },
        },
        tooltip: {
          backgroundColor: "#052e16",
          titleColor: "#ffffff",
          bodyColor: "#dcfce7",
          padding: 10,
          cornerRadius: 10,
        },
      },
    };
  }, []);

  const trendRows = useMemo(() => {
    return toArray(overview?.incidentTrend).map((item) => ({
      label: formatDateLabel(item.date || item._id),
      count: safeNumber(item.count),
    }));
  }, [overview]);

  const trendChart = useMemo(() => {
    return {
      labels: trendRows.map((item) => item.label),
      datasets: [
        {
          label: "Incidents",
          data: trendRows.map((item) => item.count),
          borderColor: "#16a34a",
          backgroundColor: "rgba(22, 163, 74, 0.12)",
          pointBackgroundColor: "#16a34a",
          pointRadius: 4,
          tension: 0.35,
        },
      ],
    };
  }, [trendRows]);

  const trendOptions = useMemo(() => {
    return {
      ...commonChartOptions,
      plugins: {
        ...commonChartOptions.plugins,
        legend: {
          display: true,
          labels: {
            color: "#14532d",
            font: { size: 11, weight: "700" },
            usePointStyle: true,
          },
        },
      },
    };
  }, [commonChartOptions]);

  const aiSeverityClass = getSeverityClass(incidentAi.overallSeverity);

  const kpis = [
    {
      tone: "success",
      icon: <FaTriangleExclamation />,
      label: "Total Incidents",
      value: loading ? "—" : formatWhole(summary.totalIncidents),
      sub: "All incident records",
    },
    {
      tone: safeNumber(summary.unresolvedIncidents) > 0 ? "warning" : "success",
      icon: <FaShieldHalved />,
      label: "Unresolved",
      value: loading ? "—" : formatWhole(summary.unresolvedIncidents),
      sub: "Needs monitoring",
      urgent: safeNumber(summary.unresolvedIncidents) > 0,
    },
    {
      tone: "success",
      icon: <FaCircleCheck />,
      label: "Resolved Rate",
      value: loading ? "—" : `${formatWhole(summary.resolvedRate)}%`,
      sub: "Completed reports",
    },
    {
      tone: safeNumber(summary.averageConfidence) >= 60 ? "success" : "warning",
      icon: <FaFileCircleCheck />,
      label: "AI Confidence",
      value: loading ? "—" : `${formatWhole(summary.averageConfidence)}%`,
      sub: "Average verification",
      urgent: safeNumber(summary.averageConfidence) > 0 && safeNumber(summary.averageConfidence) < 60,
    },
  ];

  const compactIncidentCards = [
    {
      label: "Reported",
      value: summary.reportedIncidents,
      sub: "New reports",
      tone: safeNumber(summary.reportedIncidents) > 0 ? "notice" : "success",
      icon: <FaTriangleExclamation />,
    },
    {
      label: "On Process",
      value: summary.onProcessIncidents,
      sub: "Being handled",
      tone: "info",
      icon: <FaShieldHalved />,
    },
    {
      label: "Image Coverage",
      value: `${safeNumber(summary.imageCoverageRate)}%`,
      sub: "Reports with image",
      tone: safeNumber(summary.imageCoverageRate) >= 50 ? "success" : "notice",
      icon: <FaFileCircleCheck />,
    },
    {
      label: "Rejected Evidence",
      value: summary.verificationRejected,
      sub: "Needs review",
      tone: safeNumber(summary.verificationRejected) > 0 ? "warning" : "success",
      icon: <FaCircleInfo />,
    },
  ];

  const recordWindowCards = [
    {
      label: "This Week",
      value: summary.thisWeekIncidents,
      sub: "Incident records created this week",
      tone: "info",
      icon: <FaClockRotateLeft />,
    },
    {
      label: "This Month",
      value: summary.thisMonthIncidents,
      sub: "Incident records created this month",
      tone: "notice",
      icon: <FaChartColumn />,
    },
    {
      label: "This Year",
      value: summary.thisYearIncidents,
      sub: "Incident records created this year",
      tone: "success",
      icon: <FaRankingStar />,
    },
  ];

  const primaryInsights = toArray(incidentAi.insights).slice(0, 4);

  const topTypes = toArray(overview?.topIncidentTypes).slice(0, 3);
  const urgentIncidents = toArray(overview?.urgentIncidents)
    .filter((item) => {
      const verificationStatus = String(item?.verificationStatus || "")
        .toLowerCase()
        .trim();
      const status = String(item?.status || "")
        .toLowerCase()
        .trim();

      return (
        verificationStatus !== "rejected" &&
        verificationStatus !== "pending" &&
        status !== "resolved"
      );
    })
    .slice(0, 3);

  const typeRankingRows = topTypes.map((item) => ({
    key: item.type,
    title: titleCase(item.type || "Unspecified"),
    meta: "Incident type frequency",
    value: `${formatWhole(item.count)} report${safeNumber(item.count) === 1 ? "" : "s"}`,
  }));

  const urgentRankingRows = urgentIncidents.map((item) => ({
    key: item._id || `${item.location}-${item.type}`,
    title: item.location || "Unknown Location",
    meta: `${titleCase(item.type || "Incident")} • ${titleCase(item.status || "reported")}`,
    value: `${formatWhole(item.confidence)}%`,
  }));

  return (
    <div className="incident-analytics incident-analytics-clean">
      <section className={`incident-single-alert ${warningSummary.tone}`}>
        <span className="incident-single-alert-icon">
          {warningSummary.tone === "success" ? <FaCircleCheck /> : <FaTriangleExclamation />}
        </span>

        <div>
          <div className="incident-single-alert-title">{warningSummary.title}</div>
          <div className="incident-single-alert-text">{warningSummary.text}</div>
        </div>

        {refreshing && <span className="incident-refresh-pill">Refreshing</span>}
      </section>

      <section className="incident-kpi-grid-clean">
        {kpis.map((item) => (
          <KpiCard key={item.label} {...item} />
        ))}
      </section>

      <section className="a-card incident-record-window-card">
        <div className="incident-panel-head">
          <div>
            <div className="incident-panel-kicker">
              <FaClockRotateLeft /> Record Counts
            </div>
            <div className="incident-panel-title">Weekly, Monthly, and Yearly Incident Records</div>
          </div>
        </div>

        <div className="incident-record-window-grid">
          {recordWindowCards.map((item) => (
            <div key={item.label} className={`incident-record-window-item ${item.tone}`}>
              <span className="incident-record-window-icon">{item.icon}</span>
              <div className="incident-record-window-copy">
                <div className="incident-record-window-label">{item.label}</div>
                <div className="incident-record-window-value">
                  {loading ? "—" : formatWhole(item.value)}
                </div>
                <div className="incident-record-window-sub">{item.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="incident-main-grid-clean">
        <div className="a-card incident-ai-card incident-clean-card">
          <div className="incident-panel-head">
            <div>
              <div className="incident-panel-kicker">
                <FaWandMagicSparkles /> AI Incident Insights
              </div>
              <div className="incident-panel-title">Monitoring and Verification Summary</div>
            </div>

            <div className="incident-ai-meta">
              <span className={`incident-severity incident-severity--${aiSeverityClass}`}>
                {titleCase(incidentAi.overallSeverity || "info")}
              </span>
              <span className="incident-source-badge">
                {incidentAi.aiAvailable ? "Gemini AI" : "Fallback"}
              </span>
            </div>
          </div>

          <div className="incident-ai-summary">
            {incidentAi.executiveSummary ||
              "AI summary will appear here once incident analytics are available."}
          </div>

          <div className="incident-action-list compact">
            <div className="incident-action-title">Priority Actions</div>

            {toArray(incidentAi.priorityActions).length > 0 ? (
              <ul>
                {toArray(incidentAi.priorityActions)
                  .slice(0, 3)
                  .map((item, index) => (
                    <li key={`priority-${index}`}>{item}</li>
                  ))}
              </ul>
            ) : (
              <div className="incident-inline-empty">No AI priority actions available yet.</div>
            )}
          </div>
        </div>

        <div className="a-card incident-health-card incident-clean-card">
          <div className="incident-panel-head">
            <div>
              <div className="incident-panel-kicker">
                <FaCircleCheck /> Incident Readiness
              </div>
              <div className="incident-panel-title">Operational Snapshot</div>
            </div>

            <span className="incident-health-pill">
              {formatWhole(summary.totalIncidents)} total reports
            </span>
          </div>

          <div className="incident-health-compact-grid">
            {compactIncidentCards.map((item) => (
              <div key={item.label} className={`incident-health-compact-card ${item.tone}`}>
                <span className="incident-health-compact-icon">{item.icon}</span>
                <div>
                  <div className="incident-health-compact-label">{item.label}</div>
                  <div className="incident-health-compact-value">
                    {typeof item.value === "string" ? item.value : formatWhole(item.value)}
                  </div>
                  <div className="incident-health-compact-sub">{item.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="incident-ranking-grid">
        <RankingCard
          title="Top Incident Types"
          subtitle="Top 3 recurring incident categories."
          icon={<FaRankingStar />}
          rows={typeRankingRows}
          emptyTitle="No incident type ranking yet"
          emptyText="Incident type ranking will appear once reports are available."
        />

        <RankingCard
          title="Urgent Incident Queue"
          subtitle="Top 3 reports by active status and verification risk."
          icon={<FaTriangleExclamation />}
          rows={urgentRankingRows}
          emptyTitle="No urgent reports yet"
          emptyText="Urgent incident ranking will appear once active reports exist."
        />
      </section>

      <section className="incident-graph-grid-clean">
        <div className="a-card a-chart-card incident-chart-card">
          <div className="a-card-head">
            <div>
              <div className="a-card-title">
                <FaChartColumn /> Incident Status Distribution
              </div>
              <div className="incident-card-subtitle">
                One view of reported, on process, and resolved incident records.
              </div>
            </div>
          </div>

          <div className="a-chart-body">
            <ChartOrEmpty
              chartData={statusChart}
              message="Incident status data will appear once reports are available."
              element={<Bar data={statusChart} options={commonChartOptions} />}
            />
          </div>

          <div className="incident-health-value-list">
            {statusRows.map((item) => (
              <div key={item.label} className={`incident-health-row ${item.tone}`}>
                <span>{item.label}</span>
                <div className="incident-health-row-track">
                  <span
                    style={{
                      width: `${Math.max(6, (safeNumber(item.value) / maxStatusValue) * 100)}%`,
                    }}
                  />
                </div>
                <strong>{formatWhole(item.value)}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="a-card a-chart-card incident-chart-card">
          <div className="a-card-head">
            <div>
              <div className="a-card-title">
                <FaTriangleExclamation /> Incident Type Frequency
              </div>
              <div className="incident-card-subtitle">
                Top 3 recurring incident categories.
              </div>
            </div>
          </div>

          <div className="a-chart-body">
            <ChartOrEmpty
              chartData={typeChart}
              message="Incident type frequency will appear once reports are available."
              element={<Bar data={typeChart} options={commonChartOptions} />}
            />
          </div>

          <div className="incident-chart-value-list">
            {typeRows.map((item, index) => (
              <div key={item.type} className="incident-chart-value-row incident-ranked-chart-row">
                <span>
                  <b>#{index + 1}</b> {titleCase(item.type)}
                </span>
                <div className="incident-chart-value-track">
                  <span
                    className="incident-chart-value-fill"
                    style={{
                      width: `${Math.max(8, (item.count / maxTypeValue) * 100)}%`,
                    }}
                  />
                </div>
                <strong>{formatWhole(item.count)}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="incident-graph-grid-clean incident-trend-ai-grid">
        <div className="a-card a-chart-card incident-chart-card incident-chart-card-wide">
          <div className="a-card-head">
            <div>
              <div className="a-card-title">
                <FaClockRotateLeft /> Incident Trend
              </div>
              <div className="incident-card-subtitle">
                Recent incident report activity.
              </div>
            </div>
          </div>

          <div className="a-chart-body">
            <ChartOrEmpty
              chartData={trendChart}
              message="Recent trend will appear once incident reports are recorded."
              element={<Line data={trendChart} options={trendOptions} />}
            />
          </div>
        </div>

        <div className="a-card a-chart-card incident-chart-card incident-verification-card">
          <div className="a-card-head">
            <div>
              <div className="a-card-title">
                <FaFileCircleCheck /> Verification Breakdown
              </div>
              <div className="incident-card-subtitle">
                AI/manual verification status of incident evidence.
              </div>
            </div>
          </div>

          <div className="a-chart-body incident-doughnut-body">
            <ChartOrEmpty
              chartData={verificationChart}
              message="Verification breakdown will appear once evidence is available."
              element={<Doughnut data={verificationChart} options={doughnutOptions} />}
            />
          </div>
        </div>
      </section>

      <section className="a-card incident-signals-clean incident-ai-signals-card">
        <div className="a-card-head">
          <div>
            <div className="a-card-title">
              <FaWandMagicSparkles /> AI Incident Signals
            </div>
            <div className="incident-card-subtitle">
              AI analysis from incident status, evidence quality, and verification records.
            </div>
          </div>
        </div>

        {primaryInsights.length > 0 ? (
          <div className="incident-signal-grid-clean">
            {primaryInsights.map((item, index) => (
              <div
                key={`detail-insight-${index}`}
                className={`incident-insight-item incident-insight-item--${getSeverityClass(
                  item?.severity
                )}`}
              >
                <div className="incident-insight-top">
                  <span className="incident-insight-title">{item?.title || "Insight"}</span>
                  <span
                    className={`incident-insight-badge incident-insight-badge--${getSeverityClass(
                      item?.severity
                    )}`}
                  >
                    {titleCase(item?.severity || "info")}
                  </span>
                </div>

                <div className="incident-insight-message">
                  {item?.message || "No insight message available."}
                </div>

                <div className="incident-insight-action">
                  <strong>Action:</strong> {item?.action || "Review this area."}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="analytics-empty-state">
            <div className="analytics-empty-state-title">No AI insights yet</div>
            <div className="analytics-empty-state-copy">
              Incident intelligence will appear here once data is available.
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
