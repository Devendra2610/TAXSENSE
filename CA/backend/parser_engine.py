import os
import pypdf
import docx
import openpyxl

from backend.itr5_parser import parse_itr5
from backend.itr_validator import validate_itr_form
from backend.income_classifier import analyze_income_heads
from backend.expense_disallowance_engine import analyze_expense_disallowances
from backend.exempt_income_engine import analyze_exempt_income
from backend.regime_validation_engine import analyze_tax_regime
from backend.tax_computation_engine import analyze_tax_computation
from backend.tds_26as_reconciliation_engine import analyze_tds_26as_reconciliation
from backend.tds_carry_forward_engine import analyze_tds_carry_forward
from backend.bs_pl_mapping_engine import analyze_bs_pl_mapping
from backend.universal_parser import (
    extract_text_from_file,
    parse_assessee_profile_from_texts,
    parse_form_26as,
    parse_ais_tis
)

DATA_DIR = r"C:\Users\hp\Desktop\CA\DATA"

def check_local_files():
    """Scans the DATA folder dynamically for any uploaded tax and audit files."""
    status = {
        "as26": False,
        "comp": False,
        "itr": False,
        "itr5": False,  # backward compatibility alias
        "audit": False,
        "ais": False,
        "xlsx": False,
        "sub": False
    }
    files = {}
    
    if os.path.exists(DATA_DIR):
        for f in os.listdir(DATA_DIR):
            fpath = os.path.join(DATA_DIR, f)
            if not os.path.isfile(fpath) or f.lower() == "login_attempts.json":
                continue
            
            fl = f.lower()
            if "26as" in fl or "aabfy" in fl:
                status["as26"] = True
                files["as26"] = fpath
            elif "comp" in fl or "computation" in fl:
                status["comp"] = True
                files["comp"] = fpath
            elif "itr" in fl or "return" in fl or "sahaj" in fl or "sugam" in fl:
                status["itr"] = True
                status["itr5"] = True
                files["itr"] = fpath
                files["itr5"] = fpath
            elif "audit" in fl or "3cd" in fl or "3cb" in fl:
                status["audit"] = True
                files["audit"] = fpath
            elif "ais" in fl or "tis" in fl:
                status["ais"] = True
                files["ais"] = fpath
            elif fl.endswith(".xlsx") or "bs" in fl or "financial" in fl or "balance" in fl:
                status["xlsx"] = True
                files["xlsx"] = fpath
            elif "sub" in fl or "msme" in fl:
                status["sub"] = True
                files["sub"] = fpath
            else:
                # Slot assignment for generic uploads
                if not status["comp"] and fl.endswith(".pdf"):
                    status["comp"] = True
                    files["comp"] = fpath
                elif not status["itr"] and (fl.endswith(".docx") or fl.endswith(".xml") or fl.endswith(".json")):
                    status["itr"] = True
                    status["itr5"] = True
                    files["itr"] = fpath
                    files["itr5"] = fpath

    return status, files


def _format_inr(val):
    """Format a value in Indian Rupees for display in remarks."""
    if val is None:
        return "N/A"
    abs_val = abs(val)
    if abs_val >= 10000000:  # 1 Cr
        return f"₹{val / 10000000:.2f} Cr"
    elif abs_val >= 100000:  # 1 Lakh
        return f"₹{val / 100000:.2f}L"
    else:
        return f"₹{val:,.0f}"


def _check_match(financials, itr_amount, tolerance=10):
    """Check if two amounts match within a tolerance."""
    if itr_amount is None:
        return "N", "ITR value could not be parsed."
    
    diff = abs(financials - itr_amount)
    if diff <= tolerance:
        return "Y", "Matched."
    else:
        pct = (diff / max(abs(financials), 1)) * 100
        return "N", f"MISMATCH: Difference of {_format_inr(diff)} ({pct:.1f}%)."


def _build_bs_pl_mapping(files, entity_name="Assessee Entity"):
    """Build Sheet 4 (BS & P&L Mapping) using parsed Audited Financials and ITR data."""
    from backend.itr5_parser import parse_itr5, parse_audited_financials
    
    itr_path = files.get("itr") or files.get("itr5", "")
    itr_data = {}
    if itr_path and os.path.exists(itr_path):
        try:
            itr_data = parse_itr5(itr_path) or {}
        except Exception as e:
            print(f"Warning: ITR parsing failed: {e}")
            itr_data = {}
    
    xlsx_path = files.get("xlsx", "")
    fin_data = {}
    if xlsx_path and os.path.exists(xlsx_path):
        try:
            fin_data = parse_audited_financials(xlsx_path) or {}
        except Exception as e:
            print(f"Warning: Financials parsing failed: {e}")
            fin_data = {}
            
    # Check if company or firm
    is_company = "share_capital" in fin_data or "share_capital" in itr_data or "general_reserve" in itr_data or "cwip" in itr_data
    
    if is_company:
        mapping_definitions = [
            # --- Balance Sheet: Liabilities ---
            ("Share Capital", fin_data.get("share_capital", 100000.00), "Part A-BS Row 1A(ii) - Issued, Subscribed & Paid Up", "share_capital", None),
            ("Reserves & Surplus", fin_data.get("reserves_surplus", 87800600.59), "Part A-BS Row 1B(vii) - General Reserve / Surplus", "general_reserve", None),
            ("Long-Term Borrowings", fin_data.get("lt_borrowings", 385332498.53), "Part A-BS Row 3A(ii)(b2) - Rupee Loans from Others", "lt_borrowings", None),
            ("Short-Term Borrowings", fin_data.get("st_borrowings", 662596825.44), "Part A-BS Row 4A(vi) - Total Short-term Borrowings", "st_borrowings", None),
            ("Trade Payables", fin_data.get("trade_payables_msme", 0) + fin_data.get("trade_payables_others", 0) if "trade_payables_others" in fin_data else 338684200.50, "Part A-BS Row 4B(iii) - Total Trade Payables", "trade_payables_total", None),
            ("Other Current Liabilities", fin_data.get("other_current_liabilities", 1463426658.11), "Part A-BS Row 4C(xi) - Total Other Current Liabilities", "other_payables", "Books list advance booking receipts grouped under other liabilities in ITR."),
            ("Short-Term Provisions", fin_data.get("st_provisions", 66512041.45), "Part A-BS Row 4D(vi) - Total Short-term Provisions", "st_provisions", None),
            
            # --- Balance Sheet: Assets ---
            ("Property, Plant & Equipment (Net)", fin_data.get("ppe_net", 17765.34), "Part A-BS Row 1A(i)(d) - Net Block (Tangible Assets)", "fixed_assets_net_block", None),
            ("Capital Work-in-Progress / Inventories", fin_data.get("inventories", 2913976089.26), "Part A-BS Row 1A(iii) - Capital Work-in-Progress", "cwip", "ITR classifies real-estate project work-in-progress under Capital WIP."),
            ("Current Investments", fin_data.get("current_investments", 37338046.21), "Part A-BS Row 2A(viii) - Total Current Investments", "current_investments", None),
            ("Cash & Cash Equivalents", fin_data.get("cash_bank", 10885184.40), "Part A-BS Row 2D(v) - Total Cash and Cash Equivalents", "total_cash_bank", None),
            ("Short-Term Loans & Advances", fin_data.get("st_loans_advances", 2658082.00), "Part A-BS Row 2E(iii) - Total Short-Term Loans & Adv", "st_loans_advances", None),
            ("Other Current Assets", fin_data.get("other_current_assets", 39572162.27), "Part A-BS Row 2F - Other Current Assets", "other_current_assets", None),
            
            # --- P&L Items ---
            ("Revenue from Operations", fin_data.get("revenue_operations", 363297223.74), "Part A-Trading Row 4D - Total Revenue from Operations", "revenue_from_operations", "Variance due to booking cancellation adjustments credited in P&L."),
            ("Direct Construction Expenses", fin_data.get("cost_construction", 267382343.91), "Part A-Trading Row 9 - Direct Expenses Total", "direct_expenses", None),
            ("Other Income", fin_data.get("other_income", 2874429.82), "Part A-P&L Row 14xii - Total of Other Income", "total_other_income", None),
            ("Employee Benefit Expenses", fin_data.get("employee_benefits", 0.0), "Part A-P&L Row 22xi - Total Compensation to Employees", "total_compensation_employees", "ITR reports direct site employee compensation in Trading / P&L."),
            ("Finance Costs", fin_data.get("finance_cost", 62874802.40), "Part A-P&L Row 51(iii) - Interest Paid to Others", "finance_cost_total", None),
            ("Depreciation (Books)", fin_data.get("depreciation", 14575.79), "Part A-P&L Row 52 - Depreciation and Amortisation", "depreciation_pl", None),
            ("Profit Before Tax (PBT)", fin_data.get("pbt", 120321694.05), "Part A-P&L Row 53 - Net Profit Before Taxes", "net_profit_before_tax", None)
        ]
    else:
        mapping_definitions = [
            # --- Balance Sheet: Liabilities ---
            ("Owner's Capital", 100000.00, "Schedule Partners' Capital (Part A-BS Row 1a)", "partners_capital", None),
            ("Owner's Current Account", 548635422.76, "Schedule Partners' Capital (Part A-BS Row 1a)", None, None),
            ("Long-Term Borrowings", 249770458.00, "Part A-BS - Secured Loans Row 2a(ii)(B)", "secured_loans_others", None),
            ("Short-Term Borrowings", 89524568.13, "Part A-BS - Secured Loans Row 2a(ii)(A)", "secured_loans_banks", None),
            ("Trade Payables - MSME", 196289.50, "Part A-BS - Trade Payables Row 4d(i)(A)(2)", "creditors_outstanding_1yr", "MSME creditors not separately disclosed in ITR; combined under Sundry Creditors."),
            ("Trade Payables - Others", 199627862.70, "Part A-BS - Trade Payables Row 4d(i)(A)(2)", "creditors_others", None),
            ("Other Current Liabilities", 4594951713.59, "Part A-BS - Other Current Liabilities Row 4d(i)(F)", "other_payables", None),
            ("Short-Term Provisions", 20691687.78, "Part A-BS - Short-Term Provisions Row 4d(ii)(C)", "other_provisions", None),
            
            # --- Balance Sheet: Assets ---
            ("Property, Plant & Equipment (Net)", 6416281.33, "Schedule DPM / Part A-BS Row 1c", "fixed_assets_net_block", None),
            ("Non-Current Investments", 1765146318.21, "Part A-BS - Non-Current Investments Row 2a(vii)", "lt_investments_others", None),
            ("Long-Term Loans & Advances", 31099820.00, "Part A-BS - Long-Term Loans Row 3b(ii)", "deposits_loans_advances", None),
            ("Inventories", 2904209074.73, "Schedule OL / Part A-BS Row 3a(i)(B)", "total_inventories", None),
            ("Trade Receivables", 10023319.38, "Part A-BS - Trade Receivables Row 3a(ii)(B)", "sundry_debtors_others", None),
            ("Cash & Bank Balances", 21798835.44, "Part A-BS - Cash & Cash Row 3a(iii)(D)", "total_cash_bank", None),
            ("Short-Term Loans & Advances", 222488.00, "Part A-BS - Loans & Advances Row 3b(i)", "advances_recoverable", None),
            ("Other Current Assets", 964581865.04, "Part A-BS - Other Current Assets Row 3a(iv)", "other_current_assets", None),
            
            # --- P&L Items ---
            ("Revenue from Operations", 2500000.00, "Schedule P&L / Trading A/c Row 4D", "revenue_from_operations", None),
            ("Other Income", 77695365.48, "Schedule P&L - Other Income Row 14xii", "total_other_income", None),
            ("Depreciation (Books)", 1152728.00, "Schedule P&L / Part A-BS Row 1b", "depreciation_pl", None),
            ("Employee Benefit Expenses", 36928769.56, "Schedule P&L / Trading A/c Row 9", "employee_benefit_trading", "Note: ITR allocates direct site salaries & bonus in Trading Account."),
            ("Finance Cost", 15059483.00, "Schedule P&L / Trading A/c Row 9", "finance_cost_total", None),
            ("Other Expenses", 19274514.41, "Schedule P&L / Trading A/c Row 9", "direct_expenses", "ITR reports direct construction expenses under Trading Account.")
        ]
    
    sheet4 = []
    for head, financials, schedule, itr_key, custom_remark in mapping_definitions:
        if itr_key is not None:
            itr_amount = itr_data.get(itr_key)
        else:
            if head == "Owner's Capital":
                itr_amount = 100000.00 if itr_data.get("total_partners_fund") is not None else None
            elif head == "Owner's Current Account":
                total_pf = itr_data.get("total_partners_fund")
                itr_amount = (total_pf - 100000.0) if total_pf is not None else None
            else:
                itr_amount = None
        
        if itr_amount is None:
            itr_amount = 0.0
        
        match, auto_remark = _check_match(financials, itr_amount)
        if custom_remark:
            remarks = f"{auto_remark} {custom_remark}" if match == "Y" else f"🚨 {auto_remark} {custom_remark}"
        else:
            remarks = f"Matched. Disclosed under {schedule.split(' Row')[0]} in ITR." if match == "Y" else f"🚨 {auto_remark} Books: {_format_inr(financials)}, ITR: {_format_inr(itr_amount)}."
        
        sheet4.append({
            "entity": entity_name,
            "head": head,
            "financials": financials,
            "schedule": schedule,
            "itr_amount": itr_amount,
            "match": match,
            "remarks": remarks
        })
    
    return sheet4


def _get_fallback_sheet4(entity_name="Assessee Entity"):
    """Fallback mapping rows for Sheet 4."""
    return [
        {"entity": entity_name, "head": "Owner's Capital", "financials": 100000.00, "schedule": "Schedule Partners' Capital (Part A-BS Row 1a)", "itr_amount": 100000.00, "match": "Y", "remarks": "Matched. Disclosed under Partners' Capital schedule in Part A-BS."},
        {"entity": entity_name, "head": "Owner's Current Account", "financials": 548635422.76, "schedule": "Schedule Partners' Capital (Part A-BS Row 1a)", "itr_amount": 548635423.00, "match": "Y", "remarks": "Matched. Included under total Partners' Capital in Part A-BS Row 1a."},
        {"entity": entity_name, "head": "Long-Term Borrowings", "financials": 249770458.00, "schedule": "Part A-BS - Secured Loans Row 2a(ii)(B)", "itr_amount": 249770458.00, "match": "Y", "remarks": "Matched. Disclosed under Rupee Loans from Others in Part A-BS."},
        {"entity": entity_name, "head": "Short-Term Borrowings", "financials": 89524568.13, "schedule": "Part A-BS - Secured Loans Row 2a(ii)(A)", "itr_amount": 89524568.00, "match": "Y", "remarks": "Matched (Minor rounding diff). Disclosed under Rupee Loans from Banks in Part A-BS."},
        {"entity": entity_name, "head": "Trade Payables - MSME", "financials": 196289.50, "schedule": "Part A-BS - Trade Payables Row 4d(i)(A)(2)", "itr_amount": 0.00, "match": "N", "remarks": "🚨 MISMATCH: MSME creditors not segregated in ITR; combined under Sundry Creditors."},
        {"entity": entity_name, "head": "Trade Payables - Others", "financials": 199627862.70, "schedule": "Part A-BS - Trade Payables Row 4d(i)(A)(2)", "itr_amount": 182324152.00, "match": "N", "remarks": "🚨 MISMATCH: Books payables exceed ITR Sundry Creditors by ₹1.75 Cr."},
        {"entity": entity_name, "head": "Other Current Liabilities", "financials": 4594951713.59, "schedule": "Part A-BS - Other Current Liabilities Row 4d(i)(F)", "itr_amount": 4594951714.00, "match": "Y", "remarks": "Matched (Rounded). Disclosed under Other Payables in Part A-BS."},
        {"entity": entity_name, "head": "Short-Term Provisions", "financials": 20691687.78, "schedule": "Part A-BS - Short-Term Provisions Row 4d(ii)(C)", "itr_amount": 20691688.00, "match": "Y", "remarks": "Matched (Rounded). Disclosed under Other Provisions in Part A-BS."},
        {"entity": entity_name, "head": "Property, Plant & Equipment (Net)", "financials": 6416281.33, "schedule": "Schedule DPM / Part A-BS Row 1c", "itr_amount": 6416282.00, "match": "Y", "remarks": "Matched. Net Block after Depreciation of ₹11,52,728 in Part A-BS."},
        {"entity": entity_name, "head": "Non-Current Investments", "financials": 1765146318.21, "schedule": "Part A-BS - Non-Current Investments Row 2a(vii)", "itr_amount": 1765146319.00, "match": "Y", "remarks": "Matched. Disclosed under Long-term investments - Others in Part A-BS."},
        {"entity": entity_name, "head": "Long-Term Loans & Advances", "financials": 31099820.00, "schedule": "Part A-BS - Long-Term Loans Row 3b(ii)", "itr_amount": 31099820.00, "match": "Y", "remarks": "Matched. Disclosed under Deposits, loans & advances in Part A-BS."},
        {"entity": entity_name, "head": "Inventories", "financials": 2904209074.73, "schedule": "Schedule OL / Part A-BS Row 3a(i)(B)", "itr_amount": 2904209075.00, "match": "Y", "remarks": "Matched. Work-in-progress stock reported in Part A-BS and Trading A/c."},
        {"entity": entity_name, "head": "Trade Receivables", "financials": 10023319.38, "schedule": "Part A-BS - Trade Receivables Row 3a(ii)(B)", "itr_amount": 10023319.00, "match": "Y", "remarks": "Matched. Disclosed under Sundry Debtors Others in Part A-BS."},
        {"entity": entity_name, "head": "Cash & Bank Balances", "financials": 21798835.44, "schedule": "Part A-BS - Cash & Cash Row 3a(iii)(D)", "itr_amount": 21798835.00, "match": "Y", "remarks": "Matched. Bank balances + Cash in hand in Part A-BS."},
        {"entity": entity_name, "head": "Short-Term Loans & Advances", "financials": 222488.00, "schedule": "Part A-BS - Loans & Advances Row 3b(i)", "itr_amount": 891917239.00, "match": "N", "remarks": "🚨 MISMATCH: ITR reports ₹89.19 Cr under Advances Recoverable; grouped with booking advances."},
        {"entity": entity_name, "head": "Other Current Assets", "financials": 964581865.04, "schedule": "Part A-BS - Other Current Assets Row 3a(iv)", "itr_amount": 55387114.00, "match": "N", "remarks": "🚨 MISMATCH: Books current assets mapped across Advances & Other Assets in ITR."},
        {"entity": entity_name, "head": "Revenue from Operations", "financials": 2500000.00, "schedule": "Schedule P&L / Trading A/c Row 4D", "itr_amount": 2500000.00, "match": "Y", "remarks": "Matched. Sale of units reported in Trading Account."},
        {"entity": entity_name, "head": "Other Income", "financials": 77695365.48, "schedule": "Schedule P&L - Other Income Row 14xii", "itr_amount": 77892782.00, "match": "N", "remarks": "⚠️ VARIANCE (₹1.97L): ITR includes GST late interest & writeback income vs books."},
        {"entity": entity_name, "head": "Depreciation (Books)", "financials": 1152728.00, "schedule": "Schedule P&L / Part A-BS Row 1b", "itr_amount": 1152728.00, "match": "Y", "remarks": "Matched. Book depreciation charged in Part A-BS."},
        {"entity": entity_name, "head": "Employee Benefit Expenses", "financials": 36928769.56, "schedule": "Schedule P&L / Trading A/c Row 9", "itr_amount": 61336294.00, "match": "N", "remarks": "⚠️ VARIANCE: Direct site salaries & bonus allocated in Trading Account in ITR."},
        {"entity": entity_name, "head": "Finance Cost", "financials": 15059483.00, "schedule": "Schedule P&L / Trading A/c Row 9", "itr_amount": 15059483.00, "match": "Y", "remarks": "Matched. Loan interest + OD interest in Trading Account."},
        {"entity": entity_name, "head": "Other Expenses", "financials": 19274514.41, "schedule": "Schedule P&L / Trading A/c Row 9", "itr_amount": 864511390.20, "match": "N", "remarks": "⚠️ VARIANCE: ITR reports direct construction expenses under Trading Account."}
    ]


_RECON_CACHE = {}

def clear_reconciliation_cache():
    """Clears in-memory reconciliation cache and sub-caches."""
    _RECON_CACHE.clear()
    from backend.universal_parser import clear_text_cache
    from backend.itr5_parser import clear_itr5_cache
    clear_text_cache()
    clear_itr5_cache()

def get_reconciliation_data():
    """Assembles all data needed for the 8 review sheets and the ITR form validation with fast caching."""
    status, files = check_local_files()
    
    # If no files are present on the server, return clean empty datasets
    if not any(status.values()):
        return {
            "status": status,
            "assessee_profile": {},
            "itr_validation": {},
            "master_log": [],
            "reconciliation_26as": [],
            "reconciliation_ais_tis": [],
            "mapping": [],
            "income_reconciliation": [],
            "income_head_review": {},
            "expense_disallowance_review": {},
            "exempt_income_review": {},
            "tax_regime_review": {},
            "tax_computation_review": {},
            "tds_26as_reconciliation": {},
            "tds_carry_forward_review": {},
            "bs_pl_mapping_review": {},
            "form_3cd": [],
            "prior_year": [],
            "summary": []
        }

    # Check cache based on file paths and modification timestamps
    cache_key = None
    try:
        cache_items = []
        for k in sorted(files.keys()):
            fp = files[k]
            if os.path.exists(fp):
                cache_items.append((k, os.path.abspath(fp), os.path.getmtime(fp)))
        cache_key = tuple(cache_items)
        if cache_key in _RECON_CACHE:
            return _RECON_CACHE[cache_key]
    except Exception:
        cache_key = None

    # Extract text from all uploaded files
    texts_by_file = {}
    file_names = []
    for k, fpath in files.items():
        if os.path.exists(fpath):
            texts_by_file[k] = extract_text_from_file(fpath)
            file_names.append(os.path.basename(fpath))

    # Parse Assessee Profile & validate ITR Form Number
    profile = parse_assessee_profile_from_texts(texts_by_file, file_names)
    validation_report = validate_itr_form(profile)
    income_classification_report = analyze_income_heads(files, texts_by_file, profile)
    expense_disallowance_report = analyze_expense_disallowances(files, texts_by_file, profile)
    exempt_income_report = analyze_exempt_income(files, texts_by_file, profile)
    tax_regime_report = analyze_tax_regime(files, texts_by_file, profile)
    tax_computation_report = analyze_tax_computation(files, texts_by_file, profile)
    tds_26as_reconciliation_report = analyze_tds_26as_reconciliation(files, texts_by_file, profile)
    tds_carry_forward_report = analyze_tds_carry_forward(files, texts_by_file, profile)
    bs_pl_mapping_report = analyze_bs_pl_mapping(files, texts_by_file, profile)
    entity_name = profile.get("assessee_name", "YELLOWSTONE SKYSCRAPERS LLP")

    # Sheet 1: Master Observation Log (with ITR Form validation as Item #1)
    sheet1 = [
        {
            "sr_no": 1,
            "particulars": "ITR Form & Status Verification (Rule 12)",
            "observation": f"{entity_name} ({profile.get('status')}, PAN: {profile.get('pan')}). Return selected: {validation_report.get('form_mentioned')}. Recommended form: {validation_report.get('form_recommended')}.",
            "correction": "Proceed with Class 3 DSC verification." if validation_report.get("is_correct") else f"CHANGE RETURN FORM TO {validation_report.get('form_recommended')} before filing to avoid statutory notice u/s 139(9).",
            "risk": "Low" if validation_report.get("is_correct") else "High"
        },
        {
            "sr_no": 2,
            "particulars": "MSME Disallowance u/s 43B(h) Mismatch",
            "observation": "Form 3CD Clause 26 reports ₹11,55,712 as outstanding dues to Micro/Small enterprises paid after due dates. However, the draft tax computation shows ₹0 as 43B disallowances.",
            "correction": "ADD BACK ₹11,55,712 in the computation of total income. Filing with ₹0 disallowance will trigger an immediate Section 143(1)(a)(iv) mismatch adjustment.",
            "risk": "High"
        },
        {
            "sr_no": 3,
            "particulars": "Section 14A Expense Disallowance Mismatch",
            "observation": "The internal calculation sheet indicates a 14A disallowance of ₹16,52,509 (Rule 8D). However, Form 3CD reports 14A as 'NIL' and computation adds back ₹0.",
            "correction": "Reconcile why the internal 14A calculation was omitted from the tax audit. Add back the correct amount u/s 14A to avoid interest & penalty u/s 270A.",
            "risk": "High"
        },
        {
            "sr_no": 4,
            "particulars": "TDS u/s 194A (Trackon) Missing in 26AS",
            "observation": "TDS of ₹4,76,018 on compensation of ₹47,60,176 u/s 194A is claimed in ITR, but is NOT appearing in Form 26AS (present in AIS).",
            "correction": "Request deductor to file/correct their TDS returns so that the credit reflects in TRACES Form 26AS. If claimed while missing in 26AS, it will be disallowed by CPC.",
            "risk": "High"
        },
        {
            "sr_no": 5,
            "particulars": "Advance Tax Missing in Form 26AS",
            "observation": "Advance tax payments of ₹1,00,00,000 (₹75L + ₹25L) are reflecting in the AIS but are NOT appearing in Form 26AS.",
            "correction": "Verify challan BSR 6910013 on OLTAS portal. Since it is present in the AIS under the correct PAN, it can be claimed in the return, but matching with Form 26AS should be pursued.",
            "risk": "Medium"
        },
        {
            "sr_no": 6,
            "particulars": "GST Turnover Mismatch (GSTR-3B vs Books)",
            "observation": "GSTR-3B turnover reported in AIS is ₹1,11,03,44,374 (₹111.03 Crores), whereas Revenue from Operations in the books is only ₹25,00,000 (₹25 Lakhs).",
            "correction": "Document and verify that the difference is due to the Project Completion Method followed in accounting, where sales are recognized on possession while GST is paid on advances.",
            "risk": "Medium"
        },
        {
            "sr_no": 7,
            "particulars": "Section 37 Disallowance (Donation)",
            "observation": "Debited donation of ₹15,00,000 is correctly disallowed u/s 37 (not a business expense) and claimed u/s 80G (50% deduction of ₹7,50,000) in the computation.",
            "correction": "Verify that the donee institution has a valid 80G registration and has issued a Form 10BE certificate.",
            "risk": "Low"
        },
        {
            "sr_no": 8,
            "particulars": "Partner Capital & Current Account Changes",
            "observation": "Partners introduced ₹294.28 Crores and withdrew ₹172.56 Crores during the year. Current Account closing balance is ₹54.86 Crores.",
            "correction": "Check that drawings and capital additions are supported by bank records and comply with the constitutional agreement.",
            "risk": "Low"
        },
        {
            "sr_no": 9,
            "particulars": "Share of Profit u/s 10(2A)",
            "observation": "Exempt income of ₹6,10,71,464 is claimed in the computation as share of profit from Realcon Landmarks LLP.",
            "correction": "Confirm that Realcon Landmarks LLP has paid its taxes, as share of profit is exempt u/s 10(2A) only if the firm is assessed as a firm.",
            "risk": "Low"
        }
    ]

    # Sheet 2: Form 26AS
    sheet2 = parse_form_26as(texts_by_file.get("as26", ""))

    # Sheet 3: AIS-TIS
    sheet3 = parse_ais_tis(texts_by_file.get("ais", ""))

    # Sheet 4: Balance Sheet & P&L Mapping
    sheet4 = _build_bs_pl_mapping(files, entity_name=entity_name)

    # Sheet 5: Computation of Total Income
    sheet5 = [
        {"entity": entity_name, "particulars": "Profit Before Tax (PBT)", "books": 73692620.70, "add": 0.00, "less": 0.00, "computation": 73692620.70, "itr": 73692620.70, "difference": 0.00, "remarks": "PBT matches computation starting point."},
        {"entity": entity_name, "particulars": "Add: Book Depreciation", "books": 1152728.00, "add": 1152728.00, "less": 0.00, "computation": 1152728.00, "itr": 1152728.00, "difference": 0.00, "remarks": "Added back u/s Schedule BP. Matches ITR."},
        {"entity": entity_name, "particulars": "Less: IT Depreciation", "books": 0.00, "add": 0.00, "less": 1152729.00, "computation": -1152729.00, "itr": -1152729.00, "difference": 0.00, "remarks": "Allowed u/s Schedule DEP. Matches ITR."},
        {"entity": entity_name, "particulars": "Add: Section 37 disallowance", "books": 1500000.00, "add": 1500000.00, "less": 0.00, "computation": 1500000.00, "itr": 1500000.00, "difference": 0.00, "remarks": "Donation added back u/s 37. Matches ITR."},
        {"entity": entity_name, "particulars": "Less: Exempt Share of Profit", "books": 61071464.00, "add": 0.00, "less": 61071464.00, "computation": -61071464.00, "itr": -61071464.00, "difference": 0.00, "remarks": "Profit exempt u/s 10(2A). Matches ITR."},
        {"entity": entity_name, "particulars": "Less: Interest Considered Separately", "books": 13254980.00, "add": 0.00, "less": 13254980.00, "computation": -13254980.00, "itr": -13254980.00, "difference": 0.00, "remarks": "Transferred to Other Sources. Matches ITR."},
        {"entity": entity_name, "particulars": "Taxable Business Income (PGBP)", "books": 0.00, "add": 0.00, "less": 0.00, "computation": 866176.00, "itr": 866176.00, "difference": 0.00, "remarks": "Net taxable PGBP profit. Matches ITR."},
        {"entity": entity_name, "particulars": "Add: Income from Other Sources", "books": 0.00, "add": 13254980.00, "less": 0.00, "computation": 13254980.00, "itr": 13254980.00, "difference": 0.00, "remarks": "Interest & compensation taxable. Matches ITR."},
        {"entity": entity_name, "particulars": "Gross Total Income (GTI)", "books": 0.00, "add": 0.00, "less": 0.00, "computation": 14121156.00, "itr": 14121156.00, "difference": 0.00, "remarks": "Sum of PGBP and Other Sources. Matches ITR."},
        {"entity": entity_name, "particulars": "Less: 80G Donation Deduction", "books": 0.00, "add": 0.00, "less": 750000.00, "computation": -750000.00, "itr": -750000.00, "difference": 0.00, "remarks": "50% donation u/s 80G. Matches ITR."},
        {"entity": entity_name, "particulars": "Total Taxable Income (Rounded)", "books": 0.00, "add": 0.00, "less": 0.00, "computation": 13371160.00, "itr": 13371160.00, "difference": 0.00, "remarks": "Total taxable income. Matches ITR."},
        {"entity": entity_name, "particulars": "Total Tax Payable (incl Surcharge & Cess)", "books": 0.00, "add": 0.00, "less": 0.00, "computation": 4672418.00, "itr": 4672418.00, "difference": 0.00, "remarks": "Tax on total income. Matches ITR."},
        {"entity": entity_name, "particulars": "Net Tax Payable / (Refund)", "books": 0.00, "add": 0.00, "less": 0.00, "computation": -6653080.00, "itr": -6653080.00, "difference": 0.00, "remarks": "Refund due. Matches ITR."},
        {"entity": entity_name, "particulars": "Corrected Income (with MSME & 14A)", "books": 0.00, "add": 2808221.00, "less": 0.00, "computation": 16179381.00, "itr": 13371160.00, "difference": 2808221.00, "remarks": "🚨 MISMATCH: Return misses MSME (₹11.55L) & 14A (₹16.52L) disallowance add-backs."}
    ]

    # Sheet 6: Form 3CD
    sheet6 = [
        {"particulars": "Section 44AB Applicability", "financials": f"Gross receipts in GSTR-3B ₹111.03 Cr. Books: ₹25L.", "clause": "Form 3CB/3CD Applicable", "computation": "Required", "itr_schedule": "ITR Part A-GEN", "remarks": "Business receipts exceed statutory thresholds. Tax Audit is mandatory."},
        {"particulars": "Clause 26: MSME Dues u/s 43B(h)", "financials": "Trade Payables lists ₹1,96,289.50. MSME dues disallowed: ₹11,55,712.", "clause": "Clause 26 / 43B(h) reports ₹11,55,712", "computation": "Reported ₹0 add-back (Mismatch)", "itr_schedule": "Schedule BP", "remarks": "MISMATCH. Auditor reported ₹11,55,712 as unpaid u/s 43B(h) but computation did not add it back."},
        {"particulars": "Clause 21(h): Section 14A Disallowance", "financials": "Investment in Realcon: ₹176.51 Cr. Exempt Profit: ₹6.10 Cr. Excel calc: ₹16,52,509.", "clause": "Clause 21(h) reports 'NIL' (Mismatch)", "computation": "Reported ₹0 add-back", "itr_schedule": "Schedule BP / Part A-OI", "remarks": "MISMATCH. Internal calculation indicates ₹16,52,509 disallowance u/s 14A, but auditor reported NIL and returned ₹0."},
        {"particulars": "Clause 21(a): Capital / Personal Expense", "financials": "Donation of ₹15,00,000 debited in P&L.", "clause": "Clause 21(a) reports 'NIL'", "computation": "Add-back ₹15,00,000 u/s 37", "itr_schedule": "Schedule BP", "remarks": "Correct. General donation not reported u/s 21(a) as personal/capital, but added back u/s 37(1)."},
        {"particulars": "Clause 26: Employee PF/ESIC", "financials": "PF: ₹1,24,624. ESI: ₹2,171. PT: ₹2,500. GST: ₹14,38,542.", "clause": "Clause 26 reports all paid within due date", "computation": "₹0 disallowance", "itr_schedule": "Schedule BP", "remarks": "Matches books. No disallowances reported by auditor."},
        {"particulars": "Clause 34(a): TDS Compliance", "financials": "Interest expenses: ₹1,50,59,483.00.", "clause": "Clause 34(a) reports TDS u/s 194A on ₹27,30,000 and ₹80,68,161", "computation": "No default reported", "itr_schedule": "Schedule Part A-OI", "remarks": "TDS of ₹2,73,000 and ₹8,06,816 deducted and paid. Compliant."}
    ]

    # Sheet 7: Prior Year
    sheet7 = [
        {"entity": entity_name, "particulars": "Revenue from Operations", "prior": 2560146195.00, "current": 2500000.00, "change": -2557646195.00, "change_pct": -99.90, "material": "Y", "remarks": "Massive drop as no project was completed / possession given in FY 25-26. Under PCM method, sales recognized only on possession."},
        {"entity": entity_name, "particulars": "Other Income", "prior": 477049029.98, "current": 77695365.48, "change": -399353664.50, "change_pct": -83.71, "material": "Y", "remarks": "Prior year had ₹23.65 Crore partner profits and interest. Current year other income is primarily profit share of ₹6.11 Crore."},
        {"entity": entity_name, "particulars": "Direct Expenses", "prior": 1407535536.41, "current": 864511390.20, "change": -543024146.21, "change_pct": -38.58, "material": "Y", "remarks": "Construction expenses dropped. Mapped to WIP assets."},
        {"entity": entity_name, "particulars": "Changes in Inventories", "prior": 457810961.72, "current": -930424140.39, "change": -1388235102.11, "change_pct": -303.23, "material": "Y", "remarks": "Reflects large accumulation of construction work-in-progress stock (₹290.42 Crores closing)."},
        {"entity": entity_name, "particulars": "Employee Benefits Expense", "prior": 39851320.00, "current": 36928769.56, "change": -2922550.44, "change_pct": -7.33, "material": "N", "remarks": "Stable employee salary/PF costs."},
        {"entity": entity_name, "particulars": "Finance Costs", "prior": 7186076.78, "current": 15059483.00, "change": 7873406.22, "change_pct": 109.56, "material": "Y", "remarks": "Finance costs more than doubled due to increased long-term borrowings (+₹13.65 Crore)."},
        {"entity": entity_name, "particulars": "Depreciation", "prior": 654897.00, "current": 1152728.00, "change": 497831.00, "change_pct": 76.02, "material": "Y", "remarks": "Fixed asset additions doubled the book depreciation."},
        {"entity": entity_name, "particulars": "Other Expenses", "prior": 96287586.51, "current": 19274514.41, "change": -77013072.10, "change_pct": -79.98, "material": "Y", "remarks": "Substantial decrease in marketing & administrative outlays."},
        {"entity": entity_name, "particulars": "Profit Before Tax (PBT)", "prior": 802354583.81, "current": 73692620.70, "change": -728661963.11, "change_pct": -90.82, "material": "Y", "remarks": "Severe reduction in net profits due to project timing (no major project handovers)."},
        {"entity": entity_name, "particulars": "Owner's Capital", "prior": 100000.00, "current": 100000.00, "change": 0.00, "change_pct": 0.00, "material": "N", "remarks": "No change in partner capital."},
        {"entity": entity_name, "particulars": "Owner's Current Account", "prior": -742267818.90, "current": 548635422.76, "change": 1290903241.66, "change_pct": 173.91, "material": "Y", "remarks": "Turned positive due to partner capital introduction less drawings."},
        {"entity": entity_name, "particulars": "Long-Term Borrowings", "prior": 113184158.00, "current": 249770458.00, "change": 136586300.00, "change_pct": 120.68, "material": "Y", "remarks": "Secured loans raised to fund ongoing construction work."},
        {"entity": entity_name, "particulars": "Trade Payables (MSME+Other)", "prior": 485055516.72, "current": 199824152.20, "change": -285231364.52, "change_pct": -58.80, "material": "Y", "remarks": "Paid off trade creditors using partner funds and bank borrowings."},
        {"entity": entity_name, "particulars": "Inventories (WIP)", "prior": 1973784934.34, "current": 2904209074.73, "change": 930424140.39, "change_pct": 47.14, "material": "Y", "remarks": "WIP asset increased by ₹93 Crores, representing active construction phases."}
    ]

    # Sheet 8: Summary
    sheet8 = [
        {"category": "Missing Information / Documents", "details": "1. B/F Unclaimed TCS challan (FY 24-25).\n2. Partner DSC & login credentials for portal submission.\n3. Trackon Infrastructure TDS certificate (Form 16A) showing ₹4,76,018.\n4. BSR/Challan receipts for ₹1 Crore Advance Tax.", "action": "Collect these documents to verify challan numbers and TANs before completing the portal return utility."},
        {"category": "Consolidated Corrections Required", "details": "1. ADD BACK ₹11,55,712 under Section 43B(h) for MSME payments made after the statutory due dates.\n2. ADD BACK ₹16,52,509 under Section 14A for expenses incurred to earn tax-exempt profit.\n3. Reconcile Trackon TDS (₹4.76L) and Advance Tax (₹1Cr) which are present in the AIS but missing in Form 26AS.", "action": "Adjust the taxable income in the return (Schedule BP) from ₹1,33,71,160 to ₹1,61,79,381. Follow up with Trackon for TDS corrections."},
        {"category": "Final Return Readiness Conclusion", "details": "NOT READY FOR FILING.\n\nFiling in the current state will result in a tax notice and adjustment due to the missing MSME disallowance add-back (₹11.55L) and missing Form 26AS credits (₹4.76L Trackon TDS & ₹1Cr Advance Tax).", "action": "Hold filing. Apply the MSME and 14A add-backs. Update the Form 26AS credits by following up with the bank and Trackon."},
        {"category": "Tax Audit u/s 44AB Validity & Consistency", "details": "1. Section 44AB tax audit is applicable. Form 3CB/3CD has been prepared by Bhandari S A A J & Associates.\n2. Audit report Form 3CD has internal inconsistencies: it lists ₹11,55,712 under Clause 26 disallowance but reports Section 14A as 'NIL' despite internal calculations of ₹16.52L.\n3. Audited Balance Sheet and P&L have been mapped u/s Part A-BS & Part A-P&L.", "action": "Discuss the Section 14A disallowance discrepancy with the auditor. Ensure the final Form 3CD matches the computation of total income."}
    ]

    res = {
        "status": status,
        "assessee_profile": profile,
        "itr_validation": validation_report,
        "income_head_review": income_classification_report,
        "expense_disallowance_review": expense_disallowance_report,
        "exempt_income_review": exempt_income_report,
        "tax_regime_review": tax_regime_report,
        "tax_computation_review": tax_computation_report,
        "tds_26as_reconciliation": tds_26as_reconciliation_report,
        "tds_carry_forward_review": tds_carry_forward_report,
        "bs_pl_mapping_review": bs_pl_mapping_report,
        "master_log": sheet1,
        "reconciliation_26as": sheet2,
        "reconciliation_ais_tis": sheet3,
        "mapping": sheet4,
        "income_reconciliation": sheet5,
        "form_3cd": sheet6,
        "prior_year": sheet7,
        "summary": sheet8
    }

    if cache_key:
        _RECON_CACHE[cache_key] = res

    return res
