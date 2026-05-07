"""
Test Sales Module - Edit/Delete Controls for Teams & Agents
Tests PATCH endpoints for teams and members with RBAC enforcement.
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

# Test data from context
TEST_TEAM_ID = "steam_728e4dda612b"  # TEST_Transfer Target Team
TEST_MEMBER_ID = "stm_04b31d7b7c09"  # Mahmoud Al Farsi, TEAM_LEAD
TEST_LOCATION_ID = "loc_e9ed6e7a9ad4"


@pytest.fixture(scope="module")
def owner_token():
    """Get owner authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": OWNER_EMAIL,
        "password": OWNER_PASSWORD
    })
    assert response.status_code == 200, f"Owner login failed: {response.text}"
    return response.json().get("token")


@pytest.fixture(scope="module")
def manager_token():
    """Get manager authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": MANAGER_EMAIL,
        "password": MANAGER_PASSWORD
    })
    assert response.status_code == 200, f"Manager login failed: {response.text}"
    return response.json().get("token")


@pytest.fixture(scope="module")
def owner_headers(owner_token):
    return {"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def manager_headers(manager_token):
    return {"Authorization": f"Bearer {manager_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def manager_location_id(manager_headers):
    """Get manager's location_id"""
    response = requests.get(f"{BASE_URL}/api/auth/me", headers=manager_headers)
    assert response.status_code == 200
    return response.json().get("location_id")


@pytest.fixture(scope="module")
def owner_locations(owner_headers):
    """Get all owner locations"""
    response = requests.get(f"{BASE_URL}/api/locations", headers=owner_headers)
    assert response.status_code == 200
    return response.json()


class TestTeamUpdateEndpoint:
    """Test PATCH /api/sales/teams/{id} - Update team name, description, team_lead_staff_id"""
    
    def test_owner_can_update_team_name(self, owner_headers):
        """Owner can update team name"""
        # First get current team state
        response = requests.get(f"{BASE_URL}/api/sales/teams/{TEST_TEAM_ID}", headers=owner_headers)
        assert response.status_code == 200
        original_name = response.json().get("name")
        
        # Update name
        new_name = "TEST_Updated Team Name"
        response = requests.patch(
            f"{BASE_URL}/api/sales/teams/{TEST_TEAM_ID}",
            headers=owner_headers,
            json={"name": new_name}
        )
        assert response.status_code == 200, f"Update failed: {response.text}"
        assert response.json().get("name") == new_name
        
        # Restore original name
        requests.patch(
            f"{BASE_URL}/api/sales/teams/{TEST_TEAM_ID}",
            headers=owner_headers,
            json={"name": original_name}
        )
        print("✓ Owner can update team name")
    
    def test_owner_can_update_team_description(self, owner_headers):
        """Owner can update team description"""
        new_desc = "TEST_Updated description for testing"
        response = requests.patch(
            f"{BASE_URL}/api/sales/teams/{TEST_TEAM_ID}",
            headers=owner_headers,
            json={"description": new_desc}
        )
        assert response.status_code == 200
        assert response.json().get("description") == new_desc
        print("✓ Owner can update team description")
    
    def test_update_team_requires_valid_fields(self, owner_headers):
        """Update with no fields returns 400"""
        response = requests.patch(
            f"{BASE_URL}/api/sales/teams/{TEST_TEAM_ID}",
            headers=owner_headers,
            json={}
        )
        assert response.status_code == 400
        print("✓ Update with no fields returns 400")
    
    def test_update_nonexistent_team_returns_404(self, owner_headers):
        """Update nonexistent team returns 404"""
        response = requests.patch(
            f"{BASE_URL}/api/sales/teams/steam_nonexistent",
            headers=owner_headers,
            json={"name": "Test"}
        )
        assert response.status_code == 404
        print("✓ Update nonexistent team returns 404")


class TestTeamDeactivateEndpoint:
    """Test PATCH /api/sales/teams/{id}/deactivate - Soft delete team"""
    
    def test_deactivate_team_sets_is_active_false(self, owner_headers):
        """Deactivating team sets is_active = false"""
        # Create a test team to deactivate
        create_response = requests.post(
            f"{BASE_URL}/api/sales/teams",
            headers=owner_headers,
            json={
                "location_id": TEST_LOCATION_ID,
                "name": "TEST_Team_To_Deactivate",
                "description": "Will be deactivated"
            }
        )
        assert create_response.status_code == 201
        team_id = create_response.json().get("sales_team_id")
        
        # Deactivate
        response = requests.patch(
            f"{BASE_URL}/api/sales/teams/{team_id}/deactivate",
            headers=owner_headers
        )
        assert response.status_code == 200
        assert "deactivated" in response.json().get("message", "").lower()
        
        # Verify team is inactive
        get_response = requests.get(f"{BASE_URL}/api/sales/teams/{team_id}", headers=owner_headers)
        assert get_response.status_code == 200
        assert get_response.json().get("is_active") == False
        print("✓ Deactivate team sets is_active = false")
    
    def test_deactivate_nonexistent_team_returns_404(self, owner_headers):
        """Deactivate nonexistent team returns 404"""
        response = requests.patch(
            f"{BASE_URL}/api/sales/teams/steam_nonexistent/deactivate",
            headers=owner_headers
        )
        assert response.status_code == 404
        print("✓ Deactivate nonexistent team returns 404")


class TestMemberUpdateEndpoint:
    """Test PATCH /api/sales/teams/{teamId}/members/{memberId} - Update member role"""
    
    def test_update_member_role_to_agent(self, owner_headers):
        """Can update member role from TEAM_LEAD to AGENT"""
        # Get current member state
        response = requests.get(f"{BASE_URL}/api/sales/teams/{TEST_TEAM_ID}", headers=owner_headers)
        assert response.status_code == 200
        members = response.json().get("members", [])
        
        if not members:
            pytest.skip("No members in test team")
        
        # Find a member to update
        member = members[0]
        member_id = member.get("sales_team_member_id")
        original_type = member.get("member_type")
        
        # Update to AGENT
        response = requests.patch(
            f"{BASE_URL}/api/sales/teams/{TEST_TEAM_ID}/members/{member_id}",
            headers=owner_headers,
            json={"member_type": "AGENT"}
        )
        assert response.status_code == 200
        assert response.json().get("member_type") == "AGENT"
        
        # Restore original type
        requests.patch(
            f"{BASE_URL}/api/sales/teams/{TEST_TEAM_ID}/members/{member_id}",
            headers=owner_headers,
            json={"member_type": original_type}
        )
        print("✓ Can update member role to AGENT")
    
    def test_update_member_role_to_team_lead(self, owner_headers):
        """Can update member role to TEAM_LEAD (demotes existing lead)"""
        # Get current team state
        response = requests.get(f"{BASE_URL}/api/sales/teams/{TEST_TEAM_ID}", headers=owner_headers)
        assert response.status_code == 200
        members = response.json().get("members", [])
        
        if not members:
            pytest.skip("No members in test team")
        
        member = members[0]
        member_id = member.get("sales_team_member_id")
        
        # Update to TEAM_LEAD
        response = requests.patch(
            f"{BASE_URL}/api/sales/teams/{TEST_TEAM_ID}/members/{member_id}",
            headers=owner_headers,
            json={"member_type": "TEAM_LEAD"}
        )
        assert response.status_code == 200
        assert response.json().get("member_type") == "TEAM_LEAD"
        print("✓ Can update member role to TEAM_LEAD")
    
    def test_update_member_invalid_role_returns_400(self, owner_headers):
        """Invalid member_type returns 400"""
        response = requests.get(f"{BASE_URL}/api/sales/teams/{TEST_TEAM_ID}", headers=owner_headers)
        members = response.json().get("members", [])
        
        if not members:
            pytest.skip("No members in test team")
        
        member_id = members[0].get("sales_team_member_id")
        
        response = requests.patch(
            f"{BASE_URL}/api/sales/teams/{TEST_TEAM_ID}/members/{member_id}",
            headers=owner_headers,
            json={"member_type": "INVALID_ROLE"}
        )
        assert response.status_code == 400
        print("✓ Invalid member_type returns 400")
    
    def test_update_nonexistent_member_returns_404(self, owner_headers):
        """Update nonexistent member returns 404"""
        response = requests.patch(
            f"{BASE_URL}/api/sales/teams/{TEST_TEAM_ID}/members/stm_nonexistent",
            headers=owner_headers,
            json={"member_type": "AGENT"}
        )
        assert response.status_code == 404
        print("✓ Update nonexistent member returns 404")


class TestMemberDeactivateEndpoint:
    """Test PATCH /api/sales/teams/{teamId}/members/{memberId}/deactivate - Remove member"""
    
    def test_deactivate_member_sets_is_active_false(self, owner_headers):
        """Deactivating member sets is_active = false and active_to"""
        # First add a member to deactivate
        # Get available staff
        staff_response = requests.get(
            f"{BASE_URL}/api/sales/available-staff?location_id={TEST_LOCATION_ID}",
            headers=owner_headers
        )
        assert staff_response.status_code == 200
        staff_list = staff_response.json()
        
        if not staff_list:
            pytest.skip("No available staff")
        
        # Find staff not already in team
        team_response = requests.get(f"{BASE_URL}/api/sales/teams/{TEST_TEAM_ID}", headers=owner_headers)
        existing_staff_ids = [m.get("staff_id") for m in team_response.json().get("members", [])]
        
        available_staff = [s for s in staff_list if s.get("staff_id") not in existing_staff_ids]
        if not available_staff:
            pytest.skip("All staff already in team")
        
        staff_id = available_staff[0].get("staff_id")
        
        # Add member
        add_response = requests.post(
            f"{BASE_URL}/api/sales/teams/{TEST_TEAM_ID}/members",
            headers=owner_headers,
            json={"staff_id": staff_id, "member_type": "AGENT"}
        )
        assert add_response.status_code == 201
        member_id = add_response.json().get("sales_team_member_id")
        
        # Deactivate member
        response = requests.patch(
            f"{BASE_URL}/api/sales/teams/{TEST_TEAM_ID}/members/{member_id}/deactivate",
            headers=owner_headers
        )
        assert response.status_code == 200
        assert "removed" in response.json().get("message", "").lower()
        print("✓ Deactivate member sets is_active = false")
    
    def test_deactivate_nonexistent_member_returns_404(self, owner_headers):
        """Deactivate nonexistent member returns 404"""
        response = requests.patch(
            f"{BASE_URL}/api/sales/teams/{TEST_TEAM_ID}/members/stm_nonexistent/deactivate",
            headers=owner_headers
        )
        assert response.status_code == 404
        print("✓ Deactivate nonexistent member returns 404")


class TestRBACOwnerAccess:
    """Test Owner RBAC - Can edit/deactivate any team across all locations"""
    
    def test_owner_can_access_any_owned_location_team(self, owner_headers, owner_locations):
        """Owner can access teams from any owned location"""
        locations = owner_locations
        if not locations:
            pytest.skip("No locations found")
        
        # Get teams from first location
        loc_id = locations[0].get("location_id")
        response = requests.get(
            f"{BASE_URL}/api/sales/teams?location_id={loc_id}",
            headers=owner_headers
        )
        assert response.status_code == 200
        print(f"✓ Owner can access teams from location {loc_id}")
    
    def test_owner_can_update_team_in_any_location(self, owner_headers):
        """Owner can update team in any owned location"""
        # Get a team
        response = requests.get(f"{BASE_URL}/api/sales/teams/{TEST_TEAM_ID}", headers=owner_headers)
        assert response.status_code == 200
        
        # Update it
        response = requests.patch(
            f"{BASE_URL}/api/sales/teams/{TEST_TEAM_ID}",
            headers=owner_headers,
            json={"description": "Owner updated this"}
        )
        assert response.status_code == 200
        print("✓ Owner can update team in any location")


class TestRBACManagerAccess:
    """Test Manager RBAC - Can only edit/deactivate teams in their locationId"""
    
    def test_manager_can_access_own_location_teams(self, manager_headers, manager_location_id):
        """Manager can access teams in their location"""
        response = requests.get(
            f"{BASE_URL}/api/sales/teams",
            headers=manager_headers
        )
        assert response.status_code == 200
        teams = response.json().get("teams", [])
        
        # All teams should be from manager's location
        for team in teams:
            assert team.get("location_id") == manager_location_id
        print(f"✓ Manager can access teams in their location ({manager_location_id})")
    
    def test_manager_can_update_own_location_team(self, manager_headers, manager_location_id):
        """Manager can update team in their location"""
        # Get teams in manager's location
        response = requests.get(f"{BASE_URL}/api/sales/teams", headers=manager_headers)
        teams = response.json().get("teams", [])
        
        if not teams:
            pytest.skip("No teams in manager's location")
        
        team_id = teams[0].get("sales_team_id")
        
        # Update team
        response = requests.patch(
            f"{BASE_URL}/api/sales/teams/{team_id}",
            headers=manager_headers,
            json={"description": "Manager updated this"}
        )
        assert response.status_code == 200
        print("✓ Manager can update team in their location")
    
    def test_manager_cannot_access_other_location_team(self, manager_headers, owner_headers, manager_location_id):
        """Manager cannot access team from other location (403)"""
        # Get all teams as owner
        response = requests.get(f"{BASE_URL}/api/sales/teams", headers=owner_headers)
        all_teams = response.json().get("teams", [])
        
        # Find a team NOT in manager's location
        other_location_teams = [t for t in all_teams if t.get("location_id") != manager_location_id]
        
        if not other_location_teams:
            pytest.skip("No teams in other locations")
        
        other_team_id = other_location_teams[0].get("sales_team_id")
        
        # Try to access as manager
        response = requests.get(
            f"{BASE_URL}/api/sales/teams/{other_team_id}",
            headers=manager_headers
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✓ Manager cannot access team from other location (403)")
    
    def test_manager_cannot_update_other_location_team(self, manager_headers, owner_headers, manager_location_id):
        """Manager cannot update team from other location (403)"""
        # Get all teams as owner
        response = requests.get(f"{BASE_URL}/api/sales/teams", headers=owner_headers)
        all_teams = response.json().get("teams", [])
        
        # Find a team NOT in manager's location
        other_location_teams = [t for t in all_teams if t.get("location_id") != manager_location_id]
        
        if not other_location_teams:
            pytest.skip("No teams in other locations")
        
        other_team_id = other_location_teams[0].get("sales_team_id")
        
        # Try to update as manager
        response = requests.patch(
            f"{BASE_URL}/api/sales/teams/{other_team_id}",
            headers=manager_headers,
            json={"description": "Should fail"}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✓ Manager cannot update team from other location (403)")


class TestRolePromotionDemotion:
    """Test role promotion/demotion logic"""
    
    def test_promoting_to_team_lead_demotes_existing_lead(self, owner_headers):
        """Promoting member to TEAM_LEAD demotes existing team lead to AGENT"""
        # Get team with members
        response = requests.get(f"{BASE_URL}/api/sales/teams/{TEST_TEAM_ID}", headers=owner_headers)
        assert response.status_code == 200
        team = response.json()
        members = team.get("members", [])
        
        if len(members) < 2:
            pytest.skip("Need at least 2 members to test promotion/demotion")
        
        # Find current team lead and an agent
        team_lead = None
        agent = None
        for m in members:
            if m.get("member_type") == "TEAM_LEAD":
                team_lead = m
            elif m.get("member_type") == "AGENT":
                agent = m
        
        if not team_lead or not agent:
            pytest.skip("Need both a team lead and an agent")
        
        # Promote agent to team lead
        response = requests.patch(
            f"{BASE_URL}/api/sales/teams/{TEST_TEAM_ID}/members/{agent['sales_team_member_id']}",
            headers=owner_headers,
            json={"member_type": "TEAM_LEAD"}
        )
        assert response.status_code == 200
        
        # Verify team's team_lead_staff_id updated
        team_response = requests.get(f"{BASE_URL}/api/sales/teams/{TEST_TEAM_ID}", headers=owner_headers)
        updated_team = team_response.json()
        assert updated_team.get("team_lead_staff_id") == agent.get("staff_id")
        
        # Verify old team lead is now AGENT
        for m in updated_team.get("members", []):
            if m.get("sales_team_member_id") == team_lead.get("sales_team_member_id"):
                assert m.get("member_type") == "AGENT"
                break
        
        print("✓ Promoting to TEAM_LEAD demotes existing team lead to AGENT")
        
        # Restore original state
        requests.patch(
            f"{BASE_URL}/api/sales/teams/{TEST_TEAM_ID}/members/{team_lead['sales_team_member_id']}",
            headers=owner_headers,
            json={"member_type": "TEAM_LEAD"}
        )


class TestAPIAuthentication:
    """Test authentication requirements"""
    
    def test_update_team_requires_auth(self):
        """Update team without auth returns 401"""
        response = requests.patch(
            f"{BASE_URL}/api/sales/teams/{TEST_TEAM_ID}",
            json={"name": "Test"}
        )
        assert response.status_code == 401
        print("✓ Update team requires authentication")
    
    def test_deactivate_team_requires_auth(self):
        """Deactivate team without auth returns 401"""
        response = requests.patch(
            f"{BASE_URL}/api/sales/teams/{TEST_TEAM_ID}/deactivate"
        )
        assert response.status_code == 401
        print("✓ Deactivate team requires authentication")
    
    def test_update_member_requires_auth(self):
        """Update member without auth returns 401"""
        response = requests.patch(
            f"{BASE_URL}/api/sales/teams/{TEST_TEAM_ID}/members/{TEST_MEMBER_ID}",
            json={"member_type": "AGENT"}
        )
        assert response.status_code == 401
        print("✓ Update member requires authentication")
    
    def test_deactivate_member_requires_auth(self):
        """Deactivate member without auth returns 401"""
        response = requests.patch(
            f"{BASE_URL}/api/sales/teams/{TEST_TEAM_ID}/members/{TEST_MEMBER_ID}/deactivate"
        )
        assert response.status_code == 401
        print("✓ Deactivate member requires authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
