import sys
import os

sys.stdout.reconfigure(encoding='utf-8')
from backend.parser_engine import get_reconciliation_data
from backend.tds_26as_reconciliation_engine import analyze_tds_26as_reconciliation
from generate_report import create_itr_review_report

print("Testing Form 26AS TDS Credit & Corresponding Income Reconciliation Engine (Sec 199 & Rule 37BA)...")

data = get_reconciliation_data()
assert "tds_26as_reconciliation" in data, "tds_26as_reconciliation missing from get_reconciliation_data"

tds_review = data["tds_26as_reconciliation"]
master_table = tds_review.get("master_table", [])
tds_summary = tds_review.get("tds_control_summary", {})
inc_summary = tds_review.get("income_control_summary", {})
section_breakdown = tds_review.get("section_breakdown", [])
risk_alerts = tds_review.get("risk_alerts", [])
conclusion = tds_review.get("final_conclusion", {})

print(f"\n✅ Assessee: {tds_review.get('entity_name')} (PAN: {tds_review.get('pan')}, AY: {tds_review.get('assessment_year')})")
print(f"✅ Overall 26AS Match Status: {tds_review.get('overall_status')}")
print(f"✅ Match Summary: {tds_review.get('overall_match_status')}")

print(f"\n--- Final Control Summary (Sec 199 & Rule 37BA) ---")
print(f"  • TDS Control      : Total 26AS: ₹{tds_summary.get('total_tds_26as'):,.2f} | Claimed ITR: ₹{tds_summary.get('tds_claimed_itr'):,.2f} | Unclaimed: ₹{tds_summary.get('tds_not_claimed'):,.2f} | Excess: ₹{tds_summary.get('excess_tds_claimed'):,.2f}")
print(f"  • Income Control   : 26AS Gross: ₹{inc_summary.get('gross_receipts_26as'):,.2f} | Offered P&L: ₹{inc_summary.get('corresponding_income_identified'):,.2f} | Explained: ₹{inc_summary.get('explained_differences'):,.2f} | Unexplained: ₹{inc_summary.get('unexplained_differences'):,.2f}")

print(f"\n--- 14-Column Master Reconciliation Table ({len(master_table)} deductor entries) ---")
for r in master_table:
    print(f"[{r.get('sr_no')}] {r.get('deductor'):36s} | TAN: {r.get('tan'):10s} | Sec: {r.get('tds_section'):22s} | Gross 26AS: ₹{r.get('gross_26as'):12,.2f} | TDS 26AS: ₹{r.get('tds_26as'):10,.2f} | Claimed: ₹{r.get('tds_claimed_itr'):10,.2f} | Offered: ₹{r.get('amount_offered'):12,.2f} | Head: {r.get('head_of_income'):28s} | Status: {r.get('status')}")

print(f"\n--- Section-wise TDS Distribution ({len(section_breakdown)} sections) ---")
for s in section_breakdown:
    print(f"  • {s.get('section'):32s} | 26AS Gross: ₹{s.get('26as_gross'):12,.2f} | 26AS TDS: ₹{s.get('26as_tds'):10,.2f} | Claimed: ₹{s.get('claimed_tds'):10,.2f} | Status: {s.get('status')}")

print(f"\n--- Statutory Risk & Compliance Alerts ({len(risk_alerts)} alerts) ---")
for a in risk_alerts:
    print(f"  • [{a.get('risk_id')}] {a.get('title')} ({a.get('severity')}) -> {a.get('message')}")

print(f"\n--- Senior CA Final Verification Opinion ---")
print(f"Executive Opinion:\n{conclusion.get('overall_opinion')}\n")

# Test Excel Report generation
print("Testing Excel Report Generation with 26AS TDS Reconciliation sheet...")
out_file = create_itr_review_report()
assert os.path.exists(out_file), "Generated Excel report missing"
print(f"✅ Excel Report successfully generated at: {out_file}")

print("\n🎉 ALL FORM 26AS TDS CREDIT & CORRESPONDING INCOME RECONCILIATION TESTS PASSED!")
