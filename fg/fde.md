# Sixerbat Betting Platform - Full Development Execution Plan

## Project Overview

**Platform:** Sixerbat - Multi-tier betting platform
**Tech Stack:** 
- Backend: Phoenix/Elixir + PostgreSQL
- Frontend: Next.js 16 + React 19 + TypeScript + Tailwind CSS
- AI Integration: OpenRouter API for odds generation

**User Hierarchy:**
1. Super Admin (You) - Creates Master Admins, assigns/sends amounts, sees everything
2. Master Admin - Creates player accounts (sells accounts to betting users), manages their players
3. Bet Players - Accounts created by Master Admin (bought accounts) - they place bets
4. Direct Customers - Self-registered users on platform - they also place bets

---

## PHASE 1: Backend Foundation & Database Schema

**Duration:** 3-4 days

### Tasks:

#### 1.1 Add Required Dependencies
- Add `bcrypt_elixir` for password hashing
- Add `guardian` for JWT authentication
- Add `cors_plug` for CORS handling
- Add `decimal` for precise money calculations (already included)
- Add `timex` for datetime handling

#### 1.2 Database Schema Design & Migrations

**Migration 1: Users Table**
```elixir
# priv/repo/migrations/XXXXXX_create_users.exs
- id (uuid, primary key)
- email (string, unique, not null)
- password_hash (string, not null)
- role (enum: super_admin, master_admin, player, customer)
- balance (decimal, default: 0.0)
- created_by_id (uuid, foreign key to users, nullable)
- is_active (boolean, default: true)
- master_admin_type (enum: volume_based, loss_based, nullable) # only for master_admin role
- commission_percentage (decimal, nullable) # for loss_based master admins
- volume_margin (decimal, nullable) # for volume_based master admins (amount kept as profit)
- inserted_at, updated_at (timestamps)
```

**Migration 2: Transactions Table**
```elixir
# priv/repo/migrations/XXXXXX_create_transactions.exs
- id (uuid, primary key)
- from_user_id (uuid, foreign key to users, nullable)
- to_user_id (uuid, foreign key to users, not null)
- amount (decimal, not null)
- transaction_type (enum: credit, debit, bet_placed, bet_won, bet_lost, transfer, commission, manual_payment)
- reference_id (uuid, nullable) # for linking to bets
- description (text)
- inserted_at, updated_at (timestamps)
```

**Migration 3: Matches Table**
```elixir
# priv/repo/migrations/XXXXXX_create_matches.exs
- id (uuid, primary key)
- sport (enum: cricket, tennis)
- team1 (string, not null)
- team2 (string, not null)
- start_time (utc_datetime, not null)
- status (enum: upcoming, live, closed, settled, cancelled)
- winner (string, nullable) # team1, team2, draw
- in_play_enabled (boolean, default: false) # allow live betting during match
- created_by_id (uuid, foreign key to users)
- inserted_at, updated_at (timestamps)
```

**Migration 4: Odds Table**
```elixir
# priv/repo/migrations/XXXXXX_create_odds.exs
- id (uuid, primary key)
- match_id (uuid, foreign key to matches, not null)
- bet_type (enum: match_winner, over_under, in_play)
- outcome (string, not null) # e.g., "team1", "team2", "over_150", "under_150"
- odds_value (decimal, not null) # e.g., 1.85
- is_active (boolean, default: true)
- ai_generated (boolean, default: false)
- ai_model (string, nullable) # OpenRouter model used for generation
- inserted_at, updated_at (timestamps)
```

**Migration 5: Bets Table**
```elixir
# priv/repo/migrations/XXXXXX_create_bets.exs
- id (uuid, primary key)
- user_id (uuid, foreign key to users, not null)
- match_id (uuid, foreign key to matches, not null)
- odds_id (uuid, foreign key to odds, not null)
- stake (decimal, not null)
- potential_win (decimal, not null)
- status (enum: pending, won, lost, cancelled)
- result (string, nullable)
- is_in_play (boolean, default: false) # bet placed during live match
- settled_at (utc_datetime, nullable)
- inserted_at, updated_at (timestamps)
```

**Migration 6: Payment Methods Table**
```elixir
# priv/repo/migrations/XXXXXX_create_payment_methods.exs
- id (uuid, primary key)
- provider (enum: easypaisa, manual)
- is_active (boolean, default: false)
- config (jsonb) # stores API keys, IPN URLs, etc. (encrypted)
- created_by_id (uuid, foreign key to users)
- inserted_at, updated_at (timestamps)
```

**Migration 7: Payment Transactions Table**
```elixir
# priv/repo/migrations/XXXXXX_create_payment_transactions.exs
- id (uuid, primary key)
- user_id (uuid, foreign key to users, not null)
- payment_method_id (uuid, foreign key to payment_methods, nullable)
- amount (decimal, not null)
- status (enum: pending, completed, failed, cancelled)
- provider_transaction_id (string, nullable) # EasyPaisa transaction ID
- provider_response (jsonb, nullable) # full IPN response
- transaction_id (uuid, foreign key to transactions, nullable) # linked to main transaction
- inserted_at, updated_at (timestamps)
```

#### 1.3 Create Ecto Schemas & Contexts

**Schemas to create:**
- `lib/back/accounts/user.ex`
- `lib/back/accounts/transaction.ex`
- `lib/back/betting/match.ex`
- `lib/back/betting/odds.ex`
- `lib/back/betting/bet.ex`
- `lib/back/payments/payment_method.ex`
- `lib/back/payments/payment_transaction.ex`

**Contexts to create:**
- `lib/back/accounts.ex` - User management, authentication, balance operations
- `lib/back/betting.ex` - Match, odds, and bet management
- `lib/back/payments.ex` - Payment method configuration, payment processing

#### 1.4 Seed Super Admin Account
Create seed file to initialize your super admin account

**Deliverables:**
- ✅ 7 migration files created and run
- ✅ 7 Ecto schemas with validations
- ✅ 3 context modules with basic CRUD functions
- ✅ Super admin seed data
- ✅ Database successfully migrated

---

## PHASE 2: Authentication & Authorization System

**Duration:** 3-4 days

### Tasks:

#### 2.1 JWT Authentication with Guardian
- Configure Guardian for JWT token generation
- Create authentication pipeline
- Implement token refresh mechanism
- Add token blacklist for logout

#### 2.2 Auth Context Functions
**In `lib/back/accounts.ex`:**
- `register_customer/1` - Self-registration for direct customers
- `authenticate_user/2` - Login with email/password
- `create_master_admin/4` - Super admin creates master admin (email, password, initial_balance, master_admin_type, commission_percentage OR volume_margin)
- `create_player_account/4` - Master admin creates player (email, password, amount, master_admin_id)
- `get_user_by_email/1`
- `verify_password/2`

#### 2.3 Authorization Plugs
**Create plugs in `lib/back_web/plugs/`:**
- `AuthPipeline` - Verify JWT token
- `EnsureSuperAdmin` - Only super admin access
- `EnsureMasterAdmin` - Master admin or super admin access
- `EnsurePlayer` - Any authenticated user

#### 2.4 API Endpoints - Authentication
**Create `lib/back_web/controllers/auth_controller.ex`:**
- `POST /api/auth/register` - Customer self-registration
- `POST /api/auth/login` - Login (all roles)
- `POST /api/auth/logout` - Logout
- `POST /api/auth/refresh` - Refresh token
- `GET /api/auth/me` - Get current user info

**Deliverables:**
- ✅ Guardian configured and working
- ✅ Auth context functions implemented
- ✅ Authorization plugs created
- ✅ Auth API endpoints functional
- ✅ JWT tokens generated and validated

---

## PHASE 3: User Management & Balance Operations

**Duration:** 3-4 days

### Tasks:

#### 3.1 User Management Context Functions
**In `lib/back/accounts.ex`:**
- `list_master_admins/0` - Get all master admins (super admin only)
- `list_players_by_master/1` - Get players created by specific master admin
- `list_all_players/0` - Get all players (super admin only)
- `get_user!/1` - Get user by ID
- `update_user/2` - Update user details
- `deactivate_user/1` - Soft delete user
- `get_user_balance/1` - Get current balance

#### 3.2 Balance & Transaction Operations
**In `lib/back/accounts.ex`:**
- `transfer_amount/3` - Transfer from one user to another (from_user_id, to_user_id, amount)
- `add_balance/2` - Add balance to user
- `deduct_balance/2` - Deduct balance from user
- `manual_payment/3` - Super admin manually adds balance (user_id, amount, description)
- `get_user_transactions/1` - Get transaction history
- `create_transaction/1` - Record transaction

**Business Logic:**
- Validate sufficient balance before transfer
- Atomic operations using Ecto.Multi
- Transaction logging for audit trail
- Manual payment creates transaction with type: manual_payment

#### 3.3 API Endpoints - Super Admin
**Create `lib/back_web/controllers/super_admin_controller.ex`:**
- `GET /api/super-admin/master-admins` - List all master admins
- `POST /api/super-admin/master-admins` - Create master admin (with type: volume_based/loss_based)
- `POST /api/super-admin/transfer` - Send amount to master admin
- `POST /api/super-admin/manual-payment` - Manually add balance to any user
- `GET /api/super-admin/players` - List all players
- `GET /api/super-admin/dashboard` - Dashboard stats

#### 3.4 API Endpoints - Master Admin
**Create `lib/back_web/controllers/master_admin_controller.ex`:**
- `GET /api/master-admin/dashboard` - Dashboard (balance, players, bets)
- `POST /api/master-admin/players` - Create player account
- `GET /api/master-admin/players` - List my players
- `GET /api/master-admin/transactions` - My transaction history

#### 3.5 API Endpoints - User/Player
**Create `lib/back_web/controllers/user_controller.ex`:**
- `GET /api/user/profile` - Get my profile
- `GET /api/user/balance` - Get my balance
- `GET /api/user/transactions` - My transaction history

**Deliverables:**
- ✅ User management functions complete
- ✅ Balance operations with validations
- ✅ Transaction logging working
- ✅ Super admin API endpoints functional
- ✅ Master admin API endpoints functional
- ✅ User API endpoints functional

---

## PHASE 4: Match & Odds Management System

**Duration:** 4-5 days

### Tasks:

#### 4.1 Match Management Context Functions
**In `lib/back/betting.ex`:**
- `create_match/1` - Create new match
- `update_match/2` - Update match details
- `list_matches/1` - List matches (filter by status, sport)
- `get_match!/1` - Get match by ID
- `change_match_status/2` - Update match status
- `settle_match/2` - Settle match with winner
- `cancel_match/1` - Cancel match

#### 4.2 Odds Management Context Functions
**In `lib/back/betting.ex`:**
- `create_odds/1` - Create odds for match
- `update_odds/2` - Update odds value
- `list_odds_by_match/1` - Get all odds for a match
- `get_odds!/1` - Get odds by ID
- `activate_odds/1` - Enable odds
- `deactivate_odds/1` - Disable odds

#### 4.3 OpenRouter AI Integration
**Create `lib/back/ai/odds_generator.ex`:**
- Configure OpenRouter API client using `Req`
- `generate_odds/3` - Generate odds for match (match_data, bet_types, ai_model)
- `generate_match_winner_odds/2` - Generate match winner odds
- `generate_over_under_odds/2` - Generate over/under odds (cricket: runs, tennis: games)
- `generate_in_play_odds/2` - Generate live betting odds
- `parse_ai_response/1` - Parse AI response to odds format
- Error handling and fallback

**AI Prompt Engineering:**
- Design prompts for generating realistic betting odds
- Include sport type, teams, historical data
- Bet types: match_winner, over_under, in_play
- Hardness levels: easy (1.5-2.5), medium (1.8-3.0), hard (2.0-4.0)
- AI model selection: Allow super admin to choose model from OpenRouter

**Supported Bet Types:**
- **Match Winner:** team1 win, team2 win, draw
- **Over/Under (Cricket):** Total runs - over/under 150, 200, 250, 300
- **Over/Under (Tennis):** Total games - over/under 20, 22, 24
- **In-Play:** Dynamic odds during live match

#### 4.4 API Endpoints - Match Management (Super Admin)
**Create `lib/back_web/controllers/match_controller.ex`:**
- `POST /api/matches` - Create match (super admin, with in_play_enabled option)
- `PUT /api/matches/:id` - Update match (super admin)
- `GET /api/matches` - List matches (all users, filter by status, sport)
- `GET /api/matches/:id` - Get match details (all users)
- `POST /api/matches/:id/start-live` - Start live match (enable in-play betting)
- `POST /api/matches/:id/close` - Close betting (super admin)
- `POST /api/matches/:id/settle` - Settle match (super admin)

#### 4.5 API Endpoints - Odds Management (Super Admin)
**Create `lib/back_web/controllers/odds_controller.ex`:**
- `POST /api/matches/:match_id/odds` - Create odds manually
- `PUT /api/odds/:id` - Update odds
- `POST /api/matches/:match_id/odds/generate` - AI generate odds (with bet_types and ai_model selection)
- `GET /api/matches/:match_id/odds` - List odds for match (filter by bet_type)
- `POST /api/odds/:id/activate` - Activate odds
- `POST /api/odds/:id/deactivate` - Deactivate odds

**Deliverables:**
- ✅ Match management functions complete
- ✅ Odds management functions complete
- ✅ OpenRouter AI integration working (match_winner, over_under, in_play)
- ✅ AI model selection from OpenRouter
- ✅ Match API endpoints functional
- ✅ Odds API endpoints functional
- ✅ AI odds generation tested for all bet types
- ✅ In-play betting support

---

## PHASE 5: Betting System & Settlement Logic

**Duration:** 4-5 days

### Tasks:

#### 5.1 Betting Context Functions
**In `lib/back/betting.ex`:**
- `place_bet/4` - Place bet (user_id, match_id, odds_id, stake)
- `place_in_play_bet/4` - Place bet during live match
- `list_user_bets/1` - Get user's bets
- `list_active_bets/1` - Get user's active bets
- `list_bets_by_match/1` - Get all bets for a match
- `get_bet!/1` - Get bet by ID
- `cancel_bet/1` - Cancel bet (before match starts)

**Betting Business Logic:**
- Validate user has sufficient balance
- Validate match is open for betting (or live for in-play bets)
- Validate odds are active
- For in-play bets: check match status is "live" and in_play_enabled is true
- Calculate potential win: stake * odds_value
- Deduct stake from user balance
- Create transaction record
- Use Ecto.Multi for atomic operations

#### 5.2 Settlement System
**In `lib/back/betting.ex`:**
- `settle_match_bets/2` - Settle all bets for a match (match_id, winner)
- `process_winning_bet/1` - Credit winning amount to user
- `process_losing_bet/1` - Mark bet as lost
- `calculate_platform_profit/1` - Calculate profit for a match
- `calculate_master_admin_commission/1` - Calculate commission for loss-based master admins

**Settlement Logic:**
- When match is settled, process all bets
- Winning bets: credit potential_win to user balance
- Losing bets: mark as lost (stake already deducted)
- **Commission Calculation (Loss-based Master Admins):**
  - Get all losing bets from players created by master admin
  - Calculate total losses
  - Calculate commission: total_losses * commission_percentage
  - Credit commission to master admin balance
  - Create transaction record with type: commission
- Create transaction records for all settlements
- Update bet status and settled_at timestamp

#### 5.3 API Endpoints - Betting (Players/Customers)
**Create `lib/back_web/controllers/bet_controller.ex`:**
- `POST /api/bets` - Place bet
- `GET /api/bets` - My bets (with filters: active, settled)
- `GET /api/bets/:id` - Get bet details
- `DELETE /api/bets/:id` - Cancel bet (before match starts)

#### 5.4 API Endpoints - Bet Management (Super Admin)
**In `lib/back_web/controllers/bet_controller.ex`:**
- `GET /api/admin/bets` - All bets (with filters)
- `GET /api/admin/matches/:match_id/bets` - Bets for specific match

#### 5.5 Real-time Updates Setup
**Create channels for live updates:**
- `lib/back_web/channels/match_channel.ex` - Match updates
- `lib/back_web/channels/user_channel.ex` - User balance updates

**Deliverables:**
- ✅ Betting functions with validations
- ✅ Settlement system working correctly
- ✅ Atomic transactions for bets
- ✅ Betting API endpoints functional
- ✅ Admin bet management endpoints
- ✅ WebSocket channels for real-time updates

---

## PHASE 6: Reports, Dashboard & Analytics

**Duration:** 3-4 days

### Tasks:

#### 6.1 Analytics Context Functions
**Create `lib/back/analytics.ex`:**
- `get_super_admin_dashboard/0` - Platform-wide stats
- `get_master_admin_dashboard/1` - Master admin stats
- `get_player_stats/1` - Player betting stats
- `calculate_platform_profit/1` - Total profit (date range)
- `get_master_admin_performance/0` - All master admins performance
- `get_top_players/1` - Top players by bets/wins
- `calculate_master_admin_earnings/2` - Calculate earnings (master_admin_id, date_range)
- `get_volume_based_earnings/1` - Calculate volume-based master admin earnings
- `get_loss_based_earnings/1` - Calculate loss-based master admin commission earnings

**Dashboard Metrics:**
- Total users (by role)
- Total bets (pending, settled, in-play)
- Total amount wagered
- Platform profit/loss
- Active matches
- Recent transactions
- Master admin earnings (by type)

#### 6.2 Reports Generation
**In `lib/back/analytics.ex`:**
- `generate_daily_report/1` - Daily P&L report
- `generate_weekly_report/1` - Weekly summary
- `generate_master_admin_report/2` - Master admin performance (master_admin_id, date_range)
- `generate_player_report/2` - Player betting history (player_id, date_range)
- `generate_commission_report/2` - Commission earnings report (master_admin_id, date_range)
- `generate_volume_report/2` - Volume-based earnings report (master_admin_id, date_range)

#### 6.3 API Endpoints - Dashboards
**Create `lib/back_web/controllers/dashboard_controller.ex`:**
- `GET /api/dashboard/super-admin` - Super admin dashboard
- `GET /api/dashboard/master-admin` - Master admin dashboard
- `GET /api/dashboard/player` - Player stats

#### 6.4 API Endpoints - Reports
**Create `lib/back_web/controllers/report_controller.ex`:**
- `GET /api/reports/daily` - Daily report (super admin)
- `GET /api/reports/weekly` - Weekly report (super admin)
- `GET /api/reports/master-admin/:id` - Master admin report
- `GET /api/reports/player/:id` - Player report
- `GET /api/reports/commission/:master_admin_id` - Commission earnings report

#### 6.5 Payment Integration - EasyPaisa
**Create `lib/back/payments.ex` context functions:**
- `configure_payment_method/2` - Super admin configures EasyPaisa (provider, config)
- `get_payment_methods/0` - List configured payment methods
- `activate_payment_method/1` - Enable payment method
- `deactivate_payment_method/1` - Disable payment method
- `process_easypaisa_payment/2` - Process EasyPaisa payment (user_id, amount)
- `handle_easypaisa_ipn/1` - Handle IPN callback from EasyPaisa
- `verify_easypaisa_transaction/1` - Verify transaction with EasyPaisa API

**EasyPaisa Integration:**
- Store API credentials securely (encrypted in database)
- IPN webhook endpoint for payment notifications
- Automatic balance credit on successful payment
- Transaction logging
- Error handling and retry logic

**Create `lib/back_web/controllers/payment_controller.ex`:**
- `POST /api/payments/configure` - Configure payment method (super admin)
- `GET /api/payments/methods` - List payment methods
- `POST /api/payments/easypaisa/initiate` - Initiate EasyPaisa payment (customers)
- `POST /api/payments/easypaisa/ipn` - IPN webhook (public endpoint)
- `GET /api/payments/transactions` - Payment transaction history

**Deliverables:**
- ✅ Analytics context with calculations
- ✅ Dashboard data functions
- ✅ Report generation functions
- ✅ Dashboard API endpoints
- ✅ Reports API endpoints
- ✅ EasyPaisa payment integration
- ✅ IPN webhook handling
- ✅ Payment configuration UI for super admin
- ✅ Performance optimized queries

---

## PHASE 7: Frontend - Authentication & Layout

**Duration:** 4-5 days

### Tasks:

#### 7.1 Project Setup & Configuration
- Configure API base URL (environment variables)
- Setup Axios/Fetch wrapper for API calls
- Configure TypeScript paths
- Setup Tailwind CSS custom theme

#### 7.2 Authentication System
**Create in `src/`:**
- `lib/api.ts` - API client with interceptors
- `lib/auth.ts` - Auth utilities (login, logout, token management)
- `contexts/AuthContext.tsx` - Auth state management
- `hooks/useAuth.ts` - Auth hook

**Pages:**
- `app/login/page.tsx` - Login page (all roles)
- `app/register/page.tsx` - Customer registration
- `middleware.ts` - Route protection

#### 7.3 Layout Components
**Create in `src/components/`:**
- `layouts/SuperAdminLayout.tsx` - Super admin layout with sidebar
- `layouts/MasterAdminLayout.tsx` - Master admin layout
- `layouts/PlayerLayout.tsx` - Player/customer layout
- `components/Sidebar.tsx` - Navigation sidebar
- `components/Header.tsx` - Top header with user menu
- `components/ProtectedRoute.tsx` - Route guard component

#### 7.4 Shared UI Components
**Create in `src/components/ui/`:**
- `Button.tsx` - Reusable button
- `Input.tsx` - Form input
- `Card.tsx` - Card container
- `Table.tsx` - Data table
- `Modal.tsx` - Modal dialog
- `Toast.tsx` - Notification toast

**Deliverables:**
- ✅ API client configured
- ✅ Auth context and hooks working
- ✅ Login/register pages functional
- ✅ Three layout components created
- ✅ Shared UI components library
- ✅ Route protection working

---

## PHASE 8: Frontend - Super Admin & Master Admin Panels

**Duration:** 5-6 days

### Tasks:

#### 8.1 Super Admin Dashboard
**Create `app/super-admin/page.tsx`:**
- Platform statistics cards
- Recent transactions list
- Active matches overview
- Master admins summary
- Charts (optional): bets over time, profit/loss

#### 8.2 Super Admin - Master Admin Management
**Create `app/super-admin/master-admins/`:**
- `page.tsx` - List all master admins (table with balance, players count, type, earnings)
- `create/page.tsx` - Create master admin form (with type selection: volume_based/loss_based)
- `[id]/page.tsx` - Master admin details
- `components/TransferModal.tsx` - Send amount modal
- `components/MasterAdminTypeSelector.tsx` - Select commission type

**Features:**
- Create master admin with initial balance
- **Select master admin type:**
  - Volume-based: Set volume_margin (amount super admin keeps)
  - Loss-based: Set commission_percentage (% of players' losses)
- View master admin details
- Send amount to master admin
- View master admin's players
- View master admin earnings

#### 8.3 Super Admin - Payment Management
**Create `app/super-admin/payments/`:**
- `page.tsx` - Payment methods configuration
- `configure/page.tsx` - Configure EasyPaisa (API keys, IPN URL)
- `transactions/page.tsx` - All payment transactions
- `manual-payment/page.tsx` - Manual payment form (add balance to any user)
- `components/EasyPaisaConfigForm.tsx` - EasyPaisa configuration form

**Features:**
- Configure EasyPaisa payment gateway
- View payment transactions
- Manually add balance to users
- Enable/disable payment methods

#### 8.4 Super Admin - Match Management
**Create `app/super-admin/matches/`:**
- `page.tsx` - List all matches (tabs: upcoming, live, settled)
- `create/page.tsx` - Create match form (with in_play_enabled option)
- `[id]/page.tsx` - Match details with odds
- `[id]/odds/page.tsx` - Manage odds (add, edit, AI generate)
- `components/OddsForm.tsx` - Odds creation form (support match_winner, over_under, in_play)
- `components/AIGenerateModal.tsx` - AI odds generation (bet type selector, AI model selector, hardness)

**Features:**
- Create/edit matches
- Enable in-play betting for match
- Add/edit odds manually (all bet types)
- Generate odds with AI (select bet types: match_winner, over_under, in_play)
- Select AI model from OpenRouter
- Start live match
- Close betting
- Settle match (declare winner)

#### 8.5 Super Admin - Players & Bets
**Create `app/super-admin/players/page.tsx`:**
- List all players across platform
- Filter by master admin
- View player details

**Create `app/super-admin/bets/page.tsx`:**
- List all bets (filters: status, match, user, bet_type)
- Bet details view
- In-play bets indicator

#### 8.6 Master Admin Dashboard
**Create `app/master-admin/page.tsx`:**
- My balance card
- My players count
- Total bets by my players
- **My earnings card (based on type):**
  - Volume-based: Show volume margin earned
  - Loss-based: Show commission earned
- Recent transactions
- My players' active bets

#### 8.7 Master Admin - Player Management
**Create `app/master-admin/players/`:**
- `page.tsx` - List my players (table with balance, bets)
- `create/page.tsx` - Create player account form
- `[id]/page.tsx` - Player details and bet history

**Features:**
- Create player account (email, password, amount)
- View my players list
- View player's betting activity

#### 8.8 Master Admin - Transactions & Earnings
**Create `app/master-admin/transactions/page.tsx`:**
- My transaction history
- Amounts received from super admin
- Amounts given to players
- Commission earnings (if loss-based)

**Create `app/master-admin/earnings/page.tsx`:**
- Earnings dashboard
- Commission breakdown (if loss-based)
- Volume margin breakdown (if volume-based)
- Earnings chart

**Deliverables:**
- ✅ Super admin dashboard complete
- ✅ Master admin management UI with type selection
- ✅ Payment management UI (EasyPaisa config, manual payment)
- ✅ Match management UI with in-play support
- ✅ Odds management with AI generation (all bet types, model selection)
- ✅ Master admin dashboard complete with earnings
- ✅ Player management UI for master admin
- ✅ Earnings tracking UI
- ✅ All forms with validation

---

## PHASE 9: Frontend - Player/Customer Panel & Betting Interface

**Duration:** 5-6 days

### Tasks:

#### 9.1 Player Dashboard
**Create `app/player/page.tsx`:**
- My balance card
- Active bets summary
- Recent bet history
- Upcoming matches

#### 9.2 Matches & Betting Interface
**Create `app/matches/`:**
- `page.tsx` - Browse matches (tabs: cricket, tennis, live)
- `[id]/page.tsx` - Match details with odds (all bet types)
- `components/MatchCard.tsx` - Match display card (show live indicator)
- `components/OddsDisplay.tsx` - Odds display with bet button (grouped by bet_type)
- `components/BetSlip.tsx` - Bet placement form
- `components/BetConfirmModal.tsx` - Confirm bet modal
- `components/InPlayBettingPanel.tsx` - Live betting interface

**Features:**
- Browse live and upcoming matches
- Filter by sport
- Live match indicator
- View match details and odds (match_winner, over_under, in_play)
- **In-play betting:**
  - Real-time odds updates during live match
  - Place bets during match
  - Live match status
- Place bet (select odds, enter stake, see potential win)
- Bet confirmation

#### 9.3 My Bets
**Create `app/player/bets/`:**
- `page.tsx` - My bets (tabs: active, settled, in-play)
- `[id]/page.tsx` - Bet details
- `components/BetCard.tsx` - Bet display card (show in-play indicator)

**Features:**
- View active bets
- View in-play bets
- View bet history
- Cancel bet (before match starts)
- See bet result (won/lost)

#### 9.4 Profile & Transactions
**Create `app/player/profile/page.tsx`:**
- View profile
- Edit profile (optional)

**Create `app/player/transactions/page.tsx`:**
- Transaction history
- Filter by type

#### 9.5 Payment & Balance Management (Customers)
**Create `app/player/payments/`:**
- `page.tsx` - Add balance (EasyPaisa payment)
- `components/EasyPaisaPayment.tsx` - EasyPaisa payment form
- `components/PaymentHistory.tsx` - Payment transaction history

**Features:**
- Initiate EasyPaisa payment
- View payment status
- Payment history

#### 9.6 Real-time Updates
**Create `hooks/useMatchUpdates.ts`:**
- WebSocket connection for match updates
- Live odds changes (especially for in-play)
- Match status updates

**Create `hooks/useBalanceUpdates.ts`:**
- WebSocket connection for balance updates
- Real-time balance changes

**Deliverables:**
- ✅ Player dashboard complete
- ✅ Match browsing interface with live matches
- ✅ Betting interface with validation (all bet types)
- ✅ In-play betting interface
- ✅ My bets page with filters
- ✅ Profile and transactions pages
- ✅ EasyPaisa payment integration UI
- ✅ Real-time updates working
- ✅ Responsive design for all pages

---

## PHASE 10: Testing, Polish & Deployment

**Duration:** 4-5 days

### Tasks:

#### 10.1 Backend Testing
- Write tests for critical functions:
  - User creation and authentication
  - Balance transfers
  - Bet placement and settlement
  - Match settlement logic
- Test edge cases:
  - Insufficient balance
  - Concurrent bet placement
  - Invalid odds
  - Match already settled

#### 10.2 Frontend Testing
- Test user flows:
  - Super admin creates master admin
  - Master admin creates player
  - Player places bet
  - Match settlement and payout
- Cross-browser testing
- Mobile responsiveness testing

#### 10.3 Security Audit
- Review authentication and authorization
- Check for SQL injection vulnerabilities
- Validate input sanitization
- Review CORS configuration
- Check for exposed sensitive data

#### 10.4 Performance Optimization
- Database query optimization (add indexes)
- API response caching where appropriate
- Frontend code splitting
- Image optimization
- Lazy loading

#### 10.5 Documentation
**Create documentation:**
- `API_DOCS.md` - API endpoints documentation
- `DEPLOYMENT.md` - Deployment instructions
- `USER_GUIDE.md` - User guide for each role
- Code comments for complex logic

#### 10.6 Deployment Setup
**Backend:**
- Setup production database
- Configure environment variables
- Setup SSL certificates
- Deploy to hosting (Fly.io, Render, or VPS)

**Frontend:**
- Build production bundle
- Configure environment variables
- Deploy to Vercel/Netlify
- Setup custom domain

#### 10.7 Final Polish
- Fix UI/UX issues
- Add loading states
- Add error handling
- Add success messages
- Final design tweaks

**Deliverables:**
- ✅ Backend tests passing
- ✅ Frontend flows tested
- ✅ Security audit complete
- ✅ Performance optimized
- ✅ Documentation complete
- ✅ Backend deployed
- ✅ Frontend deployed
- ✅ Platform live and functional

---

## Post-Launch Enhancements (Future Phases)

### Phase 11: Advanced Features
- Withdrawal system for players
- More sports (football, basketball, etc.)
- More bet types (handicap, correct score, etc.)
- Mobile app (React Native)
- Push notifications

### Phase 12: Analytics & Reporting
- Advanced analytics dashboard
- Export reports (PDF, CSV)
- Email notifications
- SMS notifications
- Betting trends analysis

### Phase 13: Scaling & Optimization
- Redis caching
- Database read replicas
- CDN for static assets
- Load balancing
- Performance monitoring

---

## Development Timeline Summary

| Phase | Duration | Focus |
|-------|----------|-------|
| Phase 1 | 3-4 days | Backend Foundation & Database (7 tables) |
| Phase 2 | 3-4 days | Authentication & Authorization |
| Phase 3 | 3-4 days | User Management & Balance + Manual Payment |
| Phase 4 | 4-5 days | Match & Odds Management + AI Integration |
| Phase 5 | 4-5 days | Betting System & Settlement + Commission |
| Phase 6 | 4-5 days | Reports & Analytics + EasyPaisa Integration |
| Phase 7 | 4-5 days | Frontend Auth & Layout |
| Phase 8 | 6-7 days | Super Admin & Master Admin UI + Payments |
| Phase 9 | 5-6 days | Player Panel & Betting UI + In-Play |
| Phase 10 | 4-5 days | Testing, Polish & Deployment |

**Total Estimated Time:** 41-53 days (approximately 6-8 weeks)

---

## Key Features Summary

### Master Admin Commission Models
1. **Volume-based:** Super admin assigns more credit than master admin distributes. The difference is master admin's profit.
   - Example: Super admin gives 100,000 PKR, master admin distributes 80,000 PKR to players, keeps 20,000 PKR as profit
2. **Loss-based:** Master admin earns commission percentage on players' losses
   - Example: Players lose 50,000 PKR, master admin earns 10% = 5,000 PKR commission

### Bet Types
1. **Match Winner:** Simple win/loss/draw betting
2. **Over/Under:** 
   - Cricket: Total runs (over/under 150, 200, 250, 300)
   - Tennis: Total games (over/under 20, 22, 24)
3. **In-Play:** Live betting during match with dynamic odds

### Payment Methods
1. **Manual Payment:** Super admin manually adds balance to any user
2. **EasyPaisa:** Automated payment gateway integration
   - Super admin configures API credentials
   - IPN webhook for automatic balance credit
   - Direct customers can add balance

### AI Odds Generation
- OpenRouter API integration
- Configurable AI model selection (GPT-4, Claude, etc.)
- Generates odds for all bet types (match_winner, over_under, in_play)
- Hardness levels for difficulty adjustment
- Manual review and approval before publishing

---

## Database Tables Summary

1. **users** - id, email, password_hash, role, balance, created_by_id, master_admin_type, commission_percentage, volume_margin
2. **transactions** - id, from_user_id, to_user_id, amount, transaction_type, reference_id
3. **matches** - id, sport, team1, team2, start_time, status, winner, in_play_enabled
4. **odds** - id, match_id, bet_type, outcome, odds_value, is_active, ai_generated, ai_model
5. **bets** - id, user_id, match_id, odds_id, stake, potential_win, status, is_in_play, settled_at
6. **payment_methods** - id, provider, is_active, config (jsonb)
7. **payment_transactions** - id, user_id, payment_method_id, amount, status, provider_transaction_id

---

## Tech Stack Details

### Backend (Phoenix/Elixir)
- **Framework:** Phoenix 1.8.1
- **Database:** PostgreSQL with Ecto
- **Authentication:** Guardian (JWT)
- **Password Hashing:** Bcrypt
- **HTTP Client:** Req (for OpenRouter API)
- **Real-time:** Phoenix Channels (WebSockets)

### Frontend (Next.js)
- **Framework:** Next.js 16.2.0
- **UI Library:** React 19.2.4
- **Language:** TypeScript 5
- **Styling:** Tailwind CSS 4
- **State Management:** React Context + Hooks
- **HTTP Client:** Fetch API / Axios

### AI Integration
- **Service:** OpenRouter API
- **Models:** Configurable (GPT-4, Claude, etc.)
- **Use Case:** Automated odds generation

---

## Getting Started

### Backend Setup
```bash
cd back
mix deps.get
mix ecto.create
mix ecto.migrate
mix run priv/repo/seeds.exs
mix phx.server
```

### Frontend Setup
```bash
cd next
npm install
npm run dev
```

---

## Notes

- Backend runs on `http://localhost:4000`
- Frontend runs on `http://localhost:3000`
- Database: PostgreSQL (ensure it's running)
- All phases build incrementally on previous phases
- Test each phase thoroughly before moving to next
- Commit code after each major feature completion

---

**Ready to start Phase 1? Let's build Sixerbat! 🏏🎾**
