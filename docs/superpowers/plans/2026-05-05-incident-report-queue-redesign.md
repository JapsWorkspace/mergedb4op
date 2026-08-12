# Incident Report Queue Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the DRRMO incident report screen so the left queue, center map, and new right approved queue reflect real workflow status and priority while preserving the existing detail panel, filters, and map behavior.

**Architecture:** Keep the implementation frontend-only inside the existing incident screen. Add small workflow/priority helper functions in `IncidentReport.js`, derive three filtered views from the same incident dataset, then restyle the queue/map shell in `IncidentReporting.css` so the selected-incident review panel still works unchanged below.

**Tech Stack:** React, React Router, Axios, React Leaflet, plain CSS

---

## File Structure

- Modify: `tests/src/components/IncidentReport.js`
  - Add helper functions for workflow status, priority normalization, rejected detection, and priority/newest sorting.
  - Split the current single filtered incident list into queue/map/approved derived lists.
  - Update queue card markup, legends, map markers source, and selection fallback.
- Modify: `tests/src/components/css/IncidentReporting.css`
  - Convert the incident middle section into a three-column responsive layout.
  - Add compact queue card styles for left and right queues.
  - Add priority legend colors using the same families as the summary cards.
  - Keep map and bottom detail panel visually stable.

## Task 1: Add workflow and priority helpers

**Files:**
- Modify: `tests/src/components/IncidentReport.js`

- [ ] **Step 1: Write the failing helper tests as a colocated dev-only block to guide implementation**

Use these scenarios as the target behavior while implementing:

```js
// target behavior checklist
// getIncidentWorkflowStatus({ status: "resolved" }) => "resolved"
// getIncidentWorkflowStatus({ status: "approved" }) => "onProcess"
// getIncidentWorkflowStatus({ status: "onProcess" }) => "onProcess"
// getIncidentWorkflowStatus({ status: "reported", verification: { status: "approved" } }) => "reported"
// getIncidentPriority({ level: "critical" }) => "critical"
// getIncidentPriority({ level: "HIGH" }) => "high"
// getIncidentPriority({ level: "" }) => "low"
// sortIncidentsByPriorityThenNewest([...]) places critical newest first, then high newest first, etc.
```

- [ ] **Step 2: Inspect the current helper area near the top of `IncidentReport.js`**

Run:

```powershell
Get-Content -Path 'C:\Users\jason\OneDrive\Desktop\gaganaDapat\tests\src\components\IncidentReport.js' -TotalCount 260
```

Expected: existing formatting and status helper functions are visible near the top of the file.

- [ ] **Step 3: Add minimal workflow and priority helpers near the other format helpers**

Insert logic shaped like this:

```js
const INCIDENT_PRIORITY_ORDER = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const getIncidentCreatedTime = (incident) =>
  new Date(
    incident?.createdAt ||
      incident?.updatedAt ||
      incident?.date ||
      incident?.reportedAt ||
      0
  ).getTime() || 0;

const getIncidentPriority = (incident) => {
  const normalized = safeLower(incident?.level);
  if (normalized.includes("critical")) return "critical";
  if (normalized.includes("high")) return "high";
  if (normalized.includes("medium")) return "medium";
  return "low";
};

const getIncidentWorkflowStatus = (incident) => {
  const status = safeLower(incident?.status);
  if (status === "resolved") return "resolved";
  if (status === "approved" || status === "onprocess" || status === "on_process") {
    return "onProcess";
  }
  return "reported";
};

const isIncidentRejected = (incident) =>
  safeLower(incident?.verification?.status) === "rejected";

const sortIncidentsByPriorityThenNewest = (items) =>
  [...items].sort((a, b) => {
    const aRejected = isIncidentRejected(a) ? 1 : 0;
    const bRejected = isIncidentRejected(b) ? 1 : 0;
    if (aRejected !== bRejected) return aRejected - bRejected;

    const aPriority = INCIDENT_PRIORITY_ORDER[getIncidentPriority(a)] ?? 99;
    const bPriority = INCIDENT_PRIORITY_ORDER[getIncidentPriority(b)] ?? 99;
    if (aPriority !== bPriority) return aPriority - bPriority;

    return getIncidentCreatedTime(b) - getIncidentCreatedTime(a);
  });
```

- [ ] **Step 4: Replace status-label/tone helpers to consume workflow status instead of raw AI assumptions where needed**

Update the status label/tone helpers to normalize through `getIncidentWorkflowStatus`:

```js
const getIncidentStatusLabel = (statusOrIncident) => {
  const normalized =
    typeof statusOrIncident === "object"
      ? getIncidentWorkflowStatus(statusOrIncident)
      : getIncidentWorkflowStatus({ status: statusOrIncident });

  if (normalized === "onProcess") return "On Process";
  if (normalized === "resolved") return "Resolved";
  return "Reported";
};

const getIncidentStatusTone = (statusOrIncident) => {
  const normalized =
    typeof statusOrIncident === "object"
      ? getIncidentWorkflowStatus(statusOrIncident)
      : getIncidentWorkflowStatus({ status: statusOrIncident });

  if (normalized === "onProcess") return "info";
  if (normalized === "resolved") return "success";
  return "warning";
};
```

- [ ] **Step 5: Run the build to verify helpers compile**

Run:

```powershell
npm.cmd run build
```

From: `C:\Users\jason\OneDrive\Desktop\gaganaDapat\tests`

Expected: build succeeds with only the existing unrelated warnings.

## Task 2: Derive left queue, approved queue, and map lists

**Files:**
- Modify: `tests/src/components/IncidentReport.js`

- [ ] **Step 1: Replace the single `filteredIncidents` derivation with a base filtered dataset**

Refactor the existing `filteredIncidents` `useMemo` into a base filtered array:

```js
const baseFilteredIncidents = useMemo(() => {
  const term = safeLower(search);
  let list = [...incidents];

  if (term) {
    list = list.filter((item) => {
      const ai = getAIReviewSummary(item.verification);
      return (
        safeLower(item.type).includes(term) ||
        safeLower(item.level).includes(term) ||
        safeLower(item.location).includes(term) ||
        safeLower(item.description).includes(term) ||
        safeLower(item.usernames).includes(term) ||
        safeLower(item.phone).includes(term) ||
        safeLower(ai.status).includes(term) ||
        safeLower(ai.verdict).includes(term)
      );
    });
  }

  if (incidentStatusFilter !== "all") {
    list = list.filter(
      (item) => getIncidentWorkflowStatus(item) === incidentStatusFilter
    );
  }

  if (verificationFilter !== "all") {
    list = list.filter(
      (item) => (item.verification?.status || "pending") === verificationFilter
    );
  }

  return list;
}, [
  getAIReviewSummary,
  incidentStatusFilter,
  incidents,
  search,
  verificationFilter,
]);
```

- [ ] **Step 2: Add queue-specific derived lists**

Add these memos after the base filter:

```js
const activeQueueIncidents = useMemo(() => {
  const unresolved = baseFilteredIncidents.filter(
    (item) => getIncidentWorkflowStatus(item) !== "resolved"
  );
  const reportedOnly = unresolved.filter(
    (item) => getIncidentWorkflowStatus(item) === "reported"
  );
  return sortIncidentsByPriorityThenNewest(reportedOnly);
}, [baseFilteredIncidents]);

const approvedQueueIncidents = useMemo(() => {
  const approved = baseFilteredIncidents.filter(
    (item) => getIncidentWorkflowStatus(item) === "onProcess"
  );
  return sortIncidentsByPriorityThenNewest(approved);
}, [baseFilteredIncidents]);

const visibleMapIncidents = useMemo(() => {
  return baseFilteredIncidents.filter(
    (item) =>
      getIncidentWorkflowStatus(item) !== "resolved" && !isIncidentRejected(item)
  );
}, [baseFilteredIncidents]);

const selectableIncidents = useMemo(
  () => [...activeQueueIncidents, ...approvedQueueIncidents],
  [activeQueueIncidents, approvedQueueIncidents]
);
```

- [ ] **Step 3: Update selected incident fallback to use the combined visible queues**

Change the current selection `useEffect` to:

```js
useEffect(() => {
  if (!selectableIncidents.length) {
    setSelectedIncidentId(null);
    return;
  }

  if (!selectedIncidentId) {
    setSelectedIncidentId(selectableIncidents[0]._id);
    return;
  }

  const stillVisible = selectableIncidents.some(
    (item) => String(item._id) === String(selectedIncidentId)
  );

  if (!stillVisible) {
    setSelectedIncidentId(selectableIncidents[0]._id);
  }
}, [selectableIncidents, selectedIncidentId]);
```

- [ ] **Step 4: Update summary counters only if they already depend on the old raw status logic**

Keep current summary structure, but where the page uses raw incident status in visible workflow labels, normalize through `getIncidentWorkflowStatus`.

- [ ] **Step 5: Run the build to verify the derived lists compile**

Run:

```powershell
npm.cmd run build
```

Expected: build succeeds with only existing warnings.

## Task 3: Update queue cards, legends, and map markers

**Files:**
- Modify: `tests/src/components/IncidentReport.js`
- Modify: `tests/src/components/css/IncidentReporting.css`

- [ ] **Step 1: Replace the left queue legend with priority-only legend chips**

Update the left panel legend JSX to:

```jsx
<div className="incident-queue-legend incident-priority-legend">
  <span className="mini-status priority-critical">critical</span>
  <span className="mini-status priority-high">high</span>
  <span className="mini-status priority-medium">medium</span>
  <span className="mini-status priority-low">low</span>
</div>
```

- [ ] **Step 2: Replace queue card badge content**

For queue cards, use:

```jsx
const priority = getIncidentPriority(incident);
const aiStatus = incident.verification?.status || "pending";

<div className="incident-queue-top">
  <div>
    <div className="incident-queue-title">{incident.type || "Incident"}</div>
    <div className="incident-queue-subtitle">
      <FaCalendarDays aria-hidden="true" />
      {formatDateTime(
        incident.createdAt || incident.updatedAt || incident.date || incident.reportedAt
      )}
    </div>
  </div>

  <div className="incident-queue-badge-stack">
    <span className={`mini-status ai-tag ${getVerificationTone(aiStatus)}`}>
      AI {aiStatus}
    </span>
  </div>
</div>

<div className="incident-queue-meta">
  <span className={`mini-status priority-chip priority-${priority}`}>
    {priority}
  </span>
</div>
```

- [ ] **Step 3: Feed the left queue from `activeQueueIncidents` and create a right queue from `approvedQueueIncidents`**

Render:

```jsx
{activeQueueIncidents.map((incident) => /* left queue card */)}
{approvedQueueIncidents.map((incident) => /* right queue card */)}
```

Keep both queues wired to:

```jsx
onClick={() => handleQueueSelect(incident._id)}
```

- [ ] **Step 4: Change map markers to use `visibleMapIncidents`**

Replace:

```jsx
{filteredIncidents.map((incident) => {
```

with:

```jsx
{visibleMapIncidents.map((incident) => {
```

- [ ] **Step 5: Replace the map legend with workflow-only chips**

Use:

```jsx
<div className="incident-queue-legend incident-workflow-legend">
  <span className="mini-status warning">reported</span>
  <span className="mini-status info">on process</span>
  <span className="mini-status success">resolved</span>
</div>
```

- [ ] **Step 6: Add CSS for priority colors and compact queues**

Add/update CSS for:

```css
.priority-critical {
  background: var(--ir-danger-soft);
  color: var(--ir-danger);
  border-color: #f1c5c5;
}

.priority-high {
  background: var(--ir-warning-soft);
  color: var(--ir-warning);
  border-color: #fed7aa;
}

.priority-medium {
  background: var(--ir-info-soft);
  color: var(--ir-info);
  border-color: #bfdbfe;
}

.priority-low {
  background: var(--ir-success-soft);
  color: var(--ir-success);
  border-color: #bfe0c7;
}

.ai-tag {
  justify-self: end;
}
```

- [ ] **Step 7: Run the build and verify queue/map integration**

Run:

```powershell
npm.cmd run build
```

Expected: build succeeds and no new compile errors are introduced.

## Task 4: Convert the middle layout into left queue, center map, right approved queue

**Files:**
- Modify: `tests/src/components/IncidentReport.js`
- Modify: `tests/src/components/css/IncidentReporting.css`

- [ ] **Step 1: Change the middle layout grid to three columns**

Update the middle layout wrapper so it contains:

```jsx
<section className="incident-main-layout incident-three-panel-layout">
  <aside className="incident-left-panel">...</aside>
  <section className="incident-map-panel">...</section>
  <aside className="incident-right-panel">...</aside>
</section>
```

- [ ] **Step 2: Keep the existing map panel in the center**

Do not replace the current map stage logic. Only move surrounding legend/header content as needed.

- [ ] **Step 3: Add the approved queue panel markup**

Use a panel shell similar to the left queue:

```jsx
<aside className="incident-right-panel">
  <div className="panel-head">
    <div>
      <h2>Approved Queue</h2>
      <p>Incidents currently approved or in active handling.</p>
    </div>
  </div>

  <div className="incident-approved-list">
    {approvedQueueIncidents.length ? (
      approvedQueueIncidents.map((incident) => /* compact approved card */)
    ) : (
      <div className="incident-empty-card">
        <div>
          <span className="empty-state-icon"><FaCircleCheck /></span>
          <strong>No approved incidents</strong>
          <span>Approved or on-process incidents will appear here.</span>
        </div>
      </div>
    )}
  </div>
</aside>
```

- [ ] **Step 4: Add CSS for the right panel and responsive stacking**

Add layout rules like:

```css
.incident-three-panel-layout {
  grid-template-columns: 320px minmax(0, 1fr) 320px;
}

.incident-right-panel {
  min-height: 0;
  background: var(--ir-surface);
  border: 1px solid var(--ir-border);
  border-radius: var(--ir-radius-xl);
  box-shadow: var(--ir-shadow);
  overflow: hidden;
}

.incident-approved-list {
  min-height: 0;
  max-height: calc(690px - 79px);
  overflow: auto;
  padding: 14px;
  display: grid;
  gap: 12px;
  align-content: start;
}
```

And at narrower breakpoints:

```css
@media (max-width: 1380px) {
  .incident-three-panel-layout {
    grid-template-columns: 300px minmax(0, 1fr) 300px;
  }
}

@media (max-width: 1180px) {
  .incident-three-panel-layout {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5: Run the build and verify responsive layout compiles**

Run:

```powershell
npm.cmd run build
```

Expected: build succeeds and the CSS compiles without selector errors.

## Task 5: Regression check for behavior and visual stability

**Files:**
- Modify: `tests/src/components/IncidentReport.js` (only if tiny regressions are discovered)
- Modify: `tests/src/components/css/IncidentReporting.css` (only if tiny regressions are discovered)

- [ ] **Step 1: Verify search/filter behavior in code paths**

Check that:

- left queue uses `baseFilteredIncidents`
- right queue uses `baseFilteredIncidents`
- map uses `baseFilteredIncidents` minus rejected/resolved visibility rules
- selected incident falls back from combined visible queue lists

- [ ] **Step 2: Verify clicking from either queue still updates the bottom panel**

Confirm both left and right queue cards call:

```js
handleQueueSelect(incident._id)
```

- [ ] **Step 3: Verify resolved incidents are absent from the left queue**

Confirm the left queue source is filtered by:

```js
getIncidentWorkflowStatus(item) === "reported"
```

- [ ] **Step 4: Verify map excludes rejected incidents**

Confirm marker rendering source is:

```js
!isIncidentRejected(item)
```

- [ ] **Step 5: Run the final build**

Run:

```powershell
npm.cmd run build
```

Expected: build succeeds with only the pre-existing unrelated warnings.
