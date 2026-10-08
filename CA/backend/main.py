import os
import sys
import shutil
import re
from fastapi import FastAPI, HTTPException, UploadFile, File, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import httpx

# Add parent directory to path so we can import backend
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.parser_engine import get_reconciliation_data, clear_reconciliation_cache, DATA_DIR
from backend.auth import is_allowed, verify_local_login, log_attempt, send_security_alert, get_login_logs

app = FastAPI(title="CA-Level Tax Review Dashboard API")

# ── Auth Models ──────────────────────────────────────────────────────────────
class GoogleTokenRequest(BaseModel):
    token: str  # Google ID token from the frontend

class AccessRequest(BaseModel):
    email: str
    name: str

class LocalLoginRequest(BaseModel):
    email: str = "ca@taxsense.in"
    password: str = "admin"
    name: str | None = None

# Enable CORS for easy local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Auth Endpoints ───────────────────────────────────────────────────────────

@app.post("/api/auth/login")
async def local_login(body: LocalLoginRequest, request: Request):
    """
    Direct / Local login for CA Reviewers and administrators.
    Allows easy local login without requiring external OAuth credentials.
    """
    ip = request.client.host if request.client else "127.0.0.1"
    email = body.email.strip().lower()
    password = body.password.strip()

    valid, user_name = verify_local_login(email, password)
    name = body.name or user_name or (email.split("@")[0].title() if "@" in email else "CA Reviewer")

    log_attempt(email=email, name=name, allowed=valid, ip=ip)

    if valid:
        return JSONResponse({
            "status": "granted",
            "email": email,
            "name": name,
            "token": f"ca-session-{os.urandom(12).hex()}"
        })
    else:
        raise HTTPException(
            status_code=401,
            detail={
                "code": "INVALID_CREDENTIALS",
                "message": "Invalid email or password. You can use 'admin' as the default password."
            }
        )

@app.post("/api/auth/google")
async def verify_google_login(body: GoogleTokenRequest, request: Request):
    """
    Verifies a Google ID token sent from the frontend.
    Returns 200 if the email is whitelisted, 403 if not.
    Also logs the attempt and emails the admin on denied access.
    """
    ip = request.client.host if request.client else "unknown"
    try:
        # Verify token with Google's tokeninfo endpoint
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://oauth2.googleapis.com/tokeninfo?id_token={body.token}"
            )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid Google token.")

        info = resp.json()
        email = info.get("email", "").lower()
        name  = info.get("name", info.get("email", "Unknown"))

        allowed = is_allowed(email)
        log_attempt(email=email, name=name, allowed=allowed, ip=ip)

        if allowed:
            return JSONResponse({"status": "granted", "email": email, "name": name})
        else:
            # Fire-and-forget email alert (don't block the response)
            import asyncio
            asyncio.create_task(
                asyncio.to_thread(send_security_alert, email, name, ip, False)
            )
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "ACCESS_DENIED",
                    "email": email,
                    "name": name,
                    "message": "Your account is not authorised to access this portal."
                }
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Auth error: {str(e)}")


@app.post("/api/auth/request-access")
async def request_access(body: AccessRequest, request: Request):
    """
    Lets an unauthorized user request access. Sends an email to admin.
    """
    ip = request.client.host if request.client else "unknown"
    import asyncio
    asyncio.create_task(
        asyncio.to_thread(send_security_alert, body.email, body.name, ip, True)
    )
    return JSONResponse({"status": "request_sent"})


@app.get("/api/auth/logs")
def get_auth_logs():
    """Returns recent login attempt logs for the admin security dashboard."""
    return get_login_logs(limit=100)


@app.post("/api/upload/{doc_type}")
async def upload_file(doc_type: str, file: UploadFile = File(...)):
    """Saves uploaded tax and audit files under categorized filenames in DATA directory."""
    raw_fname = file.filename or ""
    orig_ext = os.path.splitext(raw_fname)[1].lower() or ".pdf"
    
    # Generic slot mapping
    expected_names = {
        "as26": f"26AS_Statement{orig_ext}",
        "comp": f"Computation_of_Income{orig_ext}",
        "itr": f"ITR_Return{orig_ext}",
        "itr1": f"ITR-1_Sahaj{orig_ext}",
        "itr2": f"ITR-2_Return{orig_ext}",
        "itr3": f"ITR-3_Return{orig_ext}",
        "itr4": f"ITR-4_Sugam{orig_ext}",
        "itr5": f"ITR-5_Return{orig_ext}",
        "itr6": f"ITR-6_Return{orig_ext}",
        "itr7": f"ITR-7_Return{orig_ext}",
        "audit": f"Tax_Audit_Report_Form_3CD{orig_ext}",
        "ais": f"AIS_TIS_Statement{orig_ext}",
        "xlsx": f"Audited_Financials{orig_ext if orig_ext else '.xlsx'}",
        "sub": f"Sub_Report_Schedule{orig_ext}"
    }
    
    doc_key = doc_type.lower()
    if doc_key not in expected_names:
        raise HTTPException(status_code=400, detail=f"Invalid document type '{doc_type}'. Allowed types: {list(expected_names.keys())}")
    
    # If the user is uploading an ITR file and the original filename contains a specific ITR number (e.g. ITR-6, ITR-3), retain that info
    itr_num_match = re.search(r'ITR[-_]?([1-7])', raw_fname, re.IGNORECASE)
    if doc_key in ["itr", "itr5"] and itr_num_match:
        filename = f"ITR-{itr_num_match.group(1)}_Return{orig_ext}"
    else:
        filename = expected_names[doc_key]

    dest = os.path.join(DATA_DIR, filename)
    
    try:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        
        # If uploading an ITR, clean up any previous conflicting ITR files in DATA_DIR
        if doc_key in ["itr", "itr1", "itr2", "itr3", "itr4", "itr5", "itr6", "itr7"]:
            for f in os.listdir(DATA_DIR):
                fl = f.lower()
                if (fl.startswith("itr") or "income_tax_return" in fl) and os.path.join(DATA_DIR, f) != dest:
                    try:
                        os.remove(os.path.join(DATA_DIR, f))
                    except Exception as e:
                        print(f"Notice: Could not remove old ITR file {f}: {e}")

        with open(dest, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        clear_reconciliation_cache()
        print(f"File uploaded successfully to: {dest}")
        return {"status": "success", "filename": filename, "doc_type": doc_type}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")


@app.post("/api/validate-itr")
def validate_custom_profile(payload: dict = None):
    """
    Validates ITR form eligibility based on a custom JSON assessee profile
    or dynamically from currently uploaded documents.
    """
    try:
        from backend.itr_validator import validate_itr_form
        if payload and isinstance(payload, dict) and payload.get("status"):
            report = validate_itr_form(payload)
            return report
        
        # Otherwise compute from current documents
        data = get_reconciliation_data()
        return data.get("itr_validation", {})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Validation failed: {str(e)}")

@app.get("/api/income-classification")
@app.post("/api/income-classification")
def get_income_classification():
    """
    Returns the comprehensive 7-Step Head of Income Classification & Review Report
    analyzing Profit & Loss items against Income-tax computation.
    """
    try:
        data = get_reconciliation_data()
        return data.get("income_head_review", {})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Income classification analysis failed: {str(e)}")

@app.get("/api/expense-disallowances")
@app.post("/api/expense-disallowances")
def get_expense_disallowances():
    """
    Returns the comprehensive Statutory Expense Disallowances & Add-back Verification Report
    evaluating Section 14A, 37(1), 40(a)(ia), 40A(2)/(3), 43B, 43B(h), 32, and 36(1)(va).
    """
    try:
        data = get_reconciliation_data()
        return data.get("expense_disallowance_review", {})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Expense disallowance analysis failed: {str(e)}")

@app.get("/api/exempt-income")
@app.post("/api/exempt-income")
def get_exempt_income():
    """
    Returns the comprehensive Exempt Income Verification & Schedule EI Reconciliation Report
    analyzing Section 10, 10(2A), 10(1), 10(15), 10(34) repeal, and Section 4 Capital Receipts.
    """
    try:
        data = get_reconciliation_data()
        return data.get("exempt_income_review", {})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Exempt income verification failed: {str(e)}")

@app.get("/api/tax-regime")
@app.post("/api/tax-regime")
def get_tax_regime():
    """
    Returns the Tax Regime Option & Form 10-IE / 10-IEA Verification Report
    evaluating Section 115BAC (Old vs. New) and Section 115BAA/115BAB options.
    """
    try:
        data = get_reconciliation_data()
        return data.get("tax_regime_review", {})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tax regime verification failed: {str(e)}")

@app.get("/api/tax-computation")
@app.post("/api/tax-computation")
def get_tax_computation():
    """
    Returns the Independent Tax Liability Recalculation & Statutory Computation Verification Report
    (Section A to E + Final Summary Matrix) in compliance with Income-tax Act, 1961.
    """
    try:
        data = get_reconciliation_data()
        return data.get("tax_computation_review", {})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tax computation verification failed: {str(e)}")

@app.get("/api/tds-26as-reconciliation")
@app.post("/api/tds-26as-reconciliation")
def get_tds_26as_reconciliation():
    """
    Returns the Form 26AS TDS Credit & Corresponding Income Reconciliation Report
    verifying Section 199 read with Rule 37BA of the Income-tax Rules, 1962.
    """
    try:
        data = get_reconciliation_data()
        return data.get("tds_26as_reconciliation", {})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TDS 26AS reconciliation failed: {str(e)}")

@app.get("/api/tds-carry-forward")
@app.post("/api/tds-carry-forward")
def get_tds_carry_forward():
    """
    Returns the TDS Carry Forward & Rule 37BA Timing Verification Report
    verifying income recognition timing, multi-year contracts, and brought-forward registers.
    """
    try:
        data = get_reconciliation_data()
        return data.get("tds_carry_forward_review", {})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TDS carry-forward verification failed: {str(e)}")

@app.get("/api/bs-pl-mapping-review")
@app.post("/api/bs-pl-mapping-review")
def get_bs_pl_mapping_review():
    """
    Returns the Financial Statements (Balance Sheet & P&L) to ITR Mapping Review Report
    verifying line-by-line mapping, specific line precedence, cross-schedule integrity, and 13-head BS / 12-head P&L reconciliations.
    """
    try:
        data = get_reconciliation_data()
        return data.get("bs_pl_mapping_review", {})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"BS-PL mapping verification failed: {str(e)}")









@app.post("/api/reset")
@app.post("/api/clear")
@app.delete("/api/clear")
def clear_all_results():
    """Removes all uploaded documents, previous calculation results, and generated reports."""
    try:
        clear_reconciliation_cache()
        # Delete generated Excel report
        report_file = r"C:\Users\hp\Desktop\CA\ITR_Review_Report.xlsx"
        if os.path.exists(report_file):
            try:
                os.remove(report_file)
            except Exception as e:
                print(f"Error removing report file: {e}")
        
        # Delete uploaded tax files in DATA_DIR except login_attempts.json
        if os.path.exists(DATA_DIR):
            for fname in os.listdir(DATA_DIR):
                if fname.lower() == "login_attempts.json":
                    continue
                fpath = os.path.join(DATA_DIR, fname)
                try:
                    if os.path.isfile(fpath):
                        os.remove(fpath)
                    elif os.path.isdir(fpath):
                        shutil.rmtree(fpath)
                except Exception as e:
                    print(f"Error removing {fpath}: {e}")
                    
        return {"status": "success", "message": "All previous results and uploaded documents cleared."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear results: {str(e)}")

@app.post("/api/process")
def process_reconciliation():
    """Runs the parser engine, rebuilds the Excel workbook on the fly, and returns data."""
    try:
        from generate_report import create_itr_review_report
        create_itr_review_report()
        data = get_reconciliation_data()
        return {"status": "success", "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

@app.get("/api/data")
def get_data():
    """Returns the parsed tax reconciliation data for all 8 sheets."""
    try:
        data = get_reconciliation_data()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/export")
def export_excel():
    """Generates the ITR_Review_Report.xlsx on the fly and returns it as a download."""
    try:
        from generate_report import create_itr_review_report
        report_file = r"C:\Users\hp\Desktop\CA\ITR_Review_Report.xlsx"
        create_itr_review_report()
        
        if os.path.exists(report_file):
            return FileResponse(
                report_file, 
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
                filename="ITR_Review_Report.xlsx"
            )
        else:
            raise HTTPException(status_code=500, detail="Failed to generate Excel report file.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Locate the frontend directory relative to main.py
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")

if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="static")
else:
    print(f"Warning: Frontend directory '{frontend_dir}' not found. Serving API only.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)
