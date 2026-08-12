import "../css/Confirm.css";

export default function Confirm({ open, title, message, onCancel, onConfirm }) {
  if (!open) return null;

  return (
    <div
      className="confirm-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="confirm-title">{title || "Confirm"}</h3>
        <p className="confirm-message">{message || "Are you sure?"}</p>

        <div className="confirm-actions">
          <button
            className="confirm-btn confirm-btn-secondary"
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="confirm-btn confirm-btn-primary"
            type="button"
            onClick={onConfirm}
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
