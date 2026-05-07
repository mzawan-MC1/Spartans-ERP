"""
User Management Module Tests
Tests CRUD operations for managing users (Owners, Managers, Customers)
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestUserManagementAuth:
    """Test authentication and permission requirements"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as owner and get token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as owner
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "owner@spartans.com",
            "password": "Spartans2024!"
        })
        assert login_resp.status_code == 200, f"Owner login failed: {login_resp.text}"
        self.owner_token = login_resp.json()["token"]
        self.session.headers.update({"Authorization": f"Bearer {self.owner_token}"})
        
    def test_owner_can_access_user_list(self):
        """Owner should be able to list users"""
        resp = self.session.get(f"{BASE_URL}/api/admin/users")
        assert resp.status_code == 200, f"Failed to list users: {resp.text}"
        data = resp.json()
        assert "users" in data
        assert "total" in data
        assert "page" in data
        print(f"SUCCESS: Owner can list users - found {data['total']} users")
        
    def test_owner_can_access_user_stats(self):
        """Owner should be able to get user stats"""
        resp = self.session.get(f"{BASE_URL}/api/admin/users/stats/summary")
        assert resp.status_code == 200, f"Failed to get stats: {resp.text}"
        data = resp.json()
        assert "total_users" in data
        assert "total_owners" in data
        assert "total_managers" in data
        assert "total_customers" in data
        print(f"SUCCESS: Owner can get stats - {data['total_users']} total users")


class TestUserManagementPermissions:
    """Test that non-owners cannot access user management"""
    
    def test_manager_cannot_access_user_management(self):
        """Manager should NOT be able to access user management"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as manager
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "manager.sharjah1@spartans.ae",
            "password": "Manager2024!"
        })
        assert login_resp.status_code == 200, f"Manager login failed: {login_resp.text}"
        token = login_resp.json()["token"]
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Try to access user list
        resp = session.get(f"{BASE_URL}/api/admin/users")
        assert resp.status_code == 403, f"Manager should get 403, got {resp.status_code}"
        print("SUCCESS: Manager correctly denied access to user management")
        
    def test_customer_cannot_access_user_management(self):
        """Customer should NOT be able to access user management"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as customer
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "customer.sharjah1.1@spartans.ae",
            "password": "Customer2024!"
        })
        assert login_resp.status_code == 200, f"Customer login failed: {login_resp.text}"
        token = login_resp.json()["token"]
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Try to access user list
        resp = session.get(f"{BASE_URL}/api/admin/users")
        assert resp.status_code == 403, f"Customer should get 403, got {resp.status_code}"
        print("SUCCESS: Customer correctly denied access to user management")


class TestUserManagementCRUD:
    """Test CRUD operations for user management"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as owner and get token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as owner
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "owner@spartans.com",
            "password": "Spartans2024!"
        })
        assert login_resp.status_code == 200, f"Owner login failed: {login_resp.text}"
        self.owner_token = login_resp.json()["token"]
        self.session.headers.update({"Authorization": f"Bearer {self.owner_token}"})
        
        # Get a location for manager assignment
        loc_resp = self.session.get(f"{BASE_URL}/api/locations")
        assert loc_resp.status_code == 200
        self.locations = loc_resp.json()
        assert len(self.locations) > 0, "No locations found"
        self.test_location_id = self.locations[0]["location_id"]
        
    def test_create_manager_user(self):
        """Create a new LOCATION_MANAGER user"""
        unique_id = uuid.uuid4().hex[:8]
        create_data = {
            "first_name": "TEST",
            "last_name": f"Manager{unique_id}",
            "email": f"test.manager.{unique_id}@spartans.ae",
            "password": "TestPass123!",
            "role": "LOCATION_MANAGER",
            "manager_location_ids": [self.test_location_id]
        }
        
        resp = self.session.post(f"{BASE_URL}/api/admin/users", json=create_data)
        assert resp.status_code == 201, f"Failed to create manager: {resp.text}"
        
        data = resp.json()
        assert data["email"] == create_data["email"]
        assert data["first_name"] == create_data["first_name"]
        assert data["last_name"] == create_data["last_name"]
        assert data["role"] == "LOCATION_MANAGER"
        assert data["is_active"] == True
        assert "user_id" in data
        
        # Verify by GET
        get_resp = self.session.get(f"{BASE_URL}/api/admin/users/{data['user_id']}")
        assert get_resp.status_code == 200
        fetched = get_resp.json()
        assert fetched["email"] == create_data["email"]
        
        print(f"SUCCESS: Created manager user {data['user_id']}")
        return data["user_id"]
        
    def test_create_owner_user(self):
        """Create a new OWNER user"""
        unique_id = uuid.uuid4().hex[:8]
        create_data = {
            "first_name": "TEST",
            "last_name": f"Owner{unique_id}",
            "email": f"test.owner.{unique_id}@spartans.ae",
            "password": "TestPass123!",
            "role": "OWNER",
            "manager_location_ids": []
        }
        
        resp = self.session.post(f"{BASE_URL}/api/admin/users", json=create_data)
        assert resp.status_code == 201, f"Failed to create owner: {resp.text}"
        
        data = resp.json()
        assert data["role"] == "OWNER"
        print(f"SUCCESS: Created owner user {data['user_id']}")
        
    def test_create_manager_without_location_fails(self):
        """Creating a manager without location should fail"""
        unique_id = uuid.uuid4().hex[:8]
        create_data = {
            "first_name": "TEST",
            "last_name": f"NoLoc{unique_id}",
            "email": f"test.noloc.{unique_id}@spartans.ae",
            "password": "TestPass123!",
            "role": "LOCATION_MANAGER",
            "manager_location_ids": []
        }
        
        resp = self.session.post(f"{BASE_URL}/api/admin/users", json=create_data)
        assert resp.status_code == 400, f"Should fail without location, got {resp.status_code}"
        print("SUCCESS: Manager creation without location correctly rejected")
        
    def test_create_duplicate_email_fails(self):
        """Creating user with existing email should fail"""
        create_data = {
            "first_name": "Duplicate",
            "last_name": "User",
            "email": "owner@spartans.com",  # Already exists
            "password": "TestPass123!",
            "role": "OWNER",
            "manager_location_ids": []
        }
        
        resp = self.session.post(f"{BASE_URL}/api/admin/users", json=create_data)
        assert resp.status_code == 400, f"Should fail with duplicate email, got {resp.status_code}"
        print("SUCCESS: Duplicate email correctly rejected")
        
    def test_update_user(self):
        """Update user information"""
        # First create a user
        unique_id = uuid.uuid4().hex[:8]
        create_data = {
            "first_name": "TEST",
            "last_name": f"Update{unique_id}",
            "email": f"test.update.{unique_id}@spartans.ae",
            "password": "TestPass123!",
            "role": "LOCATION_MANAGER",
            "manager_location_ids": [self.test_location_id]
        }
        
        create_resp = self.session.post(f"{BASE_URL}/api/admin/users", json=create_data)
        assert create_resp.status_code == 201
        user_id = create_resp.json()["user_id"]
        
        # Update the user
        update_data = {
            "first_name": "UPDATED",
            "last_name": "Name"
        }
        
        update_resp = self.session.patch(f"{BASE_URL}/api/admin/users/{user_id}", json=update_data)
        assert update_resp.status_code == 200, f"Failed to update: {update_resp.text}"
        
        updated = update_resp.json()
        assert updated["first_name"] == "UPDATED"
        assert updated["last_name"] == "Name"
        
        # Verify by GET
        get_resp = self.session.get(f"{BASE_URL}/api/admin/users/{user_id}")
        assert get_resp.status_code == 200
        fetched = get_resp.json()
        assert fetched["first_name"] == "UPDATED"
        
        print(f"SUCCESS: Updated user {user_id}")
        
    def test_reset_password(self):
        """Reset user password"""
        # First create a user
        unique_id = uuid.uuid4().hex[:8]
        create_data = {
            "first_name": "TEST",
            "last_name": f"Reset{unique_id}",
            "email": f"test.reset.{unique_id}@spartans.ae",
            "password": "OldPass123!",
            "role": "LOCATION_MANAGER",
            "manager_location_ids": [self.test_location_id]
        }
        
        create_resp = self.session.post(f"{BASE_URL}/api/admin/users", json=create_data)
        assert create_resp.status_code == 201
        user_id = create_resp.json()["user_id"]
        
        # Reset password
        reset_resp = self.session.patch(
            f"{BASE_URL}/api/admin/users/{user_id}/reset-password",
            json={"new_password": "NewPass456!"}
        )
        assert reset_resp.status_code == 200, f"Failed to reset password: {reset_resp.text}"
        
        # Verify new password works
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": create_data["email"],
            "password": "NewPass456!"
        })
        assert login_resp.status_code == 200, "New password should work"
        
        print(f"SUCCESS: Reset password for user {user_id}")
        
    def test_deactivate_user(self):
        """Deactivate a user"""
        # First create a user
        unique_id = uuid.uuid4().hex[:8]
        create_data = {
            "first_name": "TEST",
            "last_name": f"Deact{unique_id}",
            "email": f"test.deact.{unique_id}@spartans.ae",
            "password": "TestPass123!",
            "role": "LOCATION_MANAGER",
            "manager_location_ids": [self.test_location_id]
        }
        
        create_resp = self.session.post(f"{BASE_URL}/api/admin/users", json=create_data)
        assert create_resp.status_code == 201
        user_id = create_resp.json()["user_id"]
        
        # Deactivate
        deact_resp = self.session.patch(f"{BASE_URL}/api/admin/users/{user_id}/deactivate")
        assert deact_resp.status_code == 200, f"Failed to deactivate: {deact_resp.text}"
        
        # Verify user is deactivated
        get_resp = self.session.get(f"{BASE_URL}/api/admin/users/{user_id}")
        assert get_resp.status_code == 200
        assert get_resp.json()["is_active"] == False
        
        # Verify deactivated user cannot login
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": create_data["email"],
            "password": "TestPass123!"
        })
        assert login_resp.status_code == 401, "Deactivated user should not be able to login"
        
        print(f"SUCCESS: Deactivated user {user_id}")
        
    def test_activate_user(self):
        """Reactivate a deactivated user"""
        # First create and deactivate a user
        unique_id = uuid.uuid4().hex[:8]
        create_data = {
            "first_name": "TEST",
            "last_name": f"React{unique_id}",
            "email": f"test.react.{unique_id}@spartans.ae",
            "password": "TestPass123!",
            "role": "LOCATION_MANAGER",
            "manager_location_ids": [self.test_location_id]
        }
        
        create_resp = self.session.post(f"{BASE_URL}/api/admin/users", json=create_data)
        assert create_resp.status_code == 201
        user_id = create_resp.json()["user_id"]
        
        # Deactivate
        self.session.patch(f"{BASE_URL}/api/admin/users/{user_id}/deactivate")
        
        # Reactivate
        act_resp = self.session.patch(f"{BASE_URL}/api/admin/users/{user_id}/activate")
        assert act_resp.status_code == 200, f"Failed to activate: {act_resp.text}"
        
        # Verify user is active
        get_resp = self.session.get(f"{BASE_URL}/api/admin/users/{user_id}")
        assert get_resp.status_code == 200
        assert get_resp.json()["is_active"] == True
        
        # Verify reactivated user can login
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": create_data["email"],
            "password": "TestPass123!"
        })
        assert login_resp.status_code == 200, "Reactivated user should be able to login"
        
        print(f"SUCCESS: Reactivated user {user_id}")


class TestUserManagementFilters:
    """Test filtering and pagination"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as owner"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "owner@spartans.com",
            "password": "Spartans2024!"
        })
        assert login_resp.status_code == 200
        self.owner_token = login_resp.json()["token"]
        self.session.headers.update({"Authorization": f"Bearer {self.owner_token}"})
        
    def test_filter_by_role(self):
        """Filter users by role"""
        # Filter managers
        resp = self.session.get(f"{BASE_URL}/api/admin/users", params={"role": "LOCATION_MANAGER"})
        assert resp.status_code == 200
        data = resp.json()
        for user in data["users"]:
            assert user["role"] == "LOCATION_MANAGER"
        print(f"SUCCESS: Filtered by role - found {len(data['users'])} managers")
        
    def test_filter_by_active_status(self):
        """Filter users by active status"""
        # Filter active users
        resp = self.session.get(f"{BASE_URL}/api/admin/users", params={"is_active": True})
        assert resp.status_code == 200
        data = resp.json()
        for user in data["users"]:
            assert user["is_active"] == True
        print(f"SUCCESS: Filtered by active status - found {len(data['users'])} active users")
        
    def test_pagination(self):
        """Test pagination"""
        # Get first page with limit 5
        resp = self.session.get(f"{BASE_URL}/api/admin/users", params={"page": 1, "limit": 5})
        assert resp.status_code == 200
        data = resp.json()
        assert data["page"] == 1
        assert data["limit"] == 5
        assert len(data["users"]) <= 5
        print(f"SUCCESS: Pagination works - page {data['page']} of {data['total_pages']}")


class TestUserManagementEdgeCases:
    """Test edge cases and security"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as owner"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "owner@spartans.com",
            "password": "Spartans2024!"
        })
        assert login_resp.status_code == 200
        self.owner_token = login_resp.json()["token"]
        self.owner_user_id = login_resp.json()["user"]["user_id"]
        self.session.headers.update({"Authorization": f"Bearer {self.owner_token}"})
        
    def test_cannot_deactivate_self(self):
        """Owner cannot deactivate themselves"""
        resp = self.session.patch(f"{BASE_URL}/api/admin/users/{self.owner_user_id}/deactivate")
        assert resp.status_code == 400, f"Should not be able to deactivate self, got {resp.status_code}"
        print("SUCCESS: Cannot deactivate self")
        
    def test_get_nonexistent_user(self):
        """Getting non-existent user returns 404"""
        resp = self.session.get(f"{BASE_URL}/api/admin/users/nonexistent_user_id")
        assert resp.status_code == 404
        print("SUCCESS: Non-existent user returns 404")
        
    def test_update_nonexistent_user(self):
        """Updating non-existent user returns 404"""
        resp = self.session.patch(
            f"{BASE_URL}/api/admin/users/nonexistent_user_id",
            json={"first_name": "Test"}
        )
        assert resp.status_code == 404
        print("SUCCESS: Update non-existent user returns 404")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
