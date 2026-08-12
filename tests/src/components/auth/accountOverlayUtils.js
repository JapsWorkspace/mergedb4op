import { createPortal } from 'react-dom';

const ICONS = {
  success: 'OK',
  error: '!',
  warning: '!',
  info: 'i'
};

export function buildAccountNotification(message, type = 'info') {
  return {
    id: `account-note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    message,
    type
  };
}

export function getAccountNotificationIcon(type) {
  return ICONS[type] || ICONS.info;
}

export function AccountNotificationPortal({ notifications, onDismiss }) {
  if (typeof document === 'undefined' || !document.body || !notifications.length) {
    return null;
  }

  return createPortal(
    <div className="notification-stack account-notification-stack">
      {notifications.map((notification) => (
        <button
          key={notification.id}
          type="button"
          className={`notification-toast ${notification.type}`}
          onClick={() => onDismiss(notification.id)}
          title="Dismiss notification"
        >
          <span className="notification-icon" aria-hidden="true">
            {getAccountNotificationIcon(notification.type)}
          </span>
          <span className="notification-text">{notification.message}</span>
        </button>
      ))}
    </div>,
    document.body
  );
}

export function AccountConfirmModal({
  open,
  title,
  message,
  details = [],
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmTone = 'primary',
  busy = false,
  onConfirm,
  onClose,
  children,
  hideCancel = false
}) {
  if (!open || typeof document === 'undefined' || !document.body) {
    return null;
  }

  return createPortal(
    <div
      className="account-modal-backdrop"
      role="dialog"
      aria-modal="true"
      onMouseDown={onClose}
    >
      <div
        className="account-modal-card"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="account-modal-head">
          <h3 className="account-modal-title">{title}</h3>
          <button
            type="button"
            className="account-modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            x
          </button>
        </div>

        {message && <p className="account-modal-message">{message}</p>}

        {details.length > 0 && (
          <div className="account-modal-details">
            {details.map((detail) => (
              <div className="account-modal-detail" key={detail.label}>
                <span>{detail.label}</span>
                <strong>{detail.value || '-'}</strong>
              </div>
            ))}
          </div>
        )}

        {children}

        <div className="account-modal-actions">
          {!hideCancel && (
            <button
              type="button"
              className="account-modal-btn account-modal-btn-secondary"
              onClick={onClose}
              disabled={busy}
            >
              {cancelLabel}
            </button>
          )}

          <button
            type="button"
            className={`account-modal-btn account-modal-btn-${confirmTone}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
