import { useMemo, useState } from "react";
import DashboardShell from "../layout/DashboardShell";

import Register from "../auth/Register";
import EditAccount from "../auth/EditAccount";
import ArchivedAccounts from "../auth/ArchivedAccounts";
import AdminLogs from "../admin/AdminLogs";

import "../css/AdminAccounts.css";

export default function AdminAccounts() {
  const [activeTab, setActiveTab] = useState("register");

  const tabs = useMemo(
    () => [
      {
        key: "register",
        label: "Register",
        short: "Create new accounts",
      },
      {
        key: "edit",
        label: "Edit Accounts",
        short: "Update active accounts",
      },
      {
        key: "archived",
        label: "Archived",
        short: "Restore archived users",
      },
      {
        key: "logs",
        label: "Admin Logs",
        short: "Track admin actions",
      },
    ],
    []
  );

  const activeTabMeta = tabs.find((tab) => tab.key === activeTab) || tabs[0];

  return (
    <DashboardShell>
      <div className="acc-page">
        <div className="acc-shell">
          <div className="acc-header-card">
            <div className="acc-header-top">
              <span className="acc-kicker">Administration Module</span>
              <div className="acc-active-pill">{activeTabMeta.label}</div>
            </div>

            <h1 className="acc-title">Account Management</h1>

            <div className="acc-stats-row">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`acc-stat-card ${
                    activeTab === tab.key ? "active" : ""
                  }`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  <span className="acc-stat-title">{tab.label}</span>
                  <span className="acc-stat-sub">{tab.short}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="acc-content">
            <div key={activeTab} className="acc-animated">
              {activeTab === "register" && <Register />}
              {activeTab === "edit" && <EditAccount />}
              {activeTab === "archived" && <ArchivedAccounts />}
              {activeTab === "logs" && <AdminLogs />}
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}