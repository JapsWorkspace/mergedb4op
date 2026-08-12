import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

import {
  FaBoxesStacked,
  FaChartColumn,
  FaCircleCheck,
  FaCircleInfo,
  FaClockRotateLeft,
  FaLayerGroup,
  FaTriangleExclamation,
  FaWandMagicSparkles,
  FaWarehouse,
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

import { Bar } from "react-chartjs-2";

import "../css/InventoryAnalytics.css";
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
    <div className={`inv-kpi-card ${tone} ${urgent ? "urgent" : ""}`}>
      <div className="inv-kpi-top">
        <span className="inv-kpi-icon">{icon}</span>
        {urgent && <span className="inv-kpi-alert">!</span>}
      </div>

      <div className="inv-kpi-label">{label}</div>
      <div className="inv-kpi-value">{value}</div>
      <div className="inv-kpi-sub">{sub}</div>
    </div>
  );
}

export default function InventoryAnalytics() {
  const isMountedRef = useRef(true);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [inventorySummary, setInventorySummary] = useState({
    totalEntries: 0,
    goodsEntries: 0,
    monetaryEntries: 0,
    totalGoodsQuantity: 0,
    totalMonetaryAmount: 0,
    recentDonations: 0,
    expiredGoods: 0,
    expiringSoonGoods: 0,
    lowStockGoods: 0,
    outOfStockGoods: 0,
  });

  const [inventoryCategoryStats, setInventoryCategoryStats] = useState({});

  const [inventoryHealth, setInventoryHealth] = useState({
    activeItems: 0,
    activeGoods: 0,
    activeMonetary: 0,
    lowStockGoods: 0,
    outOfStockGoods: 0,
    expiredGoods: 0,
    expiringSoonGoods: 0,
    noExpiryGoods: 0,
    safeExpiryGoods: 0,
    archivedItems: 0,
    needsAttention: 0,
  });

  const [inventoryAi, setInventoryAi] = useState({
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

  const fetchInventoryAnalytics = useCallback(async (backgroundRefresh = false) => {
    isMountedRef.current = true;

    if (backgroundRefresh) {
      setRefreshing(true);
    }

    try {
      const [summaryRes, categoryRes, healthRes, aiRes] = await Promise.allSettled([
        axios.get(`${BASE_URL}/api/inventory/analytics/summary`, {
          withCredentials: true,
        }),
        axios.get(`${BASE_URL}/api/inventory/analytics/category-stats`, {
          withCredentials: true,
        }),
        axios.get(`${BASE_URL}/api/inventory/analytics/health`, {
          withCredentials: true,
        }),
        axios.get(`${BASE_URL}/api/inventory/analytics/ai-insights`, {
          withCredentials: true,
        }),
      ]);

      if (!isMountedRef.current) return;

      if (summaryRes.status === "fulfilled") {
        const data = summaryRes.value?.data || {};

        setInventorySummary({
          totalEntries: safeNumber(data.totalEntries ?? data.totalActiveItems),
          goodsEntries: safeNumber(data.goodsEntries ?? data.totalGoodsItems),
          monetaryEntries: safeNumber(data.monetaryEntries ?? data.totalMonetaryItems),
          totalGoodsQuantity: safeNumber(data.totalGoodsQuantity),
          totalMonetaryAmount: safeNumber(data.totalMonetaryAmount),
          recentDonations: safeNumber(data.recentDonations ?? data.donationsThisWeek),
          expiredGoods: safeNumber(data.expiredGoods),
          expiringSoonGoods: safeNumber(data.expiringSoonGoods),
          lowStockGoods: safeNumber(data.lowStockGoods),
          outOfStockGoods: safeNumber(data.outOfStockGoods),
        });
      }

      if (categoryRes.status === "fulfilled") {
        setInventoryCategoryStats(categoryRes.value?.data || {});
      }

      if (healthRes.status === "fulfilled") {
        const data = healthRes.value?.data || {};

        setInventoryHealth({
          activeItems: safeNumber(data.activeItems),
          activeGoods: safeNumber(data.activeGoods),
          activeMonetary: safeNumber(data.activeMonetary),
          lowStockGoods: safeNumber(data.lowStockGoods),
          outOfStockGoods: safeNumber(data.outOfStockGoods),
          expiredGoods: safeNumber(data.expiredGoods),
          expiringSoonGoods: safeNumber(data.expiringSoonGoods),
          noExpiryGoods: safeNumber(data.noExpiryGoods),
          safeExpiryGoods: safeNumber(data.safeExpiryGoods),
          archivedItems: safeNumber(data.archivedItems),
          needsAttention: safeNumber(data.needsAttention),
        });
      }

      if (aiRes.status === "fulfilled") {
        const aiData = aiRes.value?.data || {};
        setInventoryAi(aiData);

        if (aiData?.summary) {
          setInventorySummary((prev) => ({
            ...prev,
            totalEntries: safeNumber(prev.totalEntries || aiData.summary.totalActiveItems),
            goodsEntries: safeNumber(prev.goodsEntries || aiData.summary.totalGoodsItems),
            monetaryEntries: safeNumber(prev.monetaryEntries || aiData.summary.totalMonetaryItems),
            totalMonetaryAmount: safeNumber(
              prev.totalMonetaryAmount || aiData.summary.totalMonetaryAmount
            ),
            recentDonations: safeNumber(prev.recentDonations || aiData.summary.donationsThisWeek),
            lowStockGoods: safeNumber(prev.lowStockGoods || aiData.summary.lowStockGoods),
            outOfStockGoods: safeNumber(prev.outOfStockGoods || aiData.summary.outOfStockGoods),
            expiredGoods: safeNumber(prev.expiredGoods || aiData.summary.expiredGoods),
            expiringSoonGoods: safeNumber(
              prev.expiringSoonGoods || aiData.summary.expiringSoonGoods
            ),
          }));
        }
      }
    } catch (error) {
      console.error("Inventory analytics fetch error:", error);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchInventoryAnalytics(false);

    const interval = setInterval(() => {
      fetchInventoryAnalytics(true);
    }, 60000);

    return () => clearInterval(interval);
  }, [fetchInventoryAnalytics]);

  const warningSummary = useMemo(() => {
    const issues = [];

    if (inventoryHealth.expiredGoods > 0) {
      issues.push(`${formatWhole(inventoryHealth.expiredGoods)} expired`);
    }

    if (inventoryHealth.expiringSoonGoods > 0) {
      issues.push(`${formatWhole(inventoryHealth.expiringSoonGoods)} expiring soon`);
    }

    if (inventoryHealth.lowStockGoods > 0) {
      issues.push(`${formatWhole(inventoryHealth.lowStockGoods)} low stock`);
    }

    if (inventoryHealth.outOfStockGoods > 0) {
      issues.push(`${formatWhole(inventoryHealth.outOfStockGoods)} out of stock`);
    }

    if (issues.length === 0) {
      return {
        tone: "success",
        title: "Inventory status is stable",
        text: "No urgent stock, expiry, or quantity warnings detected.",
      };
    }

    return {
      tone:
        inventoryHealth.expiredGoods > 0 || inventoryHealth.outOfStockGoods > 0
          ? "danger"
          : "warning",
      title: "Inventory needs attention",
      text: issues.join(" • "),
    };
  }, [inventoryHealth]);

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

  const inventoryCategoryRows = useMemo(() => {
    return Object.entries(inventoryCategoryStats || {})
      .map(([category, quantity]) => ({
        category: category || "Uncategorized",
        quantity: safeNumber(quantity),
      }))
      .sort((a, b) => b.quantity - a.quantity);
  }, [inventoryCategoryStats]);

  const maxCategoryQuantity = useMemo(() => {
    return Math.max(...inventoryCategoryRows.map((item) => item.quantity), 1);
  }, [inventoryCategoryRows]);

  const inventoryCategoryChart = useMemo(() => {
    return {
      labels: inventoryCategoryRows.map((item) => titleCase(item.category)),
      datasets: [
        {
          label: "Quantity",
          data: inventoryCategoryRows.map((item) => item.quantity),
          backgroundColor: "#16a34a",
          borderRadius: 10,
          borderSkipped: false,
          maxBarThickness: 52,
        },
      ],
    };
  }, [inventoryCategoryRows]);

  const quantityHealthRows = useMemo(
    () => [
      {
        label: "Safe",
        value: inventoryHealth.safeExpiryGoods,
        tone: "success",
      },
      {
        label: "Low Stock",
        value: inventoryHealth.lowStockGoods,
        tone: "warning",
      },
      {
        label: "Out of Stock",
        value: inventoryHealth.outOfStockGoods,
        tone: "danger",
      },
    ],
    [inventoryHealth]
  );

  const expiryRows = useMemo(
    () => [
      {
        label: "Safe Expiry",
        value: inventoryHealth.safeExpiryGoods,
        tone: "success",
      },
      {
        label: "Expiring Soon",
        value: inventoryHealth.expiringSoonGoods,
        tone: "warning",
      },
      {
        label: "Expired",
        value: inventoryHealth.expiredGoods,
        tone: "danger",
      },
      {
        label: "No Expiry",
        value: inventoryHealth.noExpiryGoods,
        tone: "neutral",
      },
    ],
    [inventoryHealth]
  );

  const maxQuantityHealthValue = useMemo(() => {
    return Math.max(...quantityHealthRows.map((item) => safeNumber(item.value)), 1);
  }, [quantityHealthRows]);

  const maxExpiryValue = useMemo(() => {
    return Math.max(...expiryRows.map((item) => safeNumber(item.value)), 1);
  }, [expiryRows]);

  const quantityHealthChart = useMemo(() => {
    return {
      labels: quantityHealthRows.map((item) => item.label),
      datasets: [
        {
          label: "Items",
          data: quantityHealthRows.map((item) => safeNumber(item.value)),
          backgroundColor: ["#16a34a", "#f59e0b", "#dc2626"],
          borderRadius: 10,
          borderSkipped: false,
          maxBarThickness: 52,
        },
      ],
    };
  }, [quantityHealthRows]);

  const expiryChart = useMemo(() => {
    return {
      labels: expiryRows.map((item) => item.label),
      datasets: [
        {
          label: "Items",
          data: expiryRows.map((item) => safeNumber(item.value)),
          backgroundColor: ["#16a34a", "#eab308", "#dc2626", "#334155"],
          borderRadius: 10,
          borderSkipped: false,
          maxBarThickness: 52,
        },
      ],
    };
  }, [expiryRows]);

  const aiSeverityClass = getSeverityClass(inventoryAi.overallSeverity);

  const kpis = [
    {
      tone: "success",
      icon: <FaBoxesStacked />,
      label: "Goods Entries",
      value: loading ? "—" : formatWhole(inventorySummary.goodsEntries),
      sub: "Active goods records",
    },
    {
      tone: "success",
      icon: <FaWarehouse />,
      label: "Total Quantity",
      value: loading ? "—" : formatWhole(inventorySummary.totalGoodsQuantity),
      sub: "Available goods units",
    },
    {
      tone: inventoryHealth.needsAttention > 0 ? "warning" : "success",
      icon: <FaTriangleExclamation />,
      label: "Needs Attention",
      value: loading ? "—" : formatWhole(inventoryHealth.needsAttention),
      sub: "Combined inventory warnings",
      urgent: inventoryHealth.needsAttention > 0,
    },
    {
      tone: "neutral",
      icon: <FaLayerGroup />,
      label: "Archived Items",
      value: loading ? "—" : formatWhole(inventoryHealth.archivedItems),
      sub: "Not active inventory",
    },
  ];

  const compactHealthCards = [
    {
      label: "Low Stock",
      value: inventoryHealth.lowStockGoods,
      sub: "Below threshold",
      tone: inventoryHealth.lowStockGoods > 0 ? "warning" : "success",
      icon: <FaTriangleExclamation />,
    },
    {
      label: "Expiring Soon",
      value: inventoryHealth.expiringSoonGoods,
      sub: "Within 30 days",
      tone: inventoryHealth.expiringSoonGoods > 0 ? "warning" : "success",
      icon: <FaClockRotateLeft />,
    },
    {
      label: "Expired",
      value: inventoryHealth.expiredGoods,
      sub: "Needs removal",
      tone: inventoryHealth.expiredGoods > 0 ? "danger" : "success",
      icon: <FaTriangleExclamation />,
    },
    {
      label: "No Expiry",
      value: inventoryHealth.noExpiryGoods,
      sub: "Needs date review",
      tone: inventoryHealth.noExpiryGoods > 0 ? "notice" : "success",
      icon: <FaCircleInfo />,
    },
  ];

  const primaryInsights = toArray(inventoryAi.insights).slice(0, 4);

  return (
    <div className="inventory-analytics inventory-analytics-clean">
      <section className={`inventory-single-alert ${warningSummary.tone}`}>
        <div className="inventory-alert-left">
          <span className="inventory-single-alert-icon">
            {warningSummary.tone === "success" ? <FaCircleCheck /> : <FaTriangleExclamation />}
          </span>

          <div>
            <div className="inventory-single-alert-title">{warningSummary.title}</div>
            <div className="inventory-single-alert-text">{warningSummary.text}</div>
          </div>
        </div>

        <div className="inventory-header-actions">
          {refreshing && <span className="inventory-refresh-pill">Refreshing</span>}
        </div>
      </section>

      <section className="inventory-kpi-grid-clean">
        {kpis.map((item) => (
          <KpiCard key={item.label} {...item} />
        ))}
      </section>

      <section className="inventory-main-grid-clean">
        <div className="a-card inventory-ai-card inventory-clean-card">
          <div className="inventory-panel-head">
            <div>
              <div className="inventory-panel-kicker">
                <FaWandMagicSparkles /> AI Inventory Insights
              </div>
              <div className="inventory-panel-title">Stock Readiness Summary</div>
            </div>

            <div className="inventory-ai-meta">
              <span className={`inventory-severity inventory-severity--${aiSeverityClass}`}>
                {titleCase(inventoryAi.overallSeverity || "info")}
              </span>

              <span className="inventory-source-badge">
                {inventoryAi.aiAvailable ? "Gemini AI" : "Fallback"}
              </span>
            </div>
          </div>

          <div className="inventory-ai-summary">
            {inventoryAi.executiveSummary ||
              "AI summary will appear here once inventory analytics are available."}
          </div>

          <div className="inventory-action-list compact">
            <div className="inventory-action-title">Priority Actions</div>

            {toArray(inventoryAi.priorityActions).length > 0 ? (
              <ul>
                {toArray(inventoryAi.priorityActions)
                  .slice(0, 3)
                  .map((item, index) => (
                    <li key={`priority-${index}`}>{item}</li>
                  ))}
              </ul>
            ) : (
              <div className="inventory-inline-empty">No AI priority actions available yet.</div>
            )}
          </div>
        </div>

        <div className="a-card inventory-health-card inventory-clean-card">
          <div className="inventory-panel-head">
            <div>
              <div className="inventory-panel-kicker">
                <FaCircleCheck /> Inventory Health
              </div>
              <div className="inventory-panel-title">Readiness Snapshot</div>
            </div>

            <span className="inventory-health-pill">
              {formatWhole(inventoryHealth.needsAttention)} warnings
            </span>
          </div>

          <div className="inventory-health-compact-grid">
            {compactHealthCards.map((item) => (
              <div key={item.label} className={`inventory-health-compact-card ${item.tone}`}>
                <span className="inventory-health-compact-icon">{item.icon}</span>

                <div>
                  <div className="inventory-health-compact-label">{item.label}</div>
                  <div className="inventory-health-compact-value">{formatWhole(item.value)}</div>
                  <div className="inventory-health-compact-sub">{item.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="inventory-graph-grid-clean">
        <div className="a-card a-chart-card inventory-chart-card">
          <div className="a-card-head">
            <div>
              <div className="a-card-title">
                <FaChartColumn /> Inventory by Category
              </div>
              <div className="inventory-card-subtitle">Goods quantity by category.</div>
            </div>
          </div>

          <div className="a-chart-body">
            <ChartOrEmpty
              chartData={inventoryCategoryChart}
              message="Add inventory goods to see category distribution."
              element={<Bar data={inventoryCategoryChart} options={commonChartOptions} />}
            />
          </div>

          <div className="inventory-chart-value-list">
            {inventoryCategoryRows.slice(0, 5).map((item) => (
              <div key={item.category} className="inventory-chart-value-row">
                <span>{titleCase(item.category)}</span>

                <div className="inventory-chart-value-track">
                  <span
                    className="inventory-chart-value-fill"
                    style={{
                      width: `${Math.max(8, (item.quantity / maxCategoryQuantity) * 100)}%`,
                    }}
                  />
                </div>

                <strong>{formatWhole(item.quantity)}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="a-card a-chart-card inventory-chart-card">
          <div className="a-card-head">
            <div>
              <div className="a-card-title">
                <FaTriangleExclamation /> Stock Quantity Health
              </div>
              <div className="inventory-card-subtitle">
                Separates quantity risks from expiry risks.
              </div>
            </div>
          </div>

          <div className="a-chart-body">
            <ChartOrEmpty
              chartData={quantityHealthChart}
              message="Stock quantity health will appear when records exist."
              element={<Bar data={quantityHealthChart} options={commonChartOptions} />}
            />
          </div>

          <div className="inventory-health-value-list">
            {quantityHealthRows.map((item) => (
              <div key={item.label} className={`inventory-health-row ${item.tone}`}>
                <span>{item.label}</span>

                <div className="inventory-health-row-track">
                  <span
                    style={{
                      width: `${Math.max(
                        6,
                        (safeNumber(item.value) / maxQuantityHealthValue) * 100
                      )}%`,
                    }}
                  />
                </div>

                <strong>{formatWhole(item.value)}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="a-card a-chart-card inventory-chart-card">
          <div className="a-card-head">
            <div>
              <div className="a-card-title">
                <FaClockRotateLeft /> Expiry Status
              </div>
              <div className="inventory-card-subtitle">Separate expiry risk monitoring.</div>
            </div>
          </div>

          <div className="a-chart-body">
            <ChartOrEmpty
              chartData={expiryChart}
              message="Expiry analytics will appear once goods have expiry data."
              element={<Bar data={expiryChart} options={commonChartOptions} />}
            />
          </div>

          <div className="inventory-health-value-list">
            {expiryRows.map((item) => (
              <div key={item.label} className={`inventory-health-row ${item.tone}`}>
                <span>{item.label}</span>

                <div className="inventory-health-row-track">
                  <span
                    style={{
                      width: `${Math.max(6, (safeNumber(item.value) / maxExpiryValue) * 100)}%`,
                    }}
                  />
                </div>

                <strong>{formatWhole(item.value)}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="a-card inventory-signals-clean">
        <div className="a-card-head">
          <div>
            <div className="a-card-title">
              <FaWandMagicSparkles /> Key Inventory Signals
            </div>
            <div className="inventory-card-subtitle">
              Limited to the most important recommendations to avoid clutter.
            </div>
          </div>
        </div>

        {primaryInsights.length > 0 ? (
          <div className="inventory-signal-grid-clean">
            {primaryInsights.map((item, index) => (
              <div
                key={`detail-insight-${index}`}
                className={`inventory-insight-item inventory-insight-item--${getSeverityClass(
                  item?.severity
                )}`}
              >
                <div className="inventory-insight-top">
                  <span className="inventory-insight-title">{item?.title || "Insight"}</span>

                  <span
                    className={`inventory-insight-badge inventory-insight-badge--${getSeverityClass(
                      item?.severity
                    )}`}
                  >
                    {titleCase(item?.severity || "info")}
                  </span>
                </div>

                <div className="inventory-insight-message">
                  {item?.message || "No insight message available."}
                </div>

                <div className="inventory-insight-action">
                  <strong>Action:</strong> {item?.action || "Review this area."}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="analytics-empty-state">
            <div className="analytics-empty-state-title">No AI insights yet</div>
            <div className="analytics-empty-state-copy">
              Inventory intelligence will appear here once data is available.
            </div>
          </div>
        )}
      </section>
    </div>
  );
}