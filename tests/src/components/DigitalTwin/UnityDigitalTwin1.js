import React from "react";

function UnityDigitalTwin1() {
  return (
    <div style={styles.page}>
      <div style={styles.mobileFrame}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Digital Twin</h1>
            <p style={styles.subtitle}>
              Real-time water level simulation
            </p>
          </div>

          <span style={styles.liveBadge}>LIVE</span>
        </div>

        <div style={styles.infoCard}>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>Source</span>
            <strong style={styles.infoValue}>Render API</strong>
          </div>

          <div style={styles.divider} />

          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>Mode</span>
            <strong style={styles.infoValue}>WebGL</strong>
          </div>
        </div>

        <div style={styles.unityContainer}>
          <iframe
            title="SagipBayan Digital Twin"
            src="/unity/digital-twin/index.html"
            style={styles.iframe}
            allowFullScreen
          />
        </div>

        <p style={styles.note}>
          The simulation updates based on the latest water-level timestamp.
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: {
    width: "100%",
    minHeight: "100vh",
    background: "#f4f7f6",
    boxSizing: "border-box",
    padding: "clamp(10px, 3vw, 24px)",
    display: "flex",
    justifyContent: "center",
  },

  mobileFrame: {
    width: "100%",
    maxWidth: "1200px",
    minHeight: "100vh",
    boxSizing: "border-box",
  },

  header: {
    background: "#12372A",
    color: "#ffffff",
    borderRadius: "22px",
    padding: "18px",
    marginBottom: "12px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    boxShadow: "0 8px 22px rgba(18, 55, 42, 0.22)",
  },

  title: {
    margin: 0,
    fontSize: "clamp(22px, 6vw, 32px)",
    fontWeight: "800",
    lineHeight: "1.1",
    color: "#ffffff",
  },

  subtitle: {
    margin: "6px 0 0",
    fontSize: "clamp(13px, 3.6vw, 15px)",
    lineHeight: "1.45",
    color: "#d8eee5",
  },

  liveBadge: {
    flexShrink: 0,
    background: "#E8F5E9",
    color: "#12372A",
    fontSize: "12px",
    fontWeight: "800",
    padding: "7px 10px",
    borderRadius: "999px",
    letterSpacing: "0.5px",
  },

  infoCard: {
    background: "#ffffff",
    borderRadius: "18px",
    padding: "14px",
    marginBottom: "12px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
  },

  infoItem: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },

  infoLabel: {
    fontSize: "12px",
    color: "#64746b",
  },

  infoValue: {
    fontSize: "14px",
    color: "#12372A",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  divider: {
    width: "1px",
    height: "32px",
    background: "#e5e7eb",
  },

  unityContainer: {
    width: "100%",
    height: "calc(100vh - 220px)",
    minHeight: "420px",
    background: "#000",
    borderRadius: "20px",
    overflow: "hidden",
    boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
  },

  iframe: {
    width: "100%",
    height: "100%",
    border: "none",
    display: "block",
    background: "#000",
  },

  note: {
    margin: "10px 4px 0",
    fontSize: "12px",
    lineHeight: "1.4",
    color: "#64746b",
    textAlign: "center",
  },
};

export default UnityDigitalTwin1;