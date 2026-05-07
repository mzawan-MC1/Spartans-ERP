import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { locationAPI, dashboardAPI, authAPI, rolesAPI } from '@/lib/api';
import TopNav from '@/components/TopNav';
import LocationCard from '@/components/LocationCard';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { MapPin, Users, Building2, Activity, Plus, Loader2, DollarSign, Globe, UserCog, Filter, RotateCcw, Trash2, BarChart3, Target, Search, Mail, CreditCard } from 'lucide-react';

export default function DashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(location.state?.user || null);
  const [permissions, setPermissions] = useState(null);
  const [locations, setLocations] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, location: null });
  const [restoreDialog, setRestoreDialog] = useState({ open: false, location: null });
  const [deleting, setDeleting] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [allLocations, setAllLocations] = useState([]);

  const can = useCallback((perm) => {
    if (user?.role === 'OWNER') return true;
    if (user?.role !== 'OWNER_FULL') return false;
    if (!Array.isArray(permissions)) return false;
    return permissions.includes(perm);
  }, [permissions, user?.role]);

  const fetchData = useCallback(async () => {
    try {
      const shouldFetchAll = can('owner.manage_locations');
      const shouldFetchStats = can('owner.view_dashboard');

      const [locRes, allLocRes, statsRes] = await Promise.all([
        locationAPI.list(),
        shouldFetchAll ? locationAPI.listAll().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        shouldFetchStats ? dashboardAPI.getStats().catch(() => ({ data: null })) : Promise.resolve({ data: null }),
      ]);
      setLocations(locRes.data);
      setAllLocations(allLocRes.data || []);
      if (statsRes.data) setStats(statsRes.data);
    } catch (err) {
      if (err.response?.status === 401) {
        navigate('/login', { replace: true });
      }
    } finally {
      setLoading(false);
    }
  }, [can, navigate]);

  useEffect(() => {
    const loadUser = async () => {
      if (!user) {
        try {
          const res = await authAPI.getMe();
          setUser(res.data);
        } catch {
          navigate('/login', { replace: true });
          return;
        }
      }
      if (user?.role === 'OWNER_FULL' && permissions == null) return;
      fetchData();
    };
    loadUser();
  }, [user, permissions, fetchData, navigate]);

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

  const handleLocationSwitch = (loc) => {
    setCurrentLocation(loc);
  };

  const handleDelete = async () => {
    if (!deleteDialog.location) return;
    setDeleting(true);
    try {
      await locationAPI.delete(deleteDialog.location.location_id);
      toast.success('Location deleted');
      setDeleteDialog({ open: false, location: null });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreDialog.location) return;
    setDeleting(true);
    try {
      await locationAPI.restore(restoreDialog.location.location_id);
      toast.success('Location restored');
      setRestoreDialog({ open: false, location: null });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Restore failed');
    } finally {
      setDeleting(false);
    }
  };

  // Get deleted locations
  const deletedLocations = allLocations.filter(l => l.is_deleted);

  const filteredLocations = currentLocation
    ? locations.filter((l) => l.location_id === currentLocation.location_id)
    : showDeleted ? deletedLocations : locations;

  const canAny = (perms) => perms.some((p) => can(p));

  const statCards = stats
    ? [
        { label: 'Total Locations', value: stats.total_locations, icon: Building2, color: 'text-red-500' },
        { label: 'Active', value: stats.active_locations, icon: Activity, color: 'text-emerald-400' },
        { label: 'Managers', value: stats.total_managers, icon: Users, color: 'text-zinc-300' },
        { label: 'Customers', value: stats.total_customers, icon: Users, color: 'text-zinc-400' },
      ]
    : [];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div data-testid="owner-dashboard" className="min-h-screen bg-[#09090b] flex flex-col">
      <TopNav
        user={user}
        locations={locations}
        currentLocation={currentLocation}
        onLocationSwitch={handleLocationSwitch}
      />

      <main className="flex-1 px-6 sm:px-8 lg:px-12 py-8 max-w-[1440px] mx-auto w-full">
        {/* Header */}
        <div className="mb-10">
          <h1 className="font-heading font-extrabold text-white text-4xl sm:text-5xl uppercase tracking-tight">
            {currentLocation ? currentLocation.name : 'Dashboard'}
          </h1>
          <p className="text-zinc-500 font-body mt-2 text-base">
            {currentLocation
              ? `Managing ${currentLocation.city} branch`
              : `Welcome back, ${user?.name || 'Admin'}`}
          </p>
        </div>

        {/* Stats Row */}
        {stats && !currentLocation && (
          <div
            data-testid="stats-grid"
            className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10"
          >
            {statCards.map((stat, i) => (
              <div
                key={stat.label}
                data-testid={`stat-card-${stat.label.toLowerCase().replace(/\s/g, '-')}`}
                className="bg-zinc-900/50 border border-zinc-800 p-5 flex flex-col justify-between hover:bg-zinc-900 transition-colors rounded-sm opacity-0 animate-fade-in-up"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-zinc-500 text-xs font-heading uppercase tracking-wider">
                    {stat.label}
                  </span>
                  <stat.icon className={`w-4 h-4 ${stat.color}`} strokeWidth={1.5} />
                </div>
                <p className={`font-heading font-extrabold text-3xl ${stat.color}`}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Locations Section */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h2 className="font-heading font-bold text-white text-lg uppercase tracking-wider">
              {currentLocation ? 'Location Details' : showDeleted ? 'Deleted Locations' : 'Your Locations'}
            </h2>
            {!currentLocation && user?.role === 'OWNER' && deletedLocations.length > 0 && (
              <button
                data-testid="toggle-deleted-locations"
                onClick={() => setShowDeleted(!showDeleted)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-heading uppercase tracking-wider transition-colors ${
                  showDeleted 
                    ? 'bg-red-600/20 text-red-400 border border-red-500/30' 
                    : 'bg-zinc-800/50 text-zinc-500 hover:text-white border border-zinc-700'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {showDeleted ? 'Show Active' : `Deleted (${deletedLocations.length})`}
              </button>
            )}
          </div>
        </div>

        {filteredLocations.length === 0 ? (
          <div
            data-testid="empty-locations"
            className="border border-dashed border-zinc-800 rounded-sm p-16 flex flex-col items-center justify-center"
          >
            <MapPin className="w-12 h-12 text-zinc-700 mb-4" strokeWidth={1} />
            <p className="text-zinc-500 font-heading uppercase tracking-wider text-sm mb-4">
              {showDeleted ? 'No deleted locations' : 'No locations yet'}
            </p>
          </div>
        ) : showDeleted ? (
          /* Deleted locations view */
          <div
            data-testid="deleted-locations-grid"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {filteredLocations.map((loc, i) => (
              <div
                key={loc.location_id}
                data-testid={`deleted-location-${loc.location_id}`}
                className="bg-zinc-900/50 border border-red-800/30 rounded-sm p-5 opacity-75"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-heading font-bold text-zinc-400 text-base uppercase tracking-wide line-through">
                      {loc.name}
                    </h3>
                    <p className="text-zinc-600 text-sm flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3" /> {loc.city}
                    </p>
                  </div>
                  <span className="px-2 py-1 bg-red-500/20 text-red-400 text-[10px] font-heading uppercase rounded-sm">
                    Deleted
                  </span>
                </div>
                <button
                  data-testid={`restore-location-${loc.location_id}`}
                  onClick={() => setRestoreDialog({ open: true, location: loc })}
                  className="w-full mt-3 flex items-center justify-center gap-2 bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30 font-heading uppercase tracking-wide px-3 py-2 rounded-sm text-xs transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restore
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div
            data-testid="locations-grid"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {filteredLocations.map((loc, i) => (
              <LocationCard
                key={loc.location_id}
                location={loc}
                index={i}
                onDelete={(loc) => setDeleteDialog({ open: true, location: loc })}
              />
            ))}
          </div>
        )}
      </main>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, location: null })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">
              Delete Location
            </DialogTitle>
            <DialogDescription className="text-zinc-400 font-body">
              Are you sure you want to delete <strong className="text-white">{deleteDialog.location?.name}</strong>? This action will deactivate the location.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button
              data-testid="cancel-delete-btn"
              onClick={() => setDeleteDialog({ open: false, location: null })}
              className="bg-transparent border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm transition-all"
            >
              Cancel
            </button>
            <button
              data-testid="confirm-delete-btn"
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Confirmation Dialog */}
      <Dialog open={restoreDialog.open} onOpenChange={(open) => !open && setRestoreDialog({ open: false, location: null })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">
              Restore Location
            </DialogTitle>
            <DialogDescription className="text-zinc-400 font-body">
              Restore <strong className="text-white">{restoreDialog.location?.name}</strong> to make it active again?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button
              data-testid="cancel-restore-btn"
              onClick={() => setRestoreDialog({ open: false, location: null })}
              className="bg-transparent border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm transition-all"
            >
              Cancel
            </button>
            <button
              data-testid="confirm-restore-btn"
              onClick={handleRestore}
              disabled={deleting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
              Restore
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
