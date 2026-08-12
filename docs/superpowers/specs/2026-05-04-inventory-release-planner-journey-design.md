# Inventory Release Planner Journey Design

Date: 2026-05-04
Area: DRRMO Inventory Release Planner
Primary files: `tests/src/components/Donations/Inventory.js`, `tests/src/components/css/Inventory.css`

## Goal

Redesign the DRRMO release planner so approved relief requests with one or more support types feel structured, readable, and guided instead of crowded. The planner should move from a tabbed multi-input surface to a required journey:

`Food Packs -> Monetary -> Appliances -> Review`

Only the support types included in the selected barangay request should appear in the journey. A request that only needs food packs should not show monetary or appliance steps. A request with food packs and monetary should go through:

`Food Packs -> Monetary -> Review`

The DRRMO user must complete the current step before moving to the next one.

## Problems In The Current Planner

1. The planner visually mixes request summary, food pack configuration, monetary release, appliance request details, appliance selection, and release footer into one crowded block.
2. Requested appliance details are oversized and consume too much vertical space for very little information.
3. The previous support-type switching pattern behaves like disconnected sections, not a guided release process.
4. The release summary is useful but competes with the input sections instead of grounding the whole flow.
5. Appliance release UX feels weaker than food pack and monetary release UX because request details, available stock, and selected items are not grouped clearly.

## UX Direction

The planner should feel like a guided release preparation workspace:

1. Select approved request from the left queue.
2. Review a compact request overview at the top.
3. Move through support-type journey steps in sequence.
4. Complete the required release planning for the current step before the next step unlocks.
5. Keep a shared release summary and final action area visible below the journey content.

This should reduce cognitive load while preserving one-request, multi-support release behavior.

## Core Journey Rules

### Step Generation

Build the planner steps dynamically from the selected request support types:

1. Include `Food Packs` if the request still has unreleased food packs.
2. Include `Monetary` if the request still has unreleased monetary amount.
3. Include `Appliances` if the request still has unreleased appliance quantity.
4. Always include `Review` as the final step.

If a support type is already fully released for that request, its step should be omitted from the journey.

### Progression Rules

The next step remains locked until the current step is complete.

Completion requirements:

1. `Food Packs`
   - A food pack template must be selected.
   - The release quantity must satisfy the remaining requested food packs for this release action.
   - The preview items derived from the selected template must be valid.

2. `Monetary`
   - The release monetary amount must be present.
   - The release monetary amount must match the remaining requested monetary amount for the current release action.

3. `Appliances`
   - The selected appliance release list must satisfy the requested appliance plan for the current release action.
   - Required requested items must not be left unmatched.
   - Per-item release quantities must be valid and within stock.

4. `Review`
   - Reached only when all prior required steps are complete.
   - Submit action lives here.

### Navigation Rules

1. The user may return to earlier completed steps.
2. The user may not jump ahead into an incomplete later step.
3. Changing the selected request resets the planner journey to the first applicable step.
4. Clearing the planner resets step progress for the current request and returns to the first applicable step.

## Layout Design

## 1. Request Overview

Keep a compact top overview for the selected approved request:

1. Request number
2. Barangay
3. Status
4. Support type label
5. Remaining food packs
6. Remaining monetary
7. Remaining appliances
8. People affected

This area should be compressed into smaller stat cards and should not contain large appliance detail blocks.

## 2. Journey Header

Replace support tabs with a stepper row that reflects the active journey:

Example for all three:

`1 Food Packs -> 2 Monetary -> 3 Appliances -> 4 Review`

Stepper state styles:

1. Completed
2. Active
3. Locked

Stepper labels should be concise and horizontally readable on desktop, with a stacked or wrapped version on smaller screens.

## 3. Step Content Area

Only the active step content should be visible.

### Food Packs Step

Contents:

1. Template selector
2. Food packs to release
3. Required food packs
4. Template preview

Design notes:

1. Focus only on food release inputs.
2. Keep it in a clean 2- or 3-column grid.
3. Remove unrelated appliance and monetary blocks from this step.

### Monetary Step

Contents:

1. Requested monetary amount
2. Remaining monetary
3. Release monetary amount

Design notes:

1. Use compact stat tiles for requested and remaining values.
2. Keep one focused input for release amount.
3. Avoid repeating large request summary sections.

### Appliances Step

Use the approved side-by-side layout.

Left side: `Requested Appliances`

Each requested appliance entry should be compact and card-based:

1. Item name
2. Requested quantity
3. Short remarks

Right side: `Appliance Release List`

Selected release items should show:

1. Inventory item name
2. Category
3. Available quantity
4. Release quantity input
5. Remove action

Supporting section:

1. `Available Appliances` searchable picker remains available below or beside the requested list depending on screen width.
2. Add action should be clean and obvious.
3. Empty states should explain what to do next.

Design notes:

1. Requested appliance details must become visually compact.
2. The current oversized detail section should be removed.
3. The release list should feel like the main working area.
4. On narrower screens, the left and right panels stack vertically.

### Review Step

This final step should gather the release plan in one place:

1. Food pack summary
2. Monetary summary
3. Appliance summary
4. Release remarks
5. Clear
6. Cancel
7. Submit Release

The review step should not duplicate the full editing UI for every support type. It should summarize what was already configured.

## 4. Shared Summary Footer

The summary should remain below the active step content throughout the planner, not attached to only one support type.

Summary fields:

1. Line items
2. Total quantity
3. Food packs
4. Monetary
5. Appliances

This shared summary should update live as the user configures the current step.

## Interaction Behavior

## Step State Model

The planner should maintain:

1. `activeJourneyStep`
2. `availableJourneySteps`
3. `completedJourneySteps`

The current release state for food packs, monetary, and appliances should continue to be the source of truth for summary generation and payload submission.

## Appliance Completion Behavior

Appliance step completion should be based on release intent quality, not only whether some item was added.

At minimum:

1. Selected appliance quantities must be greater than zero.
2. Selected quantities must not exceed stock.
3. Selected appliance plan should satisfy the required appliance release expectation for the request.

If the existing backend expects exact fulfillment in one release for appliances, the step should enforce exact matching. If the backend allows partial release, the UI should still prevent invalid zero-value progress.

## Error Handling

Each step should show step-specific validation near the fields that need attention:

1. Food packs missing template
2. Food packs quantity mismatch
3. Monetary amount mismatch
4. Appliance quantity or stock issues

Locked-step messaging should be plain:

`Complete the current step before continuing.`

## Visual Style Direction

1. Reduce oversized request detail blocks.
2. Increase whitespace and grouping clarity.
3. Make the active step area feel focused, not crowded.
4. Use smaller appliance request cards instead of stretched panels.
5. Keep consistent DRRMO green styling but lighten the density of borders and repeated labels.

## Implementation Notes

1. Reuse existing release calculation helpers where possible.
2. Add a planner journey helper layer if needed so `Inventory.js` does not accumulate more inline branching.
3. Preserve existing release payload behavior unless the new journey requires a helper refactor.
4. Keep backend release semantics unchanged unless a blocker is discovered.

## Validation And Testing

Add or update tests for:

1. Journey step generation based on request support types
2. Locked next-step behavior
3. Resets when changing selected request
4. Shared summary behavior across steps
5. Appliance step layout/helper logic where practical

Manual verification scenarios:

1. Food packs only
2. Food packs + monetary
3. Food packs + appliances
4. Monetary + appliances
5. Food packs + monetary + appliances
6. Requests with already fulfilled portions omitted from the journey

## Non-Goals

1. Changing backend approval or release rules
2. Redesigning the left approved-request queue
3. Changing unrelated inventory table views outside what is necessary to support the planner
