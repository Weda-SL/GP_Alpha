# AGENTS.md

Guidance for AI coding agents working on this repository.

## Project Overview

**gplabpro** (package name `lab-test-management`) is a web application for a plastics lab / recycling operation. It manages:

- **Lab testing**: test catalog, test suites, lab orders, results, certificates
- **Waste management**: waste plastic intake, sorted intake, processing batches, sorted dispatch
- **Marketplace**: listings and bids between recyclers and packaging manufacturers
- **Administration**: user management with role-based access, business categories, plastic types/grades, recycler grades, finance approval, audit logs

It is a frontend-only SPA backed entirely by Supabase (hosted Postgres + Auth + Storage). There is no custom backend server.

## Technology Stack

- **React 18** + **TypeScript** (strict mode, `noUnusedLocals`, `noUnusedParameters`)
- **Vite 5** for dev server and builds (`@vitejs/plugin-react`)
- **Tailwind CSS 3** (utility-only; no custom theme extensions) with PostCSS/autoprefixer
- **Supabase** (`@supabase/supabase-js` v2) — the only data layer: Postgres tables, Auth, Storage buckets, RLS policies, and RPC functions
- **react-router-dom v6** for routing
- **lucide-react** for icons (excluded from Vite `optimizeDeps` in `vite.config.ts`)
- **qrcode** and **jspdf** for certificate PDF generation

## Build and Test Commands

```bash
npm install        # install dependencies
npm run dev        # Vite dev server
npm run build      # production build (vite build) — outputs to dist/
npm run preview    # preview the production build
npm run lint       # ESLint over the whole repo
```

There is **no test framework** configured — no Jest/Vitest, no test script, no test files. Verify changes with `npm run lint` and `npm run build`, and by manual testing in the dev server.

## Environment Setup

The Supabase client is created in `src/lib/supabase.ts` from two Vite env variables:

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

These live in a `.env` file (gitignored). The app will crash on startup if they are missing.

## Code Organization

```
src/
├── main.tsx            # React entry point
├── App.tsx             # All routes; guards every page behind useAuth()
├── index.css           # Tailwind directives
├── lib/supabase.ts     # Single shared Supabase client
├── hooks/useAuth.ts    # Auth state via supabase.auth.onAuthStateChange
├── components/
│   ├── Layout.tsx          # Nav shell; fetches user role/status and renders role-based nav
│   ├── NavDropdown.tsx     # Dropdown nav groups (Configuration, Operations)
│   ├── BatchOrderModal.tsx # Converts waste-processing batches into lab orders
│   ├── SuccessNotification.tsx
│   └── Logo.tsx
├── pages/              # One top-level component per route (Dashboard, Orders, WasteManagement, ...)
└── utils/
    ├── auditLogger.ts          # logAuditEvent() → RPC log_audit_event
    └── certificateGenerator.ts # PDF certificates (jspdf + qrcode)
supabase/migrations/    # All database schema changes (SQL, applied via Supabase)
```

Conventions to follow:

- Pages live in `src/pages/` and are wired manually in `src/App.tsx` inside a `<Layout>` wrapper with a `user ? ... : <Navigate to="/login">` guard — replicate this pattern when adding a page.
- All database access goes through the shared `supabase` client from `src/lib/supabase.ts`; there are no API layers or ORMs.
- Domain data types are defined inline in each page file (per-page `interface Order { ... }`, etc.), not in a shared types module. Match the local style rather than introducing new abstraction layers.
- Significant state-changing actions should call `logAuditEvent(action, entityType, entityId, details)` from `src/utils/auditLogger.ts` (see existing usage in Layout/pages).
- UI is plain Tailwind classes with lucide-react icons; no component library. Follow the existing class patterns (e.g. `navLinkClass` styling, `max-w-7xl mx-auto` containers, gray/blue palette).

## Roles and Access Control

Roles are stored in the `users` table (`role`, `status` columns) and surfaced via `customer_profiles` (which links to `business_categories`):

- **admin** — full access: Users, Configuration (categories, plastic types/grades, recycler grades, tests, test suites, audit logs), Operations (lab orders, waste management, marketplace), Finance
- **finance** — Finance approval page
- **manager** — Lab orders
- **customer** — gated by `status === 'approved'`; recyclers get Waste Management, recyclers and packaging manufacturers get the Marketplace

Route guarding is client-side in `App.tsx` + `Layout.tsx`; the real enforcement is Postgres **Row Level Security** in the migrations. Never treat the React guards as a security boundary — RLS policies must cover any new table or column you add.

## Database (Supabase Migrations)

All schema changes are SQL files in `supabase/migrations/`, named `<timestamp>_<description>.sql` (early ones use Supabase's auto-generated names like `20250518101328_falling_base.sql`). They are applied to the Supabase project manually or via the dashboard — **creating a migration file does not apply it**, and several root-level `.sql` files (`dual_approval_processing_migration.sql`, `sample_inspection_migration.sql`, etc.) are pending/manual migrations documented in the root `*_SETUP.md` / `*_SUMMARY.md` files.

Key tables: `users`, `customer_profiles`, `business_categories`, `tests`, `test_suites`, `test_suite_items`, `orders`, `order_results`, `order_status_trail`, `plastic_types`, `plastic_grades`, `recycler_grades`, `waste_plastic_intake`, `sorted_plastic_intake`, `sorted_plastic_intake_allocations`, `marketplace_listings`, `marketplace_bids`, `audit_logs`, `customer_documents`, `required_documents`.

The root-level markdown files (`IMPLEMENTATION_SUMMARY.md`, `ORDER_COMPLETION_SUMMARY.md`, `MIGRATION_GUIDE_ORDER_COMPLETION.md`, `DUAL_APPROVAL_SETUP.md`, `SAMPLE_INSPECTION_SETUP.md`, `BATCH_ORDER_CONVERSION_SUMMARY.md`, `SORTED_INTAKE_CHANGES.md`, `QUICK_REFERENCE_ORDER_COMPLETION.md`) document past feature implementations and their associated migrations — consult them when touching orders, waste intake, or sample inspection features.

## Linting and Code Style

- ESLint 9 flat config (`eslint.config.js`): `@eslint/js` recommended + `typescript-eslint` recommended + `react-hooks` + `react-refresh` (only-export-components as warning). `dist/` is ignored.
- TypeScript strict mode is on; unused locals/parameters are compile errors.
- Style: function components with named exports, hooks at the top, Tailwind utility classes inline, `console.error` for caught errors, English throughout.

## Security Considerations

- Only the Supabase **anon key** is used in the frontend; never introduce a service-role key into this codebase.
- All authorization must be backed by RLS policies and RPC functions in migrations — client-side role checks are UX only.
- Audit-sensitive actions (login/logout, CRUD on tests/orders/users, approvals) should be logged via `logAuditEvent`.
- `.env` is gitignored; do not commit Supabase credentials.

## Deployment

- Static SPA build (`dist/`) deployed to a static host. `public/_redirects` contains `/* /index.html 200` — the Netlify SPA fallback, so deep links resolve client-side.
- The repo was scaffolded in Bolt/StackBlitz (see `.bolt/`, README link).
