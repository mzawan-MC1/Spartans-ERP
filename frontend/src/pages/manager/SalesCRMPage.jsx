import ManagerLayout from '@/components/ManagerLayout';
import SalesLeadsTab from '@/pages/owner/SalesLeadsTab';
import SalesKPIGrid from '@/pages/owner/SalesKPIGrid';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { salesAPI, staffAPI } from '@/lib/api';

export default function SalesCRMPage() {
  return (
    <ManagerLayout activePage="sales">
      {({ location }) => <CRMContent location={location} />}
    </ManagerLayout>
  );
}

function CRMContent({ location }) {
  const [myStaffId, setMyStaffId] = useState(null);
  const [mySalesRole, setMySalesRole] = useState(null);
  const [leadView, setLeadView] = useState('all');
  const [dash, setDash] = useState(null);
  const [perf, setPerf] = useState(null);
  const [inbox, setInbox] = useState(null);

  useEffect(() => {
    staffAPI.me().then(r => {
      setMyStaffId(r.data?.staff?.staff_id || null);
      setMySalesRole(r.data?.staff?.sales_role || null);
    }).catch(() => {
      setMyStaffId(null);
      setMySalesRole(null);
    });
  }, []);
  useEffect(() => {
    const params = location ? { location_id: location.location_id } : {};
    salesAPI.getCrmDashboard(params).then(r => setDash(r.data)).catch(() => setDash(null));
  }, [location]);
  useEffect(() => {
    const params = location ? { location_id: location.location_id } : {};
    salesAPI.getPerformance(params).then(r => setPerf(r.data)).catch(() => setPerf(null));
  }, [location]);
  useEffect(() => {
    const params = location ? { location_id: location.location_id, limit: 50 } : { limit: 50 };
    salesAPI.getFollowUpInbox(params).then(r => setInbox(r.data)).catch(() => setInbox(null));
  }, [location]);

  const kind = useMemo(() => (dash?.scope?.kind || '').toUpperCase(), [dash]);
  const canManage = useMemo(() => !!dash?.scope?.can_manage, [dash]);

  useEffect(() => {
    if (kind === 'CSR') setLeadView('direct');
    else if (kind === 'TEAM_LEAD') setLeadView('all');
    else setLeadView('all');
  }, [kind]);

  const loc = location ? { location_id: location.location_id, name: location.name } : null;

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-[1200px]">
      <div className="mb-8">
        <h1 className="font-heading font-extrabold text-white text-4xl sm:text-5xl uppercase tracking-tight">CRM</h1>
        <p className="text-zinc-500 font-body mt-2 text-base">{location?.name} — Leads, follow-ups, conversions</p>
      </div>

      {dash && (
        <div className="space-y-3 mb-8">
          <div className="flex items-center justify-between">
            <div className="text-zinc-500 text-xs font-heading uppercase tracking-wider">
              Scope: {(dash?.scope?.kind || 'STAFF').toUpperCase()}
            </div>
            {dash?.scope?.combined_mode && (
              <div className="text-zinc-500 text-xs font-heading uppercase tracking-wider">
                Direct: {(dash?.cards?.direct?.total_leads ?? 0)} · Team: {(dash?.cards?.team?.total_leads ?? 0)} · Branch: {(dash?.cards?.branch?.total_leads ?? 0)}
              </div>
            )}
          </div>
          <SalesKPIGrid dash={dash} variant="compact" />
        </div>
      )}

      {(inbox?.rows?.length || 0) > 0 && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-4 mb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="text-white text-sm font-heading uppercase tracking-wider">Follow-up Inbox</div>
            <div className="text-zinc-500 text-xs font-heading uppercase tracking-wider">
              Showing {inbox.rows.length}
            </div>
          </div>
          <div className="space-y-2">
            {inbox.rows.slice(0, 12).map(l => (
              <div key={l.sales_lead_id} className="border border-zinc-800 bg-zinc-950/50 rounded-sm p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-zinc-200 text-sm truncate">{l.full_name || '—'}</div>
                    <div className="text-zinc-500 text-xs truncate">
                      {l.location_name || '—'} · Due: {l.next_follow_up_date || '—'} · Overdue: {l.follow_up_state?.overdue_days || 0}d
                    </div>
                    {(l.follow_up_state?.escalated_to_kind || l.follow_up_state?.escalated_to_name) && (
                      <div className="text-zinc-500 text-xs">
                        Escalated: {l.follow_up_state?.escalated_to_kind || '—'} {l.follow_up_state?.escalated_to_name ? `(${l.follow_up_state.escalated_to_name})` : ''}
                      </div>
                    )}
                  </div>
                  <div className="text-[10px] font-heading uppercase tracking-wider px-2 py-1 rounded-sm bg-red-600 text-white">
                    {l.follow_up_state?.escalation_level >= 2 ? 'MANAGER' : l.follow_up_state?.escalation_level >= 1 ? 'TL' : 'OVERDUE'}
                  </div>
                </div>
              </div>
            ))}
            {(inbox.rows.length || 0) > 12 && (
              <div className="text-zinc-500 text-xs">Showing first 12 of {inbox.rows.length}.</div>
            )}
          </div>
        </div>
      )}

      {kind === 'TEAM_LEAD' && (
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setLeadView('all')}
            className={`px-3 py-2 rounded-sm text-xs font-heading uppercase tracking-wider border ${
              leadView === 'all' ? 'bg-zinc-800 border-zinc-700 text-white' : 'bg-transparent border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            All Visible
          </button>
          <button
            onClick={() => setLeadView('direct')}
            className={`px-3 py-2 rounded-sm text-xs font-heading uppercase tracking-wider border ${
              leadView === 'direct' ? 'bg-zinc-800 border-zinc-700 text-white' : 'bg-transparent border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            My Direct Leads
          </button>
          <button
            onClick={() => setLeadView('team')}
            className={`px-3 py-2 rounded-sm text-xs font-heading uppercase tracking-wider border ${
              leadView === 'team' ? 'bg-zinc-800 border-zinc-700 text-white' : 'bg-transparent border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            My Team Pipeline
          </button>
        </div>
      )}

      {(dash?.breakdowns?.by_source?.length || 0) > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-3">
            <div className="text-zinc-300 text-xs font-heading uppercase tracking-wider mb-2">Leads by Source</div>
            <div className="space-y-1">
              {(dash.breakdowns.by_source || []).slice(0, 8).map(r => (
                <div key={r.source} className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="truncate">{r.source}</span>
                  <span className="text-zinc-200">{r.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-3">
            <div className="text-zinc-300 text-xs font-heading uppercase tracking-wider mb-2">Leads by Program</div>
            <div className="space-y-1">
              {(dash.breakdowns.by_program_interest || []).slice(0, 8).map(r => (
                <div key={`${r.program_interest}-${r.count}`} className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="truncate">{r.program_interest || 'UNKNOWN'}</span>
                  <span className="text-zinc-200">{r.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-3">
            <div className="text-zinc-300 text-xs font-heading uppercase tracking-wider mb-2">Leads by Plan</div>
            <div className="space-y-1">
              {(dash.breakdowns.by_membership_plan || []).slice(0, 8).map(r => (
                <div key={`${r.membership_plan}-${r.count}`} className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="truncate">{r.membership_plan || 'UNKNOWN'}</span>
                  <span className="text-zinc-200">{r.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {kind === 'TEAM_LEAD' && perf?.team_lead_stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-3">
            <div className="text-zinc-300 text-xs font-heading uppercase tracking-wider mb-2">My Team Leads</div>
            <div className="space-y-1">
              {(perf.team_lead_stats || []).slice(0, 10).map(r => (
                <div key={r.team_lead_staff_id || 'none'} className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="truncate">{r.team_lead_name || r.team_lead_staff_id || 'Unassigned'}</span>
                  <span className="text-zinc-200">{r.converted_leads}/{r.total_leads}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-3">
            <div className="text-zinc-300 text-xs font-heading uppercase tracking-wider mb-2">My CSRs</div>
            <div className="space-y-1">
              {(perf.agent_stats || []).slice(0, 10).map(r => (
                <div key={r.agent_staff_id || 'none'} className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="truncate">{r.agent ? `${r.agent.first_name} ${r.agent.last_name}` : (r.agent_staff_id || 'Unassigned')}</span>
                  <span className="text-zinc-200">{r.converted_leads ?? r.memberships_sold_count}/{r.total_leads}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {kind !== 'CSR' && perf?.branch_stats && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-3 mb-6">
          <div className="text-zinc-300 text-xs font-heading uppercase tracking-wider mb-2">Branch Performance</div>
          <div className="space-y-1">
            {(perf.branch_stats || []).slice(0, 10).map(r => (
              <div key={r.location_id || 'none'} className="flex items-center justify-between text-xs text-zinc-400">
                <span className="truncate">{r.location_name || r.location_id || 'Unassigned'}</span>
                <span className="text-zinc-200">{r.converted_leads}/{r.total_leads}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <SalesLeadsTab
        currentLocation={loc}
        locations={location ? [location] : []}
        onRefreshStats={() => {
          const params = location ? { location_id: location.location_id } : {};
          salesAPI.getCrmDashboard(params).then(r => setDash(r.data)).catch(() => setDash(null));
          salesAPI.getPerformance(params).then(r => setPerf(r.data)).catch(() => setPerf(null));
        }}
        currentStaffId={myStaffId}
        leadView={leadView}
        actorKind={kind || mySalesRole}
        canManage={canManage}
      />
    </div>
  );
}

