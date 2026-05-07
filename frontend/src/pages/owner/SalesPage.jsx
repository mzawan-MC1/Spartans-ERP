import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI, locationAPI, salesAPI } from '@/lib/api';
import TopNav from '@/components/TopNav';
import SalesTeamsTab from './SalesTeamsTab';
import SalesLeadsTab from './SalesLeadsTab';
import SalesPerformanceTab from './SalesPerformanceTab';
import SalesRevenueTab from './SalesRevenueTab';
import SalesRoutingTab from './SalesRoutingTab';
import SalesKPIGrid from './SalesKPIGrid';
import { ArrowLeft, Users, Target, TrendingUp, UserPlus, Trophy, XCircle, BarChart3, DollarSign, SlidersHorizontal } from 'lucide-react';

export default function SalesPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [locations, setLocations] = useState([]);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('teams');
  const [stats, setStats] = useState(null);
  const [dash, setDash] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [u, l] = await Promise.all([authAPI.getMe(), locationAPI.list()]);
        setUser(u.data);
        setLocations(l.data);
      } catch { navigate('/login', { replace: true }); }
      finally { setLoading(false); }
    })();
  }, [navigate]);

  const fetchStats = useCallback(async () => {
    try {
      const params = currentLocation ? { location_id: currentLocation.location_id } : {};
      const [r, d] = await Promise.all([
        salesAPI.getDashboardStats(params),
        salesAPI.getCrmDashboard(params),
      ]);
      setStats(r.data);
      setDash(d.data);
    } catch {}
  }, [currentLocation]);

  useEffect(() => { if (user) fetchStats(); }, [user, fetchStats]);

  if (loading) return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div data-testid="sales-page" className="min-h-screen bg-[#09090b] flex flex-col">
      <TopNav user={user} locations={locations} currentLocation={currentLocation} onLocationSwitch={setCurrentLocation} />
      <main className="flex-1 px-6 sm:px-8 lg:px-12 py-8 max-w-[1440px] mx-auto w-full">
        <button data-testid="back-from-sales" onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-zinc-500 hover:text-white font-heading uppercase tracking-wider text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} /> Back to Dashboard
        </button>

        <h1 className="font-heading font-extrabold text-white text-4xl sm:text-5xl uppercase tracking-tight mb-2">
          Sales
        </h1>
        <p className="text-zinc-500 font-body text-base mb-8">
          {currentLocation ? currentLocation.name : 'All locations'} — Teams, agents & lead pipeline
        </p>

        {dash && (
          <div className="space-y-3 mb-8">
            <div className="flex items-center justify-between">
              <div className="text-zinc-500 text-xs font-heading uppercase tracking-wider">
                Scope: {(dash?.scope?.kind || 'STAFF').toUpperCase()}
              </div>
              {stats && (
                <div className="text-zinc-500 text-xs font-heading uppercase tracking-wider">
                  Teams: {stats.total_teams ?? 0} · CSRs: {stats.total_csrs ?? stats.total_agents ?? 0} · Team Leads: {stats.total_team_leads ?? 0}
                </div>
              )}
            </div>
            <SalesKPIGrid dash={dash} />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800 mb-6">
          {[
            { key: 'teams', label: 'Teams & Agents', icon: Users },
            { key: 'leads', label: 'Leads & Pipeline', icon: Target },
            { key: 'performance', label: 'Performance', icon: BarChart3 },
            { key: 'revenue', label: 'Revenue', icon: DollarSign },
            { key: 'routing', label: 'Inbound & Routing', icon: SlidersHorizontal },
          ].map(t => (
            <button key={t.key} data-testid={`sales-tab-${t.key}`} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-3 font-heading uppercase tracking-wider text-xs border-b-2 transition-all ${
                tab === t.key ? 'border-red-600 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}>
              <t.icon className="w-3.5 h-3.5" strokeWidth={1.5} /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'teams' && (
          <SalesTeamsTab
            currentLocation={currentLocation}
            locations={locations}
            onRefreshStats={fetchStats}
          />
        )}
        {tab === 'leads' && (
          <SalesLeadsTab
            currentLocation={currentLocation}
            locations={locations}
            onRefreshStats={fetchStats}
          />
        )}
        {tab === 'performance' && (
          <SalesPerformanceTab
            currentLocation={currentLocation}
            locations={locations}
            isManager={false}
          />
        )}
        {tab === 'revenue' && (
          <SalesRevenueTab
            currentLocation={currentLocation}
            locations={locations}
            isManager={false}
          />
        )}
        {tab === 'routing' && (
          <SalesRoutingTab
            currentLocation={currentLocation}
            locations={locations}
          />
        )}
      </main>
    </div>
  );
}
