import os
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

from backend.parser_engine import get_reconciliation_data

def create_itr_review_report():
    wb = openpyxl.Workbook()
    # Remove default sheet
    default_sheet = wb.active
    wb.remove(default_sheet)

    # Styles
    navy_fill = PatternFill(start_color="1B365D", end_color="1B365D", fill_type="solid")
    light_blue_fill = PatternFill(start_color="F2F6FC", end_color="F2F6FC", fill_type="solid")
    zebra_fill = PatternFill(start_color="F9FBFD", end_color="F9FBFD", fill_type="solid")
    
    header_font = Font(name="Arial", size=10, bold=True, color="FFFFFF")
    title_font = Font(name="Arial", size=14, bold=True, color="1B365D")
    data_font = Font(name="Arial", size=9, bold=False, color="000000")
    bold_data_font = Font(name="Arial", size=9, bold=True, color="000000")
    
    # Border definitions
    thin_side = Side(style='thin', color='CCCCCC')
    double_bottom = Side(style='double', color='1B365D')
    thick_top = Side(style='thin', color='1B365D')
    
    border_all = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)
    border_total = Border(top=thick_top, bottom=double_bottom)
    
    # Fills for cells
    fill_unverifiable = PatternFill(start_color="FFF9E6", end_color="FFF9E6", fill_type="solid")
    fill_risk_high = PatternFill(start_color="FCE8E6", end_color="FCE8E6", fill_type="solid")
    fill_risk_medium = PatternFill(start_color="FEF3D6", end_color="FEF3D6", fill_type="solid")
    fill_risk_low = PatternFill(start_color="E6F4EA", end_color="E6F4EA", fill_type="solid")
    
    font_risk_high = Font(name="Arial", size=9, bold=True, color="C5221F")
    font_risk_medium = Font(name="Arial", size=9, bold=True, color="B06000")
    font_risk_low = Font(name="Arial", size=9, bold=True, color="137333")

    # Fetch reconciliation data dynamically
    data = get_reconciliation_data()
    profile = data.get("assessee_profile", {})
    val_report = data.get("itr_validation", {})
    
    entity_name = profile.get("assessee_name", "YELLOWSTONE SKYSCRAPERS LLP")
    pan_no = profile.get("pan", "AABFY8239Q")
    ay = profile.get("assessment_year", "2026-27")

    # ----------------------------------------------------
    # Sheet 0: ITR Form Validation (Rule 12)
    # ----------------------------------------------------
    sheet0 = wb.create_sheet(title="ITR Form Validation")
    sheet0.views.sheetView[0].showGridLines = True
    
    sheet0.cell(row=2, column=2, value=entity_name).font = Font(name="Arial", size=12, bold=True, color="1B365D")
    sheet0.cell(row=3, column=2, value=f"PAN: {pan_no} | Status: {profile.get('status', 'LLP')} | AY: {ay}").font = Font(name="Arial", size=9, italic=True, color="555555")
    sheet0.cell(row=4, column=2, value="Senior CA ITR Form Applicability & Rule 12 Validation").font = title_font
    
    val_rows = [
        ["Assessee Name", entity_name],
        ["PAN & Entity Classification", f"{pan_no} ({profile.get('status', 'LLP')})"],
        ["Residential Status", profile.get("residential_status", "Resident")],
        ["Heads of Income Identified", "\n".join(val_report.get("heads_of_income_list", ["Business & Other Sources"]))],
        ["Total Taxable Income", f"₹{val_report.get('total_income', 0.0):,.2f}"],
        ["Special Tax Conditions", "\n".join(val_report.get("special_conditions", ["Standard"]))],
        ["ITR Form Mentioned in Return", val_report.get("form_mentioned", "ITR-5")],
        ["ITR Form Recommended by Law", val_report.get("form_recommended", "ITR-5")],
        ["Statutory Validation Result", val_report.get("validation_result", "✅ Correct Form Used")],
        ["Statutory Reasoning & Rule Citations", "\n".join(val_report.get("reasoning", []))],
        ["Notice / Defective Return Risk", val_report.get("risk_note", "Compliant")]
    ]
    
    start_r = 6
    for idx, (param, val) in enumerate(val_rows):
        r = start_r + idx
        c1 = sheet0.cell(row=r, column=2, value=param)
        c2 = sheet0.cell(row=r, column=3, value=val)
        
        c1.fill = light_blue_fill
        c1.font = bold_data_font
        c1.border = border_all
        c1.alignment = Alignment(vertical="top")
        
        c2.font = data_font
        c2.border = border_all
        c2.alignment = Alignment(vertical="top", wrap_text=True)
        
        if "Validation Result" in param:
            c2.font = font_risk_low if "Correct" in str(val) else font_risk_high
            c2.fill = fill_risk_low if "Correct" in str(val) else fill_risk_high

    sheet0.column_dimensions['B'].width = 30
    sheet0.column_dimensions['C'].width = 85

    # ----------------------------------------------------
    # Sheet 1: Master Observation Log
    # ----------------------------------------------------
    sheet1_title = "Sheet 1 - Master Observation Log"
    sheet1_headers = ["Sr. No.", "Particulars Checked", "Observation / Discrepancy Found", "Correction Required Before Filing", "Risk Level"]
    sheet1_rows = [
        [row["sr_no"], row["particulars"], row["observation"], row["correction"], row["risk"]]
        for row in data.get("master_log", [])
    ]

    # ----------------------------------------------------
    # Sheet 2: Form 26AS Reconciliation
    # ----------------------------------------------------
    sheet2_title = "Sheet 2 - Form 26AS Reconciliation"
    sheet2_headers = ["Deductor / Tax Item", "Section u/s", "Amount per 26AS", "Amount per Books", "Amount Claimed in ITR", "Difference", "Reason / Status"]
    sheet2_rows = [
        [row["deductor"], row["section"], row["amount_26as"], row["amount_books"], row["amount_itr"], row["difference"], row["reason"]]
        for row in data.get("reconciliation_26as", [])
    ]

    # ----------------------------------------------------
    # Sheet 3: AIS-TIS Reconciliation
    # ----------------------------------------------------
    sheet3_title = "Sheet 3 - AIS-TIS Reconciliation"
    sheet3_headers = ["Transaction / Income Type", "AIS/TIS Amount", "Amount per Books", "ITR Disclosure", "Difference", "Remarks / Compliance Checklist"]
    sheet3_rows = [
        [row["transaction"], row["ais_amount"], row["books_amount"], row["itr_disclosure"], row["difference"], row["remarks"]]
        for row in data.get("reconciliation_ais_tis", [])
    ]

    # ----------------------------------------------------
    # Sheet 4: Balance Sheet & P&L Mapping
    # ----------------------------------------------------
    sheet4_title = "Sheet 4 - BS & PL Mapping"
    sheet4_headers = ["Entity", "Head / Line Item", "Audited Financials", "ITR Schedule & Row Reference", "Amount in ITR", "Match (Y/N)", "Auditor Remarks / Variance Note"]
    sheet4_rows = [
        [row["entity"], row["head"], row["financials"], row["schedule"], row["itr_amount"], row["match"], row["remarks"]]
        for row in data.get("mapping", [])
    ]

    # ----------------------------------------------------
    # Sheet 5: Computation of Total Income
    # ----------------------------------------------------
    sheet5_title = "Sheet 5 - Computation of Income Rec"
    sheet5_headers = ["Entity", "Particulars", "As per Books/P&L", "Add: Disallowances", "Less: Exemptions", "As per Computation", "As per ITR (Draft)", "Difference", "Section & Auditor Remarks"]
    sheet5_rows = [
        [row["entity"], row["particulars"], row["books"], row["add"], row["less"], row["computation"], row["itr"], row["difference"], row["remarks"]]
        for row in data.get("income_reconciliation", [])
    ]

    # ----------------------------------------------------
    # Sheet 6: Form 3CD Reconciliation
    # ----------------------------------------------------
    sheet6_title = "Sheet 6 - Form 3CD Reconciliation"
    sheet6_headers = ["Particulars Checked", "Financial Statements / Books", "Form 3CD Clause", "Computation Reference", "ITR Schedule", "Difference / Auditor Remarks"]
    sheet6_rows = [
        [row["particulars"], row["financials"], row["clause"], row["computation"], row["itr_schedule"], row["remarks"]]
        for row in data.get("form_3cd", [])
    ]

    # ----------------------------------------------------
    # Sheet 7: Prior Year Comparison
    # ----------------------------------------------------
    sheet7_title = "Sheet 7 - Prior Year Comparison"
    sheet7_headers = ["Entity", "Particulars", "Prior AY", "Current AY", "Change (₹)", "Change (%)", "Material?", "Remarks / Financial Explanation"]
    sheet7_rows = [
        [row["entity"], row["particulars"], row["prior"], row["current"], row["change"], row["change_pct"], row["material"], row["remarks"]]
        for row in data.get("prior_year", [])
    ]

    # ----------------------------------------------------
    # Sheet 8: Summary
    # ----------------------------------------------------
    sheet8_title = "Sheet 8 - Summary"
    sheet8_headers = ["Category / Subject", "Details of Reconciliation", "Action Plan / Recommendations"]
    sheet8_rows = [
        [row["category"], row["details"], row["action"]]
        for row in data.get("summary", [])
    ]

    # ----------------------------------------------------
    # Sheet 0B: Income Head Review (P&L vs Tax Computation)
    # ----------------------------------------------------
    income_review_data = data.get("income_head_review", {})
    sheet_inc_title = "Head of Income Review"
    sheet_inc_headers = ["Sr No", "Income Ledger", "Amount", "Book Treatment", "Computation Treatment", "Correct Tax Head", "Status", "Issue Identified", "Suggested Correction"]
    sheet_inc_rows = [
        [
            row.get("sr_no"),
            row.get("ledger_name"),
            row.get("amount"),
            row.get("book_treatment"),
            row.get("computation_treatment"),
            row.get("correct_tax_head"),
            row.get("status"),
            row.get("issue_identified"),
            row.get("suggested_correction")
        ]
        for row in income_review_data.get("classification_table", [])
    ]

    # ----------------------------------------------------
    # Sheet 0C: Expense Disallowance & Add-back Review
    # ----------------------------------------------------
    expense_review_data = data.get("expense_disallowance_review", {})
    sheet_exp_title = "Expense Disallowance Review"
    sheet_exp_headers = ["Sr No", "Expense Head", "Amount Debited in P&L", "Applicable Section", "Nature of Disallowance", "Add-back Required", "Add-back Made", "Difference", "Remarks"]
    sheet_exp_rows = [
        [
            row.get("sr_no"),
            row.get("expense_head"),
            row.get("amount_debited"),
            row.get("applicable_section"),
            row.get("nature_of_disallowance"),
            row.get("add_back_required"),
            row.get("add_back_made"),
            row.get("difference"),
            row.get("remarks")
        ]
        for row in expense_review_data.get("exception_table", [])
    ]

    # ----------------------------------------------------
    # Sheet 0D: Exempt Income Verification & Schedule EI
    # ----------------------------------------------------
    exempt_review_data = data.get("exempt_income_review", {})
    sheet_exm_title = "Exempt Income Review"
    sheet_exm_headers = ["Sr No", "Income Head as per P&L", "Amount Credited", "Nature of Income", "Relevant Provision", "Tax Treatment", "Shown in Exempt Column", "Reduced from Taxable Income", "Remarks"]
    sheet_exm_rows = [
        [
            row.get("sr_no"),
            row.get("income_head_pnl"),
            row.get("amount_credited"),
            row.get("nature_of_income"),
            row.get("relevant_provision"),
            row.get("tax_treatment"),
            row.get("shown_in_exempt_column"),
            row.get("reduced_from_taxable_income"),
            row.get("remarks")
        ]
        for row in exempt_review_data.get("verification_table", [])
    ]

    # ----------------------------------------------------
    # Sheet 0E: Tax Regime Option & Form 10-IE / 10-IEA Review
    # ----------------------------------------------------
    regime_review_data = data.get("tax_regime_review", {})
    sheet_reg_title = "Tax Regime Review"
    sheet_reg_headers = ["Sr No", "Verification Parameter", "Source Data", "Selected Regime", "Compliance Status", "Audit Findings & Corrective Action"]
    sheet_reg_rows = [
        [
            row.get("sr_no"),
            row.get("parameter"),
            row.get("source_data"),
            row.get("selected_regime"),
            row.get("compliance_status"),
            row.get("audit_findings")
        ]
        for row in regime_review_data.get("verification_table", [])
    ]

    # ----------------------------------------------------
    # Sheet 0F: Independent Tax Liability Recalculation (Section C 15-Row Table)
    # ----------------------------------------------------
    comp_review_data = data.get("tax_computation_review", {})
    sheet_tc_title = "Tax Computation Review"
    sheet_tc_headers = ["Sr No", "Particulars", "As per Computation", "As per Independent Verification", "Difference", "Status / Remarks"]
    sheet_tc_rows = [
        [
            row.get("sr_no"),
            row.get("particulars"),
            row.get("as_per_computation"),
            row.get("as_per_verification"),
            row.get("difference"),
            row.get("remarks")
        ]
        for row in comp_review_data.get("section_c_computation", [])
    ]

    # ----------------------------------------------------
    # Sheet 0G: Form 26AS TDS Credit & Corresponding Income Reconciliation (14 Columns)
    # ----------------------------------------------------
    tds_rec_data = data.get("tds_26as_reconciliation", {})
    sheet_tds_title = "26AS TDS Reconciliation"
    sheet_tds_headers = [
        "Sr No", "Deductor Name", "TAN", "TDS Section",
        "Gross Amount 26AS", "TDS 26AS", "TDS Claimed ITR",
        "Corresponding Income", "Amount Offered", "Head of Income",
        "Difference", "Status", "Risk Level", "Remarks"
    ]
    sheet_tds_rows = [
        [
            row.get("sr_no"),
            row.get("deductor"),
            row.get("tan"),
            row.get("tds_section"),
            row.get("gross_26as"),
            row.get("tds_26as"),
            row.get("tds_claimed_itr"),
            row.get("corresponding_income"),
            row.get("amount_offered"),
            row.get("head_of_income"),
            row.get("difference"),
            row.get("status"),
            row.get("risk_level"),
            row.get("remarks")
        ]
        for row in tds_rec_data.get("master_table", [])
    ]

    # ----------------------------------------------------
    # Sheet 0H: TDS Carry Forward & Rule 37BA Timing Verification (15 Columns)
    # ----------------------------------------------------
    tds_cf_data = data.get("tds_carry_forward_review", {})
    sheet_cf_title = "TDS Carry Forward Review"
    sheet_cf_headers = [
        "Sr No", "Deductor Name", "TAN", "TDS Section", "FY of Deduction",
        "Gross Amount", "Total TDS", "Income Taxable CY", "Income Taxable Future Year",
        "TDS Eligible CY", "TDS Claimed", "TDS to Carry Forward",
        "Expected AY of Claim", "Status", "Remarks"
    ]
    sheet_cf_rows = [
        [
            row.get("sr_no"),
            row.get("deductor"),
            row.get("tan"),
            row.get("tds_section"),
            row.get("fy_deduction"),
            row.get("gross_amount"),
            row.get("total_tds"),
            row.get("income_taxable_cy"),
            row.get("income_taxable_future"),
            row.get("tds_eligible_cy"),
            row.get("tds_claimed"),
            row.get("tds_to_carry_forward"),
            row.get("expected_ay_claim"),
            row.get("status"),
            row.get("remarks")
        ]
        for row in tds_cf_data.get("master_table", [])
    ]

    # ----------------------------------------------------
    # Sheet 0I: BS & P&L Line-by-Line Mapping Review (9 Columns)
    # ----------------------------------------------------
    bs_pl_data = data.get("bs_pl_mapping_review", {})
    sheet_bspl_title = "BS-PL Mapping Review"
    sheet_bspl_headers = [
        "Sr No", "Ledger / Statement Head", "Amount as per Books",
        "Nature", "Recommended ITR Schedule", "Recommended ITR Field",
        "Amount in ITR", "Difference", "Mapping Status", "Remarks"
    ]
    sheet_bspl_rows = [
        [
            row.get("sr_no"),
            row.get("ledger_head"),
            row.get("amount_books"),
            row.get("nature"),
            row.get("recommended_schedule"),
            row.get("recommended_field"),
            row.get("amount_itr"),
            row.get("difference"),
            row.get("status"),
            row.get("remarks")
        ]
        for row in bs_pl_data.get("master_mapping_table", [])
    ]

    # Create sheets and populate
    all_sheets_data = [
        (sheet_inc_title, sheet_inc_headers, sheet_inc_rows, "Income Head Check"),
        (sheet_exp_title, sheet_exp_headers, sheet_exp_rows, "Expense Check"),
        (sheet_exm_title, sheet_exm_headers, sheet_exm_rows, "Exempt Income Check"),
        (sheet_reg_title, sheet_reg_headers, sheet_reg_rows, "Tax Regime Check"),
        (sheet_tc_title, sheet_tc_headers, sheet_tc_rows, "Tax Computation Check"),
        (sheet_tds_title, sheet_tds_headers, sheet_tds_rows, "26AS TDS Check"),
        (sheet_cf_title, sheet_cf_headers, sheet_cf_rows, "TDS Carry Forward Check"),
        (sheet_bspl_title, sheet_bspl_headers, sheet_bspl_rows, "BS-PL Mapping Check"),
        (sheet1_title, sheet1_headers, sheet1_rows, "Master Log"),
        (sheet2_title, sheet2_headers, sheet2_rows, "26AS Rec"),
        (sheet3_title, sheet3_headers, sheet3_rows, "AIS-TIS Rec"),
        (sheet4_title, sheet4_headers, sheet4_rows, "BS-PL Mapping"),
        (sheet5_title, sheet5_headers, sheet5_rows, "Income Comp"),
        (sheet6_title, sheet6_headers, sheet6_rows, "3CD Rec"),
        (sheet7_title, sheet7_headers, sheet7_rows, "Prior Year"),
        (sheet8_title, sheet8_headers, sheet8_rows, "Summary")
    ]

    for title, headers, rows, short_name in all_sheets_data:
        sheet = wb.create_sheet(title=title[:30]) # Excel sheet title max 31 chars
        
        # Set grid lines visible
        sheet.views.sheetView[0].showGridLines = True
        
        # Title Block
        sheet.cell(row=2, column=2, value=entity_name).font = Font(name="Arial", size=11, bold=True, color="1B365D")
        sheet.cell(row=3, column=2, value=f"Assessment Year: {ay} | PAN: {pan_no}").font = Font(name="Arial", size=9, italic=True, color="555555")
        sheet.cell(row=4, column=2, value=title).font = title_font
        
        # Headers (Row 6)
        start_row = 6
        for col_idx, header in enumerate(headers):
            cell = sheet.cell(row=start_row, column=col_idx + 2, value=header)
            cell.fill = navy_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = border_all
        
        sheet.row_dimensions[start_row].height = 28
        
        # Data rows
        current_row = start_row + 1
        for row_idx, row_data in enumerate(rows):
            is_zebra = (row_idx % 2 == 1)
            row_fill = zebra_fill if is_zebra else PatternFill(fill_type=None)
            
            for col_idx, val in enumerate(row_data):
                cell = sheet.cell(row=current_row, column=col_idx + 2, value=val)
                cell.font = data_font
                cell.border = border_all
                cell.fill = row_fill
                
                # Alignments and special formats
                if isinstance(val, (int, float)):
                    if "Change (%)" in headers[col_idx]:
                        cell.number_format = '0.00"%"'
                        cell.alignment = Alignment(horizontal="right", vertical="center")
                    else:
                        cell.number_format = '₹#,##0.00'
                        cell.alignment = Alignment(horizontal="right", vertical="center")
                elif str(val) in ["Low", "High", "Medium"]:
                    cell.alignment = Alignment(horizontal="center", vertical="center")
                    if val == "High":
                        cell.fill = fill_risk_high
                        cell.font = font_risk_high
                    elif val == "Medium":
                        cell.fill = fill_risk_medium
                        cell.font = font_risk_medium
                    else:
                        cell.fill = fill_risk_low
                        cell.font = font_risk_low
                elif str(val) in ["Y", "N", "194A", "194-IA", "16A / 194A", "Prepaid Tax"]:
                    cell.alignment = Alignment(horizontal="center", vertical="center")
                else:
                    cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
            
            sheet.row_dimensions[current_row].height = 22
            current_row += 1

        # Auto-adjust column widths with bounds
        for col_idx in range(len(headers)):
            col_letter = get_column_letter(col_idx + 2)
            max_len = max(len(str(headers[col_idx])), 12)
            for r in rows:
                if col_idx < len(r):
                    val_str = str(r[col_idx]) if r[col_idx] is not None else ""
                    if len(val_str) > max_len and len(val_str) < 60:
                        max_len = len(val_str)
            sheet.column_dimensions[col_letter].width = min(max_len + 4, 45)

    # Save to standard report path
    output_path = r"C:\Users\hp\Desktop\CA\ITR_Review_Report.xlsx"
    wb.save(output_path)
    print(f"Successfully generated dynamic multi-sheet Excel workbook at: {output_path}")
    return output_path

if __name__ == "__main__":
    create_itr_review_report()
