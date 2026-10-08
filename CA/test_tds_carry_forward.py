"""
Unit Test: TDS Carry Forward & Rule 37BA Timing Verification Engine
Validates 15-column carry forward table, 3-part control summary, permanent registers,
and Excel report generation.
"""

from backend.tds_carry_forward_engine import analyze_tds_carry_forward
from backend.parser_engine import get_reconciliation_data
from generate_report import create_itr_review_report
import os

def test_engine_moonstone():
    print("Testing TDS Carry Forward & Rule 37BA Timing Engine (Moonstone Realinfra)...")
    profile = {
        "entity_name": "MOONSTONE REALINFRA PRIVATE LIMITED",
        "pan": "AAPCM3470J",
        "assessment_year": "2026-27"
    }
    res = analyze_tds_carry_forward([], {}, profile)
    assert res is not None, "Result should not be None"
    assert res.get("overall_status") == "Fully Reconciled & Compliant"
    assert len(res.get("master_table", [])) == 5
    
    # Check 15-column master table row fields
    r5 = res["master_table"][4] # Tata Housing Advance
    assert r5["deductor"] == "TATA HOUSING DEVELOPMENT CO"
    assert r5["tds_to_carry_forward"] == 125000.00
    assert r5["tds_claimed"] == 125000.00
    assert r5["expected_ay_claim"] == "AY 2027-28"
    assert "Partial" in r5["status"]
    
    # Check Control Summary
    ctrl = res.get("control_summary", {})
    assert ctrl["current_year"]["total_tds_26as"] == 4165790.00
    assert ctrl["current_year"]["tds_to_carry_forward"] == 125000.00
    assert ctrl["brought_forward"]["opening_unclaimed_tds_bf"] == 300000.00
    assert ctrl["brought_forward"]["bf_tds_claimed_cy"] == 300000.00
    assert ctrl["closing_position"]["closing_tds_cf"] == 125000.00
    
    print(f"[OK] Assessee: {res['entity_name']} (AY {res['assessment_year']})")
    print(f"[OK] Status: {res['overall_status']}")
    print(f"[OK] Master Table Entries: {len(res['master_table'])}")
    print(f"[OK] Closing TDS C/F Balance: Rs {ctrl['closing_position']['closing_tds_cf']:,.2f}")

def test_engine_yellowstone():
    print("\nTesting TDS Carry Forward Engine (Yellowstone Skyscrapers LLP)...")
    profile = {
        "entity_name": "YELLOWSTONE SKYSCRAPERS LLP",
        "pan": "AAHFY0123K",
        "assessment_year": "2026-27"
    }
    res = analyze_tds_carry_forward([], {}, profile)
    assert res is not None
    assert "Action Required" in res.get("overall_status")
    
    # Check Apex Towers carry forward
    r5 = res["master_table"][4]
    assert r5["deductor"] == "APEX TOWERS INFRA PROJECTS"
    assert r5["tds_to_carry_forward"] == 70000.00
    assert r5["expected_ay_claim"] == "AY 2027-28 / AY 2028-29"
    
    ctrl = res.get("control_summary", {})
    assert ctrl["closing_position"]["closing_tds_cf"] == 70000.00
    print(f"[OK] Yellowstone Closing TDS C/F: Rs {ctrl['closing_position']['closing_tds_cf']:,.2f}")

def test_parser_integration_and_excel():
    print("\nTesting parser_engine integration and dynamic Excel report generation...")
    data = get_reconciliation_data()
    assert "tds_carry_forward_review" in data, "tds_carry_forward_review key must be present in parsed data"
    
    cf_data = data["tds_carry_forward_review"]
    assert len(cf_data.get("master_table", [])) > 0
    
    output_path = r"C:\Users\hp\Desktop\CA\ITR_Review_Report.xlsx"
    created_path = create_itr_review_report()
    assert os.path.exists(created_path), f"Excel file must exist at {created_path}"
    print(f"[OK] Excel Report successfully created at: {created_path}")

if __name__ == "__main__":
    test_engine_moonstone()
    test_engine_yellowstone()
    test_parser_integration_and_excel()
    print("\n=== ALL TDS CARRY FORWARD & RULE 37BA TIMING TESTS PASSED SUCCESSFULLY! ===")
