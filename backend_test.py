#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime, date, timedelta

class HRBackendTester:
    def __init__(self, base_url="http://localhost:8001"):
        self.base_url = base_url
        self.manager_token = None
        self.owner_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, method, endpoint, expected_status, actual_status, success, details=""):
        """Log test results"""
        result = {
            "test_name": name,
            "method": method,
            "endpoint": endpoint,
            "expected_status": expected_status,
            "actual_status": actual_status,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - Status: {actual_status}")
        else:
            print(f"❌ {name} - Expected {expected_status}, got {actual_status}")
            if details:
                print(f"   Details: {details}")

    def run_test(self, name, method, endpoint, expected_status, data=None, token=None, params=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if token:
            headers['Authorization'] = f'Bearer {token}'
        
        print(f"\n🔍 Testing {name}...")
        print(f"   {method} {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PATCH':
                response = requests.patch(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)

            success = response.status_code == expected_status
            details = ""
            response_data = {}
            
            try:
                response_data = response.json()
                if not success:
                    details = str(response_data.get('detail', response_data))
            except:
                if not success:
                    details = response.text[:200]

            self.log_test(name, method, endpoint, expected_status, response.status_code, success, details)
            return success, response_data

        except Exception as e:
            error_msg = str(e)
            self.log_test(name, method, endpoint, expected_status, 0, False, error_msg)
            print(f"❌ {name} - Error: {error_msg}")
            return False, {}

    def login_manager(self):
        """Login as manager"""
        print("\n🔐 Logging in as Manager...")
        success, response = self.run_test(
            "Manager Login",
            "POST",
            "auth/login",
            200,
            data={"email": "manager.sharjah1@spartans.ae", "password": "Manager2024!"}
        )
        if success and 'token' in response:
            self.manager_token = response['token']
            print(f"Manager token obtained: {self.manager_token[:20]}...")
            return True
        return False

    def login_owner(self):
        """Login as owner"""
        print("\n🔐 Logging in as Owner...")
        success, response = self.run_test(
            "Owner Login",
            "POST", 
            "auth/login",
            200,
            data={"email": "owner@spartans.com", "password": "Spartans2024!"}
        )
        if success and 'token' in response:
            self.owner_token = response['token']
            print(f"Owner token obtained: {self.owner_token[:20]}...")
            return True
        return False

    def test_staff_endpoints(self):
        """Test staff CRUD operations"""
        print("\n=== TESTING STAFF ENDPOINTS ===")
        
        # List staff
        success, staff_list = self.run_test(
            "List Staff",
            "GET",
            "staff",
            200,
            token=self.manager_token
        )
        
        if not success:
            return False

        # Verify we have 4 seeded staff members
        staff_count = len(staff_list) if isinstance(staff_list, list) else 0
        print(f"Found {staff_count} staff members")
        
        # Create new staff member
        new_staff_data = {
            "first_name": "Test",
            "last_name": "Employee",
            "email": "test.employee@spartans.ae",
            "phone": "+971-50-123-4567",
            "role": "INSTRUCTOR",
            "employment_type": "FULL_TIME",
            "join_date": date.today().isoformat(),
            "notes": "Test staff member",
            "pay_structure": {
                "type": "FIXED_SALARY",
                "base_amount": 5000,
                "currency": "AED"
            }
        }
        
        success, created_staff = self.run_test(
            "Create Staff",
            "POST",
            "staff",
            201,
            data=new_staff_data,
            token=self.manager_token
        )
        
        if success and 'staff_id' in created_staff:
            staff_id = created_staff['staff_id']
            print(f"Created staff with ID: {staff_id}")
            
            # Update staff
            update_data = {
                "phone": "+971-50-999-8888",
                "notes": "Updated test staff member"
            }
            
            self.run_test(
                "Update Staff",
                "PATCH",
                f"staff/{staff_id}",
                200,
                data=update_data,
                token=self.manager_token
            )
            
            # Deactivate staff
            self.run_test(
                "Deactivate Staff",
                "PATCH",
                f"staff/{staff_id}/deactivate",
                200,
                token=self.manager_token
            )
            
        return True

    def test_payroll_endpoints(self):
        """Test payroll management"""
        print("\n=== TESTING PAYROLL ENDPOINTS ===")
        
        # Get staff list first for creating payroll
        success, staff_list = self.run_test(
            "List Staff for Payroll",
            "GET",
            "staff",
            200,
            token=self.manager_token
        )
        
        if not success or not staff_list:
            print("❌ Cannot test payroll without staff")
            return False
            
        # List existing payroll records
        success, payroll_list = self.run_test(
            "List Payroll Records",
            "GET",
            "payroll",
            200,
            token=self.manager_token
        )
        
        # Create payroll record
        if staff_list and len(staff_list) > 0:
            staff_member = staff_list[0]
            
            # Get current month dates
            today = date.today()
            period_start = date(today.year, today.month, 1).isoformat()
            import calendar
            last_day = calendar.monthrange(today.year, today.month)[1]
            period_end = date(today.year, today.month, last_day).isoformat()
            
            payroll_data = {
                "staff_id": staff_member['staff_id'],
                "period_start": period_start,
                "period_end": period_end,
                "base_pay": staff_member.get('pay_structure', {}).get('base_amount', 4000),
                "variable_pay": 0,
                "bonuses": 500,
                "deductions": 100,
                "notes": "Test payroll record"
            }
            
            success, created_payroll = self.run_test(
                "Create Payroll Record",
                "POST",
                "payroll",
                201,
                data=payroll_data,
                token=self.manager_token
            )
            
            if success and 'payroll_id' in created_payroll:
                payroll_id = created_payroll['payroll_id']
                
                # Update payroll status to APPROVED
                self.run_test(
                    "Approve Payroll",
                    "PATCH",
                    f"payroll/{payroll_id}/status",
                    200,
                    data={"status": "APPROVED"},
                    token=self.manager_token
                )
                
                # Update payroll status to PAID
                self.run_test(
                    "Mark Payroll as Paid",
                    "PATCH",
                    f"payroll/{payroll_id}/status",
                    200,
                    data={"status": "PAID", "payment_date": today.isoformat()},
                    token=self.manager_token
                )
        
        return True

    def test_expense_endpoints(self):
        """Test expense management with soft delete"""
        print("\n=== TESTING EXPENSE ENDPOINTS ===")
        
        # List expenses
        success, expense_list = self.run_test(
            "List Expenses",
            "GET",
            "expenses",
            200,
            token=self.manager_token
        )
        
        # Create expense
        expense_data = {
            "date": date.today().isoformat(),
            "category": "EQUIPMENT",
            "amount": 1500,
            "currency": "AED",
            "description": "Test gym equipment purchase",
            "notes": "Test expense record"
        }
        
        success, created_expense = self.run_test(
            "Create Expense",
            "POST",
            "expenses",
            201,
            data=expense_data,
            token=self.manager_token
        )
        
        if success and 'expense_id' in created_expense:
            expense_id = created_expense['expense_id']
            
            # Update expense
            update_data = {
                "amount": 1750,
                "description": "Updated test equipment purchase"
            }
            
            self.run_test(
                "Update Expense",
                "PATCH",
                f"expenses/{expense_id}",
                200,
                data=update_data,
                token=self.manager_token
            )
            
            # Soft delete expense
            self.run_test(
                "Delete Expense (Soft Delete)",
                "DELETE",
                f"expenses/{expense_id}",
                200,
                token=self.manager_token
            )
            
            # Try to get deleted expense (should return 404)
            self.run_test(
                "Get Deleted Expense",
                "GET",
                f"expenses/{expense_id}",
                404,
                token=self.manager_token
            )
        
        return True

    def test_finance_reporting(self):
        """Test financial reporting endpoints"""
        print("\n=== TESTING FINANCE REPORTING ===")
        
        # Calculate 3 months ago period
        today = date.today()
        three_months_ago = today - timedelta(days=90)
        period_start = three_months_ago.isoformat()
        period_end = today.isoformat()
        
        # Manager location summary
        self.run_test(
            "Manager Location Finance Summary",
            "GET",
            "finance/location-summary",
            200,
            params={"period_start": period_start, "period_end": period_end},
            token=self.manager_token
        )
        
        # Payroll by staff breakdown
        self.run_test(
            "Payroll by Staff",
            "GET",
            "finance/payroll-by-staff",
            200,
            params={"period_start": period_start, "period_end": period_end},
            token=self.manager_token
        )
        
        return True

    def test_owner_endpoints(self):
        """Test owner-specific endpoints"""
        print("\n=== TESTING OWNER ENDPOINTS ===")
        
        if not self.owner_token:
            print("❌ No owner token available")
            return False
            
        # Calculate period
        today = date.today()
        three_months_ago = today - timedelta(days=90)
        period_start = three_months_ago.isoformat()
        period_end = today.isoformat()
        
        # Owner finance summary (cross-location)
        self.run_test(
            "Owner Finance Summary",
            "GET",
            "finance/owner-summary",
            200,
            params={"period_start": period_start, "period_end": period_end},
            token=self.owner_token
        )
        
        # Owner HR overview
        self.run_test(
            "Owner HR Overview",
            "GET",
            "hr/owner-overview",
            200,
            token=self.owner_token
        )
        
        return True

    def print_summary(self):
        """Print test summary"""
        print(f"\n{'='*60}")
        print(f"📊 TEST SUMMARY")
        print(f"{'='*60}")
        print(f"Tests Run: {self.tests_run}")
        print(f"Tests Passed: {self.tests_passed}")
        print(f"Tests Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%" if self.tests_run > 0 else "0%")
        
        failed_tests = [t for t in self.test_results if not t['success']]
        if failed_tests:
            print(f"\n❌ FAILED TESTS:")
            for test in failed_tests:
                print(f"  - {test['test_name']}: {test['details']}")
        
        return self.tests_passed == self.tests_run

def main():
    print("🏋️ Starting HR Module Backend Testing...")
    print("=" * 60)
    
    tester = HRBackendTester()
    
    # Login as both users
    if not tester.login_manager():
        print("❌ Manager login failed, cannot continue with manager tests")
        return 1
        
    if not tester.login_owner():
        print("❌ Owner login failed, cannot continue with owner tests")
        # Don't return here, continue with manager tests
    
    # Run all tests
    try:
        tester.test_staff_endpoints()
        tester.test_payroll_endpoints() 
        tester.test_expense_endpoints()
        tester.test_finance_reporting()
        
        if tester.owner_token:
            tester.test_owner_endpoints()
        
        # Print results
        all_passed = tester.print_summary()
        
        # Save detailed results
        results_file = "/app/test_results_backend_hr.json"
        with open(results_file, 'w') as f:
            json.dump({
                "summary": {
                    "tests_run": tester.tests_run,
                    "tests_passed": tester.tests_passed,
                    "success_rate": (tester.tests_passed/tester.tests_run*100) if tester.tests_run > 0 else 0
                },
                "test_results": tester.test_results,
                "timestamp": datetime.now().isoformat()
            }, f, indent=2)
        
        print(f"\n📄 Detailed results saved to: {results_file}")
        
        return 0 if all_passed else 1
        
    except Exception as e:
        print(f"\n💥 Test execution failed: {str(e)}")
        return 1

if __name__ == "__main__":
    sys.exit(main())