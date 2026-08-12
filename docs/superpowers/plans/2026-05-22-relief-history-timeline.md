# Relief History Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a separate `Relief History` page that shows one barangay at a time request timelines with server-enforced role filtering, while also removing the sidebar role subtitle and hiding empty sidebar groups.

**Architecture:** Extend the existing relief request backend with a dedicated history endpoint that normalizes request and release records into timeline-ready data. Add a new frontend page and route that reuse existing support-type helpers and dashboard shell patterns. Update the shared sidebar so visual cleanup applies across role variants without duplicating navigation logic.

**Tech Stack:** Express, Mongoose, React, React Router, Jest, existing relief support-type helpers and dashboard layout components.

---

## File Structure

### Backend

- Modify: `C:\Users\jason\OneDrive\Desktop\Merged\merged\MyApp\server\routes\reliefRequestRoutes.js`
  - Register the new relief-history endpoint under the existing relief request route group.
- Modify: `C:\Users\jason\OneDrive\Desktop\Merged\merged\MyApp\server\controllers\reliefRequestController.js`
  - Add timeline normalization helpers and the new controller action for barangay-focused history.
- Modify: `C:\Users\jason\OneDrive\Desktop\Merged\merged\MyApp\server\models\ReliefRequest.js`
  - Only if needed to confirm field names or populate metadata for timeline shaping; avoid schema changes unless the current model blocks normalization.
- Modify: `C:\Users\jason\OneDrive\Desktop\Merged\merged\MyApp\server\models\ReliefRelease.js`
  - Only if needed to confirm release payload fields used in timeline summaries; avoid schema changes unless necessary.

### Frontend

- Modify: `C:\Users\jason\OneDrive\Desktop\Merged\merged\tests\src\App.js`
  - Add the separate `Relief History` routes for admin, accountant, and DRRMO.
- Modify: `C:\Users\jason\OneDrive\Desktop\Merged\merged\tests\src\components\layout\Sidebar.js`
  - Remove the role subtitle and hide empty navigation sections after filtering.
- Create: `C:\Users\jason\OneDrive\Desktop\Merged\merged\tests\src\components\relief\ReliefHistoryPage.js`
  - New barangay-focused timeline page.
- Create: `C:\Users\jason\OneDrive\Desktop\Merged\merged\tests\src\components\relief\reliefHistoryUtils.js`
  - Small frontend-only formatting and grouping helpers to keep the page component readable.
- Create: `C:\Users\jason\OneDrive\Desktop\Merged\merged\tests\src\components\css\ReliefHistoryPage.css`
  - Page-specific styles for the timeline layout.

### Tests

- Create: `C:\Users\jason\OneDrive\Desktop\Merged\merged\tests\src\components\relief\reliefHistoryUtils.test.js`
  - Unit tests for small formatting and visibility helpers used by the new page.
- Create or modify: `C:\Users\jason\OneDrive\Desktop\Merged\merged\tests\src\components\relief\ReliefHistoryPage.test.js`
  - Render and interaction coverage for barangay selection, empty states, and role-filtered timeline summaries.
- Create or modify: `C:\Users\jason\OneDrive\Desktop\Merged\merged\tests\src\components\layout\Sidebar.test.js`
  - Verify subtitle removal and hidden empty groups if a sidebar test file already exists; otherwise create one.

## Task 1: Add the Relief History backend endpoint

**Files:**
- Modify: `C:\Users\jason\OneDrive\Desktop\Merged\merged\MyApp\server\routes\reliefRequestRoutes.js`
- Modify: `C:\Users\jason\OneDrive\Desktop\Merged\merged\MyApp\server\controllers\reliefRequestController.js`
- Test: existing backend relief request test harness or a focused manual API verification if no automated backend suite exists for this controller

- [ ] **Step 1: Write the failing API behavior check**

Add a temporary request contract note at the top of the task implementation workspace and use this as the target behavior:

```js
// GET /api/relief-requests/history?barangayId=<id>
// admin/accountant: includes monetary + non-monetary timeline events
// drrmo: excludes pure monetary requests and redacts monetary-only event details
// response shape:
// {
//   barangays: [{ _id, name }],
//   selectedBarangay: { _id, name } | null,
//   requests: [
//     {
//       _id,
//       requestNo,
//       barangayName,
//       supportTypes,
//       status,
//       currentStage,
//       totals,
//       fulfillment,
//       timelineEvents: [...]
//     }
//   ]
// }
```

- [ ] **Step 2: Run a manual route check to confirm the endpoint does not exist yet**

Run from the server project:

```powershell
rg -n "history" "C:\Users\jason\OneDrive\Desktop\Merged\merged\MyApp\server\routes\reliefRequestRoutes.js"
```

Expected: no relief-history route is registered yet.

- [ ] **Step 3: Add the new route**

Update `reliefRequestRoutes.js` to register the route near the other authenticated GET endpoints:

```js
router.get("/history", requireLogin, controller.getReliefRequestHistory);
```

- [ ] **Step 4: Add minimal controller scaffolding**

In `reliefRequestController.js`, add a placeholder action plus helper signatures before filling them in:

```js
const canViewReliefHistoryRole = (role = "") =>
  ["admin", "accountant", "drrmo"].includes(normalizeString(role).toLowerCase());

const isNonMonetaryOnlyViewer = (role = "") =>
  normalizeString(role).toLowerCase() === "drrmo";

const buildTimelineEvent = (event = {}) => ({
  type: normalizeString(event.type),
  timestamp: event.timestamp || null,
  label: normalizeString(event.label),
  message: normalizeString(event.message),
  actorRole: normalizeString(event.actorRole),
  actorName: normalizeString(event.actorName),
  requestNo: normalizeString(event.requestNo),
  releaseNo: normalizeString(event.releaseNo),
  visibleSupportTypes: Array.isArray(event.visibleSupportTypes)
    ? event.visibleSupportTypes
    : [],
  monetaryAmount: toNumber(event.monetaryAmount),
  foodPackCount: toNumber(event.foodPackCount),
  applianceItems: Array.isArray(event.applianceItems) ? event.applianceItems : [],
});

const getReliefRequestHistory = async (req, res) => {
  return res.status(501).json({ message: "Not implemented yet." });
};
```

- [ ] **Step 5: Implement the minimal data query and authorization**

Replace the placeholder with the first working version:

```js
const getReliefRequestHistory = async (req, res) => {
  try {
    const role = normalizeString(req.user?.role || req.session?.role).toLowerCase();

    if (!canViewReliefHistoryRole(role)) {
      return res.status(403).json({ message: "You are not allowed to view relief history." });
    }

    const barangays = await Barangay.find({})
      .select("_id name")
      .sort({ name: 1 })
      .lean();

    const selectedBarangayId = normalizeString(req.query.barangayId || req.query.barangay || "");
    const selectedBarangay = barangays.find(
      (item) => String(item?._id || "") === selectedBarangayId
    ) || null;

    if (!selectedBarangay) {
      return res.json({
        barangays,
        selectedBarangay: null,
        requests: [],
      });
    }

    const requests = await ReliefRequest.find({
      barangayId: selectedBarangay._id,
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      barangays,
      selectedBarangay,
      requests,
    });
  } catch (error) {
    console.error("Failed to load relief history:", error);
    return res.status(500).json({ message: "Failed to load relief history." });
  }
};
```

- [ ] **Step 6: Verify the route is wired**

Run:

```powershell
rg -n "getReliefRequestHistory|/history" "C:\Users\jason\OneDrive\Desktop\Merged\merged\MyApp\server\routes\reliefRequestRoutes.js" "C:\Users\jason\OneDrive\Desktop\Merged\merged\MyApp\server\controllers\reliefRequestController.js"
```

Expected: both the route and controller action are present.

- [ ] **Step 7: Commit**

```bash
git add MyApp/server/routes/reliefRequestRoutes.js MyApp/server/controllers/reliefRequestController.js
git commit -m "feat(server): add relief history endpoint scaffold"
```

## Task 2: Normalize request and release records into timeline events

**Files:**
- Modify: `C:\Users\jason\OneDrive\Desktop\Merged\merged\MyApp\server\controllers\reliefRequestController.js`
- Test: manual API verification against seeded/dev data

- [ ] **Step 1: Write the failing normalization target**

Use this event set as the target minimum for each request:

```js
[
  { type: "request_submitted", label: "Request submitted" },
  { type: "request_updated", label: "Request updated" },
  { type: "request_approved", label: "Request approved" },
  { type: "request_rejected", label: "Request rejected" },
  { type: "release_created", label: "Release created" },
  { type: "release_partially_fulfilled", label: "Partial release sent" },
  { type: "release_fulfilled", label: "Release sent" },
  { type: "receipt_confirmed", label: "Receipt confirmed" },
  { type: "receipt_reported_missing", label: "Marked not received" }
]
```

- [ ] **Step 2: Add helper functions for request/release shaping**

Add focused helpers in `reliefRequestController.js`:

```js
const getRequestHistoryActor = (record = {}) => ({
  actorRole: normalizeString(record?.updatedByRole || record?.reviewedByRole || record?.createdByRole),
  actorName: normalizeString(record?.updatedByName || record?.reviewedByName || record?.createdByName),
});

const buildReleaseTimelineEvents = (release = {}, request = {}) => {
  const supportTypes = getSupportTypesFromRequest(request);
  const releasedItems = Array.isArray(release?.releasedItems) ? release.releasedItems : [];
  const applianceItems = releasedItems
    .filter((item) => normalizeString(item?.category).toLowerCase().includes("appliance"))
    .map((item) => ({
      itemName: normalizeString(item?.itemName),
      category: normalizeString(item?.category),
      quantity: toNumber(item?.quantity),
    }));

  return [
    buildTimelineEvent({
      type: "release_created",
      timestamp: release?.createdAt || release?.releaseDate,
      label: "Release created",
      message: "A release record was prepared for this request.",
      actorRole: normalizeString(release?.releasedByRole || release?.createdByRole),
      actorName: normalizeString(release?.releasedByName || release?.createdByName),
      requestNo: request?.requestNo,
      releaseNo: release?.releaseNo,
      visibleSupportTypes: supportTypes,
      monetaryAmount: release?.releasedMonetaryAmount,
      foodPackCount: release?.releasedFoodPacks,
      applianceItems,
    }),
  ].filter((event) => event.timestamp);
};
```

- [ ] **Step 3: Query matching releases per selected barangay request**

Expand the endpoint query to fetch releases alongside requests:

```js
const requestIds = requests.map((item) => item._id).filter(Boolean);

const releases = await ReliefRelease.find({
  reliefRequestId: { $in: requestIds },
})
  .sort({ createdAt: -1 })
  .lean();
```

- [ ] **Step 4: Join requests and releases into timeline-ready payloads**

Build normalized request entries:

```js
const requestsWithTimeline = requests.map((request) => {
  const supportTypes = getSupportTypesFromRequest(request);
  const relatedReleases = releases.filter(
    (release) => String(release?.reliefRequestId || "") === String(request?._id || "")
  );

  const timelineEvents = [
    buildTimelineEvent({
      type: "request_submitted",
      timestamp: request?.createdAt,
      label: "Request submitted",
      message: buildRequestDemandLabel(request),
      actorRole: "barangay",
      actorName: normalizeString(request?.requestedByName || request?.barangayName),
      requestNo: request?.requestNo,
      visibleSupportTypes: supportTypes,
      monetaryAmount: request?.totals?.requestedMonetaryAmount,
      foodPackCount: request?.totals?.requestedFoodPacks,
      applianceItems: getRequestedAppliances(request),
    }),
    ...relatedReleases.flatMap((release) => buildReleaseTimelineEvents(release, request)),
  ]
    .filter((event) => event.timestamp)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return {
    ...shapeReliefRequestResponse(request),
    releases: relatedReleases,
    timelineEvents,
  };
});
```

- [ ] **Step 5: Verify timeline data is present**

Run:

```powershell
rg -n "timelineEvents|buildReleaseTimelineEvents|request_submitted|release_created" "C:\Users\jason\OneDrive\Desktop\Merged\merged\MyApp\server\controllers\reliefRequestController.js"
```

Expected: helper and payload code are present with a `timelineEvents` array in the response path.

- [ ] **Step 6: Commit**

```bash
git add MyApp/server/controllers/reliefRequestController.js
git commit -m "feat(server): normalize relief history timeline events"
```

## Task 3: Enforce role-based history filtering on the server

**Files:**
- Modify: `C:\Users\jason\OneDrive\Desktop\Merged\merged\MyApp\server\controllers\reliefRequestController.js`
- Test: manual API verification for admin/accountant/DRRMO sessions

- [ ] **Step 1: Write the failing visibility rules as code comments beside the filter helper**

```js
// drrmo:
// - exclude monetary-only requests
// - keep mixed requests
// - strip monetary amount fields from mixed timeline events
// admin/accountant:
// - no redaction
```

- [ ] **Step 2: Add support-type filtering helpers**

```js
const getVisibleSupportTypesForRole = (supportTypes = [], role = "") => {
  const normalizedRole = normalizeString(role).toLowerCase();
  if (normalizedRole !== "drrmo") {
    return supportTypes;
  }

  return supportTypes.filter(
    (item) => item === SUPPORT_TYPE_FOODPACKS || item === SUPPORT_TYPE_APPLIANCE
  );
};

const shouldHideRequestForRole = (request = {}, role = "") => {
  const normalizedRole = normalizeString(role).toLowerCase();
  if (normalizedRole !== "drrmo") return false;

  const supportTypes = getSupportTypesFromRequest(request);
  return (
    hasSupportType(supportTypes, SUPPORT_TYPE_MONETARY) &&
    !hasSupportType(supportTypes, SUPPORT_TYPE_FOODPACKS) &&
    !hasSupportType(supportTypes, SUPPORT_TYPE_APPLIANCE)
  );
};
```

- [ ] **Step 3: Add a timeline redaction helper**

```js
const redactTimelineEventForRole = (event = {}, role = "") => {
  const normalizedRole = normalizeString(role).toLowerCase();
  if (normalizedRole !== "drrmo") return event;

  return {
    ...event,
    visibleSupportTypes: getVisibleSupportTypesForRole(event.visibleSupportTypes, role),
    monetaryAmount: 0,
  };
};
```

- [ ] **Step 4: Apply the filtering before returning the response**

Update the endpoint response assembly:

```js
const filteredRequests = requestsWithTimeline
  .filter((request) => !shouldHideRequestForRole(request, role))
  .map((request) => ({
    ...request,
    supportTypes: getVisibleSupportTypesForRole(request.supportTypes, role),
    totals: {
      ...(request.totals || {}),
      requestedMonetaryAmount: isNonMonetaryOnlyViewer(role) ? 0 : toNumber(request?.totals?.requestedMonetaryAmount),
    },
    fulfillment: {
      ...(request.fulfillment || {}),
      releasedMonetaryAmount: isNonMonetaryOnlyViewer(role) ? 0 : toNumber(request?.fulfillment?.releasedMonetaryAmount),
    },
    timelineEvents: (Array.isArray(request.timelineEvents) ? request.timelineEvents : [])
      .map((event) => redactTimelineEventForRole(event, role))
      .filter((event) => Array.isArray(event.visibleSupportTypes) ? event.visibleSupportTypes.length > 0 : true),
  }));
```

- [ ] **Step 5: Verify the rule is enforced in code**

Run:

```powershell
rg -n "shouldHideRequestForRole|redactTimelineEventForRole|getVisibleSupportTypesForRole|requestedMonetaryAmount: isNonMonetaryOnlyViewer" "C:\Users\jason\OneDrive\Desktop\Merged\merged\MyApp\server\controllers\reliefRequestController.js"
```

Expected: all role-filter helpers and response redaction lines exist.

- [ ] **Step 6: Commit**

```bash
git add MyApp/server/controllers/reliefRequestController.js
git commit -m "feat(server): enforce role-filtered relief history visibility"
```

## Task 4: Add the separate Relief History page and routes

**Files:**
- Modify: `C:\Users\jason\OneDrive\Desktop\Merged\merged\tests\src\App.js`
- Create: `C:\Users\jason\OneDrive\Desktop\Merged\merged\tests\src\components\relief\ReliefHistoryPage.js`
- Create: `C:\Users\jason\OneDrive\Desktop\Merged\merged\tests\src\components\relief\reliefHistoryUtils.js`
- Create: `C:\Users\jason\OneDrive\Desktop\Merged\merged\tests\src\components\css\ReliefHistoryPage.css`
- Test: `C:\Users\jason\OneDrive\Desktop\Merged\merged\tests\src\components\relief\ReliefHistoryPage.test.js`

- [ ] **Step 1: Write the failing frontend test**

Create `ReliefHistoryPage.test.js` with the first render expectation:

```js
import { render, screen } from "@testing-library/react";
import ReliefHistoryPage from "./ReliefHistoryPage";

describe("ReliefHistoryPage", () => {
  test("renders the page title and barangay selector placeholder", () => {
    render(<ReliefHistoryPage />);
    expect(screen.getByText(/Relief History/i)).toBeInTheDocument();
    expect(screen.getByText(/Select a barangay to review/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm.cmd test -- --runInBand --watchAll=false src/components/relief/ReliefHistoryPage.test.js
```

Expected: FAIL because `ReliefHistoryPage` does not exist yet.

- [ ] **Step 3: Create minimal utility helpers**

Create `reliefHistoryUtils.js`:

```js
export const sortTimelineEvents = (events = []) =>
  [...events].sort(
    (a, b) => new Date(b?.timestamp || 0).getTime() - new Date(a?.timestamp || 0).getTime()
  );

export const formatHistoryMoney = (value) =>
  Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

export const hasTimelineContent = (request = {}) =>
  Array.isArray(request?.timelineEvents) && request.timelineEvents.length > 0;
```

- [ ] **Step 4: Create the minimal page component**

Create `ReliefHistoryPage.js`:

```js
import { useEffect, useMemo, useState } from "react";
import DashboardShell from "../layout/DashboardShell";
import "../css/ReliefHistoryPage.css";
import { API_BASE_URL } from "../../config/api";
import { getSupportTypeLabel } from "./supportTypes";
import { hasTimelineContent, sortTimelineEvents } from "./reliefHistoryUtils";

const BASE_URL = API_BASE_URL;

export default function ReliefHistoryPage() {
  const [barangays, setBarangays] = useState([]);
  const [selectedBarangayId, setSelectedBarangayId] = useState("");
  const [historyRows, setHistoryRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const loadHistory = async () => {
      try {
        setLoading(true);
        setError("");
        const query = selectedBarangayId ? `?barangayId=${encodeURIComponent(selectedBarangayId)}` : "";
        const res = await fetch(`${BASE_URL}/api/relief-requests/history${query}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (!active) return;
        setBarangays(Array.isArray(data?.barangays) ? data.barangays : []);
        setHistoryRows(Array.isArray(data?.requests) ? data.requests : []);
      } catch (err) {
        if (!active) return;
        setError("Failed to load relief history.");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadHistory();

    return () => {
      active = false;
    };
  }, [selectedBarangayId]);

  return (
    <DashboardShell title="Relief History">
      <div className="relief-history-page">
        <div className="relief-history-head">
          <h1>Relief History</h1>
          <p>Select a barangay to review its request timeline.</p>
        </div>
        <div className="relief-history-toolbar">
          <select
            value={selectedBarangayId}
            onChange={(event) => setSelectedBarangayId(event.target.value)}
          >
            <option value="">Choose barangay</option>
            {barangays.map((barangay) => (
              <option key={barangay._id} value={barangay._id}>
                {barangay.name}
              </option>
            ))}
          </select>
        </div>
        <div className="relief-history-body">
          {loading ? <p>Loading history...</p> : null}
          {!loading && !selectedBarangayId ? <p>Select a barangay to review.</p> : null}
          {!loading && selectedBarangayId && !historyRows.length ? <p>No relief history found for this barangay.</p> : null}
          {historyRows.map((request) => (
            <article key={request._id} className="relief-history-card">
              <header>
                <strong>{request.requestNo || "Relief request"}</strong>
                <span>{getSupportTypeLabel(request.supportTypes || [])}</span>
              </header>
              <ul>
                {sortTimelineEvents(request.timelineEvents || []).map((event, index) => (
                  <li key={`${request._id}-${event.type}-${index}`}>
                    <strong>{event.label}</strong>
                    <span>{event.message}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
          {error ? <p>{error}</p> : null}
        </div>
      </div>
    </DashboardShell>
  );
}
```

- [ ] **Step 5: Add the separate routes**

Update `App.js` imports and routes:

```js
import ReliefHistoryPage from "./components/relief/ReliefHistoryPage";
```

```js
  { path: "/drrmo/relief-history", element: <ReliefHistoryPage />, roles: DRRMO_ONLY },
  { path: "/admin/relief-history", element: <ReliefHistoryPage />, roles: ADMIN_ONLY },
  { path: "/accountant/relief-history", element: <ReliefHistoryPage />, roles: ACCOUNTANT_ONLY },
```

- [ ] **Step 6: Add the minimal stylesheet**

Create `ReliefHistoryPage.css`:

```css
.relief-history-page {
  display: grid;
  gap: 18px;
}

.relief-history-head h1,
.relief-history-head p {
  margin: 0;
}

.relief-history-toolbar select {
  min-width: 260px;
  min-height: 42px;
}

.relief-history-card {
  border: 1px solid #d8e6d8;
  border-radius: 18px;
  background: #ffffff;
  padding: 18px;
}

.relief-history-card ul {
  margin: 12px 0 0;
  padding-left: 18px;
}
```

- [ ] **Step 7: Run the page test and build**

Run:

```powershell
npm.cmd test -- --runInBand --watchAll=false src/components/relief/ReliefHistoryPage.test.js
npm.cmd run build
```

Expected: the new page test passes and the frontend build succeeds.

- [ ] **Step 8: Commit**

```bash
git add tests/src/App.js tests/src/components/relief/ReliefHistoryPage.js tests/src/components/relief/reliefHistoryUtils.js tests/src/components/css/ReliefHistoryPage.css tests/src/components/relief/ReliefHistoryPage.test.js
git commit -m "feat(tests): add separate relief history timeline page"
```

## Task 5: Expand the page into a real barangay timeline workflow

**Files:**
- Modify: `C:\Users\jason\OneDrive\Desktop\Merged\merged\tests\src\components\relief\ReliefHistoryPage.js`
- Modify: `C:\Users\jason\OneDrive\Desktop\Merged\merged\tests\src\components\relief\reliefHistoryUtils.js`
- Modify: `C:\Users\jason\OneDrive\Desktop\Merged\merged\tests\src\components\css\ReliefHistoryPage.css`
- Modify: `C:\Users\jason\OneDrive\Desktop\Merged\merged\tests\src\components\relief\ReliefHistoryPage.test.js`

- [ ] **Step 1: Add the next failing test for expand/collapse and empty timeline handling**

Extend `ReliefHistoryPage.test.js`:

```js
test("shows request cards and expands timeline entries", async () => {
  global.fetch = jest.fn().mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      barangays: [{ _id: "b1", name: "Barangay Uno" }],
      selectedBarangay: { _id: "b1", name: "Barangay Uno" },
      requests: [
        {
          _id: "r1",
          requestNo: "RR-2026-0001",
          supportTypes: ["foodpacks"],
          timelineEvents: [
            { type: "request_submitted", label: "Request submitted", message: "Requested 10 food pack(s)", timestamp: "2026-05-20T08:00:00.000Z" }
          ]
        }
      ]
    }),
  });
});
```

- [ ] **Step 2: Add helper functions for summaries**

Update `reliefHistoryUtils.js`:

```js
export const buildHistoryRequestSummary = (request = {}) => ({
  requestedFoodPacks: Number(request?.totals?.requestedFoodPacks || 0),
  requestedMonetaryAmount: Number(request?.totals?.requestedMonetaryAmount || 0),
  requestedApplianceQuantity: Number(request?.totals?.requestedApplianceQuantity || 0),
  releasedFoodPacks: Number(request?.fulfillment?.releasedFoodPacks || 0),
  releasedMonetaryAmount: Number(request?.fulfillment?.releasedMonetaryAmount || 0),
  releasedApplianceQuantity: Number(request?.fulfillment?.releasedApplianceQuantity || 0),
});
```

- [ ] **Step 3: Add local expand/collapse state and richer card rendering**

Update `ReliefHistoryPage.js`:

```js
  const [expandedRequestIds, setExpandedRequestIds] = useState({});

  const toggleExpanded = (requestId) => {
    setExpandedRequestIds((prev) => ({
      ...prev,
      [requestId]: !prev[requestId],
    }));
  };
```

Use it in the card:

```js
<button type="button" onClick={() => toggleExpanded(request._id)}>
  {expandedRequestIds[request._id] ? "Hide timeline" : "View timeline"}
</button>
{expandedRequestIds[request._id] ? (
  <ul className="relief-history-timeline">
    {sortTimelineEvents(request.timelineEvents || []).map((event, index) => (
      <li key={`${request._id}-${event.type}-${index}`} className="relief-history-event">
        <div className="relief-history-event-head">
          <strong>{event.label}</strong>
          <span>{new Date(event.timestamp).toLocaleString()}</span>
        </div>
        <p>{event.message}</p>
      </li>
    ))}
  </ul>
) : null}
```

- [ ] **Step 4: Add filter placeholders without overbuilding**

Keep this task intentionally small by adding only the UI state for:

```js
  const [search, setSearch] = useState("");
  const [supportFilter, setSupportFilter] = useState("all");
```

and client-side filtering:

```js
const visibleRequests = useMemo(() => {
  return historyRows.filter((request) => {
    const requestText = `${request.requestNo || ""} ${request.releaseNo || ""}`.toLowerCase();
    const matchesSearch = !search.trim() || requestText.includes(search.trim().toLowerCase());
    const matchesSupport =
      supportFilter === "all" || (Array.isArray(request.supportTypes) && request.supportTypes.includes(supportFilter));
    return matchesSearch && matchesSupport;
  });
}, [historyRows, search, supportFilter]);
```

- [ ] **Step 5: Verify the page still builds**

Run:

```powershell
npm.cmd test -- --runInBand --watchAll=false src/components/relief/ReliefHistoryPage.test.js src/components/relief/reliefHistoryUtils.test.js
npm.cmd run build
```

Expected: the timeline tests pass and the build succeeds.

- [ ] **Step 6: Commit**

```bash
git add tests/src/components/relief/ReliefHistoryPage.js tests/src/components/relief/reliefHistoryUtils.js tests/src/components/css/ReliefHistoryPage.css tests/src/components/relief/ReliefHistoryPage.test.js tests/src/components/relief/reliefHistoryUtils.test.js
git commit -m "feat(tests): expand relief history into barangay timeline view"
```

## Task 6: Clean up the shared sidebar and add the new navigation item

**Files:**
- Modify: `C:\Users\jason\OneDrive\Desktop\Merged\merged\tests\src\components\layout\Sidebar.js`
- Test: `C:\Users\jason\OneDrive\Desktop\Merged\merged\tests\src\components\layout\Sidebar.test.js`

- [ ] **Step 1: Write the failing sidebar test**

Create or extend `Sidebar.test.js` with:

```js
import { render, screen } from "@testing-library/react";
import Sidebar from "./Sidebar";

test("does not render the role subtitle", () => {
  render(<Sidebar variant="accountant" collapsed={false} onToggle={() => {}} onLogout={() => {}} />);
  expect(screen.queryByText(/Panel/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Remove the subtitle node**

In `Sidebar.js`, delete:

```jsx
<p className="sidebar-subtitle">Admin Panel</p>
```

Do not replace it with another subtitle line.

- [ ] **Step 3: Filter out empty groups**

Add a filtered navigation collection:

```js
const visibleLinks = links
  .map((group) => ({
    ...group,
    items: Array.isArray(group.items) ? group.items.filter(Boolean) : [],
  }))
  .filter((group) => group.items.length > 0);
```

Then render `visibleLinks` instead of `links`.

- [ ] **Step 4: Add the separate Relief History entry**

Insert a new item in the operations section:

```js
{
  to: `${basePath}/relief-history`,
  label: "Relief History",
  Icon: FaHistory,
  exact: true,
  badge: 0,
},
```

- [ ] **Step 5: Verify accountant no longer gets an empty Management group**

Run:

```powershell
rg -n "sidebar-subtitle|visibleLinks|Relief History|section: \"Management\"" "C:\Users\jason\OneDrive\Desktop\Merged\merged\tests\src\components\layout\Sidebar.js"
```

Expected: no `sidebar-subtitle`, a `visibleLinks` filtered array exists, and `Relief History` is in the operations list.

- [ ] **Step 6: Run the sidebar test**

Run:

```powershell
npm.cmd test -- --runInBand --watchAll=false src/components/layout/Sidebar.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tests/src/components/layout/Sidebar.js tests/src/components/layout/Sidebar.test.js
git commit -m "feat(tests): clean sidebar labels and add relief history link"
```

## Task 7: End-to-end verification and integration pass

**Files:**
- Modify as needed: only files from Tasks 1-6
- Test: targeted frontend tests plus build verification

- [ ] **Step 1: Run targeted relief history and sidebar tests**

Run:

```powershell
npm.cmd test -- --runInBand --watchAll=false src/components/relief/ReliefHistoryPage.test.js src/components/relief/reliefHistoryUtils.test.js src/components/layout/Sidebar.test.js
```

Expected: PASS.

- [ ] **Step 2: Run the broader relief request regression test**

Run:

```powershell
npm.cmd test -- --runInBand --watchAll=false src/components/relief/ReliefRequestsList.test.js
```

Expected: PASS, confirming the new page work did not break the existing relief request screen.

- [ ] **Step 3: Run a production build**

Run:

```powershell
npm.cmd run build
```

Expected: successful build. Pre-existing unrelated warnings are acceptable if no new blocking errors are introduced.

- [ ] **Step 4: Manual verification checklist**

Use these checks in a logged-in local session:

```text
1. Admin opens /admin/relief-history and sees barangay selector plus full request history.
2. Accountant opens /accountant/relief-history and sees monetary + non-monetary timeline details.
3. DRRMO opens /drrmo/relief-history and does not see pure monetary requests or monetary amounts.
4. Sidebar shows Relief History for all three roles.
5. Sidebar no longer shows "Admin Panel" or similar subtitle text.
6. Accountant sidebar no longer shows an empty Management section.
```

- [ ] **Step 5: Commit the integration pass**

```bash
git add tests/src/App.js tests/src/components/layout/Sidebar.js tests/src/components/relief/ReliefHistoryPage.js tests/src/components/relief/reliefHistoryUtils.js tests/src/components/css/ReliefHistoryPage.css MyApp/server/routes/reliefRequestRoutes.js MyApp/server/controllers/reliefRequestController.js
git commit -m "feat: add role-filtered relief history timeline"
```

## Self-Review

### Spec coverage

- Separate sidebar page: covered in Tasks 4 and 6.
- One barangay at a time: covered in Tasks 1, 4, and 5 through the barangay selector and filtered query.
- Request timeline focus: covered in Tasks 2 and 5.
- Admin/accountant full visibility: covered in Tasks 1-3.
- DRRMO non-monetary-only visibility: covered in Task 3.
- Sidebar subtitle removal and empty-group cleanup: covered in Task 6.

### Placeholder scan

- No `TODO`, `TBD`, or “similar to previous task” placeholders remain.
- Each task includes explicit files, code targets, commands, and expected outcomes.

### Type consistency

- Route/controller action name uses `getReliefRequestHistory` consistently.
- Frontend page uses `ReliefHistoryPage` consistently.
- Timeline event key remains `timelineEvents` consistently across backend and frontend tasks.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-22-relief-history-timeline.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
