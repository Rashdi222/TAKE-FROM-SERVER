# Manual Payments Audit and Execution Plan

## 1. Audit Summary

This document is based on the current codebase state in `/home/nain/sixerbat` as of 2026-03-31.

### Existing infrastructure that already exists

#### Backend
- `Back.Payments` exists and currently manages:
  - payment method configuration
  - player deposit request creation
  - player withdrawal request creation
  - super admin withdrawal approval
- `payment_methods` table exists with fields:
  - `id`
  - `provider`
  - `is_active`
  - `config` (map/json)
  - `created_by_id`
- `payment_transactions` table exists with fields:
  - `id`
  - `user_id`
  - `payment_method_id`
  - `transaction_id`
  - `amount`
  - `status`
  - `type`
  - `provider_transaction_id`
  - `provider_response`
- `Accounts.wallet_mode/1` already distinguishes:
  - `self_service`
  - `managed_by_master_admin`
- master-admin-created players are currently blocked from self-service deposit and withdrawal.

#### Frontend
- Player wallet pages exist:
  - `/wallet`
  - `/wallet/deposit`
  - `/wallet/withdraw`
  - `/wallet/transactions`
- Super admin payment pages exist:
  - `/admin/payments/methods`
  - `/admin/payments/methods/configure`
  - `/admin/payments/withdrawals`
  - `/admin/payments/transactions`
- Payment method selection exists in the player wallet UI.

#### Ownership foundation
- `users.created_by_id` already exists.
- This already allows us to distinguish:
  - direct/self-service player
  - master-admin-managed player
- `payment_methods.created_by_id` already exists, but the current implementation does not use it to enforce ownership or visibility.

### What is broken or incomplete right now

#### A. Payment methods are not truly flexible
Current problem:
- `PaymentMethod.provider` is an enum limited to:
  - `:easypaisa`
  - `:manual`
- This prevents admin-defined arbitrary manual payment methods such as:
  - JazzCash
  - Bank Transfer
  - USDT TRC20
  - NayaPay
  - specific branch account
  - custom collector account

Why the JSON is showing in admin UI:
- The current admin page directly renders `payment_methods.config` as raw JSON.
- The current configure page is also just a JSON textarea.
- This is not operator-safe and not business-friendly.

#### B. Payment methods are not owner-scoped
Current problem:
- `list_active_payment_methods_for_user/1` simply returns all active methods.
- It does not route by owner.
- It does not use `payment_methods.created_by_id` meaningfully.
- There is no concept of:
  - global/super-admin payment methods
  - master-admin-owned payment methods
  - player-visible method resolution by account ownership

#### C. Deposit flow has no approval workflow
Current problem:
- Player deposit creates a pending `payment_transaction` only.
- There is no approval queue for deposits.
- There is no receipt upload field.
- There is no receipt storage.
- There is no deposit approval endpoint.
- There is no balance credit on admin approval of a manual deposit.

This means the current deposit flow is incomplete for manual transfer operations.

#### D. Withdrawal flow is only super-admin-centric
Current problem:
- Only super admin can approve withdrawal via `/api/super-admin/payments/withdrawals/:id/approve`.
- There is no ownership-based routing.
- There is no flow where a master admin receives withdrawal requests for players they created.

#### E. No receipt upload infrastructure for payments
Current problem:
- There is no payment receipt storage model.
- There is no uploaded file metadata model for payments.
- There is no player receipt field in deposit request UI.
- There is no admin review panel showing uploaded proof.

#### F. No dedicated payment approval workspace
Current problem:
- There is a withdrawal approvals page only.
- There is no unified `Payment Approval` tab/page where admins can review:
  - pending deposits
  - pending withdrawals
  - attached receipts
  - payment method used
  - request owner and approval destination

#### G. Master-admin-managed players are blocked instead of routed
Current problem:
- The current wallet mode blocks managed players from self-service deposit/withdraw.
- That is too rigid for the business flow you described.
- The required behavior is not “block”; it is “route to the correct operator-owned payment methods and approval lane”.

## 2. Required Business Model

This is the target business behavior to implement.

### Player payment method visibility rules

#### Direct player / self-registered player
- Player should see payment methods owned by super admin.
- Deposit request should go to super admin approval queue.
- Withdrawal request should go to super admin approval queue.

#### Master-admin-created player
- Player should see payment methods owned by that master admin.
- Deposit request should go to that master admin approval queue.
- Withdrawal request should go to that master admin approval queue.

### Receipt rule
- Manual deposit must require receipt upload before request submission.
- Approval screen must show uploaded receipt.
- Approver must approve or reject after reviewing the receipt.

### Wallet effect rule
- Deposit approval credits player balance.
- Withdrawal approval debits player balance.
- All approvals must create a proper wallet/account transaction trail.

## 3. Target Architecture

### Core ownership model
Introduce explicit payment ownership.

#### Payment method owner types
- `super_admin`
- `master_admin`

#### Payment request approval owner types
- `super_admin`
- `master_admin`

#### Resolution rule
For a player:
- if `created_by_id` references a master admin:
  - payment owner = that master admin
- otherwise:
  - payment owner = super admin

This ownership rule must be enforced on the backend, not inferred only in UI.

## 4. Recommended Data Model Changes

### 4.1 Payment methods
Current table is too limited.

#### Replace provider enum dependence with a flexible manual-method model
Recommended fields for `payment_methods`:
- `id`
- `owner_type` (`super_admin` or `master_admin`)
- `owner_user_id`
- `method_key` (internal slug, e.g. `jazzcash_main`, `usdt_trc20_1`, `hbl_karachi_01`)
- `method_name` (admin-facing and player-facing label)
- `category` (`mobile_wallet`, `bank_transfer`, `crypto`, `cash_agent`, `manual_other`)
- `instructions`
- `account_title`
- `account_number`
- `bank_name`
- `branch_name`
- `branch_code`
- `iban`
- `wallet_number`
- `network`
- `is_active`
- `is_visible_to_players`
- `sort_order`
- `metadata` (small structured extras, not the primary UI surface)
- `created_by_id`
- `updated_by_id`

Important design rule:
- keep a small `metadata` map only for optional extras
- do not make raw JSON the main admin editing surface

### 4.2 Payment transactions / requests
Current `payment_transactions` table is too thin for manual approvals.

Recommended additions:
- `approval_owner_type`
- `approval_owner_user_id`
- `requested_by_user_id`
- `reviewed_by_user_id`
- `reviewed_at`
- `decision_reason`
- `receipt_file_path` or `receipt_asset_id`
- `receipt_original_name`
- `receipt_content_type`
- `receipt_uploaded_at`
- `player_note`
- `admin_note`
- `payment_destination_snapshot`
- `wallet_transaction_effect` (`none`, `credited`, `debited`)

Recommended status model:
- `pending_review`
- `approved`
- `rejected`
- `cancelled`

Recommended type model remains:
- `deposit`
- `withdrawal`

### 4.3 Receipt storage
Use a dedicated receipt storage approach.

Recommended first version:
- store uploaded receipt files under local protected uploads path
- persist file metadata in DB
- serve via authenticated controller, not public static URL

Reason:
- simpler than introducing external object storage immediately
- good enough for manual payment proof workflow

## 5. Required API and Domain Changes

### 5.1 Payment method resolution
Create backend logic that resolves visible methods for a player based on ownership.

Required behavior:
- direct player -> super admin methods
- master-managed player -> that master admin methods
- never return methods from unrelated owners

### 5.2 Deposit request creation
New deposit creation flow should:
- require `payment_method_id`
- require receipt upload
- resolve payment owner from player
- validate selected method belongs to resolved owner
- create request as `pending_review`
- store uploaded receipt metadata
- not credit wallet yet

### 5.3 Withdrawal request creation
New withdrawal creation flow should:
- require `payment_method_id`
- optionally accept player note
- resolve approval owner from player
- validate selected method belongs to resolved owner
- create request as `pending_review`
- not debit wallet yet

### 5.4 Approval actions
Required approval endpoints:
- approve deposit
- reject deposit
- approve withdrawal
- reject withdrawal

Each approval must verify owner permissions.

#### Super admin permissions
- can review requests owned by super admin
- may optionally review all requests if platform policy wants top-level oversight

#### Master admin permissions
- can review requests owned by themselves only
- cannot review another master admin’s requests
- cannot review super-admin-owned requests unless platform policy explicitly allows escalation

### 5.5 Wallet mutation rules
#### On deposit approval
- credit player balance
- create wallet/account transaction record
- mark payment request approved
- persist approver info

#### On withdrawal approval
- debit player balance
- create wallet/account transaction record
- mark payment request approved
- persist approver info

#### On rejection
- do not mutate balance
- mark request rejected
- persist rejection note

## 6. Required UI Changes

### 6.1 Super Admin payment methods
Replace raw JSON-based method management with a structured desk.

Required UI:
- payment methods list table
- create/edit drawer or page
- fields by category
- owner section for super admin methods
- active/inactive toggle
- visibility toggle
- order control

Raw JSON should not be the primary editing surface.

### 6.2 Master Admin payment methods
Add master admin payment methods management.

Required UI:
- master admin route for their own methods
- create/edit/delete own payment methods
- same structured form as super admin, but owner fixed to current master admin

### 6.3 Player deposit page
Required UI behavior:
- player sees resolved owner’s methods only
- selecting a method shows:
  - method name
  - account details
  - instructions
- receipt upload is required
- request is submitted for approval, not immediately completed
- success state clearly says “awaiting approval”

### 6.4 Player withdrawal page
Required UI behavior:
- player sees resolved owner’s methods only
- request creates pending approval item
- success state clearly says “awaiting approval”

### 6.5 Payment Approval workspace
Create a new tab/page:
- `Payment Approval`

Required views:
- pending deposits
- pending withdrawals
- filter by owner / type / status / currency / player
- receipt preview panel for deposits
- approve / reject controls
- notes field
- balance impact preview

This page must exist for:
- super admin
- master admin

But each should only see requests they are allowed to handle.

## 7. Execution Plan

### Phase 1: Normalize ownership model
1. Introduce payment method ownership fields.
2. Introduce approval owner fields on payment transactions.
3. Remove dependence on provider enum as the primary business identifier.
4. Preserve compatibility migration path from current `easypaisa/manual` rows.
5. Map existing super-admin-created rows to `owner_type=super_admin`.

### Phase 2: Build flexible payment method domain
1. Refactor `Back.Payments.PaymentMethod` into structured fields.
2. Keep `metadata` only for optional extensibility.
3. Add owner-aware queries:
   - list methods by owner
   - list visible methods for player
   - validate method ownership
4. Add audit logging for method create/update/activate/deactivate.

### Phase 3: Build receipt-backed deposit requests
1. Add authenticated receipt upload handling.
2. Store receipt metadata on deposit request.
3. Refactor deposit creation to create `pending_review` requests only.
4. Ensure no balance credit occurs until approval.
5. Add receipt validation:
   - mime type
   - max size
   - required on manual deposit

### Phase 4: Route approvals by player ownership
1. Add approval owner resolution.
2. Direct player -> super admin queue.
3. Master-admin-owned player -> master admin queue.
4. Enforce this in backend authorization.
5. Add shared query helpers for “requests pending my approval”.

### Phase 5: Approve/reject deposits and withdrawals
1. Add deposit approval endpoint.
2. Add deposit rejection endpoint.
3. Refactor withdrawal approval to owner-aware flow.
4. Add withdrawal rejection endpoint.
5. Make all actions create complete audit logs.
6. Make all approved actions create corresponding wallet/account transactions.

### Phase 6: Replace JSON UI with structured admin payment method desks
1. Replace super admin JSON textarea config page with structured forms.
2. Build master admin payment method management page.
3. Support flexible method categories and account fields.
4. Add proper masking where sensitive values require it.
5. Keep optional advanced metadata hidden behind an “advanced fields” section if needed.

### Phase 7: Build Payment Approval page
1. Add new admin tab/page for payment approvals.
2. Add new master admin tab/page for payment approvals.
3. Show pending request cards/table rows.
4. Show receipt preview for deposits.
5. Show player, owner, method, amount, timestamps, notes.
6. Add approve/reject actions with confirmation.

### Phase 8: Upgrade player wallet UX
1. Deposit page shows owner-routed payment methods.
2. Deposit page requires receipt upload.
3. Withdrawal page creates pending approval request.
4. Wallet history clearly shows:
   - pending review
   - approved
   - rejected
5. Managed-by-master players should no longer just see a dead-end notice if manual request flow is allowed for them.

### Phase 9: Reporting and reconciliation
1. Add payment-request reporting by owner.
2. Add approval aging metrics.
3. Add pending totals by owner.
4. Add approved/rejected trend views.
5. Add receipt/audit traceability for disputes.

## 8. Implementation Order Recommendation

Recommended build order:
1. backend ownership fields and schema changes
2. backend request routing and approval endpoints
3. receipt upload storage
4. super admin + master admin payment methods desks
5. payment approval pages
6. player deposit/withdraw UX rewrite
7. reporting and reconciliation layer

This order minimizes rework and avoids building UI on unstable contracts.

## 9. Key Risks to Control

### Risk 1: Reusing `config` JSON as the long-term model
Do not do this.
- keep structured columns for primary business fields
- otherwise the admin UI will remain fragile and unreadable

### Risk 2: Storing receipts in public static paths
Do not expose manual deposit receipts as public files.
- receipts should be served only through authenticated endpoints

### Risk 3: Owner routing only in frontend
Do not do this.
- route resolution must be backend enforced
- otherwise approvals can be misrouted or abused

### Risk 4: Crediting on deposit request creation
Do not do this.
- credit only on approval after receipt review

## 10. Final Recommendation

The correct implementation is not a small patch.
It is a payment-operations redesign on top of the existing foundation.

What exists today is enough to build on:
- payment method table
- payment transaction table
- wallet transaction system
- `created_by_id`
- wallet mode
- admin and player payment pages

But the following are still missing and must be implemented explicitly:
- owner-scoped payment methods
- receipt upload
- deposit approval
- rejection workflow
- master-admin approval lane
- structured payment-method UI
- dedicated payment approval workspace

Once these are in place, the flow will satisfy the business rule you described exactly:
- super admin has their own payment methods
- master admin has their own payment methods
- player sees the correct owner’s payment methods automatically
- deposit requires receipt
- approval page shows receipt
- approving updates player balance
- withdrawals route to the correct owner
- the entire audit trail stays intact
