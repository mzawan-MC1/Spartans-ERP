import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { authAPI, rolesAPI, staffAPI, uploadAPI } from '@/lib/api';
import { resolveMediaUrl } from '@/lib/media';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogOut, User, ChevronDown, MapPin, Plus, LayoutDashboard } from 'lucide-react';

export default function TopNav({ user, locations = [], currentLocation, onLocationSwitch }) {
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  const [permissions, setPermissions] = useState(null);
  const [employeeId, setEmployeeId] = useState(null);
  const [profileImagePath, setProfileImagePath] = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef(null);
  const displayRole = useMemo(() => {
    const role = user?.role;
    if (role === 'OWNER') return 'ADMIN';
    if (role === 'OWNER_FULL') return 'ADMIN FULL ACCESS';
    return role ? role.replace(/_/g, ' ') : '';
  }, [user?.role]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user?.role || user.role === 'OWNER') {
        if (active) setPermissions(null);
        return;
      }
      if (user.role !== 'OWNER_FULL') {
        if (active) setPermissions(null);
        return;
      }
      try {
        const res = await rolesAPI.getMyPermissions();
        if (active) setPermissions(res.data?.permissions || []);
      } catch {
        if (active) setPermissions([]);
      }
    })();
    return () => { active = false; };
  }, [user?.role]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await staffAPI.me();
        if (!active) return;
        const staff = res.data?.staff;
        setEmployeeId(staff?.employee_code || staff?.staff_id || null);
        setProfileImagePath(staff?.profile_image_path || null);
      } catch {
        if (active) setEmployeeId(null);
        if (active) setProfileImagePath(null);
      }
    })();
    return () => { active = false; };
  }, [user?.role]);

  const avatarSrc = useMemo(() => {
    const raw = user?.picture || profileImagePath || '';
    if (!raw) return '';
    return resolveMediaUrl(raw) || '';
  }, [profileImagePath, user?.picture]);

  const uploadAvatar = async (file) => {
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const res = await uploadAPI.upload(file);
      const url = res.data?.url;
      if (!url) throw new Error('Upload failed');
      await staffAPI.updateMe({ profile_image_path: url });
      setProfileImagePath(url);
      toast.success('Profile photo updated');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to upload photo');
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await authAPI.logout();
    } catch {}
    localStorage.removeItem('auth_token');
    navigate('/login', { replace: true });
  };

  return (
    <nav
      data-testid="top-nav"
      className="sticky top-0 z-50 w-full border-b border-border/70 bg-card/45 backdrop-blur-xl h-16 flex items-center px-6 justify-between"
    >
      {/* Left */}
      <div className="flex items-center gap-6">
        {/* Location Switcher (Admin only) */}
        {(user?.role === 'OWNER' || user?.role === 'OWNER_FULL') && locations.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              data-testid="location-switcher-trigger"
              className="flex items-center gap-2 bg-white/5 border border-border/70 text-muted-foreground hover:text-foreground hover:bg-white/7 px-3 py-1.5 rounded-md text-sm font-body transition-colors outline-none"
            >
              <MapPin className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span className="max-w-[160px] truncate">
                {currentLocation ? currentLocation.name : 'All Locations'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 opacity-50" strokeWidth={1.5} />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-64 bg-popover/80 backdrop-blur-xl border-border/70"
            >
              <DropdownMenuLabel className="text-muted-foreground font-heading uppercase tracking-wider text-xs">
                Switch Location
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-border/70" />
              <DropdownMenuItem
                data-testid="location-switch-all"
                onClick={() => onLocationSwitch?.(null)}
                className="cursor-pointer"
              >
                <LayoutDashboard className="w-4 h-4 mr-2" strokeWidth={1.5} />
                All Locations
              </DropdownMenuItem>
              {locations.map((loc) => (
                <DropdownMenuItem
                  key={loc.location_id}
                  data-testid={`location-switch-${loc.location_id}`}
                  onClick={() => onLocationSwitch?.(loc)}
                  className="cursor-pointer"
                >
                  <MapPin className="w-4 h-4 mr-2" strokeWidth={1.5} />
                  <span className="truncate">{loc.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => uploadAvatar(e.target.files?.[0] || null)}
        />
        {(user?.role === 'OWNER' || (user?.role === 'OWNER_FULL' && Array.isArray(permissions) && permissions.includes('owner.manage_locations'))) && (
          <button
            data-testid="nav-create-location-btn"
            onClick={() => navigate('/locations/new')}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-heading font-bold uppercase tracking-wider px-4 py-1.5 rounded-md text-sm transition-all duration-200 active:scale-95 flex items-center gap-2 shadow-sm shadow-black/30"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} />
            <span className="hidden sm:inline">New Location</span>
          </button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            data-testid="user-menu-trigger"
            className="flex items-center gap-2 hover:bg-white/5 px-3 py-1.5 rounded-md transition-colors outline-none"
          >
            {avatarSrc ? (
              <img 
                src={avatarSrc} 
                alt="" 
                className="w-7 h-7 rounded-full object-cover" 
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-white/5 ring-1 ring-border/70 flex items-center justify-center">
                <User className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
              </div>
            )}
            <span className="text-sm text-muted-foreground font-body hidden sm:inline">{user?.name}</span>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.5} />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 bg-popover/80 backdrop-blur-xl border-border/70"
          >
            <DropdownMenuLabel className="font-body">
              <div className="text-sm text-white">{user?.name}</div>
              <div className="text-xs text-muted-foreground">{user?.email}</div>
              {employeeId ? <div className="text-xs text-muted-foreground/80 mt-1">Employee ID: {employeeId}</div> : null}
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-border/70" />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                if (!uploadingAvatar) fileInputRef.current?.click();
              }}
              disabled={uploadingAvatar}
              className="cursor-pointer"
            >
              {uploadingAvatar ? 'Uploading photo…' : 'Upload photo'}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border/70" />
            <DropdownMenuItem
              data-testid="user-menu-role"
              disabled
              className="text-xs text-muted-foreground uppercase tracking-wider font-heading"
            >
              {displayRole}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border/70" />
            <DropdownMenuItem onClick={() => navigate('/dashboard/profile')} className="cursor-pointer">
              <User className="w-4 h-4 mr-2" strokeWidth={1.5} />
              Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border/70" />
            <DropdownMenuItem
              data-testid="logout-btn"
              onClick={handleLogout}
              disabled={loggingOut}
              className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              <LogOut className="w-4 h-4 mr-2" strokeWidth={1.5} />
              {loggingOut ? 'Signing out...' : 'Sign Out'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
