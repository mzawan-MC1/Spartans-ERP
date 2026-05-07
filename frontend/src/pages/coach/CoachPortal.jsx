import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Calendar, ClipboardCheck, FileText, LogOut, User } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authAPI, coachAPI, disciplineRequestsAPI } from '@/lib/api';

export default function CoachPortal() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('schedule');
  const [profile, setProfile] = useState(null);
  const [schedule, setSchedule] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [roster, setRoster] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [requests, setRequests] = useState([]);
  const [performance, setPerformance] = useState(null);
  const [disciplines, setDisciplines] = useState([]);
  const [branchCategories, setBranchCategories] = useState([]);
  const [supervisorCategoryId, setSupervisorCategoryId] = useState('');
  const [supervisorPrograms, setSupervisorPrograms] = useState([]);
  const [supervisorSchedules, setSupervisorSchedules] = useState([]);
  const [supervisorCoaches, setSupervisorCoaches] = useState([]);
  const [supervisorInbox, setSupervisorInbox] = useState([]);
  const [supervisorPerf, setSupervisorPerf] = useState(null);
  const [supervisorLoading, setSupervisorLoading] = useState(false);
  const [supervisorDecisionLoading, setSupervisorDecisionLoading] = useState(false);
  const [supervisorProgramDialog, setSupervisorProgramDialog] = useState({ open: false, mode: 'create', program: null });
  const [supervisorProgramForm, setSupervisorProgramForm] = useState({ name: '', description: '', capacity: '20', difficulty_level: 'beginner', is_active: true });
  const [supervisorScheduleDialog, setSupervisorScheduleDialog] = useState({ open: false, mode: 'create', schedule: null });
  const [supervisorScheduleForm, setSupervisorScheduleForm] = useState({ program_id: '', instructor_id: '', day_of_week: '0', start_time: '', end_time: '', room: '' });
  const [requestDialog, setRequestDialog] = useState({ open: false, type: 'LEAVE_REQUEST' });
  const [requestNote, setRequestNote] = useState('');
  const [requestTarget, setRequestTarget] = useState('manager');
  const [requestCategoryId, setRequestCategoryId] = useState('');
  const [requestScheduleId, setRequestScheduleId] = useState('');
  const [requestStartTime, setRequestStartTime] = useState('');
  const [requestEndTime, setRequestEndTime] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profRes, schRes, sesRes, perfRes, discRes, catRes, reqRes] = await Promise.all([
        coachAPI.profile(),
        coachAPI.schedule(),
        coachAPI.sessions().catch(() => ({ data: { sessions: [] } })),
        coachAPI.performance().catch(() => ({ data: null })),
        coachAPI.disciplines().catch(() => ({ data: { disciplines: [] } })),
        coachAPI.categories().catch(() => ({ data: { categories: [] } })),
        disciplineRequestsAPI.my(null).catch(() => ({ data: { requests: [] } })),
      ]);
      setProfile(profRes.data);
      setSchedule(schRes.data?.schedules || []);
      setSessions(sesRes.data?.sessions || []);
      setPerformance(perfRes.data || null);
      setDisciplines(discRes.data?.disciplines || []);
      setBranchCategories(catRes.data?.categories || []);
      setRequests(reqRes.data?.requests || []);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to load coach portal');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const logout = async () => {
    try { await authAPI.logout(); } catch {}
    localStorage.removeItem('auth_token');
    navigate('/login', { replace: true });
  };

  const instructorId = profile?.instructor?.instructor_id;
  const isSupervisor = (disciplines || []).length > 0;

  useEffect(() => {
    if (!isSupervisor) return;
    if (!supervisorCategoryId && disciplines[0]?.category_id) {
      setSupervisorCategoryId(disciplines[0].category_id);
    }
  }, [disciplines, isSupervisor, supervisorCategoryId]);

  const loadSupervisorData = useCallback(async () => {
    if (!isSupervisor || !supervisorCategoryId) return;
    setSupervisorLoading(true);
    try {
      const [pRes, sRes, cRes, inboxRes, perfRes] = await Promise.all([
        coachAPI.supervisorPrograms({ category_id: supervisorCategoryId }).catch(() => ({ data: { programs: [] } })),
        coachAPI.supervisorSchedules({ category_id: supervisorCategoryId }).catch(() => ({ data: { schedules: [] } })),
        coachAPI.supervisorCoaches({ category_id: supervisorCategoryId }).catch(() => ({ data: { coaches: [] } })),
        disciplineRequestsAPI.inbox(null, { category_id: supervisorCategoryId }).catch(() => ({ data: { requests: [] } })),
        disciplineRequestsAPI.performance(null, { category_id: supervisorCategoryId }).catch(() => ({ data: null })),
      ]);
      setSupervisorPrograms(pRes.data?.programs || []);
      setSupervisorSchedules(sRes.data?.schedules || []);
      setSupervisorCoaches(cRes.data?.coaches || []);
      setSupervisorInbox(inboxRes.data?.requests || []);
      setSupervisorPerf(perfRes.data || null);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to load supervisor data');
    } finally {
      setSupervisorLoading(false);
    }
  }, [isSupervisor, supervisorCategoryId]);

  useEffect(() => { loadSupervisorData(); }, [loadSupervisorData]);

  const loadRoster = useCallback(async (sessionId) => {
    try {
      const res = await coachAPI.sessionRoster(sessionId);
      const customers = res.data?.customers || [];
      const existing = res.data?.attendance || [];
      setRoster(customers);
      const initial = {};
      for (const c of customers) {
        const ex = existing.find(a => a.customer_id === c.user_id);
        initial[c.user_id] = ex?.status || 'present';
      }
      setAttendance(initial);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to load roster');
      setRoster([]);
      setAttendance({});
    }
  }, []);

  useEffect(() => {
    if (!selectedSessionId) return;
    loadRoster(selectedSessionId);
  }, [selectedSessionId, loadRoster]);

  const saveAttendance = async () => {
    if (!selectedSessionId) return;
    const entries = Object.entries(attendance).map(([customer_id, status]) => ({ customer_id, status }));
    if (entries.length === 0) return;
    setSavingAttendance(true);
    try {
      await coachAPI.saveAttendance({ session_id: selectedSessionId, records: entries });
      toast.success('Attendance saved');
      loadRoster(selectedSessionId);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save attendance');
    } finally {
      setSavingAttendance(false);
    }
  };

  const scheduleGrid = useMemo(() => {
    const days = [
      { key: 0, label: 'Monday' },
      { key: 1, label: 'Tuesday' },
      { key: 2, label: 'Wednesday' },
      { key: 3, label: 'Thursday' },
      { key: 4, label: 'Friday' },
      { key: 5, label: 'Saturday' },
      { key: 6, label: 'Sunday' },
    ];
    const timeSort = (t) => {
      const s = String(t || '').trim();
      const m = /^(\d{1,2}):(\d{2})/.exec(s);
      if (!m) return 9999;
      return (parseInt(m[1], 10) * 60) + parseInt(m[2], 10);
    };
    const formatTime = (t) => {
      const s = String(t || '').trim();
      const m = /^(\d{1,2}):(\d{2})/.exec(s);
      if (!m) return s;
      let hh = parseInt(m[1], 10);
      const mm = m[2];
      const ampm = hh >= 12 ? 'PM' : 'AM';
      hh = hh % 12;
      if (hh === 0) hh = 12;
      return `${String(hh).padStart(2, '0')}:${mm} ${ampm}`;
    };
    const buckets = new Map(days.map(d => [d.key, []]));
    for (const s of schedule || []) {
      const d = typeof s.day_of_week === 'number' ? s.day_of_week : parseInt(s.day_of_week, 10);
      if (!Number.isFinite(d) || d < 0 || d > 6) continue;
      buckets.get(d).push(s);
    }
    for (const d of days) {
      buckets.get(d.key).sort((a, b) => timeSort(a.start_time) - timeSort(b.start_time));
    }
    return { days, buckets, formatTime };
  }, [schedule]);

  const openRequest = (type) => {
    setRequestDialog({ open: true, type });
    setRequestNote('');
    setRequestCategoryId('');
    setRequestScheduleId('');
    setRequestStartTime('');
    setRequestEndTime('');
    setRequestTarget('manager');
  };

  const submitRequest = async () => {
    setSubmitting(true);
    try {
      const base = { request_type: requestDialog.type, target: requestTarget, note: requestNote };
      if (requestDialog.type === 'COACH_SCHEDULE_UPDATE') {
        if (!requestScheduleId) {
          toast.error('Schedule ID is required');
          return;
        }
        const payload = { schedule_id: requestScheduleId };
        if (requestStartTime) payload.start_time = requestStartTime;
        if (requestEndTime) payload.end_time = requestEndTime;
        const body = { ...base, payload };
        if (requestCategoryId) body.category_id = requestCategoryId;
        await disciplineRequestsAPI.create(body);
      } else {
        const body = { ...base, payload: {} };
        if (requestTarget === 'supervisor' || requestTarget === 'both') {
          body.category_id = requestCategoryId;
        }
        await disciplineRequestsAPI.create(body);
      }
      toast.success('Request submitted');
      setRequestDialog({ open: false, type: 'LEAVE_REQUEST' });
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const submitSupervisorDecision = async (requestId, action) => {
    setSupervisorDecisionLoading(true);
    try {
      await disciplineRequestsAPI.supervisorAct(requestId, { action, decision_note: '' }, null);
      toast.success(action === 'approve' ? 'Approved' : 'Rejected');
      loadSupervisorData();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to update request');
    } finally {
      setSupervisorDecisionLoading(false);
    }
  };

  const openSupervisorProgramDialog = (mode, program = null) => {
    setSupervisorProgramDialog({ open: true, mode, program });
    setSupervisorProgramForm({
      name: program?.name || '',
      description: program?.description || '',
      capacity: String(program?.capacity ?? '20'),
      difficulty_level: program?.difficulty_level || 'beginner',
      is_active: program?.is_active !== false,
    });
  };

  const submitSupervisorProgramRequest = async () => {
    if (!supervisorCategoryId) return;
    setSubmitting(true);
    try {
      if (supervisorProgramDialog.mode === 'create') {
        await disciplineRequestsAPI.create({
          category_id: supervisorCategoryId,
          request_type: 'PROGRAM_CREATE',
          target: 'manager',
          note: requestNote,
          payload: {
            name: supervisorProgramForm.name,
            description: supervisorProgramForm.description,
            capacity: Number(supervisorProgramForm.capacity || 20),
            difficulty_level: supervisorProgramForm.difficulty_level,
            is_active: supervisorProgramForm.is_active,
          },
        });
      } else {
        await disciplineRequestsAPI.create({
          category_id: supervisorCategoryId,
          request_type: 'PROGRAM_UPDATE',
          target: 'manager',
          note: requestNote,
          payload: {
            program_id: supervisorProgramDialog.program?.program_id,
            name: supervisorProgramForm.name,
            description: supervisorProgramForm.description,
            capacity: Number(supervisorProgramForm.capacity || 20),
            difficulty_level: supervisorProgramForm.difficulty_level,
            is_active: supervisorProgramForm.is_active,
          },
        });
      }
      toast.success('Submitted to manager for approval');
      setSupervisorProgramDialog({ open: false, mode: 'create', program: null });
      setRequestNote('');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const openSupervisorScheduleDialog = (mode, schedule = null) => {
    setSupervisorScheduleDialog({ open: true, mode, schedule });
    setSupervisorScheduleForm({
      program_id: schedule?.program_id || '',
      instructor_id: (schedule?.instructor_ids?.[0] || schedule?.instructor_id || ''),
      day_of_week: String(schedule?.day_of_week ?? '0'),
      start_time: schedule?.start_time || '',
      end_time: schedule?.end_time || '',
      room: schedule?.room || '',
    });
  };

  const submitSupervisorScheduleRequest = async () => {
    if (!supervisorCategoryId) return;
    setSubmitting(true);
    try {
      if (supervisorScheduleDialog.mode === 'create') {
        await disciplineRequestsAPI.create({
          category_id: supervisorCategoryId,
          request_type: 'SCHEDULE_CREATE',
          target: 'manager',
          note: requestNote,
          payload: {
            program_id: supervisorScheduleForm.program_id,
            instructor_ids: supervisorScheduleForm.instructor_id ? [supervisorScheduleForm.instructor_id] : [],
            day_of_week: Number(supervisorScheduleForm.day_of_week),
            start_time: supervisorScheduleForm.start_time,
            end_time: supervisorScheduleForm.end_time,
            room: supervisorScheduleForm.room,
          },
        });
      } else {
        await disciplineRequestsAPI.create({
          category_id: supervisorCategoryId,
          request_type: 'SCHEDULE_UPDATE',
          target: 'manager',
          note: requestNote,
          payload: {
            schedule_id: supervisorScheduleDialog.schedule?.schedule_id,
            day_of_week: Number(supervisorScheduleForm.day_of_week),
            start_time: supervisorScheduleForm.start_time,
            end_time: supervisorScheduleForm.end_time,
            room: supervisorScheduleForm.room,
            instructor_ids: supervisorScheduleForm.instructor_id ? [supervisorScheduleForm.instructor_id] : undefined,
          },
        });
      }
      toast.success('Submitted to manager for approval');
      setSupervisorScheduleDialog({ open: false, mode: 'create', schedule: null });
      setRequestNote('');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const submitSupervisorScheduleDelete = async (scheduleId) => {
    if (!supervisorCategoryId) return;
    setSubmitting(true);
    try {
      await disciplineRequestsAPI.create({
        category_id: supervisorCategoryId,
        request_type: 'SCHEDULE_DELETE',
        target: 'manager',
        note: '',
        payload: { schedule_id: scheduleId },
      });
      toast.success('Submitted to manager for approval');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <div className="px-6 py-5 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <div className="font-heading font-extrabold text-2xl uppercase tracking-wide">Coach Portal</div>
          <div className="text-zinc-400 text-sm">{profile?.staff?.first_name ? `${profile.staff.first_name} ${profile.staff.last_name || ''}` : (profile?.user?.name || '')}</div>
          <div className="text-zinc-600 text-xs mt-1">Employee ID: {profile?.staff?.employee_code || profile?.staff?.staff_id || '—'}</div>
          <div className="text-zinc-500 text-xs mt-1">{profile?.location?.name || '—'}</div>
        </div>
        <div className="flex items-center gap-3">
          {profile?.location?.name && (
            <Badge variant="outline" className="border-zinc-800 text-zinc-300">{profile.location.name}</Badge>
          )}
          <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => navigate('/coach/profile')}>
            <User className="h-4 w-4 mr-2" />
            Profile
          </Button>
          <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={logout}>
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>

      <div className="p-6">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="bg-zinc-900/50 border border-zinc-800 rounded-sm">
            <TabsTrigger value="schedule" className="rounded-sm">Schedule</TabsTrigger>
            <TabsTrigger value="attendance" className="rounded-sm">Attendance</TabsTrigger>
            <TabsTrigger value="requests" className="rounded-sm">Requests</TabsTrigger>
            <TabsTrigger value="profile" className="rounded-sm">Profile</TabsTrigger>
            {isSupervisor && (
              <>
                <TabsTrigger value="my-disciplines" className="rounded-sm">My Disciplines</TabsTrigger>
                <TabsTrigger value="discipline-programs" className="rounded-sm">Discipline Programs</TabsTrigger>
                <TabsTrigger value="discipline-schedule" className="rounded-sm">Discipline Schedule</TabsTrigger>
                <TabsTrigger value="coaches-under-me" className="rounded-sm">Coaches Under Me</TabsTrigger>
                <TabsTrigger value="requests-inbox" className="rounded-sm">Requests Inbox</TabsTrigger>
                <TabsTrigger value="discipline-performance" className="rounded-sm">Discipline Performance</TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="schedule" className="mt-6">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-red-500" />
                  Weekly Schedule
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <div className="min-w-[980px] grid grid-cols-7">
                  {scheduleGrid.days.map((d) => (
                    <div key={d.key} className="border-r border-zinc-800 last:border-r-0">
                      <div className="px-4 py-3 border-b border-zinc-800 text-xs font-semibold tracking-wider text-zinc-300 uppercase">
                        {d.label}
                      </div>
                      <div className="p-3 space-y-3">
                        {(scheduleGrid.buckets.get(d.key) || []).length === 0 ? (
                          <div className="text-xs text-zinc-500 italic">No classes</div>
                        ) : (
                          (scheduleGrid.buckets.get(d.key) || []).map((s) => (
                            <div key={s.schedule_id} className="bg-zinc-950 border border-zinc-800 rounded-md p-3">
                              <div className="text-xs font-semibold text-red-400">
                                {scheduleGrid.formatTime(s.start_time)} - {scheduleGrid.formatTime(s.end_time)}
                              </div>
                              <div className="text-sm font-medium text-white mt-1">
                                {s.program_name || s.program_id}
                              </div>
                              <div className="text-xs text-zinc-500 mt-1">
                                {s.room ? `Room: ${s.room}` : 'Scheduled'}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="attendance" className="mt-6">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-red-500" />
                  Mark Attendance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-sm text-zinc-400">Session</div>
                  <select
                    className="bg-zinc-950 border border-zinc-800 text-white rounded-sm px-3 py-2 text-sm"
                    value={selectedSessionId}
                    onChange={(e) => setSelectedSessionId(e.target.value)}
                  >
                    <option value="">Select session</option>
                    {sessions.map((s) => (
                      <option key={s.session_id} value={s.session_id}>
                        {(s.start_date_time || '').slice(0, 16).replace('T', ' ')} · {s.program_id}
                      </option>
                    ))}
                  </select>
                  <Button className="bg-red-600 hover:bg-red-700" onClick={saveAttendance} disabled={!selectedSessionId || savingAttendance}>
                    {savingAttendance ? 'Saving...' : 'Save'}
                  </Button>
                </div>

                {!selectedSessionId ? (
                  <div className="text-zinc-500 text-sm">Select a session to load the roster.</div>
                ) : roster.length === 0 ? (
                  <div className="text-zinc-500 text-sm">No bookings found for this session.</div>
                ) : (
                  <div className="space-y-2">
                    {roster.map((c) => (
                      <div key={c.user_id} className="border border-zinc-800 rounded-sm p-3 flex items-center justify-between">
                        <div>
                          <div className="text-white text-sm">{c.name || c.email || c.user_id}</div>
                          <div className="text-zinc-500 text-xs">{c.email || '—'}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {['present', 'late', 'absent'].map((st) => (
                            <Button
                              key={st}
                              size="sm"
                              variant={attendance[c.user_id] === st ? 'default' : 'outline'}
                              className={attendance[c.user_id] === st ? 'bg-red-600 hover:bg-red-700' : 'border-zinc-800 text-zinc-300'}
                              onClick={() => setAttendance(prev => ({ ...prev, [c.user_id]: st }))}
                            >
                              {st.toUpperCase()}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="requests" className="mt-6 space-y-4">
            <div className="flex items-center gap-2">
              <Button className="bg-red-600 hover:bg-red-700" onClick={() => openRequest('COACH_SCHEDULE_UPDATE')}>Schedule Change</Button>
              <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => openRequest('LEAVE_REQUEST')}>Leave Request</Button>
              <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => openRequest('OTHER_REQUEST')}>Other</Button>
            </div>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-red-500" />
                  My Requests
                </CardTitle>
              </CardHeader>
              <CardContent>
                {requests.length === 0 ? (
                  <div className="text-zinc-500">No requests yet.</div>
                ) : (
                  <div className="space-y-3">
                    {requests.map((r) => (
                      <div key={r.request_id} className="border border-zinc-800 rounded-sm p-4 flex items-center justify-between">
                        <div>
                          <div className="text-sm text-white">{r.request_type}</div>
                          <div className="text-xs text-zinc-500">{(r.created_at || '').slice(0, 10)} · {r.note || '—'}</div>
                        </div>
                        <Badge className={
                          r.status === 'approved' ? 'bg-green-500/20 text-green-400 border-0' :
                          r.status === 'rejected' ? 'bg-red-500/20 text-red-400 border-0' :
                          'bg-yellow-500/20 text-yellow-400 border-0'
                        }>
                          {(r.status || 'submitted').toUpperCase()}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {isSupervisor && (
            <>
              <TabsContent value="my-disciplines" className="mt-6">
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-red-500" />
                      My Disciplines
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm text-zinc-400">Select a discipline to manage.</div>
                    <div className="flex flex-wrap gap-2">
                      {(disciplines || []).map((d) => (
                        <Button
                          key={d.category_id}
                          size="sm"
                          variant={supervisorCategoryId === d.category_id ? 'default' : 'outline'}
                          className={supervisorCategoryId === d.category_id ? 'bg-red-600 hover:bg-red-700' : 'border-zinc-800 text-zinc-300'}
                          onClick={() => setSupervisorCategoryId(d.category_id)}
                        >
                          {d.name || d.category_id}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <div className="mt-6 space-y-4">
                  {!supervisorCategoryId ? (
                    <div className="text-zinc-500 text-sm">Select a discipline above to load management data.</div>
                  ) : supervisorLoading ? (
                    <div className="flex justify-center py-10"><div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div>
                  ) : (
                    <>
                      <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader>
                          <CardTitle>Discipline Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                          {(() => {
                            const selected = (disciplines || []).find(d => d.category_id === supervisorCategoryId);
                            const supervisorName = profile?.staff?.first_name ? `${profile.staff.first_name} ${profile.staff.last_name || ''}` : (profile?.user?.name || '—');
                            const status = selected?.is_active === false ? 'INACTIVE' : 'ACTIVE';
                            return (
                              <>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge className="bg-zinc-800 text-zinc-300 border-0">{selected?.name || supervisorCategoryId}</Badge>
                                  <Badge className={status === 'ACTIVE' ? 'bg-green-500/20 text-green-400 border-0' : 'bg-zinc-800 text-zinc-400 border-0'}>{status}</Badge>
                                  <Badge className="bg-zinc-800 text-zinc-300 border-0">Coaches: {supervisorCoaches.length}</Badge>
                                  <Badge className="bg-zinc-800 text-zinc-300 border-0">Programs: {supervisorPrograms.length}</Badge>
                                  <Badge className="bg-zinc-800 text-zinc-300 border-0">Schedules: {supervisorSchedules.length}</Badge>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                  <div>
                                    <div className="text-zinc-400">Branch</div>
                                    <div className="text-white">{profile?.location?.name || '—'}</div>
                                  </div>
                                  <div>
                                    <div className="text-zinc-400">Supervisor / Head Coach</div>
                                    <div className="text-white">{supervisorName}</div>
                                  </div>
                                </div>
                              </>
                            );
                          })()}
                        </CardContent>
                      </Card>

                      <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader className="flex flex-row items-center justify-between">
                          <CardTitle>Discipline Programs</CardTitle>
                          <Button className="bg-red-600 hover:bg-red-700" onClick={() => openSupervisorProgramDialog('create')}>Request Add</Button>
                        </CardHeader>
                        <CardContent>
                          {supervisorPrograms.length === 0 ? (
                            <div className="text-zinc-500">No programs for this discipline.</div>
                          ) : (
                            <div className="space-y-2">
                              {supervisorPrograms.map((p) => (
                                <div key={p.program_id} className="border border-zinc-800 rounded-sm p-4 flex items-center justify-between">
                                  <div>
                                    <div className="text-white text-sm">{p.name}</div>
                                    <div className="text-xs text-zinc-500">{p.program_id}</div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge className={p.is_active ? 'bg-green-500/20 text-green-400 border-0' : 'bg-zinc-800 text-zinc-400 border-0'}>
                                      {p.is_active ? 'ACTIVE' : 'INACTIVE'}
                                    </Badge>
                                    <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => openSupervisorProgramDialog('update', p)}>
                                      Request Change
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader className="flex flex-row items-center justify-between">
                          <CardTitle>Discipline Schedule</CardTitle>
                          <Button className="bg-red-600 hover:bg-red-700" onClick={() => openSupervisorScheduleDialog('create')}>Request Add</Button>
                        </CardHeader>
                        <CardContent>
                          {(() => {
                            const coachNameById = new Map((supervisorCoaches || []).map(c => [c.instructor_id, c.full_name || c.name || c.instructor_id]));
                            const formatCoachList = (sch) => {
                              const ids = sch?.instructor_ids || (sch?.instructor_id ? [sch.instructor_id] : []);
                              if (!ids.length) return '—';
                              return ids.map(id => coachNameById.get(id) || id).join(', ');
                            };
                            if (supervisorSchedules.length === 0) {
                              return <div className="text-zinc-500">No schedules for this discipline.</div>;
                            }
                            return (
                              <div className="space-y-2">
                                {supervisorSchedules.map((s) => (
                                  <div key={s.schedule_id} className="border border-zinc-800 rounded-sm p-4 flex items-center justify-between">
                                    <div>
                                      <div className="text-white text-sm">{s.program_name || s.program_id}</div>
                                      <div className="text-xs text-zinc-500">{s.day_of_week} · {s.start_time}-{s.end_time} · {s.room || '—'}</div>
                                      <div className="text-xs text-zinc-500 mt-1">Coaches: {formatCoachList(s)}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => openSupervisorScheduleDialog('update', s)}>
                                        Request Change
                                      </Button>
                                      <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => submitSupervisorScheduleDelete(s.schedule_id)} disabled={submitting}>
                                        Request Delete
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </CardContent>
                      </Card>

                      <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader>
                          <CardTitle>Coaches Under This Discipline</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {supervisorCoaches.length === 0 ? (
                            <div className="text-zinc-500">No coaches found for this discipline.</div>
                          ) : (
                            <div className="space-y-2">
                              {supervisorCoaches.map((c) => (
                                <div key={c.instructor_id} className="border border-zinc-800 rounded-sm p-4 flex items-center justify-between">
                                  <div>
                                    <div className="text-white text-sm">{c.full_name || c.name || c.instructor_id}</div>
                                    <div className="text-xs text-zinc-500">{c.instructor_id}</div>
                                  </div>
                                  <Badge className={c.is_active === false ? 'bg-zinc-800 text-zinc-400 border-0' : 'bg-green-500/20 text-green-400 border-0'}>
                                    {c.is_active === false ? 'INACTIVE' : 'ACTIVE'}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader>
                          <CardTitle>Discipline Requests / Actions</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {supervisorInbox.length === 0 ? (
                            <div className="text-zinc-500">No pending requests for this discipline.</div>
                          ) : (
                            <div className="space-y-2">
                              {supervisorInbox.map((r) => (
                                <div key={r.request_id} className="border border-zinc-800 rounded-sm p-4 flex items-center justify-between">
                                  <div>
                                    <div className="text-white text-sm">{r.request_type}</div>
                                    <div className="text-xs text-zinc-500">{(r.created_at || '').slice(0, 10)} · {r.note || '—'}</div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => submitSupervisorDecision(r.request_id, 'reject')} disabled={supervisorDecisionLoading}>
                                      Reject
                                    </Button>
                                    <Button className="bg-red-600 hover:bg-red-700" onClick={() => submitSupervisorDecision(r.request_id, 'approve')} disabled={supervisorDecisionLoading}>
                                      Approve
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader>
                          <CardTitle>Discipline Performance</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {!supervisorPerf ? (
                            <div className="text-zinc-500">No data.</div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <Badge className="bg-zinc-800 text-zinc-300 border-0">Programs: {supervisorPerf.programs ?? 0}</Badge>
                              <Badge className="bg-zinc-800 text-zinc-300 border-0">Sessions: {supervisorPerf.sessions ?? 0}</Badge>
                              <Badge className="bg-green-500/20 text-green-400 border-0">Present: {supervisorPerf.present ?? 0}</Badge>
                              <Badge className="bg-yellow-500/20 text-yellow-400 border-0">Late: {supervisorPerf.late ?? 0}</Badge>
                              <Badge className="bg-red-500/20 text-red-400 border-0">Absent: {supervisorPerf.absent ?? 0}</Badge>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="discipline-programs" className="mt-6">
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Discipline Programs</CardTitle>
                    <Button className="bg-red-600 hover:bg-red-700" onClick={() => openSupervisorProgramDialog('create')}>Request New Program</Button>
                  </CardHeader>
                  <CardContent>
                    {supervisorLoading ? (
                      <div className="flex justify-center py-10"><div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div>
                    ) : supervisorPrograms.length === 0 ? (
                      <div className="text-zinc-500">No programs for this discipline.</div>
                    ) : (
                      <div className="space-y-2">
                        {supervisorPrograms.map((p) => (
                          <div key={p.program_id} className="border border-zinc-800 rounded-sm p-4 flex items-center justify-between">
                            <div>
                              <div className="text-white text-sm">{p.name}</div>
                              <div className="text-xs text-zinc-500">{p.program_id}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className={p.is_active ? 'bg-green-500/20 text-green-400 border-0' : 'bg-zinc-800 text-zinc-400 border-0'}>
                                {p.is_active ? 'ACTIVE' : 'INACTIVE'}
                              </Badge>
                              <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => openSupervisorProgramDialog('update', p)}>
                                Request Edit
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="discipline-schedule" className="mt-6">
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Discipline Schedule</CardTitle>
                    <Button className="bg-red-600 hover:bg-red-700" onClick={() => openSupervisorScheduleDialog('create')}>Request New Schedule</Button>
                  </CardHeader>
                  <CardContent>
                    {supervisorLoading ? (
                      <div className="flex justify-center py-10"><div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div>
                    ) : supervisorSchedules.length === 0 ? (
                      <div className="text-zinc-500">No schedules for this discipline.</div>
                    ) : (
                      <div className="space-y-2">
                        {supervisorSchedules.map((s) => (
                          <div key={s.schedule_id} className="border border-zinc-800 rounded-sm p-4 flex items-center justify-between">
                            <div>
                              <div className="text-white text-sm">{s.program_name || s.program_id}</div>
                              <div className="text-xs text-zinc-500">{s.schedule_id} · {s.day_of_week} · {s.start_time}-{s.end_time}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => openSupervisorScheduleDialog('update', s)}>
                                Request Edit
                              </Button>
                              <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => submitSupervisorScheduleDelete(s.schedule_id)} disabled={submitting}>
                                Request Delete
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="coaches-under-me" className="mt-6">
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader>
                    <CardTitle>Coaches Under Me</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {supervisorLoading ? (
                      <div className="flex justify-center py-10"><div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div>
                    ) : supervisorCoaches.length === 0 ? (
                      <div className="text-zinc-500">No coaches found for this discipline.</div>
                    ) : (
                      <div className="space-y-2">
                        {supervisorCoaches.map((c) => (
                          <div key={c.instructor_id} className="border border-zinc-800 rounded-sm p-4 flex items-center justify-between">
                            <div>
                              <div className="text-white text-sm">{c.full_name || c.name || c.instructor_id}</div>
                              <div className="text-xs text-zinc-500">{c.instructor_id}</div>
                            </div>
                            <Badge className={c.is_active === false ? 'bg-zinc-800 text-zinc-400 border-0' : 'bg-green-500/20 text-green-400 border-0'}>
                              {c.is_active === false ? 'INACTIVE' : 'ACTIVE'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="requests-inbox" className="mt-6">
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader>
                    <CardTitle>Requests Inbox</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {supervisorLoading ? (
                      <div className="flex justify-center py-10"><div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div>
                    ) : supervisorInbox.length === 0 ? (
                      <div className="text-zinc-500">No pending requests for your disciplines.</div>
                    ) : (
                      <div className="space-y-2">
                        {supervisorInbox.map((r) => (
                          <div key={r.request_id} className="border border-zinc-800 rounded-sm p-4 flex items-center justify-between">
                            <div>
                              <div className="text-white text-sm">{r.request_type}</div>
                              <div className="text-xs text-zinc-500">{(r.created_at || '').slice(0, 10)} · {r.note || '—'}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => submitSupervisorDecision(r.request_id, 'reject')} disabled={supervisorDecisionLoading}>
                                Reject
                              </Button>
                              <Button className="bg-red-600 hover:bg-red-700" onClick={() => submitSupervisorDecision(r.request_id, 'approve')} disabled={supervisorDecisionLoading}>
                                Approve
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="discipline-performance" className="mt-6">
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader>
                    <CardTitle>Discipline Performance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {supervisorLoading ? (
                      <div className="flex justify-center py-10"><div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div>
                    ) : !supervisorPerf ? (
                      <div className="text-zinc-500">No data.</div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Badge className="bg-zinc-800 text-zinc-300 border-0">Programs: {supervisorPerf.programs ?? 0}</Badge>
                        <Badge className="bg-zinc-800 text-zinc-300 border-0">Sessions: {supervisorPerf.sessions ?? 0}</Badge>
                        <Badge className="bg-green-500/20 text-green-400 border-0">Present: {supervisorPerf.present ?? 0}</Badge>
                        <Badge className="bg-yellow-500/20 text-yellow-400 border-0">Late: {supervisorPerf.late ?? 0}</Badge>
                        <Badge className="bg-red-500/20 text-red-400 border-0">Absent: {supervisorPerf.absent ?? 0}</Badge>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </>
          )}

          <TabsContent value="profile" className="mt-6">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5 text-red-500" />
                  Profile
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="text-zinc-400">Email</div>
                <div className="text-white">{profile?.user?.email || '—'}</div>
                <div className="text-zinc-400 mt-4">Instructor ID</div>
                <div className="text-white">{profile?.instructor?.instructor_id || '—'}</div>
                <div className="text-zinc-400 mt-4">Staff ID</div>
                <div className="text-white">{profile?.staff?.staff_id || profile?.user?.staff_id || '—'}</div>
                {performance && (
                  <>
                    <div className="text-zinc-400 mt-6">Performance</div>
                    <div className="flex flex-wrap gap-2">
                      <Badge className="bg-zinc-800 text-zinc-300 border-0">Sessions: {performance.sessions ?? 0}</Badge>
                      <Badge className="bg-green-500/20 text-green-400 border-0">Present: {performance.present ?? 0}</Badge>
                      <Badge className="bg-yellow-500/20 text-yellow-400 border-0">Late: {performance.late ?? 0}</Badge>
                      <Badge className="bg-red-500/20 text-red-400 border-0">Absent: {performance.absent ?? 0}</Badge>
                    </div>
                  </>
                )}
                {disciplines.length > 0 && (
                  <>
                    <div className="text-zinc-400 mt-6">Supervised Disciplines</div>
                    <div className="flex flex-wrap gap-2">
                      {disciplines.map((d) => (
                        <Badge key={d.category_id} className="bg-zinc-800 text-zinc-300 border-0">{d.name || d.category_id}</Badge>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={requestDialog.open} onOpenChange={(open) => !open && setRequestDialog({ open: false, type: 'LEAVE_REQUEST' })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">
              {requestDialog.type === 'COACH_SCHEDULE_UPDATE' ? 'Schedule Change Request' : requestDialog.type.replace(/_/g, ' ')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Send To</Label>
              <select
                className="bg-zinc-950 border border-zinc-800 text-white rounded-sm px-3 py-2 text-sm w-full"
                value={requestTarget}
                onChange={(e) => setRequestTarget(e.target.value)}
              >
                <option value="manager">Branch Manager</option>
                <option value="supervisor">Discipline Supervisor</option>
                <option value="both">Both</option>
              </select>
            </div>
            {(requestTarget === 'supervisor' || requestTarget === 'both') && requestDialog.type !== 'COACH_SCHEDULE_UPDATE' && (
              <div className="space-y-2">
                <Label>Discipline</Label>
                <select
                  className="bg-zinc-950 border border-zinc-800 text-white rounded-sm px-3 py-2 text-sm w-full"
                  value={requestCategoryId}
                  onChange={(e) => setRequestCategoryId(e.target.value)}
                >
                  <option value="">Select discipline</option>
                  {(branchCategories || []).map((d) => (
                    <option key={d.category_id} value={d.category_id}>{d.name || d.category_id}</option>
                  ))}
                </select>
              </div>
            )}
            {requestDialog.type === 'COACH_SCHEDULE_UPDATE' && (
              <>
                <div className="space-y-2">
                  <Label>Schedule ID</Label>
                  <Input value={requestScheduleId} onChange={(e) => setRequestScheduleId(e.target.value)} className="bg-zinc-950 border-zinc-800 text-white" placeholder="sch_..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>New Start Time (HH:MM)</Label>
                    <Input value={requestStartTime} onChange={(e) => setRequestStartTime(e.target.value)} className="bg-zinc-950 border-zinc-800 text-white" placeholder="18:00" />
                  </div>
                  <div className="space-y-2">
                    <Label>New End Time (HH:MM)</Label>
                    <Input value={requestEndTime} onChange={(e) => setRequestEndTime(e.target.value)} className="bg-zinc-950 border-zinc-800 text-white" placeholder="19:30" />
                  </div>
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label>Note</Label>
              <Input value={requestNote} onChange={(e) => setRequestNote(e.target.value)} className="bg-zinc-950 border-zinc-800 text-white" placeholder="Add details..." />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => setRequestDialog({ open: false, type: 'LEAVE_REQUEST' })} disabled={submitting}>
              Cancel
            </Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={submitRequest} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={supervisorProgramDialog.open} onOpenChange={(open) => !open && setSupervisorProgramDialog({ open: false, mode: 'create', program: null })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">
              {supervisorProgramDialog.mode === 'create' ? 'Request New Program' : 'Request Program Update'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={supervisorProgramForm.name} onChange={(e) => setSupervisorProgramForm(prev => ({ ...prev, name: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={supervisorProgramForm.description} onChange={(e) => setSupervisorProgramForm(prev => ({ ...prev, description: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Capacity</Label>
                <Input value={supervisorProgramForm.capacity} onChange={(e) => setSupervisorProgramForm(prev => ({ ...prev, capacity: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white" />
              </div>
              <div className="space-y-2">
                <Label>Difficulty</Label>
                <select
                  className="bg-zinc-950 border border-zinc-800 text-white rounded-sm px-3 py-2 text-sm w-full"
                  value={supervisorProgramForm.difficulty_level}
                  onChange={(e) => setSupervisorProgramForm(prev => ({ ...prev, difficulty_level: e.target.value }))}
                >
                  {['beginner', 'intermediate', 'advanced'].map((d) => (<option key={d} value={d}>{d}</option>))}
                </select>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => setSupervisorProgramDialog({ open: false, mode: 'create', program: null })} disabled={submitting}>
              Cancel
            </Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={submitSupervisorProgramRequest} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={supervisorScheduleDialog.open} onOpenChange={(open) => !open && setSupervisorScheduleDialog({ open: false, mode: 'create', schedule: null })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">
              {supervisorScheduleDialog.mode === 'create' ? 'Request New Schedule' : 'Request Schedule Update'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Program</Label>
              <select
                className="bg-zinc-950 border border-zinc-800 text-white rounded-sm px-3 py-2 text-sm w-full"
                value={supervisorScheduleForm.program_id}
                onChange={(e) => setSupervisorScheduleForm(prev => ({ ...prev, program_id: e.target.value }))}
              >
                <option value="">Select program</option>
                {supervisorPrograms.map((p) => (<option key={p.program_id} value={p.program_id}>{p.name}</option>))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Coach</Label>
              <select
                className="bg-zinc-950 border border-zinc-800 text-white rounded-sm px-3 py-2 text-sm w-full"
                value={supervisorScheduleForm.instructor_id}
                onChange={(e) => setSupervisorScheduleForm(prev => ({ ...prev, instructor_id: e.target.value }))}
              >
                <option value="">Select coach</option>
                {supervisorCoaches.map((c) => (<option key={c.instructor_id} value={c.instructor_id}>{c.full_name || c.name || c.instructor_id}</option>))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Day</Label>
                <select
                  className="bg-zinc-950 border border-zinc-800 text-white rounded-sm px-3 py-2 text-sm w-full"
                  value={supervisorScheduleForm.day_of_week}
                  onChange={(e) => setSupervisorScheduleForm(prev => ({ ...prev, day_of_week: e.target.value }))}
                >
                  {[
                    { v: '0', n: 'Mon' }, { v: '1', n: 'Tue' }, { v: '2', n: 'Wed' }, { v: '3', n: 'Thu' }, { v: '4', n: 'Fri' }, { v: '5', n: 'Sat' }, { v: '6', n: 'Sun' },
                  ].map((d) => (<option key={d.v} value={d.v}>{d.n}</option>))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Start</Label>
                <Input value={supervisorScheduleForm.start_time} onChange={(e) => setSupervisorScheduleForm(prev => ({ ...prev, start_time: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white" placeholder="18:00" />
              </div>
              <div className="space-y-2">
                <Label>End</Label>
                <Input value={supervisorScheduleForm.end_time} onChange={(e) => setSupervisorScheduleForm(prev => ({ ...prev, end_time: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white" placeholder="19:30" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Room</Label>
              <Input value={supervisorScheduleForm.room} onChange={(e) => setSupervisorScheduleForm(prev => ({ ...prev, room: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => setSupervisorScheduleDialog({ open: false, mode: 'create', schedule: null })} disabled={submitting}>
              Cancel
            </Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={submitSupervisorScheduleRequest} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

