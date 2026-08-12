import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const UNITY_BUILD_URL = "/unity/virtual-twin/index.html";

const pageStyles = `
  :root {
    --vt-dark-green: #0f3d21;
    --vt-green: #166534;
    --vt-bright-green: #22c55e;
    --vt-border: #dce9de;
    --vt-text: #173122;
    --vt-soft-text: #5e7365;
  }

  * {
    box-sizing: border-box;
  }

  html,
  body,
  #root {
    min-height: 100%;
    margin: 0;
  }

  body {
    font-family:
      Inter,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
  }

  button,
  iframe {
    font: inherit;
  }

  .vt-page {
    min-height: 100dvh;

    padding:
      max(24px, env(safe-area-inset-top))
      max(24px, env(safe-area-inset-right))
      max(24px, env(safe-area-inset-bottom))
      max(24px, env(safe-area-inset-left));

    background:
      radial-gradient(
        circle at top right,
        rgba(15, 90, 32, 0.08),
        transparent 24%
      ),
      radial-gradient(
        circle at top left,
        rgba(34, 197, 94, 0.08),
        transparent 28%
      ),
      linear-gradient(
        180deg,
        #f5faf6 0%,
        #edf5ef 100%
      );
  }

  .vt-page.vt-force-light {
    color-scheme: light;
    color: var(--vt-text);
    background:
      radial-gradient(
        circle at top right,
        rgba(15, 90, 32, 0.08),
        transparent 24%
      ),
      radial-gradient(
        circle at top left,
        rgba(34, 197, 94, 0.08),
        transparent 28%
      ),
      linear-gradient(
        180deg,
        #f5faf6 0%,
        #edf5ef 100%
      );
  }

  .vt-shell {
    width: min(1500px, 100%);
    margin: 0 auto;

    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .vt-header-card {
    padding: 26px 28px;

    border: 1px solid var(--vt-border);
    border-radius: 28px;

    background:
      linear-gradient(
        135deg,
        rgba(255, 255, 255, 0.97),
        rgba(243, 251, 245, 0.95)
      );

    box-shadow:
      0 18px 40px rgba(20, 83, 45, 0.08);
  }

  .vt-header-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
  }

  .vt-kicker {
    color: var(--vt-green);

    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .vt-title {
    margin: 10px 0 0;

    color: var(--vt-dark-green);

    font-size: clamp(28px, 3vw, 42px);
    line-height: 1.05;
    letter-spacing: -0.025em;
  }

  .vt-description {
    max-width: 760px;
    margin: 12px 0 0;

    color: var(--vt-soft-text);

    font-size: 15px;
    line-height: 1.7;
  }

  .vt-status-pill {
    min-height: 36px;
    padding: 0 14px;

    display: inline-flex;
    align-items: center;
    gap: 9px;

    flex-shrink: 0;

    border: 1px solid var(--vt-border);
    border-radius: 999px;

    font-size: 12px;
    font-weight: 900;
  }

  .vt-status-pill.online {
    color: #14532d;
    background: rgba(34, 197, 94, 0.1);
  }

  .vt-status-pill.offline {
    color: #c2410c;
    border-color: #fed7aa;
    background: #fff7ed;
  }

  .vt-status-dot {
    width: 9px;
    height: 9px;

    border-radius: 999px;
    background: currentColor;

    box-shadow:
      0 0 0 5px rgba(34, 197, 94, 0.12);
  }

  .vt-status-pill.offline .vt-status-dot {
    box-shadow:
      0 0 0 5px rgba(194, 65, 12, 0.12);
  }

  .vt-stats-row {
  margin-top: 20px;

  display: grid;
  grid-template-columns:
    repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

  .vt-stat-card {
    min-width: 0;
    padding: 16px 18px;

    border: 1px solid var(--vt-border);
    border-radius: 20px;

    background:
      linear-gradient(
        180deg,
        #ffffff 0%,
        #f7fbf8 100%
      );

    box-shadow:
      0 10px 24px rgba(15, 90, 32, 0.05);
  }

  .vt-stat-label {
    display: block;
    margin-bottom: 7px;

    color: #607667;

    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .vt-stat-card strong {
    display: block;

    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    color: var(--vt-dark-green);

    font-size: 15px;
  }

  .vt-info-panel {
  padding: 22px;

  border: 1px solid var(--vt-border);
  border-radius: 26px;

  background:
    linear-gradient(
      180deg,
      #ffffff 0%,
      #f7fbf8 100%
    );

  box-shadow:
    0 16px 36px rgba(20, 83, 45, 0.08);
}

.vt-info-heading {
  margin-bottom: 16px;
}

.vt-info-kicker {
  display: block;

  color: var(--vt-green);

  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.vt-info-heading h2 {
  margin: 6px 0 0;

  color: var(--vt-dark-green);

  font-size: 22px;
  letter-spacing: -0.02em;
}

.vt-info-heading p {
  max-width: 850px;
  margin: 8px 0 0;

  color: var(--vt-soft-text);

  font-size: 14px;
  line-height: 1.65;
}

.vt-info-grid {
  display: grid;
  grid-template-columns:
    repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.vt-info-card {
  min-width: 0;
  padding: 18px;

  border: 1px solid var(--vt-border);
  border-radius: 20px;

  background:
    linear-gradient(
      180deg,
      #ffffff 0%,
      #f7fbf8 100%
    );

  box-shadow:
    0 10px 24px rgba(15, 90, 32, 0.05);
}

.vt-info-card.danger {
  border-color: #efc9c9;

  background:
    linear-gradient(
      180deg,
      #ffffff 0%,
      #fff4f4 100%
    );
}

.vt-info-icon {
  width: 42px;
  height: 42px;

  display: inline-flex;
  align-items: center;
  justify-content: center;

  margin-bottom: 13px;

  border: 1px solid #d6e8db;
  border-radius: 14px;

  color: var(--vt-green);

  background: #eef7f1;

  font-size: 20px;
}

.vt-info-card.danger .vt-info-icon {
  color: #b91c1c;
  border-color: #fecaca;
  background: #fee2e2;
}

.vt-info-card h3 {
  margin: 0;

  color: var(--vt-dark-green);

  font-size: 16px;
}

.vt-info-card p {
  margin: 8px 0 0;

  color: var(--vt-soft-text);

  font-size: 13px;
  line-height: 1.65;
}

.vt-info-card.danger h3 {
  color: #991b1b;
}

.vt-red-indicator {
  display: inline-flex;
  align-items: center;
  gap: 9px;

  margin-top: 12px;
  padding: 8px 11px;

  border: 1px solid #fecaca;
  border-radius: 12px;

  color: #991b1b;
  background: #fff1f2;

  font-size: 12px;
  font-weight: 800;
}

.vt-red-swatch {
  width: 15px;
  height: 15px;

  flex-shrink: 0;

  border: 2px solid #991b1b;
  border-radius: 4px;

  background: #dc2626;

  box-shadow:
    0 0 0 4px rgba(220, 38, 38, 0.1);
}

  .vt-content {
    padding: 18px;

    overflow: hidden;

    border: 1px solid var(--vt-border);
    border-radius: 26px;

    background:
      linear-gradient(
        180deg,
        #ffffff 0%,
        #fbfdfb 100%
      );

    box-shadow:
      0 16px 36px rgba(20, 83, 45, 0.08);
  }

  .vt-toolbar {
    padding: 2px 2px 16px;

    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .vt-toolbar-kicker {
    color: var(--vt-green);

    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .vt-toolbar h2 {
    margin: 4px 0 0;

    color: var(--vt-dark-green);

    font-size: 22px;
    letter-spacing: -0.02em;
  }

  .vt-toolbar-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .vt-button {
    min-height: 44px;
    padding: 0 17px;

    border: 1px solid transparent;
    border-radius: 14px;

    cursor: pointer;

    font-size: 13px;
    font-weight: 800;

    transition:
      transform 0.16s ease,
      box-shadow 0.18s ease,
      filter 0.18s ease;
  }

  .vt-button:hover {
    transform: translateY(-1px);
  }

  .vt-button:active {
    transform: translateY(0);
  }

  .vt-button:focus-visible {
    outline: 3px solid rgba(34, 197, 94, 0.25);
    outline-offset: 2px;
  }

  .vt-button-secondary {
    color: #14532d;
    border-color: var(--vt-border);
    background: #ffffff;
  }

  .vt-button-secondary:hover {
    box-shadow:
      0 12px 24px rgba(15, 90, 32, 0.08);
  }

  .vt-button-primary {
    color: #ffffff;

    background:
      linear-gradient(
        180deg,
        #166534 0%,
        #0f3d21 100%
      );

    box-shadow:
      0 12px 24px rgba(6, 58, 18, 0.16);
  }

  .vt-alert {
    margin-bottom: 14px;
    padding: 13px 15px;

    display: flex;
    align-items: flex-start;
    gap: 11px;

    border: 1px solid #fed7aa;
    border-radius: 15px;

    color: #c2410c;

    background:
      linear-gradient(
        180deg,
        #ffffff 0%,
        #fff7ed 100%
      );
  }

  .vt-alert-icon {
    width: 30px;
    height: 30px;

    display: inline-flex;
    justify-content: center;
    align-items: center;

    flex-shrink: 0;

    border: 1px solid rgba(0, 0, 0, 0.07);
    border-radius: 999px;

    background: rgba(255, 255, 255, 0.76);

    font-weight: 900;
  }

  .vt-alert strong {
    display: block;
    font-size: 13px;
  }

  .vt-alert p {
    margin: 3px 0 0;

    font-size: 12px;
    line-height: 1.5;
  }

  .vt-stage {
    position: relative;

    width: 100%;
    min-height: 560px;

    overflow: hidden;

    border: 1px solid #cfe0d2;
    border-radius: 20px;

    background:
      radial-gradient(
        circle at center,
        rgba(34, 197, 94, 0.08),
        transparent 36%
      ),
      #07150c;
  }

  .vt-frame {
    position: absolute;
    inset: 0;

    width: 100%;
    height: 100%;

    display: block;

    border: 0;
    background: #07150c;
  }

  .vt-overlay {
    position: absolute;
    inset: 0;
    z-index: 5;

    padding: 28px;

    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;

    color: #ecfdf3;
    text-align: center;

    background:
      radial-gradient(
        circle at center,
        rgba(34, 197, 94, 0.16),
        transparent 30%
      ),
      linear-gradient(
        180deg,
        rgba(7, 30, 14, 0.98),
        rgba(7, 21, 12, 0.98)
      );
  }

  .vt-overlay strong {
    font-size: 18px;
  }

  .vt-overlay p {
    max-width: 520px;
    margin: 0;

    color: #c8dccd;

    font-size: 13px;
    line-height: 1.6;
  }

  .vt-overlay code {
    display: inline-block;

    margin: 4px;
    padding: 3px 7px;

    border-radius: 6px;

    color: #dcfce7;
    background: rgba(255, 255, 255, 0.08);
  }

  .vt-loader {
    width: 48px;
    height: 48px;

    border: 4px solid rgba(255, 255, 255, 0.22);
    border-top-color: #4ade80;
    border-radius: 999px;

    animation: vt-spin 0.8s linear infinite;
  }

  .vt-error-icon {
    width: 48px;
    height: 48px;

    display: flex;
    align-items: center;
    justify-content: center;

    color: #fecaca;

    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 999px;

    background: rgba(220, 38, 38, 0.22);

    font-size: 22px;
    font-weight: 900;
  }

  .vt-footer-note {
    min-height: 46px;
    padding: 12px 4px 0;

    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;

    color: var(--vt-soft-text);

    font-size: 12px;
    font-weight: 700;
    text-align: center;
  }

  .vt-footer-dot {
    width: 7px;
    height: 7px;

    border-radius: 999px;

    background: var(--vt-bright-green);

    box-shadow:
      0 0 0 5px rgba(34, 197, 94, 0.12);
  }

  .vt-content.is-fullscreen {
    padding:
      max(14px, env(safe-area-inset-top))
      max(14px, env(safe-area-inset-right))
      max(14px, env(safe-area-inset-bottom))
      max(14px, env(safe-area-inset-left));

    border-radius: 0;
    background: #07150c;
  }

  .vt-content.is-fullscreen .vt-stage {
    min-height: calc(100dvh - 120px);
  }

  /*
    Compact mode for React Native WebView.
    Open using:
    /flood-virtual-twin?embed=1
  */

  .vt-page.is-embedded {
    padding: 0;
    background: #07150c;
  }

  .vt-page.is-embedded .vt-shell {
    min-height: 100dvh;
    max-width: none;
    gap: 0;
  }

  .vt-page.is-embedded .vt-header-card {
    margin:
      max(10px, env(safe-area-inset-top))
      max(10px, env(safe-area-inset-right))
      10px
      max(10px, env(safe-area-inset-left));

    padding: 14px 16px;

    border-radius: 18px;
  }

  .vt-page.is-embedded .vt-description,
  .vt-page.is-embedded .vt-stats-row {
    display: none;
  }

  .vt-page.is-embedded .vt-title {
    margin-top: 5px;
    font-size: 20px;
  }

  .vt-page.is-embedded .vt-kicker {
    font-size: 10px;
  }

  .vt-page.is-embedded .vt-content {
    flex: 1;
    min-height: 0;

    padding:
      10px
      max(10px, env(safe-area-inset-right))
      max(10px, env(safe-area-inset-bottom))
      max(10px, env(safe-area-inset-left));

    border: 0;
    border-radius: 0;

    background: #07150c;

    box-shadow: none;
  }

  .vt-page.is-embedded .vt-toolbar {
    padding-bottom: 10px;
    justify-content: flex-end;
  }

  .vt-page.is-embedded .vt-toolbar > div:first-child {
    display: none;
  }

  .vt-page.is-embedded .vt-button {
    min-height: 40px;
    padding: 0 14px;
  }

  .vt-page.is-embedded .vt-stage {
    min-height:
      calc(
        100dvh -
        146px -
        env(safe-area-inset-top) -
        env(safe-area-inset-bottom)
      );

    border-radius: 16px;
  }

  .vt-page.is-embedded .vt-footer-note {
    display: none;
  }

  @keyframes vt-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 1100px) {
    .vt-stats-row {
      grid-template-columns:
        repeat(2, minmax(0, 1fr));
    }

    .vt-stage {
      min-height: 520px;
    }

    .vt-info-grid {
  grid-template-columns:
    repeat(2, minmax(0, 1fr));
}

.vt-info-card:last-child {
  grid-column: 1 / -1;
}
  }

  @media (max-width: 760px) {
    .vt-page {
      padding:
        max(14px, env(safe-area-inset-top))
        max(14px, env(safe-area-inset-right))
        max(14px, env(safe-area-inset-bottom))
        max(14px, env(safe-area-inset-left));
    }

    .vt-info-panel {
  padding: 16px;
  border-radius: 22px;
}

.vt-info-grid {
  grid-template-columns: 1fr;
}

.vt-info-card:last-child {
  grid-column: auto;
}

    .vt-header-card,
    .vt-content {
      padding: 16px;
      border-radius: 22px;
    }

    .vt-header-top,
    .vt-toolbar {
      flex-direction: column;
      align-items: stretch;
    }

    .vt-status-pill {
      align-self: flex-start;
    }

    .vt-toolbar-actions {
      justify-content: flex-start;
    }

    .vt-stage {
      min-height: 68dvh;
    }
  }

  @media (max-width: 520px) {
    .vt-stats-row {
      grid-template-columns: 1fr;
    }

    .vt-title {
      font-size: 25px;
    }

    .vt-toolbar-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    .vt-button {
      width: 100%;
    }

    .vt-page:not(.is-embedded) .vt-stage {
      min-height: 62dvh;
    }
  }

  :root[data-theme="dark"] .vt-page {
    background:
      radial-gradient(
        circle at top right,
        rgba(63, 185, 80, 0.12),
        transparent 24%
      ),
      linear-gradient(
        180deg,
        #082611 0%,
        #0c2814 100%
      );
  }

  :root[data-theme="dark"] .vt-header-card,
  :root[data-theme="dark"] .vt-content,
  :root[data-theme="dark"] .vt-stat-card {
    color: var(--content-text, #eefaf1);

    border-color: rgba(157, 203, 168, 0.18);

    background:
      linear-gradient(
        180deg,
        rgba(19, 49, 27, 0.98) 0%,
        rgba(23, 58, 32, 0.98) 100%
      );

    box-shadow:
      0 14px 30px rgba(0, 0, 0, 0.2);
  }

  :root[data-theme="dark"] .vt-title,
  :root[data-theme="dark"] .vt-toolbar h2,
  :root[data-theme="dark"] .vt-stat-card strong,
  :root[data-theme="dark"] .vt-kicker,
  :root[data-theme="dark"] .vt-toolbar-kicker {
    color: var(--content-text, #eefaf1);
  }

  :root[data-theme="dark"] .vt-description,
  :root[data-theme="dark"] .vt-stat-label,
  :root[data-theme="dark"] .vt-footer-note {
    color: var(--text-soft, #a8c5ae);
  }

  :root[data-theme="dark"] .vt-status-pill.online,
  :root[data-theme="dark"] .vt-button-secondary {
    color: var(--content-text, #eefaf1);

    border-color: rgba(157, 203, 168, 0.2);

    background: rgba(76, 199, 111, 0.12);
  }

  :root[data-theme="dark"] .vt-info-panel,
:root[data-theme="dark"] .vt-info-card {
  color: var(--content-text, #eefaf1);

  border-color: rgba(157, 203, 168, 0.18);

  background:
    linear-gradient(
      180deg,
      rgba(19, 49, 27, 0.98) 0%,
      rgba(23, 58, 32, 0.98) 100%
    );

  box-shadow:
    0 14px 30px rgba(0, 0, 0, 0.2);
}

:root[data-theme="dark"] .vt-info-heading h2,
:root[data-theme="dark"] .vt-info-card h3 {
  color: var(--content-text, #eefaf1);
}

:root[data-theme="dark"] .vt-info-heading p,
:root[data-theme="dark"] .vt-info-card p {
  color: var(--text-soft, #a8c5ae);
}

:root[data-theme="dark"] .vt-info-icon {
  color: #bbf7d0;
  border-color: rgba(157, 203, 168, 0.2);
  background: rgba(76, 199, 111, 0.12);
}

:root[data-theme="dark"] .vt-info-card.danger {
  border-color: rgba(248, 113, 113, 0.32);

  background:
    linear-gradient(
      180deg,
      rgba(80, 28, 28, 0.98) 0%,
      rgba(69, 24, 24, 0.98) 100%
    );
}

:root[data-theme="dark"] .vt-info-card.danger h3 {
  color: #fecaca;
}

:root[data-theme="dark"] .vt-red-indicator {
  color: #fecaca;
  border-color: rgba(248, 113, 113, 0.35);
  background: rgba(220, 38, 38, 0.14);
}

  :root[data-theme="dark"] .vt-page.vt-force-light {
    color: var(--vt-text);
    background:
      radial-gradient(
        circle at top right,
        rgba(15, 90, 32, 0.08),
        transparent 24%
      ),
      radial-gradient(
        circle at top left,
        rgba(34, 197, 94, 0.08),
        transparent 28%
      ),
      linear-gradient(
        180deg,
        #f5faf6 0%,
        #edf5ef 100%
      );
  }

  :root[data-theme="dark"] .vt-page.vt-force-light .vt-header-card,
  :root[data-theme="dark"] .vt-page.vt-force-light .vt-content,
  :root[data-theme="dark"] .vt-page.vt-force-light .vt-stat-card,
  :root[data-theme="dark"] .vt-page.vt-force-light .vt-info-panel,
  :root[data-theme="dark"] .vt-page.vt-force-light .vt-info-card {
    color: var(--vt-text);
    border-color: var(--vt-border);
    background:
      linear-gradient(
        180deg,
        #ffffff 0%,
        #f7fbf8 100%
      );
    box-shadow:
      0 16px 36px rgba(20, 83, 45, 0.08);
  }

  :root[data-theme="dark"] .vt-page.vt-force-light .vt-title,
  :root[data-theme="dark"] .vt-page.vt-force-light .vt-toolbar h2,
  :root[data-theme="dark"] .vt-page.vt-force-light .vt-stat-card strong,
  :root[data-theme="dark"] .vt-page.vt-force-light .vt-kicker,
  :root[data-theme="dark"] .vt-page.vt-force-light .vt-toolbar-kicker,
  :root[data-theme="dark"] .vt-page.vt-force-light .vt-info-heading h2,
  :root[data-theme="dark"] .vt-page.vt-force-light .vt-info-card h3 {
    color: var(--vt-dark-green);
  }

  :root[data-theme="dark"] .vt-page.vt-force-light .vt-description,
  :root[data-theme="dark"] .vt-page.vt-force-light .vt-stat-label,
  :root[data-theme="dark"] .vt-page.vt-force-light .vt-footer-note,
  :root[data-theme="dark"] .vt-page.vt-force-light .vt-info-heading p,
  :root[data-theme="dark"] .vt-page.vt-force-light .vt-info-card p {
    color: var(--vt-soft-text);
  }

  :root[data-theme="dark"] .vt-page.vt-force-light .vt-status-pill.online,
  :root[data-theme="dark"] .vt-page.vt-force-light .vt-button-secondary {
    color: #14532d;
    border-color: var(--vt-border);
    background: #ffffff;
  }

  :root[data-theme="dark"] .vt-page.vt-force-light .vt-info-icon {
    color: var(--vt-green);
    border-color: #d6e8db;
    background: #eef7f1;
  }

  :root[data-theme="dark"] .vt-page.vt-force-light .vt-info-card.danger {
    border-color: #efc9c9;
    background:
      linear-gradient(
        180deg,
        #ffffff 0%,
        #fff4f4 100%
      );
  }

  :root[data-theme="dark"] .vt-page.vt-force-light .vt-info-card.danger h3,
  :root[data-theme="dark"] .vt-page.vt-force-light .vt-red-indicator {
    color: #991b1b;
  }

  :root[data-theme="dark"] .vt-page.vt-force-light .vt-red-indicator {
    border-color: #fecaca;
    background: #fff1f2;
  }

  :root[data-theme="dark"] .vt-page.vt-force-light .vt-info-card.danger .vt-info-icon {
    color: #b91c1c;
    border-color: #fecaca;
    background: #fee2e2;
  }
`;

function sendMessageToReactNative(type, extraData = {}) {
  if (
    typeof window === "undefined" ||
    !window.ReactNativeWebView ||
    typeof window.ReactNativeWebView.postMessage !== "function"
  ) {
    return;
  }

  window.ReactNativeWebView.postMessage(
    JSON.stringify({
      source: "virtual-twin-web",
      type,
      ...extraData,
    })
  );
}

function FloodVirtualTwin() {
  const stageRef = useRef(null);

  const [iframeKey, setIframeKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] =
    useState(false);

  const [isOnline, setIsOnline] = useState(() => {
    if (typeof navigator === "undefined") {
      return true;
    }

    return navigator.onLine;
  });

  const [isFullscreen, setIsFullscreen] =
    useState(false);

  const isEmbedded = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }

    const searchParams = new URLSearchParams(
      window.location.search
    );

    return (
      searchParams.get("embed") === "1" ||
      Boolean(window.ReactNativeWebView)
    );
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);

      sendMessageToReactNative(
        "network-change",
        {
          online: true,
        }
      );
    };

    const handleOffline = () => {
      setIsOnline(false);

      sendMessageToReactNative(
        "network-change",
        {
          online: false,
        }
      );
    };

    const handleFullscreenChange = () => {
      setIsFullscreen(
        Boolean(document.fullscreenElement)
      );
    };

    window.addEventListener(
      "online",
      handleOnline
    );

    window.addEventListener(
      "offline",
      handleOffline
    );

    document.addEventListener(
      "fullscreenchange",
      handleFullscreenChange
    );

    sendMessageToReactNative("page-ready", {
      embedded: isEmbedded,
      online:
        typeof navigator === "undefined"
          ? true
          : navigator.onLine,
    });

    return () => {
      window.removeEventListener(
        "online",
        handleOnline
      );

      window.removeEventListener(
        "offline",
        handleOffline
      );

      document.removeEventListener(
        "fullscreenchange",
        handleFullscreenChange
      );
    };
  }, [isEmbedded]);

  const reloadSimulation = useCallback(() => {
    setHasLoadError(false);
    setIsLoading(true);

    setIframeKey(
      (currentKey) => currentKey + 1
    );

    sendMessageToReactNative(
      "simulation-reload"
    );
  }, []);

  const openDirectBuild = useCallback(() => {
    window.open(
      UNITY_BUILD_URL,
      "_blank",
      "noopener,noreferrer"
    );
  }, []);

  const toggleFullscreen =
    useCallback(async () => {
      try {
        if (!document.fullscreenElement) {
          if (
            stageRef.current &&
            stageRef.current.requestFullscreen
          ) {
            await stageRef.current.requestFullscreen();
          }
        } else if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      } catch (error) {
        console.error(
          "Fullscreen request failed:",
          error
        );

        sendMessageToReactNative(
          "fullscreen-error",
          {
            message:
              error instanceof Error
                ? error.message
                : "Fullscreen is unavailable.",
          }
        );
      }
    }, []);

  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
    setHasLoadError(false);

    sendMessageToReactNative(
      "simulation-frame-loaded"
    );
  }, []);

  const handleIframeError = useCallback(() => {
    setIsLoading(false);
    setHasLoadError(true);

    sendMessageToReactNative(
      "simulation-frame-error"
    );
  }, []);

  return (
    <>
      <style>{pageStyles}</style>

      <main
        className={
          isEmbedded
            ? "vt-page vt-force-light is-embedded"
            : "vt-page vt-force-light"
        }
      >
        <div className="vt-shell">
          <section
            className="vt-header-card"
            aria-labelledby="virtual-twin-title"
          >
            <div className="vt-header-top">
              <div>
                <span className="vt-kicker">
                  SagipBayan Virtual Twin
                </span>

                <h1
                  id="virtual-twin-title"
                  className="vt-title"
                >
                  Flood Scenario Simulation
                </h1>

                <p className="vt-description">
  An interactive flood virtual twin and information
  management system for Sapang, Nueva Ecija. It allows
  users to visualize different flood conditions and
  identify households and areas that may be affected.
</p>
              </div>

              <div
                className={
                  isOnline
                    ? "vt-status-pill online"
                    : "vt-status-pill offline"
                }
              >
                <span
                  className="vt-status-dot"
                  aria-hidden="true"
                />

                {isOnline ? "Online" : "Offline"}
              </div>
            </div>

            <div
              className="vt-stats-row"
              aria-label="Virtual twin information"
            >
              <article className="vt-stat-card">
                <span className="vt-stat-label">
                  Simulation
                </span>

                <article className="vt-stat-card">
  <span className="vt-stat-label">
    Location
  </span>

  <strong>
    Sapang, Nueva Ecija
  </strong>
</article>

                <strong>
                  Flood Virtual Twin
                </strong>
              </article>

              <article className="vt-stat-card">
                <span className="vt-stat-label">
                  Engine
                </span>

                <strong>Unity WebGL</strong>
              </article>

              <article className="vt-stat-card">
                <span className="vt-stat-label">
                  Display
                </span>

                <strong>
                  {isEmbedded
                    ? "Mobile WebView"
                    : "Web Browser"}
                </strong>
              </article>

              <article className="vt-stat-card">
                <span className="vt-stat-label">
                  Connection
                </span>

                <strong>
                  {isOnline
                    ? "Connected"
                    : "Unavailable"}
                </strong>
              </article>
            </div>
          </section>

          <section
            ref={stageRef}
            className={
              isFullscreen
                ? "vt-content is-fullscreen"
                : "vt-content"
            }
          >

            <section
  className="vt-info-panel"
  aria-labelledby="virtual-twin-information"
>
  <div className="vt-info-heading">
    <span className="vt-info-kicker">
      Information Management
    </span>

    <h2 id="virtual-twin-information">
      Understanding the Flood Virtual Twin
    </h2>

    <p>
      This virtual twin presents flood-related information
      for Sapang, Nueva Ecija through an interactive digital
      simulation. It helps users understand how changes in
      water level may affect households and surrounding areas.
    </p>
  </div>

  <div className="vt-info-grid">
    <article className="vt-info-card">
      <div
        className="vt-info-icon"
        aria-hidden="true"
      >
        📍
      </div>

      <h3>
        Simulation Location
      </h3>

      <p>
        The virtual environment represents Sapang,
        Nueva Ecija. The simulation is designed to
        demonstrate possible flood conditions within
        the represented community.
      </p>
    </article>

    <article className="vt-info-card">
      <div
        className="vt-info-icon"
        aria-hidden="true"
      >
        ◫
      </div>

      <h3>
        What is a Virtual Twin?
      </h3>

      <p>
        A virtual twin is an information management and
        simulation system that digitally represents a
        real-world place. It organizes visual information
        and allows users to observe, understand, and compare
        different flood scenarios.
      </p>
    </article>

    <article className="vt-info-card danger">
      <div
        className="vt-info-icon"
        aria-hidden="true"
      >
        🏠
      </div>

      <h3>
        Flood-Affected Household
      </h3>

      <p>
        When a household model turns red, floodwater has
        reached that household's location in the simulation.
        This indicates that the household and its surrounding
        area are considered affected by flooding under the
        selected scenario.
      </p>

      <div className="vt-red-indicator">
        <span
          className="vt-red-swatch"
          aria-hidden="true"
        />

        Red household = Flood-affected area
      </div>
    </article>
  </div>
</section>
            <div className="vt-toolbar">
              <div>
                <span className="vt-toolbar-kicker">
                  Interactive Environment
                </span>

                <h2>Flood Virtual Twin</h2>
              </div>

              <div className="vt-toolbar-actions">
                <button
                  type="button"
                  className="vt-button vt-button-secondary"
                  onClick={reloadSimulation}
                >
                  Reload
                </button>

                {!isEmbedded && (
                  <button
                    type="button"
                    className="vt-button vt-button-secondary"
                    onClick={openDirectBuild}
                  >
                    Open directly
                  </button>
                )}

                <button
                  type="button"
                  className="vt-button vt-button-primary"
                  onClick={toggleFullscreen}
                >
                  {isFullscreen
                    ? "Exit fullscreen"
                    : "Fullscreen"}
                </button>
              </div>
            </div>

            {!isOnline && (
              <div
                className="vt-alert"
                role="alert"
              >
                <span className="vt-alert-icon">
                  !
                </span>

                <div>
                  <strong>
                    No internet connection
                  </strong>

                  <p>
                    The simulation needs an internet
                    connection when its files are not
                    cached.
                  </p>
                </div>
              </div>
            )}

            <div className="vt-stage">
              <iframe
                key={iframeKey}
                className="vt-frame"
                src={UNITY_BUILD_URL}
                title="SagipBayan Flood Virtual Twin"
                allow="autoplay; fullscreen; gamepad; accelerometer; gyroscope"
                allowFullScreen
                onLoad={handleIframeLoad}
                onError={handleIframeError}
              />

              {isLoading && !hasLoadError && (
                <div
                  className="vt-overlay"
                  aria-live="polite"
                >
                  <div
                    className="vt-loader"
                    aria-hidden="true"
                  />

                  <strong>
                    Loading virtual twin...
                  </strong>

                  <p>
                    The first load may take longer
                    while the Unity WebGL assets are
                    downloaded.
                  </p>
                </div>
              )}

              {hasLoadError && (
                <div
                  className="vt-overlay"
                  role="alert"
                >
                  <div className="vt-error-icon">
                    !
                  </div>

                  <strong>
                    Unable to load the simulation
                  </strong>

                  <p>
                    Confirm that the Unity build
                    exists in
                    <code>
                      /public/unity/virtual-twin
                    </code>
                    and that its compression
                    configuration is correct.
                  </p>

                  <button
                    type="button"
                    className="vt-button vt-button-primary"
                    onClick={reloadSimulation}
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>

            <div className="vt-footer-note">
              <span
                className="vt-footer-dot"
                aria-hidden="true"
              />

              For the best experience, rotate your
              phone to landscape and close unused
              applications.
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

export default FloodVirtualTwin;
