"""
Senior Chartered Accountant & Income Tax Return (ITR) Form Validation Engine
Implements CBDT-notified ITR form applicability rules (ITR-1 through ITR-7) up to AY 2026-27.
"""

from typing import Dict, Any, List, Optional, Tuple
import re

def determine_recommended_itr_form(profile: Dict[str, Any]) -> Tuple[str, List[str], Optional[str]]:
    """
    Determines the legally mandated ITR Form Number based on the assessee's profile
    and returns (recommended_form, list_of_reasons, risk_note).
    """
    status = (profile.get("status") or "Individual").strip()
    res_status = (profile.get("residential_status") or "Resident").strip()
    heads = profile.get("heads_of_income", {}) or {}
    total_income = float(profile.get("total_income") or 0.0)
    ag_income = float(profile.get("agricultural_income") or 0.0)
    
    # Flags
    has_salary = bool(heads.get("salary", False) or (isinstance(heads.get("salary"), (int, float)) and heads.get("salary") > 0))
    has_house_prop = bool(heads.get("house_property", False) or (isinstance(heads.get("house_property"), (int, float)) and heads.get("house_property") != 0))
    hp_count = int(profile.get("house_property_count", 1 if has_house_prop else 0))
    hp_loss_cf = bool(profile.get("hp_loss_carried_forward", False))
    
    has_cap_gains = bool(heads.get("capital_gains", False) or (isinstance(heads.get("capital_gains"), (int, float)) and heads.get("capital_gains") != 0))
    cg_only_112a = bool(profile.get("cg_only_112a", False))
    ltcg_112a_amt = float(profile.get("ltcg_112a_amount", 0.0))
    cg_loss_cf = bool(profile.get("cg_loss_carried_forward", False))
    
    has_business = bool(heads.get("business", False) or (isinstance(heads.get("business"), (int, float)) and heads.get("business") != 0))
    is_presumptive = bool(profile.get("is_presumptive", False))
    is_firm_partner = bool(profile.get("is_firm_partner", False))
    has_fo_trading = bool(profile.get("has_fo_trading", False))
    has_speculative = bool(profile.get("has_speculative", False))
    
    has_other_sources = bool(heads.get("other_sources", False) or (isinstance(heads.get("other_sources"), (int, float)) and heads.get("other_sources") != 0))
    has_winnings = bool(profile.get("has_winnings_or_lottery", False))
    
    is_director = bool(profile.get("is_director", False))
    has_unlisted_shares = bool(profile.get("has_unlisted_shares", False))
    has_foreign_assets = bool(profile.get("has_foreign_assets", False) or profile.get("has_foreign_income", False))
    has_losses_cf = bool(profile.get("has_losses_cf", False) or hp_loss_cf or cg_loss_cf)
    is_194n_tds = bool(profile.get("has_194n_tds", False))
    is_80iac_esop = bool(profile.get("has_80iac_esop", False))
    is_portuguese_code = bool(profile.get("is_portuguese_code", False))
    
    status_lower = status.lower()
    reasons = []

    # 1. Check for ITR-7 (Trusts, Political Parties, Specified Institutions)
    if any(k in status_lower for k in ["trust", "political party", "university", "college", "institution", "139(4a)", "139(4b)", "139(4c)", "139(4d)"]) or profile.get("is_section_11_12", False):
        reasons.append("Assessee is a Trust, Political Party, or Institution claiming exemption under Section 11/12 or required to file return under Section 139(4A)/(4B)/(4C)/(4D).")
        return "ITR-7", reasons, None

    # 2. Check for ITR-5 (Partnership Firms, LLPs, AOP, BOI, Society, etc.)
    is_llp = "llp" in status_lower or "limited liability partnership" in status_lower or "llp" in (profile.get("assessee_name") or "").lower()
    is_firm = "firm" in status_lower or "partnership" in status_lower or profile.get("pan_4th_char") == 'F'
    is_aop_boi = any(k in status_lower for k in ["aop", "boi", "association of persons", "body of individuals", "society", "cooperative", "artificial juridical"])
    
    if is_llp or is_aop_boi or (is_firm and not is_presumptive and total_income > 5000000) or (is_firm and is_llp) or profile.get("pan_4th_char") in ["F", "A", "B", "T", "J", "L"]:
        if is_llp:
            reasons.append("Assessee is a Limited Liability Partnership (LLP) registered under the LLP Act, 2008.")
            reasons.append("LLPs are explicitly excluded from ITR-1, ITR-2, ITR-3, and ITR-4 (Rule 12(1)(ca)). ITR-5 is mandatory.")
        elif is_firm and not is_presumptive:
            reasons.append("Assessee is a Partnership Firm maintaining regular books / audited under Section 44AB.")
            reasons.append("Partnership firms not eligible or not opting for presumptive scheme u/s 44AD/44ADA must file ITR-5.")
        else:
            reasons.append(f"Assessee status is '{status}' (AOP/BOI/Firm/Entity other than Individual, HUF, Company, or Trust).")
            reasons.append("Under Rule 12(1)(d), all firms, LLPs, AOPs, and BOIs must file ITR-5.")
        return "ITR-5", reasons, None

    # 3. Check for ITR-6 (Companies)
    if ("company" in status_lower or "corporate" in status_lower or profile.get("pan_4th_char") == "C") and not is_llp and profile.get("pan_4th_char") != 'F':
        reasons.append("Assessee is a Company incorporated under the Companies Act / Section 2(17) of the Income Tax Act.")
        reasons.append("Companies (except those claiming exemption u/s 11) must compulsorily file ITR-6 with digital signature.")
        return "ITR-6", reasons, None

    # 4. Check for Partnership Firm (Non-LLP) under Presumptive Scheme -> ITR-4
    if is_firm and not is_llp and is_presumptive and total_income <= 5000000 and not has_foreign_assets and not is_director and not has_unlisted_shares and not has_losses_cf:
        reasons.append("Assessee is a Resident Partnership Firm (other than LLP) having presumptive income under Section 44AD/44AE/44ADA with Total Income <= ₹50 Lakh.")
        return "ITR-4", reasons, None

    # 5. Individuals and HUFs
    # Check ITR-3 vs ITR-4 vs ITR-2 vs ITR-1
    is_individual_or_huf = any(k in status_lower for k in ["individual", "huf", "hindu undivided family"]) or profile.get("pan_4th_char") in ["P", "H"]
    
    # Case A: Business or Profession income exists (PGBP)
    if has_business or is_firm_partner or has_fo_trading or has_speculative:
        # Check if eligible for ITR-4 (Sugam)
        can_use_itr4 = True
        itr4_disqualifications = []

        if res_status not in ["Resident", "Resident and Ordinarily Resident", "ROR"]:
            can_use_itr4 = False
            itr4_disqualifications.append(f"Residential status is '{res_status}' (ITR-4 is only for ROR Residents).")

        if total_income > 5000000:
            can_use_itr4 = False
            itr4_disqualifications.append(f"Total income (₹{total_income:,.2f}) exceeds the statutory limit of ₹50 Lakh.")

        if not is_presumptive or is_firm_partner or has_fo_trading or has_speculative:
            can_use_itr4 = False
            if is_firm_partner:
                itr4_disqualifications.append("Assessee has income as a partner in a partnership firm (remuneration/interest/share of profit), which requires ITR-3.")
            elif has_fo_trading or has_speculative:
                itr4_disqualifications.append("Assessee has F&O (Futures & Options) trading or Speculative business income, which cannot be reported in ITR-4.")
            else:
                itr4_disqualifications.append("Business/Profession income is computed on regular books of account or audited u/s 44AB (not under Section 44AD/44ADA/44AE presumptive schemes).")

        if has_cap_gains:
            # LTCG 112A exception: up to 1.25L with no loss (AY 2025-26+)
            if not (cg_only_112a and ltcg_112a_amt <= 125000 and not cg_loss_cf):
                can_use_itr4 = False
                itr4_disqualifications.append("Capital Gains reported beyond the limited Section 112A LTCG exemption threshold.")

        if is_director:
            can_use_itr4 = False
            itr4_disqualifications.append("Assessee holds Directorship in a company.")

        if has_unlisted_shares:
            can_use_itr4 = False
            itr4_disqualifications.append("Assessee held unlisted equity shares during the previous year.")

        if has_foreign_assets:
            can_use_itr4 = False
            itr4_disqualifications.append("Assessee holds foreign assets, foreign bank accounts, or earned foreign income.")

        if has_losses_cf:
            can_use_itr4 = False
            itr4_disqualifications.append("Brought forward or carried forward losses are present.")

        if ag_income > 5000:
            can_use_itr4 = False
            itr4_disqualifications.append(f"Agricultural income (₹{ag_income:,.2f}) exceeds ₹5,000.")

        if can_use_itr4:
            reasons.append("Resident Individual/HUF having presumptive business/profession income u/s 44AD/44ADA/44AE with Total Income <= ₹50 Lakh.")
            reasons.append("No disqualifying conditions (no director status, no unlisted shares, no foreign assets, no capital gains disqualification).")
            return "ITR-4", reasons, None
        else:
            reasons.append("Assessee has Income from Business or Profession (PGBP).")
            for dq in itr4_disqualifications:
                reasons.append(f"Excluded from ITR-4: {dq}")
            reasons.append("ITR-3 is the legally mandated form for Individuals/HUFs having business/profession income.")
            return "ITR-3", reasons, None

    # Case B: No Business Income -> Check ITR-1 vs ITR-2
    can_use_itr1 = True
    itr1_disqualifications = []

    if res_status not in ["Resident", "Resident and Ordinarily Resident", "ROR"]:
        can_use_itr1 = False
        itr1_disqualifications.append(f"Residential status is '{res_status}' (ITR-1 is restricted to Ordinarily Resident individuals).")

    if "huf" in status_lower:
        can_use_itr1 = False
        itr1_disqualifications.append("Assessee is a Hindu Undivided Family (HUF). ITR-1 is restricted strictly to Individuals.")

    if total_income > 5000000:
        can_use_itr1 = False
        itr1_disqualifications.append(f"Total Income of ₹{total_income:,.2f} exceeds the ₹50 Lakh ceiling for ITR-1.")

    if hp_count > 2 or hp_loss_cf:
        can_use_itr1 = False
        if hp_count > 2:
            itr1_disqualifications.append(f"Income reported from {hp_count} house properties (exceeds allowable properties for ITR-1).")
        if hp_loss_cf:
            itr1_disqualifications.append("Brought forward house property loss exists.")

    if has_cap_gains:
        # LTCG 112A exception: up to 1.25L with no loss (AY 2025-26+)
        if not (cg_only_112a and ltcg_112a_amt <= 125000 and not cg_loss_cf):
            can_use_itr1 = False
            itr1_disqualifications.append("Capital Gains reported (STCG/LTCG) other than limited Section 112A allowance.")

    if is_director:
        can_use_itr1 = False
        itr1_disqualifications.append("Assessee is a Director in an Indian or foreign company.")

    if has_unlisted_shares:
        can_use_itr1 = False
        itr1_disqualifications.append("Assessee holds investment in unlisted equity shares.")

    if has_foreign_assets:
        can_use_itr1 = False
        itr1_disqualifications.append("Assessee has foreign assets, foreign income, or signing authority in overseas accounts.")

    if has_winnings:
        can_use_itr1 = False
        itr1_disqualifications.append("Income from lottery, horse races, or online games (taxable at special rates).")

    if ag_income > 5000:
        can_use_itr1 = False
        itr1_disqualifications.append(f"Agricultural income (₹{ag_income:,.2f}) exceeds the ₹5,000 threshold.")

    if has_losses_cf:
        can_use_itr1 = False
        itr1_disqualifications.append("Brought forward or carried forward losses claimed in return.")

    if is_194n_tds:
        can_use_itr1 = False
        itr1_disqualifications.append("Tax deducted at source under Section 194N for high-value cash withdrawals.")

    if is_80iac_esop:
        can_use_itr1 = False
        itr1_disqualifications.append("Deferred tax on ESOPs from eligible start-up under Section 80-IAC.")

    if is_portuguese_code:
        can_use_itr1 = False
        itr1_disqualifications.append("Income subject to apportionment as per Portuguese Civil Code.")

    if can_use_itr1:
        reasons.append("Resident Individual with Total Income <= ₹50 Lakh.")
        reasons.append("Income comprised solely of Salary/Pension, House Property (<=2), and Other Sources (excluding casual winnings).")
        reasons.append("No capital gains, no directorship, no unlisted shares, no foreign assets, and agricultural income <= ₹5,000.")
        return "ITR-1", reasons, None
    else:
        reasons.append("Assessee has no Income from Business or Profession (PGBP).")
        for dq in itr1_disqualifications:
            reasons.append(f"Excluded from ITR-1 (Sahaj): {dq}")
        reasons.append("ITR-2 is the legally mandated form for Individuals/HUFs without business income having capital gains, foreign assets, directorship, or income > ₹50 Lakh.")
        return "ITR-2", reasons, None


def validate_itr_form(profile: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validates the ITR Form mentioned in the return against the profile extracted
    from the computation of total income. Returns the full structured report.
    """
    form_mentioned = (profile.get("form_mentioned") or profile.get("form_selected") or "ITR-5").strip().upper()
    if not form_mentioned.startswith("ITR-"):
        form_mentioned = f"ITR-{form_mentioned}"

    recommended_form, reasons, custom_risk = determine_recommended_itr_form(profile)
    
    is_correct = (form_mentioned == recommended_form)
    validation_result = "✅ Correct Form Used" if is_correct else "❌ Incorrect Form Used"

    # Construct Risk / Consequence Note
    if is_correct:
        risk_note = "Compliant. The return form selected matches the CBDT statutory applicability criteria under Rule 12 of the Income-tax Rules, 1962."
    else:
        risk_note = (
            f"HIGH RISK — DEFECTIVE RETURN NOTICE u/s 139(9). Filing in {form_mentioned} instead of mandated {recommended_form} "
            f"will result in the return being treated as defective under Section 139(9) or invalid by CPC Bangalore, triggering "
            f"statutory notices, loss of carried-forward losses, and potential penal interest u/s 234A/B/C."
        )

    # Format 5 Heads of Income detailed breakdown
    heads_dict = profile.get("heads_of_income", {})
    salary_amt = float(profile.get("salary_income") or 0.0)
    hp_amt = float(profile.get("house_property_income") or 0.0)
    pgbp_amt = float(profile.get("business_income") or 0.0)
    cg_amt = float(profile.get("capital_gains_income") or 0.0)
    os_amt = float(profile.get("other_sources_income") or 0.0)
    exempt_amt = float(profile.get("exempt_income") or 0.0)
    ag_amt = float(profile.get("agricultural_income") or 0.0)

    has_sal = bool(heads_dict.get("salary") or salary_amt > 0)
    has_hp = bool(heads_dict.get("house_property") or hp_amt != 0)
    has_biz = bool(heads_dict.get("business") or pgbp_amt != 0)
    has_cg = bool(heads_dict.get("capital_gains") or cg_amt != 0)
    has_os = bool(heads_dict.get("other_sources") or os_amt != 0)

    heads_breakdown = [
        {
            "head_no": 1,
            "head_code": "salary",
            "name": "Income from Salaries",
            "present": has_sal,
            "amount": salary_amt,
            "applicability_rule": "Permitted in ITR-1, ITR-2, ITR-3, ITR-4. Excluded from ITR-5, ITR-6 (corporate/firm entities)."
        },
        {
            "head_no": 2,
            "head_code": "house_property",
            "name": "Income from House Property",
            "present": has_hp,
            "amount": hp_amt,
            "applicability_rule": "ITR-1 allows single property (no b/f loss). Multiple properties or b/f losses mandate ITR-2/3/5/6."
        },
        {
            "head_no": 3,
            "head_code": "business",
            "name": "Profits & Gains of Business / Profession (PGBP)",
            "present": has_biz,
            "amount": pgbp_amt,
            "applicability_rule": "STRICT DISQUALIFIER for ITR-1 & ITR-2. Mandates ITR-3 (Individuals), ITR-4 (Presumptive <=50L), ITR-5 (LLP/Firm), or ITR-6 (Company)."
        },
        {
            "head_no": 4,
            "head_code": "capital_gains",
            "name": "Capital Gains (STCG / LTCG)",
            "present": has_cg,
            "amount": cg_amt,
            "applicability_rule": "DISQUALIFIER for ITR-1 & ITR-4 (except Sec 112A <=1.25L). Mandates ITR-2 (non-business), ITR-3, ITR-5, or ITR-6."
        },
        {
            "head_no": 5,
            "head_code": "other_sources",
            "name": "Income from Other Sources",
            "present": has_os,
            "amount": os_amt,
            "applicability_rule": "Permitted across all ITRs. Special rate winnings (lottery/online games) exclude ITR-1 & ITR-4."
        }
    ]

    heads_found = []
    if has_sal: heads_found.append(f"Salary / Pension (₹{salary_amt:,.2f})")
    if has_hp: heads_found.append(f"House Property (₹{hp_amt:,.2f})")
    if has_biz: heads_found.append(f"Profits & Gains of Business / PGBP (₹{pgbp_amt:,.2f})")
    if has_cg: heads_found.append(f"Capital Gains (₹{cg_amt:,.2f})")
    if has_os: heads_found.append(f"Other Sources (₹{os_amt:,.2f})")
    if exempt_amt > 0: heads_found.append(f"Exempt Income u/s 10(2A) (₹{exempt_amt:,.2f})")
    if ag_amt > 0: heads_found.append(f"Agricultural Income (₹{ag_amt:,.2f})")

    if not heads_found:
        heads_found.append("Income from Other Sources / Business as per computation")

    special_conds = []
    if profile.get("is_director"): special_conds.append("Director in an Indian/Foreign Company")
    if profile.get("has_unlisted_shares"): special_conds.append("Holds Unlisted Equity Shares")
    if profile.get("has_foreign_assets"): special_conds.append("Foreign Assets / Overseas Accounts (Schedule FA)")
    if profile.get("is_presumptive"): special_conds.append("Presumptive Scheme u/s 44AD / 44ADA / 44AE")
    if profile.get("is_firm_partner"): special_conds.append("Partner in a Partnership Firm")
    if profile.get("has_tax_audit"): special_conds.append("Mandatory Tax Audit u/s 44AB (Form 3CB/3CD)")
    if profile.get("has_losses_cf"): special_conds.append("Brought Forward / Carried Forward Losses")
    if profile.get("has_winnings_or_lottery"): special_conds.append("Special Rate Casual Winnings / Lottery")
    if not special_conds: special_conds.append("None / Standard Disclosures")

    return {
        "assessee_name": profile.get("assessee_name", "Unknown Assessee"),
        "pan": profile.get("pan", "N/A"),
        "assessment_year": profile.get("assessment_year", "2026-27"),
        "status": profile.get("status", "Individual"),
        "residential_status": profile.get("residential_status", "Resident"),
        "heads_of_income_list": heads_found,
        "heads_breakdown": heads_breakdown,
        "total_income": float(profile.get("total_income", 0.0)),
        "gross_total_income": float(profile.get("gross_total_income", 0.0)),
        "exempt_income": exempt_amt,
        "agricultural_income": ag_amt,
        "special_conditions": special_conds,
        "form_mentioned": form_mentioned,
        "form_recommended": recommended_form,
        "validation_result": validation_result,
        "verdict_code": "COMPLIANT" if is_correct else "DEFECTIVE_MISMATCH",
        "is_correct": is_correct,
        "reasoning": reasons,
        "risk_note": risk_note
    }
