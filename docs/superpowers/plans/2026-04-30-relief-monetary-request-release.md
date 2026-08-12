# Relief Monetary Request And Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add unified food-pack and monetary relief requests so barangays can request `foodpacks`, `monetary`, or `both`, DRRMO can review them in the existing queue, and approved monetary support can only be released in full from the inventory planner.

**Architecture:** Keep the current single-request pipeline and extend it with `requestType`, `requestedMonetaryAmount`, and monetary fulfillment fields. The backend remains the source of truth for validation and status transitions, while the frontend conditionally reveals food and monetary controls using the existing request queue and release planner screens.

**Tech Stack:** React 19 + CRA frontend, Express + Mongoose backend, existing PDF/history/notification helpers, React Testing Library for frontend checks, `node --check` and `react-scripts test/build` for verification.

---

## File Map

**Backend core**
- Modify: `MyApp/server/models/ReliefRequest.js`
- Modify: `MyApp/server/models/ReliefRelease.js`
- Modify: `MyApp/server/controllers/reliefRequestController.js`
- Modify: `MyApp/server/controllers/reliefReleaseController.js`
- Modify: `MyApp/server/controllers/inventoryController.js`

**Frontend core**
- Modify: `tests/src/components/relief/ReliefRequestForm.js`
- Modify: `tests/src/components/relief/ReliefRequestsList.js`
- Modify: `tests/src/components/Donations/Inventory.js`
- Modify: `tests/src/components/css/ReliefRequestForm.css`
- Modify: `tests/src/components/css/ReliefRequestList.css`
- Modify: `tests/src/components/css/Inventory.css`

**Frontend tests**
- Create: `tests/src/components/relief/__tests__/ReliefRequestForm.monetary.test.js`
- Create: `tests/src/components/relief/__tests__/ReliefRequestsList.monetary.test.js`

**Verification commands**
- Frontend targeted tests: `npm test -- --runInBand --watchAll=false ReliefRequestForm.monetary.test.js ReliefRequestsList.monetary.test.js`
- Frontend production build: `npm run build`
- Backend syntax checks: `node --check MyApp/server/models/ReliefRequest.js`, `node --check MyApp/server/models/ReliefRelease.js`, `node --check MyApp/server/controllers/reliefRequestController.js`, `node --check MyApp/server/controllers/reliefReleaseController.js`, `node --check MyApp/server/controllers/inventoryController.js`

### Task 1: Extend Relief Request Data Model And Backend Validation

**Files:**
- Modify: `MyApp/server/models/ReliefRequest.js`
- Modify: `MyApp/server/controllers/reliefRequestController.js`

- [ ] **Step 1: Add failing model/controller expectations for request type and monetary totals**

Create or update request-shape assertions in the plan implementation notes before code edits:

```js
const requestPayload = {
  requestType: "both",
  totals: {
    requestedFoodPacks: 25,
    requestedMonetaryAmount: 15000,
  },
  remarks: "Need cash support for urgent medicine and transport."
};

// Expected backend validation behavior
// - foodpacks: requestedFoodPacks > 0
// - monetary: requestedMonetaryAmount > 0 and remarks required
// - both: both values > 0 and remarks required
```

- [ ] **Step 2: Run backend syntax baseline before edits**

Run:

```bash
node --check MyApp/server/models/ReliefRequest.js
node --check MyApp/server/controllers/reliefRequestController.js
```

Expected: both commands exit cleanly with no syntax errors.

- [ ] **Step 3: Add new request fields to the request model**

Update the schema to support a default-safe request type and monetary totals. Follow the existing nested `totals` and `fulfillment` shape:

```js
requestType: {
  type: String,
  enum: ["foodpacks", "monetary", "both"],
  default: "foodpacks",
  trim: true,
},

totals: {
  requestedFoodPacks: { type: Number, default: 0, min: 0 },
  requestedMonetaryAmount: { type: Number, default: 0, min: 0 },
  // keep existing totals here
},

fulfillment: {
  releasedFoodPacks: { type: Number, default: 0, min: 0 },
  receivedFoodPacks: { type: Number, default: 0, min: 0 },
  releasedMonetaryAmount: { type: Number, default: 0, min: 0 },
  receivedMonetaryAmount: { type: Number, default: 0, min: 0 },
}
```

- [ ] **Step 4: Update request payload normalization and validation in the controller**

Extend existing payload parsing instead of creating a second request path:

```js
const requestType = normalizeString(req.body.requestType || "foodpacks").toLowerCase();
const requestedMonetaryAmount = toNumber(req.body?.totals?.requestedMonetaryAmount);
const trimmedRemarks = normalizeString(req.body.remarks);

if (requestType === "foodpacks" && requestedFoodPacks <= 0) {
  return res.status(400).json({ message: "Requested food packs must be greater than 0." });
}

if (requestType === "monetary" && requestedMonetaryAmount <= 0) {
  return res.status(400).json({ message: "Requested monetary amount must be greater than 0." });
}

if (requestType === "both" && (requestedFoodPacks <= 0 || requestedMonetaryAmount <= 0)) {
  return res.status(400).json({ message: "Food packs and monetary amount are both required." });
}

if (["monetary", "both"].includes(requestType) && !trimmedRemarks) {
  return res.status(400).json({ message: "Remarks are required for requests with monetary support." });
}
```

- [ ] **Step 5: Update request summary and stage calculations**

Preserve existing food logic while adding combined fulfillment checks:

```js
const requestedMoney = toNumber(request?.totals?.requestedMonetaryAmount);
const releasedMoney = toNumber(fulfillment?.releasedMonetaryAmount);
const receivedMoney = toNumber(fulfillment?.receivedMonetaryAmount);

const foodComplete = requestedFoodPacks <= 0 || receivedFoodPacks >= requestedFoodPacks;
const moneyComplete = requestedMoney <= 0 || receivedMoney >= requestedMoney;

if (foodComplete && moneyComplete) {
  request.status = "received";
} else if (
  (requestedFoodPacks > 0 && releasedFoodPacks >= requestedFoodPacks) &&
  (requestedMoney <= 0 || releasedMoney >= requestedMoney)
) {
  request.status = "released";
} else if (releasedFoodPacks > 0 || releasedMoney > 0) {
  request.status = "partially_released";
}
```

- [ ] **Step 6: Re-run backend syntax checks**

Run:

```bash
node --check MyApp/server/models/ReliefRequest.js
node --check MyApp/server/controllers/reliefRequestController.js
```

Expected: no syntax errors.

- [ ] **Step 7: Commit**

```bash
git add MyApp/server/models/ReliefRequest.js MyApp/server/controllers/reliefRequestController.js
git commit -m "feat: add monetary fields to relief requests"
```

### Task 2: Extend Relief Release Logic For Full Monetary Release

**Files:**
- Modify: `MyApp/server/models/ReliefRelease.js`
- Modify: `MyApp/server/controllers/reliefReleaseController.js`
- Modify: `MyApp/server/controllers/inventoryController.js`

- [ ] **Step 1: Define the failing release behavior**

Use these target scenarios while implementing:

```js
// approved monetary-only request
{
  requestType: "monetary",
  totals: { requestedMonetaryAmount: 10000 }
}

// allowed
{ releasedMonetaryAmount: 10000 }

// blocked
{ releasedMonetaryAmount: 5000 }   // partial release
{ releasedMonetaryAmount: 12000 }  // over-release
```

- [ ] **Step 2: Run backend syntax baseline for release files**

Run:

```bash
node --check MyApp/server/models/ReliefRelease.js
node --check MyApp/server/controllers/reliefReleaseController.js
node --check MyApp/server/controllers/inventoryController.js
```

Expected: no syntax errors.

- [ ] **Step 3: Add release-level monetary fields**

Extend the release schema in the same record rather than splitting records:

```js
requestType: {
  type: String,
  enum: ["foodpacks", "monetary", "both"],
  default: "foodpacks",
},
releasedMonetaryAmount: {
  type: Number,
  default: 0,
  min: 0,
},
receivedMonetaryAmount: {
  type: Number,
  default: 0,
  min: 0,
}
```

- [ ] **Step 4: Aggregate monetary fulfillment in release helpers**

Update helper reducers that currently sum only food packs:

```js
const releasedMonetaryAmount = releases.reduce(
  (sum, release) => sum + toNumber(release.releasedMonetaryAmount),
  0
);

const receivedMonetaryAmount = releases
  .filter((release) => release.releaseStatus === "received")
  .reduce((sum, release) => sum + toNumber(release.releasedMonetaryAmount), 0);

return {
  releasedFoodPacks,
  receivedFoodPacks,
  releasedMonetaryAmount,
  receivedMonetaryAmount,
  totalReleases,
}
```

- [ ] **Step 5: Enforce exact monetary release and available balance checks**

Extend the release submit controller:

```js
const requestedMoney = toNumber(reliefRequest?.totals?.requestedMonetaryAmount);
const alreadyReleasedMoney = toNumber(reliefRequest?.fulfillment?.releasedMonetaryAmount);
const remainingMoney = Math.max(0, requestedMoney - alreadyReleasedMoney);
const submittedMoney = toNumber(req.body.releasedMonetaryAmount);

if (requestType === "monetary" || requestType === "both") {
  if (submittedMoney <= 0) {
    return res.status(400).json({ message: "Released monetary amount is required." });
  }

  if (submittedMoney !== remainingMoney) {
    return res.status(400).json({
      message: "Monetary support must be released in full using the approved remaining amount."
    });
  }

  if (availableMonetaryBalance < submittedMoney) {
    return res.status(400).json({ message: "Insufficient monetary inventory balance." });
  }
}
```

- [ ] **Step 6: Deduct monetary inventory from the correct inventory source**

Reuse the existing monetary item shape in inventory instead of creating a new ledger:

```js
const monetaryInventory = await InventoryItem.findOne({
  type: "monetary",
  isArchived: false,
});

if (!monetaryInventory || Number(monetaryInventory.amount || 0) < submittedMoney) {
  return res.status(400).json({ message: "Insufficient monetary inventory balance." });
}

monetaryInventory.amount = Number(monetaryInventory.amount || 0) - submittedMoney;
await monetaryInventory.save();
```

- [ ] **Step 7: Re-run backend syntax checks**

Run:

```bash
node --check MyApp/server/models/ReliefRelease.js
node --check MyApp/server/controllers/reliefReleaseController.js
node --check MyApp/server/controllers/inventoryController.js
```

Expected: no syntax errors.

- [ ] **Step 8: Commit**

```bash
git add MyApp/server/models/ReliefRelease.js MyApp/server/controllers/reliefReleaseController.js MyApp/server/controllers/inventoryController.js
git commit -m "feat: support full monetary relief releases"
```

### Task 3: Add Barangay Request UI For Food, Monetary, And Both

**Files:**
- Modify: `tests/src/components/relief/ReliefRequestForm.js`
- Modify: `tests/src/components/css/ReliefRequestForm.css`
- Create: `tests/src/components/relief/__tests__/ReliefRequestForm.monetary.test.js`

- [ ] **Step 1: Write the failing frontend test**

Create a focused React Testing Library test that proves remarks and amount are required:

```js
it("requires remarks and monetary amount when request type is monetary", async () => {
  render(<ReliefRequestForm />);

  await userEvent.selectOptions(screen.getByLabelText(/request type/i), "monetary");
  await userEvent.click(screen.getByRole("button", { name: /submit request/i }));

  expect(screen.getByText(/requested monetary amount/i)).toBeInTheDocument();
  expect(screen.getByText(/remarks are required/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- --runInBand --watchAll=false ReliefRequestForm.monetary.test.js
```

Expected: FAIL because the request type selector and monetary validation do not exist yet.

- [ ] **Step 3: Add request type and monetary amount state**

Add state near the existing summary fields:

```js
const [requestType, setRequestType] = useState("foodpacks");
const [requestedMonetaryAmount, setRequestedMonetaryAmount] = useState("");
```

When hydrating old requests:

```js
setRequestType(editingRequest.requestType || "foodpacks");
setRequestedMonetaryAmount(
  String(editingRequest?.totals?.requestedMonetaryAmount || "")
);
```

- [ ] **Step 4: Add conditional validation and payload mapping**

Update submit validation and outgoing payload:

```js
const monetaryAmountValue = Number(requestedMonetaryAmount || 0);

if (requestType === "monetary" && monetaryAmountValue <= 0) {
  nextErrors.requestedMonetaryAmount = "Requested monetary amount is required.";
}

if (requestType === "both") {
  if (totalRequestedFoodPacks <= 0) {
    nextErrors.requestedFoodPacks = "Food packs are required for combined requests.";
  }
  if (monetaryAmountValue <= 0) {
    nextErrors.requestedMonetaryAmount = "Monetary amount is required for combined requests.";
  }
}

if (["monetary", "both"].includes(requestType) && !remarks.trim()) {
  nextErrors.remarks = "Remarks are required when monetary support is requested.";
}

const payload = {
  requestType,
  remarks: remarks.trim(),
  totals: {
    requestedFoodPacks: totalRequestedFoodPacks,
    requestedMonetaryAmount: monetaryAmountValue,
  },
  rows: preparedRows,
}
```

- [ ] **Step 5: Render the new fields and preserve current form layout**

Add a compact selector and conditional field block:

```jsx
<div className="rrf-request-type-grid">
  <label>
    <span>Request Type</span>
    <select value={requestType} onChange={(e) => setRequestType(e.target.value)}>
      <option value="foodpacks">Food Packs</option>
      <option value="monetary">Monetary</option>
      <option value="both">Both</option>
    </select>
  </label>

  {(requestType === "monetary" || requestType === "both") && (
    <label>
      <span>Requested Monetary Amount</span>
      <input
        type="number"
        min="0"
        value={requestedMonetaryAmount}
        onChange={(e) => setRequestedMonetaryAmount(e.target.value)}
      />
    </label>
  )}
</div>
```

- [ ] **Step 6: Add the minimal CSS for the new summary fields**

Keep the same design language already used by the request form:

```css
.rrf-request-type-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.rrf-field-error {
  color: #b42318;
  font-size: 12px;
  font-weight: 700;
}
```

- [ ] **Step 7: Re-run the test and build**

Run:

```bash
npm test -- --runInBand --watchAll=false ReliefRequestForm.monetary.test.js
npm run build
```

Expected: the targeted test passes and the frontend build completes.

- [ ] **Step 8: Commit**

```bash
git add tests/src/components/relief/ReliefRequestForm.js tests/src/components/css/ReliefRequestForm.css tests/src/components/relief/__tests__/ReliefRequestForm.monetary.test.js
git commit -m "feat: add monetary request type to relief form"
```

### Task 4: Show Monetary Details In The DRRMO Review Queue

**Files:**
- Modify: `tests/src/components/relief/ReliefRequestsList.js`
- Modify: `tests/src/components/css/ReliefRequestList.css`
- Create: `tests/src/components/relief/__tests__/ReliefRequestsList.monetary.test.js`

- [ ] **Step 1: Write the failing review test**

Create a queue review test for request type and monetary amount:

```js
it("shows request type and requested monetary amount in the selected request panel", async () => {
  render(<ReliefRequestsList />);

  expect(await screen.findByText(/monetary/i)).toBeInTheDocument();
  expect(screen.getByText(/php 15,000/i)).toBeInTheDocument();
  expect(screen.getByText(/remarks/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the queue test to confirm failure**

Run:

```bash
npm test -- --runInBand --watchAll=false ReliefRequestsList.monetary.test.js
```

Expected: FAIL because request type and monetary totals are not rendered yet.

- [ ] **Step 3: Normalize monetary fields in queue helpers**

Add small helper readers near the existing food helpers:

```js
const getRequestedMonetaryAmount = (request) =>
  Number(request?.totals?.requestedMonetaryAmount || 0);

const getRequestTypeLabel = (request) => {
  const requestType = normalize(request?.requestType || "foodpacks");
  if (requestType === "monetary") return "Monetary";
  if (requestType === "both") return "Food + Monetary";
  return "Food Packs";
};
```

- [ ] **Step 4: Show monetary request details in the selected request panel**

Add summary chips/cards alongside the existing request metrics:

```jsx
<div className="rrl-request-kind-row">
  <span className="rrl-pill rrl-pill-neutral">{getRequestTypeLabel(displayedRequest)}</span>
  {getRequestedMonetaryAmount(displayedRequest) > 0 && (
    <span className="rrl-pill rrl-pill-money">
      PHP {Number(getRequestedMonetaryAmount(displayedRequest)).toLocaleString()}
    </span>
  )}
</div>
```

Also keep remarks visible when money is involved:

```jsx
{["monetary", "both"].includes(normalize(displayedRequest?.requestType)) && (
  <div className="rrl-remarks-box emphasized">
    <p>{displayedRequest?.remarks || "No remarks provided."}</p>
  </div>
)}
```

- [ ] **Step 5: Add CSS for the new monetary request visuals**

```css
.rrl-pill-money {
  background: #eef8f0;
  border: 1px solid #bfe0c7;
  color: #166534;
}

.rrl-remarks-box.emphasized {
  border-left: 4px solid #166534;
}
```

- [ ] **Step 6: Re-run the queue test and frontend build**

Run:

```bash
npm test -- --runInBand --watchAll=false ReliefRequestsList.monetary.test.js
npm run build
```

Expected: the targeted review test passes and the frontend build completes.

- [ ] **Step 7: Commit**

```bash
git add tests/src/components/relief/ReliefRequestsList.js tests/src/components/css/ReliefRequestList.css tests/src/components/relief/__tests__/ReliefRequestsList.monetary.test.js
git commit -m "feat: show monetary support details in relief review queue"
```

### Task 5: Extend Inventory Release Planner For Monetary And Combined Requests

**Files:**
- Modify: `tests/src/components/Donations/Inventory.js`
- Modify: `tests/src/components/css/Inventory.css`

- [ ] **Step 1: Verify the current release planner assumptions**

Before editing, inspect the current planner branch points and confirm these values exist in approved requests:

```js
request.requestType
request.totals.requestedFoodPacks
request.totals.requestedMonetaryAmount
request.fulfillment.releasedFoodPacks
request.fulfillment.releasedMonetaryAmount
```

- [ ] **Step 2: Add request-type-aware planner helpers**

Keep the planner branch logic explicit:

```js
const getRequestType = (request) =>
  String(request?.requestType || "foodpacks").trim().toLowerCase();

const requiresFoodRelease = (request) =>
  ["foodpacks", "both"].includes(getRequestType(request));

const requiresMonetaryRelease = (request) =>
  ["monetary", "both"].includes(getRequestType(request));
```

- [ ] **Step 3: Add monetary release state and exact-amount locking**

```js
const [releasedMonetaryAmount, setReleasedMonetaryAmount] = useState("");

useEffect(() => {
  const request = selectedApprovedRequest;
  if (!request) return;

  const requested = Number(request?.totals?.requestedMonetaryAmount || 0);
  const alreadyReleased = Number(request?.fulfillment?.releasedMonetaryAmount || 0);
  const remaining = Math.max(0, requested - alreadyReleased);

  setReleasedMonetaryAmount(remaining > 0 ? String(remaining) : "");
}, [selectedApprovedRequest]);
```

- [ ] **Step 4: Render monetary planner UI beside the food controls**

Add a planner panel using the same visual language:

```jsx
{requiresMonetaryRelease(selectedApprovedRequest) && (
  <div className="release-money-panel">
    <div className="release-money-row">
      <strong>Approved Monetary Amount</strong>
      <span>{formatMoney(selectedApprovedRequest?.totals?.requestedMonetaryAmount || 0)}</span>
    </div>
    <div className="release-money-row">
      <strong>To Release</strong>
      <input value={releasedMonetaryAmount} readOnly />
    </div>
  </div>
)}
```

- [ ] **Step 5: Submit the monetary amount with the existing release payload**

Extend the outgoing request rather than adding a second submit:

```js
const payload = {
  reliefRequestId: selectedReleaseRequestId,
  releaseMode: finalReleaseMode,
  foodPacksReleased: Number(foodPacksToRelease || 0),
  releasedMonetaryAmount: Number(releasedMonetaryAmount || 0),
  remarks: releaseRemarks.trim(),
  requestType: getRequestType(selectedApprovedRequest),
  items: releaseItems,
}
```

For `monetary` requests, submit with zero food items only if the backend accepts that mode explicitly.

- [ ] **Step 6: Add planner CSS for monetary summary blocks**

```css
.release-money-panel {
  border: 1px solid #d9e9de;
  border-radius: 16px;
  padding: 14px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbf9 100%);
}

.release-money-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
```

- [ ] **Step 7: Run full verification**

Run:

```bash
npm test -- --runInBand --watchAll=false ReliefRequestForm.monetary.test.js ReliefRequestsList.monetary.test.js
npm run build
node --check MyApp/server/models/ReliefRequest.js
node --check MyApp/server/models/ReliefRelease.js
node --check MyApp/server/controllers/reliefRequestController.js
node --check MyApp/server/controllers/reliefReleaseController.js
node --check MyApp/server/controllers/inventoryController.js
```

Expected:

- targeted frontend tests PASS
- frontend build succeeds
- backend syntax checks succeed

- [ ] **Step 8: Commit**

```bash
git add tests/src/components/Donations/Inventory.js tests/src/components/css/Inventory.css
git commit -m "feat: support monetary releases in inventory planner"
```

## Spec Coverage Check

- Request types, required amounts, and required remarks are covered in Tasks 1 and 3.
- DRRMO review visibility is covered in Task 4.
- Full-amount-only monetary release is covered in Task 2 and Task 5.
- Combined `both` fulfillment and status handling is covered in Tasks 1 and 2.
- Backward compatibility for legacy food-pack requests is covered by defaulting missing `requestType` to `foodpacks` in Tasks 1, 3, and 4.

## Placeholder Scan

No `TBD`, `TODO`, or deferred validation placeholders remain. Commands, file paths, payload shapes, and status rules are spelled out directly in the tasks above.

## Type Consistency Check

Shared names used consistently across all tasks:

- `requestType`
- `totals.requestedMonetaryAmount`
- `fulfillment.releasedMonetaryAmount`
- `fulfillment.receivedMonetaryAmount`
- `releasedMonetaryAmount`

