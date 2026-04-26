# New Features Added to Sixerbat Plan

## Summary of Updates to fde.md

Based on your requirements, I've integrated the following features into the 10-phase execution plan:

---

## 1. Master Admin Commission Models (Phase 1, 2, 3, 6, 8)

### Two Types of Master Admin Accounts:

**Volume-based:**
- Super admin assigns more credit than master admin distributes
- The difference is master admin's profit/earning
- Example: Super admin gives 100,000 PKR → Master admin distributes 80,000 PKR → Keeps 20,000 PKR
- Database field: `volume_margin`

**Loss-based:**
- Master admin earns commission percentage on their players' losses
- Example: Players lose 50,000 PKR → Master admin earns 10% = 5,000 PKR
- Database field: `commission_percentage`

### Implementation:
- **Phase 1:** Added `master_admin_type`, `commission_percentage`, `volume_margin` fields to users table
- **Phase 2:** Updated `create_master_admin` function to accept commission type
- **Phase 3:** API endpoint to create master admin with type selection
- **Phase 5:** Commission calculation during bet settlement
- **Phase 6:** Earnings tracking and reports
- **Phase 8:** UI for selecting master admin type when creating account

---

## 2. Payment Methods (Phase 1, 3, 6, 8, 9)

### Manual Payment:
- Super admin can manually add balance to any user
- Creates transaction with type: `manual_payment`

### EasyPaisa Integration:
- Super admin configures EasyPaisa API credentials (IPN, API keys)
- Automated payment processing
- IPN webhook for payment notifications
- Automatic balance credit on successful payment
- Direct customers can add money to their accounts

### Implementation:
- **Phase 1:** Added `payment_methods` and `payment_transactions` tables
- **Phase 3:** Manual payment function and API endpoint
- **Phase 6:** EasyPaisa integration (configuration, IPN handling, payment processing)
- **Phase 8:** Payment configuration UI for super admin
- **Phase 9:** EasyPaisa payment UI for customers

---

## 3. Advanced Bet Types (Phase 1, 4, 5, 8, 9)

### Match Winner (Already planned):
- Simple win/loss/draw betting

### Over/Under (NEW):
- **Cricket:** Total runs - over/under 150, 200, 250, 300
- **Tennis:** Total games - over/under 20, 22, 24
- AI-generated odds using OpenRouter

### In-Play Betting (NEW):
- Live betting during match
- Dynamic odds updates in real-time
- Match must have `in_play_enabled = true`
- Bets marked with `is_in_play = true`

### Implementation:
- **Phase 1:** Added `in_play_enabled` to matches table, `is_in_play` to bets table
- **Phase 4:** AI odds generation for all bet types (match_winner, over_under, in_play)
- **Phase 4:** AI model selection from OpenRouter
- **Phase 4:** API endpoint to start live match
- **Phase 5:** In-play betting logic and validation
- **Phase 8:** UI for enabling in-play betting, AI model selector
- **Phase 9:** In-play betting interface for players

---

## 4. AI Odds Generation Enhancements (Phase 4, 8)

### Features:
- Generate odds for multiple bet types simultaneously
- Select AI model from OpenRouter (GPT-4, Claude, etc.)
- Hardness levels: easy, medium, hard
- Track which AI model generated the odds (`ai_model` field)

### Implementation:
- **Phase 4:** Extended `generate_odds` function to support multiple bet types
- **Phase 4:** Added AI model parameter
- **Phase 4:** Separate functions for each bet type generation
- **Phase 8:** UI for selecting bet types and AI model when generating odds

---

## Database Changes Summary

### New Tables:
1. `payment_methods` - Store payment gateway configurations
2. `payment_transactions` - Track payment transactions

### Modified Tables:

**users:**
- `master_admin_type` (enum: volume_based, loss_based)
- `commission_percentage` (decimal)
- `volume_margin` (decimal)

**transactions:**
- Added transaction types: `commission`, `manual_payment`

**matches:**
- `in_play_enabled` (boolean)

**odds:**
- `ai_model` (string) - Track which AI model generated odds

**bets:**
- `is_in_play` (boolean) - Mark in-play bets

---

## API Endpoints Added

### Super Admin:
- `POST /api/super-admin/manual-payment` - Manually add balance
- `POST /api/payments/configure` - Configure EasyPaisa
- `POST /api/matches/:id/start-live` - Start live match

### Master Admin:
- `GET /api/master-admin/earnings` - View earnings

### Players/Customers:
- `POST /api/payments/easypaisa/initiate` - Initiate payment
- `POST /api/payments/easypaisa/ipn` - IPN webhook (public)

### Reports:
- `GET /api/reports/commission/:master_admin_id` - Commission report

---

## UI Components Added

### Phase 8 (Super Admin & Master Admin):
- `MasterAdminTypeSelector.tsx` - Select commission type
- `EasyPaisaConfigForm.tsx` - Configure payment gateway
- `ManualPaymentForm.tsx` - Manual payment form
- `AIModelSelector.tsx` - Select AI model for odds generation
- `BetTypeSelector.tsx` - Select bet types for AI generation
- `EarningsCard.tsx` - Display master admin earnings

### Phase 9 (Players):
- `InPlayBettingPanel.tsx` - Live betting interface
- `EasyPaisaPayment.tsx` - Payment form
- `PaymentHistory.tsx` - Payment transaction history

---

## Timeline Update

**Original:** 38-48 days (6-8 weeks)
**Updated:** 41-53 days (6-8 weeks)

The additional features add approximately 3-5 days to the development timeline, primarily in:
- Phase 6: +1 day for EasyPaisa integration
- Phase 8: +1-2 days for payment UI and master admin types
- Phase 9: +1 day for in-play betting and payment UI

---

## Next Steps

1. Review the updated `fde.md` plan
2. Confirm all features are correctly understood
3. Start Phase 1: Backend Foundation & Database
4. Set up development environment
5. Begin migrations and schema creation

Ready to start building! 🚀
