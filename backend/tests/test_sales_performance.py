"""
Sales Performance Metrics API Tests
Tests the GET /api/sales/performance endpoint with various filters and RBAC.
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

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


class TestSalesPerformanceAPI:
    """Test GET /api/sales/performance endpoint"""

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

    def test_performance_endpoint_returns_correct_structure(self, owner_session):
        """Test GET /api/sales/performance returns correct response structure"""
        response = owner_session.get(f"{BASE_URL}/api/sales/performance")
        assert response.status_code == 200
        data = response.json()
        
        # Validate top-level structure
        assert "summary" in data, "Missing 'summary' in response"
        assert "agent_stats" in data, "Missing 'agent_stats' in response"
        assert "team_stats" in data, "Missing 'team_stats' in response"
        assert "filters_applied" in data, "Missing 'filters_applied' in response"
        
        # Validate summary structure
        summary = data["summary"]
        assert "total_leads" in summary, "Missing 'total_leads' in summary"
        assert "leads_by_status" in summary, "Missing 'leads_by_status' in summary"
        assert "conversion_rate" in summary, "Missing 'conversion_rate' in summary"
        assert "memberships_sold_count" in summary, "Missing 'memberships_sold_count' in summary"
        assert "memberships_total_value" in summary, "Missing 'memberships_total_value' in summary"
        
        # Validate leads_by_status has all 7 statuses
        status_keys = ["NEW", "CONTACTED", "FOLLOW_UP", "TRIAL_BOOKED", "TRIAL_COMPLETED", "WON", "LOST"]
        for status in status_keys:
            assert status in summary["leads_by_status"], f"Missing status '{status}' in leads_by_status"
        
        print(f"Performance API structure validated. Total leads: {summary['total_leads']}")

    def test_performance_summary_values(self, owner_session):
        """Test that summary values are correctly calculated"""
        response = owner_session.get(f"{BASE_URL}/api/sales/performance")
        assert response.status_code == 200
        data = response.json()
        summary = data["summary"]
        
        # Validate data types
        assert isinstance(summary["total_leads"], int), "total_leads should be int"
        assert isinstance(summary["conversion_rate"], (int, float)), "conversion_rate should be numeric"
        assert isinstance(summary["memberships_sold_count"], int), "memberships_sold_count should be int"
        assert isinstance(summary["memberships_total_value"], (int, float)), "memberships_total_value should be numeric"
        
        # Validate conversion rate calculation
        total = summary["total_leads"]
        won = summary["leads_by_status"]["WON"]
        if total > 0:
            expected_rate = round((won / total) * 100, 1)
            assert summary["conversion_rate"] == expected_rate, f"Conversion rate mismatch: {summary['conversion_rate']} vs {expected_rate}"
        
        # Validate memberships_sold_count equals WON count
        assert summary["memberships_sold_count"] == won, "memberships_sold_count should equal WON count"
        
        print(f"Summary values validated: {summary['total_leads']} leads, {summary['conversion_rate']}% conversion")

    def test_performance_agent_stats_structure(self, owner_session):
        """Test agent_stats array structure"""
        response = owner_session.get(f"{BASE_URL}/api/sales/performance")
        assert response.status_code == 200
        data = response.json()
        
        agent_stats = data["agent_stats"]
        assert isinstance(agent_stats, list), "agent_stats should be a list"
        
        if agent_stats:
            agent = agent_stats[0]
            # Validate agent stat structure
            assert "agent_staff_id" in agent, "Missing agent_staff_id"
            assert "agent" in agent, "Missing agent info"
            assert "team" in agent, "Missing team info"
            assert "total_leads" in agent, "Missing total_leads"
            assert "leads_by_status" in agent, "Missing leads_by_status"
            assert "conversion_rate" in agent, "Missing conversion_rate"
            assert "memberships_sold_count" in agent, "Missing memberships_sold_count"
            assert "memberships_total_value" in agent, "Missing memberships_total_value"
            assert "last_activity_date" in agent, "Missing last_activity_date"
            
            print(f"Agent stats validated. {len(agent_stats)} agents found")
        else:
            print("No agent stats available (no leads assigned to agents)")

    def test_performance_team_stats_structure(self, owner_session):
        """Test team_stats array structure"""
        response = owner_session.get(f"{BASE_URL}/api/sales/performance")
        assert response.status_code == 200
        data = response.json()
        
        team_stats = data["team_stats"]
        assert isinstance(team_stats, list), "team_stats should be a list"
        
        if team_stats:
            team = team_stats[0]
            # Validate team stat structure
            assert "team_id" in team, "Missing team_id"
            assert "team" in team, "Missing team info"
            assert "total_leads" in team, "Missing total_leads"
            assert "won_count" in team, "Missing won_count"
            assert "lost_count" in team, "Missing lost_count"
            assert "conversion_rate" in team, "Missing conversion_rate"
            assert "memberships_total_value" in team, "Missing memberships_total_value"
            
            print(f"Team stats validated. {len(team_stats)} teams found")
        else:
            print("No team stats available (no leads assigned to teams)")


class TestPerformanceFilters:
    """Test performance API filters"""

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

    def test_filter_by_location(self, owner_session):
        """Test filtering by location_id"""
        response = owner_session.get(f"{BASE_URL}/api/sales/performance", params={
            "location_id": LOCATION_MALIHA
        })
        assert response.status_code == 200
        data = response.json()
        
        # Verify filter was applied
        assert data["filters_applied"]["location_id"] == LOCATION_MALIHA
        print(f"Location filter applied: {LOCATION_MALIHA}")

    def test_filter_by_team(self, owner_session):
        """Test filtering by team_id"""
        # First get a team ID
        teams_resp = owner_session.get(f"{BASE_URL}/api/sales/teams")
        teams = teams_resp.json().get("teams", [])
        
        if not teams:
            pytest.skip("No teams available for testing")
        
        team_id = teams[0]["sales_team_id"]
        response = owner_session.get(f"{BASE_URL}/api/sales/performance", params={
            "team_id": team_id
        })
        assert response.status_code == 200
        data = response.json()
        
        # Verify filter was applied
        assert data["filters_applied"]["team_id"] == team_id
        print(f"Team filter applied: {team_id}")

    def test_filter_by_date_range(self, owner_session):
        """Test filtering by date_from and date_to"""
        # Last 30 days
        date_to = datetime.now().isoformat()
        date_from = (datetime.now() - timedelta(days=30)).isoformat()
        
        response = owner_session.get(f"{BASE_URL}/api/sales/performance", params={
            "date_from": date_from,
            "date_to": date_to
        })
        assert response.status_code == 200
        data = response.json()
        
        # Verify filters were applied
        assert data["filters_applied"]["date_from"] == date_from
        assert data["filters_applied"]["date_to"] == date_to
        print(f"Date filter applied: {date_from} to {date_to}")

    def test_filter_this_week(self, owner_session):
        """Test 'this week' date preset"""
        now = datetime.now()
        day = now.weekday()
        start_of_week = now - timedelta(days=day)
        start_of_week = start_of_week.replace(hour=0, minute=0, second=0, microsecond=0)
        
        response = owner_session.get(f"{BASE_URL}/api/sales/performance", params={
            "date_from": start_of_week.isoformat(),
            "date_to": now.isoformat()
        })
        assert response.status_code == 200
        print("This week filter works correctly")

    def test_filter_this_month(self, owner_session):
        """Test 'this month' date preset"""
        now = datetime.now()
        start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        response = owner_session.get(f"{BASE_URL}/api/sales/performance", params={
            "date_from": start_of_month.isoformat(),
            "date_to": now.isoformat()
        })
        assert response.status_code == 200
        print("This month filter works correctly")

    def test_filter_all_time(self, owner_session):
        """Test 'all time' (no date filter)"""
        response = owner_session.get(f"{BASE_URL}/api/sales/performance")
        assert response.status_code == 200
        data = response.json()
        
        # No date filters should be applied
        assert data["filters_applied"]["date_from"] is None
        assert data["filters_applied"]["date_to"] is None
        print("All time filter works correctly")

    def test_combined_filters(self, owner_session):
        """Test combining multiple filters"""
        date_from = (datetime.now() - timedelta(days=30)).isoformat()
        
        response = owner_session.get(f"{BASE_URL}/api/sales/performance", params={
            "location_id": LOCATION_MALIHA,
            "date_from": date_from
        })
        assert response.status_code == 200
        data = response.json()
        
        assert data["filters_applied"]["location_id"] == LOCATION_MALIHA
        assert data["filters_applied"]["date_from"] == date_from
        print("Combined filters work correctly")


class TestManagerRBAC:
    """Test Manager RBAC - location scoping enforced server-side"""

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

    def test_manager_auto_scoped_to_location(self, manager_session):
        """Test that manager is automatically scoped to their location"""
        response = manager_session.get(f"{BASE_URL}/api/sales/performance")
        assert response.status_code == 200
        data = response.json()
        
        # Manager should see their location in filters_applied
        # Manager at Maliha should be scoped to Maliha
        assert data["filters_applied"]["location_id"] == LOCATION_MALIHA, \
            f"Manager should be scoped to Maliha, got: {data['filters_applied']['location_id']}"
        print(f"Manager correctly scoped to location: {data['filters_applied']['location_id']}")

    def test_manager_location_param_ignored(self, manager_session):
        """Test that location_id param is ignored for manager (server-enforced)"""
        # Try to pass a different location_id
        response = manager_session.get(f"{BASE_URL}/api/sales/performance", params={
            "location_id": LOCATION_CITYGATE  # Different location
        })
        assert response.status_code == 200
        data = response.json()
        
        # Should still be scoped to manager's location (Maliha), not Citygate
        assert data["filters_applied"]["location_id"] == LOCATION_MALIHA, \
            "Manager's location_id param should be ignored - server enforces their location"
        print("Manager location_id param correctly ignored - server enforces RBAC")

    def test_manager_can_filter_by_team(self, manager_session):
        """Test that manager can filter by team within their location"""
        # Get teams at manager's location
        teams_resp = manager_session.get(f"{BASE_URL}/api/sales/teams")
        teams = teams_resp.json().get("teams", [])
        
        if not teams:
            pytest.skip("No teams at manager's location")
        
        team_id = teams[0]["sales_team_id"]
        response = manager_session.get(f"{BASE_URL}/api/sales/performance", params={
            "team_id": team_id
        })
        assert response.status_code == 200
        data = response.json()
        
        assert data["filters_applied"]["team_id"] == team_id
        print(f"Manager can filter by team: {team_id}")

    def test_manager_can_filter_by_date(self, manager_session):
        """Test that manager can filter by date range"""
        date_from = (datetime.now() - timedelta(days=7)).isoformat()
        
        response = manager_session.get(f"{BASE_URL}/api/sales/performance", params={
            "date_from": date_from
        })
        assert response.status_code == 200
        data = response.json()
        
        assert data["filters_applied"]["date_from"] == date_from
        print("Manager can filter by date range")


class TestOwnerRBAC:
    """Test Owner RBAC - can see all locations with filters"""

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

    def test_owner_sees_all_locations_by_default(self, owner_session):
        """Test that owner sees all locations when no filter applied"""
        response = owner_session.get(f"{BASE_URL}/api/sales/performance")
        assert response.status_code == 200
        data = response.json()
        
        # Owner should see null location_id (all locations)
        assert data["filters_applied"]["location_id"] is None, \
            "Owner should see all locations by default"
        print("Owner sees all locations by default")

    def test_owner_can_filter_by_any_location(self, owner_session):
        """Test that owner can filter by any owned location"""
        # Test Maliha
        response1 = owner_session.get(f"{BASE_URL}/api/sales/performance", params={
            "location_id": LOCATION_MALIHA
        })
        assert response1.status_code == 200
        assert response1.json()["filters_applied"]["location_id"] == LOCATION_MALIHA
        
        # Test Citygate
        response2 = owner_session.get(f"{BASE_URL}/api/sales/performance", params={
            "location_id": LOCATION_CITYGATE
        })
        assert response2.status_code == 200
        assert response2.json()["filters_applied"]["location_id"] == LOCATION_CITYGATE
        
        print("Owner can filter by any owned location")

    def test_owner_cannot_access_unowned_location(self, owner_session):
        """Test that owner cannot access locations they don't own"""
        # Use a fake location ID
        response = owner_session.get(f"{BASE_URL}/api/sales/performance", params={
            "location_id": "loc_fake_not_owned"
        })
        # Should return 403 Access denied
        assert response.status_code == 403, \
            f"Expected 403 for unowned location, got {response.status_code}"
        print("Owner correctly blocked from unowned locations")


class TestUnauthenticatedAccess:
    """Test that unauthenticated users cannot access performance API"""

    def test_unauthenticated_blocked(self):
        """Test that unauthenticated request returns 401"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        response = session.get(f"{BASE_URL}/api/sales/performance")
        assert response.status_code == 401, \
            f"Expected 401 for unauthenticated, got {response.status_code}"
        print("Unauthenticated access correctly blocked")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
