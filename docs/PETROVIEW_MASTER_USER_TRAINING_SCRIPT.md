# PETROVIEW FORECOURT OS — MASTER USER TRAINING SCRIPT & FACILITATOR'S GUIDE

**Comprehensive Hands-On Training Curriculum & Role-Specific Operational Walkthrough for All Forecourt Users**

---

- **Document Version:** 2.0 (Production Release)
- **Target Audience:** Pump Attendants, Station Supervisors, OMC Head Office Executives, Super Super Admins, IT Support
- **Production Portal URL:** https://petroview.growthspheregh.com
- **Mobile Android App:** Master View Forecourt Terminal APK (master-view-latest.apk)
- **Operational Scope:** Downstream Petroleum Retail Automation, Offline-First Forecourt POS, 4-Tier RBAC, Wet-Stock & Financial Audit
- **Facilitator Method:** Interactive 'Say - Show - Do - Verify' Instructional Script with Roleplay Simulations
- **Last Updated:** October 2026

---


# Section 0: Curriculum Architecture & Facilitator Pre-Flight Setup

This master training script is an operational, interactive facilitator's guide engineered to train all users of the PetroView Forecourt Operating System (Master View). It is designed to be delivered in practical, hands-on workshops where trainees actively execute tasks on mobile phones, tablets, or forecourt desktop workstations.


## 0.1 Training Curriculum & Audience Matrix


| Target User Role | Primary Focus & Operational Modules | Target Duration | Environment & Hardware |
| --- | --- | --- | --- |
| Frontline Pump Attendants (Tier 4) | Shift opening, meter capture, rapid sales entry, 4 payment modes, drawer editing, receipt photo capture, closing readings & variance handover. | 3.5 - 4.0 Hours | Android smartphone or ruggedized handheld POS terminal running Master View APK. |
| Station Managers & Supervisors (Tier 3) | Station dashboard, 4-point shift audit & approval/query, underground tank wet-stock dipping, 37 station expense categories, rapid PIN resets, shift exports. | 6.0 - 8.0 Hours (Full Day) | Forecourt tablet (iPad/Android) or back-office laptop running Google Chrome. |
| OMC Head Office Executives (Tier 2) | Multi-station fleet rollup, corporate staff approval queue, fleet performance summaries, dynamic fuel pricing engine (NPA windows), financial exports (Excel/PDF). | 2.5 - 3.0 Hours | Executive laptop / workstation running Google Chrome or Edge. |
| Super Super Admins & IT Support (Tier 1) | Global master console, registering new OMCs, brand color theming, branch provisioning across 16 regions, global catalog management, emergency overrides, telemetry. | 3.5 - 4.0 Hours | System administrator workstation with master security clearance. |



## 0.2 Master Demo Credentials & Test Accounts

Before commencing any training session, ensure all participants have access to their training portal and use the following pre-seeded master credentials to demonstrate each functional role:


| Operational Role | System Identifier / Username | Default Access PIN | Assigned Context & Scope |
| --- | --- | --- | --- |
| Super Super Admin | SUPER-ADMIN | 7256 | Global platform master console across all OMCs |
| PetroView Head Office | PV-HQ01 | 9999 | OMC executive portal for PetroView Oil |
| GOIL Head Office | GOIL-HQ01 | 9999 | OMC executive portal for GOIL Ghana |
| Shell Head Office | SHELL-HQ01 | 9999 | OMC executive portal for Shell Ghana |
| TotalEnergies Head Office | TOTAL-HQ01 | 9999 | OMC executive portal for TotalEnergies |
| Station Manager (Supervisor) | PV-ACC-001-M | 1234 | Forecourt supervisor at Accra Central Station |
| Pump Attendant | PV-ACC-001-A | 1234 | Frontline fuel attendant at Accra Central Station (Pump 1) |



## 0.3 Equipment & Training Room Pre-Flight Checklist

- **Connectivity:** Stable Internet connection for initial app loading (though offline mode will be tested during Module 6).
- **Hardware:** At least 1 device per 2 participants (Android phone with `master-view-latest.apk` installed, or tablet/laptop with Chrome).
- **Display:** Projector or large display screen connected to the trainer's workstation.
- **Training Props:** Sample physical documents: Printed fuel pump meter tally sheet, sample cash drawer notes, sample MoMo SMS alerts, sample POS credit slips.
- **Classroom:** Whiteboard and dry-erase markers for working through the 4-Point Shift Reconciliation formula.

# Module 1: Platform Foundation, Architecture & Universal Gateway

Module 1 introduces participants to the core philosophy of PetroView Forecourt OS, explains why legacy POS systems fail on African retail stations, and walks through the Universal Authentication Gateway and Staff Self-Registration.


## 1.1 The Downstream Retail Crisis: Why PetroView Was Built


> **🗣️ FACILITATOR TALKING POINTS (SAY THIS)**
> "Welcome everyone. If you have spent even one day on a retail petroleum forecourt in Ghana or West Africa, you already know the three major nightmares that drain station profits: First, pump meter leakage and unauthorized dispensing. Second, cashiers mixing up Cash and Mobile Money collections, leading to bitter arguments at shift closing. Third, underground wet-stock shrinkage and delivery shortages from road tankers. On top of that, the cellular network often drops, leaving cloud POS systems dead while vehicles are queueing out into the street. PetroView was engineered from the ground up to solve every single one of these problems with 100% offline uptime, automated 4-point reconciliation, and strict multi-tier security."


**Core Business Concepts:** Key takeaways to emphasize to trainees:

- **Offline-First:** Zero Forecourt Downtime: Frontline attendants can open shifts, dispense fuel, and take closing meters even if fiber cables are cut and cellular data is completely off.
- **Meter-Driven Truth:** Every transaction is mathematically anchored against the physical mechanical pump registers.
- **4-Tier RBAC:** Strict division of power between Attendants (frontline), Supervisors (station audit), Head Office (corporate governance), and Super Admin (platform root).

## 1.2 The Universal Authentication Gateway & Intelligent Code Discovery

PetroView uses a single, unified entry portal. Users do not need to hunt for different login pages or pick roles from confusing dropdowns. The system automatically inspects the employee code signature and routes them to their exact operational terminal.


> **🖥️ LIVE SYSTEM DEMONSTRATION (SHOW THIS ON PROJECTOR / SCREEN)**
> 1. Open Chrome and navigate to https://petroview.growthspheregh.com (or tap Master View APK on Android).
> 2. Observe the clean login screen displaying the MVP Petroleum logo and secure PIN entry keypad.
> 3. In the 'Employee Code' field, type 'SUPER-ADMIN' and enter PIN '7256' -> Point out that it routes to the Master Console.
> 4. Log out and type 'PV-HQ01' with PIN '9999' -> Point out that it routes directly to the Head Office Dashboard.
> 5. Log out and type 'PV-ACC-001-M' with PIN '1234' -> Point out that it routes directly to the Supervisor Operations Dashboard.
> 6. Log out and type 'PV-ACC-001-A' with PIN '1234' -> Point out that it routes directly to the Attendant Forecourt Terminal.



> **✍️ HANDS-ON PARTICIPANT EXERCISE (TRAINEES DO THIS NOW)**
> 1. Open your assigned device or browser window.
> 2. Practice signing in with your designated role credentials from the Master Demo Table.
> 3. Verify that your top header displays your employee name and correct station assignment.
> 4. Toggle the Theme switch (sun/moon icon in top bar) to observe High-Glare Sunlight White vs Slate-950 Night Forecourt Dark Mode.



## 1.3 Frontline Staff Self-Registration & The Mandatory Approval Gate

One of the biggest bottlenecks on retail stations is waiting days for IT to create attendant accounts when staff rotate. PetroView allows attendants and supervisors to register themselves in 30 seconds directly at the forecourt terminal, while enforcing a tamper-proof corporate approval gate to eliminate rogue accounts.


> **🖥️ LIVE SYSTEM DEMONSTRATION (SHOW THIS ON PROJECTOR / SCREEN)**
> 1. On the login screen, click the 'Staff Registration' tab.
> 2. In the 'Company (OMC)' dropdown, select 'PetroView Oil'.
> 3. In the 'Station Branch' dropdown, select 'Accra Central Station'.
> 4. Under 'Role', select 'Pump Attendant'.
> 5. Observe the 'Auto-Assigned Employee Code' field: Notice how the system dynamically allocates the next sequential code (e.g. PV002A or PV-ACC-002-A).
> 6. Enter Full Name: 'Kwame Asante', Phone Number: '0244987654', Assigned Pump: 'Pump 1 - Island A'.
> 7. Enter a 4-digit PIN: '1234' and confirm PIN: '1234'.
> 8. Click 'Create Account'.
> 9. A green success confirmation appears showing Kwame's permanent code.
> 10. Switch back to the 'Sign In' tab and attempt to sign in immediately with the new code.
> 11. POINT OUT TO CLASS: A prominent warning banner appears: 'Account Pending Approval. Your account must be approved by Station Manager or Head Office before you can sign in.'



> **🗣️ FACILITATOR TALKING POINTS (SAY THIS)**
> "Notice what just happened! Kwame registered himself in under 30 seconds. He received an official standardized company code. However, he CANNOT touch the pump or record any sales until his Station Manager or Head Office reviews his profile and clicks 'Approve'. This completely prevents ghost attendants, unauthorized cash handling, or disgruntled former staff from logging in."



> **❓ KNOWLEDGE CHECK & COMPREHENSION VERIFICATION**
> • Question: What happens if an attendant types their PIN incorrectly 5 times in a row?
>   Expected Correct Answer: PetroView triggers an automatic 15-minute brute-force cryptographic lockout. The Station Manager or Head Office can override this by clicking 'Reset PIN' in staff management.

> • Question: Can an attendant log in immediately after completing the self-registration form?
>   Expected Correct Answer: No. All self-registered staff are placed in PENDING APPROVAL status until explicitly approved by the Station Manager or OMC Head Office.

> • Question: Why does PetroView offer both Light and Dark themes?
>   Expected Correct Answer: The Light theme provides high contrast for bright outdoor sunlight glare on the forecourt island, while the Slate-950 Dark theme eliminates blinding screen glare and preserves device battery during nighttime shifts.




# Module 2: Pump Attendant Masterclass (Tier 4 Frontline Operations)

This is the heart of forecourt revenue collection. Frontline pump attendants operate in high-speed, noisy, cash-intensive conditions. This module trains attendants to open shifts with zero meter errors, enter sales in under 5 seconds, manage all 4 payment modes, correct mistakes before shift submission, and execute seamless shift handovers.


## 2.1 Shift Initialization & Opening Cumulative Meter Readings


> **🗣️ FACILITATOR TALKING POINTS (SAY THIS)**
> "Attendants, listen carefully: The most critical rule on any petroleum forecourt is this: 'Never pump a single drop of fuel without your opening meter locked in the system.' If your opening meter is recorded as 10,000 litres, but the physical pump meter is actually sitting at 12,000 litres, you will end up with an unexplainable 2,000-litre shortage at the end of the day. Always walk to your physical pump island, look at the mechanical totalizer, and input the exact figures into PetroView before starting."



> **🖥️ LIVE SYSTEM DEMONSTRATION (SHOW THIS ON PROJECTOR / SCREEN)**
> 1. Log in as Pump Attendant using 'PV-ACC-001-A' and PIN '1234'.
> 2. The screen displays 'Start New Shift' with assigned station 'Accra Central' and pump 'Pump 1 - Island A'.
> 3. Tap 'Start New Shift' to open the Meter Readings capture screen.
> 4. Notice the assigned fuel nozzles: PMS Super and AGO Diesel.
> 5. Enter Opening Meter for PMS Super: '12450.50'.
> 6. Enter Opening Meter for AGO Diesel: '8920.00'.
> 7. Point out the decimal accuracy: Always record two decimal places if your electronic/mechanical pump provides it.
> 8. Tap 'Confirm Opening Readings & Open Shift'.
> 9. System transitions immediately to the active Forecourt Sales Terminal.



> **✍️ HANDS-ON PARTICIPANT EXERCISE (TRAINEES DO THIS NOW)**
> 1. Log in to your training terminal as Attendant 'PV-ACC-001-A'.
> 2. Open a new shift on Pump 1.
> 3. Record Opening Meter: PMS = 15000.00 L, AGO = 22000.00 L.
> 4. Confirm and verify that the Sales Terminal loads with active fuel buttons.



## 2.2 Rapid Fuel Dispense Entry (Sales Screen)

The PetroView Sales Screen is engineered for high-speed, one-handed operation. Attendants can log a sale in 3 taps:


> **🖥️ LIVE SYSTEM DEMONSTRATION (SHOW THIS ON PROJECTOR / SCREEN)**
> 1. Examine the Fuel Product Buttons at the top: 'PMS Super · GHS 14.80/L' and 'AGO Diesel · GHS 15.20/L'.
> 2. Emphasize that the unit price in GHS/L is dynamically pulled from Head Office in real-time.
> 3. Tap 'PMS Super'.
> 4. Point out the Quick Volume Presets: '5L', '10L', '20L', '50L'.
> 5. Tap '20L' -> Observe the Total Amount field automatically calculates: 20L × GHS 14.80 = GHS 296.00.
> 6. Clear and demonstrate Custom Litres: Type '35.5' -> Total Amount calculates: GHS 525.40.
> 7. Clear and demonstrate Quick Cash Amount: If a customer hands you GHS 200 cash, type '200' in Amount -> System calculates exact volume: 13.51 Litres.



## 2.3 Multi-Channel Payment Processing: The 4 Payment Modes

PetroView natively supports all 4 standard payment methods used on modern forecourts. The facilitator must conduct a dedicated hands-on drill for each method:


| Payment Mode | When to Use | Key Information Required | Financial Destination |
| --- | --- | --- | --- |
| CASH | Customer pays in physical paper currency (GHS notes/coins). | Tendered cash amount; change is calculated automatically. | Attendant physical cash pouch / station cash drawer. |
| MOMO (Mobile Money) | Customer pays via MTN MoMo, Telecel Cash, or AT Money. | Customer phone number and network Transaction ID (e.g. MTN-849201). | OMC Merchant Bank Account (electronic settlement). |
| CARD (POS Terminal) | Customer pays using Visa, Mastercard, or GhIPSS Gh-Link debit card. | Bank POS terminal authorization approval code. | OMC Bank Merchant Settlement. |
| CREDIT (B2B Fleet) | Commercial corporate fleet vehicle with pre-approved credit voucher. | Vehicle registration number (e.g. GN 4821-22), fleet company name, voucher code. | OMC Corporate Accounts Receivable Ledger. |



> **✍️ HANDS-ON PARTICIPANT EXERCISE (TRAINEES DO THIS NOW)**
> Execute the following 4 consecutive sales drills on your terminal:
> Drill A (Cash): Select PMS Super, enter 20L, tap CASH, tap 'Record Dispense'.
> Drill B (MoMo): Select AGO Diesel, enter 45L, tap MOMO, enter Ref 'MTN-89210', tap 'Record Dispense'.
> Drill C (Card): Select PMS Super, enter 15L, tap CARD, enter Ref 'POS-7741', tap 'Record Dispense'.
> Drill D (Fleet Credit): Select AGO Diesel, enter 80L, tap CREDIT, enter Vehicle 'GT 3341-24', Account 'Unilever Logistics', tap 'Record Dispense'.



## 2.4 The Shift Transactions Drawer & Pre-Submission Editing


> **🗣️ FACILITATOR TALKING POINTS (SAY THIS)**
> "Now, what happens if an attendant accidentally types 50 litres instead of 5 litres, or taps CASH when the customer actually paid with MoMo? In old legacy systems, attendants had to call the manager to void the bill, or worse, they kept silent and had a huge cash shortage at closing. In PetroView, we have the Shift Transactions Drawer! Look at the bottom of your screen: there is a sticky bar that says 'Shift Transactions (4) · GHS X,XXX.XX'. Let's tap it right now."



> **🖥️ LIVE SYSTEM DEMONSTRATION (SHOW THIS ON PROJECTOR / SCREEN)**
> 1. Tap the bottom sticky bar 'Shift Transactions (4)'.
> 2. The drawer slides open, displaying all 4 recorded transactions with timestamps, fuel badges, volumes, and payment types.
> 3. Find Transaction #2 (AGO Diesel 45L). Tap the 'Edit' pencil icon next to it.
> 4. Change the volume from 45L to 40L, and change the payment mode from MOMO to CASH.
> 5. Tap 'Update Transaction'.
> 6. Observe the shift running total and payment breakdown recalculate instantaneously!
> 7. Point out the 'Delete' trash can icon: Explain that accidental ghost entries can be removed while the shift is OPEN.



## 2.5 Attaching Physical Proof (Camera Receipt Capture)


> **🖥️ LIVE SYSTEM DEMONSTRATION (SHOW THIS ON PROJECTOR / SCREEN)**
> 1. On the Sales Screen, tap the 'Capture Receipt' camera button.
> 2. Demonstrate snapping a photo of a physical POS merchant receipt or MoMo confirmation SMS.
> 3. Add a quick note: 'Fleet credit voucher for GT 3341-24 attached'.
> 4. Tap 'Save Receipt Attachment'.
> 5. Point out that the supervisor can view this image directly during their shift review, preventing disputes.



## 2.6 Shift Ending, Closing Meter Capture & Live Variance Reconciliation


> **🗣️ FACILITATOR TALKING POINTS (SAY THIS)**
> "It is now the end of your 8-hour shift. The relief attendant has arrived. It is time to close your pump. This is where PetroView protects you. The system will take your opening meters, ask for your closing meters, calculate the exact volume pumped, multiply by the unit price, and compare it with the money you collected. Let's see how the 4-point math works live on screen."



> **🖥️ LIVE SYSTEM DEMONSTRATION (SHOW THIS ON PROJECTOR / SCREEN)**
> 1. On the Attendant Dashboard, tap 'End Shift / Closing Readings'.
> 2. Enter Closing Meter for PMS Super: '12495.50' (Net volume pumped: 45.00 L).
> 3. Enter Closing Meter for AGO Diesel: '9040.00' (Net volume pumped: 120.00 L).
> 4. Tap 'Continue to Shift Variance Check'.
> 5. Point out the prominent Variance Banner at the top:
>    - If payments match metered sales exactly: Green banner 'Reconciled — no variance (GHS 0.00)'.
>    - If cash collected is less than metered sales: Amber banner 'Variance: -GHS 25.00 (Shortage)'.
>    - If cash collected is greater than metered sales: Amber banner 'Variance: +GHS 10.00 (Over)'.
> 6. If a variance exists, enter an explanatory closing note: 'GHS 25 shortage due to customer drive-off on nozzle 2 — supervisor alerted'.
> 7. Tap 'Submit Shift for Approval'.



> **⚠️ FIELD PITFALL & RECOVERY: ATTEMPTING TO EDIT A SHIFT AFTER SUBMISSION**
> Common Field Mistake: Attendants submitting a shift and then realizing they made an error in their closing meter readings.
> Official Resolution & Recovery: Once a shift is submitted, it transitions to CLOSED status and all transactions are cryptographically locked. The attendant CANNOT modify it. Only the Station Supervisor can query or reject the shift with an audit note to allow corrections.



> **❓ KNOWLEDGE CHECK & COMPREHENSION VERIFICATION**
> • Question: Can an attendant edit a transaction after recording it?
>   Expected Correct Answer: Yes, as long as the shift is still OPEN. They simply open the Shift Transactions Drawer, tap Edit on the transaction, adjust the volume or payment mode, and tap Update.

> • Question: What mathematical formula does PetroView use to determine shift variance?
>   Expected Correct Answer: Variance = Actual Collections (Cash + MoMo + Card + Credit) - Expected Metered Sales [(Closing Meter - Opening Meter) × Unit Price].

> • Question: What should an attendant do if they have an unavoidable cash shortage at closing?
>   Expected Correct Answer: They must enter a detailed explanatory note in the 'Closing Note' textarea before tapping 'Submit Shift for Approval', and immediately notify their Station Supervisor.




# Module 3: Station Manager & Forecourt Supervisor Masterclass (Tier 3 Operations)

Station Managers and Forecourt Supervisors are the operational commanders of the retail station. They oversee all pump islands, sign off on attendant shifts, take underground tank wet-stock dippings, manage station petty cash expenses, and handle staff credentials. This module trains supervisors on every aspect of forecourt oversight.


## 3.1 Supervisor Dashboard Navigation & Morning Routine


> **🖥️ LIVE SYSTEM DEMONSTRATION (SHOW THIS ON PROJECTOR / SCREEN)**
> 1. Log in as Station Manager using 'PV-ACC-001-M' and PIN '1234'.
> 2. The Supervisor Dashboard loads, displaying station 'Accra Central Station'.
> 3. Highlight the 4 Key Metric Cards across the top:
>    - Today's Station Throughput (Total Litres Dispensed across all pumps).
>    - Gross Revenue (GHS) & Payment Breakdown (Cash, MoMo, Card, Credit).
>    - Active Shifts vs Pending Reviews (Yellow badge alerting to submitted shifts).
>    - Underground Wet-Stock Tank Levels (PMS & AGO current dip volume).



## 3.2 The 4-Point Shift Audit & Verification Protocol


> **🗣️ FACILITATOR TALKING POINTS (SAY THIS)**
> "Supervisors, your primary responsibility at the end of every shift is the 4-Point Audit. When an attendant hands you their cash pouch, MoMo printouts, and credit vouchers, you do not just pocket the money. You sit at your terminal, open their submitted shift, and verify the four corners of truth: Meter Delta, Unit Price Value, Actual Collections, and Net Variance. Let's inspect Kwame's submitted shift right now."



> **🖥️ LIVE SYSTEM DEMONSTRATION (SHOW THIS ON PROJECTOR / SCREEN)**
> 1. Navigate to the 'Shifts' tab on the bottom/sidebar navigation.
> 2. Locate the shift with yellow badge 'CLOSED' submitted by Attendant 'PV-ACC-001-A'.
> 3. Tap on the shift card to open the 'Supervisor Shift Detail Screen'.
> 4. Walk through the 4-Point Verification Section:
>    - Point 1 (Meter Throughput): Verify Opening 12450.50 L vs Closing 12495.50 L -> Net 45.00 L PMS.
>    - Point 2 (Expected Revenue): 45.00 L × GHS 14.80 = GHS 666.00 Expected.
>    - Point 3 (Actual Collections): Cash GHS 200 + MoMo GHS 608 + Card GHS 222 + Credit GHS 1,216.
>    - Point 4 (Variance Calculation): Verify over/short indicator.
> 5. Review any attached receipt photos and attendant notes.
> 6. Case A (Approval): Type supervisor note 'All cash and MoMo verified against bank merchant SMS. Shift balanced.' -> Click 'Approve Shift'.
> 7. Case B (Rejection / Query): If GHS 50 cash is missing without explanation, type 'Shortage of GHS 50 unresolved — attendant queried' -> Click 'Reject / Query Shift'.



## 3.3 Underground Tank Wet-Stock Dipping (Wet-Stock Management)


> **🗣️ FACILITATOR TALKING POINTS (SAY THIS)**
> "Now let's talk about the fuel under your feet. Many stations lose thousands of litres each month to underground tank leaks, temperature shrinkage, or road tanker offloading shortfalls. PetroView has a dedicated Wet-Stock Tank Dippings module where supervisors log morning opening dips, evening closing dips, and fuel tanker deliveries."



> **🖥️ LIVE SYSTEM DEMONSTRATION (SHOW THIS ON PROJECTOR / SCREEN)**
> 1. Navigate to the 'Tank Dippings' tab on the supervisor portal.
> 2. The screen displays active station underground tanks: Tank 1 (PMS Super) and Tank 2 (AGO Diesel).
> 3. Tap 'Record Daily Tank Dip'.
> 4. For Tank 1 (PMS Super):
>    - Enter Physical Dipstick Level: '142.5' cm.
>    - Enter Calibrated Dip Volume: '28,450' Litres.
>    - Enter Fuel Received from Tanker: If a 13,500L tanker discharged today, enter '13500' (else '0').
> 5. For Tank 2 (AGO Diesel):
>    - Enter Physical Dipstick Level: '110.0' cm.
>    - Enter Calibrated Dip Volume: '22,100' Litres.
> 6. Enter Notes: 'Water finding paste applied — zero water contamination detected'.
> 7. Tap 'Save & Sync Tank Readings'.
> 8. Demonstrate switching to the 'History' tab to inspect historical dip trends and identify wet-stock losses.



## 3.4 Forecourt Expense Logging & Petty Cash Control

Stations incur daily operational expenses: generator diesel during power cuts, station cleaning supplies, NPA inspection fees, staff meals, and minor pump nozzle repairs. PetroView includes a comprehensive expense logging system with 37 pre-seeded standardized expense categories and real-time net cash reconciliation.


> **🖥️ LIVE SYSTEM DEMONSTRATION (SHOW THIS ON PROJECTOR / SCREEN)**
> 1. Navigate to the 'Expenses' tab on the supervisor dashboard.
> 2. Observe the Net Cash Reconciliation Header:
>    - Gross Station Sales (GHS) - Cash Drawer Expenses (GHS) = Net Bankable Cash (GHS).
> 3. Tap 'Record New Expense'.
> 4. Demonstrate the 37 Standard Categories Dropdown: generator fuel, pump maintenance, electricity bill, water utility, security patrol, staff meals, cleaning detergents, etc.
> 5. Select 'Generator Fuel (Diesel)'.
> 6. Enter Amount: 'GHS 150.00'.
> 7. Select Payment Source: 'Cash Drawer' (or 'Petty Cash' / 'Bank MoMo').
> 8. Enter Payee: 'Station Generator Tank' and Reference: 'GEN-REC-041'.
> 9. Tap 'Record Expense'.
> 10. Point out how the Net Bankable Cash immediately deducts GHS 150.00, ensuring the manager deposits the exact correct cash into the bank.



## 3.5 Attendant Administration & Rapid Forecourt PIN Resets


> **🖥️ LIVE SYSTEM DEMONSTRATION (SHOW THIS ON PROJECTOR / SCREEN)**
> 1. Navigate to the 'Attendants' tab.
> 2. Point out the staff roster: View employee codes, active shift status, and approval badges.
> 3. Demonstrate approving a newly registered attendant: Tap the green checkmark 'Approve Staff'.
> 4. Demonstrate a Rapid PIN Reset: An attendant forgets their PIN. Tap 'Reset PIN' on their card, enter temporary PIN '1234', and tap 'Save'.
> 5. Demonstrate unlocking an attendant who triggered the 5-strike security lockout.



## 3.6 Shift Reports & Period Audits (PDF / Excel Export)


> **🖥️ LIVE SYSTEM DEMONSTRATION (SHOW THIS ON PROJECTOR / SCREEN)**
> 1. In the Shifts screen or Expenses screen, locate the Export Toolbar.
> 2. Select Date Range: 'Today', 'Last 7 Days', or 'Custom Range'.
> 3. Click 'Export to Excel (.xlsx)' -> Generates a formatted spreadsheet with shift totals, meter logs, and payment breakdowns.
> 4. Click 'Export to PDF' -> Generates a print-ready audit document complete with supervisor sign-off lines.



> **❓ KNOWLEDGE CHECK & COMPREHENSION VERIFICATION**
> • Question: What are the 4 points in the Supervisor 4-Point Shift Reconciliation?
>   Expected Correct Answer: 1. Meter Delta (Closing - Opening = Litres Dispensed), 2. Expected Sales (Litres × Unit Price), 3. Actual Collections (Cash + MoMo + Card + Credit), 4. Shift Variance (Actual - Expected).

> • Question: How does recording an expense from 'Cash Drawer' affect the supervisor's bank deposit?
>   Expected Correct Answer: It automatically deducts the expense amount from gross cash collections, giving the exact Net Bankable Cash to be deposited into the station bank account.

> • Question: Can a supervisor reset an attendant's forgotten PIN without calling the Head Office?
>   Expected Correct Answer: Yes! The Station Manager can open the Attendants screen and click 'Reset PIN' to set a temporary 4-digit PIN on the spot.




# Module 4: OMC Head Office Executive Masterclass (Tier 2 Corporate Governance)

OMC Head Office Executives (Managing Directors, Operations Directors, and Regional Retail Managers) oversee an entire network of stations (e.g. 10 to 100+ stations). This module trains corporate executives to monitor multi-station revenue rollups, approve staff across the company, dynamically change fuel prices for NPA windows, and export financial audits.


## 4.1 Multi-Station Fleet Rollup & Executive Telemetry


> **🖥️ LIVE SYSTEM DEMONSTRATION (SHOW THIS ON PROJECTOR / SCREEN)**
> 1. Log in as OMC Head Office using 'PV-HQ01' and PIN '9999'.
> 2. The Executive Dashboard loads, automatically scoped to 'PetroView Oil' (or your OMC).
> 3. Walk through the Executive Overview Tab:
>    - Total Company Sales Volume (Litres) across all stations.
>    - Gross Merchandise Value (GHS Revenue).
>    - Payment Tender Distribution: Cash vs Mobile Money vs Card vs B2B Credit.
>    - Active Station Stations Grid: Online/Offline status, active shift count, and unreviewed shift alerts.



## 4.2 Corporate Staff Approval Queue & Access Revocation


> **🗣️ FACILITATOR TALKING POINTS (SAY THIS)**
> "At the head office level, compliance is everything. You cannot have unvetted attendants handling company fuel and cash. The Approvals Tab consolidates every self-registered attendant and supervisor across all your stations nationwide. Let's see how simple it is to verify and approve staff."



> **🖥️ LIVE SYSTEM DEMONSTRATION (SHOW THIS ON PROJECTOR / SCREEN)**
> 1. Click the 'Approvals' tab.
> 2. Review pending staff cards displaying Employee Name, Assigned Station, Role, and Contact Phone.
> 3. Click 'Approve' to instantly activate the employee code across the entire forecourt network.
> 4. Switch to the 'Staff' tab to view all company employees.
> 5. Demonstrate employee deactivation: If an employee leaves the company, click 'Deactivate / Delete' to revoke forecourt access immediately across all terminals.



## 4.3 Fleet-Wide Staff Performance & Productivity League Tables


> **🖥️ LIVE SYSTEM DEMONSTRATION (SHOW THIS ON PROJECTOR / SCREEN)**
> 1. Click the 'Summaries' tab.
> 2. Select Date Presets: 'Today', 'Last 7 Days', 'Last 30 Days', or 'Custom Range'.
> 3. Examine the Attendant Productivity League Table:
>    - Attendant Name and Station Branch.
>    - Total Shifts Completed.
>    - Total Fuel Volume Dispensed (Litres).
>    - Total Revenue Collected (GHS).
>    - Cash Accuracy % & Total Variance Discrepancies.
> 4. Explain how this data is used for monthly attendant commission bonuses and identifying training needs.



## 4.4 Dynamic Fuel Pricing Engine (NPA Window Management)


> **🗣️ FACILITATOR TALKING POINTS (SAY THIS)**
> "In Ghana, the National Petroleum Authority (NPA) reviews fuel prices every two weeks (the 1st and 16th of each month). In the old days, head office had to send WhatsApp messages to every station manager, who then manually reprogrammed pumps, leading to hours of delayed pricing and huge revenue losses. With PetroView's Dynamic Pricing Engine, Head Office updates the price once in the portal, and it pushes in real-time to every pump keypad in the country."



> **🖥️ LIVE SYSTEM DEMONSTRATION (SHOW THIS ON PROJECTOR / SCREEN)**
> 1. Click the 'Products & Fuel Pricing' tab.
> 2. Review active company fuel catalog: PMS Super, AGO Diesel, DPK Kerosene, LPG.
> 3. Click 'Edit' next to PMS Super.
> 4. Change Price per Litre from 'GHS 14.80' to 'GHS 15.10'.
> 5. Click 'Save Product'.
> 6. Emphasize: Every active forecourt terminal under this OMC will immediately pull the new GHS 15.10/L rate without restarting the app.
> 7. Explain Historical Shift Protection: Any shift opened BEFORE the price change retains its original price, ensuring past accounting is never corrupted!



## 4.5 Executive Audits & Financial Exports (Excel & PDF)


> **🖥️ LIVE SYSTEM DEMONSTRATION (SHOW THIS ON PROJECTOR / SCREEN)**
> 1. In the Summaries or Overview tab, locate the Export Bar.
> 2. Select date range for the monthly financial close.
> 3. Click 'Export to Excel (.xlsx)' -> Generates a multi-station workbook with detailed shift sheets, payment reconciliations, and variance tables.
> 4. Click 'Export to PDF' -> Generates an executive board report with company branding, ready for executive committee and GRA/NPA tax compliance.



> **❓ KNOWLEDGE CHECK & COMPREHENSION VERIFICATION**
> • Question: What happens to ongoing shifts on the forecourt when Head Office updates the fuel price?
>   Expected Correct Answer: Active shifts currently open retain their opening transaction rates; all newly opened shifts and newly recorded transactions immediately adopt the new price schedule, protecting historical accounting integrity.

> • Question: Can Head Office deactivate an attendant who was caught stealing at a station?
>   Expected Correct Answer: Yes. In the Staff tab, clicking 'Deactivate' revokes the attendant's credentials instantly across all terminals nationwide.




# Module 5: Super Super Admin Masterclass (Tier 1 Platform Owner)

The Super Super Admin represents the root platform owner (GrowthSphere Africa / PetroView engineering team or national platform administrator). This role provisions new Oil Marketing Companies, configures brand visual identities, sets up station branches across Ghana's 16 regions, and monitors system-wide telemetry.


## 5.1 Global Master Console & Multi-Tenant Telemetry


> **🖥️ LIVE SYSTEM DEMONSTRATION (SHOW THIS ON PROJECTOR / SCREEN)**
> 1. Log in as Super Super Admin using 'SUPER-ADMIN' and PIN '7256'.
> 2. The Master Console loads, displaying cross-company network telemetry:
>    - Total Registered OMCs (e.g. PetroView, GOIL, Shell, TotalEnergies, Star Oil).
>    - Total Station Branches across Ghana.
>    - Total Active Shifts nationwide.
>    - Cumulative Fuel Volume (L) and GMV (GHS) processed through the platform.
>    - Global Sync Queue Health & Database Status.



## 5.2 Onboarding a New Oil Marketing Company (OMC)


> **🖥️ LIVE SYSTEM DEMONSTRATION (SHOW THIS ON PROJECTOR / SCREEN)**
> 1. Click the 'Companies' tab.
> 2. Click the 'Register New Company (OMC)' button.
> 3. Fill in the New Company Modal:
>    - Company Legal Name: 'Star Oil Ghana Ltd'.
>    - Company Short Code: 'STAR'.
>    - Executive Admin Name: 'Director of Retail Operations'.
>    - Contact Phone: '0302123456'.
>    - Primary Brand Color Hex: '#EAB308' (Gold/Yellow) and Accent: '#CA8A04'.
>    - Initial Station Branch Name: 'Star Oil - Kasoa Central'.
>    - Region: 'Central Region'.
> 4. Click 'Save Company'.
> 5. Observe: System automatically provisions Head Office Admin Code 'STAR-HQ01' with default PIN '9999'.
> 6. Demonstrate printing the Onboarding Credential Receipt to hand to the OMC Executive.



## 5.3 Provisioning Station Branches Across Ghana's 16 Regions


> **🖥️ LIVE SYSTEM DEMONSTRATION (SHOW THIS ON PROJECTOR / SCREEN)**
> 1. In the Companies tab, expand any registered OMC.
> 2. Click 'Add Station Branch'.
> 3. Enter Station Name (e.g. 'Tema Community 1 Station'), Location ('Tema Harbour Road'), Region ('Greater Accra'), Pump Count ('6 Pumps').
> 4. Click 'Create Station'.
> 5. The station is immediately available for attendants and supervisors to select during self-registration.



## 5.4 Universal Product Catalog Management


> **🖥️ LIVE SYSTEM DEMONSTRATION (SHOW THIS ON PROJECTOR / SCREEN)**
> 1. Click the 'Products' tab.
> 2. Point out the Global Catalog: Super Super Admin can create universal fuel, lubricant, LPG, and car-care products.
> 3. Demonstrate filtering by 'All Companies (Global)' vs selecting a specific OMC.
> 4. Demonstrate creating a new product: 'Super V-Power' under FUEL category @ GHS 16.50/L.
> 5. Save and assign to targeted OMCs.



## 5.5 Global Staff Fleet Administration & Emergency Overrides


> **🖥️ LIVE SYSTEM DEMONSTRATION (SHOW THIS ON PROJECTOR / SCREEN)**
> 1. Click the 'Staff' tab.
> 2. Point out that the Super Admin can search any employee across all OMCs nationwide.
> 3. Demonstrate performing an emergency PIN reset or emergency account deactivation if an OMC Head Office account is compromised.



# Module 6: Offline Resilience, Sync Queue & Field Troubleshooting

Forecourt technology fails when developers assume reliable 4G internet. PetroView is built offline-first. This module trains supervisors and technical leads on how local IndexedDB storage works, how the background sync queue operates, and provides step-by-step playbooks for 7 critical forecourt emergencies.


## 6.1 Understanding Offline-First Architecture (Dexie.js IndexedDB)


> **🗣️ FACILITATOR TALKING POINTS (SAY THIS)**
> "Let's make this crystal clear to everyone in the room: When an attendant taps 'Record Dispense', that sale does NOT have to travel over the cellular network to an overseas cloud server before saving. It saves instantly in under 15 milliseconds inside the device's local database (Dexie.js IndexedDB). This means that even if a cellular mast catches fire or there is a complete nationwide fiber cut, your forecourt NEVER stops dispensing fuel!"



## 6.2 The Background Sync Queue & Sync Status Indicators


> **🖥️ LIVE SYSTEM DEMONSTRATION (SHOW THIS ON PROJECTOR / SCREEN)**
> 1. Point out the Sync Status Indicator in the top header:
>    - Green Cloud with Checkmark: 100% Synced with cloud server.
>    - Yellow Cloud with Pulsing Dot: Pending Sync (mutations queued locally in Dexie.js).
>    - Red Cloud with Warning Triangle: Sync Error / Offline retry mode.
> 2. Navigate to the 'Sync' screen.
> 3. Review the pending mutations queue (Shifts, Sales, Tank Readings, Expenses).
> 4. Demonstrate the 'Sync Now' button: Forces an immediate push of all local queued events.



## 6.3 Field Emergency Troubleshooting Playbooks

The facilitator must drill trainees on the following 7 standard operating recovery playbooks:


> **⚠️ FIELD PITFALL & RECOVERY: PLAYBOOK 1: ATTENDANT FORGOT THEIR 4-DIGIT PIN**
> Common Field Mistake: Attendant arrives for morning shift and cannot remember their PIN.
> Official Resolution & Recovery: Station Supervisor logs into the Supervisor portal, navigates to the 'Attendants' tab, finds the attendant, clicks 'Reset PIN', sets temporary PIN '1234', and instructs the attendant to sign in immediately.



> **⚠️ FIELD PITFALL & RECOVERY: PLAYBOOK 2: ATTENDANT KEYED IN WRONG OPENING METER READING**
> Common Field Mistake: Attendant typed 10,000L instead of 12,000L when opening their shift.
> Official Resolution & Recovery: If the shift is still newly opened with zero sales, the attendant can close the shift immediately or notify the supervisor. The supervisor queries the shift, documents the meter correction in the audit log, and opens a corrected shift.



> **⚠️ FIELD PITFALL & RECOVERY: PLAYBOOK 3: ATTENDANT RECORDED CASH SALE INSTEAD OF MOBILE MONEY**
> Common Field Mistake: Customer paid via MTN MoMo, but the attendant accidentally tapped the 'CASH' button.
> Official Resolution & Recovery: As long as the shift is OPEN, the attendant simply opens the bottom 'Shift Transactions Drawer', locates the transaction, taps 'Edit', changes the payment mode from CASH to MOMO, enters the MoMo transaction ID, and taps 'Update Transaction'.



> **⚠️ FIELD PITFALL & RECOVERY: PLAYBOOK 4: CLOSING SHIFT SHOWS SIGNIFICANT CASH SHORTAGE (> GHS 50)**
> Common Field Mistake: At closing, actual cash collected is GHS 1,450, but expected metered sales is GHS 1,520 (GHS 70 shortage).
> Official Resolution & Recovery: The attendant must enter an explanatory closing note detailing the discrepancy. When the supervisor reviews the shift, they inspect physical pump meters and receipt evidence. If unresolved, the supervisor clicks 'Reject / Query Shift' with audit notes, triggering station management dispute protocol.



> **⚠️ FIELD PITFALL & RECOVERY: PLAYBOOK 5: FORECOURT TABLET OR PHONE LOSES POWER MID-SHIFT**
> Common Field Mistake: Device battery dies completely while vehicle dispensing is ongoing.
> Official Resolution & Recovery: Because all data is saved locally in IndexedDB, connect the device to a charger or power bank. When restarted, open PetroView; the active shift and all recorded transactions restore immediately without any data loss.



> **⚠️ FIELD PITFALL & RECOVERY: PLAYBOOK 6: NETWORK DROPS COMPLETELY DURING FUEL DISPENSING**
> Common Field Mistake: Cellular internet cuts out during peak evening rush hour.
> Official Resolution & Recovery: Do NOT panic or stop pumping! Continue entering sales normally. PetroView saves every transaction locally and queues them. The yellow 'Pending Sync' badge will display. Once network restores, the sync queue pushes all records automatically.



> **⚠️ FIELD PITFALL & RECOVERY: PLAYBOOK 7: NPA ANNOUNCES FUEL PRICE CHANGE MID-SHIFT**
> Common Field Mistake: NPA gazettes a new price window taking effect at midnight during an ongoing night shift.
> Official Resolution & Recovery: Head Office updates the price in the portal. Any ongoing active shift continues calculating sales using its opening schedule. When the attendant closes at 6:00 AM, the morning shift opens with the new price schedule, preventing cross-pricing confusion.



# Module 7: Hands-On Roleplay Simulations & Trainee Certification Matrix

To guarantee 100% operational readiness, the facilitator must divide participants into pairs (Attendant & Supervisor) and execute the following 4 realistic simulation drills before signing off on certification.


## 7.1 Simulation Exercise 1: Frontline Attendant Full Shift Lifecycle

- **Step 1:** Sign in with employee code and 4-digit PIN.
- **Step 2:** Enter Opening Meters: PMS Super = 18,200.00 L, AGO Diesel = 25,400.00 L.
- **Step 3:** Record 4 diverse transactions (Cash, MoMo, Card, Fleet Credit).
- **Step 4:** Open the Shift Transactions Drawer and edit Transaction #2 to correct volume.
- **Step 5:** Snap a photo of sample payment proof via Receipt Capture.
- **Step 6:** Enter Closing Meters: PMS = 18,245.00 L (45L pumped), AGO = 25,520.00 L (120L pumped).
- **Step 7:** Inspect variance banner, type closing note, and submit shift for approval.

## 7.2 Simulation Exercise 2: Supervisor 4-Point Audit & Wet-Stock Dipping

- **Step 1:** Log in as Station Manager and locate the submitted shift.
- **Step 2:** Execute the 4-Point Reconciliation (Meter Delta vs Unit Price vs Collections vs Variance).
- **Step 3:** Enter review audit notes and click 'Approve Shift'.
- **Step 4:** Navigate to Tank Dippings and log opening dip readings for Tank 1 and Tank 2.
- **Step 5:** Log a GHS 120 generator fuel expense from Cash Drawer and verify Net Bankable Cash.
- **Step 6:** Export shift audit sheet to Excel and PDF.

## 7.3 Trainee Competency Evaluation Matrix & Sign-Off Checklist

The facilitator must evaluate and check off each trainee on the following 10 mandatory competencies before issuing certified forecourt operator status:


| # | Core Operational Competency | Passing Criteria & Verification Requirement | Evaluator Sign-Off |
| --- | --- | --- | --- |
| 1 | Universal Login & PIN Security | Trainee logs in successfully, manages PIN security, and toggles Light/Dark modes. | [  ] PASS  /  [  ] FAIL |
| 2 | Staff Self-Registration | Trainee completes self-registration and understands the Pending Approval gate. | [  ] PASS  /  [  ] FAIL |
| 3 | Shift Opening & Meter Capture | Trainee enters opening mechanical pump meters with correct decimal accuracy. | [  ] PASS  /  [  ] FAIL |
| 4 | High-Speed Dispense Entry | Trainee logs fuel sales using presets and custom keypad within 5 seconds. | [  ] PASS  /  [  ] FAIL |
| 5 | Multi-Payment Handling | Trainee successfully executes Cash, MoMo, Card, and B2B Credit transactions. | [  ] PASS  /  [  ] FAIL |
| 6 | Shift Drawer Pre-Submission Edit | Trainee locates a miskeyed transaction in the drawer and corrects volume/method. | [  ] PASS  /  [  ] FAIL |
| 7 | Shift Closing & Variance Reconciliation | Trainee takes closing meters, explains variance calculation, and submits shift. | [  ] PASS  /  [  ] FAIL |
| 8 | Supervisor 4-Point Audit | Supervisor trainee audits shift numbers and executes Approve / Query workflow. | [  ] PASS  /  [  ] FAIL |
| 9 | Wet-Stock Tank Dippings & Expenses | Supervisor trainee logs physical tank dip levels and categorizes station expenses. | [  ] PASS  /  [  ] FAIL |
| 10 | Offline Resilience & Troubleshooting | Trainee explains local IndexedDB offline storage and handles lost PIN / dead device. | [  ] PASS  /  [  ] FAIL |


**Official Certification Sign-Off:** 

____________________________________________           ____________________________________________
Facilitator Signature / Date                              Station Manager / OMC Lead Signature

