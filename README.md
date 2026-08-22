# OptiCare V2 &mdash; Eye Clinic Management System

> **A Simplified, Web-Based Clinical Practice & Eyecare Management System**  
> Tailored for Optometrists, Eye Clinics, and Diagnostic Vision Centers.

---

## 📌 Project Overview

**OptiCare** is a full-stack, web-based eye clinic management system engineered to digitize and streamline the clinical and operational workflows of optometric practices. It bridges patient reception, optometric clinical refractions, diagnostic exams, live waiting queues, automated patient SMS communications, point-of-sale (POS) billing, and pharmaceutical dispensary management into a unified, secure platform.

---

## ✨ Key Features & Capabilities

### 1. 👁️ Clinical Examination & Optometric Suite
* **Visual Acuity (VA)**: Distance, Near, Unaided, and Pinhole (PH) testing for Right Eye (OD), Left Eye (OS), and Both Eyes (OU).
* **Objective & Subjective Refraction**: Sphere (SPH), Cylinder (CYL), Axis (°), Near Add, and Best Corrected Visual Acuity (BCVA) with Pupillary Distance (PD).
* **Tonometry (IOP)**: Intraocular pressure recording (NCT / Goldmann applanation) with clinical asymmetry alerts.
* **11-Structure Biomicroscopy & Ophthalmoscopy**: Structured evaluation of Lids/Lashes, Conjunctiva, Cornea, Anterior Chamber, Iris/Pupil, Lens, Vitreous, Optic Disc, Macula, Retinal Periphery, and Retinal Vessels.
* **Diagnostic Coding**: Standardized diagnosis selection with ICD-10 integration.
* **Optical Prescriptions**: Instant generation and printing of standardized optical prescriptions.

### 2. 📱 Live Waiting Queue & Automated Patient SMS
* **Real-Time Patient Flow**: Tracks patients across `waiting` &rarr; `in_progress` &rarr; `ready_for_billing` &rarr; `completed`.
* **Automated Registration SMS**: Welcomes new patients and sends their unique Patient ID.
* **Check-In Queue SMS**: Dispatches live queue position updates (*"Your queue position is #X. Please have a seat in the waiting area"*).
* **Consultation Room Call SMS**: Automatically directs patients to their assigned examination room (*"You are now being called to Consultation Room 1"*).
* **Multi-Gateway Integration**: Ready for Ghanaian SMS providers (**Arkesel**, **mNotify**, **Hubtel**) with automated local fallback logging.
* **SMS History Ledger**: Complete audit trail of all outgoing SMS communications under Tab 3 of every patient chart.

### 3. 💳 Point-of-Sale (POS) & Billing Module
* **Categorized Invoicing**: Line items for Consultations, Eye Drops, Spectacle Frames, Tonometry, and Diagnostic Tests.
* **1-Click Full Settlement**: Settle entire patient visits in a single click via **Cash**, **Mobile Money (MTN MoMo / Telecel Cash)**, **POS Card Terminal**, or **Health Insurance**.
* **Hospital Invoices & Receipts**: Official, printable patient invoices with clinic branding.
* **Automated Front-Desk Transfer**: When a doctor saves an examination, the patient is automatically transferred to the Cashier & Pharmacy counter.

### 4. 💊 Dispensary & Inventory Management
* **Catalog Management**: Tracks Medications & Eye Drops, Spectacle Frames, Contact Lens Solutions, Cases, and Clinic Consumables.
* **Quick Stepper Controls**: Rapid segmented stock adjusters (`-1`, `+1`, `+5`) and safe item deletion.
* **Clinical Alerts**: Low-stock warnings (&le; 3 units) and 30-day pharmaceutical batch expiry notifications.
* **Live Search & Category Filters**: Client-side filtering by product category and keyword.

### 5. 📋 Medical Referrals & Diagnostic Scans
* **Specialist Referral Letters**: Generate and archive formal referral letters to tertiary eye centers (e.g. Korle Bu Teaching Hospital, KATH, 37 Military Hospital) with pre-filled clinical findings.
* **File & Scan Uploads**: Secure storage for Retinal Fundus Photos, OCT Scans, and Visual Field PDF reports.

### 6. 📊 Practice Performance Analytics & Reports
* **Executive Financial KPIs**: Total Revenue Collected, Receivables Due, Total Consultations, and Patient Intake.
* **Departmental Revenue Breakdown**: Revenue distribution across Consultations, Pharmacy, Optical, and Diagnostics.
* **Cash Flow Analysis**: Payment method share (MoMo vs. Cash vs. Card vs. Insurance).
* **Official Print View**: Clean `@media print` layout for monthly practice performance reports.

### 7. 🔒 Role-Based Access Control (RBAC)
* **Admin**: Full access to all clinical records, financial reports, clinic settings, certificate renewals, and staff management.
* **Optometrist / Doctor**: Clinical examination suite, patient history, diagnostic uploads, prescription generation, and referrals.
* **Receptionist / Cashier**: Patient registration, queue check-in, cashier POS counter, bill collection, and recall reminders.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Runtime Environment** | Node.js (v18+ recommended) |
| **Server Framework** | Express 5 |
| **Database Engine** | SQLite3 via `better-sqlite3` |
| **View Engine** | EJS (Embedded JavaScript) |
| **Frontend Styling** | Modern Vanilla CSS (Design system with custom properties) |
| **Icons** | Custom Crisp Medical SVG Icons |
| **Charts & Visualizations** | Chart.js |
| **Security & Auth** | Session-based authentication (`express-session`) + `bcryptjs` password hashing |
| **File Uploads** | Multer |

---

## 🚀 Quick Start Guide

### Prerequisites
* [Node.js](https://nodejs.org/) (v18.0.0 or higher)
* `npm` (bundled with Node.js)
* Git

### Installation Steps

1. **Clone the Repository**
   ```bash
   git clone https://github.com/your-username/opticare-v2.git
   cd opticare-v2
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   ```bash
   cp .env.example .env
   ```
   *(Edit `.env` to configure your port, session secret, or Ghanaian SMS API keys).*

4. **Seed the Database**
   ```bash
   npm run seed
   ```
   *This initializes the SQLite database with 30 realistic Ghanaian patient records, inventory items, queue entries, invoices, and default user accounts.*

5. **Start the Application**
   ```bash
   npm start
   ```
   Open your browser and visit: **`http://localhost:3000`**

---

## 🔑 Default Login Credentials

| Role | Email | Password |
|---|---|---|
| **Administrator** | `admin@opticare.local` | `password123` |
| **Optometrist / Doctor** | `doctor@opticare.local` | `password123` |
| **Receptionist / Cashier** | `receptionist@opticare.local` | `password123` |

To create additional staff accounts:
```bash
node create-user.js <email> <password> <role>
# Example: node create-user.js doctor2@opticare.local pass123 doctor
```

---

## 📲 SMS Gateway Configuration

OptiCare includes built-in drivers for leading Ghanaian SMS providers. To enable live SMS delivery to physical mobile phones:

1. Open your `.env` file.
2. Add your provider's API key:

### Option A: Arkesel (Recommended)
```env
ARKESEL_API_KEY=your_arkesel_api_key_here
SMS_SENDER_ID=OptiCare
```

### Option B: mNotify
```env
MNOTIFY_API_KEY=your_mnotify_api_key_here
SMS_SENDER_ID=OptiCare
```

### Option C: Hubtel
```env
HUBTEL_CLIENT_ID=your_hubtel_client_id_here
HUBTEL_CLIENT_SECRET=your_hubtel_client_secret_here
SMS_SENDER_ID=OptiCare
```

*When no API key is provided, OptiCare automatically runs in **Simulated Gateway Mode**, logging all SMS dispatches to the database and server console without failing.*

---

## 📱 Mobile Money (MoMo) Payment Gateway Configuration

OptiCare is equipped with a direct **Ghanaian Mobile Money (USSD Push)** integration for **MTN MoMo**, **Telecel Cash**, and **AT Money**.

When a cashier clicks **"Send Mobile Money USSD Prompt to Phone"**:
1. The patient receives an instant USSD popup on their phone requesting their 4-digit PIN to authorize payment.
2. The system settles the invoice, logs the reference code, and sends an SMS payment receipt to the patient.

To connect live Mobile Money payments via **Paystack Ghana**:
```env
PAYSTACK_SECRET_KEY=sk_live_your_paystack_secret_key_here
PAYSTACK_PUBLIC_KEY=pk_live_your_paystack_public_key_here
```

*In local development / demo mode, OptiCare generates simulated transaction references (e.g. `MOMO-GH-82910`) and completes the settlement smoothly without failing.*

---

## 📁 Project Directory Structure

```text
Opticare-v2/
├── app.js               # Express application entry point & routing engine
├── db.js                # SQLite database initialization & schema migrations
├── seed-ghana.js        # Realistic Ghanaian clinical & financial demo seeder
├── create-user.js       # CLI utility for provisioning staff accounts
├── package.json         # Project dependencies and npm scripts
├── .env.example         # Template for environment configuration
├── .gitignore           # Git ignore rules for node_modules, .env, and uploads
├── public/
│   ├── css/
│   │   └── style.css    # Unified clinical design system & responsive styling
│   └── js/              # Client-side helper scripts
├── uploads/             # Destination for uploaded patient diagnostic scans
└── views/               # EJS template views
    ├── partials/
    │   └── sidebar.ejs  # Role-aware navigation sidebar
    ├── home.ejs         # Patient directory & intake registration
    ├── dashboard.ejs    # Executive analytics, cashier desk, & live triage
    ├── patient.ejs      # 5-Tab Patient Clinical Profile (Exam, Billing, SMS, Files, History)
    ├── queue.ejs        # Live Waiting Queue & Consulting Room dispatch
    ├── inventory.ejs    # Dispensary catalog, stock steppers, & expiry tracking
    ├── report.ejs       # Monthly practice analytics & financial performance report
    ├── referral.ejs     # Medical referral form
    ├── referral-print.ejs # Official printable referral letter
    ├── prescription.ejs # Standardized optical spectacle prescription (Rx)
    ├── bill-print.ejs   # Official hospital invoice & payment receipt
    ├── certificates.ejs # Clinic accreditation & certification expiry tracker
    ├── settings.ejs     # Clinic-wide configuration (Consultation fees)
    └── login.ejs        # Secure user authentication portal
```

---

## 📄 License & Academic Attribution
This software was developed as an academic and practical eye clinic management system. Distributed under the ISC License.
