# Inventory Release Planner Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the DRRMO inventory release planner into a required multi-step journey that only shows one support-type input section at a time, keeps a shared summary below, and improves the appliance release experience.

**Architecture:** Add a small release-planner journey helper layer so `Inventory.js` can derive ordered steps, completion state, and review summaries without piling more branching into the component. Then reshape the planner JSX/CSS to render a stepper-driven flow: compact request overview, step-specific content, side-by-side appliance request/release panels, and a dedicated review step before submit.

**Tech Stack:** React, Jest, React Testing Library style unit tests already used in the repo, existing inventory/release helper pattern in `releasePlannerUtils.js`, CSS modules via `Inventory.css`

---

### Task 1: Add journey helper tests first

**Files:**
- Create: `tests/src/components/Donations/releasePlannerJourneyUtils.test.js`
- Test: `tests/src/components/Donations/releasePlannerJourneyUtils.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
import {
  buildReleaseJourneySteps,
  getNextJourneyStep,
  isJourneyStepComplete,
} from "./releasePlannerJourneyUtils";

describe("releasePlannerJourneyUtils", () => {
  test("builds only the needed support steps plus review in the right order", () => {
    expect(
      buildReleaseJourneySteps({
        pendingFood: true,
        pendingMonetary: true,
        pendingAppliance: true,
      })
    ).toEqual(["food", "monetary", "appliance", "review"]);

    expect(
      buildReleaseJourneySteps({
        pendingFood: true,
        pendingMonetary: false,
        pendingAppliance: true,
      })
    ).toEqual(["food", "appliance", "review"]);
  });

  test("does not unlock the next step until the current step is complete", () => {
    const steps = ["food", "monetary", "review"];

    expect(
      getNextJourneyStep({
        steps,
        currentStep: "food",
        completedSteps: [],
      })
    ).toBeNull();

    expect(
      getNextJourneyStep({
        steps,
        currentStep: "food",
        completedSteps: ["food"],
      })
    ).toBe("monetary");
  });

  test("marks step completion from focused release inputs", () => {
    expect(
      isJourneyStepComplete({
        step: "food",
        state: {
          selectedTemplateId: "tpl-1",
          foodPacksToRelease: "110",
          requiredFoodPacks: 110,
          computedTemplateItems: [{ itemName: "Rice", quantityReleased: 110 }],
        },
      })
    ).toBe(true);

    expect(
      isJourneyStepComplete({
        step: "monetary",
        state: {
          releaseMonetaryAmount: "1000",
          requiredMonetaryAmount: 1000,
        },
      })
    ).toBe(true);

    expect(
      isJourneyStepComplete({
        step: "appliance",
        state: {
          requestedApplianceQuantity: 10,
          applianceSelections: [
            { inventoryItemId: "inv-1", quantityReleased: 6 },
            { inventoryItemId: "inv-2", quantityReleased: 4 },
          ],
        },
      })
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `powershell -Command "$env:CI='true'; npm.cmd test -- --runInBand --watch=false src/components/Donations/releasePlannerJourneyUtils.test.js"`

Expected: FAIL because `releasePlannerJourneyUtils.js` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create the helper skeleton:

```javascript
const toNumber = (value) => {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const buildReleaseJourneySteps = ({
  pendingFood = false,
  pendingMonetary = false,
  pendingAppliance = false,
} = {}) => {
  const steps = [];
  if (pendingFood) steps.push("food");
  if (pendingMonetary) steps.push("monetary");
  if (pendingAppliance) steps.push("appliance");
  steps.push("review");
  return steps;
};

export const getNextJourneyStep = ({
  steps = [],
  currentStep = "",
  completedSteps = [],
} = {}) => {
  const currentIndex = steps.indexOf(currentStep);
  if (currentIndex === -1) return null;
  if (!completedSteps.includes(currentStep)) return null;
  return steps[currentIndex + 1] || null;
};

export const isJourneyStepComplete = ({ step = "", state = {} } = {}) => {
  if (step === "food") {
    return (
      String(state.selectedTemplateId || "").trim() !== "" &&
      toNumber(state.foodPacksToRelease) === toNumber(state.requiredFoodPacks) &&
      Array.isArray(state.computedTemplateItems) &&
      state.computedTemplateItems.length > 0
    );
  }

  if (step === "monetary") {
    return (
      toNumber(state.releaseMonetaryAmount) > 0 &&
      toNumber(state.releaseMonetaryAmount) === toNumber(state.requiredMonetaryAmount)
    );
  }

  if (step === "appliance") {
    const totalSelected = (Array.isArray(state.applianceSelections) ? state.applianceSelections : [])
      .reduce((sum, item) => sum + toNumber(item?.quantityReleased), 0);
    return totalSelected === toNumber(state.requestedApplianceQuantity);
  }

  if (step === "review") return true;
  return false;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `powershell -Command "$env:CI='true'; npm.cmd test -- --runInBand --watch=false src/components/Donations/releasePlannerJourneyUtils.test.js"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/src/components/Donations/releasePlannerJourneyUtils.js tests/src/components/Donations/releasePlannerJourneyUtils.test.js
git commit -m "test: add release planner journey helper coverage"
```

### Task 2: Extend release helper coverage for review-step summary behavior

**Files:**
- Modify: `tests/src/components/Donations/releasePlannerUtils.js`
- Modify: `tests/src/components/Donations/releasePlannerUtils.test.js`
- Test: `tests/src/components/Donations/releasePlannerUtils.test.js`

- [ ] **Step 1: Write the failing test**

Add this test:

```javascript
test("builds review summary totals that stay consistent across support-step changes", () => {
  expect(
    buildReleasePreviewSummary({
      needsFood: true,
      needsMonetary: true,
      computedTemplateItems: [
        { quantityReleased: 55 },
        { quantityReleased: 55 },
      ],
      foodPacksToRelease: "110",
      releaseMonetaryAmount: "1000",
      applianceSelections: [{ quantityReleased: "10" }],
    })
  ).toEqual({
    lineItems: 3,
    totalQuantity: 120,
    packCount: 110,
    totalMonetary: 1000,
    applianceUnits: 10,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `powershell -Command "$env:CI='true'; npm.cmd test -- --runInBand --watch=false src/components/Donations/releasePlannerUtils.test.js"`

Expected: FAIL if current summary math no longer matches the intended review-step output.

- [ ] **Step 3: Write minimal implementation**

Update `buildReleasePreviewSummary` if needed so it remains agnostic to which journey step is currently active and always reports the combined release plan:

```javascript
return {
  lineItems: foodSummary.lineItems + applianceItems.length,
  totalQuantity: foodSummary.totalQuantity + applianceUnits,
  packCount: needsFood ? toNumber(foodPacksToRelease) : 0,
  totalMonetary: needsMonetary ? toNumber(releaseMonetaryAmount) : 0,
  applianceUnits,
};
```

If the logic already matches, keep the implementation unchanged and retain the new test.

- [ ] **Step 4: Run test to verify it passes**

Run: `powershell -Command "$env:CI='true'; npm.cmd test -- --runInBand --watch=false src/components/Donations/releasePlannerUtils.test.js"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/src/components/Donations/releasePlannerUtils.js tests/src/components/Donations/releasePlannerUtils.test.js
git commit -m "test: lock review summary totals for release planner"
```

### Task 3: Integrate journey state into Inventory.js

**Files:**
- Modify: `tests/src/components/Donations/Inventory.js`
- Modify: `tests/src/components/Donations/releasePlannerJourneyUtils.js`
- Test: `tests/src/components/Donations/releasePlannerJourneyUtils.test.js`

- [ ] **Step 1: Write the failing test**

Add a helper-level test for request-change resets:

```javascript
import { getInitialJourneyStep } from "./releasePlannerJourneyUtils";

test("returns the first applicable step when planner state resets for a new request", () => {
  expect(getInitialJourneyStep(["food", "monetary", "review"])).toBe("food");
  expect(getInitialJourneyStep(["appliance", "review"])).toBe("appliance");
  expect(getInitialJourneyStep(["review"])).toBe("review");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `powershell -Command "$env:CI='true'; npm.cmd test -- --runInBand --watch=false src/components/Donations/releasePlannerJourneyUtils.test.js"`

Expected: FAIL because `getInitialJourneyStep` is not exported yet.

- [ ] **Step 3: Write minimal implementation**

Add the helper:

```javascript
export const getInitialJourneyStep = (steps = []) => steps[0] || "review";
```

Then wire `Inventory.js` state:

```javascript
const [activeJourneyStep, setActiveJourneyStep] = useState("review");

const releaseJourneySteps = useMemo(
  () =>
    buildReleaseJourneySteps({
      pendingFood: selectedRequestPendingFood,
      pendingMonetary: selectedRequestPendingMonetary,
      pendingAppliance: selectedRequestPendingAppliance,
    }),
  [
    selectedRequestPendingFood,
    selectedRequestPendingMonetary,
    selectedRequestPendingAppliance,
  ]
);

useEffect(() => {
  setActiveJourneyStep(getInitialJourneyStep(releaseJourneySteps));
}, [selectedReleaseRequestId, releaseJourneySteps]);
```

Also derive:

```javascript
const journeyCompletionState = {
  food: isJourneyStepComplete({
    step: "food",
    state: {
      selectedTemplateId,
      foodPacksToRelease,
      requiredFoodPacks: selectedRemainingFoodPacks,
      computedTemplateItems,
    },
  }),
  monetary: isJourneyStepComplete({
    step: "monetary",
    state: {
      releaseMonetaryAmount,
      requiredMonetaryAmount: selectedRemainingMonetaryAmount,
    },
  }),
  appliance: isJourneyStepComplete({
    step: "appliance",
    state: {
      requestedApplianceQuantity: selectedRemainingApplianceQuantity,
      applianceSelections,
    },
  }),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `powershell -Command "$env:CI='true'; npm.cmd test -- --runInBand --watch=false src/components/Donations/releasePlannerJourneyUtils.test.js"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/src/components/Donations/Inventory.js tests/src/components/Donations/releasePlannerJourneyUtils.js tests/src/components/Donations/releasePlannerJourneyUtils.test.js
git commit -m "feat: add release planner journey state"
```

### Task 4: Replace the support blocks with a stepper-driven planner shell

**Files:**
- Modify: `tests/src/components/Donations/Inventory.js`
- Modify: `tests/src/components/css/Inventory.css`
- Test: `tests/src/components/Donations/releasePlannerJourneyUtils.test.js`

- [ ] **Step 1: Write the failing test**

Add a presentation helper test:

```javascript
import { getJourneyStepMeta } from "./releasePlannerJourneyUtils";

test("marks stepper entries as completed, active, or locked", () => {
  expect(
    getJourneyStepMeta({
      steps: ["food", "monetary", "review"],
      activeStep: "monetary",
      completedSteps: ["food"],
    })
  ).toEqual([
    { key: "food", state: "completed" },
    { key: "monetary", state: "active" },
    { key: "review", state: "locked" },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `powershell -Command "$env:CI='true'; npm.cmd test -- --runInBand --watch=false src/components/Donations/releasePlannerJourneyUtils.test.js"`

Expected: FAIL because `getJourneyStepMeta` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add helper:

```javascript
export const getJourneyStepMeta = ({
  steps = [],
  activeStep = "",
  completedSteps = [],
} = {}) =>
  steps.map((key) => ({
    key,
    state: completedSteps.includes(key)
      ? "completed"
      : key === activeStep
      ? "active"
      : "locked",
  }));
```

Then replace the top of the planner section in `Inventory.js` with:

```jsx
<div className="release-request-overview">...</div>
<div className="release-journey-stepper">
  {journeyStepMeta.map((step, index) => (
    <button
      key={step.key}
      type="button"
      className={`release-journey-step ${step.state}`}
      disabled={step.state === "locked"}
      onClick={() => setActiveJourneyStep(step.key)}
    >
      <span className="release-journey-index">{index + 1}</span>
      <span className="release-journey-label">{step.key}</span>
    </button>
  ))}
</div>
<div className="release-journey-body">...</div>
```

Add CSS shell classes:

```css
.release-journey-stepper {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.release-journey-step {
  min-height: 56px;
  border-radius: 16px;
  border: 1px solid var(--inv-border);
}

.release-journey-step.completed { ... }
.release-journey-step.active { ... }
.release-journey-step.locked { ... }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `powershell -Command "$env:CI='true'; npm.cmd test -- --runInBand --watch=false src/components/Donations/releasePlannerJourneyUtils.test.js"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/src/components/Donations/Inventory.js tests/src/components/css/Inventory.css tests/src/components/Donations/releasePlannerJourneyUtils.js tests/src/components/Donations/releasePlannerJourneyUtils.test.js
git commit -m "feat: add release planner stepper shell"
```

### Task 5: Split food and monetary inputs into focused journey steps

**Files:**
- Modify: `tests/src/components/Donations/Inventory.js`
- Modify: `tests/src/components/css/Inventory.css`
- Test: `tests/src/components/Donations/releasePlannerJourneyUtils.test.js`

- [ ] **Step 1: Write the failing test**

Add completion edge cases:

```javascript
test("food step is incomplete without exact required pack count", () => {
  expect(
    isJourneyStepComplete({
      step: "food",
      state: {
        selectedTemplateId: "tpl-1",
        foodPacksToRelease: "100",
        requiredFoodPacks: 110,
        computedTemplateItems: [{ itemName: "Rice", quantityReleased: 100 }],
      },
    })
  ).toBe(false);
});

test("monetary step is incomplete without the exact remaining amount", () => {
  expect(
    isJourneyStepComplete({
      step: "monetary",
      state: {
        releaseMonetaryAmount: "900",
        requiredMonetaryAmount: 1000,
      },
    })
  ).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `powershell -Command "$env:CI='true'; npm.cmd test -- --runInBand --watch=false src/components/Donations/releasePlannerJourneyUtils.test.js"`

Expected: FAIL until step validation is exact.

- [ ] **Step 3: Write minimal implementation**

In `Inventory.js`, render these only when active:

```jsx
{activeJourneyStep === "food" ? <section className="release-step-panel">...</section> : null}
{activeJourneyStep === "monetary" ? <section className="release-step-panel">...</section> : null}
```

Add a step action row:

```jsx
<div className="release-step-actions">
  <button type="button" className="btn btn-secondary" onClick={goToPreviousStep}>
    Back
  </button>
  <button
    type="button"
    className="btn btn-primary"
    onClick={goToNextStep}
    disabled={!journeyCompletionState.food}
  >
    Continue to Monetary
  </button>
</div>
```

For monetary:

```jsx
<button
  type="button"
  className="btn btn-primary"
  onClick={goToNextStep}
  disabled={!journeyCompletionState.monetary}
>
  Continue to Appliances
</button>
```

CSS should isolate each step into a lighter card:

```css
.release-step-panel {
  display: grid;
  gap: 16px;
  padding: 18px;
  border: 1px solid var(--inv-border);
  border-radius: 22px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fcf9 100%);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `powershell -Command "$env:CI='true'; npm.cmd test -- --runInBand --watch=false src/components/Donations/releasePlannerJourneyUtils.test.js"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/src/components/Donations/Inventory.js tests/src/components/css/Inventory.css tests/src/components/Donations/releasePlannerJourneyUtils.test.js
git commit -m "feat: split food and monetary planner steps"
```

### Task 6: Redesign the appliance step into a side-by-side request/release workspace

**Files:**
- Modify: `tests/src/components/Donations/Inventory.js`
- Modify: `tests/src/components/css/Inventory.css`
- Test: `tests/src/components/Donations/releasePlannerJourneyUtils.test.js`

- [ ] **Step 1: Write the failing test**

Add appliance completion edge case:

```javascript
test("appliance step is incomplete until selected release quantities match the remaining requested units", () => {
  expect(
    isJourneyStepComplete({
      step: "appliance",
      state: {
        requestedApplianceQuantity: 10,
        applianceSelections: [{ inventoryItemId: "inv-1", quantityReleased: 6 }],
      },
    })
  ).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `powershell -Command "$env:CI='true'; npm.cmd test -- --runInBand --watch=false src/components/Donations/releasePlannerJourneyUtils.test.js"`

Expected: FAIL if appliance completion still allows underfilled selections.

- [ ] **Step 3: Write minimal implementation**

Replace the oversized appliance request block with a two-column step:

```jsx
{activeJourneyStep === "appliance" ? (
  <div className="release-appliance-journey-layout">
    <section className="release-panel release-panel-compact">
      <div className="release-panel-head release-panel-head-simple">
        <div>
          <h3>Requested Appliances</h3>
          <span>Compact request summary</span>
        </div>
      </div>
      <div className="release-requested-appliance-list">
        {selectedReleaseRequest.requestedAppliances.map((item, index) => (
          <article className="release-requested-appliance-card" key={`${item.itemName}-${index}`}>
            <strong>{item.itemName}</strong>
            <span>{Number(item.quantityRequested || 0)} unit(s)</span>
            <p>{item.remarks || "No remarks"}</p>
          </article>
        ))}
      </div>
    </section>

    <section className="release-panel release-panel-compact">
      <div className="release-panel-head release-panel-head-simple compact">...</div>
      <div className="release-selection-list">...</div>
    </section>
  </div>
) : null}
```

Add CSS:

```css
.release-appliance-journey-layout {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
  gap: 16px;
}

.release-requested-appliance-card {
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid var(--inv-border);
  background: #fff;
}
```

Also add a continue button:

```jsx
<button
  type="button"
  className="btn btn-primary"
  onClick={goToNextStep}
  disabled={!journeyCompletionState.appliance}
>
  Continue to Review
</button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `powershell -Command "$env:CI='true'; npm.cmd test -- --runInBand --watch=false src/components/Donations/releasePlannerJourneyUtils.test.js"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/src/components/Donations/Inventory.js tests/src/components/css/Inventory.css tests/src/components/Donations/releasePlannerJourneyUtils.test.js
git commit -m "feat: redesign appliance release journey step"
```

### Task 7: Move final submission into a dedicated review step with shared summary below every step

**Files:**
- Modify: `tests/src/components/Donations/Inventory.js`
- Modify: `tests/src/components/css/Inventory.css`
- Modify: `tests/src/components/Donations/releasePlannerUtils.test.js`
- Test: `tests/src/components/Donations/releasePlannerUtils.test.js`

- [ ] **Step 1: Write the failing test**

Add a payload test that stays valid for the review step:

```javascript
test("builds a final release payload from review-ready journey state", () => {
  expect(
    buildReleaseRequestPayload({
      reliefRequestId: "req-2",
      remarks: "Dispatch after review",
      needsFood: true,
      needsMonetary: true,
      needsAppliance: true,
      selectedTemplateId: "tpl-2",
      foodPacksToRelease: "110",
      releaseMonetaryAmount: "1000",
      applianceSelections: [
        {
          inventoryItemId: "app-1",
          itemName: "Electric Fan",
          category: "cooling",
          quantityReleased: "10",
          unit: "unit",
          remarks: "",
        },
      ],
    })
  ).toEqual({
    reliefRequestId: "req-2",
    remarks: "Dispatch after review",
    releaseMode: "template",
    foodPackTemplateId: "tpl-2",
    foodPacksToRelease: 110,
    releasedMonetaryAmount: 1000,
    items: [
      {
        inventoryItemId: "app-1",
        itemType: "appliance",
        itemName: "Electric Fan",
        category: "cooling",
        quantityReleased: 10,
        unit: "unit",
        remarks: "",
      },
    ],
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `powershell -Command "$env:CI='true'; npm.cmd test -- --runInBand --watch=false src/components/Donations/releasePlannerUtils.test.js"`

Expected: FAIL if payload shaping broke during the journey refactor.

- [ ] **Step 3: Write minimal implementation**

Refactor the sticky footer so it becomes shared review scaffolding:

```jsx
<div className="release-shared-summary-card">
  <div className="release-footer-grid">...</div>
</div>

{activeJourneyStep === "review" ? (
  <div className="release-review-card">
    <div className="release-review-grid">
      <div className="release-review-box">Food Packs summary...</div>
      <div className="release-review-box">Monetary summary...</div>
      <div className="release-review-box">Appliance summary...</div>
    </div>
    <div className="release-remarks-wrap">...</div>
    <div className="release-submit-row">...</div>
  </div>
) : (
  <div className="release-step-actions">...</div>
)}
```

Keep the shared summary visible under each step, but keep `Submit Release` only inside `review`.

- [ ] **Step 4: Run test to verify it passes**

Run: `powershell -Command "$env:CI='true'; npm.cmd test -- --runInBand --watch=false src/components/Donations/releasePlannerUtils.test.js"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/src/components/Donations/Inventory.js tests/src/components/css/Inventory.css tests/src/components/Donations/releasePlannerUtils.test.js
git commit -m "feat: add release planner review step"
```

### Task 8: Full verification

**Files:**
- Verify: `tests/src/components/Donations/Inventory.js`
- Verify: `tests/src/components/css/Inventory.css`
- Verify: `tests/src/components/Donations/releasePlannerUtils.js`
- Verify: `tests/src/components/Donations/releasePlannerJourneyUtils.js`
- Verify: `tests/src/components/Donations/releasePlannerUtils.test.js`
- Verify: `tests/src/components/Donations/releasePlannerJourneyUtils.test.js`

- [ ] **Step 1: Run focused planner tests**

Run:

```bash
powershell -Command "$env:CI='true'; npm.cmd test -- --runInBand --watch=false src/components/Donations/releasePlannerUtils.test.js src/components/Donations/releasePlannerJourneyUtils.test.js"
```

Expected: PASS

- [ ] **Step 2: Run relief helper regression tests**

Run:

```bash
powershell -Command "$env:CI='true'; npm.cmd test -- --runInBand --watch=false src/components/relief/requestListUtils.test.js src/components/relief/requestReviewUtils.test.js src/components/relief/supportTypes.test.js"
```

Expected: PASS

- [ ] **Step 3: Run frontend build**

Run:

```bash
npm.cmd run build
```

Expected: Build completes. Existing unrelated ESLint warnings may remain, but no new compile errors from planner changes.

- [ ] **Step 4: Manual flow verification**

Check these scenarios in the app:

```text
1. Approved request with Food Packs only -> Food Packs -> Review
2. Approved request with Food Packs + Monetary -> Food Packs -> Monetary -> Review
3. Approved request with Food Packs + Monetary + Appliances -> Food Packs -> Monetary -> Appliances -> Review
4. Locked steps cannot be opened early
5. Changing selected request resets journey to the first applicable step
6. Appliance step shows compact requested cards on the left and release list on the right
```

Expected: Each journey matches request support types, enforces completion, and shows the shared summary below every step.

- [ ] **Step 5: Commit**

```bash
git add tests/src/components/Donations/Inventory.js tests/src/components/css/Inventory.css tests/src/components/Donations/releasePlannerUtils.js tests/src/components/Donations/releasePlannerUtils.test.js tests/src/components/Donations/releasePlannerJourneyUtils.js tests/src/components/Donations/releasePlannerJourneyUtils.test.js
git commit -m "feat: convert release planner into guided support journey"
```

## Self-Review

### Spec coverage

Covered requirements:

1. Replace crowded planner with a guided journey
2. Generate only needed support steps from the request
3. Require current-step completion before the next step
4. Keep shared summary below every step
5. Reduce oversized requested appliance details
6. Redesign appliance step into a side-by-side request/release workspace
7. Move final submit into a review step
8. Reset journey when switching requests

No gaps found against the approved spec.

### Placeholder scan

Checked for `TODO`, `TBD`, vague “handle later” language, and task references without concrete code/commands. None remain.

### Type consistency

Helper names used consistently across tasks:

1. `buildReleaseJourneySteps`
2. `getInitialJourneyStep`
3. `getNextJourneyStep`
4. `getJourneyStepMeta`
5. `isJourneyStepComplete`

Planner state names used consistently across tasks:

1. `activeJourneyStep`
2. `selectedRequestPendingFood`
3. `selectedRequestPendingMonetary`
4. `selectedRequestPendingAppliance`
5. `releasePreviewSummary`
