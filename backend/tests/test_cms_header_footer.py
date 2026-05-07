"""
Test CMS Header and Footer Management Features
- PATCH /api/admin/site-settings for header/footer fields
- GET /api/public/site-settings returns all CMS fields
- Owner authentication required for admin endpoints
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
OWNER_EMAIL = "owner@spartans.com"
OWNER_PASSWORD = "Spartans2024!"


@pytest.fixture(scope="module")
def owner_token():
    """Authenticate as owner and get session token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": OWNER_EMAIL,
        "password": OWNER_PASSWORD
    })
    assert response.status_code == 200, f"Owner login failed: {response.text}"
    data = response.json()
    assert "token" in data, "No token in response"
    assert data.get("user", {}).get("role") == "OWNER", "User is not owner"
    return data["token"]


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestPublicSiteSettingsAPI:
    """Test GET /api/public/site-settings returns all CMS fields"""

    def test_public_site_settings_returns_header_menu(self, api_client):
        """Verify header_menu is returned in public site-settings"""
        response = api_client.get(f"{BASE_URL}/api/public/site-settings")
        assert response.status_code == 200
        data = response.json()
        
        # Verify header fields exist
        assert "header_menu" in data, "header_menu not in response"
        assert isinstance(data["header_menu"], list), "header_menu should be a list"
        
        # Check menu items structure
        if len(data["header_menu"]) > 0:
            menu_item = data["header_menu"][0]
            assert "label" in menu_item, "Menu item missing 'label'"
            assert "url" in menu_item, "Menu item missing 'url'"
            assert "is_active" in menu_item, "Menu item missing 'is_active'"

    def test_public_site_settings_returns_header_cta(self, api_client):
        """Verify header CTA fields are returned"""
        response = api_client.get(f"{BASE_URL}/api/public/site-settings")
        assert response.status_code == 200
        data = response.json()
        
        assert "header_cta_text" in data, "header_cta_text not in response"
        assert "header_cta_url" in data, "header_cta_url not in response"

    def test_public_site_settings_returns_footer_fields(self, api_client):
        """Verify footer fields are returned in public site-settings"""
        response = api_client.get(f"{BASE_URL}/api/public/site-settings")
        assert response.status_code == 200
        data = response.json()
        
        # Check footer fields
        assert "footer_description" in data or "description" in data, "No footer/description field"
        assert "footer_quick_links" in data, "footer_quick_links not in response"
        assert "footer_contact" in data, "footer_contact not in response"
        
        # Verify quick links structure
        if data.get("footer_quick_links"):
            link = data["footer_quick_links"][0]
            assert "label" in link, "Quick link missing 'label'"
            assert "url" in link, "Quick link missing 'url'"
        
        # Verify contact structure
        if data.get("footer_contact"):
            contact = data["footer_contact"]
            assert "phone" in contact or "email" in contact, "Contact missing phone/email"

    def test_public_site_settings_returns_social_links(self, api_client):
        """Verify social_links are returned"""
        response = api_client.get(f"{BASE_URL}/api/public/site-settings")
        assert response.status_code == 200
        data = response.json()
        
        assert "social_links" in data, "social_links not in response"
        assert isinstance(data["social_links"], dict), "social_links should be a dict"


class TestAdminSiteSettingsAPI:
    """Test PATCH /api/admin/site-settings for header/footer fields"""

    def test_admin_site_settings_requires_auth(self, api_client):
        """Verify admin endpoint requires authentication"""
        response = api_client.patch(f"{BASE_URL}/api/admin/site-settings", json={
            "site_name": "Test"
        })
        assert response.status_code == 401, "Should require auth"

    def test_update_header_menu(self, api_client, owner_token):
        """Test updating header_menu via PATCH"""
        test_menu = [
            {"label": "Home", "url": "/", "is_active": True, "sort_order": 0},
            {"label": "About", "url": "/about", "is_active": True, "sort_order": 1},
            {"label": "Test Link", "url": "/test", "is_active": False, "sort_order": 2}
        ]
        
        api_client.headers.update({"Authorization": f"Bearer {owner_token}"})
        response = api_client.patch(f"{BASE_URL}/api/admin/site-settings", json={
            "header_menu": test_menu
        })
        
        assert response.status_code == 200, f"Update failed: {response.text}"
        data = response.json()
        
        assert "header_menu" in data, "header_menu not in response"
        assert len(data["header_menu"]) == 3, "Menu items not saved"
        assert data["header_menu"][2]["label"] == "Test Link", "Menu item label mismatch"
        assert data["header_menu"][2]["is_active"] == False, "Menu item is_active should be False"

    def test_update_header_cta(self, api_client, owner_token):
        """Test updating header CTA text and URL"""
        api_client.headers.update({"Authorization": f"Bearer {owner_token}"})
        
        response = api_client.patch(f"{BASE_URL}/api/admin/site-settings", json={
            "header_cta_text": "TEST Start Now",
            "header_cta_url": "/test-signup"
        })
        
        assert response.status_code == 200, f"Update failed: {response.text}"
        data = response.json()
        
        assert data.get("header_cta_text") == "TEST Start Now", "CTA text not saved"
        assert data.get("header_cta_url") == "/test-signup", "CTA URL not saved"
        
        # Verify via public API
        public_response = api_client.get(f"{BASE_URL}/api/public/site-settings")
        public_data = public_response.json()
        assert public_data.get("header_cta_text") == "TEST Start Now", "CTA not in public API"

    def test_update_footer_description(self, api_client, owner_token):
        """Test updating footer description"""
        api_client.headers.update({"Authorization": f"Bearer {owner_token}"})
        
        response = api_client.patch(f"{BASE_URL}/api/admin/site-settings", json={
            "footer_description": "TEST footer description for Spartans Gym"
        })
        
        assert response.status_code == 200, f"Update failed: {response.text}"
        data = response.json()
        
        assert data.get("footer_description") == "TEST footer description for Spartans Gym", "Description not saved"

    def test_update_footer_quick_links(self, api_client, owner_token):
        """Test updating footer quick links"""
        test_links = [
            {"label": "Home", "url": "/"},
            {"label": "About", "url": "/about"},
            {"label": "TEST Link", "url": "/test-link"}
        ]
        
        api_client.headers.update({"Authorization": f"Bearer {owner_token}"})
        response = api_client.patch(f"{BASE_URL}/api/admin/site-settings", json={
            "footer_quick_links": test_links
        })
        
        assert response.status_code == 200, f"Update failed: {response.text}"
        data = response.json()
        
        assert "footer_quick_links" in data, "footer_quick_links not in response"
        assert len(data["footer_quick_links"]) == 3, "Quick links not saved"
        assert data["footer_quick_links"][2]["label"] == "TEST Link", "Quick link label mismatch"

    def test_update_footer_contact(self, api_client, owner_token):
        """Test updating footer contact information"""
        test_contact = {
            "phone": "+971-TEST-123456",
            "email": "test@spartans.ae",
            "address": "TEST Address, Dubai, UAE",
            "working_hours": "TEST Mon-Sat: 7AM-9PM"
        }
        
        api_client.headers.update({"Authorization": f"Bearer {owner_token}"})
        response = api_client.patch(f"{BASE_URL}/api/admin/site-settings", json={
            "footer_contact": test_contact
        })
        
        assert response.status_code == 200, f"Update failed: {response.text}"
        data = response.json()
        
        assert "footer_contact" in data, "footer_contact not in response"
        assert data["footer_contact"]["phone"] == "+971-TEST-123456", "Phone not saved"
        assert data["footer_contact"]["email"] == "test@spartans.ae", "Email not saved"
        assert data["footer_contact"]["address"] == "TEST Address, Dubai, UAE", "Address not saved"
        assert data["footer_contact"]["working_hours"] == "TEST Mon-Sat: 7AM-9PM", "Working hours not saved"

    def test_update_social_links(self, api_client, owner_token):
        """Test updating social media links"""
        test_social = {
            "instagram": "https://instagram.com/test",
            "facebook": "https://facebook.com/test",
            "youtube": "https://youtube.com/test",
            "twitter": "https://x.com/test",
            "tiktok": "https://tiktok.com/@test",
            "linkedin": "https://linkedin.com/company/test"
        }
        
        api_client.headers.update({"Authorization": f"Bearer {owner_token}"})
        response = api_client.patch(f"{BASE_URL}/api/admin/site-settings", json={
            "social_links": test_social
        })
        
        assert response.status_code == 200, f"Update failed: {response.text}"
        data = response.json()
        
        assert "social_links" in data, "social_links not in response"
        assert data["social_links"].get("instagram") == "https://instagram.com/test", "Instagram not saved"
        assert data["social_links"].get("twitter") == "https://x.com/test", "Twitter not saved"


class TestCleanup:
    """Reset site settings to original values"""
    
    def test_restore_original_values(self, api_client, owner_token):
        """Restore original header/footer settings"""
        original_menu = [
            {"label": "Home", "url": "/", "is_active": True, "sort_order": 0},
            {"label": "Locations", "url": "/branches", "is_active": True, "sort_order": 1},
            {"label": "Disciplines", "url": "/disciplines", "is_active": True, "sort_order": 2},
            {"label": "Pricing", "url": "/pricing", "is_active": True, "sort_order": 3},
            {"label": "FAQ", "url": "/faqs", "is_active": True, "sort_order": 4},
            {"label": "Contact", "url": "/contact", "is_active": True, "sort_order": 5}
        ]
        
        original_quick_links = [
            {"label": "Home", "url": "/"},
            {"label": "Disciplines", "url": "/disciplines"},
            {"label": "Pricing", "url": "/pricing"},
            {"label": "Contact", "url": "/contact"}
        ]
        
        original_contact = {
            "phone": "+971-50-000-0000",
            "email": "info@spartans.ae",
            "address": "Multiple Locations Across UAE",
            "working_hours": "Mon-Sat: 6AM-10PM"
        }
        
        original_social = {
            "instagram": "https://instagram.com/spartansuae",
            "facebook": "https://facebook.com/spartansuae",
            "youtube": "https://youtube.com/spartansuae"
        }
        
        api_client.headers.update({"Authorization": f"Bearer {owner_token}"})
        response = api_client.patch(f"{BASE_URL}/api/admin/site-settings", json={
            "header_menu": original_menu,
            "header_cta_text": "Get Started",
            "header_cta_url": "/contact",
            "footer_description": "UAE Premier martial arts gym",
            "footer_quick_links": original_quick_links,
            "footer_contact": original_contact,
            "social_links": original_social
        })
        
        assert response.status_code == 200, f"Restore failed: {response.text}"
        print("Original settings restored successfully")
