import { useRef, useState } from "react";

const STREAM_API_BASE_URL = (
  process.env.REACT_APP_STREAM_API_URL ||
  process.env.REACT_APP_API_URL ||
  "https://gaganadapat.onrender.com"
).replace(/\/+$/, "");

export default function VideoStream() {
  const [points, setPoints] = useState([]);

 const handleClick = async (e) => {
  const rect = e.target.getBoundingClientRect();

  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;

  console.log("NORMALIZED:", x, y);

  const newPoints = [...points, { x, y }];
  setPoints(newPoints);

  if (newPoints.length === 2) {
    await fetch(`${STREAM_API_BASE_URL}/set-line`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points: newPoints })
    });

    setPoints([]);
  }
};
  return (
  <div style={{ position: "relative", width: 800 }}>
    
    <img
      src={`${STREAM_API_BASE_URL}/video`}
      style={{
        width: "800px",
        height: "auto",
        display: "block"
      }}
    />

    <div
      onClick={handleClick}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "800px",
        height: "100%",
        cursor: "crosshair",
        zIndex: 10
      }}
    />

    <p>Click 2 points to draw line</p>
  </div>
);
}
