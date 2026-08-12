# Relief History Timeline Design

## Summary

Add a separate `Relief History` sidebar page that lets staff inspect the full relief-request journey for one barangay at a time. The page is timeline-first, not queue-first: the user chooses a barangay, then sees every request and release event for that barangay in chronological order.

This module must respect role boundaries:

- `admin` can see the full timeline, including monetary, food pack, and appliance request/release history.
- `accountant` can also see the full timeline, including monetary release values and financial actions.
- `drrmo` can access the page, but must only see non-monetary history related to food packs and appliances.

At the same time, clean up the sidebar so the role subtitle like `Admin Panel` is removed across variants, and empty sidebar sections such as `Management` for accountant are not rendered.

## Goals

- Give admin and accountant a barangay-focused historical view of relief activity.
- Let DRRMO review operational relief history without exposing finance-only monetary details.
- Keep the active relief queue separate from history/audit views.
- Reuse existing relief request, release, and support-type structures instead of introducing duplicate records.

## Non-Goals

- Replacing the existing relief request work queue.
- Building a generic cross-module audit explorer.
- Hiding all relief history from DRRMO.
- Creating a multi-barangay analytics dashboard in this feature.

## User Experience

### Sidebar

- Add a new sidebar item named `Relief History`.
- Place it under the relief/operations area beside the existing relief requests entry.
- Remove the role subtitle line under the product name for all supported sidebar variants.
- Do not render sidebar sections that have zero visible links after role filtering.

### Relief History Page

- The page opens as a dedicated route, not as a tab inside the existing request queue.
- The top of the page contains:
  - barangay selector
  - support-type filter
  - status/stage filter
  - date range filter
  - search by request number / release number
- The primary interaction is one barangay at a time.
- After selecting a barangay, show a chronological list of that barangay’s relief requests.

### Timeline Presentation

Each request card shows summary data first:

- request number
- barangay name
- request date
- support types
- current stage/status
- requested totals
- released totals that the current role is allowed to see

Each request expands into a timeline containing events such as:

- request submitted
- request edited
- request approved or rejected
- partial release created
- full release created
- not-received report
- receipt confirmation

Each timeline row shows:

- timestamp
- event label
- actor role and actor name if available
- request number and release number when relevant
- short event summary
- released item details when relevant and allowed by role

## Role-Based Visibility

### Admin

- Can view all relief requests for all barangays.
- Can see monetary, food pack, appliance, and mixed-support requests.
- Can see monetary release values and actor details.

### Accountant

- Can view all relief requests for all barangays.
- Can see monetary, food pack, appliance, and mixed-support requests.
- Can see monetary release values and actor details.

### DRRMO

- Can access the relief history page.
- Can only see non-monetary timeline content.
- Can see:
  - food pack request history
  - appliance request history
  - mixed requests only through their non-monetary portions
  - non-monetary release events and quantities
- Cannot see:
  - pure monetary requests
  - monetary amounts
  - accountant/admin monetary release entries
  - finance-specific summaries

### Rationale

Completely hiding history from DRRMO would remove useful operational context and make release follow-up harder. Filtering the page to non-monetary content gives DRRMO the context they need without exposing financial transactions that belong to admin/accountant.

## Data Model Strategy

Do not introduce a brand-new relief history collection for this feature.

Instead, build the history response from existing sources:

- `ReliefRequest`
- `ReliefRelease`
- existing request/release stage fields
- existing support type helpers
- existing release summaries and fulfillment fields
- audit/event metadata when available

The backend should normalize those records into a single timeline response so the frontend does not need to reconstruct request/release history itself.

## Backend Design

### New Endpoint

Add a dedicated endpoint for the history page, for example:

- `GET /api/relief-requests/history`

Expected query inputs:

- `barangayId` or canonical barangay key
- optional `supportType`
- optional `status`
- optional `dateFrom`
- optional `dateTo`
- optional `search`

### Response Shape

Return a page payload like:

- `barangays`: selectable barangay list the current role is allowed to inspect
- `selectedBarangay`
- `requests`: array of normalized request history entries

Each normalized request entry should contain:

- request identity and metadata
- support types
- current status/stage
- role-filtered request summary
- role-filtered release summary
- `timelineEvents`: normalized event rows ready for rendering

Each timeline event should include:

- `type`
- `timestamp`
- `label`
- `message`
- `actorRole`
- `actorName`
- `requestNo`
- `releaseNo`
- `visibleSupportTypes`
- optional `monetaryAmount`
- optional `foodPackCount`
- optional `applianceItems`

### Role Filtering Rules

Apply role filtering in the controller before the response is returned.

- For `drrmo`, remove pure monetary requests entirely.
- For mixed requests, keep the request visible but strip or zero out monetary-only event details.
- For `admin` and `accountant`, keep all events and values.

This must be enforced server-side, not only hidden in the frontend.

## Frontend Design

### New Page

Create a dedicated page component for the history module, reusing existing dashboard shell patterns and relief support-type helpers.

Primary sections:

- page header
- filter bar
- barangay selection state
- request timeline list
- empty state / loading state / error state

### Timeline Card Behavior

Each request card should support expand/collapse.

Collapsed view:

- request number
- request date
- support type badges
- current stage
- requested totals
- role-filtered release totals

Expanded view:

- chronological timeline rows
- release detail blocks
- receipt / not-received markers
- proof / supporting references only when already available and allowed

### Support-Type Rendering

Reuse the existing support-type utilities so the labels remain consistent with the request and release modules:

- `foodpacks`
- `monetary`
- `appliance`
- mixed combinations

## Sidebar Changes

In the shared sidebar component:

- remove the subtitle node that currently shows strings such as `Admin Panel`
- filter out groups whose `items` array becomes empty after role filtering

This ensures accountant no longer sees an empty `Management` heading.

## Error Handling

- If no barangay is selected, show a guided empty state instead of an error.
- If the selected barangay has no history, show a no-history state with the applied filters.
- If a role requests data they are not allowed to see, the backend should return only permitted data, not a partially broken payload.

## Testing

### Backend

- role-based access tests for admin, accountant, and DRRMO
- mixed-request filtering tests for DRRMO
- timeline normalization tests for request/release event ordering

### Frontend

- sidebar tests covering subtitle removal and empty-section removal
- relief history page tests for:
  - loading state
  - empty state
  - barangay selection
  - timeline rendering
  - DRRMO monetary redaction behavior

## Implementation Notes

- Prefer extending existing relief request/release data flows over inventing a second source of truth.
- Keep the page separate from the active request queue to avoid mixing action workflows with audit/history workflows.
- Keep role rules aligned with existing inventory/relief role boundaries where accountant and admin can view monetary activity while DRRMO is limited to operational, non-monetary visibility.
