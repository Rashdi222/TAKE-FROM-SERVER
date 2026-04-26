# Wallet + Forgot Password Execution Plan

## Objective

Implement the missing production-ready user wallet and forgot-password flows so that:

1. Direct self-registered users can use platform payment methods configured by super admin.
2. Master-admin-managed players cannot use self-service deposit/withdraw and are clearly routed to manual wallet handling by their master admin.
3. Forgot-password support can route users by phone number to the correct owner contact:
   - master-admin-owned player -> master admin contact
   - direct/self-registered user -> super admin/global contact

This plan assumes we will preserve existing working systems where possible and extend them without breaking the current auth, wallet, or admin flows.

---

## Audit Summary

### Payments: current state

#### What already exists

- Super-admin payment method management exists in backend.
- Payment transaction and withdrawal approval flows exist.
- User wallet pages exist in frontend:
  - wallet
  - deposit
  - withdraw
  - wallet transactions

#### What is wrong

1. Player deposit form is not using real super-admin-configured payment methods.
2. Player withdraw form is not using real super-admin-configured payment methods.
3. Deposit form currently submits a raw `method` string instead of a `payment_method_id`.
4. Withdrawal flow does not properly bind the selected payment method to the transaction.
5. Master-admin-created players currently still see wallet deposit/withdraw UI even though their wallet should be handled manually by master admin topup/deduct.
6. There is no backend-enforced wallet mode rule separating:
   - self-service wallet users
   - master-managed wallet users

### Forgot password: current state

#### What already exists

- Reset-token infrastructure exists.
- Public reset-password page exists.
- Master admin can already:
  - set player password directly
  - generate reset link for player

#### What is missing

1. No public "Forgot Password" lookup page by phone number.
2. No super-admin support-contact management page.
3. No master-admin support-contact management page.
4. No routing logic that maps a phone number to:
   - master admin support contact
   - or super-admin/global support contact
5. No availability/fallback logic when owner contact is missing or inactive.

---

## Business Rules To Implement

### Wallet rules

1. Direct/self-registered user accounts use self-service wallet.
2. Master-admin-created player accounts use master-managed wallet.
3. Master-managed wallet users:
   - cannot self-deposit
   - cannot self-withdraw
   - must see a clear manual-support message in wallet UI
4. Self-service wallet users:
   - can deposit using active super-admin payment methods
   - can withdraw using active super-admin payment methods

### Forgot-password routing rules

1. User enters phone number on forgot-password lookup page.
2. System validates the phone number.
3. System checks whether the phone belongs to an active account.
4. If the account belongs to a master admin and that master admin has active support contacts, show that contact.
5. If the account is direct/self-registered, show super-admin/global support contact.
6. If owner-specific contact is missing, inactive, or owner is not available, fall back to global super-admin support contact.
7. The lookup response must not leak unnecessary user-account data.

---

## Implementation Plan

## Phase 1: Wallet ownership mode

### Backend

1. Introduce an explicit wallet-mode resolver for users.
   - `self_service`
   - `managed_by_master_admin`

2. Base the first version on existing ownership data:
   - if player has `created_by_id` pointing to a master admin -> `managed_by_master_admin`
   - otherwise -> `self_service`

3. Expose wallet mode in authenticated user/profile payloads so frontend can render correctly.

4. Enforce wallet mode in backend payment endpoints:
   - block deposit for `managed_by_master_admin`
   - block withdraw for `managed_by_master_admin`

### Frontend

1. Update player shell and wallet pages to consume wallet mode.
2. If wallet mode is `managed_by_master_admin`:
   - hide self-service deposit/withdraw actions
   - show explanatory notice
   - point user to master admin support
3. If wallet mode is `self_service`:
   - keep normal wallet actions visible

---

## Phase 2: Payment methods integration

### Backend

1. Expose active player-usable payment methods from backend.
   - only active methods
   - only safe fields needed by player UI
   - no admin-only config leakage

2. Update deposit creation to require `payment_method_id`.
   - validate method exists
   - validate method is active
   - validate method is allowed for self-service wallet users

3. Update withdrawal creation to accept `payment_method_id`.
   - validate method exists
   - validate method is active
   - store the chosen method on the payment transaction

4. Ensure both deposit and withdrawal endpoints reject master-managed players.

### Frontend

1. Replace hardcoded deposit methods with backend-driven active payment methods.
2. Replace hardcoded withdraw methods with backend-driven active payment methods.
3. Submit `payment_method_id`, not freeform method names.
4. Render provider instructions and method labels from real backend data.

### QA expectations

1. Super admin enables/disables payment methods and player-side options change accordingly.
2. Deposit request stores actual selected payment method.
3. Withdrawal request stores actual selected payment method.
4. Master-managed player cannot bypass restrictions by direct request.

---

## Phase 3: Forgot-password support contacts data model

### Backend schema

Create a dedicated support contact model instead of overloading generic settings.

Suggested table:
- `password_reset_contacts`

Suggested fields:
- `id`
- `owner_type` (`super_admin` | `master_admin`)
- `owner_id`
- `channel` (`whatsapp` | `phone`)
- `label`
- `value`
- `is_active`
- timestamps

Notes:
- super-admin/global contact can be represented cleanly in the same table
- keep it normalized and auditable

### Backend context

Add functions to:
- list contacts for current owner
- create contact
- update contact
- activate/deactivate contact
- resolve public forgot-password support contact by phone number

---

## Phase 4: Admin and master support-contact management UI

### Super admin

Add a new sidebar page:
- `Reset Support`

Capabilities:
- add WhatsApp/phone support contacts
- enable/disable contacts
- reorder if needed later
- mark primary contact if needed later

### Master admin

Add a new sidebar page:
- `Reset Support`

Capabilities:
- add WhatsApp/phone support contacts
- enable/disable contacts
- manage only their own support contacts

### UX requirements

1. Keep it simple and explicit.
2. Show active/inactive state clearly.
3. Show what the contact will be used for:
   - "Shown to players who use forgot password lookup"

---

## Phase 5: Public forgot-password lookup flow

### Public UX

Add a dedicated page:
- `Forgot Password`

Flow:
1. user enters phone number
2. client validates format
3. backend resolves support contact
4. show support card with:
   - owner name if safe
   - channel
   - contact value
   - explanatory text

### Backend resolution logic

1. Look up user by phone number.
2. If no account is found:
   - return safe generic result
   - do not leak account enumeration details
3. If found:
   - determine whether account is master-admin-managed
   - if yes, fetch that master admin's active support contact
   - otherwise fetch global super-admin support contact
4. If owner-specific contact missing, fall back to global contact if available.

### Security and privacy

1. Keep response minimal.
2. Do not reveal more user information than needed.
3. Avoid account enumeration leakage beyond the support-routing use case.

---

## Phase 6: Optional live freshness with PubSub

This is optional, not required for correctness.

Use Phoenix PubSub for:
- instant refresh of support-contact admin pages
- live invalidation of support-contact caches
- live refresh of payment method availability in admin/operator interfaces if useful

Do not depend on PubSub for the public forgot-password lookup itself.
That flow should work through standard request/response.

---

## Phase 7: UI cleanup and alignment

### User wallet UX

1. Self-service users:
   - clean payment method selection
   - clear amount entry
   - method instructions
   - status feedback

2. Master-managed users:
   - no self-service actions
   - clear support message
   - route toward master-admin-managed wallet model

### Forgot-password UX

1. Login page should surface:
   - `Forgot Password`
2. Forgot-password page should feel simple and task-specific.
3. Reset-token page remains separate from support-lookup page.

---

## Phase 8: Validation and hardening

### Payment validation

1. active method required
2. inactive method rejected
3. invalid method rejected
4. master-managed wallet users blocked
5. payment method ownership/visibility enforced on backend

### Forgot-password validation

1. phone format validation
2. inactive owner fallback
3. missing contact fallback
4. no unsafe user-data leakage
5. safe handling for no-match case

### Audit logging

Add audit logging for:
- support contact create/update/activate/deactivate
- wallet-method-restricted access attempts if useful

---

## Files Likely To Change

### Backend

- `back/lib/back/payments.ex`
- `back/lib/back/accounts.ex`
- `back/lib/back_web/controllers/payment_controller.ex`
- `back/lib/back_web/router.ex`
- new support-contact schema/context/controller files
- auth/profile response serializers/controllers

### Frontend

- `next/src/components/wallet/DepositForm.tsx`
- `next/src/components/wallet/WithdrawForm.tsx`
- wallet pages under `next/src/app/(user)/wallet`
- public login / forgot-password pages
- new admin and master support-contact pages
- related hooks and API client files

---

## Recommended Execution Order

1. Wallet-mode backend enforcement
2. Payment methods integration for deposit/withdraw
3. User wallet UI gating
4. Support-contact schema + backend APIs
5. Admin/master support-contact pages
6. Public forgot-password lookup page
7. Final validation, hardening, and polish

---

## Success Criteria

This work is complete only when all of the following are true:

1. Direct/self-registered users deposit and withdraw only through super-admin-configured payment methods.
2. Master-admin-created players cannot use self-service wallet actions.
3. Wallet UI clearly reflects the correct mode for each account.
4. Super admin can manage global forgot-password support contacts.
5. Master admin can manage their own forgot-password support contacts.
6. Public forgot-password phone lookup routes users to the correct support contact safely.
7. Existing password reset token flow remains intact.
8. No existing auth, wallet, or admin flows regress.
