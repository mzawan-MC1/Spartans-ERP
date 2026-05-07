import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation, useSearchParams } from 'react-router-dom';
import { BarChart3, DollarSign, Globe, Mail, Shield, ShoppingCart, Users, UserCog, Wrench, ChevronDown, ChevronRight, ClipboardCheck, LayoutDashboard, LineChart, KeyRound, CreditCard, User } from 'lucide-react';
import { useFavicon } from '@/hooks/useFavicon';
import { authAPI, rolesAPI } from '@/lib/api';

function NavItem({ to, icon: Icon, label, end = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-body transition-colors ${
        isActive ? 'bg-primary/12 text-primary ring-1 ring-primary/20' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
      }`}
    >
      <Icon className="w-4 h-4" strokeWidth={1.5} />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

function HrSubItem({ to, label, active }) {
  return (
    <Link
      to={to}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-sm text-xs font-heading uppercase tracking-wider transition-colors ${
        active ? 'bg-primary/12 text-primary ring-1 ring-primary/20' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
      }`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export default function AdminPortalLayout({ children }) {
  const routeLocation = useLocation();
  const [searchParams] = useSearchParams();
  const faviconUrl = useFavicon();

  const hrTab = searchParams.get('tab') || 'employees';
  const hrLocationId = searchParams.get('location_id') || 'all';
  const isHr = routeLocation.pathname === '/hr';

  const [hrOpen, setHrOpen] = useState(isHr);
  const [user, setUser] = useState(null);
  const [myPermissions, setMyPermissions] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const me = await authAPI.getMe();
        if (!mounted) return;
        setUser(me.data);
        if (me.data?.role === 'OWNER') {
          setMyPermissions([]);
          return;
        }
        const permsRes = await rolesAPI.getMyPermissions();
        if (!mounted) return;
        setMyPermissions(permsRes.data?.permissions || []);
      } catch {
        if (mounted) setMyPermissions([]);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const hasAnyPermission = useCallback((anyOf) => {
    if (!anyOf || anyOf.length === 0) return true;
    if (user?.role === 'OWNER') return true;
    if (!Array.isArray(myPermissions)) return false;
    return anyOf.some((p) => myPermissions.includes(p));
  }, [myPermissions, user?.role]);

  const hasAnyFromAllGroups = useCallback((groups) => {
    if (!groups || groups.length === 0) return true;
    return groups.every((g) => hasAnyPermission(g));
  }, [hasAnyPermission]);

  const hrLinks = useMemo(() => ([
    { tab: 'employees', label: 'Employees', icon: Users, permissionGroups: [['owner.view_hr_all', 'owner.manage_hr_all']] },
    { tab: 'payroll', label: 'Payroll', icon: DollarSign, permissionGroups: [['owner.view_hr_all', 'owner.manage_hr_all'], ['owner.view_finance_all', 'owner.manage_finance_all']] },
    { tab: 'attendance', label: 'Employee Attendance', icon: ClipboardCheck, permissionGroups: [['owner.view_hr_all', 'owner.manage_hr_all']] },
    { tab: 'performance', label: 'Performance', icon: BarChart3, permissionGroups: [['owner.view_hr_all', 'owner.manage_hr_all']] },
  ]), []);

  const showMembers = hasAnyPermission(['owner.manage_members']);
  const showPayments = hasAnyPermission(['owner.view_finance_all', 'owner.manage_finance_all', 'owner.manage_members']);
  const showUsers = hasAnyPermission(['owner.manage_users', 'owner.manage_roles']);
  const showHr = hasAnyPermission(['owner.view_hr_all', 'owner.manage_hr_all']);
  const showAnalytics = hasAnyPermission(['owner.view_all_locations_reports']);
  const showSales = hasAnyPermission(['owner.view_sales_all', 'owner.manage_sales_all']);
  const showFinance = hasAnyPermission(['owner.view_finance_all', 'owner.manage_finance_all']);
  const showPublicSite = hasAnyPermission(['owner.manage_public_site']);
  const showGateways = hasAnyPermission(['owner.manage_payment_gateways']);

  return (
    <div className="relative min-h-screen bg-background">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(900px_circle_at_20%_0%,rgba(99,102,241,0.18)_0%,transparent_55%),radial-gradient(900px_circle_at_90%_10%,rgba(239,68,68,0.14)_0%,transparent_55%)]" />
      <aside className="hidden lg:block fixed top-0 left-0 z-50 w-64 h-screen bg-card/55 backdrop-blur-xl border-r border-border/70 shadow-[0_0_0_1px_hsl(var(--border)/0.35),0_20px_60px_rgba(0,0,0,0.45)]">
        <div className="p-4">
          <Link to="/dashboard" className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-white/5 transition-colors">
            <img src={faviconUrl} alt="Spartans Logo" className="w-9 h-9 object-contain rounded-md" />
            <div className="min-w-0">
              <div className="font-heading font-extrabold text-white text-base uppercase tracking-wider leading-none">Spartans</div>
              <div className="text-[10px] text-muted-foreground font-heading uppercase tracking-wider mt-1">Admin Portal</div>
            </div>
          </Link>
          <div className="border-t border-border/70 my-4" />
          <nav className="space-y-1.5">
            <NavItem to="/dashboard" icon={LayoutDashboard} label="Dashboard" end />
            <NavItem to="/dashboard/profile" icon={User} label="Profile" />
            {showMembers && <NavItem to="/owner/members" icon={Users} label="Members" />}
            {showPayments && <NavItem to="/owner/payments" icon={CreditCard} label="Payments" />}
            {showUsers && <NavItem to="/users" icon={UserCog} label="Users" />}

            {showHr && (
              <button
                type="button"
                onClick={() => setHrOpen((v) => !v)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-body transition-colors ${
                  isHr ? 'bg-primary/12 text-primary ring-1 ring-primary/20' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                }`}
              >
                <Shield className="w-4 h-4" strokeWidth={1.5} />
                <span className="flex-1 text-left">HR</span>
                {hrOpen ? <ChevronDown className="w-4 h-4 opacity-70" /> : <ChevronRight className="w-4 h-4 opacity-70" />}
              </button>
            )}

            {showHr && hrOpen && (
              <div className="pl-4 space-y-1">
                {hrLinks
                  .filter((l) => hasAnyFromAllGroups(l.permissionGroups))
                  .map((l) => (
                    <HrSubItem
                      key={l.tab}
                      to={`/hr?location_id=${encodeURIComponent(hrLocationId)}&tab=${encodeURIComponent(l.tab)}`}
                      label={l.label}
                      active={isHr && hrTab === l.tab}
                    />
                  ))}
              </div>
            )}

            {showAnalytics && <NavItem to="/analytics" icon={LineChart} label="Analytics" />}
            {showSales && <NavItem to="/sales" icon={ShoppingCart} label="Sales" />}
            {showFinance && <NavItem to="/finance" icon={DollarSign} label="Finance" />}
            {showPublicSite && <NavItem to="/cms" icon={Globe} label="Public Site" />}
            {showPublicSite && <NavItem to="/seo" icon={KeyRound} label="SEO" />}
            {showGateways && <NavItem to="/payment-gateways" icon={Wrench} label="Gateways" />}
            {showPublicSite && <NavItem to="/email-settings" icon={Mail} label="Email" />}
          </nav>
        </div>
      </aside>

      <div className="relative z-10 lg:pl-64">
        {children}
      </div>
    </div>
  );
}
