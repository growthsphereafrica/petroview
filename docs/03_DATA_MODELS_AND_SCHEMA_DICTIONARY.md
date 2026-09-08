# PetroView Forecourt OS — Data Models & Schema Dictionary

**Document Version:** 2.0  
**Status:** Approved / Production  
**Target Database:** Dexie.js (Client IndexedDB v7) & PostgreSQL (Cloud Backend)  
**Last Updated:** September 2026  

---

## 1. Entity-Relationship Overview

```
 +------------------+           +----------------------+           +--------------------+
 |    companies     | 1-------* |   companyStations    | 1-------* |    attendants      |
 |------------------|           |----------------------|           |--------------------|
 | id (PK)          |           | id (PK)              |           | id (PK)            |
 | shortCode        |           | companyId (FK)       |           | employeeCode       |
 | name             |           | code                 |           | fullName           |
 | adminCode        |           | name                 |           | stationId (FK)     |
 | active           |           | location             |           | companyId (FK)     |
 +------------------+           | region               |           | pinSalt / pinHash  |
          |                     +----------------------+           | approvalStatus     |
          |                                |                       +--------------------+
          | 1                              | 1                               | 1
          |                                |                                 |
          | *                              | *                               | *
 +------------------+           +----------------------+           +--------------------+
 |     products     |           |        shifts        | 1-------* |    transactions    |
 |------------------|           |----------------------|           |--------------------|
 | id (PK)          |           | id (PK)              |           | id (PK)            |
 | companyId (FK)   |           | number               |           | shiftId (FK)       |
 | code             |           | attendantId (FK)     |           | attendantId (FK)   |
 | name             |           | stationId (FK)       |           | fuelCode           |
 | category         |           | status               |           | litres             |
 | unitPrice        |           | openingReadings[]    |           | unitPrice          |
 | active           |           | closingReadings[]    |           | amount             |
 +------------------+           | expectedTotal        |           | method             |
                                | actualTotal          |           | recordedAt         |
                                | variance             |           +--------------------+
                                +----------------------+
```

---

## 2. Table Specifications & Data Dictionary

### 2.1 Table: `companies`
Stores registered Oil Marketing Companies (OMCs) provisioned by the Super Super Admin.

| Field | Type | Nullable | Description | Example |
|---|---|---|---|---|
| `id` | `VARCHAR(36)` | NO | Primary Key (UUIDv4) | `comp-pv-01` |
| `name` | `VARCHAR(100)` | NO | Full legal corporate name | `PetroView Oil Ghana Ltd` |
| `shortCode` | `VARCHAR(10)` | NO | Unique shortcode identifier | `PV` |
| `tagline` | `VARCHAR(255)` | YES | Marketing tagline | `Excellence in Energy` |
| `logoText` | `VARCHAR(20)` | NO | Logo display text | `PETROVIEW` |
| `primaryColor` | `VARCHAR(20)` | NO | Brand primary color (hex) | `#3B82F6` |
| `primaryDark` | `VARCHAR(20)` | NO | Brand dark accent color | `#1D4ED8` |
| `accentColor` | `VARCHAR(20)` | NO | Accent color (hex) | `#60A5FA` |
| `currency` | `VARCHAR(10)` | NO | Base operating currency | `GHS` |
| `adminCode` | `VARCHAR(20)` | NO | Head Office admin login code | `PV-HQ01` |
| `adminName` | `VARCHAR(100)` | NO | Default Head Office admin contact | `Head Office Admin` |
| `phone` | `VARCHAR(30)` | YES | Corporate phone number | `+233 24 100 2000` |
| `active` | `BOOLEAN` | NO | Company active status | `true` |
| `createdAt` | `TIMESTAMP` | NO | Creation timestamp (ISO 8601) | `2026-09-08T10:00:00Z` |

---

### 2.2 Table: `companyStations`
Stores retail forecourt stations belonging to an OMC.

| Field | Type | Nullable | Description | Example |
|---|---|---|---|---|
| `id` | `VARCHAR(36)` | NO | Primary Key (UUIDv4) | `st-pv-01` |
| `companyId` | `VARCHAR(36)` | NO | Foreign Key -> `companies.id` | `comp-pv-01` |
| `name` | `VARCHAR(100)` | NO | Station branch name | `PetroView Accra Central` |
| `code` | `VARCHAR(20)` | NO | Unique station code | `ACC-001` |
| `location` | `VARCHAR(100)` | NO | Physical address / suburb | `Ring Road Central` |
| `region` | `VARCHAR(50)` | NO | Administrative region | `Greater Accra` |
| `pumpsCount` | `INTEGER` | NO | Total dispensing pumps installed | `6` |
| `supervisorName` | `VARCHAR(100)` | YES | Assigned station manager | `Kwame Mensah` |
| `createdAt` | `TIMESTAMP` | NO | Creation timestamp | `2026-09-08T10:00:00Z` |

---

### 2.3 Table: `products`
Stores fuel and forecourt merchandise with dynamic unit pricing per OMC or globally.

| Field | Type | Nullable | Description | Example |
|---|---|---|---|---|
| `id` | `VARCHAR(36)` | NO | Primary Key (UUIDv4) | `prod-pms-01` |
| `companyId` | `VARCHAR(36)` | YES | Foreign Key -> `companies.id` (NULL = Global) | `comp-pv-01` |
| `code` | `VARCHAR(20)` | NO | Fuel / SKU code | `PMS` |
| `name` | `VARCHAR(100)` | NO | Display product name | `Super Unleaded (PMS)` |
| `category` | `ENUM` | NO | `FUEL`, `LUBRICANT`, `LPG`, `OTHER` | `FUEL` |
| `unitPrice` | `DECIMAL(10,2)`| NO | Unit rate in GHS per unit | `14.80` |
| `unit` | `VARCHAR(20)` | NO | Measurement unit (`L`, `kg`, `bottle`) | `L` |
| `color` | `VARCHAR(20)` | YES | UI badge color code | `#10B981` |
| `active` | `BOOLEAN` | NO | Product active flag | `true` |
| `createdAt` | `TIMESTAMP` | NO | Creation timestamp | `2026-09-08T10:00:00Z` |
| `updatedAt` | `TIMESTAMP` | NO | Last price update timestamp | `2026-09-08T15:30:00Z` |

---

### 2.4 Table: `attendants`
Stores pump attendant user profiles, credentials, and verification status.

| Field | Type | Nullable | Description | Example |
|---|---|---|---|---|
| `id` | `VARCHAR(36)` | NO | Primary Key (UUIDv4) | `att-01` |
| `employeeCode` | `VARCHAR(30)` | NO | Unique code (`[SHORTCODE]-ACC-[SEQ]-A`) | `PV-ACC-001-A` |
| `fullName` | `VARCHAR(100)` | NO | Staff member's legal name | `Kofi Atta` |
| `pinSalt` | `VARCHAR(64)` | NO | Cryptographic random salt (hex) | `a8f3b29c...` |
| `pinHash` | `VARCHAR(64)` | NO | PBKDF2/SHA-256 hashed PIN | `e3b0c44298...` |
| `pumpId` | `VARCHAR(36)` | YES | Assigned pump hardware identifier | `pump-01` |
| `stationId` | `VARCHAR(36)` | NO | Foreign Key -> `companyStations.id` | `st-pv-01` |
| `companyId` | `VARCHAR(36)` | YES | Foreign Key -> `companies.id` | `comp-pv-01` |
| `companyShortCode`| `VARCHAR(10)` | YES | OMC shortcode cache | `PV` |
| `phone` | `VARCHAR(30)` | YES | Attendant phone number | `+233 20 555 1234` |
| `approvalStatus` | `ENUM` | NO | `PENDING`, `APPROVED`, `REJECTED` | `APPROVED` |
| `approvedAt` | `TIMESTAMP` | YES | Approval timestamp | `2026-09-08T11:00:00Z` |
| `approvedBy` | `VARCHAR(36)` | YES | ID of Approving Supervisor/HQ | `hq-pv-01` |
| `active` | `BOOLEAN` | NO | Active employment status | `true` |
| `failedAttempts` | `INTEGER` | NO | Consecutive failed PIN attempts | `0` |
| `lockoutUntil` | `TIMESTAMP` | YES | Lockout expiration if exceeded | `NULL` |
| `createdAt` | `TIMESTAMP` | NO | Registration timestamp | `2026-09-08T10:00:00Z` |

---

### 2.5 Table: `supervisors`
Stores station managers, OMC head office administrators, and super administrators.

| Field | Type | Nullable | Description | Example |
|---|---|---|---|---|
| `id` | `VARCHAR(36)` | NO | Primary Key (UUIDv4) | `sup-01` |
| `employeeCode` | `VARCHAR(30)` | NO | Unique login username / code | `PV-ACC-001-M` |
| `fullName` | `VARCHAR(100)` | NO | Manager's full name | `Emmanuel Osei` |
| `pinSalt` | `VARCHAR(64)` | NO | Cryptographic salt | `f92a10be...` |
| `pinHash` | `VARCHAR(64)` | NO | Hashed PIN | `c47d8819...` |
| `stationId` | `VARCHAR(36)` | NO | Primary assigned station | `st-pv-01` |
| `companyId` | `VARCHAR(36)` | YES | Foreign Key -> `companies.id` | `comp-pv-01` |
| `companyShortCode`| `VARCHAR(10)` | YES | OMC Shortcode | `PV` |
| `isHeadOffice` | `BOOLEAN` | NO | Flag indicating OMC HQ privilege | `false` |
| `isSuperAdmin` | `BOOLEAN` | NO | Flag indicating Super Admin privilege | `false` |
| `approvalStatus` | `ENUM` | NO | `PENDING`, `APPROVED`, `REJECTED` | `APPROVED` |
| `active` | `BOOLEAN` | NO | Active status | `true` |
| `failedAttempts` | `INTEGER` | NO | Failed login counter | `0` |
| `lockoutUntil` | `TIMESTAMP` | YES | Lockout expiration | `NULL` |
| `createdAt` | `TIMESTAMP` | NO | Creation timestamp | `2026-09-08T10:00:00Z` |

---

### 2.6 Table: `shifts`
Stores attendant shift records, meter readings, sales rollups, and audit approval status.

| Field | Type | Nullable | Description | Example |
|---|---|---|---|---|
| `id` | `VARCHAR(36)` | NO | Primary Key (UUIDv4) | `shift-8821` |
| `number` | `VARCHAR(30)` | NO | Human-readable shift code | `SH-20260908-001` |
| `attendantId` | `VARCHAR(36)` | NO | Foreign Key -> `attendants.id` | `att-01` |
| `attendantName`| `VARCHAR(100)` | NO | Attendant name snapshot | `Kofi Atta` |
| `pumpId` | `VARCHAR(36)` | NO | Assigned pump ID | `pump-01` |
| `pumpName` | `VARCHAR(50)` | NO | Assigned pump name | `Pump 1 (PMS/AGO)` |
| `stationId` | `VARCHAR(36)` | NO | Foreign Key -> `companyStations.id` | `st-pv-01` |
| `stationName` | `VARCHAR(100)` | NO | Station name snapshot | `PetroView Accra Central` |
| `status` | `ENUM` | NO | `OPEN`, `CLOSED`, `REVIEWED`, `APPROVED`, `REJECTED` | `CLOSED` |
| `openedAt` | `TIMESTAMP` | NO | Shift opening time | `2026-09-08T06:00:00Z` |
| `closedAt` | `TIMESTAMP` | YES | Shift submission time | `2026-09-08T14:00:00Z` |
| `openingReadings`| `JSON` | NO | Array of `{fuelCode, value}` meters | `[{"fuelCode":"PMS","value":10450.5}]` |
| `closingReadings`| `JSON` | NO | Array of `{fuelCode, value}` meters | `[{"fuelCode":"PMS","value":11250.5}]` |
| `sales` | `JSON` | NO | Array of `{fuelCode, litres, unitPrice, amount}` | `[{"fuelCode":"PMS","litres":800,"unitPrice":14.8,"amount":11840}]` |
| `expectedTotal`| `DECIMAL(12,2)`| NO | Meter volume delta * unit price | `11840.00` |
| `payments` | `JSON` | NO | Payment breakdown `{CASH, MOMO, VOUCHER, CREDIT}` | `{"CASH":8000,"MOMO":3840,"VOUCHER":0,"CREDIT":0}` |
| `actualTotal` | `DECIMAL(12,2)`| NO | Sum of all payment methods | `11840.00` |
| `variance` | `DECIMAL(12,2)`| NO | `actualTotal - expectedTotal` | `0.00` |
| `notes` | `TEXT` | YES | Attendant shift notes | `Smooth morning shift` |
| `reviewerNotes`| `TEXT` | YES | Supervisor review notes | `Meters and cash reconciled` |
| `syncStatus` | `ENUM` | NO | `PENDING`, `SYNCED`, `FAILED` | `SYNCED` |
| `createdAt` | `TIMESTAMP` | NO | Record creation timestamp | `2026-09-08T06:00:00Z` |
| `updatedAt` | `TIMESTAMP` | NO | Last update timestamp | `2026-09-08T14:05:00Z` |

---

### 2.7 Table: `transactions`
Stores individual fuel dispenses logged during a shift.

| Field | Type | Nullable | Description | Example |
|---|---|---|---|---|
| `id` | `VARCHAR(36)` | NO | Primary Key (UUIDv4) | `tx-9901` |
| `shiftId` | `VARCHAR(36)` | NO | Foreign Key -> `shifts.id` | `shift-8821` |
| `attendantId` | `VARCHAR(36)` | NO | Foreign Key -> `attendants.id` | `att-01` |
| `fuelCode` | `VARCHAR(20)` | NO | Fuel dispensed (`PMS`, `AGO`, etc.) | `PMS` |
| `litres` | `DECIMAL(10,2)`| NO | Dispensed volume in litres | `25.00` |
| `unitPrice` | `DECIMAL(10,2)`| NO | Price per litre at dispense time | `14.80` |
| `amount` | `DECIMAL(10,2)`| NO | Total transaction value (GHS) | `370.00` |
| `method` | `ENUM` | NO | `CASH`, `MOMO`, `VOUCHER`, `CREDIT` | `MOMO` |
| `customerRef` | `VARCHAR(50)` | YES | Vehicle registration / MOMO ref | `GN-4421-22` |
| `recordedAt` | `TIMESTAMP` | NO | Transaction timestamp | `2026-09-08T07:15:30Z` |
| `syncStatus` | `ENUM` | NO | `PENDING`, `SYNCED`, `FAILED` | `SYNCED` |

---

### 2.8 Table: `auditLog`
Immutable system audit trail recording every state modification.

| Field | Type | Nullable | Description | Example |
|---|---|---|---|---|
| `id` | `VARCHAR(36)` | NO | Primary Key (UUIDv4) | `aud-001` |
| `action` | `ENUM` | NO | Audit action enum (see 2.8.1) | `PRODUCT_UPDATED` |
| `actorId` | `VARCHAR(36)` | NO | User ID who performed action | `hq-pv-01` |
| `actorName` | `VARCHAR(100)` | NO | User display name | `PetroView HQ Admin` |
| `actorRole` | `ENUM` | NO | `ATTENDANT`, `SUPERVISOR`, `SYSTEM` | `SUPERVISOR` |
| `targetId` | `VARCHAR(36)` | NO | ID of target entity | `prod-pms-01` |
| `targetDescription`| `VARCHAR(255)`| NO | Human-readable target summary | `PMS Super (GHS 14.80/L)` |
| `notes` | `TEXT` | YES | Action remarks | `Price adjusted for NPA window 17` |
| `timestamp` | `TIMESTAMP` | NO | Exact action timestamp | `2026-09-08T15:20:00Z` |
| `meta` | `JSON` | YES | Additional payload metadata | `{"oldPrice":14.50,"newPrice":14.80}` |

#### 2.8.1 AuditAction Enum Values
- `COMPANY_CREATED`, `COMPANY_UPDATED`
- `STATION_CREATED`
- `STAFF_REGISTERED`, `STAFF_APPROVED`, `STAFF_REJECTED`, `STAFF_DEACTIVATED`
- `ATTENDANT_REGISTERED`, `ATTENDANT_DEACTIVATED`
- `SUPERVISOR_REGISTERED`, `SUPERVISOR_DEACTIVATED`
- `PRODUCT_CREATED`, `PRODUCT_UPDATED`, `PRODUCT_DELETED`
- `SHIFT_OPENED`, `SHIFT_CLOSED`, `REVIEW_APPROVED`, `REJECTED`
- `PIN_RESET`

---
*End of Data Models & Schema Dictionary.*
