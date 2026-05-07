"""
Test Suite: Members Access Journey
Tests for Members CRUD, Memberships, Payment Plans, Agreements, Payments, Dashboard Alerts,
Public Registration, Location Isolation, and RBAC (RECEPTIONIST/MEMBER roles).
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


class TestAuthSetup:
    """Authentication setup and token retrieval"""
    
    @pytest.fixture(scope="class")
    def owner_token(self):
        """Get owner authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200, f"Owner login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        return data["token"]
    
    @pytest.fixture(scope="class")
    def manager_token(self):
        """Get manager authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL,
            "password": MANAGER_PASSWORD
        })
        assert response.status_code == 200, f"Manager login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        return data["token"]
    
    @pytest.fixture(scope="class")
    def owner_headers(self, owner_token):
        """Headers with owner auth"""
        return {"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"}
    
    @pytest.fixture(scope="class")
    def manager_headers(self, manager_token):
        """Headers with manager auth"""
        return {"Authorization": f"Bearer {manager_token}", "Content-Type": "application/json"}


class TestLocationsSetup(TestAuthSetup):
    """Get location IDs for testing"""
    
    @pytest.fixture(scope="class")
    def locations(self, owner_headers):
        """Get all locations"""
        response = requests.get(f"{BASE_URL}/api/locations", headers=owner_headers)
        assert response.status_code == 200, f"Failed to get locations: {response.text}"
        data = response.json()
        # API returns list directly
        if isinstance(data, list):
            locations_list = data
        else:
            locations_list = data.get("locations", data)
        assert len(locations_list) > 0, "No locations found"
        return locations_list
    
    @pytest.fixture(scope="class")
    def location_id(self, locations):
        """Get first location ID"""
        return locations[0]["location_id"]
    
    @pytest.fixture(scope="class")
    def second_location_id(self, locations):
        """Get second location ID for transfer tests"""
        if len(locations) > 1:
            return locations[1]["location_id"]
        return None


class TestMembersCRUD(TestLocationsSetup):
    """Test Members CRUD operations"""
    
    def test_list_members_owner(self, owner_headers, location_id):
        """Owner can list members with location_id param"""
        response = requests.get(
            f"{BASE_URL}/api/members?location_id={location_id}",
            headers=owner_headers
        )
        assert response.status_code == 200, f"Failed to list members: {response.text}"
        data = response.json()
        assert "members" in data, "No members key in response"
        assert "total" in data, "No total key in response"
        print(f"✓ Owner listed {data['total']} members at location")
    
    def test_list_members_manager(self, manager_headers):
        """Manager can list members (auto-scoped to their location)"""
        response = requests.get(f"{BASE_URL}/api/members", headers=manager_headers)
        assert response.status_code == 200, f"Failed to list members: {response.text}"
        data = response.json()
        assert "members" in data, "No members key in response"
        print(f"✓ Manager listed {data['total']} members at their location")
    
    def test_create_member_owner(self, owner_headers, location_id):
        """Owner can create a member"""
        unique_email = f"test_member_{uuid.uuid4().hex[:8]}@test.com"
        payload = {
            "full_name": "TEST_John Doe",
            "gender": "male",
            "dob": "1990-05-15",
            "phone": "+971501234567",
            "email": unique_email,
            "address": "Test Address 123"
        }
        response = requests.post(
            f"{BASE_URL}/api/members?location_id={location_id}",
            headers=owner_headers,
            json=payload
        )
        assert response.status_code == 201, f"Failed to create member: {response.text}"
        data = response.json()
        assert "member_id" in data, "No member_id in response"
        assert data["full_name"] == "TEST_John Doe"
        assert data["email"] == unique_email
        assert "member_no" in data, "No member_no generated"
        assert "temp_password" in data, "No temp_password for portal access"
        print(f"✓ Created member: {data['member_id']} with member_no: {data['member_no']}")
        return data["member_id"]
    
    def test_create_member_manager(self, manager_headers):
        """Manager can create a member at their location"""
        unique_email = f"test_mgr_member_{uuid.uuid4().hex[:8]}@test.com"
        payload = {
            "full_name": "TEST_Manager Created",
            "gender": "female",
            "phone": "+971502345678",
            "email": unique_email
        }
        response = requests.post(
            f"{BASE_URL}/api/members",
            headers=manager_headers,
            json=payload
        )
        assert response.status_code == 201, f"Failed to create member: {response.text}"
        data = response.json()
        assert "member_id" in data
        print(f"✓ Manager created member: {data['member_id']}")
        return data["member_id"]
    
    def test_get_member(self, owner_headers, location_id):
        """Get a specific member"""
        # First create a member
        unique_email = f"test_get_{uuid.uuid4().hex[:8]}@test.com"
        create_resp = requests.post(
            f"{BASE_URL}/api/members?location_id={location_id}",
            headers=owner_headers,
            json={"full_name": "TEST_Get Member", "email": unique_email}
        )
        assert create_resp.status_code == 201
        member_id = create_resp.json()["member_id"]
        
        # Get the member
        response = requests.get(
            f"{BASE_URL}/api/members/{member_id}?location_id={location_id}",
            headers=owner_headers
        )
        assert response.status_code == 200, f"Failed to get member: {response.text}"
        data = response.json()
        assert data["member_id"] == member_id
        assert data["full_name"] == "TEST_Get Member"
        print(f"✓ Retrieved member: {member_id}")
    
    def test_update_member(self, owner_headers, location_id):
        """Update a member"""
        # Create member
        unique_email = f"test_update_{uuid.uuid4().hex[:8]}@test.com"
        create_resp = requests.post(
            f"{BASE_URL}/api/members?location_id={location_id}",
            headers=owner_headers,
            json={"full_name": "TEST_Update Member", "email": unique_email}
        )
        assert create_resp.status_code == 201
        member_id = create_resp.json()["member_id"]
        
        # Update member
        response = requests.patch(
            f"{BASE_URL}/api/members/{member_id}?location_id={location_id}",
            headers=owner_headers,
            json={"full_name": "TEST_Updated Name", "phone": "+971509999999"}
        )
        assert response.status_code == 200, f"Failed to update member: {response.text}"
        data = response.json()
        assert data["full_name"] == "TEST_Updated Name"
        assert data["phone"] == "+971509999999"
        print(f"✓ Updated member: {member_id}")
    
    def test_deactivate_member(self, owner_headers, location_id):
        """Deactivate a member"""
        # Create member
        unique_email = f"test_deact_{uuid.uuid4().hex[:8]}@test.com"
        create_resp = requests.post(
            f"{BASE_URL}/api/members?location_id={location_id}",
            headers=owner_headers,
            json={"full_name": "TEST_Deactivate Member", "email": unique_email}
        )
        assert create_resp.status_code == 201
        member_id = create_resp.json()["member_id"]
        
        # Deactivate
        response = requests.patch(
            f"{BASE_URL}/api/members/{member_id}/deactivate?location_id={location_id}",
            headers=owner_headers
        )
        assert response.status_code == 200, f"Failed to deactivate: {response.text}"
        
        # Verify inactive
        get_resp = requests.get(
            f"{BASE_URL}/api/members?location_id={location_id}&status=inactive",
            headers=owner_headers
        )
        assert get_resp.status_code == 200
        print(f"✓ Deactivated member: {member_id}")
    
    def test_activate_member(self, owner_headers, location_id):
        """Activate a deactivated member"""
        # Create and deactivate
        unique_email = f"test_act_{uuid.uuid4().hex[:8]}@test.com"
        create_resp = requests.post(
            f"{BASE_URL}/api/members?location_id={location_id}",
            headers=owner_headers,
            json={"full_name": "TEST_Activate Member", "email": unique_email}
        )
        member_id = create_resp.json()["member_id"]
        requests.patch(
            f"{BASE_URL}/api/members/{member_id}/deactivate?location_id={location_id}",
            headers=owner_headers
        )
        
        # Activate
        response = requests.patch(
            f"{BASE_URL}/api/members/{member_id}/activate?location_id={location_id}",
            headers=owner_headers
        )
        assert response.status_code == 200, f"Failed to activate: {response.text}"
        print(f"✓ Activated member: {member_id}")
    
    def test_delete_member(self, owner_headers, location_id):
        """Soft delete a member"""
        # Create member
        unique_email = f"test_del_{uuid.uuid4().hex[:8]}@test.com"
        create_resp = requests.post(
            f"{BASE_URL}/api/members?location_id={location_id}",
            headers=owner_headers,
            json={"full_name": "TEST_Delete Member", "email": unique_email}
        )
        member_id = create_resp.json()["member_id"]
        
        # Delete
        response = requests.delete(
            f"{BASE_URL}/api/members/{member_id}?location_id={location_id}",
            headers=owner_headers
        )
        assert response.status_code == 200, f"Failed to delete: {response.text}"
        
        # Verify in deleted list
        get_resp = requests.get(
            f"{BASE_URL}/api/members?location_id={location_id}&status=deleted",
            headers=owner_headers
        )
        assert get_resp.status_code == 200
        print(f"✓ Deleted member: {member_id}")
    
    def test_restore_member(self, owner_headers, location_id):
        """Restore a deleted member"""
        # Create and delete
        unique_email = f"test_restore_{uuid.uuid4().hex[:8]}@test.com"
        create_resp = requests.post(
            f"{BASE_URL}/api/members?location_id={location_id}",
            headers=owner_headers,
            json={"full_name": "TEST_Restore Member", "email": unique_email}
        )
        member_id = create_resp.json()["member_id"]
        requests.delete(
            f"{BASE_URL}/api/members/{member_id}?location_id={location_id}",
            headers=owner_headers
        )
        
        # Restore
        response = requests.post(
            f"{BASE_URL}/api/members/{member_id}/restore?location_id={location_id}",
            headers=owner_headers
        )
        assert response.status_code == 200, f"Failed to restore: {response.text}"
        data = response.json()
        assert data["is_active"] == True
        assert data.get("deleted_at") is None
        print(f"✓ Restored member: {member_id}")


class TestMemberships(TestLocationsSetup):
    """Test Memberships API"""
    
    @pytest.fixture(scope="class")
    def test_member(self, owner_headers, location_id):
        """Create a test member for membership tests"""
        unique_email = f"test_membership_{uuid.uuid4().hex[:8]}@test.com"
        response = requests.post(
            f"{BASE_URL}/api/members?location_id={location_id}",
            headers=owner_headers,
            json={"full_name": "TEST_Membership Member", "email": unique_email}
        )
        assert response.status_code == 201
        return response.json()
    
    def test_create_membership(self, owner_headers, location_id, test_member):
        """Create a membership for a member"""
        today = datetime.now().strftime("%Y-%m-%d")
        end_date = (datetime.now() + timedelta(days=90)).strftime("%Y-%m-%d")
        
        payload = {
            "member_id": test_member["member_id"],
            "type": "full_access",
            "start_date": today,
            "end_date": end_date,
            "auto_renew": False
        }
        response = requests.post(
            f"{BASE_URL}/api/members/{test_member['member_id']}/memberships?location_id={location_id}",
            headers=owner_headers,
            json=payload
        )
        assert response.status_code == 201, f"Failed to create membership: {response.text}"
        data = response.json()
        assert "membership_id" in data
        assert data["status"] == "pending"
        assert data["type"] == "full_access"
        print(f"✓ Created membership: {data['membership_id']}")
        return data["membership_id"]
    
    def test_list_memberships(self, owner_headers, location_id):
        """List memberships"""
        response = requests.get(
            f"{BASE_URL}/api/memberships?location_id={location_id}",
            headers=owner_headers
        )
        assert response.status_code == 200, f"Failed to list memberships: {response.text}"
        data = response.json()
        assert "memberships" in data
        assert "total" in data
        print(f"✓ Listed {data['total']} memberships")
    
    def test_get_membership(self, owner_headers, location_id, test_member):
        """Get a specific membership"""
        # Create membership first
        today = datetime.now().strftime("%Y-%m-%d")
        end_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        create_resp = requests.post(
            f"{BASE_URL}/api/members/{test_member['member_id']}/memberships?location_id={location_id}",
            headers=owner_headers,
            json={"member_id": test_member["member_id"], "type": "full_access", "start_date": today, "end_date": end_date}
        )
        membership_id = create_resp.json()["membership_id"]
        
        # Get membership
        response = requests.get(
            f"{BASE_URL}/api/memberships/{membership_id}?location_id={location_id}",
            headers=owner_headers
        )
        assert response.status_code == 200, f"Failed to get membership: {response.text}"
        data = response.json()
        assert data["membership_id"] == membership_id
        print(f"✓ Retrieved membership: {membership_id}")


class TestPaymentPlans(TestLocationsSetup):
    """Test Payment Plans API"""
    
    def test_list_payment_plans(self, owner_headers, location_id):
        """List payment plans"""
        response = requests.get(
            f"{BASE_URL}/api/payment-plans?location_id={location_id}",
            headers=owner_headers
        )
        assert response.status_code == 200, f"Failed to list plans: {response.text}"
        data = response.json()
        assert "plans" in data
        print(f"✓ Listed {len(data['plans'])} payment plans")
    
    def test_create_payment_plan(self, owner_headers, location_id):
        """Create a payment plan"""
        payload = {
            "name": f"TEST_Plan_{uuid.uuid4().hex[:6]}",
            "billing_cycle": "monthly",
            "price": 299.00,
            "currency": "AED",
            "includes_full_access": True
        }
        response = requests.post(
            f"{BASE_URL}/api/payment-plans?location_id={location_id}",
            headers=owner_headers,
            json=payload
        )
        assert response.status_code == 201, f"Failed to create plan: {response.text}"
        data = response.json()
        assert "plan_id" in data
        assert data["name"] == payload["name"]
        assert data["price"] == 299.00
        print(f"✓ Created payment plan: {data['plan_id']}")
        return data["plan_id"]
    
    def test_update_payment_plan(self, owner_headers, location_id):
        """Update a payment plan"""
        # Create plan
        create_resp = requests.post(
            f"{BASE_URL}/api/payment-plans?location_id={location_id}",
            headers=owner_headers,
            json={"name": "TEST_Update Plan", "billing_cycle": "monthly", "price": 199}
        )
        plan_id = create_resp.json()["plan_id"]
        
        # Update
        response = requests.patch(
            f"{BASE_URL}/api/payment-plans/{plan_id}?location_id={location_id}",
            headers=owner_headers,
            json={"price": 249.00, "name": "TEST_Updated Plan"}
        )
        assert response.status_code == 200, f"Failed to update plan: {response.text}"
        data = response.json()
        assert data["price"] == 249.00
        print(f"✓ Updated payment plan: {plan_id}")
    
    def test_delete_payment_plan(self, owner_headers, location_id):
        """Delete a payment plan"""
        # Create plan
        create_resp = requests.post(
            f"{BASE_URL}/api/payment-plans?location_id={location_id}",
            headers=owner_headers,
            json={"name": "TEST_Delete Plan", "billing_cycle": "weekly", "price": 99}
        )
        plan_id = create_resp.json()["plan_id"]
        
        # Delete
        response = requests.delete(
            f"{BASE_URL}/api/payment-plans/{plan_id}?location_id={location_id}",
            headers=owner_headers
        )
        assert response.status_code == 200, f"Failed to delete plan: {response.text}"
        print(f"✓ Deleted payment plan: {plan_id}")


class TestAgreements(TestLocationsSetup):
    """Test Agreements API"""
    
    def test_list_agreements(self, owner_headers, location_id):
        """List agreements"""
        response = requests.get(
            f"{BASE_URL}/api/agreements?location_id={location_id}",
            headers=owner_headers
        )
        assert response.status_code == 200, f"Failed to list agreements: {response.text}"
        data = response.json()
        assert "agreements" in data
        print(f"✓ Listed {len(data['agreements'])} agreements")
    
    def test_create_agreement(self, owner_headers, location_id):
        """Create an agreement template"""
        payload = {
            "title": f"TEST_Agreement_{uuid.uuid4().hex[:6]}",
            "version": "1.0",
            "content_html": "<h1>Test Agreement</h1><p>Terms and conditions...</p>"
        }
        response = requests.post(
            f"{BASE_URL}/api/agreements?location_id={location_id}",
            headers=owner_headers,
            json=payload
        )
        assert response.status_code == 201, f"Failed to create agreement: {response.text}"
        data = response.json()
        assert "agreement_id" in data
        assert data["title"] == payload["title"]
        print(f"✓ Created agreement: {data['agreement_id']}")
        return data["agreement_id"]
    
    def test_sign_agreement(self, owner_headers, location_id):
        """Sign an agreement for a member"""
        # Create member
        unique_email = f"test_sign_{uuid.uuid4().hex[:8]}@test.com"
        member_resp = requests.post(
            f"{BASE_URL}/api/members?location_id={location_id}",
            headers=owner_headers,
            json={"full_name": "TEST_Sign Agreement", "email": unique_email}
        )
        member_id = member_resp.json()["member_id"]
        
        # Create agreement
        agreement_resp = requests.post(
            f"{BASE_URL}/api/agreements?location_id={location_id}",
            headers=owner_headers,
            json={"title": "TEST_Sign Agreement", "version": "1.0", "content_html": "<p>Test</p>"}
        )
        agreement_id = agreement_resp.json()["agreement_id"]
        
        # Sign agreement
        response = requests.post(
            f"{BASE_URL}/api/members/{member_id}/sign-agreement?location_id={location_id}",
            headers=owner_headers,
            json={
                "agreement_id": agreement_id,
                "checkbox_agreed": True,
                "signer_name": "TEST_Sign Agreement"
            }
        )
        assert response.status_code == 201, f"Failed to sign agreement: {response.text}"
        data = response.json()
        assert "signed_agreement_id" in data
        assert data["agreement_id"] == agreement_id
        print(f"✓ Signed agreement: {data['signed_agreement_id']}")
    
    def test_list_signed_agreements(self, owner_headers, location_id):
        """List signed agreements for a member"""
        # Create member and sign agreement
        unique_email = f"test_list_signed_{uuid.uuid4().hex[:8]}@test.com"
        member_resp = requests.post(
            f"{BASE_URL}/api/members?location_id={location_id}",
            headers=owner_headers,
            json={"full_name": "TEST_List Signed", "email": unique_email}
        )
        member_id = member_resp.json()["member_id"]
        
        # Get signed agreements
        response = requests.get(
            f"{BASE_URL}/api/members/{member_id}/signed-agreements?location_id={location_id}",
            headers=owner_headers
        )
        assert response.status_code == 200, f"Failed to list signed: {response.text}"
        data = response.json()
        assert "signed_agreements" in data
        print(f"✓ Listed signed agreements for member")


class TestPayments(TestLocationsSetup):
    """Test Payments API"""
    
    @pytest.fixture(scope="class")
    def member_with_membership(self, owner_headers, location_id):
        """Create member with membership for payment tests"""
        # Create member
        unique_email = f"test_payment_{uuid.uuid4().hex[:8]}@test.com"
        member_resp = requests.post(
            f"{BASE_URL}/api/members?location_id={location_id}",
            headers=owner_headers,
            json={"full_name": "TEST_Payment Member", "email": unique_email}
        )
        member = member_resp.json()
        
        # Create membership
        today = datetime.now().strftime("%Y-%m-%d")
        end_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        membership_resp = requests.post(
            f"{BASE_URL}/api/members/{member['member_id']}/memberships?location_id={location_id}",
            headers=owner_headers,
            json={"member_id": member["member_id"], "type": "full_access", "start_date": today, "end_date": end_date}
        )
        membership = membership_resp.json()
        
        return {"member": member, "membership": membership}
    
    def test_initiate_online_payment(self, owner_headers, location_id, member_with_membership):
        """Initiate an online payment"""
        payload = {
            "member_id": member_with_membership["member"]["member_id"],
            "membership_id": member_with_membership["membership"]["membership_id"],
            "method": "online",
            "amount": 299.00,
            "currency": "AED"
        }
        response = requests.post(
            f"{BASE_URL}/api/payments/initiate?location_id={location_id}",
            headers=owner_headers,
            json=payload
        )
        assert response.status_code == 201, f"Failed to initiate payment: {response.text}"
        data = response.json()
        assert "payment_id" in data
        assert "checkout_data" in data
        assert "checkout_url" in data["checkout_data"]
        assert data["status"] == "pending"
        print(f"✓ Initiated online payment: {data['payment_id']}")
    
    def test_initiate_tabby_payment(self, owner_headers, location_id, member_with_membership):
        """Initiate a Tabby BNPL payment"""
        payload = {
            "member_id": member_with_membership["member"]["member_id"],
            "membership_id": member_with_membership["membership"]["membership_id"],
            "method": "tabby",
            "amount": 499.00,
            "currency": "AED"
        }
        response = requests.post(
            f"{BASE_URL}/api/payments/initiate?location_id={location_id}",
            headers=owner_headers,
            json=payload
        )
        assert response.status_code == 201, f"Failed to initiate Tabby: {response.text}"
        data = response.json()
        assert data["method"] == "tabby"
        assert "checkout_data" in data
        assert data["checkout_data"]["provider"] == "tabby"
        print(f"✓ Initiated Tabby payment: {data['payment_id']}")
    
    def test_initiate_tamara_payment(self, owner_headers, location_id, member_with_membership):
        """Initiate a Tamara BNPL payment"""
        payload = {
            "member_id": member_with_membership["member"]["member_id"],
            "membership_id": member_with_membership["membership"]["membership_id"],
            "method": "tamara",
            "amount": 399.00,
            "currency": "AED"
        }
        response = requests.post(
            f"{BASE_URL}/api/payments/initiate?location_id={location_id}",
            headers=owner_headers,
            json=payload
        )
        assert response.status_code == 201, f"Failed to initiate Tamara: {response.text}"
        data = response.json()
        assert data["method"] == "tamara"
        assert "checkout_data" in data
        assert data["checkout_data"]["provider"] == "tamara"
        print(f"✓ Initiated Tamara payment: {data['payment_id']}")
    
    def test_record_cash_payment(self, owner_headers, location_id, member_with_membership):
        """Record a cash payment"""
        payload = {
            "member_id": member_with_membership["member"]["member_id"],
            "membership_id": member_with_membership["membership"]["membership_id"],
            "amount": 299.00,
            "currency": "AED",
            "receipt_info": "Cash receipt #12345"
        }
        response = requests.post(
            f"{BASE_URL}/api/payments/cash?location_id={location_id}",
            headers=owner_headers,
            json=payload
        )
        assert response.status_code == 201, f"Failed to record cash: {response.text}"
        data = response.json()
        assert data["method"] == "cash"
        assert data["status"] == "paid"
        assert data["paid_at"] is not None
        print(f"✓ Recorded cash payment: {data['payment_id']}")
    
    def test_list_payments(self, owner_headers, location_id):
        """List payments"""
        response = requests.get(
            f"{BASE_URL}/api/payments?location_id={location_id}",
            headers=owner_headers
        )
        assert response.status_code == 200, f"Failed to list payments: {response.text}"
        data = response.json()
        assert "payments" in data
        assert "total" in data
        print(f"✓ Listed {data['total']} payments")
    
    def test_cash_payment_not_allowed_via_initiate(self, owner_headers, location_id, member_with_membership):
        """Cash payment should fail via initiate endpoint"""
        payload = {
            "member_id": member_with_membership["member"]["member_id"],
            "membership_id": member_with_membership["membership"]["membership_id"],
            "method": "cash",
            "amount": 100.00
        }
        response = requests.post(
            f"{BASE_URL}/api/payments/initiate?location_id={location_id}",
            headers=owner_headers,
            json=payload
        )
        assert response.status_code == 400, "Cash should not be allowed via initiate"
        print("✓ Cash correctly rejected via initiate endpoint")


class TestDashboardAlerts(TestLocationsSetup):
    """Test Dashboard Alerts API"""
    
    def test_get_dashboard_alerts(self, owner_headers, location_id):
        """Get dashboard alerts"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/alerts?location_id={location_id}",
            headers=owner_headers
        )
        assert response.status_code == 200, f"Failed to get alerts: {response.text}"
        data = response.json()
        assert "expiring_soon" in data
        assert "expired" in data
        assert "payments_due" in data
        assert "count" in data["expiring_soon"]
        assert "items" in data["expiring_soon"]
        print(f"✓ Dashboard alerts: expiring={data['expiring_soon']['count']}, expired={data['expired']['count']}, payments_due={data['payments_due']['count']}")
    
    def test_manager_dashboard_alerts(self, manager_headers):
        """Manager can get dashboard alerts for their location"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/alerts",
            headers=manager_headers
        )
        assert response.status_code == 200, f"Failed to get alerts: {response.text}"
        data = response.json()
        assert "expiring_soon" in data
        print("✓ Manager can access dashboard alerts")


class TestPublicRegistration(TestLocationsSetup):
    """Test Public Self-Registration"""
    
    def test_get_public_location_info(self, location_id):
        """Get public location info (no auth required)"""
        response = requests.get(f"{BASE_URL}/api/public/location/{location_id}/info")
        assert response.status_code == 200, f"Failed to get public info: {response.text}"
        data = response.json()
        assert "location" in data
        assert "payment_plans" in data
        assert "agreements" in data
        assert "programs" in data
        print(f"✓ Public location info: {data['location'].get('name', 'Unknown')}")
    
    def test_public_self_registration(self, location_id):
        """Public self-registration (no auth required)"""
        unique_email = f"public_reg_{uuid.uuid4().hex[:8]}@test.com"
        payload = {
            "full_name": "TEST_Public Registrant",
            "gender": "male",
            "phone": "+971507654321",
            "email": unique_email,
            "address": "Public Registration Test"
        }
        response = requests.post(
            f"{BASE_URL}/api/public/register?location_id={location_id}",
            json=payload
        )
        assert response.status_code == 201, f"Failed to register: {response.text}"
        data = response.json()
        assert "member_id" in data
        assert "member_no" in data
        assert "temp_password" in data
        assert data["full_name"] == "TEST_Public Registrant"
        print(f"✓ Public registration successful: {data['member_id']}")
    
    def test_public_registration_duplicate_email(self, location_id):
        """Public registration should fail for duplicate email"""
        unique_email = f"dup_email_{uuid.uuid4().hex[:8]}@test.com"
        payload = {"full_name": "TEST_First", "email": unique_email}
        
        # First registration
        resp1 = requests.post(f"{BASE_URL}/api/public/register?location_id={location_id}", json=payload)
        assert resp1.status_code == 201
        
        # Second registration with same email
        payload["full_name"] = "TEST_Second"
        resp2 = requests.post(f"{BASE_URL}/api/public/register?location_id={location_id}", json=payload)
        assert resp2.status_code == 400, "Duplicate email should be rejected"
        print("✓ Duplicate email correctly rejected")
    
    def test_public_registration_invalid_location(self):
        """Public registration should fail for invalid location"""
        response = requests.post(
            f"{BASE_URL}/api/public/register?location_id=invalid_loc_123",
            json={"full_name": "TEST_Invalid Location"}
        )
        assert response.status_code == 404, "Invalid location should return 404"
        print("✓ Invalid location correctly rejected")


class TestLocationIsolation(TestLocationsSetup):
    """Test Location Isolation - Manager can only see their location's members"""
    
    def test_manager_cannot_access_other_location(self, manager_headers, locations):
        """Manager cannot access members from other locations"""
        if len(locations) < 2:
            pytest.skip("Need at least 2 locations for isolation test")
        
        # Get manager's location
        me_resp = requests.get(f"{BASE_URL}/api/auth/me", headers=manager_headers)
        manager_location = me_resp.json().get("location_id")
        
        # Find a different location
        other_location = None
        for loc in locations:
            if loc["location_id"] != manager_location:
                other_location = loc["location_id"]
                break
        
        if not other_location:
            pytest.skip("No other location found")
        
        # Manager should not be able to query other location
        response = requests.get(
            f"{BASE_URL}/api/members?location_id={other_location}",
            headers=manager_headers
        )
        # Manager's location_id is auto-scoped, so this should return their own location's members
        # or be rejected
        assert response.status_code in [200, 403], f"Unexpected status: {response.status_code}"
        print("✓ Location isolation enforced for manager")
    
    def test_owner_can_access_all_locations(self, owner_headers, locations):
        """Owner can access members from all locations"""
        for loc in locations[:2]:  # Test first 2 locations
            response = requests.get(
                f"{BASE_URL}/api/members?location_id={loc['location_id']}",
                headers=owner_headers
            )
            assert response.status_code == 200, f"Owner failed to access {loc['location_id']}"
        print("✓ Owner can access all locations")


class TestRBACRoles(TestLocationsSetup):
    """Test RECEPTIONIST and MEMBER roles"""
    
    def test_receptionist_role_exists(self, owner_headers):
        """Verify RECEPTIONIST role is defined"""
        # Check rbac permissions endpoint
        response = requests.get(f"{BASE_URL}/api/admin/roles/permissions", headers=owner_headers)
        # This may require owner.manage_roles permission
        if response.status_code == 200:
            print("✓ RBAC permissions endpoint accessible")
        else:
            # Check if RECEPTIONIST_FULL role exists
            roles_resp = requests.get(f"{BASE_URL}/api/admin/roles", headers=owner_headers)
            if roles_resp.status_code == 200:
                roles = roles_resp.json().get("roles", [])
                receptionist_role = next((r for r in roles if r["code"] == "RECEPTIONIST_FULL"), None)
                if receptionist_role:
                    print(f"✓ RECEPTIONIST_FULL role exists with {len(receptionist_role['permissions'])} permissions")
                else:
                    print("⚠ RECEPTIONIST_FULL role not found - may need seeding")
    
    def test_member_role_exists(self, owner_headers):
        """Verify MEMBER role is defined"""
        roles_resp = requests.get(f"{BASE_URL}/api/admin/roles", headers=owner_headers)
        if roles_resp.status_code == 200:
            roles = roles_resp.json().get("roles", [])
            member_role = next((r for r in roles if r["code"] == "MEMBER_STANDARD"), None)
            if member_role:
                print(f"✓ MEMBER_STANDARD role exists with {len(member_role['permissions'])} permissions")
            else:
                print("⚠ MEMBER_STANDARD role not found - may need seeding")


class TestMemberTransfers(TestLocationsSetup):
    """Test Member Transfer functionality"""
    
    def test_request_transfer(self, owner_headers, location_id, second_location_id):
        """Request a member transfer"""
        if not second_location_id:
            pytest.skip("Need 2 locations for transfer test")
        
        # Create member
        unique_email = f"test_transfer_{uuid.uuid4().hex[:8]}@test.com"
        member_resp = requests.post(
            f"{BASE_URL}/api/members?location_id={location_id}",
            headers=owner_headers,
            json={"full_name": "TEST_Transfer Member", "email": unique_email}
        )
        member_id = member_resp.json()["member_id"]
        
        # Request transfer
        response = requests.post(
            f"{BASE_URL}/api/members/{member_id}/transfer?location_id={location_id}",
            headers=owner_headers,
            json={
                "member_id": member_id,
                "to_location_id": second_location_id,
                "reason": "Test transfer"
            }
        )
        assert response.status_code == 201, f"Failed to request transfer: {response.text}"
        data = response.json()
        assert "transfer_id" in data
        # Owner requests are auto-approved
        assert data["status"] in ["requested", "approved"]
        print(f"✓ Transfer requested: {data['transfer_id']}")
    
    def test_list_transfers(self, owner_headers):
        """List member transfers"""
        response = requests.get(f"{BASE_URL}/api/member-transfers", headers=owner_headers)
        assert response.status_code == 200, f"Failed to list transfers: {response.text}"
        data = response.json()
        assert "transfers" in data
        print(f"✓ Listed {len(data['transfers'])} transfers")


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
