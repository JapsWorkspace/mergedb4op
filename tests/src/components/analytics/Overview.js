import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

import {
  FaBoxesStacked,
  FaCircleCheck,
  FaClockRotateLeft,
  FaHandHoldingHeart,
  FaHouseFloodWater,
  FaMoneyBillWave,
  FaPeopleRoof,
  FaShieldHalved,
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
  Tooltip as ChartTooltip,
  Legend,
} from "chart.js";

import { Bar, Doughnut, Line } from "react-chartjs-2";

import "../css/Overview.css";
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

function formatMoney(value) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(safeNumber(value));
}

function formatDateTime(value) {
  if (!value) return "Not synced yet";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not synced yet";

  return date.toLocaleString("en-PH", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function getRiskTone(score) {
  if (score >= 80) return "success";
  if (score >= 55) return "warning";
  return "danger";
}

function getRiskLabel(score) {
  if (score >= 80) return "Stable";
  if (score >= 55) return "Needs Attention";
  return "Critical";
}

function getAiSeverityTone(severity) {
  const value = String(severity || "").toLowerCase();
  if (value === "critical") return "danger";
  if (value === "warning") return "warning";
  if (value === "notice" || value === "info") return "notice";
  return "success";
}

function getPriorityModuleLabel(type = "", title = "", message = "") {
  const source = `${type} ${title} ${message}`.toLowerCase();
  if (source.includes("inventory") || source.includes("stock") || source.includes("expiry")) {
    return "Inventory";
  }
  if (source.includes("donation")) return "Donations";
  if (source.includes("relief") || source.includes("pack") || source.includes("receipt")) {
    return "Relief";
  }
  if (source.includes("incident") || source.includes("verification")) return "Incident";
  if (source.includes("evac") || source.includes("capacity") || source.includes("occup")) {
    return "Evacuation";
  }
  return "Operations";
}

function getPriorityIcon(moduleLabel = "", tone = "notice") {
  if (moduleLabel === "Inventory") return <FaBoxesStacked />;
  if (moduleLabel === "Donations") return <FaHandHoldingHeart />;
  if (moduleLabel === "Relief") return <FaTruckFast />;
  if (moduleLabel === "Incident") return <FaShieldHalved />;
  if (moduleLabel === "Evacuation") return <FaHouseFloodWater />;
  if (tone === "danger" || tone === "warning") return <FaTriangleExclamation />;
  return <FaClockRotateLeft />;
}

function EmptyState({
  title = "No data yet",
  text = "Overview will update once analytics records are available.",
}) {
  return (
    <div className="overview-empty-state">
      <div className="overview-empty-title">{title}</div>
      <div className="overview-empty-copy">{text}</div>
    </div>
  );
}

function ChartOrEmpty({ chartData, element, title, text }) {
  if (!hasChartValues(chartData)) {
    return <EmptyState title={title} text={text} />;
  }

  return element;
}

function KpiCard({ tone = "info", icon, label, value, sub, urgent }) {
  return (
    <div className={`overview-kpi-card ${tone} ${urgent ? "urgent" : ""}`}>
      <div className="overview-kpi-top">
        <span className="overview-kpi-icon">{icon}</span>
        {urgent ? <span className="overview-kpi-alert">!</span> : null}
      </div>

      <div className="overview-kpi-label">{label}</div>
      <div className="overview-kpi-value">{value}</div>
      <div className="overview-kpi-sub">{sub}</div>
    </div>
  );
}

function PriorityItem({ item }) {
  return (
    <div className={`overview-priority-item ${item.tone}`}>
      <div className="overview-priority-icon">{item.icon}</div>

      <div className="overview-priority-main">
        <div className="overview-priority-title">{item.title}</div>
        <div className="overview-priority-text">{item.text}</div>
      </div>

      <div className="overview-priority-badge">{item.badge}</div>
    </div>
  );
}

function ModuleHealthCard({ item }) {
  return (
    <div className={`overview-module-card ${item.tone}`}>
      <div className="overview-module-head">
        <div className="overview-module-icon">{item.icon}</div>
        <span className="overview-module-status">{item.status}</span>
      </div>

      <div className="overview-module-title">{item.title}</div>
      <div className="overview-module-score">{item.score}%</div>
      <div className="overview-module-copy">{item.copy}</div>

      <div className="overview-module-bar">
        <span style={{ width: `${Math.min(Math.max(item.score, 0), 100)}%` }} />
      </div>
    </div>
  );
}

export default function Overview() {
  const isMountedRef = useRef(true);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [inventorySummary, setInventorySummary] = useState({});
  const [inventoryHealth, setInventoryHealth] = useState({});
  const [donationActivity, setDonationActivity] = useState({});
  const [reliefOverview, setReliefOverview] = useState({});
  const [incidentOverview, setIncidentOverview] = useState({});
  const [evacOverview, setEvacOverview] = useState({});
  const [overviewAi, setOverviewAi] = useState(null);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchOverview = useCallback(async (backgroundRefresh = false) => {
    if (backgroundRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [
        inventorySummaryRes,
        inventoryHealthRes,
        donationActivityRes,
        reliefOverviewRes,
        incidentOverviewRes,
        evacOverviewRes,
        overviewAiRes,
      ] = await Promise.allSettled([
        axios.get(`${BASE_URL}/api/inventory/analytics/summary`, {
          withCredentials: true,
        }),
        axios.get(`${BASE_URL}/api/inventory/analytics/health`, {
          withCredentials: true,
        }),
        axios.get(`${BASE_URL}/api/inventory/analytics/donation-activity`, {
          withCredentials: true,
        }),
        axios.get(`${BASE_URL}/api/relief-analytics/overview`, {
          withCredentials: true,
        }),
        axios.get(`${BASE_URL}/api/incident-analytics/overview`, {
          withCredentials: true,
        }),
        axios.get(`${BASE_URL}/api/evac-analytics/overview`, {
          withCredentials: true,
        }),
        axios.get(`${BASE_URL}/api/overview-analytics/ai-insights`, {
          withCredentials: true,
        }),
      ]);

      if (!isMountedRef.current) return;

      if (inventorySummaryRes.status === "fulfilled") {
        setInventorySummary(inventorySummaryRes.value?.data || {});
      }

      if (inventoryHealthRes.status === "fulfilled") {
        setInventoryHealth(inventoryHealthRes.value?.data || {});
      }

      if (donationActivityRes.status === "fulfilled") {
        setDonationActivity(donationActivityRes.value?.data || {});
      }

      if (reliefOverviewRes.status === "fulfilled") {
        setReliefOverview(reliefOverviewRes.value?.data || {});
      }

      if (incidentOverviewRes.status === "fulfilled") {
        setIncidentOverview(incidentOverviewRes.value?.data || {});
      }

      if (evacOverviewRes.status === "fulfilled") {
        setEvacOverview(evacOverviewRes.value?.data || {});
      }

      if (overviewAiRes.status === "fulfilled") {
        setOverviewAi(overviewAiRes.value?.data || null);
      }

      setLastUpdated(new Date().toISOString());
    } catch (error) {
      console.error("Overview analytics fetch error:", error);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchOverview(false);

    const interval = setInterval(() => {
      fetchOverview(true);
    }, 60000);

    return () => clearInterval(interval);
  }, [fetchOverview]);

  const reliefSummary = reliefOverview?.summary || {};
  const reliefReleaseSummary = reliefOverview?.releaseSummary || {};
  const incidentSummary = incidentOverview?.summary || {};
  const evacSummary = evacOverview?.summary || {};

  const inventoryIssues = useMemo(() => {
    return (
      safeNumber(inventoryHealth.expiredGoods) +
      safeNumber(inventoryHealth.expiringSoonGoods) +
      safeNumber(inventoryHealth.lowStockGoods) +
      safeNumber(inventoryHealth.outOfStockGoods)
    );
  }, [inventoryHealth]);

  const reliefBottlenecks = useMemo(() => {
    return (
      safeNumber(reliefSummary.pendingRequests) +
      safeNumber(reliefSummary.approvedRequests) +
      safeNumber(reliefReleaseSummary.pendingReceipt) +
      safeNumber(reliefSummary.legacyPartialRequests)
    );
  }, [reliefSummary, reliefReleaseSummary]);

  const reliefFoodPackGap = useMemo(() => {
    const requested = safeNumber(reliefSummary.totalRequestedFoodPacks);
    const released = safeNumber(reliefReleaseSummary.totalFoodPacksReleased);

    return Math.max(requested - released, 0);
  }, [reliefSummary, reliefReleaseSummary]);

  const incidentIssues = useMemo(() => {
    return (
      safeNumber(incidentSummary.unresolvedIncidents) +
      safeNumber(incidentSummary.verificationPending)
    );
  }, [incidentSummary]);

  const evacIssues = useMemo(() => {
    return safeNumber(evacSummary.limitedPlaces) + safeNumber(evacSummary.fullPlaces);
  }, [evacSummary]);

  const goodsDonationQuantityThisMonth = safeNumber(
    donationActivity.goodsQuantityThisMonth ?? donationActivity.thisMonth?.goodsQuantity ?? 0
  );

  const goodsDonationRecordsThisMonth = safeNumber(
    donationActivity.thisMonth?.goodsDonations ?? donationActivity.goodsDonationsThisMonth ?? 0
  );

  const monetaryDonationAmountThisMonth = safeNumber(
    donationActivity.monetaryThisMonth ?? donationActivity.thisMonth?.monetaryAmount ?? 0
  );

  const monetaryDonationRecordsThisMonth = safeNumber(
    donationActivity.thisMonth?.monetaryDonations ??
      donationActivity.monetaryDonationsThisMonth ??
      0
  );

  const readinessScores = useMemo(() => {
    const inventoryScore = Math.max(0, 100 - inventoryIssues * 8);

    const reliefPenalty =
      safeNumber(reliefSummary.approvedRequests) * 18 +
      safeNumber(reliefReleaseSummary.pendingReceipt) * 8 +
      safeNumber(reliefSummary.pendingRequests) * 6 +
      safeNumber(reliefSummary.legacyPartialRequests) * 10;

    const reliefScore = Math.max(0, 100 - reliefPenalty);

    const incidentScore = Math.max(0, 100 - incidentIssues * 7);
    const evacScore = Math.max(0, 100 - evacIssues * 10);

    const donationScore =
      goodsDonationQuantityThisMonth > 0 || monetaryDonationAmountThisMonth > 0 ? 100 : 65;

    const overallScore = Math.round(
      (inventoryScore + reliefScore + incidentScore + evacScore + donationScore) / 5
    );

    return {
      inventory: Math.round(inventoryScore),
      donations: Math.round(donationScore),
      relief: Math.round(reliefScore),
      incidents: Math.round(incidentScore),
      evacuation: Math.round(evacScore),
      overall: overallScore,
    };
  }, [
    inventoryIssues,
    reliefSummary,
    reliefReleaseSummary,
    incidentIssues,
    evacIssues,
    goodsDonationQuantityThisMonth,
    monetaryDonationAmountThisMonth,
  ]);

  const overallTone = getRiskTone(readinessScores.overall);
  const overallLabel = getRiskLabel(readinessScores.overall);

  const kpis = useMemo(() => {
    const activeInventory = safeNumber(
      inventoryHealth.activeItems ??
        inventorySummary.totalEntries ??
        inventorySummary.totalActiveItems
    );

    const totalMoney = safeNumber(inventorySummary.totalMonetaryAmount);

    const pendingRelief = safeNumber(reliefSummary.pendingRequests);
    const approvedRelief = safeNumber(reliefSummary.approvedRequests);

    const activeIncidents = safeNumber(
      incidentSummary.unresolvedIncidents ??
        safeNumber(incidentSummary.reportedIncidents) +
          safeNumber(incidentSummary.onProcessIncidents)
    );

    const availableEvacs = safeNumber(evacSummary.availablePlaces);
    const totalEvacs = safeNumber(evacSummary.totalPlaces);

    return [
      {
        tone: inventoryIssues > 0 ? "warning" : "success",
        icon: <FaBoxesStacked />,
        label: "Inventory Watch",
        value: loading ? "—" : formatWhole(activeInventory),
        sub:
          inventoryIssues > 0
            ? `${formatWhole(inventoryIssues)} item warnings`
            : `${formatMoney(totalMoney)} monetary stock`,
        urgent:
          safeNumber(inventoryHealth.expiredGoods) > 0 ||
          safeNumber(inventoryHealth.outOfStockGoods) > 0,
      },
      {
        tone: "success",
        icon: <FaHandHoldingHeart />,
        label: "Goods Donations",
        value: loading ? "—" : formatWhole(goodsDonationQuantityThisMonth),
        sub: `${formatWhole(goodsDonationRecordsThisMonth)} goods donation records this month`,
      },
      {
        tone: monetaryDonationAmountThisMonth > 0 ? "success" : "notice",
        icon: <FaMoneyBillWave />,
        label: "Monetary Donations",
        value: loading ? "—" : formatMoney(monetaryDonationAmountThisMonth),
        sub: `${formatWhole(
          monetaryDonationRecordsThisMonth
        )} monetary donation records this month`,
      },
      {
        tone: approvedRelief > 0 || pendingRelief > 0 ? "warning" : "success",
        icon: <FaTruckFast />,
        label: "Relief Queue",
        value: loading ? "—" : formatWhole(pendingRelief + approvedRelief),
        sub: `${formatWhole(approvedRelief)} approved waiting release`,
        urgent: approvedRelief > 0,
      },
      {
        tone: activeIncidents > 0 ? "warning" : "success",
        icon: <FaShieldHalved />,
        label: "Active Incidents",
        value: loading ? "—" : formatWhole(activeIncidents),
        sub: `${formatWhole(safeNumber(incidentSummary.verificationPending))} pending verification`,
        urgent: activeIncidents > 0,
      },
      {
        tone: evacIssues > 0 ? "warning" : "success",
        icon: <FaHouseFloodWater />,
        label: "Evac Readiness",
        value: loading ? "—" : `${formatWhole(availableEvacs)}/${formatWhole(totalEvacs)}`,
        sub: `${formatWhole(evacIssues)} limited or full`,
        urgent: safeNumber(evacSummary.fullPlaces) > 0,
      },
    ];
  }, [
    loading,
    inventoryHealth,
    inventorySummary,
    reliefSummary,
    incidentSummary,
    evacSummary,
    inventoryIssues,
    evacIssues,
    goodsDonationQuantityThisMonth,
    goodsDonationRecordsThisMonth,
    monetaryDonationAmountThisMonth,
    monetaryDonationRecordsThisMonth,
  ]);

  const localPriorityItems = useMemo(() => {
    const items = [];

    if (safeNumber(inventoryHealth.expiredGoods) > 0) {
      items.push({
        tone: "danger",
        icon: <FaTriangleExclamation />,
        title: "Remove expired goods from active stock",
        text: `${formatWhole(inventoryHealth.expiredGoods)} expired goods need immediate review.`,
        badge: "Inventory",
        weight: 100,
      });
    }

    if (safeNumber(inventoryHealth.outOfStockGoods) > 0) {
      items.push({
        tone: "danger",
        icon: <FaTriangleExclamation />,
        title: "Restock unavailable goods",
        text: `${formatWhole(inventoryHealth.outOfStockGoods)} goods are currently out of stock.`,
        badge: "Inventory",
        weight: 95,
      });
    }

    if (safeNumber(evacSummary.fullPlaces) > 0) {
      items.push({
        tone: "danger",
        icon: <FaPeopleRoof />,
        title: "Check full evacuation centers",
        text: `${formatWhole(evacSummary.fullPlaces)} evacuation place is marked full.`,
        badge: "Evacuation",
        weight: 92,
      });
    }

    if (safeNumber(reliefSummary.approvedRequests) > 0) {
      items.push({
        tone: "warning",
        icon: <FaTruckFast />,
        title: "Prepare approved relief releases",
        text: `${formatWhole(reliefSummary.approvedRequests)} approved request needs release action.`,
        badge: "Relief",
        weight: 90,
      });
    }

    if (safeNumber(incidentSummary.unresolvedIncidents) > 0) {
      items.push({
        tone: "warning",
        icon: <FaShieldHalved />,
        title: "Resolve active incident reports",
        text: `${formatWhole(incidentSummary.unresolvedIncidents)} incident report needs follow-up.`,
        badge: "Incident",
        weight: 85,
      });
    }

    if (safeNumber(reliefReleaseSummary.pendingReceipt) > 0) {
      items.push({
        tone: "notice",
        icon: <FaClockRotateLeft />,
        title: "Follow up barangay receipt confirmation",
        text: `${formatWhole(reliefReleaseSummary.pendingReceipt)} release record is awaiting receipt.`,
        badge: "Relief",
        weight: 80,
      });
    }

    if (safeNumber(incidentSummary.verificationPending) > 0) {
      items.push({
        tone: "notice",
        icon: <FaClockRotateLeft />,
        title: "Review pending incident verification",
        text: `${formatWhole(incidentSummary.verificationPending)} report evidence needs validation.`,
        badge: "Incident",
        weight: 75,
      });
    }

    if (safeNumber(evacSummary.limitedPlaces) > 0) {
      items.push({
        tone: "warning",
        icon: <FaHouseFloodWater />,
        title: "Monitor limited evacuation capacity",
        text: `${formatWhole(evacSummary.limitedPlaces)} evacuation place has limited capacity.`,
        badge: "Evacuation",
        weight: 70,
      });
    }

    if (safeNumber(inventoryHealth.lowStockGoods) > 0) {
      items.push({
        tone: "warning",
        icon: <FaBoxesStacked />,
        title: "Monitor low stock goods",
        text: `${formatWhole(inventoryHealth.lowStockGoods)} goods are below preferred quantity.`,
        badge: "Inventory",
        weight: 65,
      });
    }

    if (reliefFoodPackGap > 0) {
      items.push({
        tone: "notice",
        icon: <FaTruckFast />,
        title: "Review food pack coverage",
        text: `${formatWhole(reliefFoodPackGap)} requested food packs still need coverage.`,
        badge: "Relief",
        weight: 60,
      });
    }

    return items.sort((a, b) => b.weight - a.weight).slice(0, 5);
  }, [inventoryHealth, reliefSummary, reliefReleaseSummary, incidentSummary, evacSummary, reliefFoodPackGap]);

  const priorityItems = useMemo(() => {
    const aiInsights = Array.isArray(overviewAi?.insights) ? overviewAi.insights : [];

    if (aiInsights.length > 0) {
      return aiInsights.slice(0, 5).map((insight, index) => {
        const tone = getAiSeverityTone(insight?.severity);
        const title = String(insight?.title || "").trim() || `Priority ${index + 1}`;
        const text =
          String(insight?.message || "").trim() ||
          String(insight?.action || "").trim() ||
          "Review this priority item.";
        const badge = getPriorityModuleLabel(insight?.type, title, text);

        return {
          tone,
          icon: getPriorityIcon(badge, tone),
          title,
          text,
          badge,
          weight: 100 - index,
        };
      });
    }

    return localPriorityItems;
  }, [overviewAi, localPriorityItems]);

  const moduleHealth = useMemo(() => {
    return [
      {
        title: "Inventory",
        icon: <FaBoxesStacked />,
        score: readinessScores.inventory,
        tone: getRiskTone(readinessScores.inventory),
        status: getRiskLabel(readinessScores.inventory),
        copy:
          inventoryIssues > 0
            ? `${formatWhole(inventoryIssues)} stock or expiry issue detected.`
            : "Stock and expiry indicators look stable.",
      },
      {
        title: "Donations",
        icon: <FaHandHoldingHeart />,
        score: readinessScores.donations,
        tone: getRiskTone(readinessScores.donations),
        status: getRiskLabel(readinessScores.donations),
        copy:
          readinessScores.donations >= 80
            ? "Goods or monetary donation activity is present this month."
            : "No strong donation activity detected this month.",
      },
      {
        title: "Relief",
        icon: <FaTruckFast />,
        score: readinessScores.relief,
        tone: getRiskTone(readinessScores.relief),
        status: getRiskLabel(readinessScores.relief),
        copy:
          reliefBottlenecks > 0
            ? `${formatWhole(reliefBottlenecks)} queue or receipt bottleneck. ${
                reliefFoodPackGap > 0
                  ? `${formatWhole(reliefFoodPackGap)} food packs still need coverage.`
                  : ""
              }`
            : reliefFoodPackGap > 0
            ? `${formatWhole(reliefFoodPackGap)} food packs need coverage, but queue status is stable.`
            : "No major relief bottleneck detected.",
      },
      {
        title: "Incidents",
        icon: <FaShieldHalved />,
        score: readinessScores.incidents,
        tone: getRiskTone(readinessScores.incidents),
        status: getRiskLabel(readinessScores.incidents),
        copy:
          incidentIssues > 0
            ? `${formatWhole(incidentIssues)} unresolved or pending verification item.`
            : "Incident monitoring looks stable.",
      },
      {
        title: "Evacuation",
        icon: <FaHouseFloodWater />,
        score: readinessScores.evacuation,
        tone: getRiskTone(readinessScores.evacuation),
        status: getRiskLabel(readinessScores.evacuation),
        copy:
          evacIssues > 0
            ? `${formatWhole(evacIssues)} limited or full evacuation place.`
            : "Evacuation capacity indicators look stable.",
      },
    ];
  }, [
    readinessScores,
    inventoryIssues,
    reliefBottlenecks,
    reliefFoodPackGap,
    incidentIssues,
    evacIssues,
  ]);

  const localFallbackAiInsight = useMemo(() => {
    const warnings = [];

    if (inventoryIssues > 0) {
      warnings.push(
        `Inventory has ${formatWhole(inventoryIssues)} stock or expiry warning${
          inventoryIssues === 1 ? "" : "s"
        }.`
      );
    }

    if (reliefBottlenecks > 0) {
      warnings.push(
        `Relief operations have ${formatWhole(reliefBottlenecks)} queue or receipt bottleneck${
          reliefBottlenecks === 1 ? "" : "s"
        }.`
      );
    }

    if (reliefFoodPackGap > 0) {
      warnings.push(`${formatWhole(reliefFoodPackGap)} requested food packs still need coverage.`);
    }

    if (incidentIssues > 0) {
      warnings.push(
        `Incident monitoring has ${formatWhole(
          incidentIssues
        )} unresolved or pending verification item${incidentIssues === 1 ? "" : "s"}.`
      );
    }

    if (evacIssues > 0) {
      warnings.push(
        `Evacuation readiness needs monitoring because ${formatWhole(evacIssues)} place${
          evacIssues === 1 ? " is" : "s are"
        } limited or full.`
      );
    }

    if (warnings.length === 0) {
      return {
        tone: "success",
        title: "AI Operations Insight",
        text:
          "Operations look stable across inventory, donations, relief, incidents, and evacuation readiness. Continue monitoring routine updates.",
        action: "Maintain regular validation and keep analytics updated.",
      };
    }

    return {
      tone:
        safeNumber(inventoryHealth.expiredGoods) > 0 ||
        safeNumber(inventoryHealth.outOfStockGoods) > 0 ||
        safeNumber(evacSummary.fullPlaces) > 0
          ? "danger"
          : "warning",
      title: "AI Operations Insight",
      text: warnings.slice(0, 3).join(" "),
      action:
        reliefBottlenecks > 0
          ? "Prioritize approved releases and receipt follow-ups before lower-risk items."
          : evacIssues > 0
          ? "Review evacuation capacity and update center status before public display."
          : inventoryIssues > 0
          ? "Review inventory warnings and separate expired or unavailable goods."
          : "Review the highlighted operational warnings.",
    };
  }, [
    inventoryIssues,
    reliefBottlenecks,
    reliefFoodPackGap,
    incidentIssues,
    evacIssues,
    inventoryHealth,
    evacSummary,
  ]);

  const aiOverviewInsight = useMemo(() => {
    if (!overviewAi || typeof overviewAi !== "object") {
      return localFallbackAiInsight;
    }

    const firstAction = Array.isArray(overviewAi.priorityActions)
      ? overviewAi.priorityActions.find((item) => String(item || "").trim())
      : "";

    return {
      tone: getAiSeverityTone(overviewAi.overallSeverity),
      title: overviewAi.aiAvailable ? "AI Operations Insight" : "Fallback Operations Insight",
      text:
        String(overviewAi.executiveSummary || "").trim() || localFallbackAiInsight.text,
      action:
        String(firstAction || "").trim() ||
        localFallbackAiInsight.action,
    };
  }, [overviewAi, localFallbackAiInsight]);

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
            precision: 0,
            callback: (value) => {
              return Number.isInteger(value) ? value : "";
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

  const doughnutOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#14532d",
            font: {
              size: 11,
              weight: "700",
            },
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

  const lineOptions = useMemo(() => {
    return {
      ...commonChartOptions,
      plugins: {
        ...commonChartOptions.plugins,
        legend: {
          display: true,
          position: "top",
          labels: {
            color: "#14532d",
            font: {
              size: 11,
              weight: "700",
            },
            usePointStyle: true,
            boxWidth: 8,
          },
        },
      },
    };
  }, [commonChartOptions]);

  const riskChart = useMemo(() => {
    return {
      labels: ["Inventory", "Relief", "Incidents", "Evacuation"],
      datasets: [
        {
          label: "Open Warnings",
          data: [inventoryIssues, reliefBottlenecks, incidentIssues, evacIssues],
          backgroundColor: ["#f59e0b", "#ca8a04", "#2563eb", "#16a34a"],
          borderRadius: 12,
          borderSkipped: false,
          maxBarThickness: 48,
        },
      ],
    };
  }, [inventoryIssues, reliefBottlenecks, incidentIssues, evacIssues]);

  const readinessChart = useMemo(() => {
    return {
      labels: ["Inventory", "Donations", "Relief", "Incidents", "Evacuation"],
      datasets: [
        {
          label: "Readiness",
          data: [
            readinessScores.inventory,
            readinessScores.donations,
            readinessScores.relief,
            readinessScores.incidents,
            readinessScores.evacuation,
          ],
          backgroundColor: ["#16a34a", "#22c55e", "#ca8a04", "#2563eb", "#0f766e"],
          borderWidth: 0,
        },
      ],
    };
  }, [readinessScores]);

  const trendChart = useMemo(() => {
    const reliefTrend = toArray(reliefOverview?.requestTrend);
    const incidentTrend = toArray(incidentOverview?.incidentTrend);
    const evacTrend = toArray(evacOverview?.activityTrend);

    const labels = Array.from(
      new Set([
        ...reliefTrend.map((item) => item.date || item._id),
        ...incidentTrend.map((item) => item.date || item._id),
        ...evacTrend.map((item) => item.date || item._id),
      ])
    ).slice(-7);

    const buildData = (rows) =>
      labels.map((label) => {
        const found = rows.find((item) => String(item.date || item._id) === String(label));
        return safeNumber(found?.count);
      });

    const readableLabels = labels.map((label) => {
      if (!label) return "—";
      const date = new Date(label);
      if (Number.isNaN(date.getTime())) return String(label);

      return date.toLocaleDateString("en-PH", {
        month: "short",
        day: "2-digit",
      });
    });

    return {
      labels: readableLabels,
      datasets: [
        {
          label: "Relief Requests",
          data: buildData(reliefTrend),
          borderColor: "#16a34a",
          backgroundColor: "rgba(22, 163, 74, 0.12)",
          pointBackgroundColor: "#16a34a",
          pointRadius: 4,
          tension: 0.35,
        },
        {
          label: "Incidents",
          data: buildData(incidentTrend),
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.12)",
          pointBackgroundColor: "#2563eb",
          pointRadius: 4,
          tension: 0.35,
        },
        {
          label: "Evac Activity",
          data: buildData(evacTrend),
          borderColor: "#ca8a04",
          backgroundColor: "rgba(202, 138, 4, 0.12)",
          pointBackgroundColor: "#ca8a04",
          pointRadius: 4,
          tension: 0.35,
        },
      ],
    };
  }, [reliefOverview, incidentOverview, evacOverview]);

  return (
    <div className="overview-analytics">
      <section className="overview-command-card">
        <div className="overview-command-main">
          <div className={`overview-score-ring ${overallTone}`}>
            <span>{loading ? "—" : readinessScores.overall}</span>
            <small>Score</small>
          </div>

          <div>
            <div className="overview-eyebrow">
              <FaWandMagicSparkles />
              Command Summary
            </div>

            <h3 className="overview-command-title">
              Operations are currently{" "}
              <span className={`overview-command-status ${overallTone}`}>
                {loading ? "loading" : overallLabel}
              </span>
            </h3>

            <div className="overview-sync-line">
              <FaClockRotateLeft />
              {refreshing ? "Refreshing overview..." : `Last updated: ${formatDateTime(lastUpdated)}`}
            </div>
          </div>
        </div>

        <div className={`overview-command-badge ${overallTone}`}>
          {overallTone === "success" ? <FaCircleCheck /> : <FaTriangleExclamation />}
          {loading ? "Loading" : overallLabel}
        </div>
      </section>

      <section className={`overview-ai-card ${aiOverviewInsight.tone}`}>
        <div className="overview-ai-icon">
          <FaWandMagicSparkles />
        </div>

        <div className="overview-ai-main">
          <div className="overview-ai-title">{aiOverviewInsight.title}</div>
          <div className="overview-ai-text">{aiOverviewInsight.text}</div>
          <div className="overview-ai-action">
            <strong>Recommended action:</strong> {aiOverviewInsight.action}
          </div>
        </div>
      </section>

      <section className="overview-kpi-grid">
        {kpis.map((item) => (
          <KpiCard
            key={item.label}
            tone={item.tone}
            icon={item.icon}
            label={item.label}
            value={item.value}
            sub={item.sub}
            urgent={item.urgent}
          />
        ))}
      </section>

      <section className="overview-layout">
        <div className="overview-left-column">
          <div className="overview-panel overview-priority-panel">
            <div className="overview-panel-head">
              <div>
                <div className="overview-panel-title">
                  <FaTriangleExclamation />
                  Priority Queue
                </div>
                <div className="overview-panel-subtitle">
                  Highest cross-module items that need attention first.
                </div>
              </div>
            </div>

            {priorityItems.length > 0 ? (
              <div className="overview-priority-list">
                {priorityItems.map((item, index) => (
                  <PriorityItem key={`${item.title}-${index}`} item={item} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No urgent priority detected"
                text="The system did not detect major stock, relief, incident, or evacuation warnings."
              />
            )}
          </div>

          <div className="overview-panel">
            <div className="overview-panel-head">
              <div>
                <div className="overview-panel-title">
                  <FaShieldHalved />
                  Module Health
                </div>
                <div className="overview-panel-subtitle">
                  Compact readiness check per operations area.
                </div>
              </div>
            </div>

            <div className="overview-module-grid">
              {moduleHealth.map((item) => (
                <ModuleHealthCard key={item.title} item={item} />
              ))}
            </div>
          </div>
        </div>

        <div className="overview-right-column">
          <div className="overview-panel overview-chart-panel">
            <div className="overview-panel-head">
              <div>
                <div className="overview-panel-title">
                  <FaTriangleExclamation />
                  Warning Load
                </div>
                <div className="overview-panel-subtitle">
                  Open issues grouped by major module.
                </div>
              </div>
            </div>

            <div className="overview-chart-box">
              <ChartOrEmpty
                chartData={riskChart}
                element={<Bar data={riskChart} options={commonChartOptions} />}
                title="No warning load"
                text="Warnings will appear here once there are active issues."
              />
            </div>
          </div>

          <div className="overview-panel overview-chart-panel">
            <div className="overview-panel-head">
              <div>
                <div className="overview-panel-title">
                  <FaCircleCheck />
                  Readiness Mix
                </div>
                <div className="overview-panel-subtitle">
                  Relative readiness score across modules.
                </div>
              </div>
            </div>

            <div className="overview-chart-box overview-chart-box--doughnut">
              <ChartOrEmpty
                chartData={readinessChart}
                element={<Doughnut data={readinessChart} options={doughnutOptions} />}
                title="No readiness data"
                text="Readiness data will appear once analytics endpoints return values."
              />
            </div>
          </div>
        </div>
      </section>

      <section className="overview-panel overview-wide-chart">
        <div className="overview-panel-head">
          <div>
            <div className="overview-panel-title">
              <FaClockRotateLeft />
              Recent Operations Movement
            </div>
            <div className="overview-panel-subtitle">
              Relief requests, incident reports, and evacuation activity in one compact trend.
            </div>
          </div>
        </div>

        <div className="overview-chart-box overview-chart-box--wide">
          <ChartOrEmpty
            chartData={trendChart}
            element={<Line data={trendChart} options={lineOptions} />}
            title="No recent movement"
            text="Trends will appear when relief, incident, or evacuation activity is available."
          />
        </div>
      </section>
    </div>
  );
}
