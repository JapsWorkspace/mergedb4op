import { FaFilePdf } from 'react-icons/fa';

export default function AccomplishedReportPanel({
  summary,
  visibility,
  formatMoney = (value) => Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }),
  formatDate = (value) => {
    if (!value) return '-';
    try {
      return new Date(value).toLocaleDateString();
    } catch {
      return '-';
    }
  },
  exporting = false,
  onExport
}) {
  const totals = summary?.totals || {};
  const perFamilyRows = Array.isArray(summary?.perFamilyFoodPackRows)
    ? summary.perFamilyFoodPackRows
    : [];

  return (
    <section className="rrf-dafac-report">
      <div className="rrf-dafac-panel-head">
        <div>
          <h3>Accomplished Report</h3>
          <p>
            Final summary of the confirmed DAFAC distribution for this received request.
          </p>
        </div>

        <button
          type="button"
          className="rrf-btn rrf-btn-secondary rrf-btn-small"
          onClick={onExport}
          disabled={exporting}
        >
          <FaFilePdf />
          {exporting ? 'Exporting…' : 'Export Accomplished PDF'}
        </button>
      </div>

      <div className="rrf-dafac-report-grid">
        {visibility?.showsFoodPacks ? (
          <div className="rrf-dafac-report-card accent-food">
            <span>Food Packs</span>
            <strong>{totals.foodPacksUsed || 0}</strong>
            <small>{totals.foodPacksCap || 0} received</small>
          </div>
        ) : null}

        {visibility?.showsMonetary ? (
          <div className="rrf-dafac-report-card accent-money">
            <span>Monetary Used</span>
            <strong>PHP {formatMoney(totals.monetaryUsed || 0)}</strong>
            <small>PHP {formatMoney(totals.monetaryCap || 0)} received</small>
          </div>
        ) : null}

        {visibility?.showsAppliances ? (
          <div className="rrf-dafac-report-card accent-appliance">
            <span>Appliance Units</span>
            <strong>{totals.applianceUnitsUsed || 0}</strong>
            <small>{totals.applianceUnitsCap || 0} received</small>
          </div>
        ) : null}

          <div className="rrf-dafac-report-card accent-neutral">
            <span>Completed Families</span>
            <strong>{summary?.completedCount || 0}</strong>
            <small>
              Latest completion {summary?.latestCompletedAt ? formatDate(summary.latestCompletedAt) : '-'}
            </small>
          </div>
      </div>

      <div className="rrf-dafac-report-grid secondary">
        {visibility?.showsFoodPacks ? (
          <div className="rrf-dafac-report-card accent-neutral">
            <span>Food Packs Remaining</span>
            <strong>{totals.foodPacksRemaining || 0}</strong>
            <small>Still available after family distribution</small>
          </div>
        ) : null}
        {visibility?.showsMonetary ? (
          <div className="rrf-dafac-report-card accent-neutral">
            <span>Monetary Remaining</span>
            <strong>PHP {formatMoney(totals.monetaryRemaining || 0)}</strong>
            <small>Undistributed amount after confirmation</small>
          </div>
        ) : null}
        {visibility?.showsAppliances ? (
          <div className="rrf-dafac-report-card accent-neutral">
            <span>Appliance Remaining</span>
            <strong>{totals.applianceUnitsRemaining || 0}</strong>
            <small>Undistributed units after confirmation</small>
          </div>
        ) : null}
        <div className="rrf-dafac-report-card accent-neutral">
          <span>Family Cards</span>
          <strong>{perFamilyRows.length}</strong>
          <small>Saved beneficiary distribution card(s)</small>
        </div>
      </div>

      <div className="rrf-dafac-inline-table">
        <div className="rrf-dafac-inline-head">
          <h4>Per-Family Distribution Summary</h4>
        </div>

        {perFamilyRows.length ? (
          <div className="rrf-table-wrapper">
            <table className="rrf-table rrf-dafac-table">
              <thead>
                <tr>
                  <th>Serial No.</th>
                  <th>Family Head</th>
                  {visibility?.showsFoodPacks ? <th>Food Packs</th> : null}
                  {visibility?.showsMonetary ? <th>Monetary</th> : null}
                  {visibility?.showsAppliances ? <th>Appliance</th> : null}
                  <th>Distribution Date</th>
                </tr>
              </thead>
              <tbody>
                {perFamilyRows.map((row) => (
                  <tr key={row.recordId || row.serialNo}>
                    <td>{row.serialNo}</td>
                    <td className="rrf-left-cell">
                      <strong>{row.familyName}</strong>
                    </td>
                    {visibility?.showsFoodPacks ? <td>{row.foodPacksReceived}</td> : null}
                    {visibility?.showsMonetary ? (
                      <td>PHP {formatMoney(row.monetaryAmountReceived || 0)}</td>
                    ) : null}
                    {visibility?.showsAppliances ? <td>{row.applianceUnitsReceived || 0}</td> : null}
                    <td>{row.distributionDate ? formatDate(row.distributionDate) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rrf-dafac-empty">
            <h4>No completed family cards yet</h4>
            <p>Save a family distribution in Step 6 to populate the accomplished report.</p>
          </div>
        )}
      </div>
    </section>
  );
}
