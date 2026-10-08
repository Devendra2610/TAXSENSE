"""
auth.py — Whitelist Authentication & Security Module
=====================================================
- Only whitelisted Gmail accounts can login via Google OAuth
- Unauthorized attempts trigger an email alert to the admin
- All login attempts are logged to a JSON file
"""

import os
import json
import smtplib
import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path

# ============================================================
# CONFIGURATION — EDIT THESE VALUES
# ============================================================

# Add your Gmail address here (THE ONLY ACCOUNT THAT CAN LOGIN via Google OAuth)
ALLOWED_EMAILS = [
    "your.email@gmail.com",   # <-- Replace with your actual Gmail
    # "colleague@gmail.com",  # <-- Uncomment to add more allowed users
]

# Local CA Reviewer credentials for direct / offline login
LOCAL_USERS = {
    "admin@taxsense.in": {"name": "Senior CA Partner", "password": "admin"},
    "ca@taxsense.in": {"name": "CA Reviewer", "password": "admin"},
    "audit@taxsense.in": {"name": "Audit Manager", "password": "admin"}
}

# Admin Gmail for receiving security alerts (can be same as above)
ADMIN_EMAIL = "your.email@gmail.com"  # <-- Replace with your Gmail

# Gmail App Password for sending alert emails
# How to get one:
# 1. Go to myaccount.google.com/security
# 2. Enable 2-Step Verification
# 3. Go to myaccount.google.com/apppasswords
# 4. Create password: App = "Mail", Device = "Windows Computer"
# 5. Copy the 16-character password and paste below
GMAIL_APP_PASSWORD = "xxxx xxxx xxxx xxxx"  # <-- Replace with your app password

# ============================================================
# Storage Paths
# ============================================================

BASE_DIR = Path(__file__).parent.parent
LOG_FILE = BASE_DIR / "Data" / "login_attempts.json"


# ============================================================
# Core Auth Functions
# ============================================================

def is_allowed(email: str) -> bool:
    """Check if a Google email is in the whitelist or local users."""
    e = email.lower().strip()
    return e in [x.lower().strip() for x in ALLOWED_EMAILS] or e in LOCAL_USERS


def verify_local_login(email: str, password: str) -> tuple[bool, str]:
    """
    Verify local credentials.
    Returns (is_valid, user_name).
    """
    e = email.lower().strip()
    p = password.strip()

    # Check exact matching local user
    if e in LOCAL_USERS:
        user = LOCAL_USERS[e]
        if user["password"] == p:
            return True, user["name"]

    # Allow local development bypass passwords
    if p in ["admin", "123456", "ca123", "password"]:
        name = e.split("@")[0].replace(".", " ").title() if "@" in e else "CA Reviewer"
        return True, name

    return False, ""


def log_attempt(email: str, name: str, allowed: bool, ip: str = "unknown"):
    """Append a login attempt to the JSON log file."""
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)

    logs = []
    if LOG_FILE.exists():
        try:
            with open(LOG_FILE, "r") as f:
                logs = json.load(f)
        except (json.JSONDecodeError, IOError):
            logs = []

    attempt = {
        "timestamp": datetime.datetime.now().isoformat(),
        "email": email,
        "name": name,
        "allowed": allowed,
        "ip": ip,
        "status": "GRANTED" if allowed else "DENIED"
    }
    logs.insert(0, attempt)
    logs = logs[:200]  # keep last 200 entries

    with open(LOG_FILE, "w") as f:
        json.dump(logs, f, indent=2)

    return attempt


def send_security_alert(email: str, name: str, ip: str = "unknown", is_request: bool = False):
    """Send an email alert to the admin when an unauthorized user tries to login."""
    if not GMAIL_APP_PASSWORD or "xxxx" in GMAIL_APP_PASSWORD:
        print("[AUTH] Gmail App Password not configured. Skipping email alert.")
        return False

    try:
        subject = "Unauthorized Login Attempt - TaxSense Portal" if not is_request else "Access Request - TaxSense Portal"

        body = f"""
<html><body style="font-family:Arial,sans-serif;background:#0f172a;color:#e2e8f0;padding:20px;">
<div style="max-width:600px;margin:auto;background:#1e293b;border-radius:12px;padding:30px;border:1px solid #ef4444;">
  <h2 style="color:{'#ef4444' if not is_request else '#f59e0b'};">
    {'Security Alert: Unauthorized Login Attempt' if not is_request else 'New Access Request'}
  </h2>
  <hr style="border-color:#334155;">
  <table style="width:100%;border-collapse:collapse;">
    <tr><td style="padding:8px;color:#94a3b8;">Name:</td><td style="padding:8px;color:#f1f5f9;"><b>{name}</b></td></tr>
    <tr><td style="padding:8px;color:#94a3b8;">Email:</td><td style="padding:8px;color:#f1f5f9;"><b>{email}</b></td></tr>
    <tr><td style="padding:8px;color:#94a3b8;">IP Address:</td><td style="padding:8px;color:#f1f5f9;">{ip}</td></tr>
    <tr><td style="padding:8px;color:#94a3b8;">Time:</td><td style="padding:8px;color:#f1f5f9;">{datetime.datetime.now().strftime('%d %b %Y, %I:%M %p')}</td></tr>
  </table>
  <hr style="border-color:#334155;">
  <p style="color:#94a3b8;font-size:13px;">
    {'This person tried to access your TaxSense Review Portal but was BLOCKED because their email is not whitelisted.'
     if not is_request else
     'This person is requesting access. To grant access, add their email to ALLOWED_EMAILS in backend/auth.py'}
  </p>
  <p style="color:#475569;font-size:12px;">TaxSense Review Portal Security System</p>
</div>
</body></html>
        """

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = ADMIN_EMAIL
        msg["To"] = ADMIN_EMAIL
        msg.attach(MIMEText(body, "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(ADMIN_EMAIL, GMAIL_APP_PASSWORD.replace(" ", ""))
            server.sendmail(ADMIN_EMAIL, ADMIN_EMAIL, msg.as_string())

        print(f"[AUTH] Security alert sent to {ADMIN_EMAIL}")
        return True
    except Exception as e:
        print(f"[AUTH] Failed to send email alert: {e}")
        return False


def get_login_logs(limit: int = 50) -> list:
    """Return recent login attempt logs."""
    if not LOG_FILE.exists():
        return []
    try:
        with open(LOG_FILE, "r") as f:
            logs = json.load(f)
        return logs[:limit]
    except Exception:
        return []
