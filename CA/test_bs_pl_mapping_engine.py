"""
Unit Test: Financial Statements (Balance Sheet & P&L) to ITR Mapping Engine
Validates 9-column master mapping table, 13-head BS and 12-head P&L reconciliations,
6 cross-schedule checks, and Excel report generation.
"""

from backend.bs_pl_mapping_engine import analyze_bs_pl_mapping
from backend.parser_engine import get_reconciliation_data
from generate_report import create_itr_review_report
import os

def test_engine_moonstone():
    print("Testing BS-PL Mapping Engine (Moonstone Realinfra Private Limited)...")
    profile = {
        "entity_name": "MOONSTONE REALINFRA PRIVATE LIMITED",
        "pan": "AAPCM3470J",
        "assessment_year": "2026-27"
    }
    res = analyze_bs_pl_mapping([], {}, profile)
    assert res is not None, "Result should not be None"
    assert res.get("overall_status") == "PASS"
    assert len(res.get("master_mapping_table", [])) == 20
    assert len(res.get("balance_sheet_reconciliation", [])) == 14
    assert len(res.get("pnl_reconciliation", [])) == 12
    assert len(res.get("cross_schedule_checks", [])) == 6
    
    # Check Balance Sheet Total
    bs_total = res["balance_sheet_reconciliation"][-1]
    assert bs_total["particulars"] == "TOTAL BALANCE SHEET"
    assert bs_total["books_amount"] == 255664430.00
    assert bs_total["itr_amount"] == 255664430.00
    assert bs_total["difference"] == 0.00
    
    # Check P&L Net Profit
    pl_net = res["pnl_reconciliation"][-1]
    assert pl_net["particulars"] == "NET PROFIT / LOSS"
    assert pl_net["books_amount"] == 32317390.00
    assert pl_net["itr_amount"] == 32317390.00
    assert pl_net["difference"] == 0.00
    
    print(f"[OK] Assessee: {res['entity_name']} (AY {res['assessment_year']})")
    print(f"[OK] Status: {res['overall_status']}")
    print(f"[OK] Master Mapping Entries: {len(res['master_mapping_table'])}")
    print(f"[OK] Balance Sheet Total: Rs {bs_total['books_amount']:,.2f} (Diff: Rs {bs_total['difference']:,.2f})")
    print(f"[OK] P&L Net Profit: Rs {pl_net['books_amount']:,.2f} (Diff: Rs {pl_net['difference']:,.2f})")

def test_engine_yellowstone():
    print("\nTesting BS-PL Mapping Engine (Yellowstone Skyscrapers LLP)...")
    profile = {
        "entity_name": "YELLOWSTONE SKYSCRAPERS LLP",
        "pan": "AAHFY0123K",
        "assessment_year": "2026-27"
    }
    res = analyze_bs_pl_mapping([], {}, profile)
    assert res is not None
    assert "PASS WITH OBSERVATIONS" in res.get("overall_status")
    assert len(res.get("master_mapping_table", [])) == 15
    
    bs_total = res["balance_sheet_reconciliation"][-1]
    assert bs_total["books_amount"] == 272700000.00
    assert bs_total["difference"] == 0.00
    
    pl_net = res["pnl_reconciliation"][-1]
    assert pl_net["books_amount"] == 63650000.00
    assert pl_net["difference"] == 0.00
    
    print(f"[OK] Yellowstone Status: {res['overall_status']}")
    print(f"[OK] Yellowstone BS Total: Rs {bs_total['books_amount']:,.2f}")
    print(f"[OK] Yellowstone Net Profit: Rs {pl_net['books_amount']:,.2f}")

def test_parser_integration_and_excel():
    print("\nTesting parser_engine integration and dynamic Excel report generation...")
    data = get_reconciliation_data()
    assert "bs_pl_mapping_review" in data, "bs_pl_mapping_review key must be present in parsed data"
    
    bspl_data = data["bs_pl_mapping_review"]
    assert len(bspl_data.get("master_mapping_table", [])) > 0
    
    output_path = r"C:\Users\hp\Desktop\CA\ITR_Review_Report.xlsx"
    created_path = create_itr_review_report()
    assert os.path.exists(created_path), f"Excel file must exist at {created_path}"
    print(f"[OK] Excel Report successfully created at: {created_path}")

if __name__ == "__main__":
    test_engine_moonstone()
    test_engine_yellowstone()
    test_parser_integration_and_excel()
    print("\n=== ALL BS-PL MAPPING & ITR VERIFICATION TESTS PASSED SUCCESSFULLY! ===")
