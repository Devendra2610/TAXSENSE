import sys
import os

sys.stdout.reconfigure(encoding='utf-8')
from backend.parser_engine import get_reconciliation_data
from backend.exempt_income_engine import analyze_exempt_income
from generate_report import create_itr_review_report

print("Testing Exempt Income Verification & Schedule EI Reconciliation Engine...")

data = get_reconciliation_data()
assert "exempt_income_review" in data, "exempt_income_review missing from get_reconciliation_data"

exm_review = data["exempt_income_review"]
metrics = exm_review.get("summary_metrics", {})
matrix = exm_review.get("provisions_matrix", [])
table = exm_review.get("verification_table", [])
conclusion = exm_review.get("final_conclusion", {})

print(f"\n✅ Assessee: {exm_review.get('entity_name')} (PAN: {exm_review.get('pan')}, AY: {exm_review.get('assessment_year')})")
print(f"✅ Total Exempt Income Identified in P&L: ₹{metrics.get('total_exempt_identified', 0):,.2f}")
print(f"✅ Total Exempt Income Disclosed in Schedule EI: ₹{metrics.get('total_exempt_disclosed', 0):,.2f}")
print(f"🚨 Mismatch / Un-excluded Gap: ₹{metrics.get('mismatch_amount', 0):,.2f}")
print(f"🚨 Compliance Risk Rating: {metrics.get('compliance_risk')}")

print(f"\n--- 8-Column Detailed Verification Report ({len(table)} items) ---")
for r in table:
    print(f"[{r.get('sr_no')}] {r.get('income_head_pnl'):45s} | Credited: ₹{r.get('amount_credited', 0):12,.2f} | Provision: {r.get('relevant_provision'):20s} | In Exempt Col: {r.get('shown_in_exempt_column'):3s} | Reduced from Taxable: {r.get('reduced_from_taxable_income'):3s} | Status: {r.get('status')}")

print(f"\n--- Exemption Provisions Matrix ({len(matrix)} provisions) ---")
for p in matrix:
    print(f"  • {p.get('section'):25s} : {p.get('title')} [{p.get('compliance_rating')}] -> {p.get('audit_verdict')}")

print(f"\n--- Step 5: Senior CA Final Conclusion ---")
print(f"Executive Opinion:\n{conclusion.get('overall_opinion')}\n")

print(f"Recommended Corrective Actions:")
for co in conclusion.get("recommended_corrective_actions", []):
    print(f"  - {co}")

print(f"\nApplicable Sections of Income-tax Act, 1961:")
for sec in conclusion.get("statutory_sections_referenced", []):
    print(f"  § {sec}")

# Test Excel Report generation
print("\nTesting Excel Report Generation with Exempt Income Review sheet...")
out_file = create_itr_review_report()
assert os.path.exists(out_file), "Generated Excel report missing"
print(f"✅ Excel Report successfully generated at: {out_file}")

print("\n🎉 ALL EXEMPT INCOME VERIFICATION & SCHEDULE EI TESTS PASSED!")
