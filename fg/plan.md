# Sixerbat Frontend Execution Plan — 10 Phases, 120 Steps

## Overview
This plan implements the complete Sixerbat betting platform UI using Next.js App Router with role-based route groups. The frontend leverages existing 
API clients, React Query, and the Sixerbat design system. Phase 0 sets up the foundation; Phases 1–9 build out all user-facing and admin surfaces.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


## Phase 1: Foundation & Public UI (Steps 1–12)

Goal: Establish route groups, shared components, and public-facing pages.

Deliverables:
- Route group layouts with auth guards
- Shared UI component library
- Public landing and match browsing

Steps:
1. Create next/src/app/(public)/layout.tsx — public layout with header/footer, no auth required
2. Create next/src/app/(public)/page.tsx — landing page with hero, featured matches, CTA to browse
3. Create next/src/app/(public)/matches/page.tsx — matches listing with sport/status filters
4. Create next/src/app/(public)/matches/[id]/page.tsx — match detail with teams, start time, status
5. Create next/src/components/ui/Button.tsx — primary/secondary/destructive variants using theme tokens
6. Create next/src/components/ui/Card.tsx — surface-1/2 card with border tokens
7. Create next/src/components/ui/Input.tsx — form input with inline error display
8. Create next/src/components/ui/Tag.tsx — status pills (scheduled/live/finished/settled/cancelled)
9. Create next/src/components/ui/Modal.tsx — dialog overlay with glassy surface
10. Create next/src/components/ui/Toast.tsx — toast notifications for success/error
11. Create next/src/components/layout/Header.tsx — nav with login button, role-based links
12. Create next/src/components/layout/Footer.tsx — minimal footer with copyright

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


## Phase 2: Authentication (Steps 13–20)

Goal: Login page with role-based redirect and session handling.

Deliverables:
- Login page
- Logout functionality
- Auth guard layouts

Steps:
13. Create next/src/app/(public)/login/page.tsx — login form with email/password, calls publicApi.auth.login
14. Create next/src/lib/auth/AuthGuard.tsx — component that checks userApi.auth.me() and redirects on 401
15. Create next/src/app/(user)/layout.tsx — user layout that wraps with AuthGuard, checks role === "player"
16. Create next/src/app/(master)/layout.tsx — master admin layout with AuthGuard, checks role === "master_admin"
17. Create next/src/app/(admin)/layout.tsx — super admin layout with AuthGuard, checks role === "super_admin"
18. Create next/src/components/auth/LogoutButton.tsx — calls userApi.auth.logout() then redirects to login
19. Add logout link to Header for authenticated users
20. Create next/src/app/(public)/register/page.tsx — player registration (if used), calls publicApi.auth.register

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


## Phase 3: Player Dashboard & Wallet (Steps 21–34)

Goal: Player-facing pages for profile, balance, deposits, withdrawals, and transactions.

Deliverables:
- Profile page
- Wallet page with balance, deposit, withdraw
- Transaction history

Steps:
21. Create next/src/app/(user)/profile/page.tsx — profile view/edit, calls userApi.profile.get()
22. Create next/src/app/(user)/wallet/page.tsx — balance display + deposit/withdraw buttons
23. Create next/src/components/wallet/BalanceCard.tsx — shows balance with userApi.profile.balance()
24. Create next/src/app/(user)/wallet/deposit/page.tsx — deposit form, calls userApi.payments.deposit
25. Create next/src/app/(user)/wallet/withdraw/page.tsx — withdraw form, calls userApi.payments.withdraw
26. Create next/src/app/(user)/wallet/transactions/page.tsx — transaction list, calls userApi.payments.transactions
27. Create next/src/components/wallet/TransactionTable.tsx — table for deposit/withdraw history
28. Create next/src/components/wallet/DepositForm.tsx — form with amount, payment method selection
29. Create next/src/components/wallet/WithdrawForm.tsx — form with amount, validation (min/max)
30. Create next/src/app/(user)/layout.tsx — add sidebar or top nav with wallet link
31. Create next/src/app/(user)/account/page.tsx — account settings (password change if supported)
32. Add React Query hooks for profile, balance, transactions in next/src/hooks/useProfile.ts
33. Add React Query hooks for payments in next/src/hooks/usePayments.ts
34. Create next/src/components/ui/Alert.tsx — inline alerts for insufficient balance, errors

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


## Phase 4: Player Betting (Steps 35–46)

Goal: Bet placement, bet list, bet details, and cancellation.

Deliverables:
- Bet placement flow
- Bets list and detail views

Steps:
35. Create next/src/app/(user)/bets/page.tsx — bets list with filters (active/settled/cancelled)
36. Create next/src/app/(user)/bets/[id]/page.tsx — bet detail with match, odds, stake, status
37. Create next/src/components/bets/BetCard.tsx — single bet display with outcome status
38. Create next/src/components/bets/BetList.tsx — list of BetCard with status tabs
39. Create next/src/app/(public)/matches/[id]/page.tsx — add "Place Bet" button that opens bet slip
40. Create next/src/components/bets/BetSlip.tsx — slide-out panel for selected odds
41. Create next/src/components/bets/BetPlacementForm.tsx — stake input, potential win calculation, confirm
42. Create next/src/app/(user)/bets/place/page.tsx — full-page bet placement (optional, can use slip)
43. Add useBets React Query hooks in next/src/hooks/useBets.ts
44. Implement bet cancellation UI in bet detail page, calls userApi.bets.cancel(id)
45. Add "Cancel Bet" button with confirmation modal
46. Create next/src/components/bets/BetHistoryFilter.tsx — date range, status filter controls

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


## Phase 5: Master Admin Dashboard & Players (Steps 47–66)

Goal: Master admin dashboard, player management, and reporting.

Deliverables:
- Dashboard with stats
- Player CRUD
- Player detail with ledger/stats/bets

Steps:
47. Create next/src/app/(master)/dashboard/page.tsx — stats overview, calls masterAdminApi.dashboard()
48. Create next/src/components/dashboard/StatCard.tsx — reusable stat display (players, revenue, bets)
49. Create next/src/components/dashboard/ChartPlaceholder.tsx — placeholder for revenue/activity charts
50. Create next/src/app/(master)/players/page.tsx — players list with search/pagination
51. Create next/src/app/(master)/players/create/page.tsx — create player form, calls masterAdminApi.players.create
52. Create next/src/app/(master)/players/[id]/page.tsx — player detail overview
53. Create next/src/app/(master)/players/[id]/ledger/page.tsx — ledger view, calls masterAdminApi.players.ledger
54. Create next/src/app/(master)/players/[id]/stats/page.tsx — stats view, calls masterAdminApi.players.stats
55. Create next/src/app/(master)/players/[id]/bets/page.tsx — bets report, calls masterAdminApi.players.betsReport
56. Create next/src/app/(master)/players/[id]/export/page.tsx — report export, calls masterAdminApi.players.reportExport
57. Create next/src/components/players/PlayerTable.tsx — table with name, email, balance, status
58. Create next/src/components/players/PlayerActions.tsx — topup/deduct buttons
59. Create next/src/components/players/TopupModal.tsx — topup form with amount, note
60. Create next/src/components/players/DeductModal.tsx — deduct form with amount, note
61. Create next/src/app/(master)/transactions/page.tsx — transactions list, calls masterAdminApi.transactions
62. Create next/src/components/transactions/TransactionTable.tsx — master admin transaction view
63. Add React Query hooks for master admin in next/src/hooks/useMasterAdmin.ts
64. Create next/src/app/(master)/reports/page.tsx — master admin reports, calls masterAdminApi.reports.my
65. Create next/src/components/reports/ReportCard.tsx — summary card for report data
66. Add pagination to all list pages using React Query keepPreviousData

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


## Phase 6: Super Admin — Master Admins & Users (Steps 67–78)

Goal: Super admin user management (master admins and players).

Deliverables:
- Master admin CRUD
- Player management with risk controls

Steps:
67. Create next/src/app/(admin)/dashboard/page.tsx — super admin dashboard, calls superAdminApi.dashboard()
68. Create next/src/app/(admin)/master-admins/page.tsx — master admins list, calls superAdminApi.masterAdmins.list
69. Create next/src/app/(admin)/master-admins/create/page.tsx — create master admin form
70. Create next/src/app/(admin)/master-admins/[id]/page.tsx — master admin detail view
71. Create next/src/app/(admin)/players/page.tsx — all players list, calls superAdminApi.users.players
72. Create next/src/app/(admin)/players/[id]/page.tsx — player detail with risk controls
73. Create next/src/components/admin/DeactivateButton.tsx — deactivate player, calls superAdminApi.users.deactivate
74. Create next/src/components/admin/RiskControlsModal.tsx — set risk limits, calls superAdminApi.users.riskControls
75. Create next/src/components/admin/RevokeSessionButton.tsx — revoke session, calls superAdminApi.users.revokeSession
76. Create next/src/app/(admin)/transfers/page.tsx — platform transfers, calls superAdminApi.transfers.transfer
77. Create next/src/app/(admin)/manual-payment/page.tsx — manual payment, calls superAdminApi.transfers.manualPayment
78. Add React Query hooks for super admin users in next/src/hooks/useSuperAdminUsers.ts

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


## Phase 7: Super Admin — Matches & Odds (Steps 79–98)

Goal: Match lifecycle management and AI odds workspace.

Deliverables:
- Match CRUD and lifecycle actions
- Odds generation, rewrite, publish workflow

Steps:
79. Create next/src/app/(admin)/matches/page.tsx — matches list with filters (sport, status)
80. Create next/src/app/(admin)/matches/create/page.tsx — create match form, calls superAdminApi.matches.create
81. Create next/src/app/(admin)/matches/[id]/page.tsx — match detail with edit/lifecycle actions
82. Create next/src/components/matches/MatchForm.tsx — form for create/edit match
83. Create next/src/components/matches/MatchActions.tsx — start-live, close, settle, cancel buttons
84. Create next/src/app/(admin)/matches/[id]/odds/page.tsx — odds workspace for match
85. Create next/src/components/odds/OddsList.tsx — list of odds with status (draft/published)
86. Create next/src/components/odds/OddsForm.tsx — create/edit odds manually
87. Create next/src/components/odds/GenerateOddsButton.tsx — triggers superAdminApi.odds.generate
88. Create next/src/components/odds/RegenerateButton.tsx — triggers superAdminApi.odds.regenerate
89. Create next/src/components/odds/RewriteOddsModal.tsx — rewrite with admin note, calls superAdminApi.odds.rewrite
90. Create next/src/components/odds/OrchestrateButton.tsx — triggers superAdminApi.odds.orchestrate
91. Create next/src/components/odds/PublishButton.tsx — publish odds, calls superAdminApi.odds.publish
92. Create next/src/components/odds/UnpublishButton.tsx — unpublish odds, calls superAdminApi.odds.unpublish
93. Create next/src/components/odds/OddsVersionTag.tsx — displays v1, v2, etc.
94. Create next/src/components/odds/OddsActivateButton.tsx — activate/deactivate single odds
95. Add match lifecycle actions in match detail page (startLive, close, settle, cancel)
96. Add odds workspace tabs: Draft | Published | All
97. Add preview panel for generated odds before publish
98. Add React Query hooks for matches/odds in next/src/hooks/useMatches.ts and useOdds.ts

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


## Phase 8: Super Admin — Bets, Payments, Reports (Steps 99–110)

Goal: Bet monitoring, payment management, and platform reporting.

Deliverables:
- Admin bet monitoring
- Payment methods and withdrawal approvals
- Platform reports

Steps:
99. Create next/src/app/(admin)/bets/page.tsx — all bets view, calls superAdminApi.bets.adminIndex
100. Create next/src/components/bets/AdminBetTable.tsx — table with player, match, stake, status
101. Create next/src/app/(admin)/payments/methods/page.tsx — payment methods list
102. Create next/src/app/(admin)/payments/methods/configure/page.tsx — configure method, calls superAdminApi.payments.configure
103. Create next/src/components/payments/MethodToggle.tsx — activate/deactivate payment method
104. Create next/src/app/(admin)/payments/withdrawals/page.tsx — pending withdrawals list
105. Create next/src/components/payments/ApproveWithdrawalButton.tsx — approve withdrawal
106. Create next/src/app/(admin)/payments/transactions/page.tsx — all payment transactions
107. Create next/src/app/(admin)/reports/page.tsx — reports dashboard with tabs
108. Create next/src/app/(admin)/reports/daily/page.tsx — daily report, calls superAdminApi.reports.daily
109. Create next/src/app/(admin)/reports/weekly/page.tsx — weekly report
110. Create next/src/app/(admin)/reports/monthly/page.tsx — monthly report

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


## Phase 9: Super Admin — Providers, Sports Data, API Management, Settings (Steps 111–120)

Goal: Provider management, sports data observability, API controls, and AI settings.

Deliverables:
- Provider CRUD and health
- Sports data sync logs and rejections
- API management dashboard
- OpenRouter settings

Steps:
111. Create next/src/app/(admin)/providers/page.tsx — providers list, calls superAdminApi.providers.list
112. Create next/src/app/(admin)/providers/create/page.tsx — upsert provider form
113. Create next/src/app/(admin)/providers/health/page.tsx — provider health status
114. Create next/src/components/providers/ProviderCard.tsx — display name, status, sync button
115. Create next/src/app/(admin)/sports-data/events/page.tsx — events list, calls superAdminApi.sportsData.events
116. Create next/src/app/(admin)/sports-data/sync-logs/page.tsx — sync logs, calls superAdminApi.sportsData.syncLogs
117. Create next/src/app/(admin)/sports-data/rejections/page.tsx — rejections with backfill/replay
118. Create next/src/app/(admin)/api-management/page.tsx — API management dashboard
119. Create next/src/app/(admin)/api-management/providers/page.tsx — provider controls (pause/resume/reset)
120. Create next/src/app/(admin)/settings/ai/page.tsx — OpenRouter models and key config

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


## Summary

- **Phase 1 (1–12):** Foundation, components, public pages
- **Phase 2 (13–20):** Auth (login/logout/guards)
- **Phase 3 (21–34):** Player wallet (profile, balance, deposit, withdraw, transactions)
- **Phase 4 (35–46):** Player betting (bets list, detail, place, cancel)
- **Phase 5 (47–66):** Master admin (dashboard, players, ledger, stats, reports)
- **Phase 6 (67–78):** Super admin users (master admins, players, transfers)
- **Phase 7 (79–98):** Matches and odds (CRUD, lifecycle, AI workspace)
- **Phase 8 (99–110):** Bets, payments, reports
- **Phase 9 (111–120):** Providers, sports data, API management, AI settings

