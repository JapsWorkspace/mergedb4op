import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  FaChartColumn,
  FaCircleCheck,
  FaCircleInfo,
  FaClipboardList,
  FaClockRotateLeft,
  FaHandHoldingHeart,
  FaPeopleRoof,
  FaRankingStar,
  FaTriangleExclamation,
  FaTruckFast,
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
  Title,
  Tooltip as ChartTooltip,
  Legend,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";

import "../css/ReliefAnalytics.css";
import { API_BASE_URL } from "../../config/api";

const BASE_URL = API_BASE_URL;

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
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
    <div className={`relief-kpi-card ${tone} ${urgent ? "urgent" : ""}`}>
      <div className="relief-kpi-top">
        <span className="relief-kpi-icon">{icon}</span>
        {urgent && <span className="relief-kpi-alert">!</span>}
      </div>
      <div className="relief-kpi-label">{label}</div>
      <div className="relief-kpi-value">{value}</div>
      <div className="relief-kpi-sub">{sub}</div>
    </div>
  );
}

function RankingCard({ title, subtitle, icon, rows, emptyTitle, emptyText }) {
  return (
    <div className="a-card relief-ranking-card">
      <div className="a-card-head">
        <div>
          <div className="a-card-title">
            {icon} {title}
          </div>
          <div className="relief-card-subtitle">{subtitle}</div>
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="relief-ranking-list">
          {rows.slice(0, 3).map((item, index) => (
            <div key={item.key || `${title}-${index}`} className="relief-ranking-row">
              <div className={`relief-rank-badge rank-${index + 1}`}>#{index + 1}</div>

              <div className="relief-ranking-main">
                <div className="relief-ranking-title">{item.title}</div>
                <div className="relief-ranking-meta">{item.meta}</div>
              </div>

              <div className="relief-ranking-value">{item.value}</div>
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

export default function ReliefAnalytics() {
  const isMountedRef = useRef(true);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [overview, setOverview] = useState({
    summary: {},
    releaseSummary: {},
    statusBreakdown: {},
    releaseStatusBreakdown: {},
    releaseModeBreakdown: {},
    requestTrend: [],
    releaseTrend: [],
    topBarangaysByAffected: [],
    topBarangaysByFoodPacks: [],
    topDisasters: [],
    topTemplatesByUsage: [],
    topReleasedCategories: [],
    topReleasedItems: [],
    topReleaseBarangays: [],
    pendingApprovedRequests: [],
    highDemandRequests: [],
  });

  const [reliefAi, setReliefAi] = useState({
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

  const fetchReliefAnalytics = useCallback(async (backgroundRefresh = false) => {
    isMountedRef.current = true;

    if (backgroundRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [overviewRes, aiRes] = await Promise.allSettled([
        axios.get(`${BASE_URL}/api/relief-analytics/overview`, {
          withCredentials: true,
        }),
        axios.get(`${BASE_URL}/api/relief-analytics/ai-insights`, {
          withCredentials: true,
        }),
      ]);

      if (!isMountedRef.current) return;

      if (overviewRes.status === "fulfilled") {
        setOverview(overviewRes.value?.data || {});
      }

      if (aiRes.status === "fulfilled") {
        setReliefAi(aiRes.value?.data || {});
      }
    } catch (error) {
      console.error("Relief analytics fetch error:", error);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchReliefAnalytics(false);

    const interval = setInterval(() => {
      fetchReliefAnalytics(true);
    }, 60000);

    return () => clearInterval(interval);
  }, [fetchReliefAnalytics]);

  const summary = overview?.summary || {};
  const releaseSummary = overview?.releaseSummary || {};

  const warningSummary = useMemo(() => {
    const issues = [];

    if (safeNumber(summary.approvedRequests) > 0) {
      issues.push(`${formatWhole(summary.approvedRequests)} approved waiting release`);
    }

    if (safeNumber(releaseSummary.pendingReceipt) > 0) {
      issues.push(`${formatWhole(releaseSummary.pendingReceipt)} awaiting receipt`);
    }

    if (safeNumber(summary.legacyPartialRequests) > 0) {
      issues.push(`${formatWhole(summary.legacyPartialRequests)} legacy partial record`);
    }

    const requested = safeNumber(summary.totalRequestedFoodPacks);
    const released = safeNumber(releaseSummary.totalFoodPacksReleased);

    if (requested > released) {
      issues.push(`${formatWhole(requested - released)} food pack gap`);
    }

    if (issues.length === 0) {
      return {
        tone: "success",
        title: "Relief operations look stable",
        text: "No urgent release bottleneck or pending receipt warning detected.",
      };
    }

    return {
      tone: safeNumber(summary.approvedRequests) > 0 ? "warning" : "notice",
      title: "Relief operations need follow-up",
      text: issues.join(" • "),
    };
  }, [summary, releaseSummary]);

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
      { label: "Pending", value: safeNumber(statusBreakdown.pending), tone: "warning" },
      { label: "Approved", value: safeNumber(statusBreakdown.approved), tone: "notice" },
      { label: "Released", value: safeNumber(statusBreakdown.released), tone: "info" },
      { label: "Received", value: safeNumber(statusBreakdown.received), tone: "success" },
      { label: "Rejected", value: safeNumber(statusBreakdown.rejected), tone: "danger" },
      {
        label: "Legacy Partial",
        value: safeNumber(statusBreakdown.partially_released),
        tone: "warning",
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
          label: "Requests",
          data: statusRows.map((item) => item.value),
          backgroundColor: ["#f59e0b", "#eab308", "#2563eb", "#16a34a", "#dc2626", "#b45309"],
          borderRadius: 10,
          borderSkipped: false,
          maxBarThickness: 46,
        },
      ],
    };
  }, [statusRows]);

  const barangayRows = useMemo(() => {
    return toArray(overview?.topBarangaysByFoodPacks)
      .map((item) => ({
        barangayName: item.barangayName || "Unspecified",
        requestedFoodPacks: safeNumber(item.requestedFoodPacks),
      }))
      .slice(0, 3);
  }, [overview]);

  const maxBarangayValue = useMemo(() => {
    return Math.max(...barangayRows.map((item) => item.requestedFoodPacks), 1);
  }, [barangayRows]);

  const barangayChart = useMemo(() => {
    return {
      labels: barangayRows.map((item) => item.barangayName),
      datasets: [
        {
          label: "Requested Food Packs",
          data: barangayRows.map((item) => item.requestedFoodPacks),
          backgroundColor: "#16a34a",
          borderRadius: 10,
          borderSkipped: false,
          maxBarThickness: 52,
        },
      ],
    };
  }, [barangayRows]);

  const requestTrendRows = useMemo(() => {
    return toArray(overview?.requestTrend).map((item) => ({
      label: formatDateLabel(item.date || item._id),
      count: safeNumber(item.count),
    }));
  }, [overview]);

  const releaseTrendRows = useMemo(() => {
    return toArray(overview?.releaseTrend).map((item) => ({
      label: formatDateLabel(item.date || item._id),
      count: safeNumber(item.count),
    }));
  }, [overview]);

  const trendChart = useMemo(() => {
    const labels = requestTrendRows.map((item) => item.label);

    return {
      labels,
      datasets: [
        {
          label: "Requests",
          data: requestTrendRows.map((item) => item.count),
          borderColor: "#16a34a",
          backgroundColor: "rgba(22, 163, 74, 0.12)",
          pointBackgroundColor: "#16a34a",
          pointRadius: 4,
          tension: 0.35,
        },
        {
          label: "Releases",
          data: releaseTrendRows.map((item) => item.count),
          borderColor: "#ca8a04",
          backgroundColor: "rgba(202, 138, 4, 0.12)",
          pointBackgroundColor: "#ca8a04",
          pointRadius: 4,
          tension: 0.35,
        },
      ],
    };
  }, [requestTrendRows, releaseTrendRows]);

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
      scales: {
        ...commonChartOptions.scales,
        y: {
          ...commonChartOptions.scales.y,
          ticks: {
            ...commonChartOptions.scales.y.ticks,
            stepSize: 1,
            precision: 0,
            callback: (value) => {
              return Number.isInteger(value) ? value : "";
            },
          },
        },
      },
    };
  }, [commonChartOptions]);

  const aiSeverityClass = getSeverityClass(reliefAi.overallSeverity);

  const kpis = [
    {
      tone: "success",
      icon: <FaClipboardList />,
      label: "Total Requests",
      value: loading ? "—" : formatWhole(summary.totalRequests),
      sub: "Active relief records",
    },
    {
      tone: "success",
      icon: <FaPeopleRoof />,
      label: "Affected People",
      value: loading ? "—" : formatWhole(summary.totalAffected),
      sub: "Total reported affected",
    },
    {
      tone: safeNumber(summary.approvedRequests) > 0 ? "warning" : "success",
      icon: <FaTruckFast />,
      label: "Waiting Release",
      value: loading ? "—" : formatWhole(summary.approvedRequests),
      sub: "Approved but unreleased",
      urgent: safeNumber(summary.approvedRequests) > 0,
    },
    {
      tone: safeNumber(releaseSummary.pendingReceipt) > 0 ? "warning" : "neutral",
      icon: <FaHandHoldingHeart />,
      label: "Pending Receipt",
      value: loading ? "—" : formatWhole(releaseSummary.pendingReceipt),
      sub: "Released, not yet confirmed",
      urgent: safeNumber(releaseSummary.pendingReceipt) > 0,
    },
  ];

  const compactReliefCards = [
    {
      label: "Requested Packs",
      value: summary.totalRequestedFoodPacks,
      sub: "Demand from requests",
      tone: "success",
      icon: <FaClipboardList />,
    },
    {
      label: "Released Packs",
      value: releaseSummary.totalFoodPacksReleased,
      sub: "Recorded releases",
      tone: "success",
      icon: <FaTruckFast />,
    },
    {
      label: "Completion Rate",
      value: `${safeNumber(summary.completionRate)}%`,
      sub: "Received requests",
      tone: safeNumber(summary.completionRate) >= 70 ? "success" : "notice",
      icon: <FaCircleCheck />,
    },
    {
      label: "Template Usage",
      value: `${safeNumber(releaseSummary.templateUsageRate)}%`,
      sub: "Standardized releases",
      tone: safeNumber(releaseSummary.templateUsageRate) >= 50 ? "success" : "notice",
      icon: <FaCircleInfo />,
    },
  ];

  const primaryInsights = toArray(reliefAi.insights).slice(0, 4);

  const topTemplates = toArray(overview?.topTemplatesByUsage).slice(0, 3);
  const highDemandRequests = toArray(overview?.highDemandRequests).slice(0, 3);

  const barangayRankingRows = barangayRows.map((item) => ({
  key: item.barangayName,
  title: item.barangayName,
  meta: "Requested food packs",
  value: `${formatWhole(item.requestedFoodPacks)} packs`,
}));

const templateRankingRows = topTemplates.map((item) => ({
  key: item.templateName,
  title: item.templateName || "Unnamed Template",
  meta: "Template release usage",
  value: `${formatWhole(item.releaseCount)} release${
    safeNumber(item.releaseCount) === 1 ? "" : "s"
  }`,
}));

const demandRankingRows = highDemandRequests.map((item) => ({
  key: item._id || item.requestNo,
  title: item.barangayName || "Unknown Barangay",
  meta: `${formatWhole(item.totalAffected)} affected • ${formatWhole(
    item.vulnerableCount
  )} vulnerable`,
  value: `${formatWhole(item.requestedFoodPacks)} packs`,
}));

  return (
    <div className="relief-analytics relief-analytics-clean">
      <section className={`relief-single-alert ${warningSummary.tone}`}>
        <span className="relief-single-alert-icon">
          {warningSummary.tone === "success" ? <FaCircleCheck /> : <FaTriangleExclamation />}
        </span>

        <div>
          <div className="relief-single-alert-title">{warningSummary.title}</div>
          <div className="relief-single-alert-text">{warningSummary.text}</div>
        </div>

        {refreshing && <span className="relief-refresh-pill">Refreshing</span>}
      </section>

      <section className="relief-kpi-grid-clean">
        {kpis.map((item) => (
          <KpiCard key={item.label} {...item} />
        ))}
      </section>

      <section className="relief-main-grid-clean">
        <div className="a-card relief-ai-card relief-clean-card">
          <div className="relief-panel-head">
            <div>
              <div className="relief-panel-kicker">
                <FaWandMagicSparkles /> AI Relief Insights
              </div>
              <div className="relief-panel-title">Request and Release Summary</div>
            </div>

            <div className="relief-ai-meta">
              <span className={`relief-severity relief-severity--${aiSeverityClass}`}>
                {titleCase(reliefAi.overallSeverity || "info")}
              </span>
              <span className="relief-source-badge">
                {reliefAi.aiAvailable ? "Gemini AI" : "Fallback"}
              </span>
            </div>
          </div>

          <div className="relief-ai-summary">
            {reliefAi.executiveSummary ||
              "AI summary will appear here once relief analytics are available."}
          </div>

          <div className="relief-action-list compact">
            <div className="relief-action-title">Priority Actions</div>

            {toArray(reliefAi.priorityActions).length > 0 ? (
              <ul>
                {toArray(reliefAi.priorityActions)
                  .slice(0, 3)
                  .map((item, index) => (
                    <li key={`priority-${index}`}>{item}</li>
                  ))}
              </ul>
            ) : (
              <div className="relief-inline-empty">No AI priority actions available yet.</div>
            )}
          </div>
        </div>

        <div className="a-card relief-health-card relief-clean-card">
          <div className="relief-panel-head">
            <div>
              <div className="relief-panel-kicker">
                <FaCircleCheck /> Relief Readiness
              </div>
              <div className="relief-panel-title">Operational Snapshot</div>
            </div>

            <span className="relief-health-pill">
              {formatWhole(summary.totalRequestedFoodPacks)} packs requested
            </span>
          </div>

          <div className="relief-health-compact-grid">
            {compactReliefCards.map((item) => (
              <div key={item.label} className={`relief-health-compact-card ${item.tone}`}>
                <span className="relief-health-compact-icon">{item.icon}</span>
                <div>
                  <div className="relief-health-compact-label">{item.label}</div>
                  <div className="relief-health-compact-value">
                    {typeof item.value === "string" ? item.value : formatWhole(item.value)}
                  </div>
                  <div className="relief-health-compact-sub">{item.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relief-ranking-grid">
        <RankingCard
          title="Top Barangay Demand"
          subtitle="Top 3 barangays by requested food packs."
          icon={<FaRankingStar />}
          rows={barangayRankingRows}
          emptyTitle="No barangay ranking yet"
          emptyText="Barangay demand ranking will appear once relief requests are submitted."
        />

        <RankingCard
          title="Top Food Pack Templates"
          subtitle="Top 3 most used templates from release records."
          icon={<FaHandHoldingHeart />}
          rows={templateRankingRows}
          emptyTitle="No template usage yet"
          emptyText="Template ranking will appear once DRRMO creates template-based releases."
        />

        <RankingCard
          title="Highest Demand Requests"
          subtitle="Top 3 requests by food pack demand and affected count."
          icon={<FaTriangleExclamation />}
          rows={demandRankingRows}
          emptyTitle="No demand records yet"
          emptyText="High-demand request ranking will appear once barangays submit relief requests."
        />
      </section>

      <section className="relief-graph-grid-clean">
        <div className="a-card a-chart-card relief-chart-card">
          <div className="a-card-head">
            <div>
              <div className="a-card-title">
                <FaChartColumn /> Request Status Distribution
              </div>
              <div className="relief-card-subtitle">
                One view of pending, approved, released, received, and rejected requests.
              </div>
            </div>
          </div>

          <div className="a-chart-body">
            <ChartOrEmpty
              chartData={statusChart}
              message="Relief request status data will appear once records are available."
              element={<Bar data={statusChart} options={commonChartOptions} />}
            />
          </div>

          <div className="relief-health-value-list">
            {statusRows.map((item) => (
              <div key={item.label} className={`relief-health-row ${item.tone}`}>
                <span>{item.label}</span>
                <div className="relief-health-row-track">
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

        <div className="a-card a-chart-card relief-chart-card">
          <div className="a-card-head">
            <div>
              <div className="a-card-title">
                <FaPeopleRoof /> Barangay Food Pack Demand
              </div>
              <div className="relief-card-subtitle">
                Top 3 barangays by requested food packs.
              </div>
            </div>
          </div>

          <div className="a-chart-body">
            <ChartOrEmpty
              chartData={barangayChart}
              message="Barangay demand will appear once relief requests are submitted."
              element={<Bar data={barangayChart} options={commonChartOptions} />}
            />
          </div>

          <div className="relief-chart-value-list">
            {barangayRows.map((item, index) => (
              <div key={item.barangayName} className="relief-chart-value-row relief-ranked-chart-row">
                <span>
                  <b>#{index + 1}</b> {item.barangayName}
                </span>
                <div className="relief-chart-value-track">
                  <span
                    className="relief-chart-value-fill"
                    style={{
                      width: `${Math.max(
                        8,
                        (item.requestedFoodPacks / maxBarangayValue) * 100
                      )}%`,
                    }}
                  />
                </div>
                <strong>{formatWhole(item.requestedFoodPacks)}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relief-graph-grid-clean relief-trend-ai-grid">
        <div className="a-card a-chart-card relief-chart-card relief-chart-card-wide">
          <div className="a-card-head">
            <div>
              <div className="a-card-title">
                <FaClockRotateLeft /> Request and Release Trend
              </div>
              <div className="relief-card-subtitle">
                Recent activity for request submission and release preparation.
              </div>
            </div>
          </div>

          <div className="a-chart-body">
            <ChartOrEmpty
              chartData={trendChart}
              message="Recent trend will appear once requests or releases are recorded."
              element={<Line data={trendChart} options={trendOptions} />}
            />
          </div>
        </div>

        <div className="a-card relief-signals-clean relief-ai-signals-card">
          <div className="a-card-head">
            <div>
              <div className="a-card-title">
                <FaWandMagicSparkles /> AI Relief Signals
              </div>
              <div className="relief-card-subtitle">
                AI analysis from request demand, release records, and receipt status.
              </div>
            </div>
          </div>

          {primaryInsights.length > 0 ? (
            <div className="relief-signal-stack-clean">
              {primaryInsights.map((item, index) => (
                <div
                  key={`detail-insight-${index}`}
                  className={`relief-insight-item relief-insight-item--${getSeverityClass(
                    item?.severity
                  )}`}
                >
                  <div className="relief-insight-top">
                    <span className="relief-insight-title">{item?.title || "Insight"}</span>
                    <span
                      className={`relief-insight-badge relief-insight-badge--${getSeverityClass(
                        item?.severity
                      )}`}
                    >
                      {titleCase(item?.severity || "info")}
                    </span>
                  </div>

                  <div className="relief-insight-message">
                    {item?.message || "No insight message available."}
                  </div>

                  <div className="relief-insight-action">
                    <strong>Action:</strong> {item?.action || "Review this area."}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="analytics-empty-state">
              <div className="analytics-empty-state-title">No AI insights yet</div>
              <div className="analytics-empty-state-copy">
                Relief intelligence will appear here once data is available.
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
