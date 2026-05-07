import ManagerLayout from '@/components/ManagerLayout';
import SalesTeamsTab from '@/pages/owner/SalesTeamsTab';
import SalesLeadsTab from '@/pages/owner/SalesLeadsTab';
import SalesPerformanceTab from '@/pages/owner/SalesPerformanceTab';
import SalesRevenueTab from '@/pages/owner/SalesRevenueTab';
import SalesKPIGrid from '@/pages/owner/SalesKPIGrid';
import { useState, useCallback, useEffect } from 'react';
import { salesAPI, staffAPI } from '@/lib/api';
import { Users, Target, BarChart3, DollarSign } from 'lucide-react';

export default function ManagerSalesPage() {
  return (
    <ManagerLayout activePage="sales">
      {({ user, location }) => <SalesContent user={user} location={location} />}
    </ManagerLayout>
  );
}

function SalesContent({ user, location }) {
  const [tab, setTab] = useState('teams');
  const [stats, setStats] = useState(null);
  const [dash, setDash] = useState(null);
  const [myStaffId, setMyStaffId] = useState(null);

  const fetchStats = useCallback(async () => {
    if (!location) return;
    try {
      const r = await salesAPI.getDashboardStats({ location_id: location.location_id });
      setStats(r.data);
    } catch {}
  }, [location]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => {
    if (!location) return;
    salesAPI.getCrmDashboard({ location_id: location.location_id }).then(r => setDash(r.data)).catch(() => setDash(null));
  }, [location]);
  useEffect(() => {
    staffAPI.me().then(r => setMyStaffId(r.data?.staff?.staff_id || null)).catch(() => setMyStaffId(null));
  }, []);

  const loc = location ? { location_id: location.location_id, name: location.name } : null;

  return (
    <div data-testid="manager-sales" className="p-6 sm:p-8 lg:p-10 max-w-[1200px]">
      <div className="mb-8">
        <h1 className="font-heading font-extrabold text-white text-4xl sm:text-5xl uppercase tracking-tight">Sales</h1>
        <p className="text-zinc-500 font-body mt-2 text-base">{location?.name} — Teams & lead pipeline</p>
      </div>

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
        ].map(t => (
          <button key={t.key} data-testid={`mgr-sales-tab-${t.key}`} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-3 font-heading uppercase tracking-wider text-xs border-b-2 transition-all ${
              tab === t.key ? 'border-red-600 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}>
            <t.icon className="w-3.5 h-3.5" strokeWidth={1.5} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'teams' && (
        <SalesTeamsTab
          currentLocation={loc}
          locations={location ? [location] : []}
          onRefreshStats={fetchStats}
        />
      )}
      {tab === 'leads' && (
        <SalesLeadsTab
          currentLocation={loc}
          locations={location ? [location] : []}
          onRefreshStats={fetchStats}
          currentStaffId={myStaffId}
          actorKind={dash?.scope?.kind || null}
          canManage={dash?.scope?.can_manage ?? true}
        />
      )}
      {tab === 'performance' && (
        <SalesPerformanceTab
          currentLocation={loc}
          locations={location ? [location] : []}
          isManager={true}
        />
      )}
      {tab === 'revenue' && (
        <SalesRevenueTab
          currentLocation={loc}
          locations={location ? [location] : []}
          isManager={true}
        />
      )}
    </div>
  );
}
