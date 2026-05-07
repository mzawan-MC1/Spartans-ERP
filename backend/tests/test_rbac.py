"""
RBAC (Role-Based Access Control) API Tests
Tests for roles and permissions management endpoints.
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


class TestRBACSetup:
    """Setup tests - seed roles and authenticate"""
    
    @pytest.fixture(scope="class")
    def owner_token(self):
        """Get owner authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200, f"Owner login failed: {response.text}"
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def manager_token(self):
        """Get manager authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL,
            "password": MANAGER_PASSWORD
        })
        assert response.status_code == 200, f"Manager login failed: {response.text}"
        return response.json()["token"]
    
    def test_seed_roles(self, owner_token):
        """POST /api/admin/roles/seed - Seed default system roles"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        response = requests.post(f"{BASE_URL}/api/admin/roles/seed", headers=headers)
        assert response.status_code == 201, f"Seed roles failed: {response.text}"
        data = response.json()
        assert "message" in data
        print(f"Seed result: {data}")


class TestRolesListAndGet:
    """Test role listing and retrieval endpoints"""
    
    @pytest.fixture(scope="class")
    def owner_token(self):
        """Get owner authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def manager_token(self):
        """Get manager authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL,
            "password": MANAGER_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_list_roles(self, owner_token):
        """GET /api/admin/roles - List all roles"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/roles", headers=headers)
        assert response.status_code == 200, f"List roles failed: {response.text}"
        data = response.json()
        assert "roles" in data
        assert "total" in data
        assert len(data["roles"]) >= 4, "Should have at least 4 system roles"
        print(f"Found {data['total']} roles")
        
        # Verify role structure
        for role in data["roles"]:
            assert "role_id" in role
            assert "name" in role
            assert "code" in role
            assert "scope" in role
            assert "permissions" in role
            assert "is_system" in role
            assert "is_active" in role
    
    def test_list_roles_filter_by_scope_owner(self, owner_token):
        """GET /api/admin/roles?scope=OWNER - Filter roles by OWNER scope"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/roles", headers=headers, params={"scope": "OWNER"})
        assert response.status_code == 200
        data = response.json()
        for role in data["roles"]:
            assert role["scope"] == "OWNER"
        print(f"Found {len(data['roles'])} OWNER scope roles")
    
    def test_list_roles_filter_by_scope_manager(self, owner_token):
        """GET /api/admin/roles?scope=MANAGER - Filter roles by MANAGER scope"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/roles", headers=headers, params={"scope": "MANAGER"})
        assert response.status_code == 200
        data = response.json()
        for role in data["roles"]:
            assert role["scope"] == "MANAGER"
        print(f"Found {len(data['roles'])} MANAGER scope roles")
    
    def test_list_roles_filter_by_active(self, owner_token):
        """GET /api/admin/roles?is_active=true - Filter active roles"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/roles", headers=headers, params={"is_active": True})
        assert response.status_code == 200
        data = response.json()
        for role in data["roles"]:
            assert role["is_active"] == True
    
    def test_get_role_by_id(self, owner_token):
        """GET /api/admin/roles/:id - Get role detail"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        # First get list to find a role ID
        list_response = requests.get(f"{BASE_URL}/api/admin/roles", headers=headers)
        roles = list_response.json()["roles"]
        assert len(roles) > 0
        
        role_id = roles[0]["role_id"]
        response = requests.get(f"{BASE_URL}/api/admin/roles/{role_id}", headers=headers)
        assert response.status_code == 200, f"Get role failed: {response.text}"
        data = response.json()
        assert data["role_id"] == role_id
        print(f"Got role: {data['name']}")
    
    def test_get_role_not_found(self, owner_token):
        """GET /api/admin/roles/:id - Non-existent role returns 404"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/roles/role_nonexistent123", headers=headers)
        assert response.status_code == 404
    
    def test_manager_cannot_list_roles(self, manager_token):
        """GET /api/admin/roles - Manager should be denied (403)"""
        headers = {"Authorization": f"Bearer {manager_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/roles", headers=headers)
        assert response.status_code == 403, f"Manager should not access roles: {response.text}"


class TestPermissions:
    """Test permissions endpoint"""
    
    @pytest.fixture(scope="class")
    def owner_token(self):
        """Get owner authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_get_all_permissions(self, owner_token):
        """GET /api/admin/roles/permissions - Get all permission keys"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/roles/permissions", headers=headers)
        assert response.status_code == 200, f"Get permissions failed: {response.text}"
        data = response.json()
        
        assert "owner_permissions" in data
        assert "manager_permissions" in data
        assert len(data["owner_permissions"]) > 0
        assert len(data["manager_permissions"]) > 0
        
        # Verify permission structure
        for perm in data["owner_permissions"]:
            assert "key" in perm
            assert "description" in perm
        
        print(f"Owner permissions: {len(data['owner_permissions'])}, Manager permissions: {len(data['manager_permissions'])}")


class TestRoleCreate:
    """Test role creation endpoint"""
    
    @pytest.fixture(scope="class")
    def owner_token(self):
        """Get owner authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_create_custom_manager_role(self, owner_token):
        """POST /api/admin/roles - Create new custom manager role"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        role_data = {
            "name": "TEST Manager – Read Only",
            "code": "TEST_MANAGER_READONLY",
            "scope": "MANAGER",
            "description": "Test role with read-only permissions",
            "permissions": [
                "manager.view_dashboard",
                "manager.view_programs",
                "manager.view_schedules",
                "manager.view_bookings"
            ]
        }
        response = requests.post(f"{BASE_URL}/api/admin/roles", headers=headers, json=role_data)
        assert response.status_code == 201, f"Create role failed: {response.text}"
        data = response.json()
        
        assert data["name"] == role_data["name"]
        assert data["code"] == role_data["code"]
        assert data["scope"] == "MANAGER"
        assert data["is_system"] == False
        assert data["is_active"] == True
        assert len(data["permissions"]) == 4
        print(f"Created role: {data['name']} with ID {data['role_id']}")
        
        # Store for cleanup
        TestRoleCreate.created_role_id = data["role_id"]
    
    def test_create_role_duplicate_code_fails(self, owner_token):
        """POST /api/admin/roles - Duplicate code should fail"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        role_data = {
            "name": "Duplicate Test",
            "code": "OWNER_FULL",  # Already exists
            "scope": "OWNER",
            "description": "Should fail",
            "permissions": ["owner.view_dashboard"]
        }
        response = requests.post(f"{BASE_URL}/api/admin/roles", headers=headers, json=role_data)
        assert response.status_code == 400, f"Should reject duplicate code: {response.text}"
    
    def test_create_role_invalid_permissions_for_scope(self, owner_token):
        """POST /api/admin/roles - Invalid permissions for scope should fail"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        role_data = {
            "name": "Invalid Perms Test",
            "code": "TEST_INVALID_PERMS",
            "scope": "MANAGER",  # Manager scope
            "description": "Should fail",
            "permissions": ["owner.view_dashboard"]  # Owner permission - invalid for manager
        }
        response = requests.post(f"{BASE_URL}/api/admin/roles", headers=headers, json=role_data)
        assert response.status_code == 400, f"Should reject invalid permissions: {response.text}"


class TestRoleUpdate:
    """Test role update endpoint"""
    
    @pytest.fixture(scope="class")
    def owner_token(self):
        """Get owner authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_update_role_name_and_description(self, owner_token):
        """PATCH /api/admin/roles/:id - Update role name and description"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        
        # Get the test role we created
        list_response = requests.get(f"{BASE_URL}/api/admin/roles", headers=headers)
        roles = list_response.json()["roles"]
        test_role = next((r for r in roles if r["code"] == "TEST_MANAGER_READONLY"), None)
        
        if not test_role:
            pytest.skip("Test role not found - create test may have failed")
        
        update_data = {
            "name": "TEST Manager – Updated Name",
            "description": "Updated description for testing"
        }
        response = requests.patch(f"{BASE_URL}/api/admin/roles/{test_role['role_id']}", headers=headers, json=update_data)
        assert response.status_code == 200, f"Update role failed: {response.text}"
        data = response.json()
        
        assert data["name"] == update_data["name"]
        assert data["description"] == update_data["description"]
        print(f"Updated role: {data['name']}")
    
    def test_update_role_permissions(self, owner_token):
        """PATCH /api/admin/roles/:id - Update role permissions"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        
        # Get the test role
        list_response = requests.get(f"{BASE_URL}/api/admin/roles", headers=headers)
        roles = list_response.json()["roles"]
        test_role = next((r for r in roles if r["code"] == "TEST_MANAGER_READONLY"), None)
        
        if not test_role:
            pytest.skip("Test role not found")
        
        new_permissions = [
            "manager.view_dashboard",
            "manager.view_programs",
            "manager.view_schedules",
            "manager.view_bookings",
            "manager.view_instructors"  # Added permission
        ]
        update_data = {"permissions": new_permissions}
        response = requests.patch(f"{BASE_URL}/api/admin/roles/{test_role['role_id']}", headers=headers, json=update_data)
        assert response.status_code == 200
        data = response.json()
        
        assert len(data["permissions"]) == 5
        assert "manager.view_instructors" in data["permissions"]
        print(f"Updated permissions count: {len(data['permissions'])}")
    
    def test_update_system_role_allowed(self, owner_token):
        """PATCH /api/admin/roles/:id - System roles can be updated (name, description, permissions)"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        
        # Get a system role
        list_response = requests.get(f"{BASE_URL}/api/admin/roles", headers=headers)
        roles = list_response.json()["roles"]
        system_role = next((r for r in roles if r["is_system"] == True), None)
        
        if not system_role:
            pytest.skip("No system role found")
        
        # Update description only (safe change)
        update_data = {"description": "Updated system role description for testing"}
        response = requests.patch(f"{BASE_URL}/api/admin/roles/{system_role['role_id']}", headers=headers, json=update_data)
        assert response.status_code == 200, f"System role update failed: {response.text}"


class TestRoleDelete:
    """Test role deletion endpoint"""
    
    @pytest.fixture(scope="class")
    def owner_token(self):
        """Get owner authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_delete_system_role_fails(self, owner_token):
        """DELETE /api/admin/roles/:id - System roles cannot be deleted"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        
        # Get a system role
        list_response = requests.get(f"{BASE_URL}/api/admin/roles", headers=headers)
        roles = list_response.json()["roles"]
        system_role = next((r for r in roles if r["is_system"] == True), None)
        
        if not system_role:
            pytest.skip("No system role found")
        
        response = requests.delete(f"{BASE_URL}/api/admin/roles/{system_role['role_id']}", headers=headers)
        assert response.status_code == 400, f"Should reject system role deletion: {response.text}"
        assert "system" in response.json().get("detail", "").lower()
        print(f"Correctly rejected deletion of system role: {system_role['name']}")
    
    def test_delete_custom_role(self, owner_token):
        """DELETE /api/admin/roles/:id - Custom roles can be deleted (soft delete)"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        
        # Get the test role we created
        list_response = requests.get(f"{BASE_URL}/api/admin/roles", headers=headers)
        roles = list_response.json()["roles"]
        test_role = next((r for r in roles if r["code"] == "TEST_MANAGER_READONLY"), None)
        
        if not test_role:
            pytest.skip("Test role not found")
        
        response = requests.delete(f"{BASE_URL}/api/admin/roles/{test_role['role_id']}", headers=headers)
        assert response.status_code == 200, f"Delete role failed: {response.text}"
        
        # Verify soft delete - role should still exist but be inactive
        get_response = requests.get(f"{BASE_URL}/api/admin/roles/{test_role['role_id']}", headers=headers)
        assert get_response.status_code == 200
        assert get_response.json()["is_active"] == False
        print(f"Soft deleted role: {test_role['name']}")
    
    def test_delete_nonexistent_role(self, owner_token):
        """DELETE /api/admin/roles/:id - Non-existent role returns 404"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        response = requests.delete(f"{BASE_URL}/api/admin/roles/role_nonexistent123", headers=headers)
        assert response.status_code == 404


class TestUserWithRoles:
    """Test user creation and update with admin_role_ids"""
    
    @pytest.fixture(scope="class")
    def owner_token(self):
        """Get owner authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def manager_role_id(self, owner_token):
        """Get MANAGER_FULL role ID"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/roles", headers=headers, params={"scope": "MANAGER"})
        roles = response.json()["roles"]
        manager_full = next((r for r in roles if r["code"] == "MANAGER_FULL"), None)
        return manager_full["role_id"] if manager_full else None
    
    @pytest.fixture(scope="class")
    def location_id(self, owner_token):
        """Get a location ID for manager assignment"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        response = requests.get(f"{BASE_URL}/api/locations", headers=headers)
        locations = response.json()
        return locations[0]["location_id"] if locations else None
    
    def test_create_user_with_admin_role(self, owner_token, manager_role_id, location_id):
        """POST /api/admin/users - Create user with admin_role_ids"""
        if not manager_role_id or not location_id:
            pytest.skip("Required role or location not found")
        
        headers = {"Authorization": f"Bearer {owner_token}"}
        user_data = {
            "first_name": "TEST",
            "last_name": "RBAC Manager",
            "email": f"test.rbac.manager.{os.urandom(4).hex()}@spartans.ae",
            "password": "TestPass123!",
            "role": "LOCATION_MANAGER",
            "manager_location_ids": [location_id],
            "admin_role_ids": [manager_role_id]
        }
        response = requests.post(f"{BASE_URL}/api/admin/users", headers=headers, json=user_data)
        assert response.status_code == 201, f"Create user failed: {response.text}"
        data = response.json()
        
        assert data["admin_role_ids"] == [manager_role_id]
        assert "admin_roles" in data
        assert len(data["admin_roles"]) == 1
        print(f"Created user with role: {data['admin_roles'][0]['name']}")
        
        # Store for cleanup
        TestUserWithRoles.created_user_id = data["user_id"]
    
    def test_update_user_admin_roles(self, owner_token, manager_role_id):
        """PATCH /api/admin/users/:id - Update user admin_role_ids"""
        if not hasattr(TestUserWithRoles, 'created_user_id'):
            pytest.skip("Test user not created")
        
        headers = {"Authorization": f"Bearer {owner_token}"}
        
        # Get another manager role
        list_response = requests.get(f"{BASE_URL}/api/admin/roles", headers=headers, params={"scope": "MANAGER"})
        roles = list_response.json()["roles"]
        ops_role = next((r for r in roles if r["code"] == "MANAGER_OPS" and r["is_active"]), None)
        
        if not ops_role:
            pytest.skip("MANAGER_OPS role not found")
        
        update_data = {
            "admin_role_ids": [manager_role_id, ops_role["role_id"]]
        }
        response = requests.patch(
            f"{BASE_URL}/api/admin/users/{TestUserWithRoles.created_user_id}", 
            headers=headers, 
            json=update_data
        )
        assert response.status_code == 200, f"Update user roles failed: {response.text}"
        data = response.json()
        
        assert len(data["admin_role_ids"]) == 2
        print(f"Updated user with {len(data['admin_role_ids'])} roles")
    
    def test_user_list_shows_admin_roles(self, owner_token):
        """GET /api/admin/users - User list includes admin_roles"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/users", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        # Find a user with admin roles
        user_with_roles = next((u for u in data["users"] if u.get("admin_roles")), None)
        if user_with_roles:
            assert "admin_roles" in user_with_roles
            print(f"User {user_with_roles['name']} has {len(user_with_roles['admin_roles'])} admin roles")


class TestUserEffectivePermissions:
    """Test user effective permissions endpoint"""
    
    @pytest.fixture(scope="class")
    def owner_token(self):
        """Get owner authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_get_user_effective_permissions(self, owner_token):
        """GET /api/admin/roles/user/:id/permissions - Get user's effective permissions"""
        headers = {"Authorization": f"Bearer {owner_token}"}
        
        # Get a user with admin roles
        users_response = requests.get(f"{BASE_URL}/api/admin/users", headers=headers)
        users = users_response.json()["users"]
        user_with_roles = next((u for u in users if u.get("admin_role_ids") and len(u["admin_role_ids"]) > 0), None)
        
        if not user_with_roles:
            pytest.skip("No user with admin roles found")
        
        response = requests.get(
            f"{BASE_URL}/api/admin/roles/user/{user_with_roles['user_id']}/permissions", 
            headers=headers
        )
        assert response.status_code == 200, f"Get user permissions failed: {response.text}"
        data = response.json()
        
        assert "permissions" in data
        assert "roles" in data
        print(f"User has {len(data['permissions'])} effective permissions from {len(data['roles'])} roles")


class TestCleanup:
    """Cleanup test data"""
    
    @pytest.fixture(scope="class")
    def owner_token(self):
        """Get owner authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_cleanup_test_user(self, owner_token):
        """Cleanup: Deactivate test user"""
        if not hasattr(TestUserWithRoles, 'created_user_id'):
            pytest.skip("No test user to cleanup")
        
        headers = {"Authorization": f"Bearer {owner_token}"}
        response = requests.patch(
            f"{BASE_URL}/api/admin/users/{TestUserWithRoles.created_user_id}/deactivate",
            headers=headers
        )
        # Don't fail if cleanup fails
        print(f"Cleanup result: {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
