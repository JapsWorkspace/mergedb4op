// components/DashboardCard.jsx
import React from 'react';
import '../components/css/DashboardCard.css';

function DashboardCard({
  title,
  description,     // canonical prop
  desc,            // alias used in AdminDashboard.jsx
  onClick,
  disabled = false,
  className = '',
  ariaLabel
}) {
  const message = typeof description !== 'undefined' ? description : desc;

  const handleKeyDown = (e) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };

  return (
    <article
      className={`dashboard-card ${className} ${disabled ? 'disabled' : ''}`.trim()}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={ariaLabel || title}
      onClick={!disabled ? onClick : undefined}
      onKeyDown={handleKeyDown}
    >
      <h3 className="card-title">{title}</h3>
      {message && <p className="card-desc">{message}</p>}
      {disabled && <small className="card-hint">Awaiting delivery</small>}
    </article>
  );
}

export default DashboardCard;