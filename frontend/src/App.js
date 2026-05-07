import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import SEOHead from '@/components/SEOHead';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import LocationFormPage from '@/pages/LocationFormPage';
import LocationDetailPage from '@/pages/owner/LocationDetailPage';
import UserManagementPage from '@/pages/owner/UserManagementPage';
import UnauthorizedPage from '@/pages/UnauthorizedPage';
import AuthCallback from '@/components/AuthCallback';
import ProtectedRoute from '@/components/ProtectedRoute';
import ManagerDashboard from '@/pages/manager/ManagerDashboard';
import CategoriesPage from '@/pages/manager/CategoriesPage';
import DisciplineRequestsPage from '@/pages/manager/DisciplineRequestsPage';
import ProgramsPage from '@/pages/manager/ProgramsPage';
import InstructorsPage from '@/pages/manager/InstructorsPage';
import LocationSettingsPage from '@/pages/manager/LocationSettingsPage';
import SchedulePage from '@/pages/manager/SchedulePage';
import AttendancePage from '@/pages/manager/AttendancePage';
import StaffPage from '@/pages/manager/StaffPage';
import FinancePage from '@/pages/manager/FinancePage';
import MembersPage from '@/pages/manager/MembersPage';
import AddMemberPage from '@/pages/manager/AddMemberPage';
import MemberViewPage from '@/pages/manager/MemberViewPage';
import PaymentsPage from '@/pages/manager/PaymentsPage';
import MemberImportPage from '@/pages/manager/MemberImportPage';
import ManagerSalesPage from '@/pages/manager/ManagerSalesPage';
import SalesCRMPage from '@/pages/manager/SalesCRMPage';
import AgreementsPage from '@/pages/manager/AgreementsPage';
import CustomerHome from '@/pages/customer/CustomerHome';
import CustomerPrograms from '@/pages/customer/CustomerPrograms';
import CustomerSchedule from '@/pages/customer/CustomerSchedule';
import CustomerClasses from '@/pages/customer/CustomerClasses';
import CustomerAttendance from '@/pages/customer/CustomerAttendance';
import CustomerProfile from '@/pages/customer/CustomerProfile';
import LocationSelect from '@/pages/customer/LocationSelect';
import OwnerFinancePage from '@/pages/owner/OwnerFinancePage';
import CMSPage from '@/pages/owner/CMSPage';
import AnalyticsPage from '@/pages/owner/AnalyticsPage';
import SalesPage from '@/pages/owner/SalesPage';
import OwnerMembersPage from '@/pages/owner/OwnerMembersPage';
import OwnerPaymentsPage from '@/pages/owner/OwnerPaymentsPage';
import OwnerMemberViewPage from '@/pages/owner/OwnerMemberViewPage';
import OwnerAddMemberPage from '@/pages/owner/OwnerAddMemberPage';
import OwnerMemberImportPage from '@/pages/owner/OwnerMemberImportPage';
import OwnerLocationFinancePage from '@/pages/owner/OwnerLocationFinancePage';
import OwnerHRPage from '@/pages/owner/OwnerHRPage';
import EmployeeAttendancePage from '@/pages/manager/EmployeeAttendancePage';
import PublicJoinPage from '@/pages/public/PublicJoinPage';
import MemberPortal from '@/pages/member/MemberPortal';
import CoachPortal from '@/pages/coach/CoachPortal';
import OwnerEmployeeProfilePage from '@/pages/owner/OwnerEmployeeProfilePage';
import ManagerEmployeeProfilePage from '@/pages/manager/ManagerEmployeeProfilePage';
import CoachEmployeeProfilePage from '@/pages/coach/CoachEmployeeProfilePage';
import StaffMasterProfilePage from '@/pages/manager/StaffMasterProfilePage';
import OwnerStaffMasterProfilePage from '@/pages/owner/OwnerStaffMasterProfilePage';
// Public pages
import LandingPage from '@/pages/public/LandingPage';
import BranchesPage from '@/pages/public/BranchesPage';
import DisciplinesPage from '@/pages/public/DisciplinesPage';
import PricingPage from '@/pages/public/PricingPage';
import ContactPage from '@/pages/public/ContactPage';
import FAQsPage from '@/pages/public/FAQsPage';
import StaticPage from '@/pages/public/StaticPage';
import BlogListPage from '@/pages/public/BlogListPage';
import BlogDetailPage from '@/pages/public/BlogDetailPage';
import LocationPage from '@/pages/public/LocationPage';
import SEOSettingsPage from '@/pages/owner/SEOSettingsPage';
import EmailSettingsPage from '@/pages/owner/EmailSettingsPage';
import PaymentGatewaysPage from '@/pages/owner/PaymentGatewaysPage';
import AdminPortalLayout from '@/components/AdminPortalLayout';

import { HelmetProvider } from 'react-helmet-async';
import { TooltipProvider } from '@/components/ui/tooltip';

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

function AppRouter() {
  const location = useLocation();

  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }

  return (
    <Routes>
      {/* Public Routes (no auth required) */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/branches" element={<BranchesPage />} />
      <Route path="/disciplines" element={<DisciplinesPage />} />
      <Route path="/disciplines/:slug" element={<DisciplinesPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/faqs" element={<FAQsPage />} />
      <Route path="/page/:slug" element={<StaticPage />} />
      <Route path="/join" element={<PublicJoinPage />} />
      <Route path="/blog" element={<BlogListPage />} />
      <Route path="/blog/:slug" element={<BlogDetailPage />} />
      
      {/* 
        This is the public location page route.
        Notice that it uses :slug, so URLs look like /locations/spartans-sharjah-maliha 
      */}
      <Route path="/locations/:slug" element={<LocationPage />} />
      
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      {/* Admin */}
      <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['OWNER', 'OWNER_FULL']}><AdminPortalLayout><DashboardPage /></AdminPortalLayout></ProtectedRoute>} />
      <Route path="/dashboard/profile" element={<ProtectedRoute allowedRoles={['OWNER', 'OWNER_FULL']}><AdminPortalLayout><OwnerEmployeeProfilePage /></AdminPortalLayout></ProtectedRoute>} />
      <Route path="/hr/employees/:staffId" element={<ProtectedRoute allowedRoles={['OWNER', 'OWNER_FULL']}><AdminPortalLayout><OwnerStaffMasterProfilePage /></AdminPortalLayout></ProtectedRoute>} />
      <Route path="/locations/new" element={<ProtectedRoute allowedRoles={['OWNER', 'OWNER_FULL']} requiredPermissions={['owner.manage_locations']}><AdminPortalLayout><LocationFormPage /></AdminPortalLayout></ProtectedRoute>} />
      <Route path="/locations/:locationId/edit" element={<ProtectedRoute allowedRoles={['OWNER', 'OWNER_FULL']} requiredPermissions={['owner.manage_locations']}><AdminPortalLayout><LocationFormPage /></AdminPortalLayout></ProtectedRoute>} />
      
      {/* 
        This is the Admin's Location Details view.
        We change the path slightly to avoid conflicting with the public /locations/:slug route.
      */}
      <Route path="/owner/locations/:locationId" element={<ProtectedRoute allowedRoles={['OWNER', 'OWNER_FULL']} requiredPermissions={['owner.manage_locations']}><AdminPortalLayout><LocationDetailPage /></AdminPortalLayout></ProtectedRoute>} />
      <Route path="/owner/members" element={<ProtectedRoute allowedRoles={['OWNER', 'OWNER_FULL']} requiredPermissions={['owner.manage_members']}><AdminPortalLayout><OwnerMembersPage /></AdminPortalLayout></ProtectedRoute>} />
      <Route path="/owner/members/new" element={<ProtectedRoute allowedRoles={['OWNER', 'OWNER_FULL']} requiredPermissions={['owner.manage_members']}><AdminPortalLayout><OwnerAddMemberPage /></AdminPortalLayout></ProtectedRoute>} />
      <Route path="/owner/members/import" element={<ProtectedRoute allowedRoles={['OWNER', 'OWNER_FULL']} requiredPermissions={['owner.manage_members']}><AdminPortalLayout><OwnerMemberImportPage /></AdminPortalLayout></ProtectedRoute>} />
      <Route path="/owner/members/:memberId" element={<ProtectedRoute allowedRoles={['OWNER', 'OWNER_FULL']} requiredPermissions={['owner.manage_members']}><AdminPortalLayout><OwnerMemberViewPage /></AdminPortalLayout></ProtectedRoute>} />
      <Route path="/owner/members/:memberId/edit" element={<ProtectedRoute allowedRoles={['OWNER', 'OWNER_FULL']} requiredPermissions={['owner.manage_members']}><AdminPortalLayout><OwnerAddMemberPage /></AdminPortalLayout></ProtectedRoute>} />
      <Route path="/owner/payments" element={<ProtectedRoute allowedRoles={['OWNER', 'OWNER_FULL']} requiredPermissions={['owner.manage_members']}><AdminPortalLayout><OwnerPaymentsPage /></AdminPortalLayout></ProtectedRoute>} />
      <Route path="/finance" element={<ProtectedRoute allowedRoles={['OWNER', 'OWNER_FULL']} requiredPermissions={['owner.view_finance_all']}><AdminPortalLayout><OwnerFinancePage initialTab="finance" lockedTab="finance" /></AdminPortalLayout></ProtectedRoute>} />
      <Route path="/finance/location/:locationId" element={<ProtectedRoute allowedRoles={['OWNER', 'OWNER_FULL']} requiredPermissions={['owner.view_finance_all']}><AdminPortalLayout><OwnerLocationFinancePage /></AdminPortalLayout></ProtectedRoute>} />
      <Route path="/hr" element={<ProtectedRoute allowedRoles={['OWNER', 'OWNER_FULL']} requiredPermissions={['owner.view_hr_all', 'owner.manage_hr_all']}><AdminPortalLayout><OwnerHRPage /></AdminPortalLayout></ProtectedRoute>} />
      <Route path="/hr-finance" element={<ProtectedRoute allowedRoles={['OWNER', 'OWNER_FULL']} requiredPermissions={['owner.view_finance_all', 'owner.manage_finance_all', 'owner.view_hr_all', 'owner.manage_hr_all']}><AdminPortalLayout><OwnerFinancePage /></AdminPortalLayout></ProtectedRoute>} />
      <Route path="/cms" element={<ProtectedRoute allowedRoles={['OWNER', 'OWNER_FULL']} requiredPermissions={['owner.manage_public_site']}><AdminPortalLayout><CMSPage /></AdminPortalLayout></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute allowedRoles={['OWNER', 'OWNER_FULL']} requiredPermissions={['owner.view_all_locations_reports']}><AdminPortalLayout><AnalyticsPage /></AdminPortalLayout></ProtectedRoute>} />
      <Route path="/sales" element={<ProtectedRoute allowedRoles={['OWNER', 'OWNER_FULL']} requiredPermissions={['owner.view_sales_all', 'owner.manage_sales_all']}><AdminPortalLayout><SalesPage /></AdminPortalLayout></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute allowedRoles={['OWNER', 'OWNER_FULL']} requiredPermissions={['owner.manage_users', 'owner.manage_roles']}><AdminPortalLayout><UserManagementPage /></AdminPortalLayout></ProtectedRoute>} />
      <Route path="/seo" element={<ProtectedRoute allowedRoles={['OWNER', 'OWNER_FULL']} requiredPermissions={['owner.manage_public_site']}><AdminPortalLayout><SEOSettingsPage /></AdminPortalLayout></ProtectedRoute>} />
      <Route path="/email-settings" element={<ProtectedRoute allowedRoles={['OWNER', 'OWNER_FULL']} requiredPermissions={['owner.manage_public_site']}><AdminPortalLayout><EmailSettingsPage /></AdminPortalLayout></ProtectedRoute>} />
      <Route path="/payment-gateways" element={<ProtectedRoute allowedRoles={['OWNER', 'OWNER_FULL']} requiredPermissions={['owner.manage_payment_gateways']}><AdminPortalLayout><PaymentGatewaysPage /></AdminPortalLayout></ProtectedRoute>} />
      {/* Manager / Receptionist / Instructor */}
      <Route path="/manager" element={<ProtectedRoute allowedRoles={['LOCATION_MANAGER', 'ADMIN', 'MANAGER', 'MANAGER_ASSISTANT', 'MANAGER_FULL', 'MANAGER_OPS', 'MANAGER_FRONTDESK', 'RECEPTIONIST', 'RECEPTIONIST_FULL', 'RECEPTIONIST_POS', 'STAFF', 'EXTERNAL', 'INSTRUCTOR']}><ManagerDashboard /></ProtectedRoute>} />
      <Route path="/manager/profile" element={<ProtectedRoute allowedRoles={['LOCATION_MANAGER', 'ADMIN', 'MANAGER', 'MANAGER_ASSISTANT', 'MANAGER_FULL', 'MANAGER_OPS', 'MANAGER_FRONTDESK', 'RECEPTIONIST', 'RECEPTIONIST_FULL', 'RECEPTIONIST_POS', 'STAFF', 'EXTERNAL']}><ManagerEmployeeProfilePage /></ProtectedRoute>} />
      <Route path="/manager/staff/:staffId" element={<ProtectedRoute allowedRoles={['LOCATION_MANAGER', 'MANAGER_FULL']}><StaffMasterProfilePage /></ProtectedRoute>} />
      <Route path="/manager/categories" element={<ProtectedRoute allowedRoles={['LOCATION_MANAGER', 'MANAGER_FULL', 'MANAGER_OPS']}><CategoriesPage /></ProtectedRoute>} />
      <Route path="/manager/discipline-requests" element={<ProtectedRoute allowedRoles={['LOCATION_MANAGER', 'MANAGER_FULL', 'MANAGER_OPS']} requiredPermissions={['manager.approve_discipline_requests']}><DisciplineRequestsPage /></ProtectedRoute>} />
      <Route path="/manager/programs" element={<ProtectedRoute allowedRoles={['LOCATION_MANAGER', 'MANAGER_FULL', 'MANAGER_OPS', 'MANAGER_FRONTDESK', 'RECEPTIONIST', 'RECEPTIONIST_FULL']}><ProgramsPage /></ProtectedRoute>} />
      <Route path="/manager/instructors" element={<ProtectedRoute allowedRoles={['LOCATION_MANAGER', 'MANAGER_FULL', 'MANAGER_OPS', 'MANAGER_FRONTDESK', 'RECEPTIONIST', 'RECEPTIONIST_FULL']}><InstructorsPage /></ProtectedRoute>} />
      <Route path="/manager/schedule" element={<ProtectedRoute allowedRoles={['LOCATION_MANAGER', 'MANAGER_FULL', 'MANAGER_OPS', 'MANAGER_FRONTDESK', 'RECEPTIONIST', 'RECEPTIONIST_FULL', 'INSTRUCTOR']}><SchedulePage /></ProtectedRoute>} />
      <Route path="/manager/attendance" element={<ProtectedRoute allowedRoles={['LOCATION_MANAGER', 'MANAGER_FULL', 'MANAGER_OPS', 'MANAGER_FRONTDESK', 'RECEPTIONIST', 'RECEPTIONIST_FULL', 'INSTRUCTOR']}><AttendancePage /></ProtectedRoute>} />
      <Route path="/manager/employee-attendance" element={<ProtectedRoute allowedRoles={['LOCATION_MANAGER', 'MANAGER_FULL']}><EmployeeAttendancePage /></ProtectedRoute>} />
      <Route path="/manager/staff" element={<ProtectedRoute allowedRoles={['LOCATION_MANAGER', 'MANAGER_FULL']}><StaffPage /></ProtectedRoute>} />
      <Route path="/manager/finance" element={<ProtectedRoute allowedRoles={['LOCATION_MANAGER', 'MANAGER_FULL']}><FinancePage /></ProtectedRoute>} />
      <Route path="/manager/members" element={<ProtectedRoute allowedRoles={['LOCATION_MANAGER', 'MANAGER_FULL', 'MANAGER_OPS', 'MANAGER_FRONTDESK', 'RECEPTIONIST', 'RECEPTIONIST_FULL']}><MembersPage /></ProtectedRoute>} />
      <Route path="/manager/members/new" element={<ProtectedRoute allowedRoles={['LOCATION_MANAGER', 'MANAGER_FULL', 'MANAGER_OPS', 'MANAGER_FRONTDESK', 'RECEPTIONIST', 'RECEPTIONIST_FULL']}><AddMemberPage /></ProtectedRoute>} />
      <Route path="/manager/members/import" element={<ProtectedRoute allowedRoles={['LOCATION_MANAGER', 'MANAGER_FULL', 'MANAGER_OPS']}><MemberImportPage /></ProtectedRoute>} />
      <Route path="/manager/members/:memberId" element={<ProtectedRoute allowedRoles={['LOCATION_MANAGER', 'MANAGER_FULL', 'MANAGER_OPS', 'MANAGER_FRONTDESK', 'RECEPTIONIST', 'RECEPTIONIST_FULL']}><MemberViewPage /></ProtectedRoute>} />
      <Route path="/manager/members/:memberId/edit" element={<ProtectedRoute allowedRoles={['LOCATION_MANAGER', 'MANAGER_FULL', 'MANAGER_OPS', 'MANAGER_FRONTDESK', 'RECEPTIONIST', 'RECEPTIONIST_FULL']}><AddMemberPage isEdit={true} /></ProtectedRoute>} />
      
      <Route path="/manager/payments" element={<ProtectedRoute allowedRoles={['LOCATION_MANAGER', 'MANAGER_FULL', 'MANAGER_OPS', 'MANAGER_FRONTDESK', 'RECEPTIONIST', 'RECEPTIONIST_FULL']}><PaymentsPage /></ProtectedRoute>} />

      <Route path="/manager/sales" element={<ProtectedRoute allowedRoles={['LOCATION_MANAGER', 'MANAGER_FULL', 'MANAGER_OPS']} requiredPermissions={['manager.view_sales_location', 'manager.manage_sales_location']}><ManagerSalesPage /></ProtectedRoute>} />
      <Route path="/manager/crm" element={<ProtectedRoute allowedRoles={['LOCATION_MANAGER', 'ADMIN', 'MANAGER', 'MANAGER_ASSISTANT', 'MANAGER_FULL', 'MANAGER_OPS', 'MANAGER_FRONTDESK', 'RECEPTIONIST', 'RECEPTIONIST_FULL', 'RECEPTIONIST_POS', 'STAFF', 'EXTERNAL', 'INSTRUCTOR']}><SalesCRMPage /></ProtectedRoute>} />
      <Route path="/manager/agreements" element={<ProtectedRoute allowedRoles={['LOCATION_MANAGER', 'MANAGER_FULL', 'MANAGER_OPS', 'MANAGER_FRONTDESK']}><AgreementsPage /></ProtectedRoute>} />
      <Route path="/manager/settings" element={<ProtectedRoute allowedRoles={['LOCATION_MANAGER', 'MANAGER_FULL', 'MANAGER_OPS']}><LocationSettingsPage /></ProtectedRoute>} />
      {/* Customer */}
      <Route path="/customer" element={<ProtectedRoute allowedRoles={['CUSTOMER']}><CustomerHome /></ProtectedRoute>} />
      <Route path="/customer/programs" element={<ProtectedRoute allowedRoles={['CUSTOMER']}><CustomerPrograms /></ProtectedRoute>} />
      <Route path="/customer/schedule" element={<ProtectedRoute allowedRoles={['CUSTOMER']}><CustomerSchedule /></ProtectedRoute>} />
      <Route path="/customer/classes" element={<ProtectedRoute allowedRoles={['CUSTOMER']}><CustomerClasses /></ProtectedRoute>} />
      <Route path="/customer/attendance" element={<ProtectedRoute allowedRoles={['CUSTOMER']}><CustomerAttendance /></ProtectedRoute>} />
      <Route path="/customer/profile" element={<ProtectedRoute allowedRoles={['CUSTOMER']}><CustomerProfile /></ProtectedRoute>} />
      <Route path="/customer/select-location" element={<ProtectedRoute allowedRoles={['CUSTOMER']}><LocationSelect /></ProtectedRoute>} />
      {/* Member Portal */}
      <Route path="/member" element={<ProtectedRoute allowedRoles={['MEMBER']}><MemberPortal /></ProtectedRoute>} />
      <Route path="/member/*" element={<ProtectedRoute allowedRoles={['MEMBER']}><MemberPortal /></ProtectedRoute>} />
      {/* Coach Portal */}
      <Route path="/coach" element={<ProtectedRoute allowedRoles={['INSTRUCTOR']}><CoachPortal /></ProtectedRoute>} />
      <Route path="/coach/profile" element={<ProtectedRoute allowedRoles={['INSTRUCTOR']}><CoachEmployeeProfilePage /></ProtectedRoute>} />
      <Route path="/coach/*" element={<ProtectedRoute allowedRoles={['INSTRUCTOR']}><CoachPortal /></ProtectedRoute>} />
      {/* Fallback - authenticated users go to role-based dashboard */}
      <Route path="*" element={<LandingPage />} />
    </Routes>
  );
}

function RoleRedirect() {
  return null; // ProtectedRoute handles the redirect
}

function DirectionHandler() {
  const { i18n } = useTranslation();
  useEffect(() => {
    const lang = i18n.language || 'en';
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [i18n.language]);
  return null;
}

function App() {
  return (
    <HelmetProvider>
      <TooltipProvider>
        <BrowserRouter>
          <ScrollToTop />
          <DirectionHandler />
          {/* SEOHead handles dynamic meta tags */}
          <SEOHead />
          <AppRouter />
          <Toaster
            theme="dark"
            position="top-right"
            toastOptions={{
              className: 'font-body',
              style: {
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                color: 'hsl(var(--foreground))',
              },
            }}
          />
        </BrowserRouter>
      </TooltipProvider>
    </HelmetProvider>
  );
}

export default App;
