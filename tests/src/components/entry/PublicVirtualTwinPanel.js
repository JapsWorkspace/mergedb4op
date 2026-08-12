import React, { useRef } from "react";

export default function PublicVirtualTwinPanel() {
  const iframeRef = useRef(null);

  return (
    <div className="landing-twin-stage">
      <div className="landing-twin-data-card landing-twin-data-card--public">
        <div className="landing-twin-topbar landing-twin-topbar--public">
          <div>
            <span className="landing-twin-kicker">Public Flood Preview</span>
            <h2>Virtual Twin</h2>
          </div>
        </div>

        <div className="landing-twin-board landing-twin-board--public landing-twin-board--virtual">
          <div className="landing-twin-frame-card landing-twin-frame-card--full">
            <iframe
              ref={iframeRef}
              title="SagipBayan Virtual Twin"
              src="/unity/virtual-twin/index.html"
              className="landing-twin-frame"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  );
}
