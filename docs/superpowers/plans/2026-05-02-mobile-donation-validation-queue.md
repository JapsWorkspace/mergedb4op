# Mobile Donation Validation Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a DRRMO donation validation queue so mobile goods, monetary, and appliance donations only enter inventory after DRRMO confirms physical receipt.

**Architecture:** Extend the existing `Donation` workflow to use queue-first statuses and resubmission history, then add a DRRMO donation review screen patterned after `ReliefRequestsList.js`. On receipt confirmation, map one donation into one `InventoryItem` of the correct type without changing inventory endpoints or breaking existing manual inventory flows.

**Tech Stack:** Node.js, Express, MongoDB/Mongoose, React, existing notification utility, existing inventory and relief UI patterns.

---

## File Structure

### Backend
- Modify: `MyApp/server/models/Donation.js`
  - Replace delivery-oriented status model with validation-queue statuses and add receipt/resubmission metadata.
- Modify: `MyApp/server/controllers/donationController.js`
  - Stop any direct inventory assumptions, add DRRMO receipt/not-received behavior, add resubmit behavior, add inventory handoff logic.
- Modify: `MyApp/server/routes/donationRoutes.js`
  - Expose queue/resubmit/receipt-oriented endpoints while preserving existing donation routes.
- Modify: `MyApp/server/controllers/inventoryController.js`
  - Keep appliance/goods/monetary inventory handling compatible with donation-created records if any extra alignment is needed for monetary reference support.
- Modify: `MyApp/server/models/InventoryItem.js`
  - Only if a dedicated reference field is needed; otherwise preserve current inventory schema and store reference in description/metadata safely.
- Optionally modify: `MyApp/server/utils/createNotification.js`
  - Only if needed for recipient targeting consistency; avoid unrelated changes.

### Frontend
- Create: `tests/src/components/Donations/DonationValidationQueue.js`
  - DRRMO review queue page styled after `ReliefRequestsList.js`.
- Create: `tests/src/components/css/DonationValidationQueue.css`
  - Visual styling aligned with `ReliefRequestList.css`.
- Modify: `tests/src/App.js`
  - Register the DRRMO donation review route.
- Modify: `tests/src/components/Donations/InventoryAdd.js`
  - Align manual monetary input fields with mobile donation monetary fields.
- Modify: `tests/src/components/Donations/MobileDonations.js`
  - Align mobile submission payload to support goods, monetary, appliance, and resubmit behavior.
- Optionally modify: `tests/src/components/Notification.js`
  - Only if existing notification rendering needs donation-specific labels; avoid unrelated layout work.

### Testing / verification
- Verify backend syntax with `node --check` for modified server files.
- Verify frontend build with `npm.cmd run build` in `tests`.

---

### Task 1: Extend donation data model for validation queue

**Files:**
- Modify: `MyApp/server/models/Donation.js`
- Test: backend syntax via `node --check MyApp/server/models/Donation.js`

- [ ] **Step 1: Replace delivery-oriented status enum with review-oriented statuses**

Update the `status` field so it supports the DRRMO validation workflow:

```js
status: {
  type: String,
  enum: ["pending", "received", "not_received", "resubmitted"],
  default: "pending",
  index: true,
},
```

- [ ] **Step 2: Add receipt and resubmission tracking fields**

Add these fields to the schema:

```js
inventoryItemId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "InventoryItem",
  default: null,
},
receivedBy: { type: String, default: "", trim: true },
receivedAt: { type: Date, default: null },
notReceivedBy: { type: String, default: "", trim: true },
notReceivedAt: { type: Date, default: null },
wasResubmitted: { type: Boolean, default: false },
resubmissionCount: { type: Number, default: 0, min: 0 },
lastResubmittedAt: { type: Date, default: null },
```

- [ ] **Step 3: Keep history schema unchanged but ensure it can store new queue statuses**

No new sub-schema is required; keep:

```js
history: {
  type: [
    {
      status: String,
      message: String,
      createdAt: { type: Date, default: Date.now },
      actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    },
  ],
  default: [],
},
```

- [ ] **Step 4: Run backend syntax check**

Run: `node --check MyApp/server/models/Donation.js`
Expected: no output, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add MyApp/server/models/Donation.js
git commit -m "feat(server): add donation validation queue status model"
```

### Task 2: Update donation controller to queue-first intake and inventory handoff

**Files:**
- Modify: `MyApp/server/controllers/donationController.js`
- Reference: `MyApp/server/controllers/inventoryController.js`
- Reference: `MyApp/server/models/InventoryItem.js`
- Test: backend syntax via `node --check MyApp/server/controllers/donationController.js`

- [ ] **Step 1: Update valid statuses and add queue status helpers**

Replace the old status list with:

```js
const VALID_STATUSES = ["pending", "received", "not_received", "resubmitted"];

const normalizeDonationQueueStatus = (value) =>
  String(value || "").trim().toLowerCase();
```

- [ ] **Step 2: Add helper to convert a received donation into one inventory payload**

Create a focused helper near the top of the file:

```js
function buildInventoryPayloadFromDonation(donation, username = "") {
  const type = donation.donationType === "monetary"
    ? "monetary"
    : String(donation.category || "").trim().toLowerCase() === "appliances"
    ? "appliance"
    : donation.itemCategoryType === "appliance"
    ? "appliance"
    : "goods";

  const base = {
    type,
    name:
      type === "monetary"
        ? sanitizeText(donation.donorName, 120) || "Monetary Donation"
        : sanitizeText(donation.itemName, 120),
    description: sanitizeText(donation.description, 1000),
    sourceType: sanitizeText(donation.sourceType, 40) || "external",
    sourceName: sanitizeText(donation.donorName, 120),
    proofFiles: [],
    addedBy: sanitizeText(username, 120) || "drrmo",
    isArchive: false,
  };

  if (type === "monetary") {
    return {
      ...base,
      amount: Number(donation.amount || 0),
      description: [
        sanitizeText(donation.description, 1000),
        donation.referenceNumber
          ? `Reference Number: ${sanitizeText(donation.referenceNumber, 120)}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }

  if (type === "appliance") {
    return {
      ...base,
      category: sanitizeText(donation.category, 80).toLowerCase(),
      quantity: Number(donation.quantity || 0),
      condition: sanitizeText(donation.condition, 40) || "brand_new",
      usageDuration:
        sanitizeText(donation.condition, 40) === "used_item"
          ? sanitizeText(donation.usageDuration, 120)
          : "",
    };
  }

  return {
    ...base,
    category: sanitizeText(donation.category, 80).toLowerCase(),
    quantity: Number(donation.quantity || 0),
    unit: sanitizeText(donation.unit, 30) || "pcs",
    requiresExpiration: Boolean(donation.requiresExpiration),
    expirationDate: donation.expirationDate || null,
  };
}
```

- [ ] **Step 3: Add helper that persists inventory only once per donation**

Use the existing `InventoryItem` model from `../models/InventoryItem` and create a guard helper:

```js
async function createInventoryFromDonationIfNeeded(donation, username = "") {
  if (donation.inventoryItemId) {
    return await InventoryItem.findById(donation.inventoryItemId);
  }

  const payload = buildInventoryPayloadFromDonation(donation, username);
  const item = await InventoryItem.create(payload);
  donation.inventoryItemId = item._id;
  return item;
}
```

- [ ] **Step 4: Update createDonation to stay queue-only and accept all three types**

Revise intake handling:
- Accept mobile submission types that map to `goods`, `monetary`, and `appliance`
- Do not create inventory here
- Set initial status to `pending`
- Add type-specific fields:
  - goods: `itemName`, `category`, `quantity`, `unit`
  - monetary: `amount`, `referenceNumber`
  - appliance: `itemName`, `category`, `quantity`, `condition`, `usageDuration`
- Merge donor identity around `donorName`
- Add `sourceType`

Also change the first history message to:

```js
{
  status: "pending",
  message: "Donation submitted for DRRMO review.",
  createdAt: new Date(),
  actorId: toObjectIdOrNull(getRequestUserId(req)),
}
```

- [ ] **Step 5: Add a DRRMO queue-friendly list response**

Keep `getDonations` endpoint URL unchanged, but ensure filters can use the new statuses and type fields. Include enough data for queue cards/details:
- donorName
- donationType
- category
- itemName
- quantity
- amount
- referenceNumber
- status
- photos
- description
- wasResubmitted
- resubmissionCount
- lastResubmittedAt

- [ ] **Step 6: Update updateDonationStatus for queue actions**

Support two DRRMO actions:
- `received`
- `not_received`

Behavior for `received`:
- block if already received with inventoryItemId present
- call `createInventoryFromDonationIfNeeded`
- set:

```js
donation.status = "received";
donation.receivedBy = sanitizeText(req.session?.username, 120);
donation.receivedAt = new Date();
donation.notReceivedBy = "";
donation.notReceivedAt = null;
```

Add history:

```js
donation.history.push({
  status: "received",
  message: sanitizeText(req.body.message, 240) || "Donation marked as received and added to inventory.",
  createdAt: new Date(),
  actorId: toObjectIdOrNull(getRequestUserId(req)),
});
```

Behavior for `not_received`:

```js
donation.status = "not_received";
donation.notReceivedBy = sanitizeText(req.session?.username, 120);
donation.notReceivedAt = new Date();
```

History message:

```js
"Donation marked as not received."
```

- [ ] **Step 7: Add a resubmit controller action for the same donation record**

Create a new controller function:

```js
async function resubmitDonation(req, res) {
  const donation = await Donation.findById(req.params.id);
  if (!donation) return res.status(404).json({ message: "Donation not found." });

  if (normalizeDonationQueueStatus(donation.status) !== "not_received") {
    return res.status(400).json({ message: "Only not received donations can be resubmitted." });
  }

  donation.status = "resubmitted";
  donation.wasResubmitted = true;
  donation.resubmissionCount = Number(donation.resubmissionCount || 0) + 1;
  donation.lastResubmittedAt = new Date();
  donation.receivedBy = "";
  donation.receivedAt = null;
  donation.notReceivedBy = "";
  donation.notReceivedAt = null;

  donation.history.push({
    status: "resubmitted",
    message: sanitizeText(req.body.message, 240) || "Donation resubmitted for DRRMO review.",
    createdAt: new Date(),
    actorId: toObjectIdOrNull(getRequestUserId(req)),
  });

  await donation.save();
  return res.json(donation);
}
```

- [ ] **Step 8: Add donor/DRRMO notifications for queue transitions**

Add helpers or inline notification calls for:
- new donation submitted -> DRRMO
- donation resubmitted -> DRRMO
- donation marked received -> donor
- donation marked not received -> donor

Keep wording short and operational.

- [ ] **Step 9: Run backend syntax check**

Run: `node --check MyApp/server/controllers/donationController.js`
Expected: no output, exit code 0.

- [ ] **Step 10: Commit**

```bash
git add MyApp/server/controllers/donationController.js
git commit -m "feat(server): add donation queue receipt and resubmission flow"
```

### Task 3: Update donation routes for queue review and resubmission

**Files:**
- Modify: `MyApp/server/routes/donationRoutes.js`
- Test: backend syntax via `node --check MyApp/server/routes/donationRoutes.js`

- [ ] **Step 1: Keep create/list/detail routes intact and add resubmit route**

Add:

```js
router.put("/:id/resubmit", donationController.resubmitDonation);
```

Keep:

```js
router.put("/:id/status", donationController.updateDonationStatus);
```

- [ ] **Step 2: Export the new controller function**

Ensure `donationController.js` exports `resubmitDonation`.

- [ ] **Step 3: Run backend syntax check**

Run: `node --check MyApp/server/routes/donationRoutes.js`
Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add MyApp/server/routes/donationRoutes.js MyApp/server/controllers/donationController.js
git commit -m "feat(server): expose donation resubmission route"
```

### Task 4: Align manual DRRMO monetary intake fields in InventoryAdd

**Files:**
- Modify: `tests/src/components/Donations/InventoryAdd.js`
- Optionally modify: `tests/src/components/css/InventoryAdd.css`
- Test: `npm.cmd run build`

- [ ] **Step 1: Replace monetary source-name language with donor-name language**

In the monetary form section, rename labels/placeholders so the fields become:
- Donor Name
- Amount
- Reference Number
- Source Type
- Description / Notes
- Proof Files

Do not show a separate source-name field for monetary.

- [ ] **Step 2: Add reference number support to manual monetary state and submission**

Extend form state:

```js
referenceNumber: "",
```

For monetary submission:

```js
formData.append("referenceNumber", form.referenceNumber.trim());
```

- [ ] **Step 3: Keep goods and appliance sections unchanged except where shared field names require alignment**

Do not disturb the current goods/appliance layout.

- [ ] **Step 4: Run frontend build**

Run: `npm.cmd run build`
Expected: successful build with only unrelated existing warnings.

- [ ] **Step 5: Commit**

```bash
git add tests/src/components/Donations/InventoryAdd.js tests/src/components/css/InventoryAdd.css
git commit -m "feat(tests): align manual monetary intake fields"
```

### Task 5: Update mobile donation submission screen for all three types and resubmit support

**Files:**
- Modify: `tests/src/components/Donations/MobileDonations.js`
- Test: `npm.cmd run build`

- [ ] **Step 1: Inspect the current component and normalize it to the same field set used by inventory intake**

Ensure the mobile form can submit:
- goods
- monetary
- appliance

Type-specific fields:
- goods: name, category, quantity, unit, description, sourceType
- monetary: donorName, amount, referenceNumber, sourceType, description
- appliance: name, category, quantity, condition, usageDuration, sourceType, description

- [ ] **Step 2: Add resubmit mode for not-received donations**

When a donation record in history has status `not_received`, show a resubmit action that loads the same record into the form and sends:

```js
await fetch(`${BASE_URL}/api/donations/${donationId}/resubmit`, {
  method: "PUT",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
```

If the mobile component already uses POST submission for create, preserve create for new donations and use the resubmit endpoint only for resubmissions.

- [ ] **Step 3: Make status labels user-friendly in donation history**

Map backend statuses to readable mobile labels:
- pending -> Pending Review
- not_received -> Did Not Receive
- resubmitted -> Resubmitted
- received -> Received

- [ ] **Step 4: Run frontend build**

Run: `npm.cmd run build`
Expected: successful build with only unrelated existing warnings.

- [ ] **Step 5: Commit**

```bash
git add tests/src/components/Donations/MobileDonations.js
git commit -m "feat(tests): support mobile donation queue and resubmission"
```

### Task 6: Build DRRMO donation validation queue page

**Files:**
- Create: `tests/src/components/Donations/DonationValidationQueue.js`
- Create: `tests/src/components/css/DonationValidationQueue.css`
- Reference: `tests/src/components/relief/ReliefRequestsList.js`
- Test: `npm.cmd run build`

- [ ] **Step 1: Create the page scaffold with ReliefRequestsList-like layout**

Use a two-panel structure:
- left: queue cards + filters
- right: selected donation details + action panel

Top-level component state should include:

```js
const [rows, setRows] = useState([]);
const [selectedDonation, setSelectedDonation] = useState(null);
const [statusFilter, setStatusFilter] = useState("pending");
const [typeFilter, setTypeFilter] = useState("all");
const [loading, setLoading] = useState(true);
const [submittingAction, setSubmittingAction] = useState(false);
const [confirmState, setConfirmState] = useState({ open: false, action: "", donation: null });
```

- [ ] **Step 2: Fetch queue data from existing donation list endpoint**

Use the existing endpoint with filters:

```js
const params = new URLSearchParams();
if (statusFilter !== "all") params.set("status", statusFilter);
if (typeFilter !== "all") params.set("type", typeFilter);
const res = await fetch(`${BASE_URL}/api/donations?${params.toString()}`, {
  credentials: "include",
});
```

- [ ] **Step 3: Render queue cards by donation type**

Queue card content:
- donor name
- item name or monetary label
- amount or quantity
- category / condition / reference number as applicable
- submitted date
- resubmitted badge when `wasResubmitted` is true or status is `resubmitted`

- [ ] **Step 4: Render the right-side detail panel**

The detail panel should include:
- title block
- donor name
- status banner
- type-specific summary fields
- proof image grid
- description/notes
- contact details
- location/barangay if present
- history/timeline list if available

- [ ] **Step 5: Add confirmation-modal actions**

Actions:

```js
Mark Received
Did Not Receive
```

Call:

```js
await fetch(`${BASE_URL}/api/donations/${donationId}/status`, {
  method: "PUT",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ status: "received" }),
});
```

or:

```js
body: JSON.stringify({ status: "not_received" })
```

- [ ] **Step 6: Match the visual language to ReliefRequestsList.js**

The CSS should include:
- left queue card stack
- selected card outline/left accent
- right-side details panel
- status banner
- compact metric cards
- confirmation modal
- green government dashboard styling

- [ ] **Step 7: Run frontend build**

Run: `npm.cmd run build`
Expected: successful build with only unrelated existing warnings.

- [ ] **Step 8: Commit**

```bash
git add tests/src/components/Donations/DonationValidationQueue.js tests/src/components/css/DonationValidationQueue.css
git commit -m "feat(tests): add DRRMO donation validation queue"
```

### Task 7: Register the DRRMO donation validation route

**Files:**
- Modify: `tests/src/App.js`
- Test: `npm.cmd run build`

- [ ] **Step 1: Import the queue page component**

Add:

```js
import DonationValidationQueue from "./components/Donations/DonationValidationQueue";
```

- [ ] **Step 2: Register the DRRMO route**

Add a route consistent with your DRRMO donation workflow, for example:

```jsx
<Route path="/drrmo/donations/queue" element={<DonationValidationQueue />} />
```

- [ ] **Step 3: Run frontend build**

Run: `npm.cmd run build`
Expected: successful build with only unrelated existing warnings.

- [ ] **Step 4: Commit**

```bash
git add tests/src/App.js
git commit -m "feat(tests): register donation validation queue route"
```

### Task 8: Final verification of donation queue to inventory handoff

**Files:**
- Verify across:
  - `MyApp/server/models/Donation.js`
  - `MyApp/server/controllers/donationController.js`
  - `MyApp/server/routes/donationRoutes.js`
  - `tests/src/components/Donations/MobileDonations.js`
  - `tests/src/components/Donations/DonationValidationQueue.js`
  - `tests/src/components/Donations/InventoryAdd.js`
  - `tests/src/components/Donations/Inventory.js`

- [ ] **Step 1: Run backend syntax checks**

Run:

```bash
node --check MyApp/server/models/Donation.js
node --check MyApp/server/controllers/donationController.js
node --check MyApp/server/routes/donationRoutes.js
```

Expected: all pass with no output.

- [ ] **Step 2: Run frontend build**

Run:

```bash
cd tests
npm.cmd run build
```

Expected: successful build with only unrelated existing warnings.

- [ ] **Step 3: Manually verify end-to-end logic in browser**

Check these flows:
1. Submit goods donation -> donation queue only
2. Submit monetary donation -> donation queue only
3. Submit appliance donation -> donation queue only
4. DRRMO marks goods received -> appears in goods inventory tab
5. DRRMO marks monetary received -> appears in monetary inventory tab
6. DRRMO marks appliance received -> appears in appliance inventory tab
7. DRRMO marks donation did not receive -> donor sees did-not-receive state
8. Donor resubmits same record -> queue shows resubmitted

- [ ] **Step 4: Commit final integration adjustments**

```bash
git add MyApp/server/models/Donation.js MyApp/server/controllers/donationController.js MyApp/server/routes/donationRoutes.js tests/src/components/Donations/MobileDonations.js tests/src/components/Donations/DonationValidationQueue.js tests/src/components/css/DonationValidationQueue.css tests/src/components/Donations/InventoryAdd.js tests/src/App.js
git commit -m "feat: add mobile donation validation queue and inventory handoff"
```
