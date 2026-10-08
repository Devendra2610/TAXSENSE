import sys
import os
import json

sys.stdout.reconfigure(encoding='utf-8')
from backend.parser_engine import get_reconciliation_data
from backend.expense_disallowance_engine import analyze_expense_disallowances
from generate_report import create_itr_review_report

print("Testing Expense Disallowance & Add-back Review Engine...")

data = get_reconciliation_data()
assert "expense_disallowance_review" in data, "expense_disallowance_review missing from get_reconciliation_data"

exp_review = data["expense_disallowance_review"]
metrics = exp_review.get("summary_metrics", {})
matrix = exp_review.get("provisions_matrix", [])
table = exp_review.get("exception_table", [])
conclusion = exp_review.get("professional_conclusion", {})

print(f"\n✅ Assessee: {exp_review.get('entity_name')} (PAN: {exp_review.get('pan')}, AY: {exp_review.get('assessment_year')})")
print(f"✅ Total Debited Expenses Reviewed: ₹{metrics.get('total_expenses_reviewed', 0):,.2f}")
print(f"✅ Total Disallowances Required: ₹{metrics.get('total_disallowances_required', 0):,.2f}")
print(f"✅ Total Add-backs Made in Comp: ₹{metrics.get('total_add_backs_made', 0):,.2f}")
print(f"🚨 Disallowance Gap (Missed Add-backs): ₹{metrics.get('total_missing_adjustments', 0):,.2f}")
print(f"🚨 Potential Tax Exposure: ₹{metrics.get('potential_tax_exposure', 0):,.2f} ({conclusion.get('tax_rate_applied')})")
print(f"✅ Add-back Accuracy: {metrics.get('addback_accuracy_pct')}%")

print(f"\n--- 8-Column Detailed Exception Report ({len(table)} items) ---")
for r in table:
    print(f"[{r.get('sr_no')}] {r.get('expense_head'):40s} | Debited: ₹{r.get('amount_debited', 0):12,.2f} | Section: {r.get('applicable_section'):25s} | Req: ₹{r.get('add_back_required', 0):10,.2f} | Made: ₹{r.get('add_back_made', 0):10,.2f} | Diff: ₹{r.get('difference', 0):10,.2f} | Status: {r.get('status')}")

print(f"\n--- Statutory Provisions Matrix ({len(matrix)} provisions) ---")
for p in matrix:
    print(f"  • {p.get('section'):25s} : {p.get('title')} [{p.get('risk_level')}] -> {p.get('disallowance_status')}")

print(f"\n--- Step 6: Senior CA Professional Judgement & Conclusion ---")
print(f"Executive Opinion:\n{conclusion.get('overall_conclusion')}\n")

print(f"Mandatory Return Add-backs:")
for co in conclusion.get("mandatory_computation_corrections", []):
    print(f"  - {co}")

print(f"\nApplicable Sections of Income-tax Act, 1961:")
for sec in conclusion.get("statutory_sections_referenced", []):
    print(f"  § {sec}")

# Test Excel Report generation
print("\nTesting Excel Report Generation with Expense Disallowance Review sheet...")
out_file = create_itr_review_report()
assert os.path.exists(out_file), "Generated Excel report missing"
print(f"✅ Excel Report successfully generated at: {out_file}")

print("\n🎉 ALL EXPENSE DISALLOWANCE & ADD-BACK REVIEW TESTS PASSED!")
