# Shared PDF Theme Helpers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all existing server PDF exporter-specific styling with one shared minimal-formal PDF helper system while preserving each report's content-specific layout.

**Architecture:** Add one shared PDF utility module under the server that owns neutral header, section, metadata, table, paragraph, list, and footer rendering. Then refactor each PDF-exporting controller to import those helpers, remove duplicated local drawing code, and convert analytics exports away from colored dashboard-like rendering into the same monochrome document system.

**Tech Stack:** Node.js, Express controllers, PDFKit, existing server controller structure, inline browser PDF responses

---

### Task 1: Create the shared PDF helper module

**Files:**
- Create: `MyApp/server/utils/pdfTheme.js`
- Test: syntax-check `MyApp/server/utils/pdfTheme.js`

- [ ] **Step 1: Write the helper module**

Add a shared utility that exports:

- `createPdfDocument`
- `ensurePdfPageSpace`
- `drawPdfHeader`
- `drawPdfSectionTitle`
- `drawPdfLabelValue`
- `drawPdfParagraphBlock`
- `drawPdfBulletList`
- `drawPdfEmptyState`
- `drawPdfTable`
- `drawPdfFooter`
- `formatPdfDateValue`
- `PDF_THEME`

The helper must use a neutral grayscale palette and work for both portrait and landscape documents.

- [ ] **Step 2: Run syntax verification**

Run: `node --check "MyApp/server/utils/pdfTheme.js"`
Expected: exit code `0`

- [ ] **Step 3: Commit**

Run:
```bash
git add MyApp/server/utils/pdfTheme.js
git commit -m "refactor: add shared PDF theme helpers"
```

### Task 2: Migrate single-record exporters

**Files:**
- Modify: `MyApp/server/controllers/incidentController.js`
- Modify: `MyApp/server/controllers/reliefRequestController.js`
- Modify: `MyApp/server/controllers/reliefReleaseController.js`
- Test: syntax-check the three controllers

- [ ] **Step 1: Refactor imports and remove duplicated PDF drawing helpers**

Replace each controller-local PDF rendering helper block with imports from `MyApp/server/utils/pdfTheme.js`. Keep business formatting helpers that are specific to the controller if they are still used outside export code.

- [ ] **Step 2: Convert the incident exporter**

Use the shared helper flow:

1. `createPdfDocument`
2. `drawPdfHeader`
3. `drawPdfSectionTitle`
4. repeated `drawPdfLabelValue`
5. `drawPdfParagraphBlock` for description, reasoning, labels, and notes
6. `drawPdfFooter`

- [ ] **Step 3: Convert the relief request exporter**

Use the shared helper flow:

1. `createPdfDocument`
2. shared header
3. metadata sections
4. shared table helper for evacuation center rows
5. paragraph blocks for remarks
6. footer

- [ ] **Step 4: Convert the relief release exporter**

Use the shared helper flow:

1. shared header
2. metadata sections
3. shared table helper for released items
4. paragraph blocks for remarks
5. related request snapshot
6. footer

- [ ] **Step 5: Run syntax verification**

Run:
```bash
node --check "MyApp/server/controllers/incidentController.js"
node --check "MyApp/server/controllers/reliefRequestController.js"
node --check "MyApp/server/controllers/reliefReleaseController.js"
```
Expected: all exit with `0`

- [ ] **Step 6: Commit**

Run:
```bash
git add MyApp/server/controllers/incidentController.js MyApp/server/controllers/reliefRequestController.js MyApp/server/controllers/reliefReleaseController.js
git commit -m "refactor: unify single-record PDF exports"
```

### Task 3: Migrate tabular exporters

**Files:**
- Modify: `MyApp/server/controllers/EvacController.js`
- Modify: `MyApp/server/controllers/GuidelineController.js`
- Modify: `MyApp/server/controllers/inventoryController.js`
- Test: syntax-check the three controllers

- [ ] **Step 1: Refactor shared PDF imports**

Replace duplicated section, label/value, table, and footer renderers with imports from the shared helper module.

- [ ] **Step 2: Convert the evacuation areas exporter**

Keep landscape layout and the current occupancy-focused columns, but use the new shared header, summary rendering, table helper, remarks block, and footer.

- [ ] **Step 3: Convert the published guidelines exporter**

Keep landscape layout and the current summary plus attachment/description sections, but render them through the shared helper system.

- [ ] **Step 4: Convert the inventory non-analytics exporter**

Keep report-type-specific summary and the inventory items table, but move all presentation to the shared helper system. Retain report content differences between goods and monetary records.

- [ ] **Step 5: Run syntax verification**

Run:
```bash
node --check "MyApp/server/controllers/EvacController.js"
node --check "MyApp/server/controllers/GuidelineController.js"
node --check "MyApp/server/controllers/inventoryController.js"
```
Expected: all exit with `0`

- [ ] **Step 6: Commit**

Run:
```bash
git add MyApp/server/controllers/EvacController.js MyApp/server/controllers/GuidelineController.js MyApp/server/controllers/inventoryController.js
git commit -m "refactor: unify tabular PDF exports"
```

### Task 4: Migrate analytics exporters

**Files:**
- Modify: `MyApp/server/controllers/inventoryController.js`
- Modify: `MyApp/server/controllers/incidentAnalyticsController.js`
- Modify: `MyApp/server/controllers/reliefAnalyticsController.js`
- Modify: `MyApp/server/controllers/EvacAnalyticsController.js`
- Test: syntax-check the four controllers

- [ ] **Step 1: Simplify analytics PDF structure**

For each analytics exporter, replace custom color themes, KPI cards, mini bars, and colored insight blocks with the shared document system:

1. shared header
2. summary section
3. plain label/value metric groups
4. numbered action list
5. plain paragraph-based insight list
6. shared tables
7. footer

- [ ] **Step 2: Convert inventory analytics and donation analytics**

Reuse the helper module for the summary, category distribution table, source distribution, actions, and insights. Keep inventory/donation-specific metrics intact.

- [ ] **Step 3: Convert incident analytics**

Remove the local PDF theme and custom block renderers, then restyle all sections through shared helpers without changing the underlying analytics content.

- [ ] **Step 4: Convert relief analytics**

Remove color-heavy KPI and rate styling, convert to neutral summary sections and tables, and keep relief-specific metrics and AI text.

- [ ] **Step 5: Convert evacuation analytics**

Remove color-heavy KPI and rate styling, convert to neutral summary sections and tables, and keep evacuation-specific metrics and AI text.

- [ ] **Step 6: Run syntax verification**

Run:
```bash
node --check "MyApp/server/controllers/inventoryController.js"
node --check "MyApp/server/controllers/incidentAnalyticsController.js"
node --check "MyApp/server/controllers/reliefAnalyticsController.js"
node --check "MyApp/server/controllers/EvacAnalyticsController.js"
```
Expected: all exit with `0`

- [ ] **Step 7: Commit**

Run:
```bash
git add MyApp/server/controllers/inventoryController.js MyApp/server/controllers/incidentAnalyticsController.js MyApp/server/controllers/reliefAnalyticsController.js MyApp/server/controllers/EvacAnalyticsController.js
git commit -m "refactor: unify analytics PDF exports"
```

### Task 5: Final verification

**Files:**
- Verify: all touched files

- [ ] **Step 1: Run final server syntax verification**

Run:
```bash
node --check "MyApp/server/utils/pdfTheme.js"
node --check "MyApp/server/controllers/incidentController.js"
node --check "MyApp/server/controllers/EvacController.js"
node --check "MyApp/server/controllers/GuidelineController.js"
node --check "MyApp/server/controllers/inventoryController.js"
node --check "MyApp/server/controllers/reliefRequestController.js"
node --check "MyApp/server/controllers/reliefReleaseController.js"
node --check "MyApp/server/controllers/incidentAnalyticsController.js"
node --check "MyApp/server/controllers/reliefAnalyticsController.js"
node --check "MyApp/server/controllers/EvacAnalyticsController.js"
```
Expected: all exit with `0`

- [ ] **Step 2: Run frontend build smoke verification**

Run: `cmd /c npm run build`
Working directory: `tests`
Expected: build succeeds; warnings are acceptable if they are pre-existing and unrelated

- [ ] **Step 3: Inspect git diff**

Run: `git diff --stat`
Expected: only intended PDF-related files plus the plan/spec documents appear in the final summary

- [ ] **Step 4: Commit**

Run:
```bash
git add MyApp/server/utils/pdfTheme.js MyApp/server/controllers/incidentController.js MyApp/server/controllers/EvacController.js MyApp/server/controllers/GuidelineController.js MyApp/server/controllers/inventoryController.js MyApp/server/controllers/reliefRequestController.js MyApp/server/controllers/reliefReleaseController.js MyApp/server/controllers/incidentAnalyticsController.js MyApp/server/controllers/reliefAnalyticsController.js MyApp/server/controllers/EvacAnalyticsController.js docs/superpowers/plans/2026-04-29-shared-pdf-theme-helpers.md
git commit -m "refactor: standardize PDF export design"
```
