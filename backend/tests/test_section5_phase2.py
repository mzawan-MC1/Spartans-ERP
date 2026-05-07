"""
Section 5 Phase 2 Tests - Public Website & CMS Dashboard
Tests for Pricing, Contact, FAQs, Static Pages, and CMS Admin APIs
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# ─── Public API Tests (No Auth Required) ──────────────────────────

class TestPublicPricing:
    """Test /api/public/pricing endpoint"""
    
    def test_get_pricing_plans(self):
        """Should return list of pricing plans"""
        response = requests.get(f"{BASE_URL}/api/public/pricing")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Found {len(data)} pricing plans")
        
        if len(data) > 0:
            plan = data[0]
            assert "plan_id" in plan
            assert "name" in plan
            assert "price" in plan
            assert "currency" in plan
            assert "billing_period" in plan
            print(f"✓ First plan: {plan.get('name')} - {plan.get('currency')} {plan.get('price')}")


class TestPublicFAQs:
    """Test /api/public/faqs endpoint"""
    
    def test_get_faqs(self):
        """Should return list of FAQs"""
        response = requests.get(f"{BASE_URL}/api/public/faqs")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Found {len(data)} FAQs")
        
        if len(data) > 0:
            faq = data[0]
            assert "faq_id" in faq
            assert "question" in faq
            assert "answer" in faq
            assert "category" in faq
            print(f"✓ First FAQ category: {faq.get('category')}")


class TestPublicStaticPages:
    """Test /api/public/pages/{slug} endpoint"""
    
    def test_get_privacy_page(self):
        """Should return privacy policy page"""
        response = requests.get(f"{BASE_URL}/api/public/pages/privacy")
        assert response.status_code == 200
        
        data = response.json()
        assert "page_id" in data
        assert "title" in data
        assert "slug" in data
        assert data["slug"] == "privacy"
        assert "content" in data
        print(f"✓ Privacy page: {data.get('title')}")
    
    def test_get_terms_page(self):
        """Should return terms of service page"""
        response = requests.get(f"{BASE_URL}/api/public/pages/terms")
        assert response.status_code == 200
        
        data = response.json()
        assert "page_id" in data
        assert "title" in data
        assert data["slug"] == "terms"
        print(f"✓ Terms page: {data.get('title')}")
    
    def test_get_nonexistent_page(self):
        """Should return 404 for non-existent page"""
        response = requests.get(f"{BASE_URL}/api/public/pages/nonexistent-page-xyz")
        assert response.status_code == 404


class TestPublicContact:
    """Test /api/public/contact endpoint"""
    
    def test_submit_contact_form(self):
        """Should submit contact form successfully"""
        unique_id = uuid.uuid4().hex[:8]
        contact_data = {
            "name": f"TEST_User_{unique_id}",
            "email": f"test_{unique_id}@example.com",
            "phone": "+971-50-123-4567",
            "subject": "Free Trial",
            "message": "I would like to book a free trial class for BJJ.",
            "branch_id": None
        }
        
        response = requests.post(f"{BASE_URL}/api/public/contact", json=contact_data)
        assert response.status_code == 201
        
        data = response.json()
        assert "message" in data
        assert "submission_id" in data
        print(f"✓ Contact submitted: {data.get('submission_id')}")
    
    def test_submit_contact_minimal(self):
        """Should submit contact with minimal required fields"""
        unique_id = uuid.uuid4().hex[:8]
        contact_data = {
            "name": f"TEST_Minimal_{unique_id}",
            "email": f"minimal_{unique_id}@example.com",
            "message": "Test message"
        }
        
        response = requests.post(f"{BASE_URL}/api/public/contact", json=contact_data)
        assert response.status_code == 201
        print("✓ Minimal contact form submitted")


# ─── CMS Admin API Tests (Auth Required) ──────────────────────────

class TestCMSAuth:
    """Test CMS Admin APIs require authentication"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for owner"""
        login_data = {
            "email": "owner@spartans.com",
            "password": "Spartans2024!"
        }
        response = requests.post(f"{BASE_URL}/api/auth/login", json=login_data)
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Could not authenticate as owner")
    
    def test_get_site_settings_admin(self):
        """Should get site settings with auth"""
        response = requests.get(f"{BASE_URL}/api/admin/site-settings", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "site_name" in data or "setting_id" in data
        print("✓ Admin site settings accessible")
    
    def test_update_site_settings(self):
        """Should update site settings"""
        update_data = {
            "tagline": "Train Like a Warrior - Updated"
        }
        response = requests.patch(f"{BASE_URL}/api/admin/site-settings", json=update_data, headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("tagline") == "Train Like a Warrior - Updated"
        print("✓ Site settings updated")
        
        # Revert
        requests.patch(f"{BASE_URL}/api/admin/site-settings", json={"tagline": "Train Like a Warrior"}, headers=self.headers)


class TestCMSDisciplines:
    """Test CMS Disciplines CRUD"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for owner"""
        login_data = {
            "email": "owner@spartans.com",
            "password": "Spartans2024!"
        }
        response = requests.post(f"{BASE_URL}/api/auth/login", json=login_data)
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Could not authenticate as owner")
    
    def test_list_disciplines(self):
        """Should list all disciplines"""
        response = requests.get(f"{BASE_URL}/api/admin/disciplines", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Found {len(data)} disciplines in admin")
    
    def test_create_discipline(self):
        """Should create a new discipline"""
        unique_id = uuid.uuid4().hex[:8]
        discipline_data = {
            "name": f"TEST_Discipline_{unique_id}",
            "short_description": "Test discipline description",
            "full_description": "<p>Full test description</p>",
            "icon": "🧪",
            "benefits": ["Test benefit 1", "Test benefit 2"],
            "suitable_for": "All ages",
            "sort_order": 99
        }
        
        response = requests.post(f"{BASE_URL}/api/admin/disciplines", json=discipline_data, headers=self.headers)
        assert response.status_code == 201
        
        data = response.json()
        assert "discipline_id" in data
        assert data["name"] == discipline_data["name"]
        print(f"✓ Created discipline: {data.get('discipline_id')}")
        
        # Cleanup - delete the test discipline
        requests.delete(f"{BASE_URL}/api/admin/disciplines/{data['discipline_id']}", headers=self.headers)


class TestCMSPricing:
    """Test CMS Pricing CRUD"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for owner"""
        login_data = {
            "email": "owner@spartans.com",
            "password": "Spartans2024!"
        }
        response = requests.post(f"{BASE_URL}/api/auth/login", json=login_data)
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Could not authenticate as owner")
    
    def test_list_pricing(self):
        """Should list all pricing plans"""
        response = requests.get(f"{BASE_URL}/api/admin/pricing", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Found {len(data)} pricing plans in admin")
    
    def test_create_pricing(self):
        """Should create a new pricing plan"""
        unique_id = uuid.uuid4().hex[:8]
        pricing_data = {
            "name": f"TEST_Plan_{unique_id}",
            "price": 999,
            "currency": "AED",
            "billing_period": "monthly",
            "description": "Test plan description",
            "features": ["Feature 1", "Feature 2"],
            "is_popular": False,
            "sort_order": 99
        }
        
        response = requests.post(f"{BASE_URL}/api/admin/pricing", json=pricing_data, headers=self.headers)
        assert response.status_code == 201
        
        data = response.json()
        assert "plan_id" in data
        assert data["name"] == pricing_data["name"]
        assert data["price"] == 999
        print(f"✓ Created pricing plan: {data.get('plan_id')}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/admin/pricing/{data['plan_id']}", headers=self.headers)


class TestCMSFAQs:
    """Test CMS FAQs CRUD"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for owner"""
        login_data = {
            "email": "owner@spartans.com",
            "password": "Spartans2024!"
        }
        response = requests.post(f"{BASE_URL}/api/auth/login", json=login_data)
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Could not authenticate as owner")
    
    def test_list_faqs(self):
        """Should list all FAQs"""
        response = requests.get(f"{BASE_URL}/api/admin/faqs", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Found {len(data)} FAQs in admin")
    
    def test_create_faq(self):
        """Should create a new FAQ"""
        unique_id = uuid.uuid4().hex[:8]
        faq_data = {
            "question": f"TEST_Question_{unique_id}?",
            "answer": "This is a test answer.",
            "category": "Testing",
            "sort_order": 99
        }
        
        response = requests.post(f"{BASE_URL}/api/admin/faqs", json=faq_data, headers=self.headers)
        assert response.status_code == 201
        
        data = response.json()
        assert "faq_id" in data
        assert data["question"] == faq_data["question"]
        print(f"✓ Created FAQ: {data.get('faq_id')}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/admin/faqs/{data['faq_id']}", headers=self.headers)


class TestCMSPages:
    """Test CMS Static Pages CRUD"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for owner"""
        login_data = {
            "email": "owner@spartans.com",
            "password": "Spartans2024!"
        }
        response = requests.post(f"{BASE_URL}/api/auth/login", json=login_data)
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Could not authenticate as owner")
    
    def test_list_pages(self):
        """Should list all static pages"""
        response = requests.get(f"{BASE_URL}/api/admin/pages", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Found {len(data)} static pages in admin")
    
    def test_create_page(self):
        """Should create a new static page"""
        unique_id = uuid.uuid4().hex[:8]
        page_data = {
            "title": f"TEST_Page_{unique_id}",
            "slug": f"test-page-{unique_id}",
            "content": "<h1>Test Page</h1><p>This is test content.</p>",
            "meta_description": "Test page meta description"
        }
        
        response = requests.post(f"{BASE_URL}/api/admin/pages", json=page_data, headers=self.headers)
        assert response.status_code == 201
        
        data = response.json()
        assert "page_id" in data
        assert data["title"] == page_data["title"]
        print(f"✓ Created page: {data.get('page_id')}")
        
        # Verify page is accessible publicly
        public_response = requests.get(f"{BASE_URL}/api/public/pages/{page_data['slug']}")
        assert public_response.status_code == 200
        print(f"✓ Page accessible at /page/{page_data['slug']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/admin/pages/{data['page_id']}", headers=self.headers)


class TestCMSContactSubmissions:
    """Test CMS Contact Submissions management"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for owner"""
        login_data = {
            "email": "owner@spartans.com",
            "password": "Spartans2024!"
        }
        response = requests.post(f"{BASE_URL}/api/auth/login", json=login_data)
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Could not authenticate as owner")
    
    def test_list_contact_submissions(self):
        """Should list all contact submissions"""
        response = requests.get(f"{BASE_URL}/api/admin/contact-submissions", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Found {len(data)} contact submissions")
    
    def test_update_submission_status(self):
        """Should update submission status to READ"""
        # First create a submission
        unique_id = uuid.uuid4().hex[:8]
        contact_data = {
            "name": f"TEST_Status_{unique_id}",
            "email": f"status_{unique_id}@example.com",
            "message": "Test message for status update"
        }
        create_response = requests.post(f"{BASE_URL}/api/public/contact", json=contact_data)
        assert create_response.status_code == 201
        submission_id = create_response.json().get("submission_id")
        
        # Update status
        response = requests.patch(
            f"{BASE_URL}/api/admin/contact-submissions/{submission_id}",
            params={"status": "READ"},
            headers=self.headers
        )
        assert response.status_code == 200
        print(f"✓ Updated submission status to READ")


class TestCMSAuthRequired:
    """Test that CMS APIs require authentication"""
    
    def test_site_settings_requires_auth(self):
        """Admin site settings should require auth"""
        response = requests.get(f"{BASE_URL}/api/admin/site-settings")
        assert response.status_code in [401, 403]
    
    def test_disciplines_requires_auth(self):
        """Admin disciplines should require auth"""
        response = requests.get(f"{BASE_URL}/api/admin/disciplines")
        assert response.status_code in [401, 403]
    
    def test_pricing_requires_auth(self):
        """Admin pricing should require auth"""
        response = requests.get(f"{BASE_URL}/api/admin/pricing")
        assert response.status_code in [401, 403]
    
    def test_faqs_requires_auth(self):
        """Admin FAQs should require auth"""
        response = requests.get(f"{BASE_URL}/api/admin/faqs")
        assert response.status_code in [401, 403]
    
    def test_pages_requires_auth(self):
        """Admin pages should require auth"""
        response = requests.get(f"{BASE_URL}/api/admin/pages")
        assert response.status_code in [401, 403]
    
    def test_contact_submissions_requires_auth(self):
        """Admin contact submissions should require auth"""
        response = requests.get(f"{BASE_URL}/api/admin/contact-submissions")
        assert response.status_code in [401, 403]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
