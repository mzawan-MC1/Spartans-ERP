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
  DollarSign, TrendingUp, Users, MapPin, Calendar, Loader2, RefreshCw, Filter,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react';

const DATE_PRESETS = [
  { label: 'This Month', value: 'this_month' },
  { label: 'Last 30 Days', value: 'last_30' },
  { label: 'Last 90 Days', value: 'last_90' },
  { label: 'All Time', value: 'all' },
];

function getDateRange(preset) {
  const now = new Date();
  let from = null;
  const to = now.toISOString();

  switch (preset) {
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
    case 'last_90': {
      const d = new Date(now);
      d.setDate(d.getDate() - 90);
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

export default function SalesRevenueTab({ currentLocation, locations, isManager = false }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [crmConversions, setCrmConversions] = useState([]);
  const [teams, setTeams] = useState([]);
  const [permissionDenied, setPermissionDenied] = useState(false);

  // Filters
  const [selectedLocation, setSelectedLocation] = useState(currentLocation?.location_id || '');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [datePreset, setDatePreset] = useState('all');

  const fetchRevenue = useCallback(async () => {
    setLoading(true);
    try {
      setPermissionDenied(false);
      const { from, to } = getDateRange(datePreset);
      const params = {};
      if (!isManager && selectedLocation) params.location_id = selectedLocation;
      if (selectedTeam) params.team_id = selectedTeam;
      if (from) params.date_from = from;
      if (to) params.date_to = to;

      const r = await salesAPI.getRevenue(params);
      setData(r.data);

      try {
        const c = await salesAPI.getCrmConversions(params);
        setCrmConversions(c.data?.rows || []);
      } catch (e) {
        if (e?.response?.status === 404) {
          setCrmConversions([]);
        } else if (e?.response?.status === 403) {
          setCrmConversions([]);
        } else {
          setCrmConversions([]);
        }
      }
    } catch (e) {
      if (e?.response?.status === 403) {
        setPermissionDenied(true);
        setData(null);
      } else {
        toast.error('Failed to load revenue data');
      }
    } finally {
      setLoading(false);
    }
  }, [selectedLocation, selectedTeam, datePreset, isManager]);

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
    fetchRevenue();
  }, [fetchRevenue]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  useEffect(() => {
    if (currentLocation) {
      setSelectedLocation(currentLocation.location_id);
    } else {
      setSelectedLocation('');
    }
    setSelectedTeam('');
  }, [currentLocation]);

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

  const summary = data?.summary || { total_revenue: 0, transaction_count: 0, avg_transaction: 0 };
  const byLocation = data?.by_location || [];
  const byCSR = data?.by_csr || data?.by_agent || [];
  const byTeamLead = data?.by_team_lead || [];
  const bySourceCampaign = data?.by_source_campaign || [];
  const monthlyTrend = data?.monthly_trend || [];
  const transactions = data?.transactions || [];
  const exportDisabled = loading || !data;

  return (
    <div data-testid="sales-revenue-tab" className="space-y-6">
      {/* Filters Bar */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-zinc-500" />
          <span className="text-zinc-400 text-xs font-heading uppercase tracking-wider">Filters</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {/* Location Filter (Admin only) */}
          {!isManager && locations.length > 1 && (
            <div>
              <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">Branch</label>
              <Select value={selectedLocation || 'all'} onValueChange={v => { setSelectedLocation(v === 'all' ? '' : v); setSelectedTeam(''); }}>
                <SelectTrigger data-testid="rev-filter-location" className="bg-zinc-950 border-zinc-800 text-white text-xs h-9">
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
            <Select value={selectedTeam || 'all'} onValueChange={v => setSelectedTeam(v === 'all' ? '' : v)}>
              <SelectTrigger data-testid="rev-filter-team" className="bg-zinc-950 border-zinc-800 text-white text-xs h-9">
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

          {/* Date Preset */}
          <div>
            <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">Period</label>
            <Select value={datePreset} onValueChange={setDatePreset}>
              <SelectTrigger data-testid="rev-filter-date" className="bg-zinc-950 border-zinc-800 text-white text-xs h-9">
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

        <div className="flex items-center justify-end gap-2 mt-3 flex-wrap">
          <button
            onClick={() => downloadCsv('crm_revenue_summary.csv', [{
              total_revenue: summary.total_revenue || 0,
              transaction_count: summary.transaction_count || 0,
              avg_transaction: summary.avg_transaction || 0,
              branch_filter: selectedLocation || 'all',
              team_filter: selectedTeam || 'all',
              period: datePreset || 'all',
            }])}
            disabled={exportDisabled}
            className="text-zinc-400 hover:text-white text-xs font-heading uppercase tracking-wider transition-colors disabled:opacity-50 border border-zinc-800 px-3 py-2 rounded-sm"
          >
            Export Summary
          </button>
          <button
            onClick={() => downloadCsv('crm_revenue_branches.csv', byLocation)}
            disabled={exportDisabled}
            className="text-zinc-400 hover:text-white text-xs font-heading uppercase tracking-wider transition-colors disabled:opacity-50 border border-zinc-800 px-3 py-2 rounded-sm"
          >
            Export Branches
          </button>
          <button
            onClick={() => downloadCsv('crm_revenue_csrs.csv', byCSR)}
            disabled={exportDisabled}
            className="text-zinc-400 hover:text-white text-xs font-heading uppercase tracking-wider transition-colors disabled:opacity-50 border border-zinc-800 px-3 py-2 rounded-sm"
          >
            Export CSRs
          </button>
          <button
            onClick={() => downloadCsv('crm_revenue_team_leads.csv', byTeamLead)}
            disabled={exportDisabled}
            className="text-zinc-400 hover:text-white text-xs font-heading uppercase tracking-wider transition-colors disabled:opacity-50 border border-zinc-800 px-3 py-2 rounded-sm"
          >
            Export TLs
          </button>
          <button
            onClick={() => downloadCsv('crm_revenue_sources.csv', bySourceCampaign)}
            disabled={exportDisabled}
            className="text-zinc-400 hover:text-white text-xs font-heading uppercase tracking-wider transition-colors disabled:opacity-50 border border-zinc-800 px-3 py-2 rounded-sm"
          >
            Export Sources
          </button>
          <button
            onClick={() => downloadCsv('crm_revenue_monthly_trend.csv', monthlyTrend)}
            disabled={exportDisabled}
            className="text-zinc-400 hover:text-white text-xs font-heading uppercase tracking-wider transition-colors disabled:opacity-50 border border-zinc-800 px-3 py-2 rounded-sm"
          >
            Export Trend
          </button>
          <button
            onClick={() => downloadCsv('crm_conversion_attribution.csv', (crmConversions || []).map(r => ({
              branch: r.location_name || '',
              branch_id: r.location_id || '',
              team_lead: r.team_lead_name || '',
              team_lead_staff_id: r.team_lead_staff_id || '',
              csr: r.csr_name || '',
              csr_staff_id: r.csr_staff_id || '',
              source: r.source || '',
              program_interest: r.program_interest || '',
              membership_plan: r.membership_plan || '',
              converted_count: r.converted_count ?? 0,
              total_value: r.total_value ?? 0,
            })))}
            disabled={loading}
            className="text-zinc-400 hover:text-white text-xs font-heading uppercase tracking-wider transition-colors disabled:opacity-50 border border-zinc-800 px-3 py-2 rounded-sm"
          >
            Export Conversions
          </button>
          <button
            onClick={() => downloadCsv('crm_revenue_transactions.csv', (transactions || []).map(t => ({
              transaction_id: t.transaction_id || '',
              created_at: t.created_at || '',
              date: t.created_at ? new Date(t.created_at).toISOString() : '',
              customer: t.metadata?.lead_name || '',
              branch: t.location_name || '',
              branch_id: t.location_id || '',
              csr: t.metadata?.csr_name || t.metadata?.agent_name || '',
              csr_staff_id: t.metadata?.csr_staff_id || t.metadata?.agent_staff_id || '',
              amount: t.amount ?? 0,
            })))}
            disabled={exportDisabled}
            className="text-zinc-400 hover:text-white text-xs font-heading uppercase tracking-wider transition-colors disabled:opacity-50 border border-zinc-800 px-3 py-2 rounded-sm"
          >
            Export Sales
          </button>
          <button
            data-testid="rev-refresh"
            onClick={fetchRevenue}
            disabled={loading}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-xs font-heading uppercase tracking-wider transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div data-testid="rev-summary" className="grid grid-cols-3 gap-3">
        <SummaryCard
          icon={DollarSign}
          label="Total Revenue"
          value={formatCurrency(summary.total_revenue)}
          color="text-emerald-400"
        />
        <SummaryCard
          icon={TrendingUp}
          label="Sales Count"
          value={summary.transaction_count}
          color="text-blue-400"
        />
        <SummaryCard
          icon={DollarSign}
          label="Avg. Sale Value"
          value={formatCurrency(summary.avg_transaction)}
          color="text-amber-400"
        />
      </div>

      {/* Two Column Layout */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Revenue by Location */}
        {byLocation.length > 0 && (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm overflow-hidden">
            <div className="p-4 border-b border-zinc-800">
              <h3 className="font-heading font-bold text-white text-sm uppercase tracking-wider flex items-center gap-2">
                <MapPin className="w-4 h-4 text-zinc-500" />
                Revenue by Branch
              </h3>
            </div>
            <div className="p-4 space-y-3">
              {byLocation.map((loc, idx) => (
                <div key={loc.location_id || idx} className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0">
                  <div>
                    <p className="text-white font-body text-sm">{loc.location_name}</p>
                    <p className="text-zinc-500 text-xs">{loc.transaction_count} sales</p>
                  </div>
                  <p className="text-emerald-400 font-heading font-bold">{formatCurrency(loc.total_revenue)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Revenue by CSR */}
        {byCSR.length > 0 && (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm overflow-hidden">
            <div className="p-4 border-b border-zinc-800">
              <h3 className="font-heading font-bold text-white text-sm uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-zinc-500" />
                Revenue by CSR
              </h3>
            </div>
            <div className="p-4 space-y-3">
              {byCSR.map((agent, idx) => (
                <div key={agent.csr_staff_id || agent.agent_staff_id || idx} className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0">
                  <div>
                    <p className="text-white font-body text-sm">{agent.csr_name || agent.agent_name}</p>
                    <p className="text-zinc-500 text-xs">{agent.transaction_count} sales</p>
                  </div>
                  <p className="text-emerald-400 font-heading font-bold">{formatCurrency(agent.total_revenue)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {(byTeamLead.length > 0 || bySourceCampaign.length > 0) && (
        <div className="grid md:grid-cols-2 gap-6">
          {byTeamLead.length > 0 && (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm overflow-hidden">
              <div className="p-4 border-b border-zinc-800">
                <h3 className="font-heading font-bold text-white text-sm uppercase tracking-wider flex items-center gap-2">
                  <Users className="w-4 h-4 text-zinc-500" />
                  Revenue by Team Lead
                </h3>
              </div>
              <div className="p-4 space-y-3">
                {byTeamLead.map((t, idx) => (
                  <div key={t.team_lead_staff_id || idx} className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0">
                    <div>
                      <p className="text-white font-body text-sm">{t.team_lead_name || t.team_lead_staff_id || 'Unassigned'}</p>
                      <p className="text-zinc-500 text-xs">{t.transaction_count} sales</p>
                    </div>
                    <p className="text-emerald-400 font-heading font-bold">{formatCurrency(t.total_revenue)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {bySourceCampaign.length > 0 && (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm overflow-hidden">
              <div className="p-4 border-b border-zinc-800">
                <h3 className="font-heading font-bold text-white text-sm uppercase tracking-wider">
                  Revenue by Source / Campaign
                </h3>
              </div>
              <div className="p-4 space-y-3">
                {bySourceCampaign.slice(0, 20).map((r, idx) => (
                  <div key={`${r.source_platform}-${r.campaign_name}-${idx}`} className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0">
                    <div className="min-w-0">
                      <p className="text-white font-body text-sm truncate">{r.source_platform || 'UNKNOWN'} · {r.campaign_name || 'UNKNOWN'}</p>
                      <p className="text-zinc-500 text-xs truncate">{r.adset_or_adgroup || r.source_reference || '-'}</p>
                    </div>
                    <p className="text-emerald-400 font-heading font-bold">{formatCurrency(r.total_revenue)}</p>
                  </div>
                ))}
                {bySourceCampaign.length > 20 && (
                  <p className="text-[11px] text-zinc-500">Showing first 20 of {bySourceCampaign.length} rows.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Monthly Trend */}
      {monthlyTrend.length > 0 && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm overflow-hidden">
          <div className="p-4 border-b border-zinc-800">
            <h3 className="font-heading font-bold text-white text-sm uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-zinc-500" />
              Monthly Trend
            </h3>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {monthlyTrend.slice(0, 6).map((m, idx) => {
                const prevMonth = monthlyTrend[idx + 1];
                const change = prevMonth ? ((m.total_revenue - prevMonth.total_revenue) / prevMonth.total_revenue) * 100 : 0;
                const isUp = change >= 0;
                return (
                  <div key={m.month} className="bg-zinc-950/50 border border-zinc-800/50 p-3 rounded-sm text-center">
                    <p className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider mb-1">{m.month}</p>
                    <p className="text-emerald-400 font-heading font-bold text-sm">{formatCurrency(m.total_revenue)}</p>
                    {prevMonth && (
                      <p className={`text-[10px] flex items-center justify-center gap-0.5 mt-1 ${isUp ? 'text-green-500' : 'text-red-500'}`}>
                        {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {Math.abs(change).toFixed(0)}%
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* CRM Conversion Attribution */}
      {crmConversions.length > 0 && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm overflow-hidden">
          <div className="p-4 border-b border-zinc-800">
            <h3 className="font-heading font-bold text-white text-sm uppercase tracking-wider">CRM Conversion Attribution</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Branch</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Team Lead</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider">CSR</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Source</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Program</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Plan</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider text-right">Conversions</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {crmConversions.slice(0, 25).map((r, idx) => (
                  <tr
                    key={`${r.location_id}-${r.csr_staff_id}-${r.team_lead_staff_id}-${r.source}-${idx}`}
                    className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors ${idx % 2 === 0 ? 'bg-zinc-900/20' : ''}`}
                  >
                    <td className="px-4 py-3 text-zinc-400 text-xs">{r.location_name || '-'}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{r.team_lead_name || '-'}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{r.csr_name || '-'}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">
                      <Badge variant="outline" className="text-[10px] border-zinc-700">{r.source}</Badge>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{r.program_interest || '-'}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{r.membership_plan || '-'}</td>
                    <td className="px-4 py-3 text-right text-white font-heading font-bold">{r.converted_count}</td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-heading font-bold">{formatCurrency(r.total_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Transactions */}
      {transactions.length > 0 && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm overflow-hidden">
          <div className="p-4 border-b border-zinc-800">
            <h3 className="font-heading font-bold text-white text-sm uppercase tracking-wider">Recent Sales</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Branch</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider">CSR</th>
                  <th className="px-4 py-3 text-zinc-500 text-[10px] font-heading uppercase tracking-wider text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 10).map((t, idx) => (
                  <tr
                    key={t.transaction_id}
                    data-testid={`rev-txn-${t.transaction_id}`}
                    className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors ${idx % 2 === 0 ? 'bg-zinc-900/20' : ''}`}
                  >
                    <td className="px-4 py-3 text-zinc-400 text-xs">
                      {new Date(t.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-white font-body">
                      {t.metadata?.lead_name || 'Unknown'}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">
                      {t.location_name || '-'}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">
                      {t.metadata?.csr_name || t.metadata?.agent_name || 'Unassigned'}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-heading font-bold">
                      {formatCurrency(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && summary.total_revenue === 0 && transactions.length === 0 && (
        <div className="text-center py-16 text-zinc-600 font-body">
          <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No revenue data available for the selected filters.</p>
          <p className="text-sm mt-1">Revenue is recorded when leads are marked as converted.</p>
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
