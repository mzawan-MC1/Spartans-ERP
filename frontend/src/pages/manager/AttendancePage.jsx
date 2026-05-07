import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ManagerLayout from '@/components/ManagerLayout';
import { attendanceAPI, sessionAPI, programAPI, locationAPI } from '@/lib/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Save, CheckCircle2, XCircle, Clock, AlertCircle, BookOpen, ArrowRight, Plus } from 'lucide-react';

export default function AttendancePage() {
  return (
    <ManagerLayout activePage="attendance">
      {({ location }) => <AttendanceContent location={location} />}
    </ManagerLayout>
  );
}

const STATUS_CONFIG = {
  present: { label: 'Present', icon: CheckCircle2, color: 'bg-emerald-600 text-white', ring: 'ring-emerald-600' },
  absent: { label: 'Absent', icon: XCircle, color: 'bg-red-600 text-white', ring: 'ring-red-600' },
  late: { label: 'Late', icon: Clock, color: 'bg-amber-600 text-white', ring: 'ring-amber-600' },
};

function AttendanceContent({ location }) {
  const navigate = useNavigate();
  const [programs, setPrograms] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [existingRecords, setExistingRecords] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState('');
  const [selectedSession, setSelectedSession] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [records, setRecords] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchPrograms = useCallback(async () => {
    try {
      const res = await programAPI.list();
      setPrograms(res.data.filter(p => p.is_active));
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPrograms(); }, [fetchPrograms]);

  useEffect(() => {
    if (!selectedProgram || !selectedDate) { setSessions([]); return; }
    const fetchSessions = async () => {
      try {
        const res = await sessionAPI.list(null, { program_id: selectedProgram, date_from: selectedDate, date_to: selectedDate });
        setSessions(res.data);
      } catch { setSessions([]); }
    };
    fetchSessions();
  }, [selectedProgram, selectedDate]);

  useEffect(() => {
    if (!selectedSession || !location) { setCustomers([]); setExistingRecords([]); return; }
    const fetchCustomers = async () => {
      try {
        const [custRes, attRes] = await Promise.all([
          locationAPI.getUsers(location.location_id),
          attendanceAPI.list(null, { session_id: selectedSession }),
        ]);
        const custs = custRes.data.filter(u => u.role === 'CUSTOMER');
        setCustomers(custs);
        setExistingRecords(attRes.data);
        const initial = {};
        custs.forEach(c => {
          const existing = attRes.data.find(r => r.customer_id === c.user_id);
          initial[c.user_id] = existing ? existing.status : 'present';
        });
        setRecords(initial);
      } catch { setCustomers([]); }
    };
    fetchCustomers();
  }, [selectedSession, location]);

  const handleStatusChange = (customerId, status) => {
    setRecords(prev => ({ ...prev, [customerId]: status }));
  };

  const handleSave = async () => {
    if (!selectedSession) { toast.error('Select a session first'); return; }
    const entries = Object.entries(records).map(([customer_id, status]) => ({ customer_id, status }));
    if (entries.length === 0) { toast.error('No students to mark'); return; }
    setSaving(true);
    try {
      await attendanceAPI.save({ session_id: selectedSession, records: entries });
      toast.success('Attendance saved');
    } catch (err) { toast.error(err.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <div data-testid="attendance-page" className="p-6 sm:p-8 lg:p-10 max-w-[1200px]">
      <div className="mb-8">
        <h1 className="font-heading font-extrabold text-white text-4xl sm:text-5xl uppercase tracking-tight">Attendance</h1>
        <p className="text-zinc-500 font-body mt-1 text-base">Mark class attendance</p>
      </div>

      {/* Step 1: Select */}
      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : programs.length === 0 ? (
        /* No programs */
        <div data-testid="no-programs-state" className="border border-dashed border-zinc-800 rounded-sm p-16 text-center">
          <BookOpen className="w-12 h-12 text-zinc-700 mx-auto mb-4" strokeWidth={1.5} />
          <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wider mb-2">No Programs Yet</h3>
          <p className="text-zinc-500 font-body text-sm mb-6 max-w-md mx-auto">
            Create programs and schedule classes before marking attendance.
          </p>
          <button
            data-testid="go-to-programs-btn"
            onClick={() => navigate('/manager/programs')}
            className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-6 py-2 rounded-sm text-sm transition-all active:scale-95 inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} /> Create Program
            <ArrowRight className="w-4 h-4 ml-1" strokeWidth={1.5} />
          </button>
        </div>
      ) : (
        <>
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-6 mb-8">
            <h2 className="font-heading font-bold text-white text-sm uppercase tracking-wider mb-4">Step 1: Select Class</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Date</Label>
                <Input data-testid="attendance-date-input" type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-zinc-950 border-zinc-800 focus:border-red-600 rounded-sm text-white h-10" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Program</Label>
                <Select value={selectedProgram} onValueChange={(v) => { setSelectedProgram(v); setSelectedSession(''); }}>
                  <SelectTrigger data-testid="attendance-program-select" className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-10"><SelectValue placeholder="Select program" /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {programs.map(p => (<SelectItem key={p.program_id} value={p.program_id} className="text-zinc-300 focus:bg-zinc-800 focus:text-white">{p.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Session</Label>
                <Select value={selectedSession} onValueChange={setSelectedSession}>
                  <SelectTrigger data-testid="attendance-session-select" className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-10"><SelectValue placeholder="Select session" /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {sessions.length === 0 ? (
                      <SelectItem value="none" disabled className="text-zinc-500">No sessions for this date</SelectItem>
                    ) : sessions.map(s => (
                      <SelectItem key={s.session_id} value={s.session_id} className="text-zinc-300 focus:bg-zinc-800 focus:text-white">
                        {s.start_date_time.split('T')[1]?.slice(0,5)} - {s.end_date_time.split('T')[1]?.slice(0,5)} ({s.status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Step 2: Mark Attendance */}
          {selectedSession && (
            <div data-testid="attendance-marking-section" className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-heading font-bold text-white text-sm uppercase tracking-wider">
                  Step 2: Mark Attendance ({customers.length} students)
                </h2>
                <button data-testid="save-attendance-btn" onClick={handleSave} disabled={saving}
                  className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm transition-all disabled:opacity-50 flex items-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" strokeWidth={1.5} />} Save Attendance
                </button>
              </div>

              {customers.length === 0 ? (
                <div className="text-center py-10">
                  <AlertCircle className="w-8 h-8 text-zinc-700 mx-auto mb-2" strokeWidth={1.5} />
                  <p className="text-zinc-500 text-sm font-body">No customers found for this location</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {customers.map((cust) => (
                    <div key={cust.user_id} data-testid={`attendance-row-${cust.user_id}`}
                      className="flex items-center justify-between p-3 bg-zinc-950/50 border border-zinc-800/50 rounded-sm hover:bg-zinc-900/30 transition-colors">
                      <div>
                        <p className="text-white font-body text-sm">{cust.name}</p>
                        <p className="text-zinc-600 text-xs">{cust.email}</p>
                      </div>
                      <div className="flex gap-2">
                        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                          <button
                            key={key}
                            data-testid={`mark-${key}-${cust.user_id}`}
                            onClick={() => handleStatusChange(cust.user_id, key)}
                            className={`px-3 py-1.5 rounded-sm text-xs font-heading uppercase tracking-wider transition-all ${
                              records[cust.user_id] === key
                                ? `${cfg.color} ring-1 ${cfg.ring}`
                                : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                            }`}
                          >
                            {cfg.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
