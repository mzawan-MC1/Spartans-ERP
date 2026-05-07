"""
Section 5 Public Website API Tests
Tests for public read-only APIs that don't require authentication
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPublicSiteSettings:
    """Test /api/public/site-settings endpoint"""
    
    def test_get_site_settings_success(self):
        """Site settings should return without auth"""
        response = requests.get(f"{BASE_URL}/api/public/site-settings")
        assert response.status_code == 200
        
        data = response.json()
        assert "site_name" in data
        assert "tagline" in data
        assert "description" in data
        assert "contact_email" in data
        assert "contact_phone" in data
        print(f"✓ Site settings returned: {data.get('site_name')}")


class TestPublicBranches:
    """Test /api/public/branches endpoints"""
    
    def test_get_branches_list(self):
        """Should return list of public branches"""
        response = requests.get(f"{BASE_URL}/api/public/branches")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0, "Expected at least one branch"
        
        # Verify branch structure
        branch = data[0]
        assert "location_id" in branch
        assert "name" in branch
        assert "city" in branch
        print(f"✓ Found {len(data)} branches")
    
    def test_get_single_branch(self):
        """Should return single branch by ID"""
        # First get list to get a valid ID
        list_response = requests.get(f"{BASE_URL}/api/public/branches")
        branches = list_response.json()
        
        if len(branches) > 0:
            branch_id = branches[0]["location_id"]
            response = requests.get(f"{BASE_URL}/api/public/branches/{branch_id}")
            assert response.status_code == 200
            
            data = response.json()
            assert data["location_id"] == branch_id
            print(f"✓ Single branch returned: {data.get('name')}")
    
    def test_get_nonexistent_branch(self):
        """Should return 404 for non-existent branch"""
        response = requests.get(f"{BASE_URL}/api/public/branches/nonexistent_id")
        assert response.status_code == 404


class TestPublicDisciplines:
    """Test /api/public/disciplines endpoints"""
    
    def test_get_disciplines_list(self):
        """Should return list of active disciplines"""
        response = requests.get(f"{BASE_URL}/api/public/disciplines")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 4, f"Expected 4 disciplines, got {len(data)}"
        
        # Verify discipline structure
        discipline = data[0]
        assert "discipline_id" in discipline
        assert "name" in discipline
        assert "slug" in discipline
        assert "short_description" in discipline
        assert "icon" in discipline
        print(f"✓ Found {len(data)} disciplines")
    
    def test_get_discipline_by_slug(self):
        """Should return single discipline by slug"""
        response = requests.get(f"{BASE_URL}/api/public/disciplines/brazilian-jiu-jitsu")
        assert response.status_code == 200
        
        data = response.json()
        assert data["slug"] == "brazilian-jiu-jitsu"
        assert data["name"] == "Brazilian Jiu-Jitsu"
        assert "full_description" in data
        assert "benefits" in data
        assert isinstance(data["benefits"], list)
        print(f"✓ Discipline returned: {data.get('name')}")
    
    def test_get_kickboxing_discipline(self):
        """Should return kickboxing discipline"""
        response = requests.get(f"{BASE_URL}/api/public/disciplines/kickboxing")
        assert response.status_code == 200
        
        data = response.json()
        assert data["slug"] == "kickboxing"
        assert data["icon"] == "🥊"
        print(f"✓ Kickboxing discipline returned")
    
    def test_get_mma_discipline(self):
        """Should return MMA discipline"""
        response = requests.get(f"{BASE_URL}/api/public/disciplines/mma")
        assert response.status_code == 200
        
        data = response.json()
        assert data["slug"] == "mma"
        print(f"✓ MMA discipline returned")
    
    def test_get_crossfit_discipline(self):
        """Should return CrossFit discipline"""
        response = requests.get(f"{BASE_URL}/api/public/disciplines/crossfit")
        assert response.status_code == 200
        
        data = response.json()
        assert data["slug"] == "crossfit"
        print(f"✓ CrossFit discipline returned")
    
    def test_get_nonexistent_discipline(self):
        """Should return 404 for non-existent discipline"""
        response = requests.get(f"{BASE_URL}/api/public/disciplines/nonexistent-slug")
        assert response.status_code == 404


class TestPublicStats:
    """Test /api/public/stats endpoint"""
    
    def test_get_stats(self):
        """Should return public statistics"""
        response = requests.get(f"{BASE_URL}/api/public/stats")
        assert response.status_code == 200
        
        data = response.json()
        assert "branches" in data
        assert "disciplines" in data
        assert "programs" in data
        assert "instructors" in data
        
        # Verify counts are reasonable
        assert data["branches"] >= 0
        assert data["disciplines"] >= 0
        print(f"✓ Stats: {data['branches']} branches, {data['disciplines']} disciplines, {data['programs']} programs, {data['instructors']} instructors")


class TestPublicPricing:
    """Test /api/public/pricing endpoint"""
    
    def test_get_pricing_plans(self):
        """Should return list of pricing plans"""
        response = requests.get(f"{BASE_URL}/api/public/pricing")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 4, f"Expected at least 4 pricing plans, got {len(data)}"
        
        # Verify pricing structure
        plan = data[0]
        assert "plan_id" in plan
        assert "name" in plan
        assert "price" in plan
        assert "features" in plan
        print(f"✓ Found {len(data)} pricing plans")


class TestPublicFAQs:
    """Test /api/public/faqs endpoint"""
    
    def test_get_faqs(self):
        """Should return list of FAQs"""
        response = requests.get(f"{BASE_URL}/api/public/faqs")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 6, f"Expected at least 6 FAQs, got {len(data)}"
        
        # Verify FAQ structure
        faq = data[0]
        assert "faq_id" in faq
        assert "question" in faq
        assert "answer" in faq
        assert "category" in faq
        print(f"✓ Found {len(data)} FAQs")


class TestPublicPages:
    """Test /api/public/pages endpoint"""
    
    def test_get_privacy_page(self):
        """Should return privacy policy page"""
        response = requests.get(f"{BASE_URL}/api/public/pages/privacy")
        assert response.status_code == 200
        
        data = response.json()
        assert data["slug"] == "privacy"
        assert "content" in data
        assert "Privacy Policy" in data.get("title", "") or "Privacy" in data.get("content", "")
        print(f"✓ Privacy page returned")
    
    def test_get_terms_page(self):
        """Should return terms of service page"""
        response = requests.get(f"{BASE_URL}/api/public/pages/terms")
        assert response.status_code == 200
        
        data = response.json()
        assert data["slug"] == "terms"
        assert "content" in data
        print(f"✓ Terms page returned")
    
    def test_get_nonexistent_page(self):
        """Should return 404 for non-existent page"""
        response = requests.get(f"{BASE_URL}/api/public/pages/nonexistent-page")
        assert response.status_code == 404


class TestPublicContact:
    """Test /api/public/contact endpoint"""
    
    def test_submit_contact_form(self):
        """Should submit contact form successfully"""
        contact_data = {
            "name": "TEST_Contact User",
            "email": "test_contact@example.com",
            "phone": "+971-50-123-4567",
            "subject": "Test Inquiry",
            "message": "This is a test contact submission"
        }
        
        response = requests.post(f"{BASE_URL}/api/public/contact", json=contact_data)
        assert response.status_code == 201
        
        data = response.json()
        assert "message" in data
        assert "submission_id" in data
        print(f"✓ Contact form submitted: {data.get('submission_id')}")
    
    def test_submit_contact_minimal(self):
        """Should submit contact with minimal required fields"""
        contact_data = {
            "name": "TEST_Minimal User",
            "email": "minimal@example.com",
            "message": "Minimal test message"
        }
        
        response = requests.post(f"{BASE_URL}/api/public/contact", json=contact_data)
        assert response.status_code == 201
        print(f"✓ Minimal contact form submitted")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
