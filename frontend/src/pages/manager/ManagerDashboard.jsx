import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ManagerLayout from '@/components/ManagerLayout';
import { managerAPI } from '@/lib/api';
import { LayoutDashboard, Layers, BookOpen, Users, Calendar, ClipboardCheck } from 'lucide-react';

export default function ManagerDashboard() {
  return (
    <ManagerLayout activePage="overview">
      {({ user, location }) => <DashboardContent user={user} location={location} />}
    </ManagerLayout>
  );
}

function DashboardContent({ user, location }) {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    managerAPI.getStats().then(r => setStats(r.data)).catch(() => {});
  }, []);

  const statCards = stats ? [
    { label: 'Active Programs', value: stats.total_programs, icon: BookOpen, color: 'text-red-500' },
    { label: 'Categories', value: stats.active_categories, icon: Layers, color: 'text-amber-400' },
    { label: 'Instructors', value: stats.active_instructors, icon: Users, color: 'text-emerald-400' },
    { label: 'Classes This Week', value: stats.classes_this_week, icon: Calendar, color: 'text-blue-400' },
    { label: 'Active Customers', value: stats.total_customers, icon: Users, color: 'text-zinc-300' },
  ] : [];

  const quickActions = [
    { label: 'Add Category', icon: Layers, path: '/manager/categories', color: 'bg-amber-600/10 text-amber-400 border-amber-600/20', requiredRoles: ['LOCATION_MANAGER', 'MANAGER_FULL', 'MANAGER_OPS'] },
    { label: 'Add Program', icon: BookOpen, path: '/manager/programs', color: 'bg-red-600/10 text-red-400 border-red-600/20' },
    { label: 'View Schedule', icon: Calendar, path: '/manager/schedule', color: 'bg-blue-600/10 text-blue-400 border-blue-600/20' },
    { label: 'Mark Attendance', icon: ClipboardCheck, path: '/manager/attendance', color: 'bg-emerald-600/10 text-emerald-400 border-emerald-600/20' },
  ].filter(action => !action.requiredRoles || action.requiredRoles.includes(user?.role));

  return (
    <div data-testid="manager-dashboard" className="p-6 sm:p-8 lg:p-10 max-w-[1200px]">
      <div className="mb-10">
        <h1 className="font-heading font-extrabold text-white text-4xl sm:text-5xl uppercase tracking-tight">
          Overview
        </h1>
        <p className="text-zinc-500 font-body mt-2 text-base">
          Welcome back, {user?.name} — {location?.name}
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div data-testid="manager-stats-grid" className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-10">
          {statCards.map((stat, i) => (
            <div
              key={stat.label}
              data-testid={`manager-stat-${stat.label.toLowerCase().replace(/\s/g, '-')}`}
              className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-sm opacity-0 animate-fade-in-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">{stat.label}</span>
                <stat.icon className={`w-4 h-4 ${stat.color}`} strokeWidth={1.5} />
              </div>
              <p className={`font-heading font-extrabold text-2xl ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Quick Actions */}
      <h2 className="font-heading font-bold text-white text-lg uppercase tracking-wider mb-4">Quick Actions</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {quickActions.map((action) => (
          <button
            key={action.label}
            data-testid={`quick-action-${action.label.toLowerCase().replace(/\s/g, '-')}`}
            onClick={() => navigate(action.path)}
            className={`border rounded-sm p-5 text-left transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${action.color}`}
          >
            <action.icon className="w-6 h-6 mb-3" strokeWidth={1.5} />
            <p className="font-heading font-bold uppercase tracking-wider text-sm">{action.label}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
