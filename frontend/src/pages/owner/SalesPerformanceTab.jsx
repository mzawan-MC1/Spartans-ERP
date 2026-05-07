import React, { useState, useEffect, useCallback } from 'react';
import { salesAPI } from '@/lib/api';
import { toast } from 'sonner';
import PermissionDenied from '@/components/PermissionDenied';
import { downloadCsv } from '@/lib/csv';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Target, TrendingUp, Trophy, DollarSign, Users, Calendar, Loader2,
  ChevronDown, ChevronUp, Filter, RefreshCw,
} from 'lucide-react';

const DATE_PRESETS = [
  { label: 'This Week', value: 'this_week' },
  { label: 'This Month', value: 'this_month' },
  { label: 'Last 30 Days', value: 'last_30' },
  { label: 'All Time', value: 'all' },
];

function getDateRange(preset) {
  const now = new Date();
  let from = null;
  const to = now.toISOString();

  switch (preset) {
    case 'this_week': {
      const d = new Date(now);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
      d.setHours(0, 0, 0, 0);
      from = d.toISOString();
      break;
    }
    case 'this_month': {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      from = d.toISOString();
      break;
    }
    case 'last_30': {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      from = d.toISOString();
      break;
    }
    case 'all':
    default:
      from = null;
      break;
  }
  return { from, to: preset === 'all' ? null : to };
}

export default function SalesPerformanceTab({ currentLocation, locations, isManager = false }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [teams, setTeams] = useState([]);
  const [agents, setAgents] = useState([]);
  const [permissionDenied, setPermissionDenied] = useState(false);

  // Filters
  const [selectedLocation, setSelectedLocation] = useState(currentLocation?.location_id || '');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('');
  const [datePreset, setDatePreset] = useState('all');

  // UI State
  const [expandedTeams, setExpandedTeams] = useState({});

  const fetchPerformance = useCallback(async () => {
    setLoading(true);
    try {
      setPermissionDenied(false);
      const { from, to } = getDateRange(datePreset);
      const params = {};
      if (!isManager && selectedLocation) params.location_id = selectedLocation;
      if (selectedTeam) params.team_id = selectedTeam;
      if (selectedAgent) params.agent_staff_id = selectedAgent;
      if (from) params.date_from = from;
      if (to) params.date_to = to;

      const r = await salesAPI.getPerformance(params);
      setData(r.data);
    } catch (e) {
      if (e?.response?.status === 403) {
        setPermissionDenied(true);
        setData(null);
      } else {
        toast.error('Failed to load performance data');
      }
    } finally {
      setLoading(false);
    }
  }, [selectedLocation, selectedTeam, selectedAgent, datePreset, isManager]);

  const fetchTeams = useCallback(async () => {
    try {
      const params = {};
      if (!isManager && selectedLocation) params.location_id = selectedLocation;
      const r = await salesAPI.listTeams(params);
      setTeams(r.data.teams || []);
    } catch {
      setTeams([]);
    }
  }, [selectedLocation, isManager]);

  useEffect(() => {
    fetchPerformance();
  }, [fetchPerformance]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  // Extract unique agents from data for filter dropdown
  useEffect(() => {
    if (data?.agent_stats) {
      const uniqueAgents = data.agent_stats
        .filter(a => a.agent)
        .map(a => ({
          staff_id: a.agent_staff_id,
          name: `${a.agent.first_name} ${a.agent.last_name}`,
        }));
      setAgents(uniqueAgents);
    }
  }, [data]);

  // Update selectedLocation when currentLocation changes
  useEffect(() => {
    if (currentLocation) {
      setSelectedLocation(currentLocation.location_id);
    } else {
      setSelectedLocation('');
    }
    setSelectedTeam('');
    setSelectedAgent('');
  }, [currentLocation]);

  const toggleTeamExpand = (teamId) => {
    setExpandedTeams(prev => ({ ...prev, [teamId]: !prev[teamId] }));
  };

  const formatCurrency = (val) => {
    if (!val) return 'AED 0';
    return `AED ${val.toLocaleString()}`;
  };

  if (permissionDenied) {
    return <PermissionDenied fallback={isManager ? '/manager' : '/dashboard'} />;
  }

  if (loading && !data) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
      </div>
    );
  }

  const summary = data?.summary || {
    total_leads: 0,
    conversion_rate: 0,
    memberships_sold_count: 0,
    memberships_total_value: 0,
    working_leads: 0,
    not_working_leads: 0,
    converted_leads: 0,
    transferred_leads: 0,
    today_follow_ups: 0,
    overdue_follow_ups: 0,
    leads_by_status: {},
  };

  return (
    <div data-testid="sales-performance-tab" className="space-y-6">
      {/* Filters Bar */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-zinc-500" />
          <span className="text-zinc-400 text-xs font-heading uppercase tracking-wider">Filters</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Location Filter (Admin only) */}
          {!isManager && locations.length > 1 && (
            <div>
              <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">Branch</label>
              <Select value={selectedLocation || 'all'} onValueChange={v => { setSelectedLocation(v === 'all' ? '' : v); setSelectedTeam(''); setSelectedAgent(''); }}>
                <SelectTrigger data-testid="perf-filter-location" className="bg-zinc-950 border-zinc-800 text-white text-xs h-9">
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="all">All Branches</SelectItem>
                  {locations.map(l => (
                    <SelectItem key={l.location_id} value={l.location_id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Team Filter */}
          <div>
            <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">Team</label>
            <Select value={selectedTeam || 'all'} onValueChange={v => { setSelectedTeam(v === 'all' ? '' : v); setSelectedAgent(''); }}>
              <SelectTrigger data-testid="perf-filter-team" className="bg-zinc-950 border-zinc-800 text-white text-xs h-9">
                <SelectValue placeholder="All Teams" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                <SelectItem value="all">All Teams</SelectItem>
                {teams.map(t => (
                  <SelectItem key={t.sales_team_id} value={t.sales_team_id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* CSR Filter */}
          <div>
            <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">CSR</label>
            <Select value={selectedAgent || 'all'} onValueChange={v => setSelectedAgent(v === 'all' ? '' : v)}>
              <SelectTrigger data-testid="perf-filter-agent" className="bg-zinc-950 border-zinc-800 text-white text-xs h-9">
                <SelectValue placeholder="All CSRs" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                <SelectItem value="all">All CSRs</SelectItem>
                {agents.map(a => (
                  <SelectItem key={a.staff_id} value={a.staff_id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date Preset */}
          <div>
            <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">Period</label>
            <Select value={datePreset} onValueChange={setDatePreset}>
              <SelectTrigger data-testid="perf-filter-date" className="bg-zinc-950 border-zinc-800 text-white text-xs h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                {DATE_PRESETS.map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Refresh Button */}
        <div className="flex items-center justify-end gap-2 mt-3">
          <button
            onClick={() => downloadCsv('crm_performance_summary.csv', [data?.summary || {}])}
            disabled={loading || !data}
            className="text-zinc-400 hover:text-white text-xs font-heading uppercase tracking-wider transition-colors disabled:opacity-50 border border-zinc-800 px-3 py-2 rounded-sm"
          >
            Export Summary
          </button>
          <button
            onClick={() => downloadCsv('crm_performance_branches.csv', data?.branch_stats || [])}
            disabled={loading || !data}
            className="text-zinc-400 hover:text-white text-xs font-heading uppercase tracking-wider transition-colors disabled:opacity-50 border border-zinc-800 px-3 py-2 rounded-sm"
          >
            Export Branches
          </button>
          <button
            onClick={() => downloadCsv('crm_performance_team_leads.csv', data?.team_lead_stats || [])}
            disabled={loading || !data}
            className="text-zinc-400 hover:text-white text-xs font-heading uppercase tracking-wider transition-colors disabled:opacity-50 border border-zinc-800 px-3 py-2 rounded-sm"
          >
            Export TLs
          </button>
          <button
            onClick={() => downloadCsv('crm_performance_csrs.csv', data?.agent_stats || [])}
            disabled={loading || !data}
            className="text-zinc-400 hover:text-white text-xs font-heading uppercase tracking-wider transition-colors disabled:opacity-50 border border-zinc-800 px-3 py-2 rounded-sm"
          >
            Export CSRs
          </button>
          <button
            data-testid="perf-refresh"
            onClick={fetchPerformance}
            disabled={loading}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-xs font-heading uppercase tracking-wider transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div data-testid="perf-summary" className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <SummaryCard
          icon={Target}
          label="Total Leads"
          value={summary.total_leads}
          color="text-blue-400"
        />
        <SummaryCard
          icon={Trophy}
          label="Converted"
          value={summary.converted_leads ?? summary.memberships_sold_count}
          color="text-green-400"
        />
        <SummaryCard
          icon={TrendingUp}
          label="Working"
          value={summary.working_leads ?? 0}
          color="text-amber-400"
        />
        <SummaryCard
          icon={TrendingUp}
          label="Not Working"
          value={summary.not_working_leads ?? 0}
          color="text-zinc-400"
        />
        <SummaryCard
          icon={TrendingUp}
          label="Conversion Rate"
          value={`${summary.conversion_rate}%`}
          color="text-amber-400"
        />
        <SummaryCard
          icon={DollarSign}
          label="Total Value"
          value={formatCurrency(summary.memberships_total_value)}
          color="text-emerald-400"
        />
      </div>

      {/* Status Breakdown */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-4">
        <h3 className="font-heading font-bold text-zinc-300 text-xs uppercase tracking-wider mb-4">Leads by Status</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {['new', 'under_discussion', 'under_process', 'call_back_requested', 'follow_up_pending', 'converted', 'transferred', 'no_response', 'not_interested', 'canceled', 'duplicate'].map(status => {
            const count = summary.leads_by_status?.[status] || 0;
            return (
              <div key={status} className="border border-zinc-800 bg-zinc-950/40 rounded-sm p-2 text-center">
                <p className="text-[10px] font-heading uppercase tracking-wider text-zinc-500">{status.replace(/_/g, ' ')}</p>
                <p className="font-heading font-bold text-lg mt-0.5 text-zinc-200">{count}</p>
              </div>
            );
          })}
        </div>
      </div>

      {data?.branch_stats?.length > 0 && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm overflow-hidden">
          <div className="p-4 border-b border-zinc-800">
            <h3 className="font-heading font-bold text-white text-sm uppercase tracking-wider">Branch Performance</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Branch</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider text-right">Leads</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider text-right">Working</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider text-right">Not Working</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider text-right">Converted</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider text-right">Conv %</th>
                </tr>
              </thead>
              <tbody>
                {data.branch_stats.map((b, idx) => (
                  <tr key={b.location_id || idx} className={`border-b border-zinc-800/50 ${idx % 2 === 0 ? 'bg-zinc-900/20' : ''}`}>
                    <td className="px-4 py-3 text-white font-body">{b.location_name || 'Unassigned'}</td>
                    <td className="px-4 py-3 text-right text-zinc-300 font-heading">{b.total_leads}</td>
                    <td className="px-4 py-3 text-right text-amber-400 font-heading">{b.working_leads}</td>
                    <td className="px-4 py-3 text-right text-zinc-400 font-heading">{b.not_working_leads}</td>
                    <td className="px-4 py-3 text-right text-green-400 font-heading">{b.converted_leads}</td>
                    <td className="px-4 py-3 text-right text-amber-400 font-heading">{b.conversion_rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data?.team_lead_stats?.length > 0 && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm overflow-hidden">
          <div className="p-4 border-b border-zinc-800">
            <h3 className="font-heading font-bold text-white text-sm uppercase tracking-wider">Team Lead Performance</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Team Lead</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider text-right">Leads</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider text-right">Working</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider text-right">Not Working</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider text-right">Converted</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider text-right">Conv %</th>
                </tr>
              </thead>
              <tbody>
                {data.team_lead_stats.map((t, idx) => (
                  <tr key={t.team_lead_staff_id || idx} className={`border-b border-zinc-800/50 ${idx % 2 === 0 ? 'bg-zinc-900/20' : ''}`}>
                    <td className="px-4 py-3 text-white font-body">{t.team_lead_name || t.team_lead_staff_id || 'Unassigned'}</td>
                    <td className="px-4 py-3 text-right text-zinc-300 font-heading">{t.total_leads}</td>
                    <td className="px-4 py-3 text-right text-amber-400 font-heading">{t.working_leads}</td>
                    <td className="px-4 py-3 text-right text-zinc-400 font-heading">{t.not_working_leads}</td>
                    <td className="px-4 py-3 text-right text-green-400 font-heading">{t.converted_leads}</td>
                    <td className="px-4 py-3 text-right text-amber-400 font-heading">{t.conversion_rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Team Performance Table */}
      {data?.team_stats?.length > 0 && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm overflow-hidden">
          <div className="p-4 border-b border-zinc-800">
            <h3 className="font-heading font-bold text-white text-sm uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-zinc-500" />
              Team Performance
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Team</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider text-right">Leads</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider text-right">Converted</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider text-right">Lost</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider text-right">Conv %</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider text-right">Value</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.team_stats.map((t, idx) => {
                  const teamId = t.team_id || 'unassigned';
                  const isExpanded = expandedTeams[teamId];
                  const teamAgents = data.agent_stats?.filter(a => a.team?.sales_team_id === t.team_id) || [];

                  return (
                    <React.Fragment key={teamId}>
                      <tr
                        data-testid={`team-perf-row-${teamId}`}
                        className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors cursor-pointer ${idx % 2 === 0 ? 'bg-zinc-900/20' : ''}`}
                        onClick={() => toggleTeamExpand(teamId)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-body">{t.team?.name || 'Unassigned'}</span>
                            {t.team?.location_name && (
                              <Badge variant="outline" className="text-[9px] border-zinc-700 text-zinc-500">
                                {t.team.location_name}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-zinc-300 font-heading">{t.total_leads}</td>
                        <td className="px-4 py-3 text-right text-green-400 font-heading">{t.won_count}</td>
                        <td className="px-4 py-3 text-right text-red-400 font-heading">{t.lost_count}</td>
                        <td className="px-4 py-3 text-right text-amber-400 font-heading">{t.conversion_rate}%</td>
                        <td className="px-4 py-3 text-right text-emerald-400 font-heading">{formatCurrency(t.memberships_total_value)}</td>
                        <td className="px-4 py-3 text-right">
                          {teamAgents.length > 0 && (
                            isExpanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />
                          )}
                        </td>
                      </tr>
                      {/* Expanded Agent Rows */}
                      {isExpanded && teamAgents.map(agent => (
                        <tr
                          key={agent.agent_staff_id}
                          data-testid={`agent-perf-row-${agent.agent_staff_id}`}
                          className="bg-zinc-950/50 border-b border-zinc-800/30"
                        >
                          <td className="px-4 py-2 pl-10">
                            <div className="flex items-center gap-2">
                              <span className="text-zinc-400 text-xs font-body">
                                {agent.agent ? `${agent.agent.first_name} ${agent.agent.last_name}` : 'Unknown Agent'}
                              </span>
                              {agent.agent?.sales_role && (
                                <Badge variant="outline" className={`text-[9px] ${agent.agent.sales_role === 'TEAM_LEAD' ? 'border-amber-700 text-amber-500' : 'border-blue-700 text-blue-500'}`}>
                                  {agent.agent.sales_role === 'TEAM_LEAD' ? 'Lead' : 'Agent'}
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right text-zinc-400 text-xs">{agent.total_leads}</td>
                          <td className="px-4 py-2 text-right text-green-500/80 text-xs">{agent.memberships_sold_count}</td>
                          <td className="px-4 py-2 text-right text-red-500/80 text-xs">{agent.not_working_leads || 0}</td>
                          <td className="px-4 py-2 text-right text-amber-500/80 text-xs">{agent.conversion_rate}%</td>
                          <td className="px-4 py-2 text-right text-emerald-500/80 text-xs">{formatCurrency(agent.memberships_total_value)}</td>
                          <td className="px-4 py-2"></td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Individual CSR Stats (when no teams or as standalone) */}
      {data?.agent_stats?.length > 0 && (!data?.team_stats?.length || selectedAgent) && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm overflow-hidden">
          <div className="p-4 border-b border-zinc-800">
            <h3 className="font-heading font-bold text-white text-sm uppercase tracking-wider">CSR Performance</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Agent</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Team</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider text-right">Leads</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider text-right">Converted</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider text-right">Conv %</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider text-right">Value</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider text-right">Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {data.agent_stats.map((a, idx) => (
                  <tr
                    key={a.agent_staff_id || idx}
                    data-testid={`agent-row-${a.agent_staff_id}`}
                    className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors ${idx % 2 === 0 ? 'bg-zinc-900/20' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <span className="text-white font-body">
                        {a.agent ? `${a.agent.first_name} ${a.agent.last_name}` : 'Unassigned'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">{a.team?.name || '-'}</td>
                    <td className="px-4 py-3 text-right text-zinc-300 font-heading">{a.total_leads}</td>
                    <td className="px-4 py-3 text-right text-green-400 font-heading">{a.memberships_sold_count}</td>
                    <td className="px-4 py-3 text-right text-amber-400 font-heading">{a.conversion_rate}%</td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-heading">{formatCurrency(a.memberships_total_value)}</td>
                    <td className="px-4 py-3 text-right text-zinc-500 text-xs">
                      {a.last_activity_date ? new Date(a.last_activity_date).toLocaleDateString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && data?.agent_stats?.length === 0 && data?.team_stats?.length === 0 && (
        <div className="text-center py-16 text-zinc-600 font-body">
          <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No performance data available for the selected filters.</p>
          <p className="text-sm mt-1">Try adjusting your date range or filters.</p>
        </div>
      )}
    </div>
  );
}

// Summary Card Component
function SummaryCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-sm hover:bg-zinc-900 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <span className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">{label}</span>
        <Icon className={`w-4 h-4 ${color}`} strokeWidth={1.5} />
      </div>
      <p className={`font-heading font-extrabold text-2xl ${color}`}>{value}</p>
    </div>
  );
}

// For use by SalesTeamsTab - compact summary strip
export function PerformanceSummaryStrip({ currentLocation, isManager = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const params = {};
        if (!isManager && currentLocation?.location_id) {
          params.location_id = currentLocation.location_id;
        }
        const r = await salesAPI.getPerformance(params);
        setData(r.data?.summary);
      } catch {
        // Silent fail
      } finally {
        setLoading(false);
      }
    };
    fetchSummary();
  }, [currentLocation, isManager]);

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="w-4 h-4 text-zinc-600 animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const formatCurrency = (val) => {
    if (!val) return 'AED 0';
    return `AED ${val.toLocaleString()}`;
  };

  const items = [
    { label: 'Total Leads', value: data.total_leads, color: 'text-blue-400' },
    { label: 'Won', value: data.memberships_sold_count, color: 'text-green-400' },
    { label: 'Conversion', value: `${data.conversion_rate}%`, color: 'text-amber-400' },
    { label: 'Total Value', value: formatCurrency(data.memberships_total_value), color: 'text-emerald-400' },
  ];

  return (
    <div data-testid="perf-summary-strip" className="grid grid-cols-4 gap-2 mb-6">
      {items.map(item => (
        <div key={item.label} className="bg-zinc-900/30 border border-zinc-800/50 p-3 rounded-sm text-center">
          <p className="text-zinc-500 text-[9px] font-heading uppercase tracking-wider">{item.label}</p>
          <p className={`font-heading font-bold text-base mt-0.5 ${item.color}`}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}
