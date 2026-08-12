import React, { useEffect, useState } from "react";
import "./SplashScreen.css";

/* ⬇️ Replace these paths with your actual assets if different */
import JaenLogo from "../../assets/images/jaenlogo.png";
import SagipBayanLogo from "../../assets/images/sagipbayanlogo.png";

/**
 * SplashScreen
 * Props:
 *  - durationMs?: number       // how long to show before calling onFinish (default 4000)
 *  - dotPeriodMs?: number      // speed of the dot animation (default 300)
 *  - message?: string          // text below the dots (default "Connecting to the main server")
 *  - onFinish?: () => void     // called once when duration elapses
 */
function SplashScreen({
  durationMs = 4000,
  dotPeriodMs = 300,
  message = "Connecting to the main server",
  onFinish,
}) {
  const [dotCount, setDotCount] = useState(0);

  useEffect(() => {
    // Animate dots 0 → 1 → 2 → 0 → ...
    const interval = setInterval(() => {
      setDotCount((prev) => (prev + 1) % 3);
    }, dotPeriodMs);

    // Auto-finish after durationMs
    let timeout;
    if (durationMs > 0) {
      timeout = setTimeout(() => {
        clearInterval(interval);
        onFinish?.();
      }, durationMs);
    }

    return () => {
      clearInterval(interval);
      if (timeout) clearTimeout(timeout);
    };
  }, [dotPeriodMs, durationMs, onFinish]);

  return (
    <div className="splash-overlay" role="dialog" aria-label="Loading">
      {/* Logos side-by-side (left: Jaen, right: SagipBayan) */}
      <div className="splash-logos" aria-hidden="true">
        <img
          src={JaenLogo}
          alt="Jaen Seal"
          className="splash-logo splash-logo--left"
        />
        <img
          src={SagipBayanLogo}
          alt="SagipBayan Logo"
          className="splash-logo splash-logo--right"
        />
      </div>

      {/* Dots */}
      <div className="dots-container" aria-live="polite" aria-atomic="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`dot ${i <= dotCount ? "active" : ""}`} />
        ))}
      </div>

      {/* Text */}
      <h2 className="splash-text">{message}</h2>
    </div>
  );
}

export default SplashScreen;