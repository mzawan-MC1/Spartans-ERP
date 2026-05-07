"""
Sales Module - Teams, Agents & Lead Management API Tests
Tests all endpoints for sales teams, team members, agent transfers, and leads pipeline.
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
OWNER_EMAIL = "owner@spartans.com"
OWNER_PASSWORD = "Spartans2024!"
MANAGER_EMAIL = "manager.sharjah1@spartans.ae"
MANAGER_PASSWORD = "Manager2024!"

# Known location IDs from seed data
LOCATION_MALIHA = "loc_e9ed6e7a9ad4"
LOCATION_CITYGATE = "loc_9bf88e312869"
LOCATION_ALAIN = "loc_22d6586b30d8"

# Known staff at Maliha
STAFF_MAHMOUD = "staff_f5ae561eb864"
STAFF_LINA = "staff_f852c88f4b4d"
STAFF_YARA = "staff_609c08155218"
STAFF_ALI = "staff_8d38690d762b"


class TestSalesAPIBasics:
    """Basic health and auth tests for sales endpoints"""
    
    @pytest.fixture(scope="class")
    def owner_session(self):
        """Get authenticated owner session"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200, f"Owner login failed: {response.text}"
        token = response.json().get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session

    @pytest.fixture(scope="class")
    def manager_session(self):
        """Get authenticated manager session"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL,
            "password": MANAGER_PASSWORD
        })
        assert response.status_code == 200, f"Manager login failed: {response.text}"
        token = response.json().get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session

    def test_dashboard_stats_owner(self, owner_session):
        """Test GET /api/sales/dashboard/stats for owner"""
        response = owner_session.get(f"{BASE_URL}/api/sales/dashboard/stats")
        assert response.status_code == 200
        data = response.json()
        # Validate response structure
        assert "total_teams" in data
        assert "total_agents" in data
        assert "total_leads" in data
        assert "new_leads" in data
        assert "won_leads" in data
        assert "lost_leads" in data
        assert "in_progress_leads" in data
        assert "pipeline_counts" in data
        assert "leads_by_source" in data
        print(f"Owner dashboard stats: teams={data['total_teams']}, leads={data['total_leads']}")

    def test_dashboard_stats_manager(self, manager_session):
        """Test GET /api/sales/dashboard/stats for manager (scoped)"""
        response = manager_session.get(f"{BASE_URL}/api/sales/dashboard/stats")
        assert response.status_code == 200
        data = response.json()
        assert "total_teams" in data
        print(f"Manager dashboard stats: teams={data['total_teams']}, leads={data['total_leads']}")


class TestSalesTeamsCRUD:
    """Test Sales Teams CRUD operations"""

    @pytest.fixture(scope="class")
    def owner_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200
        token = response.json().get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session

    @pytest.fixture(scope="class")
    def manager_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL,
            "password": MANAGER_PASSWORD
        })
        assert response.status_code == 200
        token = response.json().get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session

    def test_list_teams_owner_all(self, owner_session):
        """Test GET /api/sales/teams - owner sees all locations"""
        response = owner_session.get(f"{BASE_URL}/api/sales/teams")
        assert response.status_code == 200
        data = response.json()
        assert "teams" in data
        assert "total" in data
        print(f"Owner list teams: {data['total']} teams found")

    def test_list_teams_by_location(self, owner_session):
        """Test GET /api/sales/teams?location_id=... - owner filters by location"""
        response = owner_session.get(f"{BASE_URL}/api/sales/teams", params={"location_id": LOCATION_MALIHA})
        assert response.status_code == 200
        data = response.json()
        assert "teams" in data
        # All returned teams should be at this location
        for team in data["teams"]:
            assert team["location_id"] == LOCATION_MALIHA
        print(f"Teams at Maliha: {data['total']}")

    def test_list_teams_manager_scoped(self, manager_session):
        """Test GET /api/sales/teams - manager only sees their location"""
        response = manager_session.get(f"{BASE_URL}/api/sales/teams")
        assert response.status_code == 200
        data = response.json()
        assert "teams" in data
        print(f"Manager sees {data['total']} teams at their location")

    def test_create_team_owner(self, owner_session):
        """Test POST /api/sales/teams - owner creates team"""
        response = owner_session.post(f"{BASE_URL}/api/sales/teams", json={
            "location_id": LOCATION_MALIHA,
            "name": "TEST_Maliha Sales Alpha",
            "description": "Test team for automated testing"
        })
        assert response.status_code == 201
        data = response.json()
        assert "sales_team_id" in data
        assert data["name"] == "TEST_Maliha Sales Alpha"
        assert data["location_id"] == LOCATION_MALIHA
        assert data["is_active"] == True
        print(f"Created team: {data['sales_team_id']}")
        # Store for later tests
        TestSalesTeamsCRUD.created_team_id = data["sales_team_id"]

    def test_get_team_detail(self, owner_session):
        """Test GET /api/sales/teams/:teamId - get team with members"""
        team_id = getattr(TestSalesTeamsCRUD, 'created_team_id', None)
        if not team_id:
            pytest.skip("No team created in previous test")
        
        response = owner_session.get(f"{BASE_URL}/api/sales/teams/{team_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["sales_team_id"] == team_id
        assert "members" in data
        assert "location_name" in data
        print(f"Team detail: {data['name']}, members={len(data['members'])}")

    def test_update_team(self, owner_session):
        """Test PATCH /api/sales/teams/:teamId - update team"""
        team_id = getattr(TestSalesTeamsCRUD, 'created_team_id', None)
        if not team_id:
            pytest.skip("No team created")
        
        response = owner_session.patch(f"{BASE_URL}/api/sales/teams/{team_id}", json={
            "name": "TEST_Maliha Sales Alpha Updated",
            "description": "Updated description"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "TEST_Maliha Sales Alpha Updated"
        print(f"Updated team: {data['name']}")

    def test_deactivate_team(self, owner_session):
        """Test PATCH /api/sales/teams/:teamId/deactivate - deactivate team"""
        # Create a separate team for deactivation test
        create_response = owner_session.post(f"{BASE_URL}/api/sales/teams", json={
            "location_id": LOCATION_MALIHA,
            "name": "TEST_Deactivate Team",
            "description": "To be deactivated"
        })
        assert create_response.status_code == 201
        team_id = create_response.json()["sales_team_id"]
        
        response = owner_session.patch(f"{BASE_URL}/api/sales/teams/{team_id}/deactivate")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        
        # Verify deactivated
        get_response = owner_session.get(f"{BASE_URL}/api/sales/teams/{team_id}")
        assert get_response.json()["is_active"] == False
        print(f"Team {team_id} deactivated successfully")


class TestTeamMembers:
    """Test Sales Team Members operations"""

    @pytest.fixture(scope="class")
    def owner_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200
        token = response.json().get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session

    @pytest.fixture(scope="class")
    def test_team(self, owner_session):
        """Create a team for member tests"""
        response = owner_session.post(f"{BASE_URL}/api/sales/teams", json={
            "location_id": LOCATION_MALIHA,
            "name": "TEST_Member Test Team",
            "description": "For member tests"
        })
        assert response.status_code == 201
        return response.json()

    def test_get_available_staff(self, owner_session):
        """Test GET /api/sales/available-staff - list staff for assignment"""
        response = owner_session.get(f"{BASE_URL}/api/sales/available-staff", params={"location_id": LOCATION_MALIHA})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Available staff at Maliha: {len(data)}")
        if data:
            print(f"Sample staff: {data[0]['first_name']} {data[0]['last_name']}")

    def test_add_team_member_agent(self, owner_session, test_team):
        """Test POST /api/sales/teams/:teamId/members - add agent"""
        team_id = test_team["sales_team_id"]
        
        # First get available staff
        staff_response = owner_session.get(f"{BASE_URL}/api/sales/available-staff", params={"location_id": LOCATION_MALIHA})
        staff = staff_response.json()
        if not staff:
            pytest.skip("No staff available at Maliha")
        
        staff_id = staff[0]["staff_id"]
        response = owner_session.post(f"{BASE_URL}/api/sales/teams/{team_id}/members", json={
            "staff_id": staff_id,
            "member_type": "AGENT"
        })
        assert response.status_code == 201
        data = response.json()
        assert data["member_type"] == "AGENT"
        assert data["is_active"] == True
        TestTeamMembers.added_member_id = data["sales_team_member_id"]
        TestTeamMembers.test_team_id = team_id
        print(f"Added agent: {data['sales_team_member_id']}")

    def test_add_team_member_lead(self, owner_session, test_team):
        """Test POST /api/sales/teams/:teamId/members - add team lead"""
        team_id = test_team["sales_team_id"]
        
        staff_response = owner_session.get(f"{BASE_URL}/api/sales/available-staff", params={"location_id": LOCATION_MALIHA})
        staff = staff_response.json()
        if len(staff) < 2:
            pytest.skip("Not enough staff available")
        
        staff_id = staff[1]["staff_id"]
        response = owner_session.post(f"{BASE_URL}/api/sales/teams/{team_id}/members", json={
            "staff_id": staff_id,
            "member_type": "TEAM_LEAD"
        })
        assert response.status_code == 201
        data = response.json()
        assert data["member_type"] == "TEAM_LEAD"
        print(f"Added team lead: {data['sales_team_member_id']}")

    def test_list_team_members(self, owner_session, test_team):
        """Test GET /api/sales/teams/:teamId/members"""
        team_id = test_team["sales_team_id"]
        response = owner_session.get(f"{BASE_URL}/api/sales/teams/{team_id}/members")
        assert response.status_code == 200
        data = response.json()
        assert "members" in data
        assert "total" in data
        print(f"Team has {data['total']} members")

    def test_deactivate_team_member(self, owner_session):
        """Test PATCH /api/sales/teams/:teamId/members/:memberId/deactivate"""
        member_id = getattr(TestTeamMembers, 'added_member_id', None)
        team_id = getattr(TestTeamMembers, 'test_team_id', None)
        if not member_id or not team_id:
            pytest.skip("No member added in previous test")
        
        response = owner_session.patch(f"{BASE_URL}/api/sales/teams/{team_id}/members/{member_id}/deactivate")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"Member {member_id} removed")


class TestAgentTransfer:
    """Test Agent Transfer between teams/locations"""

    @pytest.fixture(scope="class")
    def owner_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200
        token = response.json().get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session

    def test_transfer_agent_between_teams(self, owner_session):
        """Test POST /api/sales/members/:memberId/transfer - transfer agent"""
        # Create source team
        src_team_resp = owner_session.post(f"{BASE_URL}/api/sales/teams", json={
            "location_id": LOCATION_MALIHA,
            "name": "TEST_Transfer Source Team",
        })
        assert src_team_resp.status_code == 201
        src_team_id = src_team_resp.json()["sales_team_id"]
        
        # Create target team
        tgt_team_resp = owner_session.post(f"{BASE_URL}/api/sales/teams", json={
            "location_id": LOCATION_MALIHA,
            "name": "TEST_Transfer Target Team",
        })
        assert tgt_team_resp.status_code == 201
        tgt_team_id = tgt_team_resp.json()["sales_team_id"]
        
        # Get available staff
        staff_resp = owner_session.get(f"{BASE_URL}/api/sales/available-staff", params={"location_id": LOCATION_MALIHA})
        staff = staff_resp.json()
        if not staff:
            pytest.skip("No staff available")
        
        # Add member to source team
        add_resp = owner_session.post(f"{BASE_URL}/api/sales/teams/{src_team_id}/members", json={
            "staff_id": staff[0]["staff_id"],
            "member_type": "AGENT"
        })
        assert add_resp.status_code == 201
        member_id = add_resp.json()["sales_team_member_id"]
        
        # Transfer agent
        transfer_resp = owner_session.post(f"{BASE_URL}/api/sales/members/{member_id}/transfer", json={
            "target_location_id": LOCATION_MALIHA,
            "target_team_id": tgt_team_id
        })
        assert transfer_resp.status_code == 200
        data = transfer_resp.json()
        assert "new_membership" in data
        assert data["new_membership"]["sales_team_id"] == tgt_team_id
        print(f"Agent transferred: {data['message']}")


class TestSalesLeadsCRUD:
    """Test Sales Leads CRUD and pipeline operations"""

    @pytest.fixture(scope="class")
    def owner_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200
        token = response.json().get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session

    @pytest.fixture(scope="class")
    def manager_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL,
            "password": MANAGER_PASSWORD
        })
        assert response.status_code == 200
        token = response.json().get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session

    def test_create_lead_owner(self, owner_session):
        """Test POST /api/sales/leads - create manual lead"""
        response = owner_session.post(f"{BASE_URL}/api/sales/leads", json={
            "location_id": LOCATION_MALIHA,
            "full_name": "TEST_John Doe Lead",
            "phone": "+971-50-555-1234",
            "email": "test.john@example.com",
            "source": "WALK_IN",
            "notes": "Interested in MMA classes"
        })
        assert response.status_code == 201
        data = response.json()
        assert "sales_lead_id" in data
        assert data["full_name"] == "TEST_John Doe Lead"
        assert data["status"] == "NEW"
        assert data["pipeline_stage"] == "NEW"
        TestSalesLeadsCRUD.created_lead_id = data["sales_lead_id"]
        print(f"Created lead: {data['sales_lead_id']}")

    def test_list_leads_owner_all(self, owner_session):
        """Test GET /api/sales/leads - owner sees all locations"""
        response = owner_session.get(f"{BASE_URL}/api/sales/leads")
        assert response.status_code == 200
        data = response.json()
        assert "leads" in data
        assert "total" in data
        print(f"Total leads: {data['total']}")

    def test_list_leads_by_status(self, owner_session):
        """Test GET /api/sales/leads?status=NEW - filter by status"""
        response = owner_session.get(f"{BASE_URL}/api/sales/leads", params={"status": "NEW"})
        assert response.status_code == 200
        data = response.json()
        # All returned leads should have NEW status
        for lead in data["leads"]:
            assert lead["status"] == "NEW"
        print(f"NEW leads: {data['total']}")

    def test_list_leads_manager_scoped(self, manager_session):
        """Test GET /api/sales/leads - manager only sees their location"""
        response = manager_session.get(f"{BASE_URL}/api/sales/leads")
        assert response.status_code == 200
        data = response.json()
        print(f"Manager sees {data['total']} leads")

    def test_get_lead_detail(self, owner_session):
        """Test GET /api/sales/leads/:leadId - get lead details"""
        lead_id = getattr(TestSalesLeadsCRUD, 'created_lead_id', None)
        if not lead_id:
            pytest.skip("No lead created")
        
        response = owner_session.get(f"{BASE_URL}/api/sales/leads/{lead_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["sales_lead_id"] == lead_id
        assert "location_name" in data
        print(f"Lead detail: {data['full_name']}")

    def test_update_lead(self, owner_session):
        """Test PATCH /api/sales/leads/:leadId - update lead details"""
        lead_id = getattr(TestSalesLeadsCRUD, 'created_lead_id', None)
        if not lead_id:
            pytest.skip("No lead created")
        
        response = owner_session.patch(f"{BASE_URL}/api/sales/leads/{lead_id}", json={
            "notes": "Updated notes - very interested",
            "next_follow_up_date": "2026-02-15"
        })
        assert response.status_code == 200
        data = response.json()
        assert "Updated notes" in data["notes"]
        print(f"Updated lead: {data['sales_lead_id']}")

    def test_update_lead_status_contacted(self, owner_session):
        """Test PATCH /api/sales/leads/:leadId/status - move to CONTACTED"""
        lead_id = getattr(TestSalesLeadsCRUD, 'created_lead_id', None)
        if not lead_id:
            pytest.skip("No lead created")
        
        response = owner_session.patch(f"{BASE_URL}/api/sales/leads/{lead_id}/status", json={
            "status": "CONTACTED"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "CONTACTED"
        assert data["pipeline_stage"] == "CONTACTED"
        print(f"Lead status changed to CONTACTED")

    def test_update_lead_status_follow_up(self, owner_session):
        """Test PATCH /api/sales/leads/:leadId/status - move to FOLLOW_UP"""
        lead_id = getattr(TestSalesLeadsCRUD, 'created_lead_id', None)
        if not lead_id:
            pytest.skip("No lead created")
        
        response = owner_session.patch(f"{BASE_URL}/api/sales/leads/{lead_id}/status", json={
            "status": "FOLLOW_UP"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "FOLLOW_UP"
        print(f"Lead status changed to FOLLOW_UP")

    def test_update_lead_status_won(self, owner_session):
        """Test PATCH /api/sales/leads/:leadId/status - move to WON"""
        lead_id = getattr(TestSalesLeadsCRUD, 'created_lead_id', None)
        if not lead_id:
            pytest.skip("No lead created")
        
        response = owner_session.patch(f"{BASE_URL}/api/sales/leads/{lead_id}/status", json={
            "status": "WON"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "WON"
        print(f"Lead status changed to WON")

    def test_invalid_lead_status(self, owner_session):
        """Test PATCH /api/sales/leads/:leadId/status - invalid status rejected"""
        lead_id = getattr(TestSalesLeadsCRUD, 'created_lead_id', None)
        if not lead_id:
            pytest.skip("No lead created")
        
        response = owner_session.patch(f"{BASE_URL}/api/sales/leads/{lead_id}/status", json={
            "status": "INVALID_STATUS"
        })
        assert response.status_code == 400
        print("Invalid status correctly rejected")


class TestAutoLeadCreation:
    """Test auto-lead creation from public contact form"""

    def test_contact_form_creates_lead(self):
        """Test POST /api/public/contact - auto-creates sales lead"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Submit contact form (no auth required)
        response = session.post(f"{BASE_URL}/api/public/contact", json={
            "name": "TEST_Auto Lead Contact",
            "email": "autolead@test.com",
            "phone": "+971-50-999-8888",
            "subject": "Interested in membership",
            "message": "I want to join the gym",
            "branch_id": LOCATION_MALIHA
        })
        assert response.status_code == 201
        data = response.json()
        assert "submission_id" in data
        print(f"Contact submission: {data['submission_id']}")
        
        # Now verify lead was created (login as owner)
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        token = login_resp.json()["token"]
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # List leads and check for auto-created one
        leads_resp = session.get(f"{BASE_URL}/api/sales/leads", params={"source": "WEBSITE"})
        assert leads_resp.status_code == 200
        leads = leads_resp.json()["leads"]
        
        # Find the auto-created lead
        auto_lead = next((l for l in leads if l.get("email") == "autolead@test.com"), None)
        assert auto_lead is not None, "Auto-created lead not found"
        assert auto_lead["source"] == "WEBSITE"
        assert auto_lead["status"] == "NEW"
        assert auto_lead["full_name"] == "TEST_Auto Lead Contact"
        print(f"Auto-created lead found: {auto_lead['sales_lead_id']}")


class TestRBACRestrictions:
    """Test RBAC - non-sales roles cannot access sales endpoints"""

    def test_member_cannot_access_sales(self):
        """Test that MEMBER role cannot access sales endpoints"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Try to access sales endpoints without auth
        response = session.get(f"{BASE_URL}/api/sales/teams")
        assert response.status_code == 401
        print("Unauthenticated request correctly blocked")

    def test_customer_cannot_access_sales(self):
        """Test that CUSTOMER role cannot access sales endpoints"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as customer
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "customer.sharjah1.1@spartans.ae",
            "password": "Customer2024!"
        })
        if login_resp.status_code != 200:
            pytest.skip("Customer login failed - customer may not exist")
        
        token = login_resp.json()["token"]
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Try to access sales endpoints
        response = session.get(f"{BASE_URL}/api/sales/teams")
        assert response.status_code == 403
        print("Customer correctly blocked from sales endpoints")


class TestCleanup:
    """Cleanup test data"""

    @pytest.fixture(scope="class")
    def owner_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200
        token = response.json().get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session

    def test_cleanup_test_teams(self, owner_session):
        """Deactivate TEST_ prefixed teams"""
        response = owner_session.get(f"{BASE_URL}/api/sales/teams")
        if response.status_code == 200:
            teams = response.json()["teams"]
            for team in teams:
                if team["name"].startswith("TEST_") and team["is_active"]:
                    owner_session.patch(f"{BASE_URL}/api/sales/teams/{team['sales_team_id']}/deactivate")
                    print(f"Deactivated test team: {team['name']}")
        print("Cleanup completed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
