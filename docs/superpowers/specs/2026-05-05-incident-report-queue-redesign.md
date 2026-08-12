# Incident Report Queue Redesign

Date: 2026-05-05

## Goal

Redesign the DRRMO incident reporting screen so the queue, map, and approved-workflow view reflect the real incident workflow clearly without breaking the current incident actions, filters, map behavior, or selected-incident detail panel.

## Scope

This change is limited to the incident report frontend behavior and presentation in:

- `tests/src/components/IncidentReport.js`
- `tests/src/components/css/IncidentReporting.css`

No unrelated controller logic, analytics logic, or PDF logic should be changed unless a very small compatibility adjustment is required by the new queue behavior.

## Required Workflow Rules

### 1. Workflow status must come from actual incident workflow

The incident workflow state must not be inferred from AI approval.

Introduce helper logic in the incident report screen:

- `getIncidentWorkflowStatus(incident)`
- `getIncidentPriority(incident)`
- `sortIncidentsByPriorityThenNewest(incidents)`

`getIncidentWorkflowStatus(incident)` should behave like this:

- `resolved` only if the actual incident status is resolved
- `onProcess` only if the actual incident status is approved, `on_process`, or `onProcess`
- `reported` for new/pending/reported incidents and any unresolved incident that is not explicitly on-process

AI verification state remains a separate display label only and must not decide queue workflow placement.

### 2. Priority ordering for the active left queue

The left queue must show incidents in this order:

1. `critical`
2. `high`
3. `medium`
4. `low`

Within the same priority level, show newest first using the incident creation timestamp fallback chain already used by the screen.

`sortIncidentsByPriorityThenNewest(incidents)` should implement:

- severity priority first
- newest first within the same severity

### 3. Resolved incidents

Resolved incidents should not appear in the active left queue.

Resolved incidents should continue to be handled by the existing incident history flow only.

Resolved incidents may still be reflected in the map status legend language, but they should not remain in the active queue list.

### 4. Rejected incidents

Incidents rejected by AI or by user should not appear on the map.

Rejected incidents should appear at the bottom of the active queue when they are still otherwise visible in the filtered incident list.

This means queue ordering should effectively be:

- non-rejected incidents sorted by priority then newest
- rejected incidents after those, still internally sorted by priority then newest

## Layout Redesign

The incident main layout becomes a three-column workflow layout:

- Left: `Active Incident Queue`
- Center: `Incident Map`
- Right: `Approved Queue`

The existing bottom selected-incident detail/review panel remains unchanged in purpose:

- clicking an incident in either the left queue or right queue still selects it
- the selected incident still appears in the bottom detail panel
- all action buttons continue to work from the bottom panel

## Left Panel: Active Incident Queue

### Content

The left panel shows active unresolved incidents, excluding resolved incidents.

This panel keeps:

- search compatibility
- existing status filter compatibility
- existing AI review filter compatibility
- selected incident behavior

### Card behavior

Queue cards must be more compact and readable.

The main badge area must show only the priority badge:

- `critical`
- `high`
- `medium`
- `low`

The AI review label moves to the top-right of the card as a smaller metadata chip, for example:

- `AI approved`
- `AI pending`
- `AI rejected`

Do not keep mixed text such as:

- `AI approved • critical`

### Priority color mapping

Priority colors in the left queue must match the visual language of the existing summary cards:

- `critical`: danger/red family
- `high`: warning/orange family
- `medium`: blue/info family
- `low`: green/success family

These colors should be used consistently for:

- left queue priority legend
- left queue priority chips
- card accent styling where applicable

### Legend

Replace the current left legend with priority-only legend items:

- `critical`
- `high`
- `medium`
- `low`

No workflow status legend should appear in the left queue.

## Center Panel: Incident Map

The center map remains the main map stage and keeps:

- existing Jaen-bounded map behavior
- existing markers
- existing selected-incident click behavior
- existing responsiveness

### Map filtering rules

Map markers should not include incidents rejected by AI or rejected by user.

Map markers should continue to respect coordinate validity and Jaen boundary checks.

### Map legend

The map-side legend must show workflow-only status meaning:

- `reported`
- `on process`
- `resolved`

It must not mix:

- AI review state
- severity priority

## Right Panel: Approved Queue

Add a separate right-side queue beside the map for approved/on-process incidents.

This panel is for incidents currently in the actionable approved workflow, meaning incidents whose real workflow status resolves to `onProcess`.

### Purpose

This gives DRRMO a dedicated list of incidents that are already approved or being worked on, without hiding the active queue logic on the left.

### Behavior

- clicking an item in the approved queue selects that incident
- the incident still renders in the bottom detail panel
- this does not replace the bottom detail panel
- this queue should use the same compact card language as the left queue where reasonable

## Filtering and Sorting

Existing filter controls must remain usable.

Filtering should still affect:

- left queue
- right approved queue
- map results
- selected incident fallback behavior

Expected filtered behaviors:

- left queue shows filtered unresolved active incidents excluding resolved
- right queue shows filtered approved/on-process incidents only
- map shows filtered visible incidents excluding rejected ones

If a selected incident no longer exists in the currently visible filtered result set, the screen should fall back to the first visible incident from the active/approved combined visible ordering, preserving the current stable selection behavior as closely as possible.

## Visual and UX Constraints

Preserve the current DRRMO/admin visual system:

- same card family
- same border radius language
- same soft green system styling
- same responsive behavior
- no fake loading flashes
- no unnecessary new explanatory copy
- no layout jumps during selection/filter changes

The redesign should feel like a refinement of the current page, not a different product.

## Testing Expectations

Verify these behaviors:

1. Left queue orders by severity priority first, then newest within same priority
2. Resolved incidents are not shown in the left queue
3. Right queue contains only approved/on-process workflow incidents
4. Clicking incidents from either queue still updates the bottom detail panel
5. Rejected incidents do not appear on the map
6. Map legend shows workflow statuses only
7. Left legend shows priority only
8. Search, status filter, and AI review filter still work
9. Selection remains stable when filters change
10. Responsive layout still works on narrower widths
