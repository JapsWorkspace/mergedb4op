# Digital Twin Public/Internal Split Design

**Date:** July 25, 2026

**Goal**

Split the Digital Twin experience into two intentional views:
- a simple public landing-page Digital Twin with camera switching, core live data, and a small recent-history list
- a fuller internal DRRMO Digital Twin with the complete data-heavy monitoring layout shown in the reference screenshot

This keeps the landing page clean for visitors while giving internal users the full analytics workflow they need.

---

## Confirmed Product Decisions

### Public landing-page Digital Twin

The public Twin should remain simple and should not become the full analytics screen.

It should include:
- camera switcher
- current water level
- current status
- warning threshold
- danger threshold
- last synced timestamp
- a small recent-history list
- the Unity iframe

It should not include:
- the full data-management table
- internal-only controls like delete
- extra descriptive/helper paragraphs that clutter the public screen

### Internal DRRMO Digital Twin

The internal Twin should show the full data view from the screenshot.

It should include:
- `Safe`, `Warning`, and `Danger` explanation cards
- information-view selector: `Daily`, `Weekly`, `Monthly`, `Yearly`
- start-date and end-date filters
- `Reset` and `Apply` actions
- summary statistic cards
- full water-level information table
- internal refresh controls

Delete actions should remain internal-only if still needed by the internal workflow.

---

## Current Codebase State

### Public Twin

The landing page Twin is rendered from:
- `tests/src/components/entry/Dashboard.js`
- `tests/src/components/entry/PublicDigitalTwinPanel.js`
- `tests/src/components/css/Dashboard.css`

The public Twin already has a lightweight shell with:
- camera switching
- live level/status values
- warning/danger thresholds
- daily-history reads
- Unity iframe

### Internal Twin

The richer Twin page is rendered from:
- `tests/src/components/DigitalTwin/UnityDigitalTwin.js`
- `tests/src/components/css/DigitalTwin.css`

That component currently shows:
- current status pill
- summary cards
- camera selector
- Unity iframe
- live reading block
- recent history block

It does not yet match the full screenshot-driven layout.

### Backend water-level data

Relevant backend files:
- `MyApp/server/models/WaterLevel.js`
- `MyApp/server/models/WaterLevelDailyHistory.js`
- `MyApp/server/controllers/waterLevelController.js`
- `MyApp/server/routes/waterLevelRoutes.js`

The backend already supports:
- live raw readings
- latest reading by camera
- raw reading history by camera
- daily history summaries
- analytics-style grouped summaries

This means the internal Twin should be built on top of the existing daily history and analytics data instead of inventing a second data path.

---

## Architecture

### Public path

The public landing page will keep using a lightweight dedicated component:
- `PublicDigitalTwinPanel`

That component remains responsible for:
- fetching public-safe water-level data
- switching cameras
- showing only a small recent-history list
- sending the currently selected reading payload into the Unity iframe

The public Twin should stay visually aligned with the landing page design system in `Dashboard.css`.

### Internal path

The internal DRRMO Twin should be upgraded in place in:
- `UnityDigitalTwin.js`

This page should become the full data-rich monitoring interface and should use:
- latest reading endpoint
- daily history endpoint
- analytics endpoint
- raw history endpoint only where needed

Its styling should remain in `DigitalTwin.css`, separate from the landing page CSS.

### Shared boundary

We should share backend data behavior, not necessarily share the entire UI.

This avoids forcing the public landing page to inherit internal complexity while still keeping the data sources consistent.

---

## Data Model and API Usage

### Public Twin data

Public Twin should read:
- `/api/water-levels`
  - to discover available cameras
- `/api/water-levels/latest/:camera_id`
  - for current reading
- `/api/water-levels/history/daily?camera_id=<id>&limit=<n>`
  - for the small recent-history list

The public view does not need:
- delete
- full analytics table controls
- broad historical management

### Internal Twin data

Internal Twin should read:
- `/api/water-levels/latest/:camera_id`
  - for current live status
- `/api/water-levels/history/daily`
  - for daily table view
- `/api/water-levels/analytics`
  - for weekly/monthly/yearly grouped views
- `/api/water-levels/history/:camera_id`
  - only if raw reading detail is still needed

### Derived behavior

The internal view should map filter choices like this:
- `Daily` -> daily history endpoint
- `Weekly` -> analytics endpoint with `period=weekly`
- `Monthly` -> analytics endpoint with `period=monthly`
- `Yearly` -> analytics endpoint with `period=yearly`

Date filters should map to:
- `start_date`
- `end_date`

If a selected period returns no data, the table should show a clean empty state instead of breaking the Twin page.

---

## UI Design

### Public landing Twin

The landing page Twin should keep a trimmed composition:

1. Top bar
- title
- current status chip
- camera switcher
- last synced badge

2. Small summary cards
- current level
- warning level
- danger level
- recent-history count

3. Main content area
- Unity iframe
- small recent-history list beside or below it

4. Copy discipline
- no extra instructional body text unless it conveys unique value
- avoid repeated descriptions like “this section shows...” or “this data is...”

### Internal Twin

The internal Twin should visually match the screenshot structure:

1. Status explanation row
- safe card
- warning card
- danger card

2. Filter toolbar
- information view select
- start date
- end date
- reset
- apply

3. Summary row
- latest level
- average level
- highest level
- danger readings

4. Main data section
- section title
- refresh action
- large table

5. Table content
- date
- date covered
- average level
- highest level
- latest status
- reading summary
- citizen explanation
- last updated
- action

The internal table should use whichever endpoint best matches the selected view rather than forcing all periods into the same shape prematurely.

---

## File Plan

### Frontend files to modify

- `tests/src/components/entry/Dashboard.js`
  - keep landing-page Twin hook-up simple

- `tests/src/components/entry/PublicDigitalTwinPanel.js`
  - preserve lightweight public behavior
  - remove unnecessary descriptive text if any remains

- `tests/src/components/css/Dashboard.css`
  - style the public Twin only

- `tests/src/components/DigitalTwin/UnityDigitalTwin.js`
  - upgrade to the full internal monitoring layout

- `tests/src/components/css/DigitalTwin.css`
  - add the full internal Digital Twin table/filter/stat layout styles

### Backend files to verify or extend

- `MyApp/server/controllers/waterLevelController.js`
  - ensure daily and analytics endpoints return the shapes the internal UI needs

- `MyApp/server/routes/waterLevelRoutes.js`
  - confirm routes required by both views remain exposed

- `MyApp/server/models/WaterLevelDailyHistory.js`
  - no schema expansion is expected unless a missing field blocks the analytics display

---

## Error Handling

### Public Twin

If public data fails:
- show a compact inline error state
- keep the Unity iframe available if possible
- do not expose internal/debug wording

### Internal Twin

If internal data fails:
- preserve the filter controls
- show an obvious empty/error state in the table section
- keep the live/current cards resilient where possible

---

## Testing Expectations

### Public

Verify:
- landing-page Digital Twin opens correctly
- camera switching updates displayed values
- small history list changes per camera
- Unity iframe still loads

### Internal

Verify:
- internal Twin renders the full monitoring layout
- period filter changes data source/view correctly
- start/end date filters affect results
- summary cards update with selected view
- table renders daily and aggregated rows correctly

### Backend

Verify:
- latest reading endpoint still works
- daily history endpoint still works
- analytics endpoint returns grouped data for weekly/monthly/yearly filters

---

## Scope Guardrails

This change does **not** include:
- redesigning the Unity WebGL scene itself
- making the landing page match the full internal analytics table
- exposing internal delete actions to the public page
- introducing a second independent Digital Twin backend

The focus is only:
- simple public Twin
- full internal Twin
- consistent water-level data plumbing

---

## Self-Review

Checked:
- public vs internal responsibilities are clearly separated
- landing page remains simple with a small recent-history list
- internal view is the only place that becomes fully data-heavy
- backend endpoints are reused instead of duplicated
- no placeholders or unresolved product decisions remain
