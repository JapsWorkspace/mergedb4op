import { FaCheckCircle, FaPen, FaTrash } from 'react-icons/fa';

const safeNumber = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildFamilyName = (record) => {
  const surname = String(record?.headOfFamily?.surname || '').trim();
  const firstName = String(record?.headOfFamily?.firstName || '').trim();
  const middleName = String(record?.headOfFamily?.middleName || '').trim();
  const given = [firstName, middleName].filter(Boolean).join(' ');

  if (surname && given) return `${surname}, ${given}`;
  return surname || given || record?.signOff?.familyHeadPrintedName || 'Family record';
};

export default function DafacDistributionCard({
  record,
  visibility,
  onEdit,
  onDelete
}) {
  const familyMembers = Array.isArray(record?.familyMembers) ? record.familyMembers : [];
  const latestMembers = familyMembers.slice(0, 2);
  const remarks = String(record?.remarks || '').trim();
  const applianceUnits = safeNumber(
    record?.distribution?.applianceUnitsReceived ??
      (Array.isArray(record?.distribution?.applianceItems)
        ? record.distribution.applianceItems.reduce(
            (sum, item) => sum + Number(item?.quantityReceived || 0),
            0
          )
        : 0)
  );

  return (
    <article className="rrf-dafac-card">
      <div className="rrf-dafac-card-head">
        <div>
          <span className="rrf-dafac-serial">{record?.serialNo || 'Pending Serial'}</span>
          <h3>{buildFamilyName(record)}</h3>
        </div>
        <span className="rrf-dafac-card-tag">
          {record?.distributionStatus === 'draft' ? null : <FaCheckCircle />}
          {record?.distributionStatus === 'draft' ? 'Draft' : 'Saved'}
        </span>
      </div>

      <div className="rrf-dafac-card-body">
        <div className="rrf-dafac-readonly-grid">
          <label>
            <span>Evacuation Center</span>
            <input type="text" value={record?.evacuationCenterName || ''} readOnly />
          </label>
          <label>
            <span>Date</span>
            <input
              type="text"
              value={record?.distributionDate ? new Date(record.distributionDate).toLocaleDateString() : ''}
              readOnly
            />
          </label>
          <label>
            <span>Surname</span>
            <input type="text" value={record?.headOfFamily?.surname || ''} readOnly />
          </label>
          <label>
            <span>First Name</span>
            <input type="text" value={record?.headOfFamily?.firstName || ''} readOnly />
          </label>
          {visibility?.showsFoodPacks ? (
            <label>
              <span>Food Packs</span>
              <input
                type="text"
                value={safeNumber(record?.distribution?.foodPacksReceived)}
                readOnly
              />
            </label>
          ) : null}
          {visibility?.showsMonetary ? (
            <label>
              <span>Monetary</span>
              <input
                type="text"
                value={`PHP ${safeNumber(record?.distribution?.monetaryAmountReceived).toLocaleString()}`}
                readOnly
              />
            </label>
          ) : null}
          {visibility?.showsAppliances ? (
            <label>
              <span>Appliance</span>
              <input
                type="text"
                value={applianceUnits}
                readOnly
              />
            </label>
          ) : null}
        </div>

        <div className="rrf-dafac-readonly-members">
          <div className="rrf-dafac-readonly-title">Family members</div>
          <div className="rrf-dafac-chip-row">
            {latestMembers.map((member, index) => (
              <span key={`${member.fullName || 'member'}-${index}`} className="rrf-dafac-chip">
                {member.fullName || 'Unnamed member'}
              </span>
            ))}
            {familyMembers.length > latestMembers.length ? (
              <span className="rrf-dafac-chip muted">+{familyMembers.length - latestMembers.length} more</span>
            ) : null}
            {familyMembers.length === 0 ? (
              <span className="rrf-dafac-chip muted">No members listed</span>
            ) : null}
          </div>
        </div>

        <div className="rrf-dafac-chip-row">
          {record?.siteLabel ? <span className="rrf-dafac-chip">{record.siteLabel}</span> : null}
          <span className="rrf-dafac-chip">{familyMembers.length} member(s)</span>
          {visibility?.showsAppliances ? (
            <span className="rrf-dafac-chip">{applianceUnits} appliance unit(s)</span>
          ) : null}
        </div>

        {remarks ? (
          <div className="rrf-dafac-readonly-remarks">
            <span>Remarks</span>
            <textarea value={remarks} readOnly />
          </div>
        ) : null}

        <div className="rrf-dafac-signoff-grid">
          <label>
            <span>Family Head</span>
            <input type="text" value={record?.signOff?.familyHeadPrintedName || ''} readOnly />
          </label>
          <label>
            <span>Barangay Officer</span>
            <input type="text" value={record?.signOff?.barangayOfficerPrintedName || ''} readOnly />
          </label>
        </div>
      </div>

      <div className="rrf-dafac-card-actions">
        <button
          type="button"
          className="rrf-btn rrf-btn-secondary rrf-btn-small"
          onClick={() => onEdit(record)}
        >
          <FaPen />
          Edit
        </button>
        <button
          type="button"
          className="rrf-btn rrf-btn-danger rrf-btn-small"
          onClick={() => onDelete(record)}
        >
          <FaTrash />
          Delete
        </button>
      </div>
    </article>
  );
}
