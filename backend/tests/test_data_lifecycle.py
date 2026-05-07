"""
Test Data Lifecycle Management - is_active toggle and soft delete/restore
Tests for Staff, Categories, Programs, and Users

Features tested:
- is_active toggle (activate/deactivate)
- Soft delete (sets deleted_at timestamp)
- Restore (clears deleted_at)
- List filtering by status (active/inactive/deleted)
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
OWNER_EMAIL = "owner@spartans.com"
OWNER_PASSWORD = "Spartans2024!"
MANAGER_EMAIL = "manager.sharjah1@spartans.ae"
MANAGER_PASSWORD = "Manager2024!"


class TestAuth:
    """Authentication tests"""
    
    @pytest.fixture(scope="class")
    def owner_token(self):
        """Get owner auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200, f"Owner login failed: {response.text}"
        data = response.json()
        assert "token" in data
        return data["token"]
    
    @pytest.fixture(scope="class")
    def manager_token(self):
        """Get manager auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL,
            "password": MANAGER_PASSWORD
        })
        assert response.status_code == 200, f"Manager login failed: {response.text}"
        data = response.json()
        assert "token" in data
        return data["token"]
    
    @pytest.fixture(scope="class")
    def location_id(self, owner_token):
        """Get first location ID"""
        response = requests.get(f"{BASE_URL}/api/locations", headers={
            "Authorization": f"Bearer {owner_token}"
        })
        assert response.status_code == 200
        locations = response.json()
        assert len(locations) > 0, "No locations found"
        return locations[0]["location_id"]
    
    def test_owner_login(self, owner_token):
        """Test owner can login"""
        assert owner_token is not None
        print(f"Owner token obtained successfully")
    
    def test_manager_login(self, manager_token):
        """Test manager can login"""
        assert manager_token is not None
        print(f"Manager token obtained successfully")


class TestStaffLifecycle:
    """Staff CRUD with is_active toggle and soft delete/restore"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get manager auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL,
            "password": MANAGER_PASSWORD
        })
        assert response.status_code == 200
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    @pytest.fixture(scope="class")
    def test_staff_id(self, auth_headers):
        """Create a test staff member for lifecycle tests"""
        staff_data = {
            "first_name": "TEST_Lifecycle",
            "last_name": "Staff",
            "email": f"test.lifecycle.{datetime.now().timestamp()}@spartans.ae",
            "phone": "+971-50-999-9999",
            "role": "INSTRUCTOR",
            "employment_type": "FULL_TIME",
            "join_date": "2024-01-01",
            "pay_structure": {"type": "FIXED_SALARY", "base_amount": 5000, "currency": "AED"}
        }
        response = requests.post(f"{BASE_URL}/api/staff", json=staff_data, headers=auth_headers)
        assert response.status_code == 201, f"Failed to create staff: {response.text}"
        data = response.json()
        assert "staff_id" in data
        assert data["is_active"] == True
        assert data.get("deleted_at") is None
        print(f"Created test staff: {data['staff_id']}")
        return data["staff_id"]
    
    def test_staff_list_active_only(self, auth_headers):
        """Test listing only active staff (default)"""
        response = requests.get(f"{BASE_URL}/api/staff?is_active=true", headers=auth_headers)
        assert response.status_code == 200
        staff = response.json()
        # All returned staff should be active and not deleted
        for s in staff:
            assert s.get("is_active") == True
            assert s.get("deleted_at") is None
        print(f"Found {len(staff)} active staff members")
    
    def test_staff_deactivate(self, auth_headers, test_staff_id):
        """Test deactivating staff (is_active = false)"""
        response = requests.patch(
            f"{BASE_URL}/api/staff/{test_staff_id}",
            json={"is_active": False},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_active"] == False
        assert data.get("deleted_at") is None  # Not deleted, just inactive
        print(f"Staff {test_staff_id} deactivated successfully")
    
    def test_staff_list_inactive(self, auth_headers, test_staff_id):
        """Test listing inactive staff"""
        response = requests.get(f"{BASE_URL}/api/staff?is_active=false", headers=auth_headers)
        assert response.status_code == 200
        staff = response.json()
        # Should find our deactivated staff
        found = any(s["staff_id"] == test_staff_id for s in staff)
        assert found, f"Deactivated staff {test_staff_id} not found in inactive list"
        print(f"Found {len(staff)} inactive staff members")
    
    def test_staff_activate(self, auth_headers, test_staff_id):
        """Test reactivating staff (is_active = true)"""
        response = requests.patch(
            f"{BASE_URL}/api/staff/{test_staff_id}",
            json={"is_active": True},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_active"] == True
        print(f"Staff {test_staff_id} reactivated successfully")
    
    def test_staff_soft_delete(self, auth_headers, test_staff_id):
        """Test soft deleting staff (sets deleted_at)"""
        response = requests.delete(f"{BASE_URL}/api/staff/{test_staff_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"Staff {test_staff_id} soft deleted")
    
    def test_staff_list_deleted(self, auth_headers, test_staff_id):
        """Test listing deleted staff with include_deleted=true"""
        response = requests.get(f"{BASE_URL}/api/staff?include_deleted=true", headers=auth_headers)
        assert response.status_code == 200
        staff = response.json()
        # Should find our deleted staff
        deleted_staff = [s for s in staff if s.get("deleted_at") is not None]
        found = any(s["staff_id"] == test_staff_id for s in deleted_staff)
        assert found, f"Deleted staff {test_staff_id} not found in deleted list"
        print(f"Found {len(deleted_staff)} deleted staff members")
    
    def test_staff_not_in_default_list(self, auth_headers, test_staff_id):
        """Test deleted staff not in default list"""
        response = requests.get(f"{BASE_URL}/api/staff", headers=auth_headers)
        assert response.status_code == 200
        staff = response.json()
        # Should NOT find our deleted staff in default list
        found = any(s["staff_id"] == test_staff_id for s in staff)
        assert not found, f"Deleted staff {test_staff_id} should not appear in default list"
        print("Deleted staff correctly excluded from default list")
    
    def test_staff_restore(self, auth_headers, test_staff_id):
        """Test restoring soft-deleted staff"""
        response = requests.post(f"{BASE_URL}/api/staff/{test_staff_id}/restore", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("deleted_at") is None
        assert data["is_active"] == True
        print(f"Staff {test_staff_id} restored successfully")
    
    def test_staff_in_list_after_restore(self, auth_headers, test_staff_id):
        """Test restored staff appears in default list"""
        response = requests.get(f"{BASE_URL}/api/staff", headers=auth_headers)
        assert response.status_code == 200
        staff = response.json()
        found = any(s["staff_id"] == test_staff_id for s in staff)
        assert found, f"Restored staff {test_staff_id} should appear in default list"
        print("Restored staff correctly appears in default list")


class TestCategoryLifecycle:
    """Categories CRUD with is_active toggle and soft delete/restore"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get manager auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL,
            "password": MANAGER_PASSWORD
        })
        assert response.status_code == 200
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    @pytest.fixture(scope="class")
    def test_category_id(self, auth_headers):
        """Create a test category for lifecycle tests"""
        cat_data = {
            "name": f"TEST_Lifecycle_Category_{datetime.now().timestamp()}",
            "description": "Test category for lifecycle testing",
            "age_group": "Adults",
            "skill_level": "all"
        }
        response = requests.post(f"{BASE_URL}/api/program-categories", json=cat_data, headers=auth_headers)
        assert response.status_code == 201, f"Failed to create category: {response.text}"
        data = response.json()
        assert "category_id" in data
        assert data["is_active"] == True
        assert data.get("deleted_at") is None
        print(f"Created test category: {data['category_id']}")
        return data["category_id"]
    
    def test_category_list_active_only(self, auth_headers):
        """Test listing only active categories"""
        response = requests.get(f"{BASE_URL}/api/program-categories?is_active=true", headers=auth_headers)
        assert response.status_code == 200
        categories = response.json()
        for c in categories:
            assert c.get("is_active") == True
            assert c.get("deleted_at") is None
        print(f"Found {len(categories)} active categories")
    
    def test_category_deactivate(self, auth_headers, test_category_id):
        """Test deactivating category"""
        response = requests.patch(
            f"{BASE_URL}/api/program-categories/{test_category_id}",
            json={"is_active": False},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_active"] == False
        print(f"Category {test_category_id} deactivated")
    
    def test_category_list_inactive(self, auth_headers, test_category_id):
        """Test listing inactive categories"""
        response = requests.get(f"{BASE_URL}/api/program-categories?is_active=false", headers=auth_headers)
        assert response.status_code == 200
        categories = response.json()
        found = any(c["category_id"] == test_category_id for c in categories)
        assert found, f"Deactivated category {test_category_id} not found"
        print(f"Found {len(categories)} inactive categories")
    
    def test_category_activate(self, auth_headers, test_category_id):
        """Test reactivating category"""
        response = requests.patch(
            f"{BASE_URL}/api/program-categories/{test_category_id}",
            json={"is_active": True},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_active"] == True
        print(f"Category {test_category_id} reactivated")
    
    def test_category_soft_delete(self, auth_headers, test_category_id):
        """Test soft deleting category"""
        response = requests.delete(f"{BASE_URL}/api/program-categories/{test_category_id}", headers=auth_headers)
        assert response.status_code == 200
        print(f"Category {test_category_id} soft deleted")
    
    def test_category_list_deleted(self, auth_headers, test_category_id):
        """Test listing deleted categories"""
        response = requests.get(f"{BASE_URL}/api/program-categories?include_deleted=true", headers=auth_headers)
        assert response.status_code == 200
        categories = response.json()
        deleted = [c for c in categories if c.get("deleted_at") is not None]
        found = any(c["category_id"] == test_category_id for c in deleted)
        assert found, f"Deleted category {test_category_id} not found"
        print(f"Found {len(deleted)} deleted categories")
    
    def test_category_restore(self, auth_headers, test_category_id):
        """Test restoring soft-deleted category"""
        response = requests.post(f"{BASE_URL}/api/program-categories/{test_category_id}/restore", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("deleted_at") is None
        print(f"Category {test_category_id} restored")


class TestProgramLifecycle:
    """Programs CRUD with is_active toggle and soft delete/restore"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get manager auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL,
            "password": MANAGER_PASSWORD
        })
        assert response.status_code == 200
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    @pytest.fixture(scope="class")
    def active_category_id(self, auth_headers):
        """Get an active category for program creation"""
        response = requests.get(f"{BASE_URL}/api/program-categories?is_active=true", headers=auth_headers)
        assert response.status_code == 200
        categories = response.json()
        active_cats = [c for c in categories if c.get("is_active") and not c.get("deleted_at")]
        assert len(active_cats) > 0, "No active categories found"
        return active_cats[0]["category_id"]
    
    @pytest.fixture(scope="class")
    def test_program_id(self, auth_headers, active_category_id):
        """Create a test program for lifecycle tests"""
        prog_data = {
            "category_id": active_category_id,
            "name": f"TEST_Lifecycle_Program_{datetime.now().timestamp()}",
            "description": "Test program for lifecycle testing",
            "capacity": 20,
            "difficulty_level": "beginner"
        }
        response = requests.post(f"{BASE_URL}/api/programs", json=prog_data, headers=auth_headers)
        assert response.status_code == 201, f"Failed to create program: {response.text}"
        data = response.json()
        assert "program_id" in data
        assert data["is_active"] == True
        assert data.get("deleted_at") is None
        print(f"Created test program: {data['program_id']}")
        return data["program_id"]
    
    def test_program_list_active_only(self, auth_headers):
        """Test listing only active programs"""
        response = requests.get(f"{BASE_URL}/api/programs?is_active=true", headers=auth_headers)
        assert response.status_code == 200
        programs = response.json()
        for p in programs:
            assert p.get("is_active") == True
            assert p.get("deleted_at") is None
        print(f"Found {len(programs)} active programs")
    
    def test_program_deactivate(self, auth_headers, test_program_id):
        """Test deactivating program"""
        response = requests.patch(
            f"{BASE_URL}/api/programs/{test_program_id}",
            json={"is_active": False},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_active"] == False
        print(f"Program {test_program_id} deactivated")
    
    def test_program_list_inactive(self, auth_headers, test_program_id):
        """Test listing inactive programs"""
        response = requests.get(f"{BASE_URL}/api/programs?is_active=false", headers=auth_headers)
        assert response.status_code == 200
        programs = response.json()
        found = any(p["program_id"] == test_program_id for p in programs)
        assert found, f"Deactivated program {test_program_id} not found"
        print(f"Found {len(programs)} inactive programs")
    
    def test_program_activate(self, auth_headers, test_program_id):
        """Test reactivating program"""
        response = requests.patch(
            f"{BASE_URL}/api/programs/{test_program_id}",
            json={"is_active": True},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_active"] == True
        print(f"Program {test_program_id} reactivated")
    
    def test_program_soft_delete(self, auth_headers, test_program_id):
        """Test soft deleting program"""
        response = requests.delete(f"{BASE_URL}/api/programs/{test_program_id}", headers=auth_headers)
        assert response.status_code == 200
        print(f"Program {test_program_id} soft deleted")
    
    def test_program_list_deleted(self, auth_headers, test_program_id):
        """Test listing deleted programs"""
        response = requests.get(f"{BASE_URL}/api/programs?include_deleted=true", headers=auth_headers)
        assert response.status_code == 200
        programs = response.json()
        deleted = [p for p in programs if p.get("deleted_at") is not None]
        found = any(p["program_id"] == test_program_id for p in deleted)
        assert found, f"Deleted program {test_program_id} not found"
        print(f"Found {len(deleted)} deleted programs")
    
    def test_program_restore(self, auth_headers, test_program_id):
        """Test restoring soft-deleted program"""
        response = requests.post(f"{BASE_URL}/api/programs/{test_program_id}/restore", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("deleted_at") is None
        print(f"Program {test_program_id} restored")


class TestUserLifecycle:
    """User Management with is_active toggle and soft delete/restore (Owner only)"""
    
    @pytest.fixture(scope="class")
    def owner_headers(self):
        """Get owner auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    @pytest.fixture(scope="class")
    def location_id(self, owner_headers):
        """Get first location ID"""
        response = requests.get(f"{BASE_URL}/api/locations", headers=owner_headers)
        assert response.status_code == 200
        locations = response.json()
        assert len(locations) > 0
        return locations[0]["location_id"]
    
    @pytest.fixture(scope="class")
    def test_user_id(self, owner_headers, location_id):
        """Create a test user for lifecycle tests"""
        user_data = {
            "first_name": "TEST_Lifecycle",
            "last_name": "User",
            "email": f"test.lifecycle.{datetime.now().timestamp()}@spartans.ae",
            "password": "TestPass123!",
            "role": "LOCATION_MANAGER",
            "manager_location_ids": [location_id]
        }
        response = requests.post(f"{BASE_URL}/api/admin/users", json=user_data, headers=owner_headers)
        assert response.status_code == 201, f"Failed to create user: {response.text}"
        data = response.json()
        assert "user_id" in data
        assert data["is_active"] == True
        assert data.get("deleted_at") is None
        print(f"Created test user: {data['user_id']}")
        return data["user_id"]
    
    def test_user_list_active_only(self, owner_headers):
        """Test listing only active users"""
        response = requests.get(f"{BASE_URL}/api/admin/users?is_active=true", headers=owner_headers)
        assert response.status_code == 200
        data = response.json()
        users = data.get("users", [])
        for u in users:
            assert u.get("is_active") == True
            assert u.get("deleted_at") is None
        print(f"Found {len(users)} active users")
    
    def test_user_deactivate(self, owner_headers, test_user_id):
        """Test deactivating user"""
        response = requests.patch(
            f"{BASE_URL}/api/admin/users/{test_user_id}/deactivate",
            headers=owner_headers
        )
        assert response.status_code == 200
        print(f"User {test_user_id} deactivated")
        
        # Verify deactivation
        response = requests.get(f"{BASE_URL}/api/admin/users/{test_user_id}", headers=owner_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["is_active"] == False
    
    def test_user_list_inactive(self, owner_headers, test_user_id):
        """Test listing inactive users"""
        response = requests.get(f"{BASE_URL}/api/admin/users?is_active=false", headers=owner_headers)
        assert response.status_code == 200
        data = response.json()
        users = data.get("users", [])
        found = any(u["user_id"] == test_user_id for u in users)
        assert found, f"Deactivated user {test_user_id} not found"
        print(f"Found {len(users)} inactive users")
    
    def test_user_activate(self, owner_headers, test_user_id):
        """Test reactivating user"""
        response = requests.patch(
            f"{BASE_URL}/api/admin/users/{test_user_id}/activate",
            headers=owner_headers
        )
        assert response.status_code == 200
        print(f"User {test_user_id} reactivated")
        
        # Verify activation
        response = requests.get(f"{BASE_URL}/api/admin/users/{test_user_id}", headers=owner_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["is_active"] == True
    
    def test_user_soft_delete(self, owner_headers, test_user_id):
        """Test soft deleting user"""
        response = requests.delete(f"{BASE_URL}/api/admin/users/{test_user_id}", headers=owner_headers)
        assert response.status_code == 200
        print(f"User {test_user_id} soft deleted")
    
    def test_user_list_deleted(self, owner_headers, test_user_id):
        """Test listing deleted users"""
        response = requests.get(f"{BASE_URL}/api/admin/users?include_deleted=true", headers=owner_headers)
        assert response.status_code == 200
        data = response.json()
        users = data.get("users", [])
        deleted = [u for u in users if u.get("deleted_at") is not None]
        found = any(u["user_id"] == test_user_id for u in deleted)
        assert found, f"Deleted user {test_user_id} not found"
        print(f"Found {len(deleted)} deleted users")
    
    def test_user_not_in_default_list(self, owner_headers, test_user_id):
        """Test deleted user not in default list"""
        response = requests.get(f"{BASE_URL}/api/admin/users", headers=owner_headers)
        assert response.status_code == 200
        data = response.json()
        users = data.get("users", [])
        found = any(u["user_id"] == test_user_id for u in users)
        assert not found, f"Deleted user {test_user_id} should not appear in default list"
        print("Deleted user correctly excluded from default list")
    
    def test_user_restore(self, owner_headers, test_user_id):
        """Test restoring soft-deleted user"""
        response = requests.post(f"{BASE_URL}/api/admin/users/{test_user_id}/restore", headers=owner_headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("deleted_at") is None
        print(f"User {test_user_id} restored")
    
    def test_user_in_list_after_restore(self, owner_headers, test_user_id):
        """Test restored user appears in default list"""
        response = requests.get(f"{BASE_URL}/api/admin/users", headers=owner_headers)
        assert response.status_code == 200
        data = response.json()
        users = data.get("users", [])
        found = any(u["user_id"] == test_user_id for u in users)
        assert found, f"Restored user {test_user_id} should appear in default list"
        print("Restored user correctly appears in default list")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
