import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerLayout from '@/components/CustomerLayout';
import { customerAPI } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, BookOpen, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function CustomerHome() {
  return (
    <CustomerLayout>
      {({ user, location }) => <HomeContent user={user} location={location} />}
    </CustomerLayout>
  );
}

function HomeContent({ user, location }) {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    customerAPI.dashboard().then(r => setDashboard(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleCancel = async (bookingId) => {
    try {
      await customerAPI.cancelBooking(bookingId);
      toast.success('Booking cancelled');
      const r = await customerAPI.dashboard();
      setDashboard(r.data);
    } catch (err) { toast.error(err.response?.data?.detail || 'Cancel failed'); }
  };

  const firstName = user?.first_name || user?.name?.split(' ')[0] || 'Fighter';

  return (
    <div data-testid="customer-home" className="px-4 sm:px-6 lg:px-12 py-8 max-w-[1200px] mx-auto">
      <div className="mb-10">
        <h1 className="font-heading font-extrabold text-white text-4xl sm:text-5xl uppercase tracking-tight">
          Welcome, {firstName}
        </h1>
        <p className="text-zinc-500 font-body mt-2 text-base">{location?.name}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : dashboard && (
        <>
          {/* Stats */}
          <div data-testid="customer-stats" className="grid grid-cols-3 gap-4 mb-10">
            {[
              { label: 'Upcoming Classes', value: dashboard.upcoming_bookings_count, icon: Calendar, color: 'text-red-500' },
              { label: 'Attended This Month', value: dashboard.attended_this_month, icon: Clock, color: 'text-emerald-400' },
              { label: 'Total Attended', value: dashboard.total_attended, icon: BookOpen, color: 'text-zinc-300' },
            ].map((s, i) => (
              <div key={s.label} className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-sm opacity-0 animate-fade-in-up" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">{s.label}</span>
                  <s.icon className={`w-4 h-4 ${s.color}`} strokeWidth={1.5} />
                </div>
                <p className={`font-heading font-extrabold text-3xl ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Upcoming Bookings */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-bold text-white text-lg uppercase tracking-wider">Upcoming Classes</h2>
            <button data-testid="view-all-bookings-btn" onClick={() => navigate('/customer/classes')}
              className="text-red-500 text-xs font-heading uppercase tracking-wider hover:text-red-400 transition-colors">View All</button>
          </div>

          {dashboard.next_bookings.length === 0 ? (
            <div className="border border-dashed border-zinc-800 rounded-sm p-12 text-center">
              <Calendar className="w-10 h-10 text-zinc-700 mx-auto mb-3" strokeWidth={1} />
              <p className="text-zinc-500 font-heading uppercase tracking-wider text-sm mb-4">No upcoming classes</p>
              <button onClick={() => navigate('/customer/schedule')}
                className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-5 py-2 rounded-sm text-sm transition-all">
                Book a Class
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {dashboard.next_bookings.map((b, i) => (
                <div key={b.booking_id} data-testid={`upcoming-booking-${b.booking_id}`}
                  className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-5 flex items-center justify-between gap-4 hover:border-zinc-700 transition-colors opacity-0 animate-fade-in-up"
                  style={{ animationDelay: `${i * 80 + 200}ms` }}>
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-12 h-12 bg-red-600/10 rounded-sm flex items-center justify-center shrink-0">
                      <BookOpen className="w-5 h-5 text-red-500" strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-body font-medium text-sm">{b.program_name}</p>
                      <p className="text-zinc-500 text-xs mt-0.5">
                        {new Date(b.session_start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        {' '}{b.session_start.split('T')[1]?.slice(0, 5)} — {b.instructor_name}
                        {b.room ? ` | ${b.room}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className="bg-emerald-500/20 text-emerald-400 rounded-sm font-heading uppercase text-[10px] border-0">Booked</Badge>
                    <button data-testid={`cancel-booking-${b.booking_id}`} onClick={() => handleCancel(b.booking_id)}
                      className="text-zinc-500 hover:text-red-400 transition-colors p-1" title="Cancel">
                      <XCircle className="w-4 h-4" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-4 mt-10">
            <button data-testid="quick-book-btn" onClick={() => navigate('/customer/schedule')}
              className="bg-red-600/10 border border-red-600/20 text-red-400 rounded-sm p-5 text-left hover:bg-red-600/15 transition-all">
              <Calendar className="w-6 h-6 mb-2" strokeWidth={1.5} />
              <p className="font-heading font-bold uppercase tracking-wider text-sm">Book a Class</p>
              <p className="text-zinc-500 text-xs mt-1 font-body">View schedule & book sessions</p>
            </button>
            <button data-testid="quick-programs-btn" onClick={() => navigate('/customer/programs')}
              className="bg-zinc-900/50 border border-zinc-800 text-zinc-300 rounded-sm p-5 text-left hover:bg-zinc-900 transition-all">
              <BookOpen className="w-6 h-6 mb-2" strokeWidth={1.5} />
              <p className="font-heading font-bold uppercase tracking-wider text-sm">Browse Programs</p>
              <p className="text-zinc-500 text-xs mt-1 font-body">Explore all martial arts programs</p>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
