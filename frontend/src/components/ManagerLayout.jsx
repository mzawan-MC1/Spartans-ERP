import { useState, useEffect, useCallback } from 'react';
import { useNavigate, NavLink, useLocation } from 'react-router-dom';
import { authAPI, locationAPI, rolesAPI, staffAPI } from '@/lib/api';
import { useFavicon } from '@/hooks/useFavicon';
import BackButton from '@/components/BackButton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LayoutDashboard, Layers, BookOpen, Users, Calendar, ClipboardCheck, LogOut, User, ChevronDown, MapPin, UserCog, DollarSign, UserPlus, Target, FileSignature, Settings, CreditCard } from 'lucide-react';

export default function ManagerLayout({ activePage, children }) {
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const [user, setUser] = useState(routeLocation.state?.user || null);
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [myPermissions, setMyPermissions] = useState(null);
  const [employeeId, setEmployeeId] = useState(null);
  const [isSalesUser, setIsSalesUser] = useState(false);
  const faviconUrl = useFavicon();

  // Define NAV_ITEMS inside the component or after imports so it's safely initialized
  const NAV_ITEMS = [
    { path: '/manager', label: 'Overview', icon: LayoutDashboard, end: true },
    { path: '/manager/profile', label: 'Profile', icon: User, requiredRoles: ['LOCATION_MANAGER', 'ADMIN', 'MANAGER', 'MANAGER_ASSISTANT', 'MANAGER_FULL', 'MANAGER_OPS', 'MANAGER_FRONTDESK', 'RECEPTIONIST', 'RECEPTIONIST_FULL', 'RECEPTIONIST_POS', 'STAFF', 'EXTERNAL'] },
    { path: '/manager/members', label: 'Members', icon: UserPlus, anyPermissions: ['manager.view_members', 'manager.manage_members', 'receptionist.view_members', 'receptionist.create_members', 'receptionist.edit_members_basic'] },
    { path: '/manager/payments', label: 'Payments', icon: CreditCard, anyPermissions: ['manager.manage_payments', 'receptionist.view_payments', 'receptionist.record_cash_payments'] },
    { path: '/manager/categories', label: 'Categories / Disciplines', icon: Layers, requiredRoles: ['LOCATION_MANAGER', 'MANAGER_FULL', 'MANAGER_OPS'], anyPermissions: ['manager.view_programs', 'manager.manage_programs'] },
    { path: '/manager/discipline-requests', label: 'Discipline Requests', icon: ClipboardCheck, requiredRoles: ['LOCATION_MANAGER', 'MANAGER_FULL', 'MANAGER_OPS'], anyPermissions: ['manager.approve_discipline_requests', 'manager.manage_programs', 'manager.manage_schedules'] },
    { path: '/manager/programs', label: 'Programs', icon: BookOpen, anyPermissions: ['manager.view_programs', 'manager.manage_programs', 'receptionist.view_programs'] },
    { path: '/manager/instructors', label: 'Instructors', icon: Users, anyPermissions: ['manager.view_instructors', 'manager.manage_instructors', 'receptionist.view_instructors'] },
    { path: '/manager/schedule', label: 'Schedule', icon: Calendar, anyPermissions: ['manager.view_schedules', 'manager.manage_schedules', 'receptionist.view_schedules'] },
    { path: '/manager/employee-attendance', label: 'Attendance', icon: ClipboardCheck, requiredRoles: ['LOCATION_MANAGER', 'MANAGER_FULL'], anyPermissions: ['manager.view_hr_location', 'manager.manage_hr_location', 'manager.view_staff', 'manager.manage_staff'] },
    { path: '/manager/agreements', label: 'Agreements', icon: FileSignature, anyPermissions: ['manager.manage_agreements', 'receptionist.view_agreements'] },
    { path: '/manager/staff', label: 'Staff', icon: UserCog, requiredRoles: ['LOCATION_MANAGER', 'MANAGER_FULL'], anyPermissions: ['manager.view_staff', 'manager.manage_staff'] },
    { path: '/manager/finance', label: 'Expenses', icon: DollarSign, requiredRoles: ['LOCATION_MANAGER', 'MANAGER_FULL'], anyPermissions: ['manager.view_finance_location', 'manager.manage_finance_location'] },
    { path: '/manager/sales', label: 'Sales', icon: Target, requiredRoles: ['LOCATION_MANAGER', 'MANAGER_FULL', 'MANAGER_OPS'], anyPermissions: ['manager.view_sales_location', 'manager.manage_sales_location'] },
    { path: '/manager/crm', label: 'CRM', icon: Target, requiredRoles: ['LOCATION_MANAGER', 'ADMIN', 'MANAGER', 'MANAGER_ASSISTANT', 'MANAGER_FULL', 'MANAGER_OPS', 'MANAGER_FRONTDESK', 'RECEPTIONIST', 'RECEPTIONIST_FULL', 'RECEPTIONIST_POS', 'STAFF', 'EXTERNAL', 'INSTRUCTOR'], requiresSales: true },
    { path: '/manager/settings', label: 'Location CMS', icon: Settings, requiredRoles: ['LOCATION_MANAGER', 'MANAGER_FULL', 'MANAGER_OPS'] },
  ];

  const loadData = useCallback(async () => {
    try {
      const [userRes, locsRes] = await Promise.all([
        user ? Promise.resolve({ data: user }) : authAPI.getMe(),
        locationAPI.list(),
      ]);
      const resolvedUser = user ? user : userRes.data;
      if (!user) setUser(resolvedUser);
      if (locsRes.data.length > 0) setLocation(locsRes.data[0]);

      try {
        const permsRes = await rolesAPI.getMyPermissions();
        setMyPermissions(permsRes.data?.permissions || []);
      } catch {
        setMyPermissions([]);
      }

      try {
        const staffRes = await staffAPI.me();
        const staff = staffRes.data?.staff;
        setEmployeeId(staff?.employee_code || staff?.staff_id || null);
        setIsSalesUser(!!staff?.is_sales);
      } catch {
        setEmployeeId(null);
        setIsSalesUser(false);
      }
    } catch {
      navigate('/login', { replace: true });
    } finally {
      setLoading(false);
    }
  }, [navigate, user]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleLogout = async () => {
    try { await authAPI.logout(); } catch {}
    localStorage.removeItem('auth_token');
    navigate('/login', { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen bg-background">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(900px_circle_at_15%_0%,rgba(99,102,241,0.18)_0%,transparent_55%),radial-gradient(900px_circle_at_95%_10%,rgba(239,68,68,0.12)_0%,transparent_55%)]" />
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        data-testid="manager-sidebar"
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-card/55 backdrop-blur-xl border-r border-border/70 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_20px_60px_rgba(0,0,0,0.45)] flex flex-col transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:static lg:z-auto`}
      >
        {/* Brand */}
        <div className="p-5 border-b border-border/70">
          <div className="flex items-center gap-2">
            <img src={faviconUrl} alt="Spartans Logo" className="w-8 h-8 object-contain rounded-md" onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; e.target.nextElementSibling.classList.remove('hidden'); }} />
            <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center hidden">
              <span className="font-heading font-extrabold text-white text-lg leading-none">S</span>
            </div>
            <span className="font-heading font-bold text-white uppercase tracking-wider text-sm">Spartans</span>
          </div>
          {location && (
            <div className="flex items-center gap-1.5 mt-3 text-muted-foreground">
              <MapPin className="w-3 h-3" strokeWidth={1.5} />
              <span className="text-xs font-body truncate">{location.name}</span>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS
            .filter(item => !item.requiredRoles || item.requiredRoles.includes(user?.role))
            .filter(item => !item.requiresSales || isSalesUser)
            .filter(item => {
              if (!item.anyPermissions || item.anyPermissions.length === 0) return true;
              if (!Array.isArray(myPermissions)) return false;
              return item.anyPermissions.some((p) => myPermissions.includes(p));
            })
            .map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              data-testid={`nav-${item.label.toLowerCase()}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-body transition-all duration-150 ${
                  isActive
                    ? 'bg-primary/12 text-primary ring-1 ring-primary/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                }`
              }
            >
              <item.icon className="w-4 h-4" strokeWidth={1.5} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-border/70">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 w-full text-left outline-none hover:bg-white/5 rounded-lg p-2 -m-2 transition-colors">
              <div className="w-7 h-7 rounded-full bg-white/5 ring-1 ring-border/70 flex items-center justify-center">
                <User className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white font-body truncate">{user?.name}</p>
                <p className="text-[10px] text-muted-foreground font-heading uppercase tracking-wider">{user?.role === 'OWNER' ? 'ADMIN' : user?.role === 'OWNER_FULL' ? 'ADMIN FULL ACCESS' : user?.role?.replace(/_/g, ' ')}</p>
                {employeeId ? <p className="text-[10px] text-muted-foreground/70 font-heading uppercase tracking-wider truncate">Employee ID: {employeeId}</p> : null}
              </div>
              <ChevronDown className="w-3 h-3 text-muted-foreground" strokeWidth={1.5} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-52 bg-popover/80 backdrop-blur-xl border-border/70">
              <DropdownMenuLabel className="text-xs text-muted-foreground">{user?.email}</DropdownMenuLabel>
              {employeeId ? <DropdownMenuLabel className="text-xs text-muted-foreground/80">Employee ID: {employeeId}</DropdownMenuLabel> : null}
              <DropdownMenuSeparator className="bg-border/70" />
              <DropdownMenuItem onClick={() => navigate('/manager/profile')} className="cursor-pointer">
                <User className="w-4 h-4 mr-2" strokeWidth={1.5} />
                Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border/70" />
              <DropdownMenuItem
                data-testid="manager-logout-btn"
                onClick={handleLogout}
                className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <LogOut className="w-4 h-4 mr-2" strokeWidth={1.5} />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main */}
      <main className="relative flex-1 min-h-screen overflow-auto">
        {/* Mobile top bar */}
        <div className="lg:hidden sticky top-0 z-30 bg-card/60 backdrop-blur-xl border-b border-border/70 h-14 flex items-center px-4 gap-3">
          {routeLocation.pathname !== '/manager' && (
            <BackButton fallback="/manager" label="Back" testId="manager-back-btn-mobile" className="text-xs" />
          )}
          <button
            data-testid="mobile-menu-btn"
            onClick={() => setSidebarOpen(true)}
            className="text-muted-foreground hover:text-foreground"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <img src={faviconUrl} alt="Spartans Logo" className="w-6 h-6 object-contain rounded-md" onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; e.target.nextElementSibling.classList.remove('hidden'); }} />
          <div className="w-6 h-6 bg-primary rounded-md flex items-center justify-center hidden">
            <span className="font-heading font-extrabold text-white text-xs">S</span>
          </div>
          <span className="font-heading font-bold text-white uppercase tracking-wider text-sm">Spartans</span>
        </div>
        {routeLocation.pathname !== '/manager' && (
          <div className="hidden lg:block px-6 pt-6">
            <BackButton fallback="/manager" label="Back" testId="manager-back-btn" />
          </div>
        )}
        {typeof children === 'function' ? children({ user, location }) : children}
      </main>
    </div>
  );
}
