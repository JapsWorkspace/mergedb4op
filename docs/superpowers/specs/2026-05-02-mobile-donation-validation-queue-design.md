# Mobile Donation Validation Queue Design

Date: 2026-05-02

## Goal
Add a DRRMO validation queue for mobile donations so donations from mobile users do not enter inventory immediately. DRRMO must first review the submission and mark it as either received or did not receive. Only received donations become inventory records.

This flow must support all three donation/inventory types:
- goods
- monetary
- appliance

The flow must preserve the current inventory design language and must route received donations into the correct Inventory.js tab.

## Scope
In scope:
- Donation backend status and history updates
- DRRMO donation review queue page and detail panel
- Mobile donation resubmission of the same record
- Inventory creation only after DRRMO marks a donation as received
- Field alignment between mobile donation submission and DRRMO manual inventory add flow
- Monetary field alignment with reference number support
- Appliance support in mobile donation flow

Out of scope:
- Appliance release planner integration
- Barangay relief request appliance support
- Replacing existing inventory routes or inventory analytics behavior
- Major redesign of unrelated frontend pages

## Current Problem
The current donation flow allows at least some mobile donations, especially monetary donations, to behave as if they are already inventory before DRRMO has physically received them. This breaks the intended operational workflow.

DRRMO needs a review queue similar to ReliefRequestsList.js so they can inspect donation details and proof images, then decide whether the donation was actually received.

## Approved Product Decisions
1. Mobile donations must be queue-first, not inventory-first.
2. DRRMO reviews the clicked donation in a detail panel and then confirms the action through a modal.
3. When DRRMO clicks Received, the donation is converted into one inventory record and appears in the correct Inventory.js tab.
4. When DRRMO clicks Did Not Receive, the donor sees that result and can reopen the same donation record.
5. Reopening a donation after a did-not-receive outcome must mark the same record as resubmitted.
6. This resubmission behavior should mirror the relief request pattern where a rejected-and-sent-again record is clearly indicated as resubmitted.
7. All three mobile donation types go through the queue:
   - goods
   - monetary
   - appliance
8. Source Name and Donor Name should be treated as the same concept for monetary intake. Manual DRRMO monetary entry must be aligned to this.

## UX Flow

### Mobile user
1. User submits a donation from mobile.
2. Donation is saved in Donation collection with pending status.
3. User sees the donation in their history.
4. If DRRMO marks it did not receive, user sees that status and can resubmit.
5. Resubmitting reopens the same record and changes the record status/history to resubmitted.

### DRRMO
1. DRRMO opens a new donation review queue page.
2. Left panel shows donation queue cards similar to ReliefRequestsList.js.
3. Clicking a queue card opens full details in the right panel.
4. DRRMO reviews type-specific fields and uploaded proof images.
5. DRRMO clicks either:
   - Mark Received
   - Did Not Receive
6. A confirmation modal appears, matching the existing relief confirmation interaction.
7. If DRRMO confirms Received:
   - donation status becomes received
   - one inventory record is created
   - the new inventory record is created using the donation data and placed in the correct inventory type
8. If DRRMO confirms Did Not Receive:
   - donation status becomes not_received
   - no inventory record is created
   - donor can later reopen/resubmit the same record

## Data Model Design

### Donation model changes
Current donation statuses are delivery-oriented and need to be replaced or extended for the validation queue.

New operational statuses:
- pending
- received
- not_received
- resubmitted

Recommended model additions:
- inventoryItemId: ObjectId or null
  - stores the inventory record created after DRRMO receipt confirmation
- receivedBy: user identifier or name
- receivedAt: Date or null
- notReceivedBy: user identifier or name
- notReceivedAt: Date or null
- wasResubmitted: Boolean
- resubmissionCount: Number
- lastResubmittedAt: Date or null

History entries should clearly track:
- pending
- received
- not_received
- resubmitted

### Donation type field alignment
The mobile donation record must align to the inventory intake fields so DRRMO-reviewed donations can be converted directly.

#### Goods donation fields
- name / itemName
- category
- quantity
- unit
- description
- sourceType
- donorName
- proof photos
- optional expirationDate or requiresExpiration support if mobile form later supports it

#### Monetary donation fields
- donorName
- amount
- referenceNumber
- sourceType
- description
- proof photos

Source Name must not be treated as a separate required concept from donor name.

#### Appliance donation fields
- name / itemName
- category
- quantity
- condition
- usageDuration only if used item
- sourceType
- donorName
- description
- proof photos

## Inventory Handoff Rules
When DRRMO confirms Received, create one InventoryItem based on donation type.

### Goods -> InventoryItem
- type: goods
- name
- category
- quantity
- unit
- description
- sourceType
- sourceName: donorName
- proofFiles derived from donation proofs if desired or leave empty if current inventory proof format differs
- addedBy: DRRMO username or receipt actor
- isArchive: false

### Monetary -> InventoryItem
- type: monetary
- name: donorName or a consistent monetary record label
- amount
- description
- sourceType
- sourceName: donorName
- proofFiles
- addedBy
- isArchive: false
- referenceNumber should be preserved either in description or in a dedicated inventory monetary field if already supported

### Appliance -> InventoryItem
- type: appliance
- name
- category
- quantity
- condition
- usageDuration if used item
- description
- sourceType
- sourceName: donorName
- proofFiles
- addedBy
- isArchive: false

Each received donation must map into the correct Inventory.js tab:
- goods tab for goods
- monetary tab for monetary
- appliances tab for appliance

A donation that has already created an inventory record must not create duplicate inventory records if DRRMO retries the action.

## DRRMO Review Queue UI
Create a new DRRMO page that visually follows ReliefRequestsList.js.

### Left panel
- queue cards
- filter by status
- filter by donation type
- search by donor, item name, category, reference number

Queue statuses:
- Pending Review
- Did Not Receive
- Received

Card details vary slightly by type:
- goods: item name, category, quantity, donor
- monetary: donor, amount, reference number
- appliance: item name, category, quantity, condition, donor

If a donation was reopened after a did-not-receive outcome, show a resubmitted badge or indicator.

### Right panel
Display the selected donation details in a clear review panel:
- title block
- donor name
- status banner
- type-specific summary cards
- proof image gallery / uploaded evidence
- donor contact information
- location / barangay if present
- description / notes
- timeline/history if space allows

Action panel:
- Mark Received
- Did Not Receive

These actions must use confirmation modal interactions patterned after ReliefRequestsList.js.

## Mobile History UX
Mobile donation history must show the updated operational statuses.

User-visible states:
- pending
- did not receive
- resubmitted
- received

If the latest state is did not receive, the record should expose a resubmit action that updates the same donation record instead of creating a new one.

## Manual DRRMO Monetary Intake Alignment
InventoryAdd.js currently needs alignment for monetary records.

Manual monetary fields should become:
- Donor Name
- Amount
- Reference Number
- Source Type
- Description / Notes
- Proof Files

Do not keep a separate Source Name field for monetary if it duplicates donor identity.

## Backend Endpoints
Keep existing routes where possible and extend the donation module rather than inventing a parallel module.

Expected backend additions or updates:
- create donation remains but no inventory write occurs there
- update donation status endpoint must support:
  - received
  - not_received
- a dedicated resubmit endpoint is preferable for clarity, for example:
  - PUT /api/donations/:id/resubmit
- DRRMO queue endpoint may reuse list endpoint with status filtering or add a queue-flavored response if necessary
- received action should internally create inventory record and save inventoryItemId on donation

Only return 500 when actual persistence fails. Validation and business-rule failures should return clear 4xx responses.

## Notifications
Notifications should be added for the operational flow.

### To DRRMO
- new donation submitted
- donation resubmitted

### To donor/mobile user
- donation marked received
- donation marked did not receive

Notification language should be short and operational, consistent with the rest of the project.

## Safety / Consistency Rules
- Do not let pending or not_received donations appear in inventory.
- Do not create duplicate inventory records on repeated receive actions.
- Do not break existing Inventory.js tabs or type filters.
- Do not change existing inventory routes or analytics endpoints unless required by the donation handoff.
- Preserve existing ReliefRequestsList.js behavior; only reuse its design pattern.

## Testing Requirements
1. Submit a goods donation from mobile -> appears in donation queue -> not yet in inventory.
2. DRRMO marks goods donation Received -> appears in goods inventory tab.
3. Submit a monetary donation from mobile -> appears in donation queue -> not yet in inventory.
4. DRRMO marks monetary donation Received -> appears in monetary inventory tab.
5. Submit an appliance donation from mobile -> appears in donation queue -> not yet in inventory.
6. DRRMO marks appliance donation Received -> appears in appliance inventory tab.
7. DRRMO marks donation Did Not Receive -> donor sees that in mobile history.
8. Donor resubmits same record -> status/history indicates resubmitted and DRRMO queue reflects it.
9. Manual DRRMO monetary add form still works and matches the same field language.
10. Existing inventory add/edit/archive/export flows remain working.
