# PetroView Forecourt OS — System Architecture Design Document

**Document Version:** 2.0  
**Status:** Approved / Production  
**Target Platform:** Web (PWA / SPA) & Mobile (Capacitor / Android POS)  
**Last Updated:** September 2026  

---

## 1. Architectural Philosophy & Design Principles

PetroView is architected from the ground up on three foundational pillars:
1. **Offline-First (Local-First Data Authority):** The client device (forecourt terminal or supervisor tablet) is the authoritative source of transactional truth during disconnected operations. Operations never block waiting for cloud API responses.
2. **Deterministic State Reconciliation:** Shift sales, pump meter deltas, and payment distributions are computed via deterministic state machines, ensuring consistent variance metrics regardless of network conditions.
3. **Multi-Tenant Partitioning:** Data isolation is enforced across Oil Marketing Companies (OMCs) and their respective retail stations, while enabling global administrative orchestration by the Super Super Admin.

---

## 2. High-Level System Architecture

```
+-----------------------------------------------------------------------------------+
|                              CLIENT TIER (FORECOURT)                              |
|                                                                                   |
|  +--------------------+  +--------------------+  +-----------------------------+  |
|  |  Pump Attendant    |  |  Station Manager   |  |   OMC Head Office & Admin   |  |
|  |  (Sales Terminal)  |  |  (Supervisor OS)   |  |   (Executive Dashboards)    |  |
|  +--------------------+  +--------------------+  +-----------------------------+  |
|            |                       |                            |                 |
|            +-----------------------+----------------------------+                 |
|                                    |                                              |
|            +----------------------------------------------------+                 |
|            |            Presentation & UI Layer                 |                 |
|            |  - React 18 / TypeScript / Vite                    |                 |
|            |  - Tailwind CSS + Glassmorphic Design System       |                 |
|            |  - Theme Context Engine (Light / Dark Mode)        |                 |
|            |  - Lucide Vector Iconography                       |                 |
|            +----------------------------------------------------+                 |
|                                    |                                              |
|            +----------------------------------------------------+                 |
|            |          Domain & Application Services             |                 |
|            |  - authService (PIN Salting, Hashing, Sessions)    |                 |
|            |  - shiftService (Meter Deltas, Shift Lifecycle)    |                 |
|            |  - productService (Dynamic Pricing, Catalogs)      |                 |
|            |  - rollupService (Station & Fleet Aggregations)    |                 |
|            |  - syncService (Background Sync Queue)             |                 |
|            |  - exportService (PDF & Excel Workbooks)           |                 |
|            +----------------------------------------------------+                 |
|                                    |                                              |
|            +----------------------------------------------------+                 |
|            |           Infrastructure & Local Storage           |                 |
|            |  - Dexie.js (IndexedDB wrapper, v7 Schema)         |                 |
|            |  - LocalStorage (Theme & Transient State)          |                 |
|            +----------------------------------------------------+                 |
+-----------------------------------------------------------------------------------+
                                     |
               (Asynchronous REST / WebSocket / Local LAN Sync)
                                     |
                                     v
+-----------------------------------------------------------------------------------+
|                        EDGE GATEWAY & BACKEND CLUSTER                             |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | Traefik v3.6.7 Reverse Proxy (SSL Termination, Let's Encrypt Auto-Renew)   |  |
|  +-----------------------------------------------------------------------------+  |
|                                    |                                              |
|  +---------------------------------+-------------------------------------------+  |
|  |                                                                             |  |
|  v                                                                             v  |
|  +------------------------------------+       +--------------------------------+  |
|  | Web App Container (Nginx / Alpine) |       | Backend API (Node.js/Express)  |  |
|  | - Serves SPA Assets                |       | - Telemetry & Fleet Rollups    |  |
|  | - Caches Static Chunks             |       | - Cloud Database (PostgreSQL)  |  |
|  +------------------------------------+       +--------------------------------+  |
+-----------------------------------------------------------------------------------+
```

---

## 3. Detailed Subsystem Breakdown

### 3.1 Presentation & UI Layer
- **Core Framework:** React 18 with TypeScript in strict mode.
- **Styling Architecture:** Responsive Vanilla/Tailwind CSS styling utilizing CSS custom properties for instant light/dark theme switching without layout recalculation or flash of unstyled content (FOUC).
- **Component Design System:**
  - `Card`, `Button`, `Badge`, `ScreenHeader`, `StatusBar`, `Tabs` primitives in `src/features/shared/ui/index.tsx`.
  - Floating Action Bars & Slide-Over Drawers for high-speed one-handed terminal workflows.

### 3.2 Domain & Application Layer
The business logic is strictly encapsulated in pure TypeScript services:
1. **`authService.ts`**: Handles password/PIN salting (`crypto.getRandomValues`) and SHA-256 hashing. Manages role authorization (`attendant`, `supervisor`, `headoffice`, `superadmin`).
2. **`shiftService.ts`**: Governs shift state transitions:
   - `OPEN` -> `CLOSED` -> `REVIEWED` -> `APPROVED` / `REJECTED`.
   - Computes meter reconciliation: $\Delta V = V_{closing} - V_{opening}$.
   - Computes financial reconciliation: $\text{Variance} = \sum \text{Payments} - (\Delta V \times \text{Price})$.
   - Enforces pre-submission mutability and post-submission immutability.
3. **`productService.ts`**: Manages company-specific and global fuel products, categories (`FUEL`, `LUBRICANT`, `LPG`), and real-time GHS/L unit rates.
4. **`rollupService.ts`**: Calculates real-time multi-station aggregates, payment distribution charts, and period summaries for executive reporting.
5. **`syncService.ts`**: Manages background transactional upload queue with exponential backoff and network change listeners.
6. **`exportService.ts`**: Generates multi-tab Excel workbooks (`xlsx`) and formatted PDF audit summaries with company branding.

### 3.3 Persistence & Storage Layer (Dexie / IndexedDB)
PetroView utilizes IndexedDB through **Dexie.js** with a versioned schema (`MasterViewProductionDB`).
- **Dexie Schema v7:**
  - `companies`: Primary key `id`, indexed on `shortCode`, `name`, `adminCode`, `active`.
  - `companyStations`: Primary key `id`, indexed on `companyId`, `code`, `name`.
  - `attendants`: Primary key `id`, indexed on `employeeCode`, `stationId`, `companyId`, `active`, `approvalStatus`.
  - `supervisors`: Primary key `id`, indexed on `employeeCode`, `stationId`, `companyId`, `active`, `approvalStatus`, `isHeadOffice`, `isSuperAdmin`.
  - `sessions` & `supervisorSessions`: Primary key `id`, indexed on `token`, `expiresAt`.
  - `shifts`: Primary key `id`, indexed on `number`, `attendantId`, `stationId`, `status`, `syncStatus`, `openedAt`, `createdAt`.
  - `transactions`: Primary key `id`, indexed on `shiftId`, `fuelCode`, `method`, `recordedAt`.
  - `products`: Primary key `id`, indexed on `companyId`, `code`, `name`, `category`, `active`.
  - `receipts`: Primary key `id`, indexed on `shiftId`, `capturedAt`.
  - `syncQueue`: Primary key `id`, indexed on `entityType`, `entityId`, `status`, `attempts`, `nextRetryAt`.
  - `auditLog`: Primary key `id`, indexed on `action`, `actorId`, `actorRole`, `targetId`, `timestamp`.

---

## 4. Multi-Tenant Data Scoping & Role-Based Access Control (RBAC)

| Role | Scoping Boundary | Permissions |
|---|---|---|
| **Super Super Admin** | Global (All Tenants) | Full CRUD on OMCs, Stations, Global Products, Master PIN resets, Platform telemetry. |
| **OMC Head Office** | Single Company (`companyId`) | Full oversight of all stations under that OMC. Product pricing for company. Staff approval/deactivation. Fleet audits. |
| **Station Manager** | Single Station (`stationId`) | Station staff management, shift approval/rejection, wet-stock tank dippings, shift exports. |
| **Pump Attendant** | Single Shift (`shiftId`) | Self-registration, opening meters, recording fuel sales, editing pre-submission sales, closing meters. |

---

## 5. Security & Threat Mitigation Architecture

1. **Zero Plaintext Storage:** PINs are never stored in plaintext. They are salted with 16-byte cryptographically secure random bytes and hashed with PBKDF2/SHA-256 before insertion into IndexedDB.
2. **Session Lifecycles:** Attendant and Supervisor sessions generate unique cryptographically random bearer tokens valid for 12 hours with automated expiry sweeps.
3. **Audit Log Immutability:** The `auditLog` repository is append-only. No UI or API endpoint permits updating or deleting audit records.
4. **Shift Tamper Resistance:** Shift records maintain strict integrity checks. Once a shift status moves from `OPEN` to `CLOSED`, all sales modification and deletion endpoints reject operations at the core service level.

---

## 6. Directory Structure & Code Organization

```
src/
├── context/
│   └── ThemeContext.tsx            # Theme state provider & persistence
├── core/
│   ├── domain/
│   │   └── types.ts                # Pure TypeScript domain interfaces
│   ├── infra/
│   │   ├── db.ts                   # Dexie IndexedDB v7 schema & initializers
│   │   ├── password.ts             # Crypto salting & PBKDF2/SHA-256 hashing
│   │   └── repositories.ts         # Type-safe entity CRUD repositories
│   └── services/
│       ├── authService.ts          # Authentication & session token engine
│       ├── exportService.ts        # PDF & Excel report generator
│       ├── productService.ts       # Fuel product & dynamic pricing service
│       ├── rollupService.ts        # Forecourt & fleet analytics rollup
│       ├── shiftService.ts         # Shift lifecycle & meter reconciliation
│       └── syncService.ts          # Offline sync queue orchestrator
├── features/
│   ├── attendant/
│   │   ├── providers.tsx           # Attendant shift context provider
│   │   └── screens/
│   │       ├── ActiveShiftScreen.tsx
│   │       ├── ClosingReadingsScreen.tsx
│   │       ├── OpeningReadingsScreen.tsx
│   │       ├── ReviewShiftScreen.tsx
│   │       ├── SalesScreen.tsx     # Fast dispense pad, drawer & edit modal
│   │       └── ShiftSummaryScreen.tsx
│   ├── headoffice/
│   │   └── HeadOfficeDashboard.tsx # OMC executive fleet & pricing portal
│   ├── superadmin/
│   │   └── SuperSuperAdminDashboard.tsx # Super Admin OMC & global product manager
│   ├── supervisor/
│   │   ├── providers.tsx           # Supervisor station context provider
│   │   └── screens/
│   │       ├── AttendantManagementScreen.tsx
│   │       ├── AuditLogScreen.tsx  # Immutable system audit trail viewer
│   │       ├── DashboardScreen.tsx # Live forecourt monitoring
│   │       ├── DipstickScreen.tsx  # Underground tank wet-stock entry
│   │       ├── EndOfDayScreen.tsx  # Daily station closure & rollup
│   │       └── ShiftReviewScreen.tsx # Shift sign-off & dispute resolution
│   ├── unified/
│   │   └── UnifiedLoginScreen.tsx  # 4-tier unified login & self-registration
│   └── shared/
│       └── ui/                     # Reusable design system primitives
├── utils/
│   ├── currencyFormatter.ts        # GHS formatting & date/time helpers
│   └── exportUtils.ts              # Native CSV / XLSX data exporters
├── App.tsx                         # Root router & role-based view switcher
└── main.tsx                        # React application bootstrap
```

---
*End of System Architecture Design Document.*
