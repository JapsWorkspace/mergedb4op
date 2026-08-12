import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  FaBed,
  FaChartColumn,
  FaCircleCheck,
  FaCircleInfo,
  FaClockRotateLeft,
  FaDroplet,
  FaEye,
  FaGaugeHigh,
  FaHouseFloodWater,
  FaPeopleRoof,
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
  Title,
  Tooltip as ChartTooltip,
  Legend,
} from "chart.js";

import { Bar, Doughnut, Line } from "react-chartjs-2";

import "../css/EvacuationAnalytics.css";
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

function formatShortDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "2-digit",
  });
}

function getSeverityClass(severity) {
  const normalized = String(severity || "").toLowerCase();
  if (normalized === "critical") return "critical";
  if (normalized === "warning") return "warning";
  if (normalized === "notice") return "notice";
  if (normalized === "success") return "success";
  return "info";
}

function hasChartValues(chartData) {
  if (!chartData?.datasets?.length) return false;

  return chartData.datasets.some((dataset) =>
    toArray(dataset.data).some((value) => safeNumber(value) > 0)
  );
}

function EmptyState({
  title = "No data yet",
  text = "Analytics will appear once evacuation records are available.",
}) {
  return (
    <div className="evac-empty-state">
      <div className="evac-empty-state-title">{title}</div>
      <div className="evac-empty-state-copy">{text}</div>
    </div>
  );
}

function ChartOrEmpty({ chartData, element, title, text }) {
  if (!hasChartValues(chartData)) {
    return <EmptyState title={title} text={text} />;
  }

  return element;
}

function KpiCard({ tone, icon, label, value, sub, urgent = false }) {
  return (
    <div className={`evac-kpi-card ${tone} ${urgent ? "urgent" : ""}`}>
      <div className="evac-kpi-top">
        <span className="evac-kpi-icon">{icon}</span>
        {urgent ? <span className="evac-kpi-alert">!</span> : null}
      </div>

      <div className="evac-kpi-label">{label}</div>
      <div className="evac-kpi-value">{value}</div>
      <div className="evac-kpi-sub">{sub}</div>
    </div>
  );
}

function RankingCard({ title, subtitle, icon, rows, emptyTitle, emptyText }) {
  return (
    <div className="evac-panel evac-ranking-card">
      <div className="evac-card-head">
        <div>
          <div className="evac-card-title">
            {icon} {title}
          </div>
          <div className="evac-card-subtitle">{subtitle}</div>
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="evac-ranking-list">
          {rows.slice(0, 3).map((item, index) => (
            <div key={item.key || `${title}-${index}`} className="evac-ranking-row">
              <div className={`evac-rank-badge rank-${index + 1}`}>#{index + 1}</div>

              <div className="evac-ranking-main">
                <div className="evac-ranking-title">{item.title}</div>
                <div className="evac-ranking-meta">{item.meta}</div>
              </div>

              <div className="evac-ranking-value">{item.value}</div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title={emptyTitle} text={emptyText} />
      )}
    </div>
  );
}

function InsightItem({ item }) {
  const severityClass = getSeverityClass(item?.severity);

  return (
    <div className={`evac-insight-item evac-insight-item--${severityClass}`}>
      <div className="evac-insight-top">
        <span className="evac-insight-title">{item?.title || "Insight"}</span>
        <span className={`evac-insight-badge evac-insight-badge--${severityClass}`}>
          {titleCase(item?.severity || "info")}
        </span>
      </div>

      <div className="evac-insight-message">
        {item?.message || "No insight message available."}
      </div>

      <div className="evac-insight-action">
        <strong>Action:</strong> {item?.action || "Review this area."}
      </div>
    </div>
  );
}

export default function EvacuationAnalytics() {
  const isMountedRef = useRef(true);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [overview, setOverview] = useState({
    generatedAt: null,
    summary: {},
    historySummary: {},
    statusBreakdown: {},
    facilityBreakdown: {},
    barangayBreakdown: [],
    criticalBarangays: [],
    topBarangaysByPlaces: [],
    topBarangaysByIndividualCapacity: [],
    topBarangaysByFamilyCapacity: [],
    topBarangaysByBedCapacity: [],
    topBarangaysByFloorArea: [],
    highCapacityPlaces: [],
    attentionPlaces: [],
    actionBreakdown: {},
    roleBreakdown: {},
    placeTrend: [],
    activityTrend: [],
    recentActivities: [],
  });

  const [evacAi, setEvacAi] = useState({
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

  const fetchEvacAnalytics = useCallback(async (backgroundRefresh = false) => {
    if (backgroundRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [overviewRes, aiRes] = await Promise.allSettled([
        axios.get(`${BASE_URL}/api/evac-analytics/overview`, {
          withCredentials: true,
        }),
        axios.get(`${BASE_URL}/api/evac-analytics/ai-insights`, {
          withCredentials: true,
        }),
      ]);

      if (!isMountedRef.current) return;

      if (overviewRes.status === "fulfilled") {
        setOverview(overviewRes.value?.data || {});
      }

      if (aiRes.status === "fulfilled") {
        setEvacAi(aiRes.value?.data || {});
      }
    } catch (error) {
      console.error("Evac analytics fetch error:", error);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchEvacAnalytics(false);

    const interval = setInterval(() => {
      fetchEvacAnalytics(true);
    }, 60000);

    return () => clearInterval(interval);
  }, [fetchEvacAnalytics]);

  const summary = overview?.summary || {};
  const historySummary = overview?.historySummary || {};
  const facilityBreakdown = overview?.facilityBreakdown || {};

  const anyCrCoverageCount = useMemo(() => {
    const total = safeNumber(summary.totalPlaces);
    const rate = safeNumber(summary.crCoverageRate);
    return Math.round((rate / 100) * total);
  }, [summary]);

  const warningSummary = useMemo(() => {
    const issues = [];

    if (safeNumber(summary.fullPlaces) > 0) {
      issues.push(`${formatWhole(summary.fullPlaces)} full`);
    }

    if (safeNumber(summary.limitedPlaces) > 0) {
      issues.push(`${formatWhole(summary.limitedPlaces)} limited`);
    }

    if (safeNumber(summary.potableWaterRate) < 70 && safeNumber(summary.totalPlaces) > 0) {
      issues.push("water readiness below 70%");
    }

    if (safeNumber(summary.crCoverageRate) < 70 && safeNumber(summary.totalPlaces) > 0) {
      issues.push("CR coverage below 70%");
    }

    if (issues.length === 0) {
      return {
        tone: "success",
        title: "Evacuation readiness looks stable",
        text: "No major capacity or facility warning is currently detected.",
      };
    }

    return {
      tone: safeNumber(summary.fullPlaces) > 0 ? "warning" : "notice",
      title: "Evacuation readiness needs attention",
      text: issues.join(" • "),
    };
  }, [summary]);

  const commonAxisScales = useMemo(() => {
    return {
      x: {
        ticks: {
          color: "#25533d",
          font: { size: 11, weight: "700" },
        },
        grid: {
          color: "rgba(37, 83, 61, 0.08)",
        },
        border: { display: false },
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: "#25533d",
          font: { size: 11, weight: "700" },
          precision: 0,
          stepSize: 1,
          callback: (value) => (Number.isInteger(value) ? value : ""),
        },
        grid: {
          color: "rgba(37, 83, 61, 0.08)",
        },
        border: { display: false },
      },
    };
  }, []);

  const baseBarOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: false },
        tooltip: {
          backgroundColor: "#163524",
          titleColor: "#ffffff",
          bodyColor: "#e9fff1",
          padding: 10,
          cornerRadius: 10,
        },
      },
      scales: commonAxisScales,
    };
  }, [commonAxisScales]);

  const lineOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: {
            color: "#25533d",
            font: { size: 11, weight: "700" },
            usePointStyle: true,
            boxWidth: 10,
          },
        },
        title: { display: false },
        tooltip: {
          backgroundColor: "#163524",
          titleColor: "#ffffff",
          bodyColor: "#e9fff1",
          padding: 10,
          cornerRadius: 10,
        },
      },
      scales: commonAxisScales,
    };
  }, [commonAxisScales]);

  const doughnutOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: {
            color: "#25533d",
            font: { size: 11, weight: "700" },
            boxWidth: 12,
            usePointStyle: true,
          },
        },
        tooltip: {
          backgroundColor: "#163524",
          titleColor: "#ffffff",
          bodyColor: "#e9fff1",
          padding: 10,
          cornerRadius: 10,
        },
      },
    };
  }, []);

  const aiSeverityClass = getSeverityClass(evacAi.overallSeverity);

  const kpis = useMemo(() => {
    return [
      {
        tone: "success",
        icon: <FaHouseFloodWater />,
        label: "Evac Areas",
        value: loading ? "—" : formatWhole(summary.totalPlaces),
        sub: "Active evacuation places",
      },
      {
        tone: "success",
        icon: <FaPeopleRoof />,
        label: "Individual Capacity",
        value: loading ? "—" : formatWhole(summary.totalIndividualCapacity),
        sub: "Total person capacity",
      },
      {
        tone:
          safeNumber(summary.fullPlaces) > 0 || safeNumber(summary.limitedPlaces) > 0
            ? "warning"
            : "success",
        icon: <FaTriangleExclamation />,
        label: "Limited / Full",
        value: loading
          ? "—"
          : formatWhole(safeNumber(summary.limitedPlaces) + safeNumber(summary.fullPlaces)),
        sub: "Requires monitoring",
        urgent: safeNumber(summary.fullPlaces) > 0,
      },
      {
        tone: safeNumber(summary.potableWaterRate) >= 70 ? "success" : "notice",
        icon: <FaDroplet />,
        label: "Water Coverage",
        value: loading ? "—" : `${safeNumber(summary.potableWaterRate)}%`,
        sub: "Potable water ready",
      },
    ];
  }, [loading, summary]);

  const compactSnapshotCards = useMemo(() => {
    return [
      {
        label: "Family Capacity",
        value: summary.totalFamilyCapacity,
        sub: "Family slots",
        tone: "success",
        icon: <FaPeopleRoof />,
      },
      {
        label: "Bed Capacity",
        value: summary.totalBedCapacity,
        sub: "Bed support",
        tone: "success",
        icon: <FaBed />,
      },
      {
        label: "CR Coverage",
        value: `${safeNumber(summary.crCoverageRate)}%`,
        sub: "Sanitation readiness",
        tone: safeNumber(summary.crCoverageRate) >= 70 ? "success" : "notice",
        icon: <FaShieldHalved />,
      },
      {
        label: "Public Visibility",
        value: `${safeNumber(summary.landingVisibilityRate)}%`,
        sub: "Shown on landing page",
        tone: safeNumber(summary.landingVisibilityRate) >= 70 ? "info" : "notice",
        icon: <FaEye />,
      },
    ];
  }, [summary]);

  const statusChart = useMemo(() => {
    return {
      labels: ["Available", "Limited", "Full"],
      datasets: [
        {
          label: "Evacuation Areas",
          data: [
            safeNumber(summary.availablePlaces),
            safeNumber(summary.limitedPlaces),
            safeNumber(summary.fullPlaces),
          ],
          backgroundColor: ["#17a34a", "#f59e0b", "#dc2626"],
          borderRadius: 12,
          borderSkipped: false,
          maxBarThickness: 58,
        },
      ],
    };
  }, [summary]);

  const barangayCapacityRows = useMemo(() => {
    return toArray(overview?.topBarangaysByIndividualCapacity)
      .map((item) => ({
        barangayName: item.barangayName || "Unspecified",
        totalIndividualCapacity: safeNumber(item.totalIndividualCapacity),
      }))
      .slice(0, 3);
  }, [overview]);

  const barangayCapacityChart = useMemo(() => {
    return {
      labels: barangayCapacityRows.map((item) => item.barangayName),
      datasets: [
        {
          label: "Individual Capacity",
          data: barangayCapacityRows.map((item) => item.totalIndividualCapacity),
          backgroundColor: ["#0ea765", "#17a34a", "#38b26f"],
          borderRadius: 12,
          borderSkipped: false,
          maxBarThickness: 56,
        },
      ],
    };
  }, [barangayCapacityRows]);

  const trendLabels = useMemo(() => {
    const placeTrend = toArray(overview?.placeTrend);
    const activityTrend = toArray(overview?.activityTrend);

    const source = placeTrend.length > 0 ? placeTrend : activityTrend;

    return source.map((item) => formatShortDate(item.date || item._id));
  }, [overview]);

  const trendChart = useMemo(() => {
    return {
      labels: trendLabels,
      datasets: [
        {
          label: "Areas Added",
          data: toArray(overview?.placeTrend).map((item) => safeNumber(item.count)),
          borderColor: "#17a34a",
          backgroundColor: "rgba(23, 163, 74, 0.12)",
          pointBackgroundColor: "#17a34a",
          pointRadius: 4,
          pointHoverRadius: 5,
          tension: 0.35,
          fill: false,
        },
        {
          label: "Activity",
          data: toArray(overview?.activityTrend).map((item) => safeNumber(item.count)),
          borderColor: "#c98a04",
          backgroundColor: "rgba(201, 138, 4, 0.12)",
          pointBackgroundColor: "#c98a04",
          pointRadius: 4,
          pointHoverRadius: 5,
          tension: 0.35,
          fill: false,
        },
      ],
    };
  }, [overview, trendLabels]);

  const statusMixChart = useMemo(() => {
    return {
      labels: ["Available", "Limited", "Full"],
      datasets: [
        {
          label: "Status Mix",
          data: [
            safeNumber(summary.availablePlaces),
            safeNumber(summary.limitedPlaces),
            safeNumber(summary.fullPlaces),
          ],
          backgroundColor: ["#17a34a", "#f59e0b", "#dc2626"],
          borderWidth: 0,
        },
      ],
    };
  }, [summary]);

  const rankingBarangayRows = useMemo(() => {
    return barangayCapacityRows.map((item) => ({
      key: item.barangayName,
      title: item.barangayName,
      meta: "Top barangay by individual capacity",
      value: `${formatWhole(item.totalIndividualCapacity)} cap.`,
    }));
  }, [barangayCapacityRows]);

  const rankingHighCapacityRows = useMemo(() => {
    return toArray(overview?.highCapacityPlaces)
      .slice(0, 3)
      .map((item) => ({
        key: item._id || item.name,
        title: item.name || "Unnamed Area",
        meta: `${item.barangayName || "Unspecified"} • ${titleCase(item.capacityStatus || "available")}`,
        value: `${formatWhole(item.capacityIndividual)} cap.`,
      }));
  }, [overview]);

  const rankingAttentionRows = useMemo(() => {
    return toArray(overview?.attentionPlaces)
      .slice(0, 3)
      .map((item) => {
        const flags = [];
        if (String(item.capacityStatus || "").toLowerCase() === "full") flags.push("Full");
        if (String(item.capacityStatus || "").toLowerCase() === "limited") flags.push("Limited");
        if (!item.potableWater) flags.push("No water");

        const currentOccupants = safeNumber(item.currentOccupants);
        const capacityIndividual = safeNumber(item.capacityIndividual);

        return {
          key: item._id || item.name,
          title: item.name || "Unnamed Area",
          meta: `${item.barangayName || "Unspecified"} - ${flags.join(", ") || "Needs review"} - Occupancy ${formatWhole(currentOccupants)}/${formatWhole(capacityIndividual)}`,
          value: titleCase(item.capacityStatus || "review"),
        };
      });
  }, [overview]);
  const primaryInsights = useMemo(() => {
    return toArray(evacAi.insights).slice(0, 4);
  }, [evacAi]);

  const phase2RiskRows = useMemo(() => {
    return toArray(overview?.barangayBreakdown)
      .map((item) => {
        const full = safeNumber(item.full);
        const limited = safeNumber(item.limited);
        const available = safeNumber(item.available);
        const totalPlaces = safeNumber(item.totalPlaces);

        let score = 0;
        score += full * 5;
        score += limited * 3;
        if (available === 0 && totalPlaces > 0) score += 4;

        const level =
          score >= 12 ? "critical" : score >= 7 ? "warning" : score >= 3 ? "notice" : "stable";

        return {
          barangayName: item.barangayName || "Unspecified",
          full,
          limited,
          available,
          totalPlaces,
          score,
          level,
        };
      })
      .sort((a, b) => b.score - a.score || b.full - a.full || b.limited - a.limited)
      .slice(0, 5);
  }, [overview]);

  const maxRiskScore = useMemo(() => {
    return Math.max(...phase2RiskRows.map((item) => safeNumber(item.score)), 1);
  }, [phase2RiskRows]);

  const readinessWarnings = useMemo(() => {
    const totalPlaces = safeNumber(summary.totalPlaces);
    const missingWater = Math.max(0, totalPlaces - safeNumber(facilityBreakdown.potableWater));
    const missingCr = Math.max(0, totalPlaces - safeNumber(anyCrCoverageCount));
    const hiddenFromLanding = Math.max(
      0,
      totalPlaces - safeNumber(facilityBreakdown.landingVisible)
    );
    const hiddenFromRequest = Math.max(
      0,
      totalPlaces - safeNumber(facilityBreakdown.requestVisible)
    );

    return [
      {
        label: "Missing potable water",
        count: missingWater,
        tone: missingWater > 0 ? "warning" : "success",
        text:
          missingWater > 0
            ? `${formatWhole(missingWater)} evacuation area(s) have no potable water marked.`
            : "All evacuation areas are marked with potable water.",
      },
      {
        label: "Missing CR coverage",
        count: missingCr,
        tone: missingCr > 0 ? "notice" : "success",
        text:
          missingCr > 0
            ? `${formatWhole(missingCr)} evacuation area(s) need CR coverage review.`
            : "All evacuation areas have CR coverage recorded.",
      },
      {
        label: "Hidden from landing page",
        count: hiddenFromLanding,
        tone: hiddenFromLanding > 0 ? "info" : "success",
        text:
          hiddenFromLanding > 0
            ? `${formatWhole(hiddenFromLanding)} evacuation area(s) are hidden from the public landing page.`
            : "All evacuation areas are visible on the landing page.",
      },
      {
        label: "Hidden from request usage",
        count: hiddenFromRequest,
        tone: hiddenFromRequest > 0 ? "info" : "success",
        text:
          hiddenFromRequest > 0
            ? `${formatWhole(hiddenFromRequest)} evacuation area(s) are hidden from request usage.`
            : "All evacuation areas are available for request usage.",
      },
    ];
  }, [summary, facilityBreakdown, anyCrCoverageCount]);

  return (
    <div className="evac-analytics">
      <section className={`evac-banner ${warningSummary.tone}`}>
        <div className="evac-banner-icon">
          {warningSummary.tone === "success" ? <FaCircleCheck /> : <FaTriangleExclamation />}
        </div>

        <div className="evac-banner-main">
          <div className="evac-banner-title">{warningSummary.title}</div>
          <div className="evac-banner-text">{warningSummary.text}</div>
        </div>

        <div className="evac-banner-actions">
          {refreshing ? <span className="evac-badge evac-badge--refresh">Refreshing</span> : null}
          <span className={`evac-badge evac-badge--${aiSeverityClass}`}>
            {titleCase(evacAi.overallSeverity || "info")}
          </span>
        </div>
      </section>

      <section className="evac-kpi-grid">
        {kpis.map((item) => (
          <KpiCard key={item.label} {...item} />
        ))}
      </section>

      <section className="evac-main-grid">
        <div className="evac-panel evac-panel--hero">
          <div className="evac-panel-top">
            <div>
              <div className="evac-panel-kicker">
                <FaWandMagicSparkles /> AI Evac Insights
              </div>
              <div className="evac-panel-heading">Evacuation Readiness Summary</div>
            </div>

            <div className="evac-panel-actions">
  <span className="evac-chip evac-chip--source">
    {evacAi.aiAvailable ? "Gemini AI" : "Fallback"}
  </span>
</div>
          </div>

          <div className="evac-summary-box">
            {evacAi.executiveSummary ||
              "AI summary will appear here once evacuation analytics are available."}
          </div>

          <div className="evac-priority-box">
            <div className="evac-priority-title">Priority Actions</div>

            {toArray(evacAi.priorityActions).length > 0 ? (
              <ul className="evac-priority-list">
                {toArray(evacAi.priorityActions)
                  .slice(0, 3)
                  .map((item, index) => (
                    <li key={`priority-${index}`}>{item}</li>
                  ))}
              </ul>
            ) : (
              <EmptyState
                title="No AI actions yet"
                text="Priority actions will appear once evacuation data is analyzed."
              />
            )}
          </div>
        </div>

        <div className="evac-panel evac-panel--snapshot">
          <div className="evac-panel-top">
            <div>
              <div className="evac-panel-kicker">
                <FaGaugeHigh /> Operational Snapshot
              </div>
              <div className="evac-panel-heading">Facility Readiness</div>
            </div>

            <span className="evac-chip evac-chip--neutral">
              {formatWhole(historySummary.logsThisWeek)} activity this week
            </span>
          </div>

          <div className="evac-snapshot-grid">
            {compactSnapshotCards.map((item) => (
              <div key={item.label} className={`evac-snapshot-card ${item.tone}`}>
                <div className="evac-snapshot-icon">{item.icon}</div>

                <div>
                  <div className="evac-snapshot-label">{item.label}</div>
                  <div className="evac-snapshot-value">
                    {typeof item.value === "string" ? item.value : formatWhole(item.value)}
                  </div>
                  <div className="evac-snapshot-sub">{item.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="evac-ranking-grid">
        <RankingCard
          title="Top Barangay Capacity"
          subtitle="Top 3 barangays by individual capacity."
          icon={<FaRankingStar />}
          rows={rankingBarangayRows}
          emptyTitle="No barangay ranking yet"
          emptyText="Barangay capacity ranking will appear once evacuation places are available."
        />

        <RankingCard
          title="Highest Capacity Areas"
          subtitle="Top 3 evacuation areas by individual capacity."
          icon={<FaPeopleRoof />}
          rows={rankingHighCapacityRows}
          emptyTitle="No capacity ranking yet"
          emptyText="High-capacity evacuation areas will appear once data is available."
        />

        <RankingCard
          title="Attention Needed"
          subtitle="Full, limited, or no-water evacuation areas."
          icon={<FaTriangleExclamation />}
          rows={rankingAttentionRows}
          emptyTitle="No attention items yet"
          emptyText="Attention-needed areas will appear once status or facility gaps exist."
        />
      </section>

      <section className="evac-chart-grid">
        <div className="evac-panel evac-chart-card">
          <div className="evac-card-head">
            <div>
              <div className="evac-card-title">
                <FaChartColumn /> Capacity Status
              </div>
              <div className="evac-card-subtitle">
                Available, limited, and full evacuation areas.
              </div>
            </div>
          </div>

          <div className="evac-chart-body">
            <ChartOrEmpty
              chartData={statusChart}
              title="No status data yet"
              text="Capacity status chart will appear once evacuation areas are available."
              element={<Bar data={statusChart} options={baseBarOptions} />}
            />
          </div>
        </div>

        <div className="evac-panel evac-chart-card">
          <div className="evac-card-head">
            <div>
              <div className="evac-card-title">
                <FaHouseFloodWater /> Barangay Capacity
              </div>
              <div className="evac-card-subtitle">
                Top 3 barangays by individual evacuation capacity.
              </div>
            </div>
          </div>

          <div className="evac-chart-body">
            <ChartOrEmpty
              chartData={barangayCapacityChart}
              title="No barangay capacity yet"
              text="Barangay capacity chart will appear once evacuation places are available."
              element={<Bar data={barangayCapacityChart} options={baseBarOptions} />}
            />
          </div>
        </div>
      </section>

      <section className="evac-trend-grid">
        <div className="evac-panel evac-chart-card evac-chart-card--wide">
          <div className="evac-card-head">
            <div>
              <div className="evac-card-title">
                <FaClockRotateLeft /> Evac Activity Trend
              </div>
              <div className="evac-card-subtitle">
                Recent evacuation area additions and evacuation-related activity.
              </div>
            </div>
          </div>

          <div className="evac-chart-body evac-chart-body--tall">
            <ChartOrEmpty
              chartData={trendChart}
              title="No trend yet"
              text="Trend lines will appear once evacuation records and activity logs exist."
              element={<Line data={trendChart} options={lineOptions} />}
            />
          </div>
        </div>

        <div className="evac-panel evac-ai-panel">
          <div className="evac-card-head">
            <div>
              <div className="evac-card-title">
                <FaWandMagicSparkles /> AI Evac Signals
              </div>
              <div className="evac-card-subtitle">
                Data-based signals from capacity, facilities, and activity.
              </div>
            </div>
          </div>

          {primaryInsights.length > 0 ? (
            <div className="evac-insight-stack">
              {primaryInsights.map((item, index) => (
                <InsightItem key={`evac-insight-${index}`} item={item} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No AI insights yet"
              text="Evacuation AI signals will appear once enough analytics data is available."
            />
          )}
        </div>
      </section>

      <section className="evac-phase2-grid">
        <div className="evac-panel evac-phase-card">
          <div className="evac-card-head">
            <div>
              <div className="evac-card-title">
                <FaChartColumn /> Status Mix
              </div>
              <div className="evac-card-subtitle">
                Phase 2 • quick distribution of area capacity status.
              </div>
            </div>
          </div>

          <div className="evac-doughnut-wrap">
            <ChartOrEmpty
              chartData={statusMixChart}
              title="No status mix yet"
              text="Status mix will appear once evacuation area statuses are available."
              element={<Doughnut data={statusMixChart} options={doughnutOptions} />}
            />
          </div>
        </div>

        <div className="evac-panel evac-phase-card">
          <div className="evac-card-head">
            <div>
              <div className="evac-card-title">
                <FaTriangleExclamation /> Barangay Risk Heat
              </div>
              <div className="evac-card-subtitle">
                Phase 2 • barangays with higher operational pressure.
              </div>
            </div>
          </div>

          {phase2RiskRows.length > 0 ? (
            <div className="evac-risk-list">
              {phase2RiskRows.map((item) => (
                <div key={item.barangayName} className="evac-risk-row">
                  <div className="evac-risk-main">
                    <div className="evac-risk-name">{item.barangayName}</div>
                    <div className="evac-risk-meta">
                      {formatWhole(item.full)} full • {formatWhole(item.limited)} limited •{" "}
                      {formatWhole(item.available)} available
                    </div>
                  </div>

                  <div className="evac-risk-score-wrap">
                    <span className={`evac-risk-badge evac-risk-badge--${item.level}`}>
                      {titleCase(item.level)}
                    </span>
                    <div className="evac-risk-track">
                      <span
                        className={`evac-risk-fill evac-risk-fill--${item.level}`}
                        style={{
                          width: `${Math.max(8, (safeNumber(item.score) / maxRiskScore) * 100)}%`,
                        }}
                      />
                    </div>
                    <strong className="evac-risk-score">{formatWhole(item.score)}</strong>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No risk scores yet"
              text="Barangay risk heat scoring will appear once barangay breakdown data is available."
            />
          )}
        </div>

        <div className="evac-panel evac-phase-card">
          <div className="evac-card-head">
            <div>
              <div className="evac-card-title">
                <FaCircleInfo /> Readiness Deficiencies
              </div>
              <div className="evac-card-subtitle">
                Phase 2 • quick warnings for readiness gaps.
              </div>
            </div>
          </div>

          <div className="evac-deficiency-list">
            {readinessWarnings.map((item) => (
              <div key={item.label} className={`evac-deficiency-item ${item.tone}`}>
                <div className="evac-deficiency-top">
                  <span className="evac-deficiency-label">{item.label}</span>
                  <span className={`evac-deficiency-count ${item.tone}`}>
                    {formatWhole(item.count)}
                  </span>
                </div>
                <div className="evac-deficiency-text">{item.text}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
