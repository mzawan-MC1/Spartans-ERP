import { useState, useEffect, useCallback } from 'react';
import { useNavigate, NavLink, useLocation } from 'react-router-dom';
import { authAPI, customerAPI } from '@/lib/api';
import { resolveMediaUrl } from '@/lib/media';
import { useFavicon } from '@/hooks/useFavicon';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Home, BookOpen, Calendar, ClipboardList, Clock, User, LogOut, ChevronDown, MapPin } from 'lucide-react';

const NAV_ITEMS = [
  { path: '/customer', label: 'Home', icon: Home, end: true },
  { path: '/customer/programs', label: 'Programs', icon: BookOpen },
  { path: '/customer/schedule', label: 'Schedule', icon: Calendar },
  { path: '/customer/classes', label: 'My Classes', icon: ClipboardList },
  { path: '/customer/attendance', label: 'Attendance', icon: Clock },
  { path: '/customer/profile', label: 'Profile', icon: User },
];

export default function CustomerLayout({ children }) {
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const [user, setUser] = useState(routeLocation.state?.user || null);
  const [locations, setLocations] = useState([]);
  const [activeLocation, setActiveLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const faviconUrl = useFavicon();

  const loadData = useCallback(async () => {
    try {
      const [uRes, lRes] = await Promise.all([
        user ? Promise.resolve({ data: user }) : authAPI.getMe(),
        customerAPI.locations(),
      ]);
      const u = uRes.data;
      if (!user) setUser(u);
      setLocations(lRes.data);
      const activeLid = u.active_location_id || u.location_id;
      const loc = lRes.data.find(l => l.location_id === activeLid);
      setActiveLocation(loc || lRes.data[0] || null);
    } catch {
      navigate('/login', { replace: true });
    } finally { setLoading(false); }
  }, [navigate, user]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleLocationChange = async (loc) => {
    try {
      const res = await customerAPI.switchLocation({ location_id: loc.location_id });
      setUser(res.data);
      setActiveLocation(loc);
      window.location.reload();
    } catch {}
  };

  const handleLogout = async () => {
    try { await authAPI.logout(); } catch {}
    localStorage.removeItem('auth_token');
    navigate('/login', { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!activeLocation && !loading) {
    navigate('/customer/select-location', { replace: true, state: { user, locations } });
    return null;
  }

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col">
      {/* Top Nav */}
      <nav data-testid="customer-nav" className="sticky top-0 z-50 w-full border-b border-zinc-800 bg-black/80 backdrop-blur-xl">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Left: Brand + Location */}
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/customer')} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <img src={faviconUrl} alt="Spartans Logo" className="w-8 h-8 object-contain rounded-sm" onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; e.target.nextElementSibling.classList.remove('hidden'); }} />
              <div className="w-8 h-8 bg-red-600 rounded-sm flex items-center justify-center hidden">
                <span className="font-heading font-extrabold text-white text-lg leading-none">S</span>
              </div>
              <span className="font-heading font-bold text-white text-sm uppercase tracking-wider hidden sm:inline">Spartans</span>
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger data-testid="customer-location-selector"
                className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5 rounded-sm text-xs font-body transition-colors outline-none">
                <MapPin className="w-3 h-3" strokeWidth={1.5} />
                <span className="max-w-[120px] sm:max-w-[200px] truncate">{activeLocation?.name}</span>
                <ChevronDown className="w-3 h-3 opacity-50" strokeWidth={1.5} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64 bg-zinc-900 border-zinc-800">
                <DropdownMenuLabel className="text-zinc-500 font-heading uppercase tracking-wider text-xs">Change Gym</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-zinc-800" />
                {locations.map(loc => (
                  <DropdownMenuItem key={loc.location_id} onClick={() => handleLocationChange(loc)}
                    className={`cursor-pointer text-zinc-300 focus:bg-zinc-800 focus:text-white ${activeLocation?.location_id === loc.location_id ? 'text-red-400' : ''}`}>
                    <MapPin className="w-4 h-4 mr-2" strokeWidth={1.5} />
                    <span className="truncate">{loc.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Center: Nav Links (desktop) */}
          <div className="hidden lg:flex items-center gap-1">
            {NAV_ITEMS.map(item => (
              <NavLink key={item.path} to={item.path} end={item.end} data-testid={`customer-nav-${item.label.toLowerCase().replace(/\s/g, '-')}`}
                className={({ isActive }) => `flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-body transition-all ${isActive ? 'text-red-500 bg-red-600/10' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`}>
                <item.icon className="w-3.5 h-3.5" strokeWidth={1.5} />
                {item.label}
              </NavLink>
            ))}
          </div>

          {/* Right: User */}
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileNav(!mobileNav)} className="lg:hidden text-zinc-400 hover:text-white">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger data-testid="customer-user-menu"
                className="flex items-center gap-2 hover:bg-zinc-800/50 px-2 py-1.5 rounded-sm transition-colors outline-none">
                {user?.profile_image_url ? (
                  <img src={resolveMediaUrl(user.profile_image_url)} alt="" className="w-7 h-7 rounded-full object-cover" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center">
                    <User className="w-4 h-4 text-zinc-400" strokeWidth={1.5} />
                  </div>
                )}
                <span className="text-sm text-zinc-300 font-body hidden sm:inline">{user?.first_name || user?.name?.split(' ')[0]}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-zinc-900 border-zinc-800">
                <DropdownMenuLabel className="text-xs text-zinc-500">{user?.email}</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-zinc-800" />
                <DropdownMenuItem onClick={() => navigate('/customer/profile')} className="cursor-pointer text-zinc-300 focus:bg-zinc-800 focus:text-white">
                  <User className="w-4 h-4 mr-2" strokeWidth={1.5} /> Profile
                </DropdownMenuItem>
                <DropdownMenuItem data-testid="customer-logout-btn" onClick={handleLogout}
                  className="cursor-pointer text-red-400 focus:bg-red-600/10 focus:text-red-400">
                  <LogOut className="w-4 h-4 mr-2" strokeWidth={1.5} /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Mobile Nav */}
        {mobileNav && (
          <div className="lg:hidden border-t border-zinc-800 bg-zinc-950 px-4 py-3 space-y-1">
            {NAV_ITEMS.map(item => (
              <NavLink key={item.path} to={item.path} end={item.end} onClick={() => setMobileNav(false)}
                className={({ isActive }) => `flex items-center gap-2 px-3 py-2 rounded-sm text-sm font-body transition-all ${isActive ? 'text-red-500 bg-red-600/10' : 'text-zinc-400 hover:text-white'}`}>
                <item.icon className="w-4 h-4" strokeWidth={1.5} /> {item.label}
              </NavLink>
            ))}
          </div>
        )}
      </nav>

      {/* Content */}
      <main className="flex-1">
        {typeof children === 'function' ? children({ user, location: activeLocation, locations }) : children}
      </main>
    </div>
  );
}
