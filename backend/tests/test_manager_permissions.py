"""
Test Manager Permissions and Cascading Deactivation
Tests:
- Manager can only access records for their assigned location_id
- Owner can access Manager endpoints with location_id query param
- Permission checks on all CRUD operations
- Cascading deactivation - Category → Programs → Schedules
- Cannot add programs to inactive categories
- Cannot create schedules for inactive programs
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
OWNER_EMAIL = "owner@spartans.com"
OWNER_PASSWORD = "Spartans2024!"
MANAGER_EMAIL = "manager.sharjah1@spartans.ae"
MANAGER_PASSWORD = "Manager2024!"


class TestSetup:
    """Setup and authentication tests"""
    
    @pytest.fixture(scope="class")
    def owner_session(self):
        """Get owner session token"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200, f"Owner login failed: {response.text}"
        data = response.json()
        token = data.get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session, data.get("user", {})
    
    @pytest.fixture(scope="class")
    def manager_session(self):
        """Get manager session token"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL,
            "password": MANAGER_PASSWORD
        })
        assert response.status_code == 200, f"Manager login failed: {response.text}"
        data = response.json()
        token = data.get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session, data.get("user", {})
    
    def test_owner_login(self, owner_session):
        """Test owner can login"""
        session, user = owner_session
        assert user.get("role") == "OWNER"
        print(f"✓ Owner logged in: {user.get('email')}")
    
    def test_manager_login(self, manager_session):
        """Test manager can login"""
        session, user = manager_session
        assert user.get("role") == "LOCATION_MANAGER"
        assert user.get("location_id") is not None
        print(f"✓ Manager logged in: {user.get('email')}, location: {user.get('location_id')}")


class TestManagerLocationScope:
    """Test that managers can only access their assigned location"""
    
    @pytest.fixture(scope="class")
    def owner_session(self):
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL, "password": OWNER_PASSWORD
        })
        data = response.json()
        session.headers.update({"Authorization": f"Bearer {data.get('token')}"})
        return session, data.get("user", {})
    
    @pytest.fixture(scope="class")
    def manager_session(self):
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL, "password": MANAGER_PASSWORD
        })
        data = response.json()
        session.headers.update({"Authorization": f"Bearer {data.get('token')}"})
        return session, data.get("user", {})
    
    def test_manager_categories_scoped_to_location(self, manager_session):
        """Manager can only see categories for their location"""
        session, user = manager_session
        response = session.get(f"{BASE_URL}/api/program-categories")
        assert response.status_code == 200
        categories = response.json()
        # All categories should belong to manager's location
        for cat in categories:
            assert cat.get("location_id") == user.get("location_id"), \
                f"Category {cat.get('category_id')} has wrong location"
        print(f"✓ Manager sees {len(categories)} categories for their location")
    
    def test_manager_programs_scoped_to_location(self, manager_session):
        """Manager can only see programs for their location"""
        session, user = manager_session
        response = session.get(f"{BASE_URL}/api/programs")
        assert response.status_code == 200
        programs = response.json()
        for prog in programs:
            assert prog.get("location_id") == user.get("location_id"), \
                f"Program {prog.get('program_id')} has wrong location"
        print(f"✓ Manager sees {len(programs)} programs for their location")
    
    def test_manager_schedules_scoped_to_location(self, manager_session):
        """Manager can only see schedules for their location"""
        session, user = manager_session
        response = session.get(f"{BASE_URL}/api/class-schedules")
        assert response.status_code == 200
        schedules = response.json()
        for sched in schedules:
            assert sched.get("location_id") == user.get("location_id"), \
                f"Schedule {sched.get('schedule_id')} has wrong location"
        print(f"✓ Manager sees {len(schedules)} schedules for their location")
    
    def test_manager_staff_scoped_to_location(self, manager_session):
        """Manager can only see staff for their location"""
        session, user = manager_session
        response = session.get(f"{BASE_URL}/api/staff")
        assert response.status_code == 200
        staff = response.json()
        for s in staff:
            assert s.get("location_id") == user.get("location_id"), \
                f"Staff {s.get('staff_id')} has wrong location"
        print(f"✓ Manager sees {len(staff)} staff for their location")


class TestOwnerLocationParam:
    """Test that owner can access manager endpoints with location_id param"""
    
    @pytest.fixture(scope="class")
    def owner_session(self):
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL, "password": OWNER_PASSWORD
        })
        data = response.json()
        session.headers.update({"Authorization": f"Bearer {data.get('token')}"})
        return session, data.get("user", {})
    
    @pytest.fixture(scope="class")
    def location_id(self, owner_session):
        """Get first location for owner"""
        session, user = owner_session
        response = session.get(f"{BASE_URL}/api/locations")
        assert response.status_code == 200
        locations = response.json()
        assert len(locations) > 0, "No locations found"
        return locations[0].get("location_id")
    
    def test_owner_requires_location_id_for_categories(self, owner_session):
        """Owner must provide location_id for category endpoints"""
        session, user = owner_session
        response = session.get(f"{BASE_URL}/api/program-categories")
        assert response.status_code == 400, "Should require location_id"
        print("✓ Owner requires location_id for categories")
    
    def test_owner_can_access_categories_with_location_id(self, owner_session, location_id):
        """Owner can access categories with location_id param"""
        session, user = owner_session
        response = session.get(f"{BASE_URL}/api/program-categories?location_id={location_id}")
        assert response.status_code == 200
        categories = response.json()
        for cat in categories:
            assert cat.get("location_id") == location_id
        print(f"✓ Owner sees {len(categories)} categories for location {location_id}")
    
    def test_owner_can_access_programs_with_location_id(self, owner_session, location_id):
        """Owner can access programs with location_id param"""
        session, user = owner_session
        response = session.get(f"{BASE_URL}/api/programs?location_id={location_id}")
        assert response.status_code == 200
        programs = response.json()
        print(f"✓ Owner sees {len(programs)} programs for location {location_id}")
    
    def test_owner_can_access_schedules_with_location_id(self, owner_session, location_id):
        """Owner can access schedules with location_id param"""
        session, user = owner_session
        response = session.get(f"{BASE_URL}/api/class-schedules?location_id={location_id}")
        assert response.status_code == 200
        schedules = response.json()
        print(f"✓ Owner sees {len(schedules)} schedules for location {location_id}")
    
    def test_owner_can_access_staff_with_location_id(self, owner_session, location_id):
        """Owner can access staff with location_id param"""
        session, user = owner_session
        response = session.get(f"{BASE_URL}/api/staff?location_id={location_id}")
        assert response.status_code == 200
        staff = response.json()
        print(f"✓ Owner sees {len(staff)} staff for location {location_id}")


class TestCascadingDeactivation:
    """Test cascading deactivation: Category → Programs → Schedules"""
    
    @pytest.fixture(scope="class")
    def manager_session(self):
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL, "password": MANAGER_PASSWORD
        })
        data = response.json()
        session.headers.update({"Authorization": f"Bearer {data.get('token')}"})
        return session, data.get("user", {})
    
    @pytest.fixture(scope="class")
    def test_category(self, manager_session):
        """Create a test category for cascading tests"""
        session, user = manager_session
        unique_id = uuid.uuid4().hex[:8]
        response = session.post(f"{BASE_URL}/api/program-categories", json={
            "name": f"TEST_Cascade_Category_{unique_id}",
            "description": "Test category for cascading deactivation",
            "age_group": "All",
            "skill_level": "all"
        })
        assert response.status_code == 201, f"Failed to create category: {response.text}"
        cat = response.json()
        print(f"✓ Created test category: {cat.get('category_id')}")
        yield cat
        # Cleanup - try to delete
        try:
            session.delete(f"{BASE_URL}/api/program-categories/{cat.get('category_id')}")
        except:
            pass
    
    @pytest.fixture(scope="class")
    def test_program(self, manager_session, test_category):
        """Create a test program under the test category"""
        session, user = manager_session
        unique_id = uuid.uuid4().hex[:8]
        response = session.post(f"{BASE_URL}/api/programs", json={
            "category_id": test_category.get("category_id"),
            "name": f"TEST_Cascade_Program_{unique_id}",
            "description": "Test program for cascading deactivation",
            "capacity": 20,
            "difficulty_level": "beginner"
        })
        assert response.status_code == 201, f"Failed to create program: {response.text}"
        prog = response.json()
        print(f"✓ Created test program: {prog.get('program_id')}")
        yield prog
        # Cleanup
        try:
            session.delete(f"{BASE_URL}/api/programs/{prog.get('program_id')}")
        except:
            pass
    
    @pytest.fixture(scope="class")
    def test_instructor(self, manager_session):
        """Get or create an instructor for schedule tests"""
        session, user = manager_session
        response = session.get(f"{BASE_URL}/api/instructors")
        assert response.status_code == 200
        instructors = response.json()
        if instructors:
            return instructors[0]
        # Create one if none exist
        unique_id = uuid.uuid4().hex[:8]
        response = session.post(f"{BASE_URL}/api/instructors", json={
            "full_name": f"TEST_Instructor_{unique_id}",
            "phone": "+971-50-123-4567",
            "email": f"test.instructor.{unique_id}@spartans.ae"
        })
        assert response.status_code == 201
        return response.json()
    
    @pytest.fixture(scope="class")
    def test_schedule(self, manager_session, test_program, test_instructor):
        """Create a test schedule under the test program"""
        session, user = manager_session
        response = session.post(f"{BASE_URL}/api/class-schedules", json={
            "program_id": test_program.get("program_id"),
            "instructor_id": test_instructor.get("instructor_id"),
            "day_of_week": 1,
            "start_time": "10:00",
            "end_time": "11:00",
            "room": "Test Room"
        })
        assert response.status_code == 201, f"Failed to create schedule: {response.text}"
        sched = response.json()
        print(f"✓ Created test schedule: {sched.get('schedule_id')}")
        yield sched
        # Cleanup
        try:
            session.delete(f"{BASE_URL}/api/class-schedules/{sched.get('schedule_id')}")
        except:
            pass
    
    def test_deactivate_category_cascades_to_programs(self, manager_session, test_category, test_program, test_schedule):
        """Deactivating a category should deactivate its programs and schedules"""
        session, user = manager_session
        
        # Verify all are active initially
        cat_resp = session.get(f"{BASE_URL}/api/program-categories")
        cats = [c for c in cat_resp.json() if c.get("category_id") == test_category.get("category_id")]
        assert len(cats) == 1 and cats[0].get("is_active") == True, "Category should be active"
        
        prog_resp = session.get(f"{BASE_URL}/api/programs")
        progs = [p for p in prog_resp.json() if p.get("program_id") == test_program.get("program_id")]
        assert len(progs) == 1 and progs[0].get("is_active") == True, "Program should be active"
        
        sched_resp = session.get(f"{BASE_URL}/api/class-schedules")
        scheds = [s for s in sched_resp.json() if s.get("schedule_id") == test_schedule.get("schedule_id")]
        assert len(scheds) == 1 and scheds[0].get("is_active") == True, "Schedule should be active"
        
        # Deactivate the category
        response = session.delete(f"{BASE_URL}/api/program-categories/{test_category.get('category_id')}")
        assert response.status_code == 200, f"Failed to deactivate category: {response.text}"
        print("✓ Category deactivated")
        
        # Verify cascading - need to include inactive items
        cat_resp = session.get(f"{BASE_URL}/api/program-categories?is_active=false")
        cats = [c for c in cat_resp.json() if c.get("category_id") == test_category.get("category_id")]
        assert len(cats) == 1 and cats[0].get("is_active") == False, "Category should be inactive"
        print("✓ Category is now inactive")
        
        prog_resp = session.get(f"{BASE_URL}/api/programs?is_active=false")
        progs = [p for p in prog_resp.json() if p.get("program_id") == test_program.get("program_id")]
        assert len(progs) == 1 and progs[0].get("is_active") == False, "Program should be cascaded to inactive"
        print("✓ Program cascaded to inactive")
        
        sched_resp = session.get(f"{BASE_URL}/api/class-schedules?is_active=false")
        scheds = [s for s in sched_resp.json() if s.get("schedule_id") == test_schedule.get("schedule_id")]
        assert len(scheds) == 1 and scheds[0].get("is_active") == False, "Schedule should be cascaded to inactive"
        print("✓ Schedule cascaded to inactive")


class TestProgramDeactivationCascade:
    """Test cascading deactivation: Program → Schedules"""
    
    @pytest.fixture(scope="class")
    def manager_session(self):
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL, "password": MANAGER_PASSWORD
        })
        data = response.json()
        session.headers.update({"Authorization": f"Bearer {data.get('token')}"})
        return session, data.get("user", {})
    
    @pytest.fixture(scope="class")
    def active_category(self, manager_session):
        """Get or create an active category"""
        session, user = manager_session
        response = session.get(f"{BASE_URL}/api/program-categories?is_active=true")
        cats = response.json()
        if cats:
            return cats[0]
        # Create one
        unique_id = uuid.uuid4().hex[:8]
        response = session.post(f"{BASE_URL}/api/program-categories", json={
            "name": f"TEST_Active_Category_{unique_id}",
            "description": "Active category for tests",
            "age_group": "All",
            "skill_level": "all"
        })
        return response.json()
    
    @pytest.fixture(scope="class")
    def test_program2(self, manager_session, active_category):
        """Create a test program"""
        session, user = manager_session
        unique_id = uuid.uuid4().hex[:8]
        response = session.post(f"{BASE_URL}/api/programs", json={
            "category_id": active_category.get("category_id"),
            "name": f"TEST_Program_Cascade2_{unique_id}",
            "description": "Test program for program cascade",
            "capacity": 15,
            "difficulty_level": "intermediate"
        })
        assert response.status_code == 201, f"Failed to create program: {response.text}"
        prog = response.json()
        yield prog
        try:
            session.delete(f"{BASE_URL}/api/programs/{prog.get('program_id')}")
        except:
            pass
    
    @pytest.fixture(scope="class")
    def test_instructor2(self, manager_session):
        """Get an instructor"""
        session, user = manager_session
        response = session.get(f"{BASE_URL}/api/instructors")
        instructors = response.json()
        if instructors:
            return instructors[0]
        return None
    
    @pytest.fixture(scope="class")
    def test_schedule2(self, manager_session, test_program2, test_instructor2):
        """Create a test schedule"""
        session, user = manager_session
        if not test_instructor2:
            pytest.skip("No instructor available")
        response = session.post(f"{BASE_URL}/api/class-schedules", json={
            "program_id": test_program2.get("program_id"),
            "instructor_id": test_instructor2.get("instructor_id"),
            "day_of_week": 3,
            "start_time": "14:00",
            "end_time": "15:00",
            "room": "Test Room 2"
        })
        assert response.status_code == 201, f"Failed to create schedule: {response.text}"
        sched = response.json()
        yield sched
        try:
            session.delete(f"{BASE_URL}/api/class-schedules/{sched.get('schedule_id')}")
        except:
            pass
    
    def test_deactivate_program_cascades_to_schedules(self, manager_session, test_program2, test_schedule2):
        """Deactivating a program should deactivate its schedules"""
        session, user = manager_session
        
        # Verify schedule is active
        sched_resp = session.get(f"{BASE_URL}/api/class-schedules")
        scheds = [s for s in sched_resp.json() if s.get("schedule_id") == test_schedule2.get("schedule_id")]
        assert len(scheds) == 1 and scheds[0].get("is_active") == True, "Schedule should be active"
        
        # Deactivate the program
        response = session.delete(f"{BASE_URL}/api/programs/{test_program2.get('program_id')}")
        assert response.status_code == 200, f"Failed to deactivate program: {response.text}"
        print("✓ Program deactivated")
        
        # Verify schedule is now inactive
        sched_resp = session.get(f"{BASE_URL}/api/class-schedules?is_active=false")
        scheds = [s for s in sched_resp.json() if s.get("schedule_id") == test_schedule2.get("schedule_id")]
        assert len(scheds) == 1 and scheds[0].get("is_active") == False, "Schedule should be cascaded to inactive"
        print("✓ Schedule cascaded to inactive")


class TestInactiveCategoryRestrictions:
    """Test that programs cannot be added to inactive categories"""
    
    @pytest.fixture(scope="class")
    def manager_session(self):
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL, "password": MANAGER_PASSWORD
        })
        data = response.json()
        session.headers.update({"Authorization": f"Bearer {data.get('token')}"})
        return session, data.get("user", {})
    
    @pytest.fixture(scope="class")
    def inactive_category(self, manager_session):
        """Create and deactivate a category"""
        session, user = manager_session
        unique_id = uuid.uuid4().hex[:8]
        # Create
        response = session.post(f"{BASE_URL}/api/program-categories", json={
            "name": f"TEST_Inactive_Cat_{unique_id}",
            "description": "Will be deactivated",
            "age_group": "All",
            "skill_level": "all"
        })
        assert response.status_code == 201
        cat = response.json()
        # Deactivate
        session.delete(f"{BASE_URL}/api/program-categories/{cat.get('category_id')}")
        yield cat
    
    def test_cannot_add_program_to_inactive_category(self, manager_session, inactive_category):
        """Should not be able to add a program to an inactive category"""
        session, user = manager_session
        unique_id = uuid.uuid4().hex[:8]
        response = session.post(f"{BASE_URL}/api/programs", json={
            "category_id": inactive_category.get("category_id"),
            "name": f"TEST_Should_Fail_{unique_id}",
            "description": "This should fail",
            "capacity": 10,
            "difficulty_level": "beginner"
        })
        assert response.status_code == 400, f"Should fail with 400, got {response.status_code}"
        assert "inactive" in response.text.lower(), "Error should mention inactive category"
        print("✓ Cannot add program to inactive category")


class TestInactiveProgramRestrictions:
    """Test that schedules cannot be created for inactive programs"""
    
    @pytest.fixture(scope="class")
    def manager_session(self):
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL, "password": MANAGER_PASSWORD
        })
        data = response.json()
        session.headers.update({"Authorization": f"Bearer {data.get('token')}"})
        return session, data.get("user", {})
    
    @pytest.fixture(scope="class")
    def inactive_program(self, manager_session):
        """Create and deactivate a program"""
        session, user = manager_session
        # Get an active category
        cat_resp = session.get(f"{BASE_URL}/api/program-categories?is_active=true")
        cats = cat_resp.json()
        if not cats:
            pytest.skip("No active categories")
        
        unique_id = uuid.uuid4().hex[:8]
        # Create program
        response = session.post(f"{BASE_URL}/api/programs", json={
            "category_id": cats[0].get("category_id"),
            "name": f"TEST_Inactive_Prog_{unique_id}",
            "description": "Will be deactivated",
            "capacity": 10,
            "difficulty_level": "beginner"
        })
        assert response.status_code == 201
        prog = response.json()
        # Deactivate
        session.delete(f"{BASE_URL}/api/programs/{prog.get('program_id')}")
        yield prog
    
    @pytest.fixture(scope="class")
    def test_instructor3(self, manager_session):
        """Get an instructor"""
        session, user = manager_session
        response = session.get(f"{BASE_URL}/api/instructors")
        instructors = response.json()
        if instructors:
            return instructors[0]
        return None
    
    def test_cannot_create_schedule_for_inactive_program(self, manager_session, inactive_program, test_instructor3):
        """Should not be able to create a schedule for an inactive program"""
        session, user = manager_session
        if not test_instructor3:
            pytest.skip("No instructor available")
        
        response = session.post(f"{BASE_URL}/api/class-schedules", json={
            "program_id": inactive_program.get("program_id"),
            "instructor_id": test_instructor3.get("instructor_id"),
            "day_of_week": 5,
            "start_time": "16:00",
            "end_time": "17:00",
            "room": "Test Room"
        })
        assert response.status_code == 400, f"Should fail with 400, got {response.status_code}"
        assert "inactive" in response.text.lower(), "Error should mention inactive program"
        print("✓ Cannot create schedule for inactive program")


class TestStatusToggle:
    """Test status toggle (activate/deactivate) functionality"""
    
    @pytest.fixture(scope="class")
    def manager_session(self):
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL, "password": MANAGER_PASSWORD
        })
        data = response.json()
        session.headers.update({"Authorization": f"Bearer {data.get('token')}"})
        return session, data.get("user", {})
    
    @pytest.fixture(scope="class")
    def test_category_toggle(self, manager_session):
        """Create a category for toggle tests"""
        session, user = manager_session
        unique_id = uuid.uuid4().hex[:8]
        response = session.post(f"{BASE_URL}/api/program-categories", json={
            "name": f"TEST_Toggle_Cat_{unique_id}",
            "description": "For toggle tests",
            "age_group": "All",
            "skill_level": "all"
        })
        assert response.status_code == 201
        cat = response.json()
        yield cat
        try:
            session.delete(f"{BASE_URL}/api/program-categories/{cat.get('category_id')}")
        except:
            pass
    
    def test_category_deactivate_via_patch(self, manager_session, test_category_toggle):
        """Test deactivating category via PATCH"""
        session, user = manager_session
        response = session.patch(
            f"{BASE_URL}/api/program-categories/{test_category_toggle.get('category_id')}",
            json={"is_active": False}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("is_active") == False
        print("✓ Category deactivated via PATCH")
    
    def test_category_activate_via_patch(self, manager_session, test_category_toggle):
        """Test activating category via PATCH"""
        session, user = manager_session
        response = session.patch(
            f"{BASE_URL}/api/program-categories/{test_category_toggle.get('category_id')}",
            json={"is_active": True}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("is_active") == True
        print("✓ Category activated via PATCH")


class TestManagerStats:
    """Test manager dashboard stats endpoint"""
    
    @pytest.fixture(scope="class")
    def manager_session(self):
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL, "password": MANAGER_PASSWORD
        })
        data = response.json()
        session.headers.update({"Authorization": f"Bearer {data.get('token')}"})
        return session, data.get("user", {})
    
    def test_manager_stats_endpoint(self, manager_session):
        """Test manager stats endpoint returns expected data"""
        session, user = manager_session
        response = session.get(f"{BASE_URL}/api/manager/stats")
        assert response.status_code == 200
        data = response.json()
        assert "total_programs" in data
        assert "active_categories" in data
        assert "active_instructors" in data
        assert "classes_this_week" in data
        print(f"✓ Manager stats: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
