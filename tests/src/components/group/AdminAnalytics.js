import { useEffect, useMemo, useState } from "react";
import { FaFilePdf } from "react-icons/fa6";

import DashboardShell from "../layout/DashboardShell";

import Overview from "../analytics/Overview";
import InventoryAnalytics from "../analytics/InventoryAnalytics";
import DonationAnalytics from "../analytics/DonationAnalytics";
import ReliefAnalytics from "../analytics/ReliefAnalytics";
import IncidentAnalytics from "../analytics/IncidentAnalytics";
import EvacuationAnalytics from "../analytics/EvacuationAnalytics";

import "../css/AdminAnalytics.css";
import {
  getAnalyticsPageTitle,
  getAnalyticsTabsForRole,
  normalizeRole,
} from "../auth/roleAccessUtils";

const BASE_URL = process.env.REACT_APP_API_URL || "https://gaganadapat.onrender.com";

export default function AdminAnalytics() {
  const role = normalizeRole(localStorage.getItem("role"));
  const tabs = useMemo(() => getAnalyticsTabsForRole(role), [role]);
  const [activeTab, setActiveTab] = useState(tabs[0]?.key || "overview");
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    if (!tabs.some((tab) => tab.key === activeTab)) {
      setActiveTab(tabs[0]?.key || "overview");
    }
  }, [activeTab, tabs]);

  const exportConfig = useMemo(
    () => ({
      inventory: {
        url: `${BASE_URL}/api/inventory/export-pdf?reportType=inventory_analytics`,
      },
      donations: {
        url: `${BASE_URL}/api/inventory/export-pdf?reportType=donation_analytics`,
      },
      relief: {
        url: `${BASE_URL}/api/relief-analytics/export-pdf`,
      },
      incidents: {
        url: `${BASE_URL}/api/incident-analytics/export-pdf`,
      },
      evacuation: {
        url: `${BASE_URL}/api/evac-analytics/export-pdf`,
      },
    }),
    []
  );

  const activeTabMeta = tabs.find((tab) => tab.key === activeTab) || tabs[0];
  const activeExport = exportConfig[activeTab];

  const pageTitle = getAnalyticsPageTitle(role);

  const handleExportAnalyticsPdf = async () => {
    if (!activeExport || exportingPdf) return;

    try {
      setExportingPdf(true);
      const newTab = window.open(activeExport.url, "_blank", "noopener,noreferrer");
      if (!newTab) {
        alert("Popup blocked. Please allow popups and try again.");
      }
    } catch (error) {
      console.error("Analytics export error:", error);
      alert("Unable to export analytics PDF.");
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <DashboardShell>
      <div className="analytics-page">
        <div className="analytics-scroll">
          <div className="analytics-container">
            <header className="analytics-header analytics-header--dashboard">
              <div className="analytics-header-main">
                <div className="analytics-badge-row">
                  <span className="analytics-badge">Operations Overview</span>
                  <span className="analytics-badge analytics-badge--soft">
                    {activeTabMeta.label}
                  </span>
                </div>

                <h2 className="analytics-title">{pageTitle}</h2>

                <p className="analytics-header-subtitle">
                  {role === "accountant"
                    ? "Monitor inventory movement, donation activity, and monetary relief demand."
                    : "Monitor operations, inventory risks, donations, relief demand, incidents, and evacuation readiness."}
                </p>
              </div>

              {activeExport && (
                <button
                  type="button"
                  onClick={handleExportAnalyticsPdf}
                  disabled={exportingPdf}
                  className="analytics-export-btn"
                >
                  <FaFilePdf />
                  {exportingPdf ? "Exporting..." : "Export Analytics PDF"}
                </button>
              )}
            </header>

            <section className="analytics-tabs-shell">
              <div className="analytics-tabs">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`analytics-tab ${
                      activeTab === tab.key ? "is-active" : ""
                    }`}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    <span className="analytics-tab-title">{tab.label}</span>
                  </button>
                ))}
              </div>
            </section>

            <div className="analytics-tab-content">
              {activeTab === "overview" && <Overview />}
              {activeTab === "inventory" && <InventoryAnalytics />}
              {activeTab === "donations" && <DonationAnalytics />}
              {activeTab === "relief" && <ReliefAnalytics />}
              {activeTab === "incidents" && <IncidentAnalytics />}
              {activeTab === "evacuation" && <EvacuationAnalytics />}
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
