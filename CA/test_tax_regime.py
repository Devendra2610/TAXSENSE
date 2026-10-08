import sys
import os

sys.stdout.reconfigure(encoding='utf-8')
from backend.parser_engine import get_reconciliation_data
from backend.regime_validation_engine import analyze_tax_regime
from generate_report import create_itr_review_report

print("Testing Tax Regime Option & Form 10-IE / 10-IEA Verification Engine...")

data = get_reconciliation_data()
assert "tax_regime_review" in data, "tax_regime_review missing from get_reconciliation_data"

reg_review = data["tax_regime_review"]
metrics = reg_review.get("summary_metrics", {})
comp_tax = reg_review.get("comparison_tax", {})
form_details = reg_review.get("form_10iea_details", {})
matrix = reg_review.get("provisions_matrix", [])
table = reg_review.get("verification_table", [])
conclusion = reg_review.get("final_conclusion", {})

print(f"\n✅ Assessee: {reg_review.get('entity_name')} (PAN: {reg_review.get('pan')}, AY: {reg_review.get('assessment_year')})")
print(f"✅ Selected Tax Regime: {reg_review.get('regime_selected')}")
print(f"✅ Form 10-IE / 10-IEA Status: {reg_review.get('form_10iea_status')} (Ack #: {form_details.get('ack_no')})")
print(f"💰 Comparative Tax Analysis: Old Regime Tax: ₹{comp_tax.get('old_regime_tax_payable', 0):,.2f} vs New Regime Tax: ₹{comp_tax.get('new_regime_tax_payable', 0):,.2f}")
print(f"🎉 Net Tax Savings Achieved: ₹{comp_tax.get('tax_savings_achieved', 0):,.2f} ({comp_tax.get('optimal_regime')})")
print(f"🚨 Compliance Risk Rating: {metrics.get('compliance_risk')}")

print(f"\n--- 6-Column Detailed Regime Verification Report ({len(table)} parameters) ---")
for r in table:
    print(f"[{r.get('sr_no')}] {r.get('parameter'):40s} | Source: {r.get('source_data'):45s} | Regime: {r.get('selected_regime'):25s} | Status: {r.get('compliance_status')}")

print(f"\n--- Statutory Regime Provisions Matrix ({len(matrix)} provisions) ---")
for p in matrix:
    print(f"  • {p.get('section'):25s} : {p.get('title')} [{p.get('status')}] -> {p.get('audit_verdict')}")

print(f"\n--- Step 6: Senior CA Final Review Conclusion ---")
print(f"Executive Opinion:\n{conclusion.get('overall_opinion')}\n")

print(f"Recommended Corrective Actions & Filing Instructions:")
for co in conclusion.get("recommended_corrective_actions", []):
    print(f"  - {co}")

print(f"\nApplicable Sections of Income-tax Act, 1961:")
for sec in conclusion.get("statutory_sections_referenced", []):
    print(f"  § {sec}")

# Test Excel Report generation
print("\nTesting Excel Report Generation with Tax Regime Review sheet...")
out_file = create_itr_review_report()
assert os.path.exists(out_file), "Generated Excel report missing"
print(f"✅ Excel Report successfully generated at: {out_file}")

print("\n🎉 ALL TAX REGIME OPTION & FORM 10-IE / 10-IEA VERIFICATION TESTS PASSED!")
