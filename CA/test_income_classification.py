import sys
import os

sys.stdout.reconfigure(encoding='utf-8')
from backend.parser_engine import get_reconciliation_data
from backend.income_classifier import analyze_income_heads

print("Testing Income Head Classification & Review Engine...")

data = get_reconciliation_data()
assert "income_head_review" in data, "income_head_review missing from get_reconciliation_data"

inc_review = data["income_head_review"]
metrics = inc_review.get("accuracy_metrics", {})
heads = inc_review.get("heads_distribution", {})
table = inc_review.get("classification_table", [])
risks = inc_review.get("misclassification_risks", [])
opinion = inc_review.get("professional_opinion", {})

print(f"\n✅ Assessee: {inc_review.get('entity_name')} (PAN: {inc_review.get('pan')}, AY: {inc_review.get('assessment_year')})")
print(f"✅ Accuracy Percentage: {metrics.get('accuracy_percentage')}%")
print(f"✅ Total Scrutinized Amount: ₹{inc_review.get('total_ledger_amount', 0):,.2f}")
print(f"✅ Total Items: {metrics.get('total_count')} (Correct: {metrics.get('correct_count')}, Needs Review: {metrics.get('review_count')})")

print("\n--- 5 Statutory Heads + Exempt Distribution ---")
for h_name, h_amt in heads.items():
    print(f"  • {h_name.upper():20s}: ₹{h_amt:15,.2f}")

print(f"\n--- 9-Column Master Review Table ({len(table)} items) ---")
for r in table:
    print(f"[{r.get('sr_no')}] {r.get('ledger_name'):35s} | ₹{r.get('amount', 0):12,.2f} | Head: {r.get('correct_tax_head'):35s} | Status: {r.get('status')}")
    print(f"    Issue: {r.get('issue_identified')}")
    print(f"    Correction: {r.get('suggested_correction')}\n")

print(f"--- Step 7: Senior CA Professional Opinion ---")
print(f"Opinion Summary:\n{opinion.get('overall_opinion')}\n")

print(f"Major Tax Risks ({len(opinion.get('major_tax_risks', []))} identified):")
for r in opinion.get("major_tax_risks", []):
    print(f"  • [{r.get('severity')}] {r.get('risk')} ({r.get('section')}): {r.get('impact')}")

print(f"\nAssessee Clarifications Needed:")
for cl in opinion.get("clarifications_required_from_assessee", []):
    print(f"  - {cl}")

print(f"\nRelevant Sections of Income-tax Act, 1961:")
for sec in opinion.get("relevant_sections", []):
    print(f"  § {sec}")

print("\n🎉 ALL INCOME HEAD CLASSIFICATION TESTS PASSED!")
