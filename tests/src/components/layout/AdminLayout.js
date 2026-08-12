import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    // TODO: your real logout logic (clear tokens, redirect to login, etc.)
    console.log("Logging out…");
  };

  return (
    <div className="admin-layout">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(c => !c)}
        onLogout={handleLogout}
      />
      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  );
}