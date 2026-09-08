# PetroView Forecourt OS — User Manual & Standard Operating Procedures (SOP)

**Document Version:** 2.0  
**Target Roles:** Super Super Admin, OMC Head Office, Station Manager (Supervisor), Pump Attendant  
**Application URL:** `https://petroview.growthspheregh.com`  
**Last Updated:** September 2026  

---

## 1. Quick Credentials Reference

| Role | Username / Code | Password / PIN | Description |
|---|---|---|---|
| **Super Super Admin** | `SUPER-ADMIN` | `7256` | Master Administrator with cross-OMC privileges |
| **PetroView Head Office** | `PV-HQ01` | `9999` | OMC Executive portal for PetroView Oil |
| **GOIL Head Office** | `GOIL-HQ01` | `9999` | OMC Executive portal for GOIL |
| **Shell Head Office** | `SHELL-HQ01` | `9999` | OMC Executive portal for Shell Ghana |
| **TotalEnergies Head Office**| `TOTAL-HQ01` | `9999` | OMC Executive portal for TotalEnergies |
| **Station Manager** | `PV-ACC-001-M` | `1234` | Forecourt Supervisor (Accra Central Station) |
| **Pump Attendant** | `PV-ACC-001-A` | `1234` | Forecourt Attendant (Accra Central Station) |

---

## 2. Module 1: Super Super Admin SOP

### 2.1 Logging In
1. Navigate to `https://petroview.growthspheregh.com`.
2. Enter Username: `SUPER-ADMIN`.
3. Enter PIN: `7256`.
4. Click **Sign In**.

### 2.2 Onboarding a New Oil Marketing Company (OMC)
1. On the Super Admin Dashboard, click the **"Register New Company (OMC)"** button.
2. Fill in the required fields:
   - **Company Legal Name** (e.g. *Star Oil Ghana Ltd*)
   - **Company Short Code** (e.g. *STAR*)
   - **Admin Name** (e.g. *Operations Director*)
   - **Brand Colors** (Primary & Accent Hex colors)
3. Click **"Save Company"**.
4. The system will automatically generate the Head Office Admin Code (e.g. `STAR-HQ01`) with default PIN `9999`. Hand these credentials to the OMC Executive.

### 2.3 Managing Global Products & Setting OMC Fuel Pricing
1. Click the **"Products & Fuel Pricing"** tab on the navigation bar.
2. Filter products by selecting **"All Companies (Global)"** or a specific OMC from the dropdown.
3. Click **"Add Fuel / Product"** to introduce new products (e.g. *LPG AutoGas*, *Super V-Power*, *Heavy Duty Lubricant*).
4. To modify prices (e.g. during NPA price window shifts), click **"Edit"** next to any product, enter the new **Price per Litre (GHS/L)**, and click **"Save Product"**. All active station terminals under that OMC will receive the new price immediately.

---

## 3. Module 2: OMC Head Office Executive SOP

### 3.1 Logging In
1. Navigate to the login portal.
2. Enter your company HQ Code (e.g. `PV-HQ01` or `GOIL-HQ01`).
3. Enter PIN: `9999` (or your custom assigned PIN).
4. Click **Sign In**.

### 3.2 Reviewing & Approving Pending Attendants and Managers
1. On the Head Office Dashboard, navigate to the **"Staff Fleet Management"** tab.
2. Review staff records flagged with the yellow `PENDING APPROVAL` badge.
3. Verify the employee's name and assigned station.
4. Click **"Approve Staff"** (green checkmark). Once approved, the staff member can immediately log in at their station with their chosen PIN.
5. If an employee departs the company, click **"Deactivate"** to revoke access instantly.

### 3.3 Setting Company Fuel Pricing & Catalogs
1. Click the **"Products & Fuel Pricing"** tab.
2. Review current prices for PMS Super, AGO Diesel, DPK Kerosene, etc.
3. Click **"Edit Price"** to update the price in GHS/L.
4. Click **"Update"**. The new rate is automatically locked into all future shift sales across all company stations.

### 3.4 Exporting Financial & Shift Audits (PDF / Excel)
1. Navigate to the **"Station Fleet & Shift Rollup"** tab.
2. Select your desired date range (e.g. *Today*, *This Week*, *Last 30 Days*, or *Custom Range*).
3. Click **"Export to Excel (.xlsx)"** for deep financial pivot tables, or **"Export to PDF"** for an executive audit report.

---

## 4. Module 3: Station Manager (Supervisor) SOP

### 4.1 Opening the Forecourt Day
1. Sign in using your Manager Code (e.g. `PV-ACC-001-M`) and PIN (`1234`).
2. Navigate to the **"Tank Dippings (Wet-Stock)"** tab.
3. Take physical dipstick measurements of each underground tank (PMS, AGO) and record the opening dip readings (cm and litres).

### 4.2 Reviewing and Signing Off Attendant Shifts
1. In the **"Shift Review"** tab, inspect shifts submitted by attendants with status `CLOSED`.
2. Review the four-point reconciliation:
   - **Meter Delta:** Opening Meter vs. Closing Meter = Total Volume Dispensed (L).
   - **Expected Revenue:** Total Volume Dispensed $\times$ Active Unit Price (GHS/L).
   - **Actual Collections:** Cash + Mobile Money + Card + B2B Credit logged by attendant.
   - **Variance:** Discrepancy indicator (Over / Short).
3. If cash collections and meter logs balance, enter reviewer notes and click **"Approve Shift"**.
4. If a severe discrepancy exists, enter detailed audit notes and mark as **"Reject / Query Shift"**.

### 4.3 Resetting Attendant PINs
1. If an attendant forgets their PIN, open the **"Staff Management"** screen.
2. Click **"Reset PIN"** on the attendant's card.
3. Set a temporary 4-digit PIN (e.g. `1234`) and instruct the attendant to sign in.

---

## 5. Module 4: Pump Attendant SOP

### 5.1 Self-Registration (First-Time Setup)
1. On the login screen, click the **"Staff Registration"** tab.
2. Select your **Oil Marketing Company (OMC)** from the dropdown.
3. Select your assigned **Station Branch**.
4. Select your role: **Pump Attendant**.
5. Enter your **Full Legal Name**, **Phone Number**, and create a secure **4-digit PIN**.
6. Click **"Create Account"**.
7. The system will display your permanent unique code (e.g., `PV-ACC-001-A`). **Write down this code.**
8. Notify your Station Manager or Head Office to approve your account.

### 5.2 Opening a Shift & Recording Meter Readings
1. Once approved, enter your Employee Code (`PV-ACC-001-A`) and 4-digit PIN on the Sign In tab.
2. Tap **"Start New Shift"**.
3. Inspect your physical pump meter and enter the **Opening Meter Reading** (in litres) for each nozzle assigned to you.
4. Tap **"Confirm Opening Readings & Open Shift"**.

### 5.3 Recording Fuel Dispenses
1. On the **Sales Screen**, select the fuel product (e.g. `PMS Super · GHS 14.80/L` or `AGO Diesel · GHS 15.20/L`).
2. Enter the volume dispensed (using quick buttons `5L`, `10L`, `20L`, `50L` or custom amount).
3. Select the customer's payment method:
   - **CASH**: Standard cash payment.
   - **MOMO**: Mobile Money (MTN MoMo, Telecel Cash, AT Money).
   - **CARD**: POS debit/credit card.
   - **CREDIT**: B2B fleet account (enter vehicle reg number).
4. Tap **"Record Dispense"**.

### 5.4 Viewing & Editing Recorded Shift Transactions
1. Look at the bottom of the screen: the sticky bar displays **"Shift Transactions (N) · GHS XXX.XX"**.
2. Tap this bar to slide open the **Shift Transactions Drawer**.
3. Review the complete list of sales recorded during this shift.
4. **Need to fix a mistake?** If you entered the wrong volume or payment method, tap **"Edit"** on that transaction entry, adjust the numbers, and tap **"Update Transaction"**. The shift total recalculates automatically.

### 5.5 Closing the Shift
1. At the end of your shift, tap **"End Shift / Closing Readings"**.
2. Input the final physical **Closing Meter Readings** from your pump.
3. The system will calculate your total volume dispensed, expected sales, actual collections, and variance.
4. Hand over physical cash and MOMO confirmations to the Station Manager.
5. Tap **"Submit Shift for Approval"**. Once submitted, transactions are permanently locked.

---
*End of User Manual & Standard Operating Procedures.*
