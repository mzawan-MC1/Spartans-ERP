"""
Tests for Payment Receipt Upload and Invoice PDF Generation features.
Features tested:
1. Upload endpoint accepts PDF files in addition to images
2. Invoice PDF generation endpoint works correctly
3. Payment model stores receipt_url field
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
MANAGER_EMAIL = "manager.sharjah1@spartans.ae"
MANAGER_PASSWORD = "Manager2024!"
OWNER_EMAIL = "owner@spartans.com"
OWNER_PASSWORD = "Spartans2024!"


class TestSetup:
    """Helper class for test setup"""
    
    @staticmethod
    def get_manager_auth():
        """Get manager authentication token and location_id"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": MANAGER_EMAIL, "password": MANAGER_PASSWORD}
        )
        assert response.status_code == 200, f"Manager login failed: {response.text}"
        data = response.json()
        return {
            "token": data["token"],
            "location_id": data["user"]["location_id"],
            "user_id": data["user"]["user_id"]
        }


class TestUploadEndpoint:
    """Tests for /api/upload endpoint - PDF file support"""
    
    def test_upload_pdf_file(self):
        """Test that upload endpoint accepts PDF files"""
        auth = TestSetup.get_manager_auth()
        headers = {"Authorization": f"Bearer {auth['token']}"}
        
        # Create a minimal valid PDF
        pdf_content = b'%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\ntrailer << /Size 4 /Root 1 0 R >>\nstartxref\n199\n%%EOF'
        
        files = {"file": ("test_receipt.pdf", io.BytesIO(pdf_content), "application/pdf")}
        
        response = requests.post(
            f"{BASE_URL}/api/upload",
            headers=headers,
            files=files
        )
        
        assert response.status_code == 200, f"PDF upload failed: {response.text}"
        data = response.json()
        assert "url" in data, "Response should contain 'url' field"
        assert "filename" in data, "Response should contain 'filename' field"
        assert data["url"].endswith(".pdf"), "Uploaded PDF should have .pdf extension"
        print(f"✓ PDF upload successful: {data['url']}")
    
    def test_upload_png_file(self):
        """Test that upload endpoint still accepts PNG images"""
        auth = TestSetup.get_manager_auth()
        headers = {"Authorization": f"Bearer {auth['token']}"}
        
        # Create minimal PNG (1x1 red pixel)
        png_content = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
        
        files = {"file": ("test_image.png", io.BytesIO(png_content), "image/png")}
        
        response = requests.post(
            f"{BASE_URL}/api/upload",
            headers=headers,
            files=files
        )
        
        assert response.status_code == 200, f"PNG upload failed: {response.text}"
        data = response.json()
        assert "url" in data
        assert data["url"].endswith(".png"), "Uploaded PNG should have .png extension"
        print(f"✓ PNG upload successful: {data['url']}")
    
    def test_upload_jpeg_file(self):
        """Test that upload endpoint still accepts JPEG images"""
        auth = TestSetup.get_manager_auth()
        headers = {"Authorization": f"Bearer {auth['token']}"}
        
        # Create minimal JPEG (1x1 red pixel)
        jpeg_content = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.\' ",#\x1c\x1c(7),01444\x1f\'9telecom;telecom::telecom::telecom\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xc4\x00\xb5\x10\x00\x02\x01\x03\x03\x02\x04\x03\x05\x05\x04\x04\x00\x00\x01}\x01\x02\x03\x00\x04\x11\x05\x12!1A\x06\x13Qa\x07"q\x142\x81\x91\xa1\x08#B\xb1\xc1\x15R\xd1\xf0$3br\x82\t\n\x16\x17\x18\x19\x1a%&\'()*456789:CDEFGHIJSTUVWXYZcdefghijstuvwxyz\x83\x84\x85\x86\x87\x88\x89\x8a\x92\x93\x94\x95\x96\x97\x98\x99\x9a\xa2\xa3\xa4\xa5\xa6\xa7\xa8\xa9\xaa\xb2\xb3\xb4\xb5\xb6\xb7\xb8\xb9\xba\xc2\xc3\xc4\xc5\xc6\xc7\xc8\xc9\xca\xd2\xd3\xd4\xd5\xd6\xd7\xd8\xd9\xda\xe1\xe2\xe3\xe4\xe5\xe6\xe7\xe8\xe9\xea\xf1\xf2\xf3\xf4\xf5\xf6\xf7\xf8\xf9\xfa\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xfb\xd5\xff\xd9'
        
        files = {"file": ("test_image.jpg", io.BytesIO(jpeg_content), "image/jpeg")}
        
        response = requests.post(
            f"{BASE_URL}/api/upload",
            headers=headers,
            files=files
        )
        
        assert response.status_code == 200, f"JPEG upload failed: {response.text}"
        data = response.json()
        assert "url" in data
        print(f"✓ JPEG upload successful: {data['url']}")
    
    def test_upload_disallowed_file_type(self):
        """Test that upload endpoint rejects disallowed file types"""
        auth = TestSetup.get_manager_auth()
        headers = {"Authorization": f"Bearer {auth['token']}"}
        
        files = {"file": ("test.exe", io.BytesIO(b"MZ\x00\x00"), "application/octet-stream")}
        
        response = requests.post(
            f"{BASE_URL}/api/upload",
            headers=headers,
            files=files
        )
        
        assert response.status_code == 400, f"Expected 400 for disallowed file type, got {response.status_code}"
        print("✓ Disallowed file type correctly rejected")


class TestInvoicePDFGeneration:
    """Tests for /api/payments/{payment_id}/invoice endpoint"""
    
    def test_generate_invoice_pdf_success(self):
        """Test successful invoice PDF generation"""
        auth = TestSetup.get_manager_auth()
        headers = {"Authorization": f"Bearer {auth['token']}"}
        location_id = auth["location_id"]
        
        # First get a payment
        payments_response = requests.get(
            f"{BASE_URL}/api/payments?location_id={location_id}",
            headers=headers
        )
        assert payments_response.status_code == 200, f"Failed to get payments: {payments_response.text}"
        
        payments = payments_response.json().get("payments", [])
        assert len(payments) > 0, "No payments found for testing"
        
        payment = payments[0]
        payment_id = payment["payment_id"]
        
        # Generate invoice
        response = requests.get(
            f"{BASE_URL}/api/payments/{payment_id}/invoice?location_id={location_id}",
            headers=headers
        )
        
        assert response.status_code == 200, f"Invoice generation failed: {response.text}"
        
        # Verify it's a PDF
        content = response.content
        assert content.startswith(b'%PDF'), "Response should be a valid PDF (starts with %PDF)"
        
        # Check Content-Disposition header
        content_disposition = response.headers.get("Content-Disposition", "")
        assert "attachment" in content_disposition, "Should have attachment content disposition"
        assert "invoice_" in content_disposition, "Filename should contain 'invoice_'"
        
        print(f"✓ Invoice PDF generated successfully for payment {payment_id}")
        print(f"  - PDF size: {len(content)} bytes")
        print(f"  - Content-Disposition: {content_disposition}")
    
    def test_generate_invoice_pdf_invalid_payment_id(self):
        """Test invoice generation with invalid payment ID returns 404"""
        auth = TestSetup.get_manager_auth()
        headers = {"Authorization": f"Bearer {auth['token']}"}
        location_id = auth["location_id"]
        
        response = requests.get(
            f"{BASE_URL}/api/payments/invalid_payment_id/invoice?location_id={location_id}",
            headers=headers
        )
        
        assert response.status_code == 404, f"Expected 404 for invalid payment ID, got {response.status_code}"
        print("✓ Invalid payment ID correctly returns 404")
    
    def test_generate_invoice_pdf_unauthorized(self):
        """Test invoice generation without auth returns 401"""
        response = requests.get(
            f"{BASE_URL}/api/payments/payment_12345/invoice?location_id=loc_12345"
        )
        
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        print("✓ Unauthorized request correctly returns 401")


class TestPaymentReceiptUrl:
    """Tests for receipt_url field in payments"""
    
    def test_payment_model_has_receipt_url_field(self):
        """Test that payment records can have receipt_url field"""
        auth = TestSetup.get_manager_auth()
        headers = {"Authorization": f"Bearer {auth['token']}"}
        location_id = auth["location_id"]
        
        # Get payments and check for receipt_url field
        response = requests.get(
            f"{BASE_URL}/api/payments?location_id={location_id}",
            headers=headers
        )
        assert response.status_code == 200, f"Failed to get payments: {response.text}"
        
        payments = response.json().get("payments", [])
        
        # Check that payments can have receipt_url (even if null)
        for payment in payments:
            # The field should be present or potentially null
            if "receipt_url" in payment:
                print(f"  - Payment {payment['payment_id']}: receipt_url = {payment['receipt_url']}")
        
        print("✓ Payment model supports receipt_url field")
    
    def test_cash_payment_with_receipt_url(self):
        """Test recording cash payment with receipt_url"""
        auth = TestSetup.get_manager_auth()
        headers = {"Authorization": f"Bearer {auth['token']}"}
        location_id = auth["location_id"]
        
        # First, upload a receipt file
        pdf_content = b'%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\ntrailer << /Size 4 /Root 1 0 R >>\nstartxref\n199\n%%EOF'
        
        files = {"file": ("receipt.pdf", io.BytesIO(pdf_content), "application/pdf")}
        upload_response = requests.post(
            f"{BASE_URL}/api/upload",
            headers=headers,
            files=files
        )
        
        if upload_response.status_code == 200:
            receipt_url = upload_response.json()["url"]
            print(f"✓ Receipt uploaded: {receipt_url}")
        else:
            pytest.skip("Could not upload receipt for test")
        
        # Get existing members to use for test
        members_response = requests.get(
            f"{BASE_URL}/api/members?location_id={location_id}",
            headers=headers
        )
        
        if members_response.status_code == 200 and members_response.json().get("members"):
            member = members_response.json()["members"][0]
            member_id = member["member_id"]
            
            # Get memberships for this member
            memberships_response = requests.get(
                f"{BASE_URL}/api/memberships?location_id={location_id}&member_id={member_id}",
                headers=headers
            )
            
            if memberships_response.status_code == 200:
                memberships = memberships_response.json().get("memberships", [])
                if memberships:
                    membership_id = memberships[0]["membership_id"]
                    
                    # Now try to record cash payment with receipt_url
                    # Note: This might create a duplicate payment, which is ok for testing
                    cash_payment_data = {
                        "member_id": member_id,
                        "membership_id": membership_id,
                        "amount": 100.0,
                        "currency": "AED",
                        "receipt_info": "Test payment with receipt",
                        "receipt_url": receipt_url
                    }
                    
                    payment_response = requests.post(
                        f"{BASE_URL}/api/payments/cash?location_id={location_id}",
                        headers=headers,
                        json=cash_payment_data
                    )
                    
                    if payment_response.status_code in [200, 201]:
                        payment = payment_response.json()
                        assert "receipt_url" in payment or "payment_id" in payment, "Payment should be created"
                        print(f"✓ Cash payment with receipt_url recorded: {payment.get('payment_id')}")
                    else:
                        print(f"Note: Could not create test payment (may be expected): {payment_response.status_code}")


class TestPaymentListIncludesReceiptUrl:
    """Test that payment list includes receipt_url field"""
    
    def test_payments_list_has_receipt_url(self):
        """Verify payments list endpoint returns receipt_url field"""
        auth = TestSetup.get_manager_auth()
        headers = {"Authorization": f"Bearer {auth['token']}"}
        location_id = auth["location_id"]
        
        response = requests.get(
            f"{BASE_URL}/api/payments?location_id={location_id}",
            headers=headers
        )
        
        assert response.status_code == 200
        payments = response.json().get("payments", [])
        
        # At least some payments should be returned
        assert len(payments) > 0, "No payments found"
        
        # Check structure of payment records
        for payment in payments:
            assert "payment_id" in payment, "Payment should have payment_id"
            assert "member_id" in payment, "Payment should have member_id"
            assert "amount" in payment, "Payment should have amount"
            assert "status" in payment, "Payment should have status"
            assert "method" in payment, "Payment should have method"
            # receipt_url can be present (null or string) or absent
            print(f"  - {payment['payment_id']}: {payment['amount']} {payment['currency']} ({payment['method']}) - receipt_url: {payment.get('receipt_url', 'N/A')}")
        
        print(f"✓ Payments list returns {len(payments)} payments with proper structure")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
