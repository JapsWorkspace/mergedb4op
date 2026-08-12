import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardShell from '../layout/DashboardShell';

function BarangayDashboard() {
  const navigate = useNavigate();

  
  useEffect(() => {
    const storedRole = localStorage.getItem('role');
    if (!storedRole) {
      navigate('/'); // redirect to login
    }
  }, [navigate]);

  return (
    <DashboardShell>
      <div className="admin-wrapper">
        <div className="admin-container">
          {/* Page title (styled like admin) */}
          <h2 className="admin-title">Barangay Dashboard</h2>

          {/* Quick Actions (replaces the old DashboardCard grid) */}
          <section className="quick-actions">
            <div className="qa-grid">
              <button
                className="qa-item"
                onClick={() => navigate('/barangay/relief-request')}
              >
                Relief Request
              </button>

              <button
                className="qa-item"
                onClick={() => navigate('/barangay/messages')}
              >
                Messages &amp; Announcements
              </button>

              <button
                className="qa-item"
                onClick={() => navigate('/barangay/relief-status')}
              >
                Relief Distribution Status
              </button>

              {/* If/when you add more:
              <button
                className="qa-item"
                onClick={() => navigate('/barangay/account-settings')}
              >
                Edit Accounts
              </button>
              */}
            </div>
          </section>
        </div>
      </div>
    </DashboardShell>
  );
}

export default BarangayDashboard;