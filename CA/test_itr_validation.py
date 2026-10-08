"""
Unit and Integration Tests for Senior CA ITR Form Applicability & Statutory Validation Engine (Rule 12).
"""

from backend.itr_validator import determine_recommended_itr_form, validate_itr_form
from backend.universal_parser import parse_assessee_profile_from_texts

def test_itr_rule_12_engine():
    print("=" * 70)
    print(" RUNNING SENIOR CA ITR FORM & RULE 12 VALIDATION ENGINE TESTS")
    print("=" * 70)

    test_cases = [
        {
            "name": "Case 1: Limited Liability Partnership (LLP)",
            "profile": {
                "assessee_name": "Yellowstone Skyscrapers LLP",
                "pan": "AABFY8239Q",
                "pan_4th_char": "F",
                "status": "Limited Liability Partnership (LLP)",
                "residential_status": "Resident",
                "total_income": 13371160.0,
                "heads_of_income": {"business": True, "other_sources": True},
                "business_income": 866176.0,
                "other_sources_income": 13254980.0,
                "form_mentioned": "ITR-5"
            },
            "expected_form": "ITR-5",
            "expected_correct": True
        },
        {
            "name": "Case 2: Private Limited Company",
            "profile": {
                "assessee_name": "Skyline Infra Tech Private Limited",
                "pan": "AABCS1234F",
                "pan_4th_char": "C",
                "status": "Company",
                "residential_status": "Resident",
                "total_income": 25000000.0,
                "heads_of_income": {"business": True, "other_sources": True},
                "business_income": 20000000.0,
                "form_mentioned": "ITR-6"
            },
            "expected_form": "ITR-6",
            "expected_correct": True
        },
        {
            "name": "Case 3: Individual with Regular Business (PGBP) & Audit",
            "profile": {
                "assessee_name": "Rajesh Kumar Sharma",
                "pan": "ABCPR1234D",
                "pan_4th_char": "P",
                "status": "Individual",
                "residential_status": "Resident",
                "total_income": 4500000.0,
                "heads_of_income": {"business": True, "other_sources": True},
                "business_income": 4000000.0,
                "has_tax_audit": True,
                "is_presumptive": False,
                "form_mentioned": "ITR-3"
            },
            "expected_form": "ITR-3",
            "expected_correct": True
        },
        {
            "name": "Case 4: Resident Salaried Individual <= 50L (Sahaj eligible)",
            "profile": {
                "assessee_name": "Pooja Verma",
                "pan": "ABCDP5678M",
                "pan_4th_char": "P",
                "status": "Individual",
                "residential_status": "Resident",
                "total_income": 1800000.0,
                "salary_income": 1750000.0,
                "other_sources_income": 50000.0,
                "heads_of_income": {"salary": True, "other_sources": True},
                "form_mentioned": "ITR-1"
            },
            "expected_form": "ITR-1",
            "expected_correct": True
        },
        {
            "name": "Case 5: Salaried Individual with Capital Gains (Excluded from ITR-1 -> Mandates ITR-2)",
            "profile": {
                "assessee_name": "Anil Gupta",
                "pan": "ABCPG9012K",
                "pan_4th_char": "P",
                "status": "Individual",
                "residential_status": "Resident",
                "total_income": 3200000.0,
                "salary_income": 2500000.0,
                "capital_gains_income": 700000.0,
                "heads_of_income": {"salary": True, "capital_gains": True},
                "form_mentioned": "ITR-2"
            },
            "expected_form": "ITR-2",
            "expected_correct": True
        },
        {
            "name": "Case 6: Small Professional under Presumptive Scheme 44ADA <= 50L (Sugam)",
            "profile": {
                "assessee_name": "Dr. Sneha Patel",
                "pan": "ABCPS3456N",
                "pan_4th_char": "P",
                "status": "Individual",
                "residential_status": "Resident",
                "total_income": 2800000.0,
                "business_income": 2800000.0,
                "is_presumptive": True,
                "heads_of_income": {"business": True},
                "form_mentioned": "ITR-4"
            },
            "expected_form": "ITR-4",
            "expected_correct": True
        },
        {
            "name": "Case 7: Charitable Trust claiming Section 11 exemption",
            "profile": {
                "assessee_name": "Seva Foundation Trust",
                "pan": "AAATT7890B",
                "pan_4th_char": "T",
                "status": "Trust",
                "residential_status": "Resident",
                "total_income": 5000000.0,
                "is_section_11_12": True,
                "form_mentioned": "ITR-7"
            },
            "expected_form": "ITR-7",
            "expected_correct": True
        },
        {
            "name": "Case 8: DEFECTIVE TEST - Company filed in ITR-5 (Mismatch detection)",
            "profile": {
                "assessee_name": "Nexus Global Solutions Ltd",
                "pan": "AACCN4567P",
                "pan_4th_char": "C",
                "status": "Company",
                "residential_status": "Resident",
                "total_income": 80000000.0,
                "heads_of_income": {"business": True},
                "form_mentioned": "ITR-5"  # Incorrect! Mandated is ITR-6
            },
            "expected_form": "ITR-6",
            "expected_correct": False
        }
    ]

    all_passed = True
    for idx, tc in enumerate(test_cases, 1):
        report = validate_itr_form(tc["profile"])
        rec_form = report.get("form_recommended")
        is_corr = report.get("is_correct")
        
        passed_form = (rec_form == tc["expected_form"])
        passed_corr = (is_corr == tc["expected_correct"])
        
        res_str = "CORRECT" if report.get("is_correct") else "INCORRECT"
        if passed_form and passed_corr:
            print(f"  [PASS] {tc['name']} -> Form: {rec_form} ({res_str})")
        else:
            print(f"  [FAIL] {tc['name']} -> Got {rec_form} (Expected: {tc['expected_form']})")
            all_passed = False

    print("-" * 70)
    if all_passed:
        print("ALL 8 RULE 12 VALIDATION TEST CASES PASSED SUCCESSFULLY!")
    else:
        print("SOME TESTS FAILED.")
    print("=" * 70)

if __name__ == "__main__":
    test_itr_rule_12_engine()
