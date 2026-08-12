# Shared PDF Theme Helpers Design

## Goal

Unify all server-generated PDF exports under one minimal formal visual system while preserving report-specific layouts and data flow. The result should make every PDF feel like part of the same product without forcing Incident, Inventory, Evacuation, Relief, Guidelines, and Analytics reports into the same content structure.

## Scope

This design covers the current PDF exporters found in the server controllers:

- `MyApp/server/controllers/incidentController.js`
- `MyApp/server/controllers/EvacController.js`
- `MyApp/server/controllers/GuidelineController.js`
- `MyApp/server/controllers/inventoryController.js`
- `MyApp/server/controllers/reliefRequestController.js`
- `MyApp/server/controllers/reliefReleaseController.js`
- `MyApp/server/controllers/incidentAnalyticsController.js`
- `MyApp/server/controllers/reliefAnalyticsController.js`
- `MyApp/server/controllers/EvacAnalyticsController.js`

Frontend export buttons are out of scope except where they already rely on the existing inline PDF behavior.

## Chosen Direction

We will use shared PDF theme helpers.

This means the project will gain one reusable PDF presentation module that owns the common visual language:

- page setup defaults
- title/header rendering
- section headings
- label/value blocks
- body copy styling
- table header and row styling
- empty-state messaging
- notes and long-text blocks
- footer rendering
- pagination helpers

Each controller will keep ownership of its data gathering and report-specific layout decisions, but it will stop defining its own PDF visual style ad hoc.

## Why This Approach

This approach gives real consistency without overfitting the content model.

- It is safer than forcing every report into a single rigid template.
- It is easier to maintain than duplicating the same monochrome styles across controllers.
- It keeps existing report semantics intact, which matters because analytics summaries, release receipts, inventory masterlists, and incident records have different readability needs.
- It makes future visual changes a shared helper edit instead of a multi-controller cleanup.

## Visual Design System

The visual system will be pure neutral.

- Background: white
- Primary text: near-black
- Secondary text: dark gray
- Dividers and table rules: light gray
- Accent color: none beyond black/gray hierarchy
- Fonts: existing Helvetica and Helvetica-Bold usage
- Tone: formal document, printer-friendly, role-neutral

There will be no colored cards, colored status pills, tinted table headers, colored KPI tiles, or module-specific themes.

## Shared Layout Rules

All PDFs will follow the same design rules:

### Header

Each PDF begins with a shared centered title block:

- report title
- optional subtitle
- generated timestamp

The header is text-only, with no logos or filled background bars.

Subtitle usage will be optional per report. Examples:

- report type for inventory exports
- request or release number for single-record exports
- analytics qualifier such as "AI analytics export" when needed

### Sections

Each section uses one common section renderer:

- bold section title
- thin divider line underneath
- fixed spacing before and after

This replaces current mixed approaches where some controllers use plain bold text, some use card-like blocks, and some use tinted headers.

### Label/Value Rows

Simple report metadata will use a consistent two-column label/value style:

- label in bold, fixed-width column
- value in regular text
- wrapped values align cleanly beneath the value column

This will replace inline text patterns such as `Label: Value` where wrapping becomes uneven.

### Paragraph Blocks

Descriptions, remarks, reasoning, attachment references, and notes will use the same paragraph block helper:

- optional block label
- uniform body font size
- consistent line height
- consistent spacing below each block

### Tables

All tables will use one monochrome table system:

- plain header row with bold text
- light gray bottom border under the header
- row separators in light gray
- no colored fills
- consistent cell padding
- consistent font sizes for headers and body cells
- shared text wrapping and alignment rules

Controllers can still choose portrait or landscape and define their own column sets.

### Footer

Every PDF ends with the same right-aligned footer:

- `Document generated on <date>`

If page numbering is introduced during implementation, it must be added consistently to all PDFs rather than selectively.

## Structural Rules By Report Type

The design is visual-only, not structural-only. Each report keeps the layout that best fits its content.

### Single-record documents

Applies to:

- incident export
- relief request export
- relief release export

Preferred structure:

1. header
2. summary metadata sections
3. long-text sections
4. supporting tables if needed
5. footer

### Multi-record tabular documents

Applies to:

- evacuation areas export
- guidelines export
- non-analytics inventory exports

Preferred structure:

1. header
2. summary section
3. primary table
4. supplemental notes such as remarks or descriptions
5. footer

### Analytics documents

Applies to:

- incident analytics
- relief analytics
- evacuation analytics
- inventory analytics
- donation analytics

Preferred structure:

1. header
2. analytics summary section
3. compact metric groups rendered in monochrome
4. action and insight lists rendered as plain numbered or labeled blocks
5. ranked tables or rate sections
6. footer

Analytics reports should keep their AI content, but the presentation must become document-like rather than dashboard-like.

## Proposed Shared Module

Add a shared helper module under the server codebase, for example:

- `MyApp/server/utils/pdfTheme.js`

This module should expose small focused rendering helpers rather than one monolithic renderer.

Expected helper surface:

- `createPdfDocument(options)`
- `drawPdfHeader(doc, config)`
- `drawPdfSectionTitle(doc, title, options)`
- `drawPdfLabelValue(doc, label, value, options)`
- `drawPdfParagraphBlock(doc, title, body, options)`
- `drawPdfTableHeader(doc, columns, options)`
- `drawPdfTableRow(doc, columns, row, options)`
- `drawPdfEmptyState(doc, message, options)`
- `drawPdfFooter(doc, options)`
- `ensurePdfPageSpace(doc, neededSpace, options)`
- shared formatting constants for spacing and font sizes

The final function names may vary, but the helper breakdown should stay close to this shape.

## Controller Migration Strategy

Refactor exporters incrementally into the shared helper system.

Recommended order:

1. inventory shared helpers first, because its current exporter is already closer to simple monochrome output
2. incident, relief request, and relief release next
3. evacuation and guidelines tabular exports next
4. analytics exporters last, because they currently contain the most custom presentation code

This sequencing reduces risk because the first conversions validate the helper API before the more complex analytics files are touched.

## Error Handling

Existing export behavior should remain unchanged:

- same endpoints
- same `Content-Type`
- same inline PDF response behavior
- same status code handling on failure

The refactor must not change business data, filtering, or access control. It only changes PDF presentation and shared rendering infrastructure.

## Testing Strategy

Verification should focus on rendered output and regression safety.

Required checks:

- syntax validation for every touched controller and shared helper file
- quick export smoke test for each PDF endpoint if feasible
- visual inspection of at least one sample export from each report family:
  - single-record
  - multi-record table
  - analytics
- check that portrait and landscape layouts still paginate correctly
- check that long descriptions, long remarks, and empty-table cases remain readable

## Non-Goals

This work will not:

- redesign frontend export buttons
- change report data content beyond formatting and ordering adjustments needed for readability
- introduce branding, logos, or colored themes
- merge all exports into one universal document template
- rewrite analytics calculations or controller business logic

## Risks

### Helper API too narrow

If the shared helper functions are too opinionated, analytics and landscape table exports may become awkward. The helper layer must standardize visuals without blocking report-specific layout composition.

### Pagination regressions

Long tables and paragraph sections may shift differently once spacing becomes consistent. Page-space checks must be validated carefully.

### Mixed old and new styling during migration

Partial refactor could leave exporters visually inconsistent. The implementation should complete all current PDF generators in one pass before considering the redesign done.

## Success Criteria

The redesign is successful when:

- every current PDF export uses the same visual language
- no PDF uses colored cards, tinted headers, or module-specific accent palettes
- titles, sections, labels, tables, and footers look consistent across all exports
- each report remains readable for its specific content type
- all exports continue opening inline and generating successfully
