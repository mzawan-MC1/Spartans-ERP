"""
Backend API tests for SEO, Blog, Email Settings, Gallery and Google Reviews endpoints.
Testing the new admin features batch: iteration 23
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from review_request
OWNER_EMAIL = "owner@spartans.com"
OWNER_PASSWORD = "Spartans2024!"

class TestAuthHelper:
    """Helper to get owner auth token"""
    _token = None
    
    @classmethod
    def get_token(cls):
        if cls._token:
            return cls._token
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        if response.status_code == 200:
            cls._token = response.json().get("token")
        return cls._token


@pytest.fixture(scope="module")
def auth_headers():
    token = TestAuthHelper.get_token()
    if not token:
        pytest.skip("Authentication failed - cannot test admin endpoints")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def api_session():
    return requests.Session()


# ────────────────────────────────────────────────────────────────
# PUBLIC ENDPOINTS (No Auth Required)
# ────────────────────────────────────────────────────────────────

class TestPublicGallery:
    """Test GET /api/public/gallery - gallery images from site settings"""
    
    def test_get_public_gallery_returns_200(self, api_session):
        response = api_session.get(f"{BASE_URL}/api/public/gallery")
        assert response.status_code == 200
        data = response.json()
        assert "images" in data
        assert isinstance(data["images"], list)
        print(f"Gallery has {len(data['images'])} images")

    def test_gallery_images_have_required_fields(self, api_session):
        response = api_session.get(f"{BASE_URL}/api/public/gallery")
        data = response.json()
        for img in data.get("images", [])[:3]:  # Check first 3
            assert "image_url" in img
            # Caption is optional
            print(f"Image: {img.get('image_url')}")


class TestPublicFAQs:
    """Test GET /api/public/faqs - FAQ items for landing page"""
    
    def test_get_public_faqs_returns_200(self, api_session):
        response = api_session.get(f"{BASE_URL}/api/public/faqs")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"FAQs count: {len(data)}")

    def test_faqs_have_question_and_answer(self, api_session):
        response = api_session.get(f"{BASE_URL}/api/public/faqs")
        data = response.json()
        for faq in data[:3]:  # Check first 3
            assert "question" in faq
            assert "answer" in faq
            print(f"FAQ: {faq.get('question')[:50]}...")


class TestPublicGoogleReviews:
    """Test GET /api/public/google-reviews - Google reviews (cached)"""
    
    def test_get_google_reviews_returns_200(self, api_session):
        response = api_session.get(f"{BASE_URL}/api/public/google-reviews")
        assert response.status_code == 200
        data = response.json()
        # Should have reviews array even if empty
        assert "reviews" in data
        assert "rating" in data
        assert "total_reviews" in data
        print(f"Reviews: {len(data['reviews'])}, Rating: {data['rating']}")


class TestPublicSEO:
    """Test GET /api/public/seo/{path} - public SEO data for pages"""
    
    def test_get_seo_for_home_returns_200(self, api_session):
        # For root path
        response = api_session.get(f"{BASE_URL}/api/public/seo/%2F")
        assert response.status_code == 200
        data = response.json()
        assert "page" in data
        assert "global" in data
        print(f"Home SEO: {data['page']}")

    def test_get_seo_for_blog_page(self, api_session):
        response = api_session.get(f"{BASE_URL}/api/public/seo/blog")
        assert response.status_code == 200
        data = response.json()
        assert "page" in data
        assert "global" in data


class TestPublicBlogs:
    """Test public blog endpoints"""
    
    def test_get_public_blogs_returns_200(self, api_session):
        response = api_session.get(f"{BASE_URL}/api/public/blogs")
        assert response.status_code == 200
        data = response.json()
        assert "blogs" in data
        assert isinstance(data["blogs"], list)
        print(f"Published blogs count: {len(data['blogs'])}")

    def test_get_public_blog_by_slug(self, api_session):
        # First get list to find a slug
        list_response = api_session.get(f"{BASE_URL}/api/public/blogs")
        blogs = list_response.json().get("blogs", [])
        if not blogs:
            pytest.skip("No published blogs to test")
        
        slug = blogs[0]["slug"]
        response = api_session.get(f"{BASE_URL}/api/public/blogs/{slug}")
        assert response.status_code == 200
        blog = response.json()
        assert blog["slug"] == slug
        assert "title" in blog
        print(f"Blog: {blog['title']}")

    def test_get_nonexistent_blog_returns_404(self, api_session):
        response = api_session.get(f"{BASE_URL}/api/public/blogs/this-slug-does-not-exist-xyz")
        assert response.status_code == 404


# ────────────────────────────────────────────────────────────────
# SEO ADMIN ENDPOINTS (Owner Auth Required)
# ────────────────────────────────────────────────────────────────

class TestSEOAdminEndpoints:
    """Test SEO settings admin CRUD"""
    
    def test_list_seo_settings(self, api_session, auth_headers):
        response = api_session.get(f"{BASE_URL}/api/admin/seo", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "pages" in data
        assert "global_seo" in data
        print(f"SEO pages configured: {len(data['pages'])}")

    def test_update_page_seo(self, api_session, auth_headers):
        payload = {
            "page_path": "/test-page",
            "page_title": f"TEST_{uuid.uuid4().hex[:6]} Title",
            "meta_description": "Test meta description",
            "meta_keywords": "test, keywords",
            "head_code": "<!-- test head -->",
            "body_code": "<!-- test body -->"
        }
        response = api_session.patch(f"{BASE_URL}/api/admin/seo/page", json=payload, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["page_title"] == payload["page_title"]
        assert data["meta_description"] == payload["meta_description"]
        print(f"Page SEO saved: {data['page_path']}")

    def test_update_global_seo(self, api_session, auth_headers):
        payload = {
            "head_code": "<!-- Global Analytics Test -->",
            "body_code": "<!-- Global Script Test -->"
        }
        response = api_session.patch(f"{BASE_URL}/api/admin/seo/global", json=payload, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["head_code"] == payload["head_code"]
        print("Global SEO saved")

    def test_seo_requires_owner_auth(self, api_session):
        response = api_session.get(f"{BASE_URL}/api/admin/seo")
        assert response.status_code == 401


# ────────────────────────────────────────────────────────────────
# BLOG ADMIN ENDPOINTS (Owner Auth Required)
# ────────────────────────────────────────────────────────────────

class TestBlogAdminEndpoints:
    """Test Blog CRUD endpoints"""
    created_blog_id = None
    
    def test_list_admin_blogs(self, api_session, auth_headers):
        response = api_session.get(f"{BASE_URL}/api/admin/blogs", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "blogs" in data
        print(f"Admin blogs count: {len(data['blogs'])}")

    def test_create_blog(self, api_session, auth_headers):
        payload = {
            "title": f"TEST_Blog_{uuid.uuid4().hex[:6]}",
            "content_html": "<p>Test blog content</p>",
            "excerpt": "Test excerpt",
            "tags": ["test", "pytest"],
            "status": "draft",
            "seo_title": "Test SEO Title",
            "seo_description": "Test SEO Description",
            "seo_keywords": "test, seo"
        }
        response = api_session.post(f"{BASE_URL}/api/admin/blogs", json=payload, headers=auth_headers)
        assert response.status_code == 200
        blog = response.json()
        assert blog["title"] == payload["title"]
        assert "blog_id" in blog
        assert "slug" in blog
        TestBlogAdminEndpoints.created_blog_id = blog["blog_id"]
        print(f"Created blog: {blog['blog_id']} with slug: {blog['slug']}")

    def test_update_blog(self, api_session, auth_headers):
        if not TestBlogAdminEndpoints.created_blog_id:
            pytest.skip("No blog created to update")
        
        blog_id = TestBlogAdminEndpoints.created_blog_id
        payload = {
            "title": f"TEST_Blog_Updated_{uuid.uuid4().hex[:6]}",
            "status": "published"
        }
        response = api_session.patch(f"{BASE_URL}/api/admin/blogs/{blog_id}", json=payload, headers=auth_headers)
        assert response.status_code == 200
        blog = response.json()
        assert "Updated" in blog["title"]
        assert blog["status"] == "published"
        print(f"Updated blog: {blog['blog_id']}")

    def test_delete_blog(self, api_session, auth_headers):
        if not TestBlogAdminEndpoints.created_blog_id:
            pytest.skip("No blog to delete")
        
        blog_id = TestBlogAdminEndpoints.created_blog_id
        response = api_session.delete(f"{BASE_URL}/api/admin/blogs/{blog_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["deleted"] == True
        print(f"Deleted blog: {blog_id}")

    def test_delete_nonexistent_blog_returns_404(self, api_session, auth_headers):
        response = api_session.delete(f"{BASE_URL}/api/admin/blogs/nonexistent_blog_id", headers=auth_headers)
        assert response.status_code == 404


# ────────────────────────────────────────────────────────────────
# EMAIL ADMIN ENDPOINTS (Owner Auth Required)
# ────────────────────────────────────────────────────────────────

class TestEmailAdminEndpoints:
    """Test Email Settings CRUD"""
    created_template_id = None
    
    def test_get_smtp_config(self, api_session, auth_headers):
        response = api_session.get(f"{BASE_URL}/api/admin/email/smtp", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        # Should have default fields even if not configured
        assert "host" in data
        assert "port" in data
        print(f"SMTP host: {data.get('host') or 'not configured'}")

    def test_update_smtp_config(self, api_session, auth_headers):
        payload = {
            "host": "smtp.test.com",
            "port": 587,
            "username": "test@example.com",
            "use_tls": True,
            "from_email": "noreply@test.com",
            "from_name": "Test Gym"
        }
        response = api_session.patch(f"{BASE_URL}/api/admin/email/smtp", json=payload, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["host"] == "smtp.test.com"
        assert data["port"] == 587
        print("SMTP config updated")

    def test_get_variable_registry(self, api_session, auth_headers):
        response = api_session.get(f"{BASE_URL}/api/admin/email/variables", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "variables" in data
        assert len(data["variables"]) >= 10  # Should have at least 10 variables
        print(f"Variable registry has {len(data['variables'])} variables")
        # Check structure
        for var in data["variables"][:3]:
            assert "key" in var
            assert "description" in var

    def test_list_email_templates(self, api_session, auth_headers):
        response = api_session.get(f"{BASE_URL}/api/admin/email/templates", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "templates" in data
        print(f"Email templates count: {len(data['templates'])}")

    def test_create_email_template(self, api_session, auth_headers):
        payload = {
            "name": f"TEST_Template_{uuid.uuid4().hex[:6]}",
            "subject": "Test Subject {{member_name}}",
            "body_html": "<p>Hello {{member_name}}</p>",
            "variables": ["member_name"],
            "category": "custom",
            "is_active": True
        }
        response = api_session.post(f"{BASE_URL}/api/admin/email/templates", json=payload, headers=auth_headers)
        assert response.status_code == 200
        template = response.json()
        assert template["name"] == payload["name"]
        assert "template_id" in template
        TestEmailAdminEndpoints.created_template_id = template["template_id"]
        print(f"Created template: {template['template_id']}")

    def test_update_email_template(self, api_session, auth_headers):
        if not TestEmailAdminEndpoints.created_template_id:
            pytest.skip("No template created to update")
        
        template_id = TestEmailAdminEndpoints.created_template_id
        payload = {
            "name": f"TEST_Template_Updated_{uuid.uuid4().hex[:6]}",
            "subject": "Updated Subject"
        }
        response = api_session.patch(f"{BASE_URL}/api/admin/email/templates/{template_id}", json=payload, headers=auth_headers)
        assert response.status_code == 200
        template = response.json()
        assert "Updated" in template["name"]
        print(f"Updated template: {template['template_id']}")

    def test_delete_email_template(self, api_session, auth_headers):
        if not TestEmailAdminEndpoints.created_template_id:
            pytest.skip("No template to delete")
        
        template_id = TestEmailAdminEndpoints.created_template_id
        response = api_session.delete(f"{BASE_URL}/api/admin/email/templates/{template_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["deleted"] == True
        print(f"Deleted template: {template_id}")

    def test_email_requires_owner_auth(self, api_session):
        response = api_session.get(f"{BASE_URL}/api/admin/email/smtp")
        assert response.status_code == 401


# ────────────────────────────────────────────────────────────────
# SITE SETTINGS (Gallery & Reviews Configuration)
# ────────────────────────────────────────────────────────────────

class TestSiteSettingsGalleryReviews:
    """Test Gallery and Google Reviews via site settings API"""
    
    def test_update_gallery_images(self, api_session, auth_headers):
        """Update gallery_images in site settings"""
        payload = {
            "gallery_images": [
                {"image_url": "https://example.com/img1.jpg", "caption": "Test 1", "sort_order": 0, "is_active": True},
                {"image_url": "https://example.com/img2.jpg", "caption": "Test 2", "sort_order": 1, "is_active": True}
            ]
        }
        response = api_session.patch(f"{BASE_URL}/api/admin/site-settings", json=payload, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        # Should have the updated gallery images
        print("Gallery images updated in site settings")

    def test_update_google_reviews_config(self, api_session, auth_headers):
        """Update Google Place ID and API Key"""
        payload = {
            "google_place_id": "TEST_PLACE_ID",
            "google_reviews_api_key": ""  # Empty to not use real API
        }
        response = api_session.patch(f"{BASE_URL}/api/admin/site-settings", json=payload, headers=auth_headers)
        assert response.status_code == 200
        print("Google reviews config updated")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
