# PetroView Forecourt OS — Product Requirements Document (PRD)

**Document Version:** 2.0  
**Status:** Approved / Production  
**Author:** Engineering & Product Team  
**Last Updated:** September 2026  
**Target Market:** Downstream Petroleum Retail (Ghana, West Africa & Emerging Markets)

---

## 1. Executive Summary & Business Context

### 1.1 Industry Background
Downstream petroleum retail in emerging markets operates in high-volume, cash-intensive, and operationally volatile environments. Service stations frequently suffer from:
1. **Pervasive Fuel & Cash Leakage:** Discrepancies between physical pump meter registers, dipstick tank readings, and actual collected revenue (Cash, Mobile Money, B2B Credit).
2. **Intermittent Internet Connectivity:** Forecourts located in peri-urban, rural, or industrial corridors face frequent cellular outages, making cloud-only POS systems unusable.
3. **Multi-Tier Operational Disconnect:** Oil Marketing Companies (OMCs) lack real-time visibility into dealer-operated or company-owned stations, delaying reconciliation by days or weeks.
4. **Regulatory & Audit Demands:** National Petroleum Authority (NPA) regulations and tax authorities require tamper-proof meter logs, exact price compliance, and verifiable transaction trails.

### 1.2 Product Vision
**PetroView Forecourt OS (Master View)** is a resilient, offline-first, multi-tenant digital operating system designed specifically for downstream petroleum retail. It unifies forecourt operations across four distinct tiers—from the pump nozzle to the OMC executive boardroom—ensuring zero data loss, automated reconciliation, dynamic fuel pricing, and audit-grade financial controls.

---

## 2. Target Audience & 4-Tier Hierarchy

PetroView enforces a strict 4-tier role-based governance model:

```
+-------------------------------------------------------------+
|               TIER 1: SUPER SUPER ADMIN                     |
|  - System-wide administration & platform telemetry          |
|  - OMC onboarding & Head Office credential issuance         |
|  - Global product catalog & emergency controls              |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|               TIER 2: OMC HEAD OFFICE                       |
|  - Multi-station fleet governance & regional oversight      |
|  - Attendant & Manager registration approval / deactivation |
|  - Dynamic fuel pricing & catalog management (GHS/L)        |
|  - Financial audits, variance monitoring & Excel/PDF export |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|               TIER 3: STATION MANAGER / SUPERVISOR          |
|  - Station-level daily forecourt operations                 |
|  - Shift verification, meter sign-off & dispute resolution  |
|  - Underground tank wet-stock dipping entry                 |
|  - Attendant shift review, approval, and performance export |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|               TIER 4: PUMP ATTENDANT                        |
|  - High-speed forecourt terminal with offline keypad        |
|  - Shift opening meter reading capture                      |
|  - Real-time sales logging (Cash, MoMo, Card, Credit)       |
|  - Shift transactions drawer review & pre-submission edit   |
|  - Closing meter capture & shift submission                 |
+-------------------------------------------------------------+
```

---

## 3. Core Objectives & Key Performance Indicators (KPIs)

| Objective | Target Metric | Business Impact |
|---|---|---|
| **Zero Forecourt Downtime** | 100% offline uptime for Attendants & Supervisors | No vehicle fuel dispensing is delayed due to network failure. |
| **Eliminate Reconciliation Delay** | Shift reconciliation in < 60 seconds post-shift | Instant detection of meter over/short variances. |
| **Prevent Unauthorized Access** | 100% pre-approval of staff by Head Office / Supervisor | Eliminates ghost attendants and rogue accounts. |
| **Dynamic Price Propagation** | Price changes propagate instantly across all station apps | Prevents revenue loss during NPA petroleum price window updates. |
| **Audit Compliance** | 100% immutable event logging | Comprehensive audit trail for regulatory and executive inspection. |

---

## 4. Detailed Functional Specifications

### 4.1 Automated Code Generation & Tenant Scoping
To eliminate manual account chaos and prevent cross-tenant leakage:
1. **OMC Creation:** When the Super Super Admin creates an OMC (e.g., *PetroView Oil*, *GOIL*, *Shell*), a unique **Company Short Code** is defined (e.g. `PV`, `GOIL`, `SHELL`).
2. **Head Office Admin Code:** Generated automatically as `[SHORTCODE]-HQ[SEQ]` (e.g., `PV-HQ01`, `GOIL-HQ01`).
3. **Staff Self-Registration:** When new staff register on the login portal:
   - They select their OMC from the populated registered company list.
   - The system automatically assigns a sequential, standardized employee code:
     - **Attendants:** `[SHORTCODE]-ACC-[SEQ]-A` (e.g., `PV-ACC-001-A`, `PV-ACC-002-A`)
     - **Managers:** `[SHORTCODE]-ACC-[SEQ]-M` (e.g., `PV-ACC-001-M`, `PV-ACC-002-M`)
4. **Approval Gate:** Newly registered staff enter `PENDING` status. They cannot sign in or dispense fuel until explicitly approved in the OMC Head Office portal or Supervisor station dashboard.

### 4.2 Dynamic Products & Fuel Pricing Engine
1. **Super Super Admin Capabilities:**
   - Create, edit, and categorize products (`FUEL`, `LUBRICANT`, `LPG`, `OTHER`).
   - Set baseline global unit prices (GHS/L).
   - Filter and manage pricing specifically for any OMC tenant.
2. **OMC Head Office Capabilities:**
   - Access the **"Products & Fuel Pricing"** tab to define company-specific prices.
   - Activate/deactivate products according to station offerings.
   - Real-time synchronization: updated prices immediately apply to active station terminals without app re-installation.
3. **Forecourt Integration:**
   - Attendant dispensing keypad displays dynamic buttons for each active fuel type with live GHS/L unit rates.
   - Shift sales and closing calculations automatically use the active price schedule.

### 4.3 Attendant Forecourt Terminal & Shift Lifecycle
1. **Opening Readings:** Attendant enters cumulative pump meter readings (L) per assigned nozzle before beginning fuel dispensing.
2. **Real-Time Dispense Entry:** Fast one-handed entry interface:
   - Volume presets (5L, 10L, 20L, 50L) or custom volume/amount.
   - Payment method selection: `CASH`, `MOMO` (Mobile Money), `CARD`, `CREDIT` (B2B Account).
3. **Shift Transactions Drawer:**
   - Sticky bottom bar showing live transaction count and shift revenue (e.g., `Shift Transactions (14) · GHS 1,840.00`).
   - Clicking slides open a full transactional register with timestamps and payment badges.
4. **Pre-Submission Transaction Editing:**
   - While the shift is `OPEN`, the attendant can tap **"Edit"** on any transaction to modify volume, product type, or payment method if a mistake occurred.
   - All totals and payment breakdowns update instantaneously.
5. **Closing Meter Readings & Submission:**
   - Attendant inputs closing mechanical/electronic meter readings.
   - System calculates expected volume, actual recorded sales, and any variance.
   - Attendant submits the shift. Once submitted (`CLOSED`), all transactions are **permanently locked** against further edits.

### 4.4 Station Manager (Supervisor) Operations
1. **Staff Approval & PIN Management:**
   - Approve or reject pending attendant/manager registrations.
   - Perform secure PIN resets when attendants forget their credentials.
2. **Shift Audit & Verification:**
   - Inspect submitted attendant shifts, compare meter throughput against recorded cash and mobile money.
   - Mark shifts as `APPROVED` or `REJECTED` with reviewer audit notes.
3. **Underground Tank Wet-Stock Dippings:**
   - Record opening and closing dipstick measurements (cm / Litres) per tank.
   - Compare tank drawdown against cumulative pump meter throughput to detect underground tank leaks or delivery shortfalls.
4. **Reporting & Period Exports:**
   - Filter attendant performance and station sales by date range.
   - Export detailed shift audit sheets to formatted **PDF** and **Excel (.xlsx)**.

### 4.5 OMC Head Office Executive Portal
1. **Fleet Rollup & Telemetry:**
   - Multi-station dashboard aggregating sales volume, revenue by fuel product, and payment mix across all stations.
2. **Variance & Discrepancy Alerts:**
   - Immediate visibility into stations with cash shortages, meter over-dispensing, or unreviewed shifts.
3. **Staff Fleet Management:**
   - View, approve, or deactivate staff across all company stations.
   - Monitor staff performance rankings and shift completion metrics.
4. **Executive Reporting & Export:**
   - Multi-station periodic financial reports exportable to Excel and PDF for corporate accounting and tax filing.

### 4.6 Global Light / Dark Mode System
1. **Universal Theme Engine:**
   - Dark theme: High-contrast slate-950 UI optimized for nighttime forecourt operation, reducing glare and battery consumption.
   - Light theme: Crisp, high-contrast daylight theme designed for high-glare direct sunlight outdoor conditions.
2. **Persistent Preferences:** User theme preference is saved in local storage and maintained across sessions.

---

## 5. Non-Functional Requirements (NFRs)

### 5.1 Reliability & Offline-First Availability
- **100% Offline Forecourt Operation:** The Attendant and Station Manager portals must operate without interruption even during complete Internet disconnection.
- **Local Storage:** All entities (shifts, transactions, meters, users, products) are persisted locally in client-side IndexedDB via Dexie.js.
- **Automatic Sync Queue:** Background sync queue tracks unsynced mutations with exponential retry logic.

### 5.2 Performance & Responsiveness
- **Terminal Input Latency:** Keypad tap-to-entry latency < 50ms.
- **Initial Bundle Load:** Core application bundle compressed < 600kB gzip for fast loading on 3G cellular connections.
- **Database Query Latency:** Local IndexedDB lookups < 15ms.

### 5.3 Security & Tamper Resistance
- **PIN Security:** PINs are salted with random crypto salts and hashed using PBKDF2 / SHA-256 before local persistence.
- **Brute Force Lockout:** 5 consecutive failed PIN attempts trigger automatic 15-minute account lockout.
- **Immutable Audit Trail:** All critical operations (`SHIFT_OPENED`, `SHIFT_CLOSED`, `REVIEW_APPROVED`, `PRODUCT_UPDATED`, `PIN_RESET`) generate immutable audit log entries.
- **Shift Immutability:** Transactions cannot be edited or deleted once a shift is submitted.

---

## 6. Acceptance Criteria Matrix

| Feature | Acceptance Criteria | Verified |
|---|---|---|
| **Super Admin Onboarding** | Super Admin creates an OMC; shortcode and HQ credentials are generated and stored. | Yes |
| **Staff Self-Registration** | Attendant selects OMC, receives formatted code (e.g. `PV-ACC-001-A`), placed in `PENDING` status. | Yes |
| **Head Office Approval** | OMC HQ reviews pending staff and approves; staff can immediately log in with their PIN. | Yes |
| **Product & Price Management** | Super Admin and OMC HQ can create products and set GHS/L unit prices; prices reflect in attendant app. | Yes |
| **Offline Shift Execution** | Attendant opens shift, enters sales with various payment methods, reviews transactions in drawer. | Yes |
| **Transaction Editing** | Attendant edits volume/method before shift closing; after submission, edits are strictly disabled. | Yes |
| **Shift Reconciliation** | System computes `Variance = Payments - (Closing - Opening) * Price`; manager reviews and signs off. | Yes |
| **Light/Dark Mode** | Header toggle switches themes instantly; persists across page reload. | Yes |
| **Data Export** | Supervisor and OMC HQ export shift and staff performance summaries to Excel and PDF. | Yes |

---
*End of Product Requirements Document.*
