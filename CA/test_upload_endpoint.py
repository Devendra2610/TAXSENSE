import httpx

def test_uploads():
    base_url = "http://127.0.0.1:8000"
    
    # Test 1: Upload Computation
    files = {"file": ("Test_Computation.pdf", b"%PDF-1.4 dummy pdf content for testing", "application/pdf")}
    r = httpx.post(f"{base_url}/api/upload/comp", files=files)
    print("1. Upload Computation -> Status:", r.status_code, r.json())
    assert r.status_code == 200

    # Test 2: Upload ITR
    files = {"file": ("ITR-6_Company_Return.docx", b"dummy docx content", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    r = httpx.post(f"{base_url}/api/upload/itr", files=files)
    print("2. Upload ITR (ITR-6) -> Status:", r.status_code, r.json())
    assert r.status_code == 200

    # Test 3: Upload 26AS
    files = {"file": ("26AS_Statement.pdf", b"%PDF-1.4 dummy", "application/pdf")}
    r = httpx.post(f"{base_url}/api/upload/as26", files=files)
    print("3. Upload 26AS -> Status:", r.status_code, r.json())
    assert r.status_code == 200

    print("\nALL FILE UPLOAD ENDPOINTS TESTED AND WORKING PERFECTLY!")

if __name__ == "__main__":
    test_uploads()
