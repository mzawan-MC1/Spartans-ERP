import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import CustomerLayout from '@/components/CustomerLayout';
import { customerAPI } from '@/lib/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Calendar, Clock, User, MapPin, Check, XCircle, Loader2 } from 'lucide-react';

export default function CustomerSchedule() {
  return (
    <CustomerLayout>
      {() => <ScheduleContent />}
    </CustomerLayout>
  );
}

function ScheduleContent() {
  const [searchParams] = useSearchParams();
  const [sessions, setSessions] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState(searchParams.get('program') || '');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
  );
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(null);
  const [cancelling, setCancelling] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, pRes] = await Promise.all([
        customerAPI.sessions(startDate, endDate, selectedProgram || null),
        customerAPI.programs(),
      ]);
      setSessions(sRes.data);
      setPrograms(pRes.data);
    } catch {} finally { setLoading(false); }
  }, [startDate, endDate, selectedProgram]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleBook = async (sessionId) => {
    setBooking(sessionId);
    try {
      await customerAPI.createBooking({ session_id: sessionId });
      toast.success('Class booked!');
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Booking failed'); }
    finally { setBooking(null); }
  };

  const handleCancel = async (bookingId) => {
    setCancelling(bookingId);
    try {
      await customerAPI.cancelBooking(bookingId);
      toast.success('Booking cancelled');
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Cancel failed'); }
    finally { setCancelling(null); }
  };

  // Group by date
  const grouped = {};
  sessions.forEach(s => {
    const d = s.start_date_time.split('T')[0];
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(s);
  });
  const dates = Object.keys(grouped).sort();

  return (
    <div data-testid="customer-schedule-page" className="px-4 sm:px-6 lg:px-12 py-8 max-w-[1200px] mx-auto">
      <div className="mb-8">
        <h1 className="font-heading font-extrabold text-white text-4xl sm:text-5xl uppercase tracking-tight">Schedule & Book</h1>
        <p className="text-zinc-500 font-body mt-2 text-base">View upcoming sessions and book your spot</p>
      </div>

      {/* Filters */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-5 mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">From</Label>
            <Input data-testid="schedule-start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="bg-zinc-950 border-zinc-800 focus:border-red-600 rounded-sm text-white h-10" />
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">To</Label>
            <Input data-testid="schedule-end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="bg-zinc-950 border-zinc-800 focus:border-red-600 rounded-sm text-white h-10" />
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Program</Label>
            <Select value={selectedProgram} onValueChange={(v) => setSelectedProgram(v === 'all' ? '' : v)}>
              <SelectTrigger data-testid="schedule-program-filter" className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-10"><SelectValue placeholder="All Programs" /></SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                <SelectItem value="all" className="text-zinc-300 focus:bg-zinc-800 focus:text-white">All Programs</SelectItem>
                {programs.map(p => (
                  <SelectItem key={p.program_id} value={p.program_id} className="text-zinc-300 focus:bg-zinc-800 focus:text-white">{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Sessions */}
      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : dates.length === 0 ? (
        <div className="border border-dashed border-zinc-800 rounded-sm p-16 text-center">
          <Calendar className="w-10 h-10 text-zinc-700 mx-auto mb-3" strokeWidth={1} />
          <p className="text-zinc-500 font-heading uppercase tracking-wider text-sm">No sessions found for this period</p>
        </div>
      ) : (
        <div className="space-y-8">
          {dates.map(d => (
            <div key={d}>
              <h3 className="font-heading font-bold text-white text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                {new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </h3>
              <div className="space-y-2">
                {grouped[d].map(s => (
                  <div key={s.session_id} data-testid={`session-row-${s.session_id}`}
                    className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-4 flex items-center justify-between gap-4 hover:border-zinc-700 transition-colors">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-red-500 shrink-0 w-28">
                        <Clock className="w-3.5 h-3.5" strokeWidth={1.5} />
                        <span className="font-heading font-bold text-sm">
                          {s.start_date_time.split('T')[1]?.slice(0, 5)} - {s.end_date_time.split('T')[1]?.slice(0, 5)}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-white font-body text-sm font-medium truncate">{s.program_name}</p>
                        <p className="text-zinc-500 text-xs">
                          <span className="inline-flex items-center gap-1"><User className="w-3 h-3" strokeWidth={1.5} />{s.instructor_name}</span>
                          {s.room && <span className="ml-2 inline-flex items-center gap-1"><MapPin className="w-3 h-3" strokeWidth={1.5} />{s.room}</span>}
                        </p>
                      </div>
                      <div className="text-zinc-600 text-xs hidden sm:block">
                        {s.booked_count} booked
                      </div>
                    </div>
                    <div className="shrink-0">
                      {s.is_booked ? (
                        <div className="flex items-center gap-2">
                          <Badge className="bg-emerald-500/20 text-emerald-400 rounded-sm font-heading uppercase text-[10px] border-0">
                            <Check className="w-3 h-3 mr-0.5" /> Booked
                          </Badge>
                          <button data-testid={`cancel-session-${s.session_id}`}
                            onClick={() => handleCancel(s.my_booking_id)}
                            disabled={cancelling === s.my_booking_id}
                            className="text-zinc-500 hover:text-red-400 transition-colors p-1">
                            {cancelling === s.my_booking_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" strokeWidth={1.5} />}
                          </button>
                        </div>
                      ) : (
                        <button data-testid={`book-session-${s.session_id}`}
                          onClick={() => handleBook(s.session_id)}
                          disabled={booking === s.session_id}
                          className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-1.5 rounded-sm text-xs transition-all disabled:opacity-50 flex items-center gap-1.5">
                          {booking === s.session_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calendar className="w-3.5 h-3.5" strokeWidth={1.5} />}
                          Book
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
