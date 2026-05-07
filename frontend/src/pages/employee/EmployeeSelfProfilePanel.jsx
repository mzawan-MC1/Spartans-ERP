import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { staffAPI } from '@/lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import FileUpload from '@/components/FileUpload';

function fmtDateTime(v) {
  if (!v) return '—';
  return String(v).slice(0, 19).replace('T', ' ');
}

function reportTypeLabel(t) {
  if (t === 'attendance_report') return 'Attendance Report';
  if (t === 'work_report') return 'Work Report';
  if (t === 'task_report' || t === 'task_performance') return 'Task Report';
  if (t === 'performance_report') return 'Performance Report';
  return String(t || '').replace(/_/g, ' ');
}

function fmtIsoDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

const EMPTY_FORM = {
  phone: '',
  profile_image_path: null,
  nationality: '',
  dob: '',
  gender: '',
  marital_status: '',
  address: { line1: '', line2: '', city: '', country: '' },
  emergency_contact: { name: '', phone: '', relation: '' },
};

export default function EmployeeSelfProfilePanel() {
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requests, setRequests] = useState([]);
  const [requestForm, setRequestForm] = useState({ request_type: 'leave', leave_type: 'sick', from_date: '', to_date: '', reason: '', details: {} });
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceData, setAttendanceData] = useState({ timetable: [], shift_name: '', weekly_off_day: '', attendance: [], summary: {} });
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [performanceData, setPerformanceData] = useState({ reports: [], warnings: [], awards: [], notes: [], attendance_summary: {} });
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notifications, setNotifications] = useState({ documents: [], visas: [], agreements: [], probation: null });
  const [openRequestId, setOpenRequestId] = useState(null);

  const displayName = useMemo(() => {
    if (!staff) return '—';
    const name = `${staff.first_name || ''} ${staff.last_name || ''}`.trim();
    return name || staff.email || '—';
  }, [staff]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = await staffAPI.me();
        const s = res.data?.staff || null;
        if (!mounted) return;
        setStaff(s);
        setForm({
          phone: s?.phone || '',
          profile_image_path: s?.profile_image_path || null,
          nationality: s?.nationality || '',
          dob: s?.dob || '',
          gender: s?.gender || '',
          marital_status: s?.marital_status || '',
          address: {
            line1: s?.address?.line1 || '',
            line2: s?.address?.line2 || '',
            city: s?.address?.city || '',
            country: s?.address?.country || '',
          },
          emergency_contact: {
            name: s?.emergency_contact?.name || '',
            phone: s?.emergency_contact?.phone || '',
            relation: s?.emergency_contact?.relation || '',
          },
        });
      } catch (e) {
        const detail = e?.response?.data?.detail;
        if (mounted) toast.error(detail || 'Failed to load employee profile');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const loadRequests = async () => {
    setRequestsLoading(true);
    try {
      const res = await staffAPI.myRequests();
      setRequests(res.data?.requests || []);
    } catch {
      toast.error('Failed to load requests');
    } finally {
      setRequestsLoading(false);
    }
  };

  const loadAttendance = async () => {
    setAttendanceLoading(true);
    try {
      const toDate = fmtIsoDate(new Date());
      const fromDate = fmtIsoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
      const res = await staffAPI.myAttendance({ from_date: fromDate, to_date: toDate });
      setAttendanceData(res.data || { timetable: [], shift_name: '', weekly_off_day: '', attendance: [], summary: {} });
    } catch {
      toast.error('Failed to load attendance');
    } finally {
      setAttendanceLoading(false);
    }
  };

  const loadPerformance = async () => {
    setPerformanceLoading(true);
    try {
      const res = await staffAPI.myPerformance();
      setPerformanceData(res.data || { reports: [], warnings: [], awards: [], notes: [], attendance_summary: {} });
    } catch {
      toast.error('Failed to load performance');
    } finally {
      setPerformanceLoading(false);
    }
  };

  const loadNotifications = async () => {
    setNotificationsLoading(true);
    try {
      const res = await staffAPI.myNotifications();
      setNotifications(res.data || { documents: [], visas: [], agreements: [], probation: null });
    } catch {
      setNotifications({ documents: [], visas: [], agreements: [], probation: null });
    } finally {
      setNotificationsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'requests') return;
    loadRequests();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'attendance') return;
    loadAttendance();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'reports' && activeTab !== 'performance') return;
    loadPerformance();
  }, [activeTab]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await staffAPI.updateMe(form);
      const s = res.data?.staff || null;
      setStaff(s);
      toast.success('Profile updated');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const submitRequest = async () => {
    try {
      const payload = {
        ...requestForm,
        details: requestForm.details || {},
      };
      await staffAPI.createRequest(payload);
      toast.success('Request submitted');
      setRequestForm({ request_type: 'leave', leave_type: 'sick', from_date: '', to_date: '', reason: '', details: {} });
      loadRequests();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to submit request');
    }
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-[1200px]">
      <div className="mb-8">
        <h1 className="font-heading font-extrabold text-white text-4xl sm:text-5xl uppercase tracking-tight">Profile</h1>
        <p className="text-zinc-500 font-body mt-2 text-base">
          {displayName} • Employee ID: {staff?.employee_code || staff?.staff_id || '—'}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="profile">Profile Details</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="requests">Requests</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-white font-heading uppercase tracking-wide text-lg">Profile Details</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {loading ? (
                <div className="text-zinc-500 text-sm">Loading…</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1">
                      <Label className="text-zinc-300">Photo</Label>
                      <div className="mt-2">
                        <FileUpload value={form.profile_image_path} onChange={(v) => setForm(prev => ({ ...prev, profile_image_path: v }))} />
                      </div>
                    </div>

                    <div className="lg:col-span-2 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label className="text-zinc-300">Full name</Label>
                          <Input value={displayName} disabled className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                        </div>
                        <div>
                          <Label className="text-zinc-300">Employee type</Label>
                          <Input value={staff?.employee_type || '—'} disabled className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                        </div>
                        <div>
                          <Label className="text-zinc-300">Role / Designation</Label>
                          <Input value={staff?.designation || staff?.role || '—'} disabled className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                        </div>
                        <div>
                          <Label className="text-zinc-300">Department</Label>
                          <Input value={staff?.department || '—'} disabled className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                        </div>
                        <div>
                          <Label className="text-zinc-300">Employment type</Label>
                          <Input value={staff?.employment_type || '—'} disabled className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                        </div>
                        <div>
                          <Label className="text-zinc-300">Joining date</Label>
                          <Input value={staff?.join_date || '—'} disabled className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                        </div>
                        <div>
                          <Label className="text-zinc-300">Phone</Label>
                          <Input value={form.phone} onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                        </div>
                        <div>
                          <Label className="text-zinc-300">Nationality</Label>
                          <Input value={form.nationality} onChange={(e) => setForm(prev => ({ ...prev, nationality: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                        </div>
                        <div>
                          <Label className="text-zinc-300">Date of birth</Label>
                          <Input type="date" value={form.dob} onChange={(e) => setForm(prev => ({ ...prev, dob: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                        </div>
                        <div>
                          <Label className="text-zinc-300">Gender</Label>
                          <Input value={form.gender} onChange={(e) => setForm(prev => ({ ...prev, gender: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" placeholder="Male / Female" />
                        </div>
                        <div>
                          <Label className="text-zinc-300">Marital status</Label>
                          <Input value={form.marital_status} onChange={(e) => setForm(prev => ({ ...prev, marital_status: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-zinc-800">
                        <div className="space-y-2">
                          <Label className="text-zinc-300">Address</Label>
                          <Input value={form.address.line1} onChange={(e) => setForm(prev => ({ ...prev, address: { ...prev.address, line1: e.target.value } }))} className="bg-zinc-950 border-zinc-800 text-white" placeholder="Line 1" />
                          <Input value={form.address.line2} onChange={(e) => setForm(prev => ({ ...prev, address: { ...prev.address, line2: e.target.value } }))} className="bg-zinc-950 border-zinc-800 text-white" placeholder="Line 2" />
                          <div className="grid grid-cols-2 gap-2">
                            <Input value={form.address.city} onChange={(e) => setForm(prev => ({ ...prev, address: { ...prev.address, city: e.target.value } }))} className="bg-zinc-950 border-zinc-800 text-white" placeholder="City" />
                            <Input value={form.address.country} onChange={(e) => setForm(prev => ({ ...prev, address: { ...prev.address, country: e.target.value } }))} className="bg-zinc-950 border-zinc-800 text-white" placeholder="Country" />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-zinc-300">Emergency contact</Label>
                          <Input value={form.emergency_contact.name} onChange={(e) => setForm(prev => ({ ...prev, emergency_contact: { ...prev.emergency_contact, name: e.target.value } }))} className="bg-zinc-950 border-zinc-800 text-white" placeholder="Name" />
                          <Input value={form.emergency_contact.phone} onChange={(e) => setForm(prev => ({ ...prev, emergency_contact: { ...prev.emergency_contact, phone: e.target.value } }))} className="bg-zinc-950 border-zinc-800 text-white" placeholder="Phone" />
                          <Input value={form.emergency_contact.relation} onChange={(e) => setForm(prev => ({ ...prev, emergency_contact: { ...prev.emergency_contact, relation: e.target.value } }))} className="bg-zinc-950 border-zinc-800 text-white" placeholder="Relation" />
                        </div>
                      </div>

                      <div className="pt-2 border-t border-zinc-800 flex justify-end">
                        <Button onClick={saveProfile} disabled={saving} className="bg-red-600 hover:bg-red-700">{saving ? 'Saving…' : 'Save changes'}</Button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="bg-zinc-950 border-zinc-800">
                      <CardHeader className="border-b border-zinc-800">
                        <CardTitle className="text-white font-heading uppercase tracking-wide text-sm">Bank / Payment</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4 text-zinc-500 text-sm">Coming soon</CardContent>
                    </Card>
                    <Card className="bg-zinc-950 border-zinc-800">
                      <CardHeader className="border-b border-zinc-800">
                        <CardTitle className="text-white font-heading uppercase tracking-wide text-sm">Passport / Visa</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="text-zinc-500 text-xs font-heading uppercase tracking-wider">Passport</div>
                            <div className="text-white text-sm">{staff?.passport_visa?.passport_no || '—'}</div>
                            <div className="text-zinc-600 text-xs">{staff?.passport_visa?.passport_expiry || '—'}</div>
                          </div>
                          <div>
                            <div className="text-zinc-500 text-xs font-heading uppercase tracking-wider">Visa</div>
                            <div className="text-white text-sm">{staff?.passport_visa?.visa_status || '—'}</div>
                            <div className="text-zinc-600 text-xs">{staff?.passport_visa?.visa_expiry || '—'}</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Card className="bg-zinc-950 border-zinc-800">
                    <CardHeader className="border-b border-zinc-800">
                      <CardTitle className="text-white font-heading uppercase tracking-wide text-sm">Expiry Alerts</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="flex justify-end mb-3">
                        <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={loadNotifications} disabled={notificationsLoading}>
                          {notificationsLoading ? 'Refreshing…' : 'Refresh'}
                        </Button>
                      </div>
                      {(notifications.documents?.length || 0) === 0 && (notifications.visas?.length || 0) === 0 && (notifications.agreements?.length || 0) === 0 && !notifications.probation ? (
                        <div className="text-zinc-500 text-sm">No alerts.</div>
                      ) : (
                        <div className="space-y-2">
                          {notifications.probation ? (
                            <div className="bg-zinc-900/40 border border-zinc-800 rounded-sm p-3">
                              <div className="flex items-center justify-between">
                                <div className="text-white text-sm">Probation ending</div>
                                <div className="text-zinc-500 text-xs">{notifications.probation.days_left < 0 ? 'OVERDUE' : `${notifications.probation.days_left} days`}</div>
                              </div>
                              <div className="text-zinc-600 text-xs mt-1">End: {notifications.probation.end_date || '—'}</div>
                            </div>
                          ) : null}
                          {(notifications.documents || []).map((d) => (
                            <div key={d.staff_document_id} className="bg-zinc-900/40 border border-zinc-800 rounded-sm p-3">
                              <div className="flex items-center justify-between">
                                <div className="text-white text-sm">{d.document_type}</div>
                                <div className="text-zinc-500 text-xs">{String(d.status || '').toUpperCase()}</div>
                              </div>
                              <div className="text-zinc-600 text-xs mt-1">Expiry: {d.expiry_date || '—'}</div>
                            </div>
                          ))}
                          {(notifications.agreements || []).map((a) => (
                            <div key={a.staff_agreement_id} className="bg-zinc-900/40 border border-zinc-800 rounded-sm p-3">
                              <div className="flex items-center justify-between">
                                <div className="text-white text-sm">{a.agreement_type || 'Agreement'}</div>
                                <div className="text-zinc-500 text-xs">{String(a.expiry_state || a.status || '').toUpperCase()}</div>
                              </div>
                              <div className="text-zinc-600 text-xs mt-1">Expiry: {a.end_date || '—'}</div>
                            </div>
                          ))}
                          {(notifications.visas || []).map((v) => (
                            <div key={v.staff_visa_id} className="bg-zinc-900/40 border border-zinc-800 rounded-sm p-3">
                              <div className="flex items-center justify-between">
                                <div className="text-white text-sm">Visa</div>
                                <div className="text-zinc-500 text-xs">{String(v.expiry_state || '').toUpperCase()}</div>
                              </div>
                              <div className="text-zinc-600 text-xs mt-1">Expiry: {v.expiry_date || '—'}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance" className="mt-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-white font-heading uppercase tracking-wide text-lg">Attendance</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-zinc-500 text-sm">Punch in / punch out (coming soon)</div>
                <div className="flex gap-2">
                  <Button variant="outline" className="border-zinc-800 text-zinc-300" disabled> Punch In </Button>
                  <Button variant="outline" className="border-zinc-800 text-zinc-300" disabled> Punch Out </Button>
                </div>
              </div>

              {attendanceLoading ? (
                <div className="text-zinc-500 text-sm">Loading…</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="bg-zinc-950 border-zinc-800">
                      <CardHeader className="border-b border-zinc-800">
                        <CardTitle className="text-white font-heading uppercase tracking-wide text-sm">Assigned Schedule</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4 text-zinc-500 text-sm space-y-1">
                        <div>Shift: {attendanceData.shift_name || '—'}</div>
                        <div>Weekly off: {attendanceData.weekly_off_day || '—'}</div>
                        <div className="text-zinc-600 text-xs mt-2">Timetable rows: {(attendanceData.timetable || []).length}</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-zinc-950 border-zinc-800 md:col-span-2">
                      <CardHeader className="border-b border-zinc-800">
                        <CardTitle className="text-white font-heading uppercase tracking-wide text-sm">Summary (Last 30 Days)</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4">
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                          {['present', 'late', 'absent', 'off', 'overtime'].map((k) => (
                            <div key={k} className="bg-zinc-900/40 border border-zinc-800 rounded-sm p-3">
                              <div className="text-zinc-500 text-xs font-heading uppercase tracking-wider">{k}</div>
                              <div className="text-white text-lg">{attendanceData.summary?.[k] ?? 0}</div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Card className="bg-zinc-950 border-zinc-800">
                    <CardHeader className="border-b border-zinc-800">
                      <CardTitle className="text-white font-heading uppercase tracking-wide text-sm">Attendance History</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      {(attendanceData.attendance || []).length === 0 ? (
                        <div className="text-zinc-500 text-sm">No attendance records yet.</div>
                      ) : (
                        <div className="space-y-2">
                          {(attendanceData.attendance || []).slice(0, 50).map((r) => (
                            <div key={r.staff_attendance_id} className="bg-zinc-900/40 border border-zinc-800 rounded-sm p-3">
                              <div className="flex items-center justify-between">
                                <div className="text-white text-sm">{r.date}</div>
                                <div className="text-zinc-500 text-xs">{String(r.status || '').toUpperCase()}</div>
                              </div>
                              <div className="text-zinc-600 text-xs mt-1">
                                {r.check_in ? `In: ${r.check_in}` : 'In: —'} • {r.check_out ? `Out: ${r.check_out}` : 'Out: —'}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="mt-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-white font-heading uppercase tracking-wide text-lg">Reports</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {performanceLoading ? (
                <div className="text-zinc-500 text-sm">Loading…</div>
              ) : (performanceData.reports || []).length === 0 ? (
                <div className="text-zinc-500 text-sm">No reports uploaded yet.</div>
              ) : (
                <div className="space-y-2">
                  {(performanceData.reports || []).map((r) => (
                    <div key={r.staff_performance_report_id} className="bg-zinc-950/60 border border-zinc-800 rounded-sm p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-white text-sm">{r.title || reportTypeLabel(r.report_type)}</div>
                        <div className="text-zinc-500 text-xs">{fmtDateTime(r.created_at)}</div>
                      </div>
                      {r.notes ? <div className="text-zinc-500 text-xs mt-1 whitespace-pre-wrap">{r.notes}</div> : null}
                      {r.file_url ? (
                        <div className="mt-2">
                          <a className="text-red-400 text-xs hover:underline break-all" href={r.file_url} target="_blank" rel="noreferrer">Open attachment</a>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="mt-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-white font-heading uppercase tracking-wide text-lg">Performance</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              {performanceLoading ? (
                <div className="text-zinc-500 text-sm">Loading…</div>
              ) : (
                <>
                  <Card className="bg-zinc-950 border-zinc-800">
                    <CardHeader className="border-b border-zinc-800">
                      <CardTitle className="text-white font-heading uppercase tracking-wide text-sm">Attendance Performance</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {['present', 'late', 'absent', 'off', 'overtime'].map((k) => (
                          <div key={k} className="bg-zinc-900/40 border border-zinc-800 rounded-sm p-3">
                            <div className="text-zinc-500 text-xs font-heading uppercase tracking-wider">{k}</div>
                            <div className="text-white text-lg">{performanceData.attendance_summary?.[k] ?? 0}</div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Card className="bg-zinc-950 border-zinc-800">
                      <CardHeader className="border-b border-zinc-800">
                        <CardTitle className="text-white font-heading uppercase tracking-wide text-sm">Warnings</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4">
                        {(performanceData.warnings || []).length === 0 ? (
                          <div className="text-zinc-500 text-sm">No warnings.</div>
                        ) : (
                          <div className="space-y-2">
                            {(performanceData.warnings || []).map((w) => (
                              <div key={w.staff_warning_id} className="bg-zinc-900/40 border border-zinc-800 rounded-sm p-3">
                                <div className="flex items-center justify-between">
                                  <div className="text-white text-sm">{w.title}</div>
                                  <div className="text-zinc-500 text-xs">{w.date || '—'}</div>
                                </div>
                                <div className="text-zinc-600 text-xs mt-1">{String(w.severity || '').toUpperCase()}</div>
                                {w.notes ? <div className="text-zinc-500 text-xs mt-2 whitespace-pre-wrap">{w.notes}</div> : null}
                                {w.file_url ? <a className="text-red-400 text-xs hover:underline break-all mt-2 inline-block" href={w.file_url} target="_blank" rel="noreferrer">Open attachment</a> : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="bg-zinc-950 border-zinc-800">
                      <CardHeader className="border-b border-zinc-800">
                        <CardTitle className="text-white font-heading uppercase tracking-wide text-sm">Awards</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4">
                        {(performanceData.awards || []).length === 0 ? (
                          <div className="text-zinc-500 text-sm">No awards.</div>
                        ) : (
                          <div className="space-y-2">
                            {(performanceData.awards || []).map((a) => (
                              <div key={a.staff_award_id} className="bg-zinc-900/40 border border-zinc-800 rounded-sm p-3">
                                <div className="flex items-center justify-between">
                                  <div className="text-white text-sm">{a.title}</div>
                                  <div className="text-zinc-500 text-xs">{a.date || '—'}</div>
                                </div>
                                {a.category ? <div className="text-zinc-600 text-xs mt-1">{a.category}</div> : null}
                                {a.notes ? <div className="text-zinc-500 text-xs mt-2 whitespace-pre-wrap">{a.notes}</div> : null}
                                {a.file_url ? <a className="text-red-400 text-xs hover:underline break-all mt-2 inline-block" href={a.file_url} target="_blank" rel="noreferrer">Open attachment</a> : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  <Card className="bg-zinc-950 border-zinc-800">
                    <CardHeader className="border-b border-zinc-800">
                      <CardTitle className="text-white font-heading uppercase tracking-wide text-sm">Manager / HR Notes</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      {(performanceData.notes || []).length === 0 ? (
                        <div className="text-zinc-500 text-sm">No notes.</div>
                      ) : (
                        <div className="space-y-2">
                          {(performanceData.notes || []).map((n) => (
                            <div key={n.staff_note_id} className="bg-zinc-900/40 border border-zinc-800 rounded-sm p-3">
                              <div className="text-zinc-600 text-xs">{fmtDateTime(n.created_at)}</div>
                              <div className="text-white text-sm mt-1 whitespace-pre-wrap">{n.note}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requests" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="border-b border-zinc-800">
                <CardTitle className="text-white font-heading uppercase tracking-wide text-lg">Create Request</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-zinc-300">Request type</Label>
                    <select value={requestForm.request_type} onChange={(e) => setRequestForm(prev => ({ ...prev, request_type: e.target.value }))} className="w-full bg-zinc-950 border border-zinc-800 text-white px-3 py-2 rounded-sm mt-1">
                      <option value="leave">Leave</option>
                      <option value="schedule_change">Schedule change</option>
                      <option value="modified_timing">Modified timing</option>
                      <option value="emergency_leave">Emergency leave</option>
                      <option value="unpaid_leave">Unpaid leave</option>
                      <option value="document_renewal">Document renewal</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-zinc-300">Leave type</Label>
                    <select value={requestForm.leave_type} onChange={(e) => setRequestForm(prev => ({ ...prev, leave_type: e.target.value }))} className="w-full bg-zinc-950 border border-zinc-800 text-white px-3 py-2 rounded-sm mt-1">
                      <option value="sick">Sick</option>
                      <option value="work">Work</option>
                      <option value="annual">Yearly / annual</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-zinc-300">From</Label>
                    <Input type="date" value={requestForm.from_date} onChange={(e) => setRequestForm(prev => ({ ...prev, from_date: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                  </div>
                  <div>
                    <Label className="text-zinc-300">To</Label>
                    <Input type="date" value={requestForm.to_date} onChange={(e) => setRequestForm(prev => ({ ...prev, to_date: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                  </div>
                </div>
                {requestForm.request_type === 'modified_timing' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-zinc-300">Current timing</Label>
                      <Input value={requestForm.details?.current_timing || ''} onChange={(e) => setRequestForm(prev => ({ ...prev, details: { ...(prev.details || {}), current_timing: e.target.value } }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" placeholder="e.g. 09:00 - 18:00" />
                    </div>
                    <div>
                      <Label className="text-zinc-300">Requested timing</Label>
                      <Input value={requestForm.details?.requested_timing || ''} onChange={(e) => setRequestForm(prev => ({ ...prev, details: { ...(prev.details || {}), requested_timing: e.target.value } }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" placeholder="e.g. 10:00 - 19:00" />
                    </div>
                  </div>
                ) : null}
                <div>
                  <Label className="text-zinc-300">Reason</Label>
                  <Textarea value={requestForm.reason} onChange={(e) => setRequestForm(prev => ({ ...prev, reason: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                </div>
                <div className="flex justify-end">
                  <Button onClick={submitRequest} className="bg-red-600 hover:bg-red-700">Submit</Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="border-b border-zinc-800">
                <CardTitle className="text-white font-heading uppercase tracking-wide text-lg">My Requests</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                {requestsLoading ? (
                  <div className="text-zinc-500 text-sm">Loading…</div>
                ) : requests.length === 0 ? (
                  <div className="text-zinc-500 text-sm">No requests yet.</div>
                ) : (
                  <div className="space-y-2">
                    {requests.map((r) => (
                      <div key={r.staff_request_id} className="bg-zinc-950/60 border border-zinc-800 rounded-sm p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-white text-sm">{String(r.request_type || '').replace(/_/g, ' ')}</div>
                          <div className="text-zinc-500 text-xs">{String(r.status || '').toUpperCase()}</div>
                        </div>
                        <div className="text-zinc-600 text-xs mt-1">
                          {fmtDateTime(r.created_at)} • {r.from_date || '—'} → {r.to_date || '—'}
                        </div>
                        <div className="mt-2 flex justify-end">
                          <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => setOpenRequestId((v) => (v === r.staff_request_id ? null : r.staff_request_id))}>
                            {openRequestId === r.staff_request_id ? 'Hide history' : 'View history'}
                          </Button>
                        </div>
                        {openRequestId === r.staff_request_id ? (
                          <div className="mt-3 border-t border-zinc-800 pt-3 space-y-2">
                            {(r.history || []).length === 0 ? (
                              <div className="text-zinc-600 text-xs">No history entries.</div>
                            ) : (
                              (r.history || []).map((h, idx) => (
                                <div key={`${r.staff_request_id}-${idx}`} className="text-zinc-500 text-xs">
                                  {fmtDateTime(h.at)} • {String(h.action || '').replace(/_/g, ' ')} {h.comment ? `— ${h.comment}` : ''}
                                </div>
                              ))
                            )}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

