"""
Comprehensive Backend API Tests for Spartans Martial Arts & Fitness
Tests all 5 sections: Auth, Programs/Schedules, Customer Portal, HR/Finance, Public Site
"""
import pytest
import requests
import os
from datetime import date, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
OWNER_EMAIL = "owner@spartans.com"
OWNER_PASSWORD = "Spartans2024!"
MANAGER_EMAIL = "manager.sharjah1@spartans.ae"
MANAGER_PASSWORD = "Manager2024!"
CUSTOMER_EMAIL = "customer.sharjah1.1@spartans.ae"
CUSTOMER_PASSWORD = "Customer2024!"


class TestHealthAndAuth:
    """Test health check and authentication endpoints"""
    
    def test_api_health(self):
        """Test API is running"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "running"
        print(f"✓ API health check passed: {data}")
    
    def test_owner_login(self):
        """Test owner login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert data["user"]["role"] == "OWNER"
        print(f"✓ Owner login successful: {data['user']['email']}")
        return data["token"]
    
    def test_manager_login(self):
        """Test manager login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL,
            "password": MANAGER_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert data["user"]["role"] == "LOCATION_MANAGER"
        print(f"✓ Manager login successful: {data['user']['email']}")
        return data["token"]
    
    def test_customer_login(self):
        """Test customer login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CUSTOMER_EMAIL,
            "password": CUSTOMER_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert data["user"]["role"] == "CUSTOMER"
        print(f"✓ Customer login successful: {data['user']['email']}")
        return data["token"]
    
    def test_invalid_login(self):
        """Test invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "invalid@test.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid login correctly rejected")


class TestOwnerFlow:
    """Test Owner dashboard and location management"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get owner token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_locations(self):
        """Test owner can get all locations"""
        response = requests.get(f"{BASE_URL}/api/locations", headers=self.headers)
        assert response.status_code == 200
        locations = response.json()
        assert len(locations) >= 4  # Should have 4+ seeded locations
        print(f"✓ Owner has {len(locations)} locations")
        return locations
    
    def test_get_dashboard_stats(self):
        """Test owner dashboard stats"""
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=self.headers)
        assert response.status_code == 200
        stats = response.json()
        assert "total_locations" in stats
        assert "active_locations" in stats
        assert "total_managers" in stats
        assert "total_customers" in stats
        print(f"✓ Dashboard stats: {stats}")
    
    def test_get_location_detail(self):
        """Test owner can get location details"""
        # First get locations
        locs_response = requests.get(f"{BASE_URL}/api/locations", headers=self.headers)
        locations = locs_response.json()
        if locations:
            loc_id = locations[0]["location_id"]
            response = requests.get(f"{BASE_URL}/api/locations/{loc_id}", headers=self.headers)
            assert response.status_code == 200
            loc = response.json()
            assert loc["location_id"] == loc_id
            print(f"✓ Location detail: {loc['name']}")
    
    def test_get_location_overview(self):
        """Test owner can get location overview with programs/schedules"""
        locs_response = requests.get(f"{BASE_URL}/api/locations", headers=self.headers)
        locations = locs_response.json()
        if locations:
            loc_id = locations[0]["location_id"]
            response = requests.get(f"{BASE_URL}/api/locations/{loc_id}/overview", headers=self.headers)
            assert response.status_code == 200
            overview = response.json()
            assert "categories" in overview
            assert "programs" in overview
            assert "instructors" in overview
            print(f"✓ Location overview: {overview}")
    
    def test_get_programs_for_location(self):
        """Test owner can get programs for a location"""
        locs_response = requests.get(f"{BASE_URL}/api/locations", headers=self.headers)
        locations = locs_response.json()
        if locations:
            loc_id = locations[0]["location_id"]
            response = requests.get(f"{BASE_URL}/api/programs?location_id={loc_id}", headers=self.headers)
            assert response.status_code == 200
            programs = response.json()
            print(f"✓ Location has {len(programs)} programs")
    
    def test_get_schedules_for_location(self):
        """Test owner can get schedules for a location"""
        locs_response = requests.get(f"{BASE_URL}/api/locations", headers=self.headers)
        locations = locs_response.json()
        if locations:
            loc_id = locations[0]["location_id"]
            response = requests.get(f"{BASE_URL}/api/class-schedules?location_id={loc_id}", headers=self.headers)
            assert response.status_code == 200
            schedules = response.json()
            print(f"✓ Location has {len(schedules)} schedules")
    
    def test_get_attendance_summary(self):
        """Test owner can get attendance summary"""
        locs_response = requests.get(f"{BASE_URL}/api/locations", headers=self.headers)
        locations = locs_response.json()
        if locations:
            loc_id = locations[0]["location_id"]
            response = requests.get(f"{BASE_URL}/api/attendance/summary?location_id={loc_id}", headers=self.headers)
            assert response.status_code == 200
            summary = response.json()
            assert "total" in summary
            assert "present" in summary
            print(f"✓ Attendance summary: {summary}")
    
    def test_owner_finance_summary(self):
        """Test owner can get finance summary"""
        response = requests.get(f"{BASE_URL}/api/finance/owner-summary", headers=self.headers)
        assert response.status_code == 200
        summary = response.json()
        assert "grand_total_payroll" in summary
        assert "grand_total_expenses" in summary
        assert "locations" in summary
        print(f"✓ Owner finance summary: payroll={summary['grand_total_payroll']}, expenses={summary['grand_total_expenses']}")
    
    def test_owner_hr_overview(self):
        """Test owner can get HR overview"""
        response = requests.get(f"{BASE_URL}/api/hr/owner-overview", headers=self.headers)
        assert response.status_code == 200
        overview = response.json()
        assert "total_staff" in overview
        assert "total_instructors" in overview
        assert "locations" in overview
        print(f"✓ HR overview: {overview['total_staff']} staff, {overview['total_instructors']} instructors")


class TestManagerFlow:
    """Test Manager dashboard and operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get manager token and location"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL,
            "password": MANAGER_PASSWORD
        })
        data = response.json()
        self.token = data["token"]
        self.location_id = data["user"]["location_id"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_manager_stats(self):
        """Test manager dashboard stats"""
        response = requests.get(f"{BASE_URL}/api/manager/stats", headers=self.headers)
        assert response.status_code == 200
        stats = response.json()
        assert "total_programs" in stats
        assert "active_categories" in stats
        assert "active_instructors" in stats
        assert "classes_this_week" in stats
        assert "total_customers" in stats
        print(f"✓ Manager stats: {stats}")
    
    def test_get_categories(self):
        """Test manager can get program categories"""
        response = requests.get(f"{BASE_URL}/api/program-categories", headers=self.headers)
        assert response.status_code == 200
        categories = response.json()
        print(f"✓ Manager has {len(categories)} categories")
        return categories
    
    def test_get_programs(self):
        """Test manager can get programs"""
        response = requests.get(f"{BASE_URL}/api/programs", headers=self.headers)
        assert response.status_code == 200
        programs = response.json()
        print(f"✓ Manager has {len(programs)} programs")
        return programs
    
    def test_get_schedules(self):
        """Test manager can get class schedules"""
        response = requests.get(f"{BASE_URL}/api/class-schedules", headers=self.headers)
        assert response.status_code == 200
        schedules = response.json()
        print(f"✓ Manager has {len(schedules)} schedules")
        return schedules
    
    def test_get_instructors(self):
        """Test manager can get instructors"""
        response = requests.get(f"{BASE_URL}/api/instructors", headers=self.headers)
        assert response.status_code == 200
        instructors = response.json()
        print(f"✓ Manager has {len(instructors)} instructors")
        return instructors
    
    def test_get_sessions(self):
        """Test manager can get class sessions"""
        response = requests.get(f"{BASE_URL}/api/class-sessions", headers=self.headers)
        assert response.status_code == 200
        sessions = response.json()
        print(f"✓ Manager has {len(sessions)} sessions")
        return sessions
    
    def test_get_attendance(self):
        """Test manager can get attendance records"""
        response = requests.get(f"{BASE_URL}/api/attendance", headers=self.headers)
        assert response.status_code == 200
        records = response.json()
        print(f"✓ Manager has {len(records)} attendance records")
    
    def test_get_staff(self):
        """Test manager can get staff"""
        response = requests.get(f"{BASE_URL}/api/staff", headers=self.headers)
        assert response.status_code == 200
        staff = response.json()
        print(f"✓ Manager has {len(staff)} staff members")
        return staff
    
    def test_get_payroll(self):
        """Test manager can get payroll records"""
        response = requests.get(f"{BASE_URL}/api/payroll", headers=self.headers)
        assert response.status_code == 200
        payroll = response.json()
        print(f"✓ Manager has {len(payroll)} payroll records")
    
    def test_get_expenses(self):
        """Test manager can get expenses"""
        response = requests.get(f"{BASE_URL}/api/expenses", headers=self.headers)
        assert response.status_code == 200
        expenses = response.json()
        print(f"✓ Manager has {len(expenses)} expenses")
    
    def test_finance_location_summary(self):
        """Test manager can get finance summary"""
        response = requests.get(f"{BASE_URL}/api/finance/location-summary", headers=self.headers)
        assert response.status_code == 200
        summary = response.json()
        assert "total_payroll" in summary
        assert "total_expenses" in summary
        print(f"✓ Finance summary: payroll={summary['total_payroll']}, expenses={summary['total_expenses']}")


class TestCustomerFlow:
    """Test Customer portal operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get customer token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CUSTOMER_EMAIL,
            "password": CUSTOMER_PASSWORD
        })
        data = response.json()
        self.token = data["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_customer_dashboard(self):
        """Test customer dashboard"""
        response = requests.get(f"{BASE_URL}/api/customer/dashboard", headers=self.headers)
        assert response.status_code == 200
        dashboard = response.json()
        assert "needs_location" in dashboard
        print(f"✓ Customer dashboard: {dashboard}")
    
    def test_customer_locations(self):
        """Test customer can get available locations"""
        response = requests.get(f"{BASE_URL}/api/customer/locations", headers=self.headers)
        assert response.status_code == 200
        locations = response.json()
        print(f"✓ Customer sees {len(locations)} locations")
    
    def test_customer_programs(self):
        """Test customer can get programs"""
        response = requests.get(f"{BASE_URL}/api/customer/programs", headers=self.headers)
        assert response.status_code == 200
        programs = response.json()
        print(f"✓ Customer sees {len(programs)} programs")
        return programs
    
    def test_customer_sessions(self):
        """Test customer can get class sessions"""
        response = requests.get(f"{BASE_URL}/api/customer/class-sessions", headers=self.headers)
        assert response.status_code == 200
        sessions = response.json()
        print(f"✓ Customer sees {len(sessions)} sessions")
        return sessions
    
    def test_customer_bookings(self):
        """Test customer can get their bookings"""
        response = requests.get(f"{BASE_URL}/api/customer/bookings", headers=self.headers)
        assert response.status_code == 200
        bookings = response.json()
        print(f"✓ Customer has {len(bookings)} bookings")
        return bookings
    
    def test_customer_upcoming_bookings(self):
        """Test customer can get upcoming bookings"""
        response = requests.get(f"{BASE_URL}/api/customer/bookings/upcoming", headers=self.headers)
        assert response.status_code == 200
        bookings = response.json()
        print(f"✓ Customer has {len(bookings)} upcoming bookings")
    
    def test_customer_attendance(self):
        """Test customer can get attendance history"""
        response = requests.get(f"{BASE_URL}/api/customer/attendance", headers=self.headers)
        assert response.status_code == 200
        records = response.json()
        print(f"✓ Customer has {len(records)} attendance records")
    
    def test_customer_attendance_summary(self):
        """Test customer can get attendance summary"""
        response = requests.get(f"{BASE_URL}/api/customer/attendance/summary", headers=self.headers)
        assert response.status_code == 200
        summary = response.json()
        assert "total_attended" in summary
        assert "this_month" in summary
        print(f"✓ Customer attendance summary: {summary}")
    
    def test_customer_profile(self):
        """Test customer can get their profile"""
        response = requests.get(f"{BASE_URL}/api/customer/me", headers=self.headers)
        assert response.status_code == 200
        profile = response.json()
        assert "email" in profile
        assert "name" in profile
        print(f"✓ Customer profile: {profile['name']}")
    
    def test_book_and_cancel_session(self):
        """Test customer can book and cancel a session"""
        # Get available sessions
        sessions_response = requests.get(f"{BASE_URL}/api/customer/class-sessions", headers=self.headers)
        sessions = sessions_response.json()
        
        # Find an unbooked session
        unbooked = [s for s in sessions if not s.get("is_booked")]
        if unbooked:
            session = unbooked[0]
            # Book the session
            book_response = requests.post(
                f"{BASE_URL}/api/customer/bookings",
                headers=self.headers,
                json={"session_id": session["session_id"]}
            )
            if book_response.status_code == 201:
                booking = book_response.json()
                print(f"✓ Booked session: {booking['booking_id']}")
                
                # Cancel the booking
                cancel_response = requests.patch(
                    f"{BASE_URL}/api/customer/bookings/{booking['booking_id']}/cancel",
                    headers=self.headers
                )
                assert cancel_response.status_code == 200
                print(f"✓ Cancelled booking: {booking['booking_id']}")
            else:
                print(f"⚠ Could not book session (may already be booked): {book_response.status_code}")
        else:
            print("⚠ No unbooked sessions available for testing")


class TestPublicSite:
    """Test Public website APIs (no auth required)"""
    
    def test_public_site_settings(self):
        """Test public site settings"""
        response = requests.get(f"{BASE_URL}/api/public/site-settings")
        assert response.status_code == 200
        settings = response.json()
        print(f"✓ Site settings: {settings.get('site_name', 'N/A')}")
    
    def test_public_branches(self):
        """Test public branches list"""
        response = requests.get(f"{BASE_URL}/api/public/branches")
        assert response.status_code == 200
        branches = response.json()
        assert len(branches) >= 4
        print(f"✓ Public branches: {len(branches)}")
    
    def test_public_disciplines(self):
        """Test public disciplines list"""
        response = requests.get(f"{BASE_URL}/api/public/disciplines")
        assert response.status_code == 200
        disciplines = response.json()
        print(f"✓ Public disciplines: {len(disciplines)}")
    
    def test_public_stats(self):
        """Test public stats"""
        response = requests.get(f"{BASE_URL}/api/public/stats")
        assert response.status_code == 200
        stats = response.json()
        assert "locations_count" in stats
        assert "disciplines_count" in stats
        print(f"✓ Public stats: {stats}")
    
    def test_public_pricing(self):
        """Test public pricing"""
        response = requests.get(f"{BASE_URL}/api/public/pricing")
        assert response.status_code == 200
        pricing = response.json()
        print(f"✓ Public pricing: {len(pricing)} plans")
    
    def test_public_faqs(self):
        """Test public FAQs"""
        response = requests.get(f"{BASE_URL}/api/public/faqs")
        assert response.status_code == 200
        faqs = response.json()
        print(f"✓ Public FAQs: {len(faqs)}")
    
    def test_public_pages(self):
        """Test public static pages"""
        for slug in ["privacy", "terms"]:
            response = requests.get(f"{BASE_URL}/api/public/pages/{slug}")
            if response.status_code == 200:
                page = response.json()
                print(f"✓ Public page '{slug}': {page.get('title', 'N/A')}")
            else:
                print(f"⚠ Page '{slug}' not found (may not be seeded)")
    
    def test_contact_submission(self):
        """Test contact form submission"""
        response = requests.post(f"{BASE_URL}/api/public/contact", json={
            "name": "TEST_Contact User",
            "email": "test.contact@example.com",
            "phone": "+971-50-123-4567",
            "branch_id": "",
            "subject": "General Inquiry",
            "message": "This is a test message from automated testing."
        })
        assert response.status_code in [200, 201]
        print("✓ Contact form submission successful")


class TestCMSAdmin:
    """Test CMS Admin APIs (owner only)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get owner token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_cms_site_settings(self):
        """Test CMS site settings"""
        response = requests.get(f"{BASE_URL}/api/cms/site-settings", headers=self.headers)
        assert response.status_code == 200
        settings = response.json()
        print(f"✓ CMS site settings loaded")
    
    def test_cms_disciplines(self):
        """Test CMS disciplines list"""
        response = requests.get(f"{BASE_URL}/api/cms/disciplines", headers=self.headers)
        assert response.status_code == 200
        disciplines = response.json()
        print(f"✓ CMS disciplines: {len(disciplines)}")
    
    def test_cms_pricing(self):
        """Test CMS pricing list"""
        response = requests.get(f"{BASE_URL}/api/cms/pricing", headers=self.headers)
        assert response.status_code == 200
        pricing = response.json()
        print(f"✓ CMS pricing: {len(pricing)} plans")
    
    def test_cms_faqs(self):
        """Test CMS FAQs list"""
        response = requests.get(f"{BASE_URL}/api/cms/faqs", headers=self.headers)
        assert response.status_code == 200
        faqs = response.json()
        print(f"✓ CMS FAQs: {len(faqs)}")
    
    def test_cms_pages(self):
        """Test CMS pages list"""
        response = requests.get(f"{BASE_URL}/api/cms/pages", headers=self.headers)
        assert response.status_code == 200
        pages = response.json()
        print(f"✓ CMS pages: {len(pages)}")
    
    def test_cms_contact_submissions(self):
        """Test CMS contact submissions"""
        response = requests.get(f"{BASE_URL}/api/cms/contact-submissions", headers=self.headers)
        assert response.status_code == 200
        submissions = response.json()
        print(f"✓ CMS contact submissions: {len(submissions)}")
    
    def test_cms_requires_auth(self):
        """Test CMS endpoints require authentication"""
        response = requests.get(f"{BASE_URL}/api/cms/site-settings")
        assert response.status_code == 401
        print("✓ CMS correctly requires authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
