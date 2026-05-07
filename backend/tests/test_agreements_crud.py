"""
Test Agreements CRUD - Spartans Gym Management
Tests the Agreements management page backend endpoints for location-scoped agreement templates.
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
MANAGER_EMAIL = "manager.sharjah1@spartans.ae"
MANAGER_PASSWORD = "Manager2024!"


class TestAgreementsCRUD:
    """Tests for /api/agreements CRUD endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        """Create authenticated session for manager"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as manager
        login_res = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL,
            "password": MANAGER_PASSWORD
        })
        
        if login_res.status_code != 200:
            pytest.skip(f"Manager login failed: {login_res.status_code}")
        
        token = login_res.json().get("token")
        user = login_res.json().get("user")
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        return {"session": session, "token": token, "user": user}
    
    @pytest.fixture(scope="class")
    def location_id(self, auth_session):
        """Get location_id for the manager"""
        session = auth_session["session"]
        locations_res = session.get(f"{BASE_URL}/api/locations")
        assert locations_res.status_code == 200
        locations = locations_res.json()
        assert len(locations) > 0
        return locations[0]["location_id"]
    
    def test_login_manager(self, auth_session):
        """Test manager login succeeds"""
        assert auth_session["token"] is not None
        assert auth_session["user"]["role"] == "LOCATION_MANAGER"
        print(f"✓ Manager login successful: {auth_session['user']['email']}")
    
    def test_list_agreements(self, auth_session, location_id):
        """Test GET /api/agreements returns agreements list"""
        session = auth_session["session"]
        
        res = session.get(f"{BASE_URL}/api/agreements", params={"location_id": location_id})
        assert res.status_code == 200
        
        data = res.json()
        assert "agreements" in data
        assert isinstance(data["agreements"], list)
        print(f"✓ List agreements returned {len(data['agreements'])} agreements")
    
    def test_list_agreements_with_active_only_false(self, auth_session, location_id):
        """Test GET /api/agreements with active_only=false returns all agreements"""
        session = auth_session["session"]
        
        res = session.get(f"{BASE_URL}/api/agreements", params={
            "location_id": location_id,
            "active_only": False
        })
        assert res.status_code == 200
        
        data = res.json()
        assert "agreements" in data
        print(f"✓ List agreements (including inactive) returned {len(data['agreements'])} agreements")
    
    def test_create_agreement(self, auth_session, location_id):
        """Test POST /api/agreements creates a new agreement"""
        session = auth_session["session"]
        
        unique_id = uuid.uuid4().hex[:8]
        agreement_data = {
            "title": f"TEST_Agreement_{unique_id}",
            "version": "1.0",
            "content_html": f"<p>Test agreement content for testing purposes. ID: {unique_id}</p>"
        }
        
        res = session.post(f"{BASE_URL}/api/agreements", json=agreement_data, params={"location_id": location_id})
        assert res.status_code == 201
        
        created = res.json()
        assert "agreement_id" in created
        assert created["title"] == agreement_data["title"]
        assert created["version"] == agreement_data["version"]
        assert created["content_html"] == agreement_data["content_html"]
        assert created["is_active"] == True
        assert created["location_id"] == location_id
        
        # Store for later tests
        TestAgreementsCRUD.created_agreement_id = created["agreement_id"]
        print(f"✓ Created agreement: {created['agreement_id']}")
        return created
    
    def test_get_created_agreement_in_list(self, auth_session, location_id):
        """Test the created agreement appears in the list"""
        session = auth_session["session"]
        
        res = session.get(f"{BASE_URL}/api/agreements", params={"location_id": location_id})
        assert res.status_code == 200
        
        agreements = res.json()["agreements"]
        agreement_ids = [a["agreement_id"] for a in agreements]
        
        assert hasattr(TestAgreementsCRUD, 'created_agreement_id')
        assert TestAgreementsCRUD.created_agreement_id in agreement_ids
        print(f"✓ Created agreement found in list")
    
    def test_update_agreement(self, auth_session, location_id):
        """Test PATCH /api/agreements/{id} updates the agreement"""
        session = auth_session["session"]
        
        assert hasattr(TestAgreementsCRUD, 'created_agreement_id')
        agreement_id = TestAgreementsCRUD.created_agreement_id
        
        update_data = {
            "title": "TEST_Updated_Agreement",
            "version": "2.0",
            "content_html": "<p>Updated content for the agreement.</p>"
        }
        
        res = session.patch(f"{BASE_URL}/api/agreements/{agreement_id}", json=update_data, params={"location_id": location_id})
        assert res.status_code == 200
        
        updated = res.json()
        assert updated["title"] == update_data["title"]
        assert updated["version"] == update_data["version"]
        assert updated["content_html"] == update_data["content_html"]
        print(f"✓ Updated agreement: {agreement_id}")
    
    def test_toggle_agreement_active_to_inactive(self, auth_session, location_id):
        """Test toggling agreement from active to inactive"""
        session = auth_session["session"]
        
        assert hasattr(TestAgreementsCRUD, 'created_agreement_id')
        agreement_id = TestAgreementsCRUD.created_agreement_id
        
        # Toggle to inactive
        res = session.patch(f"{BASE_URL}/api/agreements/{agreement_id}", json={"is_active": False}, params={"location_id": location_id})
        assert res.status_code == 200
        
        updated = res.json()
        assert updated["is_active"] == False
        print(f"✓ Toggled agreement to inactive")
    
    def test_inactive_agreement_not_in_active_list(self, auth_session, location_id):
        """Test inactive agreement doesn't appear in active_only=true list"""
        session = auth_session["session"]
        
        assert hasattr(TestAgreementsCRUD, 'created_agreement_id')
        agreement_id = TestAgreementsCRUD.created_agreement_id
        
        res = session.get(f"{BASE_URL}/api/agreements", params={"location_id": location_id, "active_only": True})
        assert res.status_code == 200
        
        agreements = res.json()["agreements"]
        agreement_ids = [a["agreement_id"] for a in agreements]
        
        # The inactive agreement should not be in the active-only list
        assert agreement_id not in agreement_ids
        print(f"✓ Inactive agreement correctly excluded from active-only list")
    
    def test_toggle_agreement_back_to_active(self, auth_session, location_id):
        """Test toggling agreement back to active"""
        session = auth_session["session"]
        
        assert hasattr(TestAgreementsCRUD, 'created_agreement_id')
        agreement_id = TestAgreementsCRUD.created_agreement_id
        
        # Toggle back to active
        res = session.patch(f"{BASE_URL}/api/agreements/{agreement_id}", json={"is_active": True}, params={"location_id": location_id})
        assert res.status_code == 200
        
        updated = res.json()
        assert updated["is_active"] == True
        print(f"✓ Toggled agreement back to active")
    
    def test_delete_agreement(self, auth_session, location_id):
        """Test DELETE /api/agreements/{id} soft-deletes the agreement"""
        session = auth_session["session"]
        
        assert hasattr(TestAgreementsCRUD, 'created_agreement_id')
        agreement_id = TestAgreementsCRUD.created_agreement_id
        
        res = session.delete(f"{BASE_URL}/api/agreements/{agreement_id}", params={"location_id": location_id})
        assert res.status_code == 200
        
        data = res.json()
        assert data.get("message") == "Agreement deleted"
        print(f"✓ Deleted agreement: {agreement_id}")
    
    def test_deleted_agreement_not_in_list(self, auth_session, location_id):
        """Test deleted agreement doesn't appear in the active list"""
        session = auth_session["session"]
        
        assert hasattr(TestAgreementsCRUD, 'created_agreement_id')
        agreement_id = TestAgreementsCRUD.created_agreement_id
        
        res = session.get(f"{BASE_URL}/api/agreements", params={"location_id": location_id, "active_only": True})
        assert res.status_code == 200
        
        agreements = res.json()["agreements"]
        agreement_ids = [a["agreement_id"] for a in agreements]
        
        assert agreement_id not in agreement_ids
        print(f"✓ Deleted agreement correctly excluded from list")
    
    def test_update_nonexistent_agreement_returns_404(self, auth_session, location_id):
        """Test updating a non-existent agreement returns 404"""
        session = auth_session["session"]
        
        res = session.patch(f"{BASE_URL}/api/agreements/nonexistent_id", json={"title": "Test"}, params={"location_id": location_id})
        assert res.status_code == 404
        print(f"✓ Update non-existent agreement correctly returns 404")
    
    def test_delete_nonexistent_agreement_returns_404(self, auth_session, location_id):
        """Test deleting a non-existent agreement returns 404"""
        session = auth_session["session"]
        
        res = session.delete(f"{BASE_URL}/api/agreements/nonexistent_id", params={"location_id": location_id})
        assert res.status_code == 404
        print(f"✓ Delete non-existent agreement correctly returns 404")


class TestAgreementsUnauthorized:
    """Tests for unauthorized access to agreements endpoints"""
    
    def test_list_agreements_without_auth(self):
        """Test GET /api/agreements without authentication returns 401"""
        res = requests.get(f"{BASE_URL}/api/agreements")
        assert res.status_code == 401
        print(f"✓ List agreements without auth correctly returns 401")
    
    def test_create_agreement_without_auth(self):
        """Test POST /api/agreements without authentication returns 401"""
        res = requests.post(f"{BASE_URL}/api/agreements", json={"title": "Test"})
        assert res.status_code == 401
        print(f"✓ Create agreement without auth correctly returns 401")


class TestAgreementsInMemberFlow:
    """Tests for agreements in the member registration flow"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        """Create authenticated session for manager"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        login_res = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL,
            "password": MANAGER_PASSWORD
        })
        
        if login_res.status_code != 200:
            pytest.skip(f"Manager login failed: {login_res.status_code}")
        
        token = login_res.json().get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        return session
    
    @pytest.fixture(scope="class")
    def location_id(self, auth_session):
        """Get location_id for the manager"""
        locations_res = auth_session.get(f"{BASE_URL}/api/locations")
        assert locations_res.status_code == 200
        locations = locations_res.json()
        return locations[0]["location_id"]
    
    def test_agreements_available_for_member_step(self, auth_session, location_id):
        """Test that agreements are available for the member agreement step"""
        res = auth_session.get(f"{BASE_URL}/api/agreements", params={"location_id": location_id, "active_only": True})
        assert res.status_code == 200
        
        agreements = res.json()["agreements"]
        
        # There should be agreements available for the member to sign
        # The system should have at least some agreements
        print(f"✓ Found {len(agreements)} active agreements available for member sign-up step")
        
        if len(agreements) > 0:
            # Verify agreement structure
            agreement = agreements[0]
            assert "agreement_id" in agreement
            assert "title" in agreement
            assert "version" in agreement
            print(f"✓ Agreement structure is correct: {agreement['title']} v{agreement.get('version', 'N/A')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
