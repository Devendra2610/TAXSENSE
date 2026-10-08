# ⚖️ TaxSense Review Portal — CA Tax Review & Audit Engine

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)]()

> **An intelligent, automated tax review and audit platform designed for Chartered Accountants (CAs) and tax professionals to streamline Income Tax Return (ITR) verification, Form 26AS/AIS reconciliation, financial statement schedule mapping, and statutory compliance checks.**

---

## 🌟 Key Features & Engines

TaxSense operates on specialized validation engines built to simulate a senior CA review workflow:

| Engine / Module | Description | Key Sections & Standards |
| :--- | :--- | :--- |
| **📋 ITR Form Check** | Validates form applicability, filing eligibility, and mandatory fields across ITR forms. | ITR-1, ITR-2, ITR-3, ITR-4, ITR-5 |
| **🏷️ Income Classification** | Segregates multi-head income and detects misclassified heads of income. | Salary, HP, PGBP, Capital Gains, Other Sources |
| **🚫 Expense Disallowance** | Flags statutory non-compliances, cash payment limits, and statutory dues delays. | Sec 40(a)(ia), 40A(3), 43B, Sec 37 |
| **🛡️ Exempt Income Check** | Verifies exemptions and checks disallowance of expenditure incurred against exempt income. | Sec 10, Sec 14A |
| **🎛️ Tax Regime Optimizer** | Compares Old vs. New Tax Regimes, calculating optimal tax outcomes and deduction impacts. | Sec 115BAC, Rebate u/s 87A |
| **🧮 Tax Computation Check** | Re-computes tax liability, surcharge tiers, health & education cess, and interest liabilities. | Sec 234A, 234B, 234C, MAT/AMT |
| **📑 26AS & AIS Reconciliation** | Automatically reconciles TDS credits reported in ITR against Form 26AS and AIS. | TDS mismatch detection |
| **🔄 TDS Carry Forward Check** | Tracks unmatched/uncredited TDS and enforces timing matching rules. | Rule 37BA compliance |
| **📊 BS & P&L Mapping** | Maps Trial Balance / Audited Financials directly to ITR Schedules. | Part A-BS & Part A-P&L |
| **📑 Excel Audit Report Generator**| Generates comprehensive multi-tab Excel reports ready for audit files and client communication. | Automated workbook export |

---

## 🏗️ Project Architecture

```plaintext
TaxSense/
├── backend/
│   ├── main.py                          # FastAPI application & REST endpoints
│   ├── auth.py                          # Whitelist auth, local login & security logs
│   ├── parser_engine.py                 # Core reconciliation orchestrator
│   ├── universal_parser.py              # Universal file extractor (PDF, DOCX, XLSX, XML)
│   ├── itr5_parser.py                   # Specialized parser for ITR-5 & financials
│   ├── itr_validator.py                 # ITR form validation rules
│   ├── income_classifier.py             # Head-wise income classifier
│   ├── expense_disallowance_engine.py   # Sec 40, 40A, 43B disallowances
│   ├── exempt_income_engine.py          # Sec 10 & 14A exemption engine
│   ├── regime_validation_engine.py      # Old vs New tax regime simulator
│   ├── tax_computation_engine.py       # Tax, surcharge, cess & interest calculation
│   ├── tds_26as_reconciliation_engine.py# Form 26AS & AIS TDS reconciliation
│   ├── tds_carry_forward_engine.py      # TDS timing & carry-forward checks
│   └── bs_pl_mapping_engine.py          # Financials to ITR schedule mapping
├── frontend/
│   ├── index.html                       # Main dashboard interface
│   ├── login.html                       # CA reviewer login portal
│   ├── style.css                        # Modern CSS styling & glassmorphism theme
│   └── app.js                           # Dashboard UI logic & API integrations
├── generate_report.py                   # Standalone Excel audit report generator
├── run.py                               # One-click desktop dashboard launcher
├── requirements.txt                     # Python package dependencies
├── .env.example                         # Template for configuration settings
└── .gitignore                           # Git ignore rules
```

---

## 🚀 Quick Start

### 1. Prerequisites
- **Python 3.10 or higher**
- **Git**

### 2. Clone the Repository
```bash
git clone https://github.com/<your-username>/<your-repo-name>.git
cd <your-repo-name>
```

### 3. Create a Virtual Environment
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux / macOS
python3 -m venv venv
source venv/bin/activate
```

### 4. Install Dependencies
```bash
pip install -r requirements.txt
```

### 5. Launch the Application
Run the one-click launcher script:
```bash
python run.py
```
> The dashboard will automatically start the FastAPI server at `http://127.0.0.1:8000` and launch in your default web browser.

---

## 🔐 Default Access Credentials

For local development and offline review, you can log in with:
- **Email:** `ca@taxsense.in`
- **Password:** `admin`

*(Additional credentials and Google OAuth whitelist settings can be configured in `backend/auth.py` or `.env`)*

---

## 🧪 Running Tests

Execute the automated test suite covering all compliance engines:
```bash
pytest
```

To run a specific engine test:
```bash
pytest test_tax_computation.py
pytest test_expense_disallowance.py
pytest test_tds_26as_reconciliation.py
```

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more details.
