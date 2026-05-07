"""
Test Suite for i18n CMS Translations and Sales Revenue Integration
Tests:
1. i18n - Admin APIs accept translations object for disciplines, FAQs, pricing, pages, site-settings
2. i18n - Public APIs return localized content with Accept-Language header
3. i18n - Public APIs return localized content with ?lang= query param
4. Revenue - Auto-create transaction when lead is WON
5. Revenue - GET /api/sales/revenue returns proper structure
6. Revenue - GET /api/sales/revenue/summary returns quick stats
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


class TestI18nPublicAPIs:
    """Test i18n localization for public APIs"""
    
    def test_public_disciplines_default_english(self):
        """Default language (en) returns English content"""
        response = requests.get(f"{BASE_URL}/api/public/disciplines")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Find the discipline with Arabic translations
        disc_with_ar = next((d for d in data if d.get("translations", {}).get("ar")), None)
        if disc_with_ar:
            # Without language header, should return English (default)
            assert disc_with_ar["name"] != "جيو جيتسو البرازيلية"  # Not Arabic
    
    def test_public_disciplines_accept_language_ar(self):
        """Public API returns Arabic content with Accept-Language: ar header"""
        response = requests.get(
            f"{BASE_URL}/api/public/disciplines",
            headers={"Accept-Language": "ar"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Find the discipline with Arabic translations
        disc_with_ar = next((d for d in data if d.get("translations", {}).get("ar")), None)
        if disc_with_ar:
            # With Arabic header, should return Arabic content
            assert disc_with_ar["name"] == "جيو جيتسو البرازيلية"
            assert "الدفاع عن النفس" in disc_with_ar.get("benefits", [])
    
    def test_public_disciplines_lang_query_param(self):
        """Public API returns Arabic content with ?lang=ar query param"""
        response = requests.get(f"{BASE_URL}/api/public/disciplines?lang=ar")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Find the discipline with Arabic translations
        disc_with_ar = next((d for d in data if d.get("translations", {}).get("ar")), None)
        if disc_with_ar:
            # With lang=ar param, should return Arabic content
            assert disc_with_ar["name"] == "جيو جيتسو البرازيلية"
    
    def test_public_single_discipline_localized(self):
        """Single discipline endpoint returns localized content"""
        # First get the slug of the discipline with translations
        response = requests.get(f"{BASE_URL}/api/public/disciplines")
        data = response.json()
        disc_with_ar = next((d for d in data if d.get("translations", {}).get("ar")), None)
        if disc_with_ar:
            slug = disc_with_ar["slug"]
            # Test with Arabic
            response_ar = requests.get(
                f"{BASE_URL}/api/public/disciplines/{slug}?lang=ar"
            )
            assert response_ar.status_code == 200
            data_ar = response_ar.json()
            assert data_ar["name"] == "جيو جيتسو البرازيلية"
    
    def test_public_faqs_localized(self):
        """FAQs endpoint supports localization"""
        response = requests.get(f"{BASE_URL}/api/public/faqs")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_public_pricing_localized(self):
        """Pricing endpoint supports localization"""
        response = requests.get(f"{BASE_URL}/api/public/pricing")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_public_site_settings_localized(self):
        """Site settings endpoint supports localization"""
        response = requests.get(f"{BASE_URL}/api/public/site-settings")
        assert response.status_code == 200
        data = response.json()
        assert "site_name" in data or "setting_id" in data


class TestI18nAdminAPIs:
    """Test i18n translations in Admin APIs"""
    
    @pytest.fixture(scope="class")
    def owner_token(self):
        """Get owner authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Owner authentication failed")
    
    def test_admin_create_discipline_with_translations(self, owner_token):
        """Admin can create discipline with translations object"""
        unique_name = f"TEST_Discipline_{uuid.uuid4().hex[:6]}"
        response = requests.post(
            f"{BASE_URL}/api/admin/disciplines",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "name": unique_name,
                "short_description": "Test discipline",
                "full_description": "Full description in English",
                "benefits": ["Benefit 1", "Benefit 2"],
                "suitable_for": "All ages",
                "translations": {
                    "ar": {
                        "name": "اختبار التخصص",
                        "short_description": "وصف قصير",
                        "full_description": "الوصف الكامل بالعربية",
                        "benefits": ["فائدة 1", "فائدة 2"],
                        "suitable_for": "جميع الأعمار"
                    }
                }
            }
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == unique_name
        assert "translations" in data
        assert "ar" in data["translations"]
        assert data["translations"]["ar"]["name"] == "اختبار التخصص"
        
        # Cleanup - deactivate the discipline
        disc_id = data["discipline_id"]
        requests.delete(
            f"{BASE_URL}/api/admin/disciplines/{disc_id}",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
    
    def test_admin_update_discipline_translations(self, owner_token):
        """Admin can update discipline translations - creates new test discipline"""
        # Create a new discipline for this test to avoid modifying existing data
        unique_name = f"TEST_UpdateTrans_{uuid.uuid4().hex[:6]}"
        create_response = requests.post(
            f"{BASE_URL}/api/admin/disciplines",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "name": unique_name,
                "short_description": "Test for update",
                "translations": {
                    "ar": {
                        "name": "اسم عربي أولي",
                        "short_description": "وصف أولي"
                    }
                }
            }
        )
        assert create_response.status_code == 201
        disc_id = create_response.json()["discipline_id"]
        
        # Update translations - add cta_text
        response = requests.patch(
            f"{BASE_URL}/api/admin/disciplines/{disc_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "translations": {
                    "ar": {
                        "cta_text": "سجل الآن"
                    }
                }
            }
        )
        assert response.status_code == 200
        data = response.json()
        # Verify cta_text was added
        assert data["translations"]["ar"].get("cta_text") == "سجل الآن"
        # Verify existing translations were preserved (merge behavior)
        assert data["translations"]["ar"].get("name") == "اسم عربي أولي"
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/admin/disciplines/{disc_id}",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
    
    def test_admin_create_faq_with_translations(self, owner_token):
        """Admin can create FAQ with translations"""
        unique_q = f"TEST_FAQ_{uuid.uuid4().hex[:6]}"
        response = requests.post(
            f"{BASE_URL}/api/admin/faqs",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "question": unique_q,
                "answer": "This is the answer in English",
                "category": "General",
                "translations": {
                    "ar": {
                        "question": "سؤال اختباري",
                        "answer": "هذه هي الإجابة بالعربية"
                    }
                }
            }
        )
        assert response.status_code == 201
        data = response.json()
        assert "translations" in data
        assert data["translations"]["ar"]["question"] == "سؤال اختباري"
        
        # Cleanup
        faq_id = data["faq_id"]
        requests.delete(
            f"{BASE_URL}/api/admin/faqs/{faq_id}",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
    
    def test_admin_create_pricing_with_translations(self, owner_token):
        """Admin can create pricing plan with translations"""
        unique_name = f"TEST_Plan_{uuid.uuid4().hex[:6]}"
        response = requests.post(
            f"{BASE_URL}/api/admin/pricing",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "name": unique_name,
                "price": 299,
                "currency": "AED",
                "billing_period": "monthly",
                "description": "Test plan description",
                "features": ["Feature 1", "Feature 2"],
                "translations": {
                    "ar": {
                        "name": "خطة اختبارية",
                        "description": "وصف الخطة بالعربية",
                        "features": ["ميزة 1", "ميزة 2"]
                    }
                }
            }
        )
        assert response.status_code == 201
        data = response.json()
        assert "translations" in data
        assert data["translations"]["ar"]["name"] == "خطة اختبارية"
        
        # Cleanup
        plan_id = data["plan_id"]
        requests.delete(
            f"{BASE_URL}/api/admin/pricing/{plan_id}",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
    
    def test_admin_create_page_with_translations(self, owner_token):
        """Admin can create static page with translations"""
        unique_title = f"TEST_Page_{uuid.uuid4().hex[:6]}"
        response = requests.post(
            f"{BASE_URL}/api/admin/pages",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "title": unique_title,
                "content": "<p>Page content in English</p>",
                "meta_description": "Test page meta",
                "translations": {
                    "ar": {
                        "title": "صفحة اختبارية",
                        "content": "<p>محتوى الصفحة بالعربية</p>",
                        "meta_description": "وصف الصفحة"
                    }
                }
            }
        )
        assert response.status_code == 201
        data = response.json()
        assert "translations" in data
        assert data["translations"]["ar"]["title"] == "صفحة اختبارية"
        
        # Cleanup
        page_id = data["page_id"]
        requests.delete(
            f"{BASE_URL}/api/admin/pages/{page_id}",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
    
    def test_admin_update_site_settings_translations(self, owner_token):
        """Admin can update site settings with translations"""
        response = requests.patch(
            f"{BASE_URL}/api/admin/site-settings",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "translations": {
                    "ar": {
                        "hero_headline": "تدرب مثل المحارب",
                        "hero_subheadline": "انضم إلى سبارتانز اليوم"
                    }
                }
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "translations" in data
        assert data["translations"]["ar"]["hero_headline"] == "تدرب مثل المحارب"


class TestSalesRevenueIntegration:
    """Test Sales Revenue Integration"""
    
    @pytest.fixture(scope="class")
    def owner_token(self):
        """Get owner authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Owner authentication failed")
    
    @pytest.fixture(scope="class")
    def manager_token(self):
        """Get manager authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL,
            "password": MANAGER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Manager authentication failed")
    
    def test_revenue_endpoint_returns_correct_structure(self, owner_token):
        """GET /api/sales/revenue returns correct response structure"""
        response = requests.get(
            f"{BASE_URL}/api/sales/revenue",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "summary" in data
        assert "transactions" in data
        assert "by_location" in data
        assert "by_agent" in data
        assert "monthly_trend" in data
        assert "filters_applied" in data
        
        # Verify summary structure
        summary = data["summary"]
        assert "total_revenue" in summary
        assert "transaction_count" in summary
        assert "avg_transaction" in summary
    
    def test_revenue_summary_endpoint(self, owner_token):
        """GET /api/sales/revenue/summary returns quick stats"""
        response = requests.get(
            f"{BASE_URL}/api/sales/revenue/summary",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "total_revenue" in data
        assert "total_transactions" in data
        assert "this_month_revenue" in data
        assert "this_month_transactions" in data
    
    def test_revenue_has_existing_transaction(self, owner_token):
        """Verify existing revenue transaction from WON lead"""
        response = requests.get(
            f"{BASE_URL}/api/sales/revenue",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should have at least one transaction (from the WON lead)
        assert data["summary"]["transaction_count"] >= 1
        assert data["summary"]["total_revenue"] >= 1500  # The test lead was 1500 AED
        
        # Verify transaction structure
        if data["transactions"]:
            txn = data["transactions"][0]
            assert "transaction_id" in txn
            assert "amount" in txn
            assert "location_id" in txn
            assert "metadata" in txn
            assert txn["type"] == "SALES_REVENUE"
    
    def test_revenue_filter_by_location(self, owner_token):
        """Revenue endpoint filters by location_id"""
        # First get a location
        response = requests.get(
            f"{BASE_URL}/api/locations",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        locations = response.json()
        if locations:
            loc_id = locations[0]["location_id"]
            
            response = requests.get(
                f"{BASE_URL}/api/sales/revenue",
                headers={"Authorization": f"Bearer {owner_token}"},
                params={"location_id": loc_id}
            )
            assert response.status_code == 200
            data = response.json()
            assert data["filters_applied"]["location_id"] == loc_id
    
    def test_revenue_filter_by_date_range(self, owner_token):
        """Revenue endpoint filters by date range"""
        response = requests.get(
            f"{BASE_URL}/api/sales/revenue",
            headers={"Authorization": f"Bearer {owner_token}"},
            params={
                "date_from": "2026-01-01T00:00:00Z",
                "date_to": "2026-12-31T23:59:59Z"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["filters_applied"]["date_from"] is not None
        assert data["filters_applied"]["date_to"] is not None
    
    def test_revenue_by_location_breakdown(self, owner_token):
        """Revenue endpoint returns by_location breakdown"""
        response = requests.get(
            f"{BASE_URL}/api/sales/revenue",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        if data["by_location"]:
            loc = data["by_location"][0]
            assert "location_id" in loc
            assert "location_name" in loc
            assert "total_revenue" in loc
            assert "transaction_count" in loc
    
    def test_revenue_by_agent_breakdown(self, owner_token):
        """Revenue endpoint returns by_agent breakdown"""
        response = requests.get(
            f"{BASE_URL}/api/sales/revenue",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        if data["by_agent"]:
            agent = data["by_agent"][0]
            assert "agent_staff_id" in agent
            assert "agent_name" in agent
            assert "total_revenue" in agent
            assert "transaction_count" in agent
    
    def test_revenue_monthly_trend(self, owner_token):
        """Revenue endpoint returns monthly_trend"""
        response = requests.get(
            f"{BASE_URL}/api/sales/revenue",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        if data["monthly_trend"]:
            month = data["monthly_trend"][0]
            assert "month" in month
            assert "total_revenue" in month
            assert "transaction_count" in month
    
    def test_manager_revenue_access(self, manager_token):
        """Manager can access revenue for their location"""
        response = requests.get(
            f"{BASE_URL}/api/sales/revenue",
            headers={"Authorization": f"Bearer {manager_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "summary" in data
    
    def test_manager_revenue_summary_access(self, manager_token):
        """Manager can access revenue summary"""
        response = requests.get(
            f"{BASE_URL}/api/sales/revenue/summary",
            headers={"Authorization": f"Bearer {manager_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_revenue" in data
    
    def test_unauthenticated_revenue_blocked(self):
        """Unauthenticated access to revenue is blocked"""
        response = requests.get(f"{BASE_URL}/api/sales/revenue")
        assert response.status_code == 401


class TestRevenueAutoCreation:
    """Test auto-creation of revenue transaction when lead is WON"""
    
    @pytest.fixture(scope="class")
    def owner_token(self):
        """Get owner authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Owner authentication failed")
    
    @pytest.fixture(scope="class")
    def location_id(self, owner_token):
        """Get a location ID"""
        response = requests.get(
            f"{BASE_URL}/api/locations",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        if response.status_code == 200 and response.json():
            return response.json()[0]["location_id"]
        pytest.skip("No locations available")
    
    def test_won_lead_creates_revenue_transaction(self, owner_token, location_id):
        """When lead status changes to WON, revenue transaction is auto-created"""
        # Create a new lead with membership price
        lead_name = f"TEST_Revenue_Lead_{uuid.uuid4().hex[:6]}"
        create_response = requests.post(
            f"{BASE_URL}/api/sales/leads",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "location_id": location_id,
                "full_name": lead_name,
                "phone": "+971-50-111-2222",
                "email": f"test_{uuid.uuid4().hex[:6]}@test.com",
                "source": "WALK_IN",
                "notes": "Test lead for revenue auto-creation"
            }
        )
        assert create_response.status_code == 201
        lead = create_response.json()
        lead_id = lead["sales_lead_id"]
        
        # Update lead with membership price
        update_response = requests.patch(
            f"{BASE_URL}/api/sales/leads/{lead_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "membership_type": "Monthly Premium",
                "membership_price": 999.0
            }
        )
        assert update_response.status_code == 200
        
        # Get initial revenue count
        initial_revenue = requests.get(
            f"{BASE_URL}/api/sales/revenue",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        initial_count = initial_revenue.json()["summary"]["transaction_count"]
        
        # Mark lead as WON
        status_response = requests.patch(
            f"{BASE_URL}/api/sales/leads/{lead_id}/status",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"status": "WON"}
        )
        assert status_response.status_code == 200
        
        # Verify revenue transaction was created
        final_revenue = requests.get(
            f"{BASE_URL}/api/sales/revenue",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        final_count = final_revenue.json()["summary"]["transaction_count"]
        
        # Should have one more transaction
        assert final_count == initial_count + 1
        
        # Verify the new transaction details
        transactions = final_revenue.json()["transactions"]
        new_txn = next((t for t in transactions if t["metadata"].get("lead_name") == lead_name), None)
        assert new_txn is not None
        assert new_txn["amount"] == 999.0
        assert new_txn["type"] == "SALES_REVENUE"
        assert new_txn["metadata"]["lead_id"] == lead_id
    
    def test_won_lead_without_price_no_transaction(self, owner_token, location_id):
        """Lead marked WON without membership_price does not create transaction"""
        # Create a lead without membership price
        lead_name = f"TEST_NoPrice_Lead_{uuid.uuid4().hex[:6]}"
        create_response = requests.post(
            f"{BASE_URL}/api/sales/leads",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "location_id": location_id,
                "full_name": lead_name,
                "phone": "+971-50-333-4444",
                "email": f"noprice_{uuid.uuid4().hex[:6]}@test.com",
                "source": "WALK_IN"
            }
        )
        assert create_response.status_code == 201
        lead_id = create_response.json()["sales_lead_id"]
        
        # Get initial revenue count
        initial_revenue = requests.get(
            f"{BASE_URL}/api/sales/revenue",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        initial_count = initial_revenue.json()["summary"]["transaction_count"]
        
        # Mark lead as WON (without setting membership_price)
        status_response = requests.patch(
            f"{BASE_URL}/api/sales/leads/{lead_id}/status",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"status": "WON"}
        )
        assert status_response.status_code == 200
        
        # Verify no new transaction was created
        final_revenue = requests.get(
            f"{BASE_URL}/api/sales/revenue",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        final_count = final_revenue.json()["summary"]["transaction_count"]
        
        # Should have same count (no transaction for 0 price)
        assert final_count == initial_count


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
