"""
Analytics Dashboard Backend Tests

Tests:
- Owner can access analytics endpoint
- Manager is blocked with 403
- Analytics data structure validation
- Metrics values validation
- Charts data validation
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:8001')


class TestAnalyticsDashboard:
    """Test Analytics Dashboard API for Owner"""
    
    @pytest.fixture(scope="class")
    def owner_token(self):
        """Get owner authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "owner@spartans.com", "password": "Spartans2024!"}
        )
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Owner authentication failed")
    
    @pytest.fixture(scope="class")
    def manager_token(self):
        """Get manager authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "manager.sharjah1@spartans.ae", "password": "Manager2024!"}
        )
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Manager authentication failed")
    
    def test_owner_can_access_analytics(self, owner_token):
        """Owner should be able to access analytics endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/owner-dashboard",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "metrics" in data, "Response should contain 'metrics'"
        assert "members_growth" in data, "Response should contain 'members_growth'"
        assert "revenue_by_month" in data, "Response should contain 'revenue_by_month'"
    
    def test_manager_blocked_from_analytics(self, manager_token):
        """Manager should NOT be able to access analytics (403)"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/owner-dashboard",
            headers={"Authorization": f"Bearer {manager_token}"}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        data = response.json()
        assert "detail" in data
        assert "owner" in data["detail"].lower() or "access" in data["detail"].lower()
    
    def test_unauthenticated_blocked_from_analytics(self):
        """Unauthenticated requests should be blocked"""
        response = requests.get(f"{BASE_URL}/api/analytics/owner-dashboard")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
    
    def test_analytics_metrics_structure(self, owner_token):
        """Verify metrics structure contains required fields"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/owner-dashboard",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        assert response.status_code == 200
        metrics = response.json()["metrics"]
        
        required_fields = [
            "total_active_members",
            "new_members_this_month",
            "total_instructors",
            "total_programs",
            "total_active_schedules",
            "monthly_payroll",
            "monthly_expenses",
            "attendance_rate",
            "total_bookings",
            "total_locations"
        ]
        
        for field in required_fields:
            assert field in metrics, f"Metrics should contain '{field}'"
            assert isinstance(metrics[field], (int, float)), f"'{field}' should be numeric"
    
    def test_analytics_metrics_values(self, owner_token):
        """Verify metrics have expected values"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/owner-dashboard",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        assert response.status_code == 200
        metrics = response.json()["metrics"]
        
        # Check specific expected values
        assert metrics["total_active_members"] == 12, f"Expected 12 active members, got {metrics['total_active_members']}"
        assert metrics["total_instructors"] == 6, f"Expected 6 instructors, got {metrics['total_instructors']}"
        assert metrics["total_programs"] == 25, f"Expected 25 programs, got {metrics['total_programs']}"
        assert metrics["total_locations"] == 3, f"Expected 3 locations, got {metrics['total_locations']}"
        assert metrics["attendance_rate"] == 90, f"Expected 90% attendance rate, got {metrics['attendance_rate']}"
    
    def test_members_growth_chart_data(self, owner_token):
        """Verify members growth chart has 6 months data"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/owner-dashboard",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        assert response.status_code == 200
        members_growth = response.json()["members_growth"]
        
        assert len(members_growth) == 6, f"Expected 6 months, got {len(members_growth)}"
        for item in members_growth:
            assert "month" in item, "Each item should have 'month'"
            assert "members" in item, "Each item should have 'members'"
            assert isinstance(item["members"], int), "'members' should be integer"
    
    def test_revenue_by_month_chart_data(self, owner_token):
        """Verify revenue by month chart has 6 months with payroll/expenses"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/owner-dashboard",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        assert response.status_code == 200
        revenue = response.json()["revenue_by_month"]
        
        assert len(revenue) == 6, f"Expected 6 months, got {len(revenue)}"
        for item in revenue:
            assert "month" in item, "Each item should have 'month'"
            assert "payroll" in item, "Each item should have 'payroll'"
            assert "expenses" in item, "Each item should have 'expenses'"
    
    def test_attendance_by_program_chart_data(self, owner_token):
        """Verify attendance by program data structure"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/owner-dashboard",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        assert response.status_code == 200
        attendance = response.json()["attendance_by_program"]
        
        assert isinstance(attendance, list), "attendance_by_program should be a list"
        for item in attendance:
            assert "program" in item, "Each item should have 'program'"
            assert "attendance" in item, "Each item should have 'attendance'"
    
    def test_top_programs_chart_data(self, owner_token):
        """Verify top programs data (max 5)"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/owner-dashboard",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        assert response.status_code == 200
        top_programs = response.json()["top_programs"]
        
        assert isinstance(top_programs, list), "top_programs should be a list"
        assert len(top_programs) <= 5, f"Should be max 5 programs, got {len(top_programs)}"
        for item in top_programs:
            assert "program" in item, "Each item should have 'program'"
            assert "enrollments" in item, "Each item should have 'enrollments'"
    
    def test_location_breakdown_data(self, owner_token):
        """Verify location breakdown has 3 locations"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/owner-dashboard",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        assert response.status_code == 200
        locations = response.json()["location_stats"]
        
        assert len(locations) == 3, f"Expected 3 locations, got {len(locations)}"
        for loc in locations:
            assert "name" in loc, "Each location should have 'name'"
            assert "members" in loc, "Each location should have 'members'"
            assert "staff" in loc, "Each location should have 'staff'"
            assert "programs" in loc, "Each location should have 'programs'"


class TestInstructorLifecycle:
    """Test Instructor Data Lifecycle API"""
    
    @pytest.fixture(scope="class")
    def manager_token(self):
        """Get manager authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "manager.sharjah1@spartans.ae", "password": "Manager2024!"}
        )
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Manager authentication failed")
    
    def test_list_active_instructors(self, manager_token):
        """Filter instructors by is_active=true"""
        response = requests.get(
            f"{BASE_URL}/api/instructors?is_active=true",
            headers={"Authorization": f"Bearer {manager_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Active instructors should have is_active=True and no deleted_at
        for instructor in data:
            assert instructor.get("is_active") is True or instructor.get("deleted_at") is None
    
    def test_list_inactive_instructors(self, manager_token):
        """Filter instructors by is_active=false"""
        response = requests.get(
            f"{BASE_URL}/api/instructors?is_active=false",
            headers={"Authorization": f"Bearer {manager_token}"}
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_list_deleted_instructors(self, manager_token):
        """Filter instructors by include_deleted=true"""
        response = requests.get(
            f"{BASE_URL}/api/instructors?include_deleted=true",
            headers={"Authorization": f"Bearer {manager_token}"}
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)


class TestScheduleLifecycle:
    """Test Schedule Data Lifecycle API"""
    
    @pytest.fixture(scope="class")
    def manager_token(self):
        """Get manager authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "manager.sharjah1@spartans.ae", "password": "Manager2024!"}
        )
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Manager authentication failed")
    
    def test_list_active_schedules(self, manager_token):
        """Filter schedules by is_active=true"""
        response = requests.get(
            f"{BASE_URL}/api/class-schedules?is_active=true",
            headers={"Authorization": f"Bearer {manager_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_list_inactive_schedules(self, manager_token):
        """Filter schedules by is_active=false"""
        response = requests.get(
            f"{BASE_URL}/api/class-schedules?is_active=false",
            headers={"Authorization": f"Bearer {manager_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should have multiple inactive schedules
        assert len(data) > 0, "Should have inactive schedules"
    
    def test_list_deleted_schedules(self, manager_token):
        """Filter schedules by include_deleted=true"""
        response = requests.get(
            f"{BASE_URL}/api/class-schedules?include_deleted=true",
            headers={"Authorization": f"Bearer {manager_token}"}
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
