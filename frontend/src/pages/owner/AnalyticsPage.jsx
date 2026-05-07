import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyticsAPI, authAPI } from '@/lib/api';
import TopNav from '@/components/TopNav';
import { toast } from 'sonner';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie
} from 'recharts';
import {
  Users, UserPlus, GraduationCap, BookOpen, Calendar, DollarSign, TrendingUp, Activity, Building2, ArrowLeft, UserCheck, UserX, CreditCard, Clock
} from 'lucide-react';

const COLORS = ['#dc2626', '#ef4444', '#f87171', '#fca5a5', '#fecaca'];
const CHART_RED = '#dc2626';
const CHART_ZINC = '#52525b';

function MetricCard({ icon: Icon, label, value, sub, color = 'red' }) {
  const colorMap = {
    red: 'bg-red-600/10 text-red-500 border-red-600/20',
    emerald: 'bg-emerald-600/10 text-emerald-500 border-emerald-600/20',
    blue: 'bg-blue-600/10 text-blue-500 border-blue-600/20',
    amber: 'bg-amber-600/10 text-amber-500 border-amber-600/20',
  };

  return (
    <div data-testid={`metric-${label.toLowerCase().replace(/\s+/g, '-')}`}
      className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-5 hover:border-zinc-700 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-sm flex items-center justify-center border ${colorMap[color]}`}>
          <Icon className="w-4.5 h-4.5" strokeWidth={1.5} />
        </div>
      </div>
      <p className="text-white font-heading font-extrabold text-2xl tracking-tight">{value}</p>
      <p className="text-zinc-500 text-xs font-heading uppercase tracking-wider mt-1">{label}</p>
      {sub && <p className="text-zinc-600 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, children, testId }) {
  return (
    <div data-testid={testId} className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-5">
      <h3 className="font-heading font-bold text-white text-sm uppercase tracking-wider mb-4">{title}</h3>
      {children}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-sm p-3 text-xs">
      <p className="text-white font-heading font-bold mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-zinc-300">
          <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: p.color }} />
          {p.name}: <span className="text-white font-bold">{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</span>
        </p>
      ))}
    </div>
  );
};

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [userRes, analyticsRes] = await Promise.all([
          authAPI.getMe(),
          analyticsAPI.getOwnerDashboard()
        ]);
        setUser(userRes.data);
        setData(analyticsRes.data);
      } catch (err) {
        if (err.response?.status === 401) navigate('/login', { replace: true });
        else if (err.response?.status === 403) navigate('/dashboard', { replace: true });
        else toast.error('Failed to load analytics');
      } finally { setLoading(false); }
    };
    fetchData();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const { metrics, members_growth, revenue_by_month, attendance_by_program, top_programs, location_stats, member_location_stats } = data;

  // Prepare member status pie chart data
  const memberStatusData = [
    { name: 'Active', value: metrics.active_registered_members || 0, color: '#22c55e' },
    { name: 'Inactive', value: metrics.inactive_registered_members || 0, color: '#f59e0b' },
    { name: 'Deleted', value: metrics.deleted_registered_members || 0, color: '#ef4444' },
  ].filter(d => d.value > 0);

  const membershipStatusData = [
    { name: 'Active', value: metrics.active_memberships || 0, color: '#22c55e' },
    { name: 'Pending', value: metrics.pending_memberships || 0, color: '#f59e0b' },
    { name: 'Expired', value: metrics.expired_memberships || 0, color: '#ef4444' },
  ].filter(d => d.value > 0);

  return (
    <div className="min-h-screen bg-black">
      <TopNav user={user} />
      <div data-testid="analytics-page" className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-16">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => navigate('/dashboard')} className="text-zinc-500 hover:text-white transition-colors p-1"
            data-testid="back-to-dashboard">
            <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
          </button>
          <div>
            <h1 className="font-heading font-extrabold text-white text-4xl sm:text-5xl uppercase tracking-tight">Analytics</h1>
            <p className="text-zinc-500 font-body mt-1 text-base">Business performance overview</p>
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
          <MetricCard icon={Users} label="Active Members" value={metrics.total_active_members} color="red" />
          <MetricCard icon={UserPlus} label="New This Month" value={metrics.new_members_this_month} color="emerald" />
          <MetricCard icon={GraduationCap} label="Instructors" value={metrics.total_instructors} color="blue" />
          <MetricCard icon={BookOpen} label="Programs" value={metrics.total_programs} color="amber" />
          <MetricCard icon={Calendar} label="Active Schedules" value={metrics.total_active_schedules} color="red" />
        </div>

        {/* Second Row Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <MetricCard icon={DollarSign} label="Monthly Payroll" 
            value={`${metrics.monthly_payroll?.toLocaleString() || 0} AED`} color="amber" />
          <MetricCard icon={DollarSign} label="Monthly Expenses" 
            value={`${metrics.monthly_expenses?.toLocaleString() || 0} AED`} color="red" />
          <MetricCard icon={Activity} label="Attendance Rate" 
            value={`${metrics.attendance_rate}%`} 
            sub={`${metrics.total_bookings} total bookings`} color="emerald" />
          <MetricCard icon={Building2} label="Locations" 
            value={metrics.total_locations} color="blue" />
        </div>

        {/* Member Statistics Section */}
        <div className="mb-8">
          <h2 className="font-heading font-bold text-white text-lg uppercase tracking-wider mb-4 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-red-500" />
            Member Statistics
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <MetricCard icon={Users} label="Total Members" 
              value={metrics.total_registered_members || 0} color="red" />
            <MetricCard icon={UserCheck} label="Active Members" 
              value={metrics.active_registered_members || 0} color="emerald" />
            <MetricCard icon={UserX} label="Inactive Members" 
              value={metrics.inactive_registered_members || 0} color="amber" />
            <MetricCard icon={CreditCard} label="Active Memberships" 
              value={metrics.active_memberships || 0} color="blue" />
            <MetricCard icon={Clock} label="Pending Memberships" 
              value={metrics.pending_memberships || 0} color="amber" />
            <MetricCard icon={DollarSign} label="Member Revenue" 
              value={`${(metrics.total_member_revenue || 0).toLocaleString()} AED`} color="emerald" />
          </div>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <ChartCard title="Members Growth (Last 6 Months)" testId="chart-members-growth">
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={members_growth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="month" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={{ stroke: '#27272a' }} />
                  <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={{ stroke: '#27272a' }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="members" stroke={CHART_RED} strokeWidth={2.5} dot={{ fill: CHART_RED, r: 4 }} name="New Members" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Revenue by Month" testId="chart-revenue-by-month">
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenue_by_month}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="month" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={{ stroke: '#27272a' }} />
                  <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={{ stroke: '#27272a' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="payroll" fill={CHART_RED} name="Payroll" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="expenses" fill={CHART_ZINC} name="Expenses" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <ChartCard title="Attendance by Program" testId="chart-attendance-by-program">
            {attendance_by_program.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-zinc-600 text-sm">No attendance data yet</div>
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={attendance_by_program} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={{ stroke: '#27272a' }} />
                    <YAxis dataKey="program" type="category" tick={{ fill: '#a1a1aa', fontSize: 10 }} width={140} axisLine={{ stroke: '#27272a' }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="attendance" name="Attendance" radius={[0, 2, 2, 0]}>
                      {attendance_by_program.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>

          <ChartCard title="Top 5 Programs by Enrollment" testId="chart-top-programs">
            {top_programs.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-zinc-600 text-sm">No enrollment data yet</div>
            ) : (
              <div className="space-y-3">
                {top_programs.map((p, i) => (
                  <div key={i} data-testid={`top-program-${i}`} className="flex items-center gap-3">
                    <span className="text-zinc-600 font-heading font-bold text-sm w-6 text-right">{i + 1}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-zinc-300 text-sm font-body truncate">{p.program}</span>
                        <span className="text-white font-heading font-bold text-sm ml-2">{p.enrollments}</span>
                      </div>
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" 
                          style={{ 
                            width: `${(p.enrollments / (top_programs[0]?.enrollments || 1)) * 100}%`,
                            backgroundColor: COLORS[i] 
                          }} 
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ChartCard>
        </div>

        {/* Location Breakdown */}
        {location_stats.length > 0 && (
          <ChartCard title="Location Breakdown" testId="location-breakdown">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-3 px-4 text-zinc-500 font-heading uppercase tracking-wider text-xs">Location</th>
                    <th className="text-center py-3 px-4 text-zinc-500 font-heading uppercase tracking-wider text-xs">Members</th>
                    <th className="text-center py-3 px-4 text-zinc-500 font-heading uppercase tracking-wider text-xs">Staff</th>
                    <th className="text-center py-3 px-4 text-zinc-500 font-heading uppercase tracking-wider text-xs">Programs</th>
                  </tr>
                </thead>
                <tbody>
                  {location_stats.map((loc, i) => (
                    <tr key={i} data-testid={`location-stat-${i}`} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                      <td className="py-3 px-4 text-white font-body text-sm">{loc.name}</td>
                      <td className="py-3 px-4 text-center text-zinc-300 font-heading font-bold text-sm">{loc.members}</td>
                      <td className="py-3 px-4 text-center text-zinc-300 font-heading font-bold text-sm">{loc.staff}</td>
                      <td className="py-3 px-4 text-center text-zinc-300 font-heading font-bold text-sm">{loc.programs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        )}

        {/* Member Location Breakdown */}
        {member_location_stats && member_location_stats.length > 0 && (
          <ChartCard title="Members by Location" testId="member-location-breakdown">
            <div className="overflow-x-auto mt-4">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-3 px-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Location</th>
                    <th className="text-center py-3 px-2 text-zinc-500 font-heading uppercase tracking-wider text-xs">Total</th>
                    <th className="text-center py-3 px-2 text-zinc-500 font-heading uppercase tracking-wider text-xs">Active</th>
                    <th className="text-center py-3 px-2 text-zinc-500 font-heading uppercase tracking-wider text-xs">Inactive</th>
                    <th className="text-center py-3 px-2 text-zinc-500 font-heading uppercase tracking-wider text-xs">Active Plans</th>
                    <th className="text-center py-3 px-2 text-zinc-500 font-heading uppercase tracking-wider text-xs">Expired</th>
                    <th className="text-center py-3 px-2 text-zinc-500 font-heading uppercase tracking-wider text-xs">Pending</th>
                    <th className="text-right py-3 px-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {member_location_stats.map((loc, i) => (
                    <tr key={i} data-testid={`member-location-stat-${i}`} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                      <td className="py-3 px-3 text-white font-body text-sm">{loc.location_name}</td>
                      <td className="py-3 px-2 text-center text-zinc-300 font-heading font-bold text-sm">{loc.total_members}</td>
                      <td className="py-3 px-2 text-center text-emerald-400 font-heading font-bold text-sm">{loc.active_members}</td>
                      <td className="py-3 px-2 text-center text-amber-400 font-heading font-bold text-sm">{loc.inactive_members}</td>
                      <td className="py-3 px-2 text-center text-blue-400 font-heading font-bold text-sm">{loc.active_memberships}</td>
                      <td className="py-3 px-2 text-center text-red-400 font-heading font-bold text-sm">{loc.expired_memberships}</td>
                      <td className="py-3 px-2 text-center text-amber-400 font-heading font-bold text-sm">{loc.pending_memberships}</td>
                      <td className="py-3 px-3 text-right text-emerald-400 font-heading font-bold text-sm">{(loc.revenue || 0).toLocaleString()} AED</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-zinc-700 bg-zinc-800/30">
                    <td className="py-3 px-3 text-white font-heading font-bold text-sm">TOTAL</td>
                    <td className="py-3 px-2 text-center text-white font-heading font-bold text-sm">
                      {member_location_stats.reduce((acc, loc) => acc + loc.total_members, 0)}
                    </td>
                    <td className="py-3 px-2 text-center text-emerald-400 font-heading font-bold text-sm">
                      {member_location_stats.reduce((acc, loc) => acc + loc.active_members, 0)}
                    </td>
                    <td className="py-3 px-2 text-center text-amber-400 font-heading font-bold text-sm">
                      {member_location_stats.reduce((acc, loc) => acc + loc.inactive_members, 0)}
                    </td>
                    <td className="py-3 px-2 text-center text-blue-400 font-heading font-bold text-sm">
                      {member_location_stats.reduce((acc, loc) => acc + loc.active_memberships, 0)}
                    </td>
                    <td className="py-3 px-2 text-center text-red-400 font-heading font-bold text-sm">
                      {member_location_stats.reduce((acc, loc) => acc + loc.expired_memberships, 0)}
                    </td>
                    <td className="py-3 px-2 text-center text-amber-400 font-heading font-bold text-sm">
                      {member_location_stats.reduce((acc, loc) => acc + loc.pending_memberships, 0)}
                    </td>
                    <td className="py-3 px-3 text-right text-emerald-400 font-heading font-bold text-sm">
                      {member_location_stats.reduce((acc, loc) => acc + (loc.revenue || 0), 0).toLocaleString()} AED
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </ChartCard>
        )}
      </div>
    </div>
  );
}
