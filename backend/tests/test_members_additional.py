"""
Test Suite: Members Access Journey - Additional Tests
Tests for membership activation flow, RECEPTIONIST role access, and edge cases.
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
OWNER_EMAIL = "owner@spartans.com"
OWNER_PASSWORD = "Spartans2024!"
MANAGER_EMAIL = "manager.sharjah1@spartans.ae"
MANAGER_PASSWORD = "Manager2024!"


@pytest.fixture(scope="module")
def owner_token():
    """Get owner authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": OWNER_EMAIL,
        "password": OWNER_PASSWORD
    })
    assert response.status_code == 200
    return response.json()["token"]


@pytest.fixture(scope="module")
def owner_headers(owner_token):
    """Headers with owner auth"""
    return {"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def manager_token():
    """Get manager authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": MANAGER_EMAIL,
        "password": MANAGER_PASSWORD
    })
    assert response.status_code == 200
    return response.json()["token"]


@pytest.fixture(scope="module")
def manager_headers(manager_token):
    """Headers with manager auth"""
    return {"Authorization": f"Bearer {manager_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def location_id(owner_headers):
    """Get first location ID"""
    response = requests.get(f"{BASE_URL}/api/locations", headers=owner_headers)
    data = response.json()
    locations = data if isinstance(data, list) else data.get("locations", [])
    return locations[0]["location_id"]


class TestMembershipActivationFlow:
    """Test the full membership activation flow"""
    
    def test_membership_activation_requires_agreement(self, owner_headers, location_id):
        """Membership activation should fail without signed agreement"""
        # Create member
        unique_email = f"test_act_flow_{uuid.uuid4().hex[:8]}@test.com"
        member_resp = requests.post(
            f"{BASE_URL}/api/members?location_id={location_id}",
            headers=owner_headers,
            json={"full_name": "TEST_Activation Flow", "email": unique_email}
        )
        member_id = member_resp.json()["member_id"]
        
        # Create membership
        today = datetime.now().strftime("%Y-%m-%d")
        end_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        membership_resp = requests.post(
            f"{BASE_URL}/api/members/{member_id}/memberships?location_id={location_id}",
            headers=owner_headers,
            json={"member_id": member_id, "type": "full_access", "start_date": today, "end_date": end_date}
        )
        membership_id = membership_resp.json()["membership_id"]
        
        # Try to activate without agreement - should fail
        activate_resp = requests.post(
            f"{BASE_URL}/api/memberships/{membership_id}/activate?location_id={location_id}",
            headers=owner_headers
        )
        assert activate_resp.status_code == 400, "Should fail without agreement"
        assert "agreement" in activate_resp.text.lower()
        print("✓ Membership activation correctly requires signed agreement")
    
    def test_membership_activation_requires_payment(self, owner_headers, location_id):
        """Membership activation should fail without payment"""
        # Create member
        unique_email = f"test_act_pay_{uuid.uuid4().hex[:8]}@test.com"
        member_resp = requests.post(
            f"{BASE_URL}/api/members?location_id={location_id}",
            headers=owner_headers,
            json={"full_name": "TEST_Activation Payment", "email": unique_email}
        )
        member_id = member_resp.json()["member_id"]
        
        # Create membership
        today = datetime.now().strftime("%Y-%m-%d")
        end_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        membership_resp = requests.post(
            f"{BASE_URL}/api/members/{member_id}/memberships?location_id={location_id}",
            headers=owner_headers,
            json={"member_id": member_id, "type": "full_access", "start_date": today, "end_date": end_date}
        )
        membership_id = membership_resp.json()["membership_id"]
        
        # Create and sign agreement
        agreement_resp = requests.post(
            f"{BASE_URL}/api/agreements?location_id={location_id}",
            headers=owner_headers,
            json={"title": "TEST_Activation Agreement", "version": "1.0", "content_html": "<p>Test</p>"}
        )
        agreement_id = agreement_resp.json()["agreement_id"]
        
        sign_resp = requests.post(
            f"{BASE_URL}/api/members/{member_id}/sign-agreement?location_id={location_id}",
            headers=owner_headers,
            json={"agreement_id": agreement_id, "checkbox_agreed": True}
        )
        signed_id = sign_resp.json()["signed_agreement_id"]
        
        # Update membership with signed agreement
        requests.patch(
            f"{BASE_URL}/api/memberships/{membership_id}?location_id={location_id}",
            headers=owner_headers,
            json={"signed_agreement_id": signed_id}
        )
        
        # Try to activate without payment - should fail
        activate_resp = requests.post(
            f"{BASE_URL}/api/memberships/{membership_id}/activate?location_id={location_id}",
            headers=owner_headers
        )
        assert activate_resp.status_code == 400, "Should fail without payment"
        assert "payment" in activate_resp.text.lower()
        print("✓ Membership activation correctly requires payment")
    
    def test_full_membership_activation_flow(self, owner_headers, location_id):
        """Test complete membership activation with agreement and payment"""
        # Create member
        unique_email = f"test_full_act_{uuid.uuid4().hex[:8]}@test.com"
        member_resp = requests.post(
            f"{BASE_URL}/api/members?location_id={location_id}",
            headers=owner_headers,
            json={"full_name": "TEST_Full Activation", "email": unique_email}
        )
        member_id = member_resp.json()["member_id"]
        
        # Create membership
        today = datetime.now().strftime("%Y-%m-%d")
        end_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        membership_resp = requests.post(
            f"{BASE_URL}/api/members/{member_id}/memberships?location_id={location_id}",
            headers=owner_headers,
            json={"member_id": member_id, "type": "full_access", "start_date": today, "end_date": end_date}
        )
        membership_id = membership_resp.json()["membership_id"]
        
        # Create and sign agreement
        agreement_resp = requests.post(
            f"{BASE_URL}/api/agreements?location_id={location_id}",
            headers=owner_headers,
            json={"title": "TEST_Full Activation Agreement", "version": "1.0", "content_html": "<p>Test</p>"}
        )
        agreement_id = agreement_resp.json()["agreement_id"]
        
        sign_resp = requests.post(
            f"{BASE_URL}/api/members/{member_id}/sign-agreement?location_id={location_id}",
            headers=owner_headers,
            json={"agreement_id": agreement_id, "checkbox_agreed": True}
        )
        signed_id = sign_resp.json()["signed_agreement_id"]
        
        # Update membership with signed agreement
        requests.patch(
            f"{BASE_URL}/api/memberships/{membership_id}?location_id={location_id}",
            headers=owner_headers,
            json={"signed_agreement_id": signed_id}
        )
        
        # Record cash payment
        payment_resp = requests.post(
            f"{BASE_URL}/api/payments/cash?location_id={location_id}",
            headers=owner_headers,
            json={
                "member_id": member_id,
                "membership_id": membership_id,
                "amount": 299.00,
                "currency": "AED"
            }
        )
        assert payment_resp.status_code == 201
        
        # Now activate - should succeed
        activate_resp = requests.post(
            f"{BASE_URL}/api/memberships/{membership_id}/activate?location_id={location_id}",
            headers=owner_headers
        )
        assert activate_resp.status_code == 200, f"Activation failed: {activate_resp.text}"
        data = activate_resp.json()
        assert data["status"] == "active"
        print("✓ Full membership activation flow completed successfully")


class TestDedicatedProgramMembership:
    """Dedicated program memberships are no longer supported"""
    
    def test_dedicated_program_rejected(self, owner_headers, location_id):
        """Dedicated program membership should be rejected"""
        # Create member
        unique_email = f"test_ded_prog_{uuid.uuid4().hex[:8]}@test.com"
        member_resp = requests.post(
            f"{BASE_URL}/api/members?location_id={location_id}",
            headers=owner_headers,
            json={"full_name": "TEST_Dedicated Program", "email": unique_email}
        )
        member_id = member_resp.json()["member_id"]
        
        # Try to create dedicated_program membership
        today = datetime.now().strftime("%Y-%m-%d")
        end_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        membership_resp = requests.post(
            f"{BASE_URL}/api/members/{member_id}/memberships?location_id={location_id}",
            headers=owner_headers,
            json={"member_id": member_id, "type": "dedicated_program", "start_date": today, "end_date": end_date}
        )
        assert membership_resp.status_code == 400, "Dedicated program should be rejected"
        print("✓ Dedicated program membership correctly rejected")


class TestPaymentWebhooks:
    """Test payment webhook endpoints"""
    
    def test_online_webhook(self):
        """Test online payment webhook"""
        response = requests.post(
            f"{BASE_URL}/api/payments/webhook/online",
            json={"payment_id": "test_payment_123", "status": "completed"}
        )
        assert response.status_code == 200
        assert response.json()["received"] == True
        print("✓ Online payment webhook working")
    
    def test_tabby_webhook(self):
        """Test Tabby payment webhook"""
        response = requests.post(
            f"{BASE_URL}/api/payments/webhook/tabby",
            json={"payment": {"id": "test_tabby_123", "status": "AUTHORIZED"}}
        )
        assert response.status_code == 200
        assert response.json()["received"] == True
        print("✓ Tabby payment webhook working")
    
    def test_tamara_webhook(self):
        """Test Tamara payment webhook"""
        response = requests.post(
            f"{BASE_URL}/api/payments/webhook/tamara",
            json={"order_id": "test_tamara_123", "event_type": "approved"}
        )
        assert response.status_code == 200
        assert response.json()["received"] == True
        print("✓ Tamara payment webhook working")


class TestMemberExpenses:
    """Test member expenses API"""
    
    def test_create_expense(self, owner_headers, location_id):
        """Create a member expense"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.post(
            f"{BASE_URL}/api/member-expenses?location_id={location_id}",
            headers=owner_headers,
            json={
                "title": "TEST_Equipment Purchase",
                "category": "Equipment",
                "amount": 500.00,
                "currency": "AED",
                "expense_date": today,
                "note": "Test expense"
            }
        )
        assert response.status_code == 201, f"Failed to create expense: {response.text}"
        data = response.json()
        assert "expense_id" in data
        assert data["title"] == "TEST_Equipment Purchase"
        print(f"✓ Created expense: {data['expense_id']}")
    
    def test_list_expenses(self, owner_headers, location_id):
        """List member expenses"""
        response = requests.get(
            f"{BASE_URL}/api/member-expenses?location_id={location_id}",
            headers=owner_headers
        )
        assert response.status_code == 200, f"Failed to list expenses: {response.text}"
        data = response.json()
        assert "expenses" in data
        print(f"✓ Listed {len(data['expenses'])} expenses")


class TestMemberFilters:
    """Test member list filters"""
    
    def test_search_members(self, manager_headers):
        """Search members by name"""
        response = requests.get(
            f"{BASE_URL}/api/members?search=Ahmad",
            headers=manager_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "members" in data
        print(f"✓ Search returned {data['total']} members")
    
    def test_filter_inactive_members(self, manager_headers):
        """Filter inactive members"""
        response = requests.get(
            f"{BASE_URL}/api/members?status=inactive",
            headers=manager_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "members" in data
        print(f"✓ Found {data['total']} inactive members")
    
    def test_filter_deleted_members(self, manager_headers):
        """Filter deleted members"""
        response = requests.get(
            f"{BASE_URL}/api/members?status=deleted",
            headers=manager_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "members" in data
        print(f"✓ Found {data['total']} deleted members")


class TestPaymentFilters:
    """Test payment list filters"""
    
    def test_filter_payments_by_status(self, manager_headers):
        """Filter payments by status"""
        response = requests.get(
            f"{BASE_URL}/api/payments?status=paid",
            headers=manager_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "payments" in data
        print(f"✓ Found {data['total']} paid payments")
    
    def test_filter_payments_by_method(self, manager_headers):
        """Filter payments by method"""
        response = requests.get(
            f"{BASE_URL}/api/payments?method=cash",
            headers=manager_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "payments" in data
        print(f"✓ Found {data['total']} cash payments")


class TestMembershipFilters:
    """Test membership list filters"""
    
    def test_filter_memberships_by_status(self, manager_headers):
        """Filter memberships by status"""
        response = requests.get(
            f"{BASE_URL}/api/memberships?status=pending",
            headers=manager_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "memberships" in data
        print(f"✓ Found {data['total']} pending memberships")


class TestTransferActions:
    """Test transfer approval/rejection"""
    
    def test_transfer_to_same_location_fails(self, owner_headers, location_id):
        """Transfer to same location should fail"""
        # Create member
        unique_email = f"test_same_loc_{uuid.uuid4().hex[:8]}@test.com"
        member_resp = requests.post(
            f"{BASE_URL}/api/members?location_id={location_id}",
            headers=owner_headers,
            json={"full_name": "TEST_Same Location", "email": unique_email}
        )
        member_id = member_resp.json()["member_id"]
        
        # Try to transfer to same location
        response = requests.post(
            f"{BASE_URL}/api/members/{member_id}/transfer?location_id={location_id}",
            headers=owner_headers,
            json={
                "member_id": member_id,
                "to_location_id": location_id,
                "reason": "Test"
            }
        )
        assert response.status_code == 400, "Should fail for same location"
        print("✓ Transfer to same location correctly rejected")


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
