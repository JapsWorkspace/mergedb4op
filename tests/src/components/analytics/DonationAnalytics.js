import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

import {
  FaChartColumn,
  FaCircleCheck,
  FaCoins,
  FaGift,
  FaHandshake,
  FaPeopleGroup,
  FaRankingStar,
  FaRepeat,
  FaScaleBalanced,
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

import { Bar, Line } from "react-chartjs-2";

import "../css/DonationAnalytics.css";
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

function formatMoney(value) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(safeNumber(value));
}

function formatCompactMoney(value) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(safeNumber(value));
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

function isNamedDonorName(value) {
  const name = String(value || "").trim();
  const lowered = name.toLowerCase();

  if (!name) return false;

  const blocked = [
    "external donor",
    "government source",
    "internal source",
    "external source",
    "anonymous",
    "confidential",
    "unnamed source",
    "no source name",
    "-",
    "n/a",
    "na",
  ];

  return !blocked.includes(lowered);
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
    <div className={`don-kpi-card ${tone} ${urgent ? "urgent" : ""}`}>
      <div className="don-kpi-top">
        <span className="don-kpi-icon">{icon}</span>
        {urgent && <span className="don-kpi-alert">!</span>}
      </div>

      <div className="don-kpi-label">{label}</div>
      <div className="don-kpi-value">{value}</div>
      <div className="don-kpi-sub">{sub}</div>
    </div>
  );
}

function LeaderboardCard({ title, subtitle, icon, donors, type }) {
  return (
    <div className="don-leaderboard-card">
      <div className="don-leaderboard-head">
        <div>
          <div className="don-leaderboard-title">
            {icon} {title}
          </div>
          <div className="don-leaderboard-subtitle">{subtitle}</div>
        </div>
      </div>

      {donors.length === 0 ? (
        <div className="don-empty-box">
          <div className="don-empty-title">No named donors yet</div>
          <div className="don-empty-copy">
            Confidential or unnamed donors are excluded from rankings.
          </div>
        </div>
      ) : (
        <div className="don-relief-rank-list">
          {donors.slice(0, 3).map((donor, index) => {
            const value =
              type === "monetary"
                ? formatMoney(donor.totalAmount)
                : type === "goods"
                ? `${formatWhole(donor.totalQuantity)} units`
                : `${formatWhole(donor.donationCount)} donations`;

            const meta =
              type === "monetary"
                ? `${formatWhole(donor.monetaryDonationCount)} monetary record${
                    safeNumber(donor.monetaryDonationCount) === 1 ? "" : "s"
                  }`
                : type === "goods"
                ? `${titleCase(donor.topCategory || "goods")} • ${formatWhole(
                    donor.goodsDonationCount
                  )} goods record${safeNumber(donor.goodsDonationCount) === 1 ? "" : "s"}`
                : `Last ${donor.lastDonationDate || "n/a"}`;

            return (
              <div
                className={`don-relief-rank-row don-relief-rank-row--${index + 1}`}
                key={`${title}-${donor.name}-${index}`}
              >
                <div className="don-relief-rank-badge">#{index + 1}</div>

                <div className="don-relief-rank-main">
                  <div className="don-relief-rank-name">{donor.name}</div>
                  <div className="don-relief-rank-meta">{meta}</div>
                </div>

                <div className="don-relief-rank-value">{value}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DonationAnalytics() {
  const isMountedRef = useRef(true);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [inventoryItems, setInventoryItems] = useState([]);

  const [inventorySummary, setInventorySummary] = useState({
    totalEntries: 0,
    goodsEntries: 0,
    monetaryEntries: 0,
    totalGoodsQuantity: 0,
    totalMonetaryAmount: 0,
    recentDonations: 0,
  });

  const [sourceStats, setSourceStats] = useState({
    external: 0,
    government: 0,
    internal: 0,
  });

  const [recentTrend, setRecentTrend] = useState([]);
  const [donationAi, setDonationAi] = useState({
    severity: "success",
    source: "rule_based_fallback",
    model: "local_rules",
    summary: "Donation analytics are loading.",
    priorityActions: [],
    insights: [],
    fallbackReason: "",
  });

  const [donationActivity, setDonationActivity] = useState({
    today: {
      totalDonations: 0,
      goodsDonations: 0,
      goodsQuantity: 0,
      monetaryDonations: 0,
      monetaryAmount: 0,
    },
    thisWeek: {
      totalDonations: 0,
      goodsDonations: 0,
      goodsQuantity: 0,
      monetaryDonations: 0,
      monetaryAmount: 0,
    },
    thisMonth: {
      totalDonations: 0,
      goodsDonations: 0,
      goodsQuantity: 0,
      monetaryDonations: 0,
      monetaryAmount: 0,
    },
    donationsToday: 0,
    donationsThisWeek: 0,
    donationsThisMonth: 0,
    monetaryToday: 0,
    monetaryThisWeek: 0,
    monetaryThisMonth: 0,
    goodsQuantityToday: 0,
    goodsQuantityThisWeek: 0,
    goodsQuantityThisMonth: 0,
    sourceBreakdown: {
      external: { totalDonations: 0, goodsQuantity: 0, monetaryAmount: 0 },
      government: { totalDonations: 0, goodsQuantity: 0, monetaryAmount: 0 },
      internal: { totalDonations: 0, goodsQuantity: 0, monetaryAmount: 0 },
    },
    topDonatedCategories: [],
  });

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchDonationAnalytics = useCallback(async (backgroundRefresh = false) => {
    isMountedRef.current = true;

    if (backgroundRefresh) {
      setRefreshing(true);
    }

    try {
      const [
        inventoryRes,
        summaryRes,
        sourceRes,
        trendRes,
        donationActivityRes,
        donationAiRes,
      ] =
        await Promise.allSettled([
          axios.get(`${BASE_URL}/api/inventory`, {
            withCredentials: true,
          }),
          axios.get(`${BASE_URL}/api/inventory/analytics/summary`, {
            withCredentials: true,
          }),
          axios.get(`${BASE_URL}/api/inventory/analytics/source-stats`, {
            withCredentials: true,
          }),
          axios.get(`${BASE_URL}/api/inventory/analytics/recent-trend`, {
            withCredentials: true,
          }),
          axios.get(`${BASE_URL}/api/inventory/analytics/donation-activity`, {
            withCredentials: true,
          }),
          axios.get(`${BASE_URL}/api/inventory/analytics/donation-ai-insights`, {
            withCredentials: true,
          }),
        ]);

      if (!isMountedRef.current) return;

      if (inventoryRes.status === "fulfilled") {
        setInventoryItems(Array.isArray(inventoryRes.value?.data) ? inventoryRes.value.data : []);
      }

      if (summaryRes.status === "fulfilled") {
        const data = summaryRes.value?.data || {};

        setInventorySummary({
          totalEntries: safeNumber(data.totalEntries ?? data.totalActiveItems),
          goodsEntries: safeNumber(data.goodsEntries ?? data.totalGoodsItems),
          monetaryEntries: safeNumber(data.monetaryEntries ?? data.totalMonetaryItems),
          totalGoodsQuantity: safeNumber(data.totalGoodsQuantity),
          totalMonetaryAmount: safeNumber(data.totalMonetaryAmount),
          recentDonations: safeNumber(data.recentDonations ?? data.donationsThisWeek),
        });
      }

      if (sourceRes.status === "fulfilled") {
        setSourceStats(sourceRes.value?.data || {});
      }

      if (trendRes.status === "fulfilled") {
        setRecentTrend(Array.isArray(trendRes.value?.data) ? trendRes.value.data : []);
      }

      if (donationActivityRes.status === "fulfilled") {
        const data = donationActivityRes.value?.data || {};

        setDonationActivity({
          ...data,
          today: data.today || {
            totalDonations: 0,
            goodsDonations: 0,
            goodsQuantity: 0,
            monetaryDonations: 0,
            monetaryAmount: 0,
          },
          thisWeek: data.thisWeek || {
            totalDonations: 0,
            goodsDonations: 0,
            goodsQuantity: 0,
            monetaryDonations: 0,
            monetaryAmount: 0,
          },
          thisMonth: data.thisMonth || {
            totalDonations: 0,
            goodsDonations: 0,
            goodsQuantity: 0,
            monetaryDonations: 0,
            monetaryAmount: 0,
          },
          donationsToday: safeNumber(data.donationsToday ?? data.today?.totalDonations),
          donationsThisWeek: safeNumber(data.donationsThisWeek ?? data.thisWeek?.totalDonations),
          donationsThisMonth: safeNumber(data.donationsThisMonth ?? data.thisMonth?.totalDonations),
          monetaryToday: safeNumber(data.monetaryToday ?? data.today?.monetaryAmount),
          monetaryThisWeek: safeNumber(data.monetaryThisWeek ?? data.thisWeek?.monetaryAmount),
          monetaryThisMonth: safeNumber(data.monetaryThisMonth ?? data.thisMonth?.monetaryAmount),
          goodsQuantityToday: safeNumber(data.goodsQuantityToday ?? data.today?.goodsQuantity),
          goodsQuantityThisWeek: safeNumber(data.goodsQuantityThisWeek ?? data.thisWeek?.goodsQuantity),
          goodsQuantityThisMonth: safeNumber(
            data.goodsQuantityThisMonth ?? data.thisMonth?.goodsQuantity
          ),
          sourceBreakdown: data.sourceBreakdown || {
            external: { totalDonations: 0, goodsQuantity: 0, monetaryAmount: 0 },
            government: { totalDonations: 0, goodsQuantity: 0, monetaryAmount: 0 },
            internal: { totalDonations: 0, goodsQuantity: 0, monetaryAmount: 0 },
          },
          topDonatedCategories: Array.isArray(data.topDonatedCategories)
            ? data.topDonatedCategories
            : [],
        });
      }

      if (donationAiRes.status === "fulfilled") {
        const data = donationAiRes.value?.data || {};

        setDonationAi({
          severity: String(data.overallSeverity || "success").toLowerCase(),
          source: String(data.source || "rule_based_fallback").toLowerCase(),
          model: data.model || "local_rules",
          summary:
            data.executiveSummary ||
            "Donation analytics show usable donor rankings, contribution totals, and source distribution.",
          priorityActions: Array.isArray(data.priorityActions) ? data.priorityActions : [],
          insights: Array.isArray(data.insights) ? data.insights : [],
          fallbackReason: data.fallbackReason || "",
        });
      }
    } catch (error) {
      console.error("Donation analytics fetch error:", error);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchDonationAnalytics(false);

    const interval = setInterval(() => {
      fetchDonationAnalytics(true);
    }, 60000);

    return () => clearInterval(interval);
  }, [fetchDonationAnalytics]);

  const donorStats = useMemo(() => {
    const map = {};

    toArray(inventoryItems).forEach((item) => {
      const sourceName = String(item?.sourceName || "").trim();
      const donorName =
        sourceName ||
        (String(item?.type || "").toLowerCase() === "monetary"
          ? String(item?.name || "").trim()
          : "");

      if (!isNamedDonorName(donorName)) return;

      const key = donorName.toLowerCase();

      if (!map[key]) {
        map[key] = {
          name: donorName,
          donationCount: 0,
          goodsDonationCount: 0,
          monetaryDonationCount: 0,
          totalQuantity: 0,
          totalAmount: 0,
          categories: {},
          lastDonationDate: "",
        };
      }

      map[key].donationCount += 1;

      if (item.type === "goods") {
        map[key].goodsDonationCount += 1;
        map[key].totalQuantity += safeNumber(item.quantity);

        const category = String(item.category || "goods").trim().toLowerCase();
        map[key].categories[category] =
          safeNumber(map[key].categories[category]) + safeNumber(item.quantity);
      }

      if (item.type === "monetary") {
        map[key].monetaryDonationCount += 1;
        map[key].totalAmount += safeNumber(item.amount);
      }

      if (item.createdAt) {
        const currentDate = new Date(item.createdAt);
        const previousDate = map[key].lastDonationDate
          ? new Date(map[key].lastDonationDate)
          : null;

        if (!previousDate || currentDate > previousDate) {
          map[key].lastDonationDate = item.createdAt;
        }
      }
    });

    return Object.values(map).map((donor) => {
      const topCategory = Object.entries(donor.categories || {}).sort(
        (a, b) => safeNumber(b[1]) - safeNumber(a[1])
      )[0];

      return {
        ...donor,
        topCategory: topCategory ? topCategory[0] : "",
        topCategoryQuantity: topCategory ? safeNumber(topCategory[1]) : 0,
        lastDonationDate: donor.lastDonationDate
          ? new Date(donor.lastDonationDate).toLocaleDateString("en-PH")
          : "",
      };
    });
  }, [inventoryItems]);

  const namedMonetaryDonors = useMemo(() => {
    return donorStats
      .filter((donor) => safeNumber(donor.totalAmount) > 0)
      .sort((a, b) => safeNumber(b.totalAmount) - safeNumber(a.totalAmount))
      .slice(0, 5);
  }, [donorStats]);

  const namedGoodsDonors = useMemo(() => {
    return donorStats
      .filter((donor) => safeNumber(donor.totalQuantity) > 0)
      .sort((a, b) => safeNumber(b.totalQuantity) - safeNumber(a.totalQuantity))
      .slice(0, 5);
  }, [donorStats]);

  const namedFrequentDonors = useMemo(() => {
    return donorStats
      .filter((donor) => safeNumber(donor.donationCount) > 0)
      .sort((a, b) => safeNumber(b.donationCount) - safeNumber(a.donationCount))
      .slice(0, 5);
  }, [donorStats]);

  const namedDonorCount = donorStats.length;

  const repeatNamedDonors = useMemo(() => {
    return donorStats.filter((donor) => safeNumber(donor.donationCount) > 1).length;
  }, [donorStats]);

  const largestMonetaryDonor = namedMonetaryDonors[0];

  const donationStatus = useMemo(() => {
    const issues = [];

    if (safeNumber(donationActivity.donationsThisWeek) === 0) {
      issues.push("no donation records this week");
    }

    if (safeNumber(inventorySummary.totalMonetaryAmount) === 0) {
      issues.push("no monetary funds recorded");
    }

    if (safeNumber(inventorySummary.totalGoodsQuantity) === 0) {
      issues.push("no goods quantity recorded");
    }

    if (namedDonorCount === 0 && safeNumber(inventorySummary.totalEntries) > 0) {
      issues.push("no named donor ranking available");
    }

    if (!issues.length) {
      return {
        tone: "success",
        title: "Donation activity is trackable",
        text: "Named donor rankings and source distribution are available for review.",
      };
    }

    return {
      tone: "warning",
      title: "Donation records need review",
      text: issues.join(" • "),
    };
  }, [donationActivity, inventorySummary, namedDonorCount]);

  const commonChartOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          display: false,
        },
        title: {
          display: false,
        },
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
          ticks: {
            color: "#14532d",
            font: {
              size: 11,
              weight: "700",
            },
          },
          grid: {
            color: "rgba(20, 83, 45, 0.08)",
          },
          border: {
            display: false,
          },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: "#14532d",
            font: {
              size: 11,
              weight: "700",
            },
          },
          grid: {
            color: "rgba(20, 83, 45, 0.08)",
          },
          border: {
            display: false,
          },
        },
      },
    };
  }, []);

  const sourceRows = useMemo(() => {
    const breakdown = donationActivity.sourceBreakdown || {};

    return [
      {
        label: "External",
        key: "external",
        color: "#16a34a",
        value: safeNumber(breakdown.external?.totalDonations ?? sourceStats.external),
      },
      {
        label: "NGO",
        key: "government",
        color: "#0f766e",
        value: safeNumber(breakdown.government?.totalDonations ?? sourceStats.government),
      },
      {
        label: "Internal",
        key: "internal",
        color: "#334155",
        value: safeNumber(breakdown.internal?.totalDonations ?? sourceStats.internal),
      },
    ];
  }, [donationActivity, sourceStats]);

  const maxSourceValue = useMemo(() => {
    return Math.max(...sourceRows.map((item) => safeNumber(item.value)), 1);
  }, [sourceRows]);

  const sourceMixChart = useMemo(() => {
    return {
      labels: sourceRows.map((item) => item.label),
      datasets: [
        {
          label: "Donation Records",
          data: sourceRows.map((item) => item.value),
          backgroundColor: sourceRows.map((item) => item.color),
          borderRadius: 10,
          borderSkipped: false,
          maxBarThickness: 52,
        },
      ],
    };
  }, [sourceRows]);

  const trendChart = useMemo(() => {
    return {
      labels: toArray(recentTrend).map((item) => item?._id || ""),
      datasets: [
        {
          label: "Donation Entries",
          data: toArray(recentTrend).map((item) => safeNumber(item?.count)),
          borderColor: "#15803d",
          backgroundColor: "rgba(21, 128, 61, 0.12)",
          fill: true,
          tension: 0.34,
          pointRadius: 3,
          pointHoverRadius: 5,
        },
      ],
    };
  }, [recentTrend]);

  const contributionRows = useMemo(() => {
    return [
      {
        label: "Goods Records",
        value: safeNumber(inventorySummary.goodsEntries),
        tone: "success",
        color: "#16a34a",
      },
      {
        label: "Monetary Records",
        value: safeNumber(inventorySummary.monetaryEntries),
        tone: "info",
        color: "#0f766e",
      },
    ];
  }, [inventorySummary]);

  const maxContributionValue = useMemo(() => {
    return Math.max(...contributionRows.map((item) => safeNumber(item.value)), 1);
  }, [contributionRows]);

  const contributionSplitChart = useMemo(() => {
    return {
      labels: contributionRows.map((item) => item.label),
      datasets: [
        {
          label: "Records",
          data: contributionRows.map((item) => item.value),
          backgroundColor: contributionRows.map((item) => item.color),
          borderRadius: 10,
          borderSkipped: false,
          maxBarThickness: 52,
        },
      ],
    };
  }, [contributionRows]);

  const topCategoryRows = useMemo(() => {
    return toArray(donationActivity.topDonatedCategories).slice(0, 5);
  }, [donationActivity]);

  const kpis = [
    {
      tone: "success",
      icon: <FaPeopleGroup />,
      label: "Named Donors",
      value: loading ? "—" : formatWhole(namedDonorCount),
      sub: "Rankable donor names only",
      urgent: namedDonorCount === 0 && safeNumber(inventorySummary.totalEntries) > 0,
    },
    {
      tone: "success",
      icon: <FaGift />,
      label: "Donation Records",
      value: loading ? "—" : formatWhole(inventorySummary.totalEntries),
      sub: "Goods and monetary entries",
    },
    {
      tone: "success",
      icon: <FaCoins />,
      label: "Monetary Value",
      value: loading ? "—" : formatCompactMoney(inventorySummary.totalMonetaryAmount),
      sub: "Total recorded funds",
    },
    {
      tone: "neutral",
      icon: <FaRepeat />,
      label: "Repeat Donors",
      value: loading ? "—" : formatWhole(repeatNamedDonors),
      sub: "Named donors with repeat support",
    },
  ];

  const healthCards = [
    {
      label: "This Week",
      value: formatWhole(donationActivity.donationsThisWeek),
      sub: "Donation records",
      tone: donationActivity.donationsThisWeek > 0 ? "success" : "warning",
      icon: <FaGift />,
    },
    {
      label: "Goods Units",
      value: formatWhole(inventorySummary.totalGoodsQuantity),
      sub: "Total donated goods",
      tone: inventorySummary.totalGoodsQuantity > 0 ? "success" : "warning",
      icon: <FaScaleBalanced />,
    },
    {
      label: "Total Money",
      value: formatCompactMoney(inventorySummary.totalMonetaryAmount),
      sub: "All monetary donations",
      tone: inventorySummary.totalMonetaryAmount > 0 ? "success" : "notice",
      icon: <FaCoins />,
    },
    {
      label: "Top Donor",
      value: largestMonetaryDonor ? formatCompactMoney(largestMonetaryDonor.totalAmount) : "—",
      sub: largestMonetaryDonor ? largestMonetaryDonor.name : "No named monetary donor",
      tone: largestMonetaryDonor ? "success" : "notice",
      icon: <FaRankingStar />,
    },
  ];

  return (
    <div className="donation-analytics donation-analytics-clean">
      <section className={`donation-single-alert ${donationStatus.tone}`}>
        <div className="donation-alert-left">
          <span className="donation-single-alert-icon">
            {donationStatus.tone === "success" ? <FaCircleCheck /> : <FaTriangleExclamation />}
          </span>

          <div>
            <div className="donation-single-alert-title">{donationStatus.title}</div>
            <div className="donation-single-alert-text">{donationStatus.text}</div>
          </div>
        </div>

        <div className="donation-header-actions">
          {refreshing && <span className="donation-refresh-pill">Refreshing</span>}
        </div>
      </section>

      <section className="donation-kpi-grid-clean">
        {kpis.map((item) => (
          <KpiCard key={item.label} {...item} />
        ))}
      </section>

      <section className="donation-main-grid-clean">
        <div className="a-card donation-ai-card donation-clean-card">
          <div className="donation-panel-head">
            <div>
              <div className="donation-panel-kicker">
                <FaWandMagicSparkles /> AI Donation Insights
              </div>
              <div className="donation-panel-title">Donor & Intake Summary</div>
            </div>

            <div className="donation-ai-meta">
              <span className={`donation-severity donation-severity--${donationAi.severity}`}>
                {titleCase(donationAi.severity)}
              </span>
              <span className="donation-source-badge">
                {donationAi.source === "gemini"
                  ? "Gemini AI"
                  : donationAi.source === "bedrock"
                  ? "AWS Bedrock"
                  : "Local AI Rules"}
              </span>
            </div>
          </div>

          <div className="donation-ai-summary">{donationAi.summary}</div>

          <div className="donation-action-list compact">
            <div className="donation-action-title">Priority Actions</div>

            {toArray(donationAi.priorityActions).length > 0 ? (
              <ul>
                {toArray(donationAi.priorityActions)
                  .slice(0, 3)
                  .map((item, index) => (
                    <li key={`don-priority-${index}`}>{item}</li>
                  ))}
              </ul>
            ) : (
              <div className="donation-inline-empty">No donation priority actions available.</div>
            )}
          </div>
        </div>

        <div className="a-card donation-health-card donation-clean-card">
          <div className="donation-panel-head">
            <div>
              <div className="donation-panel-kicker">
                <FaHandshake /> Donation Health
              </div>
              <div className="donation-panel-title">Contribution Snapshot</div>
            </div>

            <span className="donation-health-pill">
              {formatWhole(namedDonorCount)} named donors
            </span>
          </div>

          <div className="donation-health-compact-grid">
            {healthCards.map((item) => (
              <div key={item.label} className={`donation-health-compact-card ${item.tone}`}>
                <span className="donation-health-compact-icon">{item.icon}</span>

                <div>
                  <div className="donation-health-compact-label">{item.label}</div>
                  <div className="donation-health-compact-value">{item.value}</div>
                  <div className="donation-health-compact-sub">{item.sub}</div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </section>

      <section className="donation-graph-grid-clean">
        <div className="a-card a-chart-card donation-chart-card">
          <div className="a-card-head">
            <div>
              <div className="a-card-title">
                <FaChartColumn /> Donation Source Mix
              </div>
              <div className="donation-card-subtitle">
                Counts all sources, including confidential ones.
              </div>
            </div>
          </div>

          <div className="a-chart-body">
            <ChartOrEmpty
              chartData={sourceMixChart}
              message="Source distribution will appear once donations exist."
              element={<Bar data={sourceMixChart} options={commonChartOptions} />}
            />
          </div>

          <div className="donation-chart-value-list">
            {sourceRows.map((item) => (
              <div key={item.key} className="donation-chart-value-row">
                <span>{item.label}</span>

                <div className="donation-chart-value-track">
                  <span
                    className="donation-chart-value-fill"
                    style={{
                      width: `${Math.max(8, (item.value / maxSourceValue) * 100)}%`,
                      backgroundColor: item.color,
                    }}
                  />
                </div>

                <strong>{formatWhole(item.value)}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="a-card a-chart-card donation-chart-card">
          <div className="a-card-head">
            <div>
              <div className="a-card-title">
                <FaRepeat /> Donation Entry Trend
              </div>
              <div className="donation-card-subtitle">Recent donation records over time.</div>
            </div>
          </div>

          <div className="a-chart-body">
            <ChartOrEmpty
              chartData={trendChart}
              message="Donation trend will appear once recent records exist."
              element={<Line data={trendChart} options={commonChartOptions} />}
            />
          </div>

          <div className="donation-mini-summary">
            <span>This week</span>
            <strong>{formatWhole(donationActivity.donationsThisWeek)}</strong>
          </div>
        </div>

        <div className="a-card a-chart-card donation-chart-card">
          <div className="a-card-head">
            <div>
              <div className="a-card-title">
                <FaScaleBalanced /> Contribution Split
              </div>
              <div className="donation-card-subtitle">Goods vs monetary records.</div>
            </div>
          </div>

          <div className="a-chart-body">
            <ChartOrEmpty
              chartData={contributionSplitChart}
              message="Contribution split will appear once records exist."
              element={<Bar data={contributionSplitChart} options={commonChartOptions} />}
            />
          </div>

          <div className="donation-chart-value-list">
            {contributionRows.map((item) => (
              <div key={item.label} className={`donation-chart-value-row ${item.tone}`}>
                <span>{item.label}</span>

                <div className="donation-chart-value-track">
                  <span
                    className="donation-chart-value-fill"
                    style={{
                      width: `${Math.max(8, (safeNumber(item.value) / maxContributionValue) * 100)}%`,
                      backgroundColor: item.color,
                    }}
                  />
                </div>

                <strong>{formatWhole(item.value)}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="donation-ranking-grid">
        <LeaderboardCard
          title="Top Monetary Donors"
          subtitle="Named donors ranked by total monetary contribution."
          icon={<FaCoins />}
          donors={namedMonetaryDonors}
          type="monetary"
        />

        <LeaderboardCard
          title="Top Goods Donors"
          subtitle="Named donors ranked by total goods quantity."
          icon={<FaGift />}
          donors={namedGoodsDonors}
          type="goods"
        />

        <LeaderboardCard
          title="Most Consistent Donors"
          subtitle="Named donors ranked by repeated support."
          icon={<FaRepeat />}
          donors={namedFrequentDonors}
          type="frequent"
        />
      </section>

      <section className="a-card donation-signals-clean">
        <div className="a-card-head">
          <div>
            <div className="a-card-title">
              <FaWandMagicSparkles /> Key Donation Signals
            </div>
            <div className="donation-card-subtitle">
              Focused donor insights without repeating the KPI cards.
            </div>
          </div>
        </div>

        <div className="donation-signal-grid-clean">
          {donationAi.insights.map((item, index) => (
            <div
              key={`donation-insight-${index}`}
              className={`donation-insight-item donation-insight-item--${item.severity}`}
            >
              <div className="donation-insight-top">
                <span className="donation-insight-title">{item.title}</span>
                <span className={`donation-insight-badge donation-insight-badge--${item.severity}`}>
                  {titleCase(item.severity)}
                </span>
              </div>

              <div className="donation-insight-message">{item.message}</div>

              <div className="donation-insight-action">
                <strong>Action:</strong> {item.action}
              </div>
            </div>
          ))}
        </div>

        {topCategoryRows.length > 0 && (
          <div className="donation-category-strip">
            <div className="donation-category-strip-title">Top Donated Categories</div>

            <div className="donation-category-chip-list">
              {topCategoryRows.map((item, index) => (
                <div className="donation-category-chip" key={`top-category-${index}`}>
                  <span>{titleCase(item.category || "uncategorized")}</span>
                  <strong>{formatWhole(item.totalQuantity)}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
