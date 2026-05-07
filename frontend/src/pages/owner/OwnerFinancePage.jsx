import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { hrAPI, financeAPI, authAPI, locationAPI } from '@/lib/api';
import TopNav from '@/components/TopNav';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { UserCog, DollarSign, TrendingDown, Users, ArrowLeft, Building2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';

const BAR_COLORS = { payroll: '#E53935', expenses: '#FB8C00' };

function isoDate(d) {
  return d.toISOString().split('T')[0];
}

function presetRange(key) {
  const now = new Date();
  const end = isoDate(now);
  if (key === 'week') {
    const day = now.getDay();
    const diff = (day + 6) % 7;
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - diff);
    return { start: isoDate(startDate), end };
  }
  if (key === 'month') {
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: isoDate(startDate), end };
  }
  if (key === 'quarter') {
    const q = Math.floor(now.getMonth() / 3) * 3;
    const startDate = new Date(now.getFullYear(), q, 1);
    return { start: isoDate(startDate), end };
  }
  if (key === 'year') {
    const startDate = new Date(now.getFullYear(), 0, 1);
    return { start: isoDate(startDate), end };
  }
  return { start: end, end };
}

export default function OwnerFinancePage({ initialTab = 'finance', lockedTab = null }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(initialTab);
  const today = new Date();
  const [periodStart, setPeriodStart] = useState(new Date(today.getFullYear(), today.getMonth() - 2, 1).toISOString().split('T')[0]);
  const [periodEnd, setPeriodEnd] = useState(today.toISOString().split('T')[0]);
  const [hrOverview, setHrOverview] = useState(null);
  const [financeSummary, setFinanceSummary] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [uRes, lRes] = await Promise.all([authAPI.getMe(), locationAPI.list()]);
        setUser(uRes.data); setLocations(lRes.data);
      } catch { navigate('/login', { replace: true }); }
      finally { setLoading(false); }
    };
    load();
  }, [navigate]);

  useEffect(() => {
    if (lockedTab) setTab(lockedTab);
  }, [lockedTab]);

  useEffect(() => {
    if (!user) return;
    if (tab === 'hr') { hrAPI.ownerOverview().then(r => setHrOverview(r.data)).catch(() => {}); }
    if (tab === 'finance') {
      financeAPI.ownerSummary(periodStart, periodEnd).then(r => setFinanceSummary(r.data)).catch(() => {});
    }
  }, [user, tab, periodStart, periodEnd]);

  if (loading) return <div className="min-h-screen bg-[#09090b] flex items-center justify-center"><div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div>;

  const chartData = financeSummary?.locations?.map(l => ({
    name: l.location_name.replace('Spartans - ', ''),
    Payroll: l.total_payroll,
    Expenses: l.total_expenses,
  })) || [];

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col">
      <TopNav user={user} locations={locations} />
      <main className="flex-1 px-6 sm:px-8 lg:px-12 py-8 max-w-[1440px] mx-auto w-full">
        <button data-testid="back-from-finance" onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-zinc-500 hover:text-white font-heading uppercase tracking-wider text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} /> Back to Dashboard
        </button>
        <h1 className="font-heading font-extrabold text-white text-4xl sm:text-5xl uppercase tracking-tight mb-2">{lockedTab === 'finance' ? 'Finance' : 'HR & Finance'}</h1>
        <p className="text-zinc-500 font-body text-base mb-8">Cross-location overview</p>

        {/* Tabs */}
        {lockedTab ? null : (
          <div className="flex gap-1 border-b border-zinc-800 mb-6">
            {[{ key: 'finance', label: 'Financial Dashboard', icon: DollarSign }, { key: 'hr', label: 'HR Overview', icon: UserCog }].map(t => (
              <button key={t.key} data-testid={`owner-tab-${t.key}`} onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-3 font-heading uppercase tracking-wider text-xs border-b-2 transition-all ${tab === t.key ? 'border-red-600 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
                <t.icon className="w-3.5 h-3.5" strokeWidth={1.5} /> {t.label}
              </button>
            ))}
          </div>
        )}

        {tab === 'finance' && (
          <div data-testid="owner-finance-dashboard">
            <div className="flex flex-wrap gap-4 mb-6 items-end">
              <div className="space-y-1"><Label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">From</Label><Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-9 text-xs w-36" /></div>
              <div className="space-y-1"><Label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">To</Label><Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-9 text-xs w-36" /></div>
              <div className="flex gap-2 flex-wrap">
                {[
                  { key: 'week', label: 'This Week' },
                  { key: 'month', label: 'This Month' },
                  { key: 'quarter', label: 'Quarterly' },
                  { key: 'year', label: 'Yearly' },
                ].map((p) => (
                  <button
                    key={p.key}
                    onClick={() => {
                      const r = presetRange(p.key);
                      setPeriodStart(r.start);
                      setPeriodEnd(r.end);
                    }}
                    className="h-9 px-3 rounded-sm border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-900 text-xs font-heading uppercase tracking-wider"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            {financeSummary && (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                  <div className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-sm">
                    <span className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Total Payroll (All)</span>
                    <p className="font-heading font-extrabold text-3xl text-red-500 mt-1">{financeSummary.grand_total_payroll.toLocaleString()} AED</p>
                  </div>
                  <div className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-sm">
                    <span className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Total Expenses (All)</span>
                    <p className="font-heading font-extrabold text-3xl text-amber-400 mt-1">{financeSummary.grand_total_expenses.toLocaleString()} AED</p>
                  </div>
                  <div className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-sm">
                    <span className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Total Revenue (All)</span>
                    <p className="font-heading font-extrabold text-3xl text-emerald-400 mt-1">{(financeSummary.grand_total_revenue || 0).toLocaleString()} AED</p>
                  </div>
                  <div className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-sm">
                    <span className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Net Result (All)</span>
                    <p className="font-heading font-extrabold text-3xl text-white mt-1">{((financeSummary.grand_total_revenue || 0) - financeSummary.grand_total_payroll - financeSummary.grand_total_expenses).toLocaleString()} AED</p>
                  </div>
                </div>
                {/* Chart */}
                {chartData.length > 0 && (
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-6 mb-8">
                    <h3 className="font-heading font-bold text-white text-sm uppercase tracking-wider mb-4">By Location</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} barGap={4}>
                          <XAxis dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={{ stroke: '#27272a' }} />
                          <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={{ stroke: '#27272a' }} />
                          <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '2px', color: '#fff', fontSize: '12px' }} />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                          <Bar dataKey="Payroll" fill="#E53935" radius={[2, 2, 0, 0]} />
                          <Bar dataKey="Expenses" fill="#FB8C00" radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
                {/* Table */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-zinc-800">
                      <th className="text-left p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Location</th>
                      <th className="text-right p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Staff</th>
                      <th className="text-right p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Revenue</th>
                      <th className="text-right p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Payroll</th>
                      <th className="text-right p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Expenses</th>
                      <th className="text-right p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Net</th>
                    </tr></thead>
                    <tbody>{financeSummary.locations.map(l => (
                      <tr
                        key={l.location_id}
                        data-testid={`owner-finance-row-${l.location_id}`}
                        className="border-b border-zinc-800/50 hover:bg-zinc-800/20 cursor-pointer"
                        onClick={() => navigate(`/finance/location/${l.location_id}?period_start=${encodeURIComponent(periodStart)}&period_end=${encodeURIComponent(periodEnd)}`)}
                      >
                        <td className="p-3"><span className="text-white text-sm">{l.location_name}</span><span className="text-zinc-600 text-xs ml-2">{l.city}</span></td>
                        <td className="p-3 text-right text-zinc-300 text-sm">{l.staff_count}</td>
                        <td className="p-3 text-right text-emerald-400 text-sm">{(l.total_revenue || 0).toLocaleString()}</td>
                        <td className="p-3 text-right text-red-400 text-sm">{l.total_payroll.toLocaleString()}</td>
                        <td className="p-3 text-right text-amber-400 text-sm">{l.total_expenses.toLocaleString()}</td>
                        <td className="p-3 text-right text-zinc-300 text-sm font-medium">{l.net_result.toLocaleString()} {l.currency}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'hr' && hrOverview && (
          <div data-testid="owner-hr-overview">
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-sm">
                <span className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Total Staff</span>
                <p className="font-heading font-extrabold text-3xl text-white mt-1">{hrOverview.total_staff}</p>
              </div>
              <div className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-sm">
                <span className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Total Instructors</span>
                <p className="font-heading font-extrabold text-3xl text-red-500 mt-1">{hrOverview.total_instructors}</p>
              </div>
            </div>
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-zinc-800">
                  <th className="text-left p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Location</th>
                  <th className="text-center p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Staff</th>
                  <th className="text-center p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Instructors</th>
                  <th className="text-center p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs hidden sm:table-cell">New This Month</th>
                  <th className="text-left p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs hidden md:table-cell">Last Payroll</th>
                </tr></thead>
                <tbody>{hrOverview.locations.map(l => (
                  <tr key={l.location_id} data-testid={`owner-hr-row-${l.location_id}`} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                    <td className="p-3"><span className="text-white text-sm">{l.location_name}</span><span className="text-zinc-600 text-xs ml-2">{l.city}</span></td>
                    <td className="p-3 text-center text-zinc-300 text-sm">{l.staff_count}</td>
                    <td className="p-3 text-center text-red-400 text-sm">{l.active_instructors}</td>
                    <td className="p-3 text-center text-emerald-400 text-sm hidden sm:table-cell">{l.new_this_month}</td>
                    <td className="p-3 hidden md:table-cell">
                      <span className="text-zinc-400 text-xs">{l.last_payroll_period}</span>
                      <Badge className={`ml-2 rounded-sm font-heading uppercase text-[10px] border-0 ${l.last_payroll_status === 'PAID' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-700/50 text-zinc-400'}`}>{l.last_payroll_status}</Badge>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
