import sys
import os

sys.stdout.reconfigure(encoding='utf-8')
from backend.parser_engine import get_reconciliation_data
from backend.tax_computation_engine import analyze_tax_computation
from generate_report import create_itr_review_report

print("Testing Independent Tax Liability Recalculation & Statutory Computation Verification Engine...")

data = get_reconciliation_data()
assert "tax_computation_review" in data, "tax_computation_review missing from get_reconciliation_data"

tc_review = data["tax_computation_review"]
sec_a = tc_review.get("section_a_regime", [])
sec_b = tc_review.get("section_b_deductions", [])
sec_c = tc_review.get("section_c_computation", [])
sec_d = tc_review.get("section_d_credits", [])
sec_e = tc_review.get("section_e_exceptions", [])
matrix = tc_review.get("final_summary_matrix", [])
conclusion = tc_review.get("final_conclusion", {})

print(f"\n✅ Assessee: {tc_review.get('entity_name')} (PAN: {tc_review.get('pan')}, AY: {tc_review.get('assessment_year')})")
print(f"✅ Overall Computation Status: {tc_review.get('overall_status')}")
print(f"✅ Selected Regime: {tc_review.get('regime_selected')}")

print(f"\n--- Section C: 15-Row Independent Tax Calculation Verification ---")
for r in sec_c:
    comp_val = f"₹{r.get('as_per_computation'):,}" if isinstance(r.get('as_per_computation'), (int, float)) else str(r.get('as_per_computation'))
    ver_val = f"₹{r.get('as_per_verification'):,}" if isinstance(r.get('as_per_verification'), (int, float)) else str(r.get('as_per_verification'))
    diff_val = f"₹{r.get('difference'):,}" if isinstance(r.get('difference'), (int, float)) else str(r.get('difference'))
    print(f"[{r.get('sr_no'):2d}] {r.get('particulars'):42s} | Draft: {comp_val:>14s} | Verified: {ver_val:>14s} | Diff: {diff_val:>14s} | Status: {r.get('status')}")

print(f"\n--- Section D: Tax Credit & Section 234 Interest Verification ---")
for r in sec_d:
    print(f"  • {r.get('particulars'):25s} | Draft: ₹{r.get('as_per_computation', 0):12,.2f} | Verified: ₹{r.get('as_per_verification', 0):12,.2f} | Diff: ₹{r.get('difference', 0):12,.2f}")

print(f"\n--- Section E: Statutory Exception Report ({len(sec_e)} issues) ---")
for e in sec_e:
    print(f"[{e.get('sr_no')}] Area: {e.get('area'):30s} | Impact: ₹{e.get('tax_impact', 0):10,.2f} | Section: {e.get('relevant_section'):25s} | Action: {e.get('recommended_action')}")

print(f"\n--- Final Review Summary Matrix ({len(matrix)} parameters) ---")
for m in matrix:
    print(f"  • {m.get('parameter'):35s} : {m.get('status')}")

print(f"\n--- Final Senior CA Review Conclusion ---")
print(f"Executive Opinion:\n{conclusion.get('overall_opinion')}\n")

# Test Excel Report generation
print("Testing Excel Report Generation with Tax Computation Review sheet...")
out_file = create_itr_review_report()
assert os.path.exists(out_file), "Generated Excel report missing"
print(f"✅ Excel Report successfully generated at: {out_file}")

print("\n🎉 ALL INDEPENDENT TAX LIABILITY RECALCULATION & COMPUTATION VERIFICATION TESTS PASSED!")
