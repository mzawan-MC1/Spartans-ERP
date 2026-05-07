import { useState, useEffect } from 'react';
import CustomerLayout from '@/components/CustomerLayout';
import { customerAPI } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Calendar, Clock, User, MapPin, XCircle, Loader2, BookOpen } from 'lucide-react';

export default function CustomerClasses() {
  return (
    <CustomerLayout>
      {() => <ClassesContent />}
    </CustomerLayout>
  );
}

function ClassesContent() {
  const [tab, setTab] = useState('upcoming');
  const [upcoming, setUpcoming] = useState([]);
  const [past, setPast] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [uRes, pRes] = await Promise.all([
        customerAPI.upcomingBookings(),
        customerAPI.bookings({ status: 'CANCELLED' }),
      ]);
      setUpcoming(uRes.data);
      // Get past completed/cancelled
      const allRes = await customerAPI.bookings();
      const now = new Date().toISOString();
      setPast(allRes.data.filter(b => b.session_start < now || b.status === 'CANCELLED'));
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCancel = async (bookingId) => {
    setCancelling(bookingId);
    try {
      await customerAPI.cancelBooking(bookingId);
      toast.success('Booking cancelled');
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Cancel failed'); }
    finally { setCancelling(null); }
  };

  const statusBadge = (status) => {
    const map = {
      BOOKED: 'bg-emerald-500/20 text-emerald-400',
      CANCELLED: 'bg-zinc-700/50 text-zinc-400',
      ATTENDED: 'bg-blue-500/20 text-blue-400',
      NO_SHOW: 'bg-red-500/20 text-red-400',
    };
    return map[status] || 'bg-zinc-800 text-zinc-400';
  };

  const renderBooking = (b, showCancel = false) => (
    <div key={b.booking_id} data-testid={`booking-item-${b.booking_id}`}
      className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-5 flex items-center justify-between gap-4 hover:border-zinc-700 transition-colors">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className="w-12 h-12 bg-red-600/10 rounded-sm flex items-center justify-center shrink-0">
          <BookOpen className="w-5 h-5 text-red-500" strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-white font-body font-medium text-sm">{b.program_name}</p>
          <p className="text-zinc-500 text-xs mt-0.5">
            {new Date(b.session_start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            {' '}{b.session_start.split('T')[1]?.slice(0, 5)}
          </p>
          <p className="text-zinc-600 text-xs mt-0.5">
            {b.instructor_name}{b.room ? ` | ${b.room}` : ''}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge className={`rounded-sm font-heading uppercase text-[10px] border-0 ${statusBadge(b.status)}`}>{b.status}</Badge>
        {showCancel && b.status === 'BOOKED' && (
          <button data-testid={`cancel-class-${b.booking_id}`} onClick={() => handleCancel(b.booking_id)}
            disabled={cancelling === b.booking_id}
            className="text-zinc-500 hover:text-red-400 transition-colors p-1">
            {cancelling === b.booking_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" strokeWidth={1.5} />}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div data-testid="customer-classes-page" className="px-4 sm:px-6 lg:px-12 py-8 max-w-[1200px] mx-auto">
      <div className="mb-8">
        <h1 className="font-heading font-extrabold text-white text-4xl sm:text-5xl uppercase tracking-tight">My Classes</h1>
        <p className="text-zinc-500 font-body mt-2 text-base">Your booked and past classes</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800 mb-8">
        {[{ key: 'upcoming', label: 'Upcoming' }, { key: 'past', label: 'Past' }].map(t => (
          <button key={t.key} data-testid={`classes-tab-${t.key}`} onClick={() => setTab(t.key)}
            className={`px-4 py-3 font-heading uppercase tracking-wider text-xs transition-all border-b-2 ${
              tab === t.key ? 'border-red-600 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}>{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {tab === 'upcoming' && (
            upcoming.length === 0 ? (
              <div className="border border-dashed border-zinc-800 rounded-sm p-12 text-center">
                <p className="text-zinc-500 font-heading uppercase tracking-wider text-sm">No upcoming classes</p>
              </div>
            ) : upcoming.map(b => renderBooking(b, true))
          )}
          {tab === 'past' && (
            past.length === 0 ? (
              <div className="border border-dashed border-zinc-800 rounded-sm p-12 text-center">
                <p className="text-zinc-500 font-heading uppercase tracking-wider text-sm">No past classes</p>
              </div>
            ) : past.map(b => renderBooking(b))
          )}
        </div>
      )}
    </div>
  );
}
