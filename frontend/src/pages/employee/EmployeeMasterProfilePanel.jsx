import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { locationAPI, staffAPI } from '@/lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import FileUpload from '@/components/FileUpload';

function fmt(v) {
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

function daysLeft(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

const EMPLOYEE_TYPES = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'RECEPTIONIST', label: 'Receptionist' },
  { value: 'STAFF', label: 'Staff' },
  { value: 'INSTRUCTOR', label: 'Coach / Instructor' },
  { value: 'EXTERNAL', label: 'Outside Company / External' },
];

const EMPLOYMENT_TYPES = [
  { value: 'FULL_TIME', label: 'Full-time' },
  { value: 'PART_TIME', label: 'Part-time' },
  { value: 'CONTRACT', label: 'Contract-based' },
  { value: 'CONTRACTOR', label: 'Contractor' },
  { value: 'EXTERNAL', label: 'External' },
];

const DOCUMENT_TYPES = [
  'Agreement',
  'Passport',
  'Passport size picture',
  'National ID',
  'Emirates ID',
  'Labor contract',
  'Visa',
  'Educational documents',
  'Certificates',
  'Other',
];

export default function EmployeeMasterProfilePanel({ staffId, locationId }) {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('employment');
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const staff = data?.staff;
  const [locations, setLocations] = useState([]);
  const [transferToLocationId, setTransferToLocationId] = useState('');

  const displayName = useMemo(() => {
    const name = `${staff?.first_name || ''} ${staff?.last_name || ''}`.trim();
    return name || staff?.email || '—';
  }, [staff?.email, staff?.first_name, staff?.last_name]);

  const [employmentForm, setEmploymentForm] = useState({
    employee_code: '',
    employee_type: '',
    employment_type: '',
    role: '',
    designation: '',
    department: '',
    join_date: '',
    start_date: '',
    reporting_staff_id: '',
    weekly_off_day: '',
    shift_name: '',
    timetable: [],
    status: '',
    salary: '',
    currency: '',
  });

  const [docForm, setDocForm] = useState({ document_type: 'Passport', file_url: '', issue_date: '', expiry_date: '', status: 'submitted', notes: '', notify_days_before_expiry: 15 });
  const [agreementForm, setAgreementForm] = useState({ agreement_type: 'Agreement', file_url: '', start_date: '', end_date: '', status: 'pending', notes: '', notify_days_before_expiry: 15 });
  const [probationForm, setProbationForm] = useState({ action: 'start', start_date: '', end_date: '', notes: '' });
  const [visaForm, setVisaForm] = useState({ visa_status: 'applied', issue_date: '', expiry_date: '', sponsor_type: '', file_url: '', notes: '', notify_days_before_expiry: 30 });
  const [assetForm, setAssetForm] = useState({ asset_type: 'Laptop', asset_tag: '', assigned_at: '', returned_at: '', notes: '' });
  const [exitForm, setExitForm] = useState({ exit_type: 'resignation', status: 'draft', effective_date: '', reason: '', notes: '' });
  const [noteForm, setNoteForm] = useState({ note: '', is_confidential: true });
  const [eventForm, setEventForm] = useState({ event_type: 'note', effective_date: '', title: '', details: '' });
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceRows, setAttendanceRows] = useState([]);
  const [attendanceForm, setAttendanceForm] = useState({ date: '', status: 'present', check_in: '', check_out: '', notes: '' });
  const [perfLoading, setPerfLoading] = useState(false);
  const [perfData, setPerfData] = useState({ reports: [], warnings: [], awards: [] });
  const [reportForm, setReportForm] = useState({ report_type: 'work_report', title: '', file_url: '', notes: '' });
  const [warningForm, setWarningForm] = useState({ title: '', date: '', severity: 'medium', notes: '', file_url: '' });
  const [awardForm, setAwardForm] = useState({ title: '', date: '', category: '', notes: '', file_url: '' });
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inbox, setInbox] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await staffAPI.getMaster(staffId, locationId);
      setData(res.data);
      const s = res.data?.staff || {};
      setEmploymentForm({
        employee_code: s.employee_code || '',
        employee_type: s.employee_type || '',
        employment_type: s.employment_type || '',
        role: s.role || '',
        designation: s.designation || '',
        department: s.department || '',
        join_date: s.join_date || '',
        start_date: s.start_date || '',
        reporting_staff_id: s.reporting_staff_id || '',
        weekly_off_day: s.weekly_off_day || '',
        shift_name: s.shift_name || '',
        timetable: Array.isArray(s.timetable) ? s.timetable : [],
        status: s.status || '',
        salary: s.salary != null ? String(s.salary) : '',
        currency: s.currency || 'AED',
      });
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load employee profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [staffId, locationId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await locationAPI.list();
        if (!mounted) return;
        setLocations(res.data || []);
      } catch {
        if (mounted) setLocations([]);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (activeTab !== 'requests') return;
    (async () => {
      setInboxLoading(true);
      try {
        const res = await staffAPI.requestsInbox(locationId ? { location_id: locationId } : {});
        setInbox(res.data?.requests || []);
      } catch {
        setInbox([]);
      } finally {
        setInboxLoading(false);
      }
    })();
  }, [activeTab, locationId]);

  useEffect(() => {
    if (activeTab !== 'attendance') return;
    (async () => {
      setAttendanceLoading(true);
      try {
        const res = await staffAPI.listAttendance(staffId, locationId ? { location_id: locationId } : {});
        setAttendanceRows(res.data?.attendance || []);
      } catch {
        setAttendanceRows([]);
      } finally {
        setAttendanceLoading(false);
      }
    })();
  }, [activeTab, staffId, locationId]);

  useEffect(() => {
    if (activeTab !== 'performance') return;
    (async () => {
      setPerfLoading(true);
      try {
        const params = locationId ? { location_id: locationId } : {};
        const [repRes, warnRes, awardRes] = await Promise.all([
          staffAPI.listPerformanceReports(staffId, params),
          staffAPI.listWarnings(staffId, params),
          staffAPI.listAwards(staffId, params),
        ]);
        setPerfData({
          reports: repRes.data?.reports || [],
          warnings: warnRes.data?.warnings || [],
          awards: awardRes.data?.awards || [],
        });
      } catch {
        setPerfData({ reports: [], warnings: [], awards: [] });
      } finally {
        setPerfLoading(false);
      }
    })();
  }, [activeTab, staffId, locationId]);

  const saveEmployment = async () => {
    setSaving(true);
    try {
      const payload = {
        ...employmentForm,
        salary: employmentForm.salary === '' ? null : Number(employmentForm.salary),
      };
      const res = await staffAPI.updateEmploymentSetup(staffId, payload, locationId);
      setData(prev => ({ ...(prev || {}), staff: res.data }));
      toast.success('Employment setup updated');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to update employment setup');
    } finally {
      setSaving(false);
    }
  };

  const transferEmployee = async () => {
    try {
      if (!transferToLocationId) {
        toast.error('Select a target location');
        return;
      }
      await staffAPI.transfer(staffId, { to_location_id: transferToLocationId }, locationId);
      toast.success('Employee transferred');
      setTransferToLocationId('');
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to transfer employee');
    }
  };

  const addAttendanceRow = async () => {
    try {
      if (!attendanceForm.date) {
        toast.error('Select a date');
        return;
      }
      await staffAPI.addAttendance(staffId, attendanceForm, locationId ? { location_id: locationId } : {});
      toast.success('Attendance saved');
      setAttendanceForm({ date: '', status: 'present', check_in: '', check_out: '', notes: '' });
      const res = await staffAPI.listAttendance(staffId, locationId ? { location_id: locationId } : {});
      setAttendanceRows(res.data?.attendance || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to save attendance');
    }
  };

  const addPerfReport = async () => {
    try {
      if (!reportForm.file_url) {
        toast.error('Upload a report file first');
        return;
      }
      await staffAPI.addPerformanceReport(staffId, reportForm, locationId ? { location_id: locationId } : {});
      toast.success('Report uploaded');
      setReportForm({ report_type: 'work_report', title: '', file_url: '', notes: '' });
      const params = locationId ? { location_id: locationId } : {};
      const res = await staffAPI.listPerformanceReports(staffId, params);
      setPerfData(prev => ({ ...prev, reports: res.data?.reports || [] }));
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to upload report');
    }
  };

  const addWarning = async () => {
    try {
      if (!warningForm.title) {
        toast.error('Enter warning title');
        return;
      }
      await staffAPI.addWarning(staffId, warningForm, locationId ? { location_id: locationId } : {});
      toast.success('Warning added');
      setWarningForm({ title: '', date: '', severity: 'medium', notes: '', file_url: '' });
      const params = locationId ? { location_id: locationId } : {};
      const res = await staffAPI.listWarnings(staffId, params);
      setPerfData(prev => ({ ...prev, warnings: res.data?.warnings || [] }));
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to add warning');
    }
  };

  const addAward = async () => {
    try {
      if (!awardForm.title) {
        toast.error('Enter award title');
        return;
      }
      await staffAPI.addAward(staffId, awardForm, locationId ? { location_id: locationId } : {});
      toast.success('Award added');
      setAwardForm({ title: '', date: '', category: '', notes: '', file_url: '' });
      const params = locationId ? { location_id: locationId } : {};
      const res = await staffAPI.listAwards(staffId, params);
      setPerfData(prev => ({ ...prev, awards: res.data?.awards || [] }));
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to add award');
    }
  };

  const addDocument = async () => {
    try {
      if (!docForm.file_url) {
        toast.error('Upload a document file first');
        return;
      }
      await staffAPI.addDocument(staffId, docForm, locationId);
      toast.success('Document added');
      setDocForm({ document_type: 'Passport', file_url: '', issue_date: '', expiry_date: '', status: 'submitted', notes: '', notify_days_before_expiry: 15 });
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to add document');
    }
  };

  const addAgreement = async () => {
    try {
      if (!agreementForm.file_url) {
        toast.error('Upload an agreement file first');
        return;
      }
      await staffAPI.addAgreement(staffId, agreementForm, locationId);
      toast.success('Agreement added');
      setAgreementForm({ agreement_type: 'Agreement', file_url: '', start_date: '', end_date: '', status: 'pending', notes: '', notify_days_before_expiry: 15 });
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to add agreement');
    }
  };

  const updateAgreementRecord = async (agreementId, updates) => {
    try {
      await staffAPI.updateAgreement(staffId, agreementId, updates, locationId);
      toast.success('Agreement updated');
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to update agreement');
    }
  };

  const updateDocumentRecord = async (documentId, updates) => {
    try {
      await staffAPI.updateDocument(staffId, documentId, updates, locationId);
      toast.success('Document updated');
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to update document');
    }
  };

  const updateVisaRecord = async (visaId, updates) => {
    try {
      await staffAPI.updateVisa(staffId, visaId, updates, locationId);
      toast.success('Visa updated');
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to update visa');
    }
  };

  const addProbationEvent = async () => {
    try {
      await staffAPI.addProbationEvent(staffId, probationForm, locationId);
      toast.success('Probation updated');
      setProbationForm({ action: 'start', start_date: '', end_date: '', notes: '' });
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to update probation');
    }
  };

  const addVisa = async () => {
    try {
      if (!visaForm.file_url) {
        toast.error('Upload visa document first');
        return;
      }
      await staffAPI.addVisa(staffId, visaForm, locationId);
      toast.success('Visa record added');
      setVisaForm({ visa_status: 'applied', issue_date: '', expiry_date: '', sponsor_type: '', file_url: '', notes: '', notify_days_before_expiry: 30 });
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to add visa record');
    }
  };

  const addAsset = async () => {
    try {
      await staffAPI.addAsset(staffId, assetForm, locationId);
      toast.success('Asset assigned');
      setAssetForm({ asset_type: 'Laptop', asset_tag: '', assigned_at: '', returned_at: '', notes: '' });
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to assign asset');
    }
  };

  const addExitCase = async () => {
    try {
      await staffAPI.addExitCase(staffId, exitForm, locationId);
      toast.success('Exit case created');
      setExitForm({ exit_type: 'resignation', status: 'draft', effective_date: '', reason: '', notes: '' });
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to create exit case');
    }
  };

  const addNote = async () => {
    try {
      if (!noteForm.note.trim()) {
        toast.error('Write a note first');
        return;
      }
      await staffAPI.addNote(staffId, noteForm, locationId);
      toast.success('Note added');
      setNoteForm({ note: '', is_confidential: true });
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to add note');
    }
  };

  const addEmploymentEvent = async () => {
    try {
      await staffAPI.addEmploymentEvent(staffId, eventForm, locationId);
      toast.success('Event added');
      setEventForm({ event_type: 'note', effective_date: '', title: '', details: '' });
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to add event');
    }
  };

  const actOnRequest = async (requestId, action) => {
    try {
      await staffAPI.actOnRequest(requestId, { action, comment: '' });
      toast.success('Updated request');
      const res = await staffAPI.requestsInbox(locationId ? { location_id: locationId } : {});
      setInbox(res.data?.requests || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to update request');
    }
  };

  if (loading) {
    return <div className="text-zinc-500 text-sm p-6">Loading…</div>;
  }

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-[1400px]">
      <div className="mb-8">
        <h1 className="font-heading font-extrabold text-white text-3xl sm:text-4xl uppercase tracking-tight">Employee Profile</h1>
        <p className="text-zinc-500 font-body mt-2 text-sm">
          {displayName} • Employee ID: {staff?.employee_code || staff?.staff_id || '—'} • Status: {staff?.status || (staff?.is_active ? 'active' : 'inactive')}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="employment">Employment Setup</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="agreements">Agreements</TabsTrigger>
          <TabsTrigger value="probation">Probation</TabsTrigger>
          <TabsTrigger value="visa">Visa</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="exit">Exit</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="requests">Requests Inbox</TabsTrigger>
        </TabsList>

        <TabsContent value="employment" className="mt-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-white font-heading uppercase tracking-wide text-lg">Employment Setup</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <Card className="bg-zinc-950 border-zinc-800">
                <CardHeader className="border-b border-zinc-800">
                  <CardTitle className="text-white font-heading uppercase tracking-wide text-sm">Reminders</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  {(() => {
                    const expDocs = (data?.documents || []).filter(d => ['expiring_soon', 'expired'].includes(d.status));
                    const expVisas = (data?.visas || []).filter(v => ['expiring_soon', 'expired'].includes(v.expiry_state));
                    const expAgreements = (data?.agreements || []).filter(a => ['expiring_soon', 'expired'].includes(a.expiry_state));
                    const prob = data?.probation;
                    const probDays = prob?.end_date ? daysLeft(prob.end_date) : null;
                    const showProb = prob && ['active', 'draft'].includes(prob.status) && probDays != null && probDays <= 7;
                    const empty = expDocs.length === 0 && expVisas.length === 0 && expAgreements.length === 0 && !showProb;
                    if (empty) return <div className="text-zinc-500 text-sm">No reminders.</div>;
                    return (
                      <div className="space-y-2">
                        {showProb ? (
                          <div className="bg-zinc-900/40 border border-zinc-800 rounded-sm p-3">
                            <div className="flex items-center justify-between">
                              <div className="text-white text-sm">Probation ending</div>
                              <div className="text-zinc-500 text-xs">{probDays < 0 ? 'OVERDUE' : `${probDays} days`}</div>
                            </div>
                            <div className="text-zinc-600 text-xs mt-1">End: {prob.end_date || '—'}</div>
                          </div>
                        ) : null}
                        {expAgreements.map(a => (
                          <div key={a.staff_agreement_id} className="bg-zinc-900/40 border border-zinc-800 rounded-sm p-3">
                            <div className="flex items-center justify-between">
                              <div className="text-white text-sm">{a.agreement_type || 'Agreement'}</div>
                              <div className="text-zinc-500 text-xs">{String(a.expiry_state || '').toUpperCase()}</div>
                            </div>
                            <div className="text-zinc-600 text-xs mt-1">Expiry: {a.end_date || '—'}</div>
                          </div>
                        ))}
                        {expDocs.map(d => (
                          <div key={d.staff_document_id} className="bg-zinc-900/40 border border-zinc-800 rounded-sm p-3">
                            <div className="flex items-center justify-between">
                              <div className="text-white text-sm">{d.document_type}</div>
                              <div className="text-zinc-500 text-xs">{String(d.status || '').toUpperCase()}</div>
                            </div>
                            <div className="text-zinc-600 text-xs mt-1">Expiry: {d.expiry_date || '—'}</div>
                          </div>
                        ))}
                        {expVisas.map(v => (
                          <div key={v.staff_visa_id} className="bg-zinc-900/40 border border-zinc-800 rounded-sm p-3">
                            <div className="flex items-center justify-between">
                              <div className="text-white text-sm">Visa</div>
                              <div className="text-zinc-500 text-xs">{String(v.expiry_state || '').toUpperCase()}</div>
                            </div>
                            <div className="text-zinc-600 text-xs mt-1">Expiry: {v.expiry_date || '—'}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <Label className="text-zinc-300">Employee code</Label>
                  <Input value={employmentForm.employee_code} onChange={(e) => setEmploymentForm(prev => ({ ...prev, employee_code: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                </div>
                <div>
                  <Label className="text-zinc-300">Employee type</Label>
                  <select value={employmentForm.employee_type} onChange={(e) => setEmploymentForm(prev => ({ ...prev, employee_type: e.target.value }))} className="w-full bg-zinc-950 border border-zinc-800 text-white px-3 py-2 rounded-sm mt-1">
                    <option value="">—</option>
                    {EMPLOYEE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-zinc-300">Employment type</Label>
                  <select value={employmentForm.employment_type} onChange={(e) => setEmploymentForm(prev => ({ ...prev, employment_type: e.target.value }))} className="w-full bg-zinc-950 border border-zinc-800 text-white px-3 py-2 rounded-sm mt-1">
                    <option value="">—</option>
                    {EMPLOYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-zinc-300">Role</Label>
                  <Input value={employmentForm.role} onChange={(e) => setEmploymentForm(prev => ({ ...prev, role: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                </div>
                <div>
                  <Label className="text-zinc-300">Designation</Label>
                  <Input value={employmentForm.designation} onChange={(e) => setEmploymentForm(prev => ({ ...prev, designation: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                </div>
                <div>
                  <Label className="text-zinc-300">Department</Label>
                  <Input value={employmentForm.department} onChange={(e) => setEmploymentForm(prev => ({ ...prev, department: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                </div>
                <div>
                  <Label className="text-zinc-300">Reporting manager (staff_id)</Label>
                  <Input value={employmentForm.reporting_staff_id} onChange={(e) => setEmploymentForm(prev => ({ ...prev, reporting_staff_id: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                </div>
                <div>
                  <Label className="text-zinc-300">Joining date</Label>
                  <Input type="date" value={employmentForm.join_date} onChange={(e) => setEmploymentForm(prev => ({ ...prev, join_date: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                </div>
                <div>
                  <Label className="text-zinc-300">Start date</Label>
                  <Input type="date" value={employmentForm.start_date} onChange={(e) => setEmploymentForm(prev => ({ ...prev, start_date: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                </div>
                <div>
                  <Label className="text-zinc-300">Weekly off</Label>
                  <Input value={employmentForm.weekly_off_day} onChange={(e) => setEmploymentForm(prev => ({ ...prev, weekly_off_day: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" placeholder="Friday" />
                </div>
                <div>
                  <Label className="text-zinc-300">Shift / timetable</Label>
                  <Input value={employmentForm.shift_name} onChange={(e) => setEmploymentForm(prev => ({ ...prev, shift_name: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" placeholder="Morning / Evening" />
                </div>
                <div>
                  <Label className="text-zinc-300">Status</Label>
                  <select value={employmentForm.status} onChange={(e) => setEmploymentForm(prev => ({ ...prev, status: e.target.value }))} className="w-full bg-zinc-950 border border-zinc-800 text-white px-3 py-2 rounded-sm mt-1">
                    <option value="">—</option>
                    <option value="draft">Draft</option>
                    <option value="pending_join">Pending Join</option>
                    <option value="active">Active</option>
                    <option value="probation">On Probation</option>
                    <option value="permanent">Permanent</option>
                    <option value="on_leave">On Leave</option>
                    <option value="suspended">Suspended</option>
                    <option value="terminated">Terminated</option>
                    <option value="resigned">Resigned</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <Label className="text-zinc-300">Salary</Label>
                  <Input value={employmentForm.salary} onChange={(e) => setEmploymentForm(prev => ({ ...prev, salary: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                </div>
                <div>
                  <Label className="text-zinc-300">Currency</Label>
                  <Input value={employmentForm.currency} onChange={(e) => setEmploymentForm(prev => ({ ...prev, currency: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                </div>
              </div>

              <Card className="bg-zinc-950 border-zinc-800">
                <CardHeader className="border-b border-zinc-800">
                  <CardTitle className="text-white font-heading uppercase tracking-wide text-sm">Timetable</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex justify-end">
                    <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => setEmploymentForm(prev => ({ ...prev, timetable: [...(prev.timetable || []), { day_of_week: 1, start_time: '', end_time: '' }] }))}>
                      Add row
                    </Button>
                  </div>
                  {(employmentForm.timetable || []).length === 0 ? (
                    <div className="text-zinc-500 text-sm">No timetable rows.</div>
                  ) : (
                    <div className="space-y-2">
                      {(employmentForm.timetable || []).map((row, idx) => (
                        <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-2 bg-zinc-900/40 border border-zinc-800 rounded-sm p-3">
                          <select value={row.day_of_week} onChange={(e) => setEmploymentForm(prev => ({ ...prev, timetable: prev.timetable.map((r, i) => i === idx ? { ...r, day_of_week: Number(e.target.value) } : r) }))} className="bg-zinc-950 border border-zinc-800 text-white px-3 py-2 rounded-sm">
                            <option value={0}>Sunday</option>
                            <option value={1}>Monday</option>
                            <option value={2}>Tuesday</option>
                            <option value={3}>Wednesday</option>
                            <option value={4}>Thursday</option>
                            <option value={5}>Friday</option>
                            <option value={6}>Saturday</option>
                          </select>
                          <Input value={row.start_time || ''} onChange={(e) => setEmploymentForm(prev => ({ ...prev, timetable: prev.timetable.map((r, i) => i === idx ? { ...r, start_time: e.target.value } : r) }))} className="bg-zinc-950 border-zinc-800 text-white" placeholder="Start (HH:MM)" />
                          <Input value={row.end_time || ''} onChange={(e) => setEmploymentForm(prev => ({ ...prev, timetable: prev.timetable.map((r, i) => i === idx ? { ...r, end_time: e.target.value } : r) }))} className="bg-zinc-950 border-zinc-800 text-white" placeholder="End (HH:MM)" />
                          <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => setEmploymentForm(prev => ({ ...prev, timetable: prev.timetable.filter((_, i) => i !== idx) }))}>
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-zinc-950 border-zinc-800">
                <CardHeader className="border-b border-zinc-800">
                  <CardTitle className="text-white font-heading uppercase tracking-wide text-sm">Branch / Location</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <Label className="text-zinc-300">Current branch</Label>
                      <Input value={locations.find(l => l.location_id === staff?.location_id)?.name || staff?.location_id || '—'} disabled className="bg-zinc-900 border-zinc-800 text-white mt-1" />
                    </div>
                    <div>
                      <Label className="text-zinc-300">Transfer to</Label>
                      <select value={transferToLocationId} onChange={(e) => setTransferToLocationId(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 text-white px-3 py-2 rounded-sm mt-1">
                        <option value="">—</option>
                        {locations.map(l => <option key={l.location_id} value={l.location_id}>{l.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={transferEmployee}>Transfer</Button>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button onClick={saveEmployment} disabled={saving} className="bg-red-600 hover:bg-red-700">{saving ? 'Saving…' : 'Save'}</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance" className="mt-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-white font-heading uppercase tracking-wide text-lg">Attendance</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="text-zinc-500 text-sm">Employee attendance records (not class/member attendance).</div>

              <Card className="bg-zinc-950 border-zinc-800">
                <CardHeader className="border-b border-zinc-800">
                  <CardTitle className="text-white font-heading uppercase tracking-wide text-sm">Add Attendance (manual)</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    <div>
                      <Label className="text-zinc-300">Date</Label>
                      <Input type="date" value={attendanceForm.date} onChange={(e) => setAttendanceForm(prev => ({ ...prev, date: e.target.value }))} className="bg-zinc-900 border-zinc-800 text-white mt-1" />
                    </div>
                    <div>
                      <Label className="text-zinc-300">Status</Label>
                      <select value={attendanceForm.status} onChange={(e) => setAttendanceForm(prev => ({ ...prev, status: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-800 text-white px-3 py-2 rounded-sm mt-1">
                        <option value="present">Present</option>
                        <option value="late">Late</option>
                        <option value="absent">Absent</option>
                        <option value="off">Off</option>
                        <option value="overtime">Overtime</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-zinc-300">Check-in</Label>
                      <Input value={attendanceForm.check_in} onChange={(e) => setAttendanceForm(prev => ({ ...prev, check_in: e.target.value }))} className="bg-zinc-900 border-zinc-800 text-white mt-1" placeholder="09:00" />
                    </div>
                    <div>
                      <Label className="text-zinc-300">Check-out</Label>
                      <Input value={attendanceForm.check_out} onChange={(e) => setAttendanceForm(prev => ({ ...prev, check_out: e.target.value }))} className="bg-zinc-900 border-zinc-800 text-white mt-1" placeholder="18:00" />
                    </div>
                    <div className="flex items-end justify-end">
                      <Button onClick={addAttendanceRow} className="bg-red-600 hover:bg-red-700 w-full">Save</Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-zinc-300">Notes</Label>
                    <Textarea value={attendanceForm.notes} onChange={(e) => setAttendanceForm(prev => ({ ...prev, notes: e.target.value }))} className="bg-zinc-900 border-zinc-800 text-white mt-1" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-zinc-950 border-zinc-800">
                <CardHeader className="border-b border-zinc-800">
                  <CardTitle className="text-white font-heading uppercase tracking-wide text-sm">History</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  {attendanceLoading ? (
                    <div className="text-zinc-500 text-sm">Loading…</div>
                  ) : attendanceRows.length === 0 ? (
                    <div className="text-zinc-500 text-sm">No attendance records.</div>
                  ) : (
                    <div className="space-y-2">
                      {attendanceRows.map(r => (
                        <div key={r.staff_attendance_id} className="bg-zinc-900/40 border border-zinc-800 rounded-sm p-3">
                          <div className="flex items-center justify-between">
                            <div className="text-white text-sm">{r.date}</div>
                            <div className="text-zinc-500 text-xs">{String(r.status || '').toUpperCase()}</div>
                          </div>
                          <div className="text-zinc-600 text-xs mt-1">{r.check_in ? `In: ${r.check_in}` : 'In: —'} • {r.check_out ? `Out: ${r.check_out}` : 'Out: —'}</div>
                          {r.notes ? <div className="text-zinc-500 text-xs mt-2 whitespace-pre-wrap">{r.notes}</div> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-4 space-y-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-white font-heading uppercase tracking-wide text-lg">Documents</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div>
                  <Label className="text-zinc-300">Document file</Label>
                  <div className="mt-2">
                    <FileUpload value={docForm.file_url} onChange={(v) => setDocForm(prev => ({ ...prev, file_url: v }))} accept=".pdf,.png,.jpg,.jpeg" />
                  </div>
                </div>
                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-zinc-300">Type</Label>
                    <select value={docForm.document_type} onChange={(e) => setDocForm(prev => ({ ...prev, document_type: e.target.value }))} className="w-full bg-zinc-950 border border-zinc-800 text-white px-3 py-2 rounded-sm mt-1">
                      {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-zinc-300">Status</Label>
                    <select value={docForm.status} onChange={(e) => setDocForm(prev => ({ ...prev, status: e.target.value }))} className="w-full bg-zinc-950 border border-zinc-800 text-white px-3 py-2 rounded-sm mt-1">
                      <option value="not_submitted">Not Submitted</option>
                      <option value="submitted">Submitted</option>
                      <option value="under_review">Under Review</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                      <option value="expiring_soon">Expiring Soon</option>
                      <option value="expired">Expired</option>
                      <option value="renewed">Renewed</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-zinc-300">Issue date</Label>
                    <Input type="date" value={docForm.issue_date} onChange={(e) => setDocForm(prev => ({ ...prev, issue_date: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                  </div>
                  <div>
                    <Label className="text-zinc-300">Expiry date</Label>
                    <Input type="date" value={docForm.expiry_date} onChange={(e) => setDocForm(prev => ({ ...prev, expiry_date: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-zinc-300">Notes</Label>
                    <Textarea value={docForm.notes} onChange={(e) => setDocForm(prev => ({ ...prev, notes: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={addDocument} className="bg-red-600 hover:bg-red-700">Add Document</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-white font-heading uppercase tracking-wide text-sm">Document List</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {(data?.documents || []).length === 0 ? (
                <div className="text-zinc-500 text-sm">No documents.</div>
              ) : (
                <div className="space-y-2">
                  {data.documents.map(d => (
                    <div key={d.staff_document_id} className="bg-zinc-950/60 border border-zinc-800 rounded-sm p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-white text-sm">{d.document_type}</div>
                        <div className="text-zinc-500 text-xs">{String(d.status || '').toUpperCase()}</div>
                      </div>
                      <div className="text-zinc-600 text-xs mt-1">{d.issue_date || '—'} → {d.expiry_date || '—'} • {fmt(d.created_at)}</div>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                        <select value={d.status || 'submitted'} onChange={(e) => updateDocumentRecord(d.staff_document_id, { status: e.target.value })} className="w-full bg-zinc-900 border border-zinc-800 text-white px-3 py-2 rounded-sm">
                          <option value="not_submitted">Not Submitted</option>
                          <option value="submitted">Submitted</option>
                          <option value="under_review">Under Review</option>
                          <option value="approved">Approved</option>
                          <option value="rejected">Rejected</option>
                          <option value="expiring_soon">Expiring Soon</option>
                          <option value="expired">Expired</option>
                          <option value="renewed">Renewed</option>
                        </select>
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => updateDocumentRecord(d.staff_document_id, { status: 'renewed' })}>Renew</Button>
                          <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => updateDocumentRecord(d.staff_document_id, { status: 'approved' })}>Approve</Button>
                          <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => updateDocumentRecord(d.staff_document_id, { status: 'rejected' })}>Reject</Button>
                        </div>
                      </div>
                      {d.file_url ? (
                        <div className="mt-2">
                          <a className="text-red-400 text-xs hover:underline break-all" href={d.file_url} target="_blank" rel="noreferrer">View / Download</a>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agreements" className="mt-4 space-y-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-white font-heading uppercase tracking-wide text-lg">Agreements</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div>
                  <Label className="text-zinc-300">Agreement file</Label>
                  <div className="mt-2">
                    <FileUpload value={agreementForm.file_url} onChange={(v) => setAgreementForm(prev => ({ ...prev, file_url: v }))} accept=".pdf" />
                  </div>
                </div>
                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-zinc-300">Type</Label>
                    <Input value={agreementForm.agreement_type} onChange={(e) => setAgreementForm(prev => ({ ...prev, agreement_type: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                  </div>
                  <div>
                    <Label className="text-zinc-300">Status</Label>
                    <select value={agreementForm.status} onChange={(e) => setAgreementForm(prev => ({ ...prev, status: e.target.value }))} className="w-full bg-zinc-950 border border-zinc-800 text-white px-3 py-2 rounded-sm mt-1">
                      <option value="pending">Pending</option>
                      <option value="active">Active</option>
                      <option value="expired">Expired</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="renewed">Renewed</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-zinc-300">Start date</Label>
                    <Input type="date" value={agreementForm.start_date} onChange={(e) => setAgreementForm(prev => ({ ...prev, start_date: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                  </div>
                  <div>
                    <Label className="text-zinc-300">End date</Label>
                    <Input type="date" value={agreementForm.end_date} onChange={(e) => setAgreementForm(prev => ({ ...prev, end_date: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-zinc-300">Notes</Label>
                    <Textarea value={agreementForm.notes} onChange={(e) => setAgreementForm(prev => ({ ...prev, notes: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={addAgreement} className="bg-red-600 hover:bg-red-700">Add Agreement</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-white font-heading uppercase tracking-wide text-sm">Agreement History</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {(data?.agreements || []).length === 0 ? (
                <div className="text-zinc-500 text-sm">No agreements.</div>
              ) : (
                <div className="space-y-2">
                  {data.agreements.map(a => (
                    <div key={a.staff_agreement_id} className="bg-zinc-950/60 border border-zinc-800 rounded-sm p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-white text-sm">{a.agreement_type}</div>
                        <div className="text-zinc-500 text-xs">{String(a.status || '').toUpperCase()}</div>
                      </div>
                      <div className="text-zinc-600 text-xs mt-1">{a.start_date || '—'} → {a.end_date || '—'} • {fmt(a.created_at)}</div>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                        <select value={a.status || ''} onChange={(e) => updateAgreementRecord(a.staff_agreement_id, { status: e.target.value })} className="w-full bg-zinc-900 border border-zinc-800 text-white px-3 py-2 rounded-sm">
                          <option value="pending">Pending</option>
                          <option value="active">Active</option>
                          <option value="expired">Expired</option>
                          <option value="cancelled">Cancelled</option>
                          <option value="renewed">Renewed</option>
                          <option value="replaced">Replaced</option>
                        </select>
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => updateAgreementRecord(a.staff_agreement_id, { status: 'renewed' })}>Renew</Button>
                          <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => updateAgreementRecord(a.staff_agreement_id, { status: 'replaced' })}>Replace</Button>
                          <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => updateAgreementRecord(a.staff_agreement_id, { status: 'cancelled' })}>Cancel</Button>
                        </div>
                      </div>
                      {a.file_url ? (
                        <div className="mt-2">
                          <a className="text-red-400 text-xs hover:underline break-all" href={a.file_url} target="_blank" rel="noreferrer">View / Download PDF</a>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="probation" className="mt-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-white font-heading uppercase tracking-wide text-lg">Probation</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="text-zinc-500 text-sm">Probation lifecycle actions (history is recorded).</div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <Label className="text-zinc-300">Action</Label>
                  <select value={probationForm.action} onChange={(e) => setProbationForm(prev => ({ ...prev, action: e.target.value }))} className="w-full bg-zinc-950 border border-zinc-800 text-white px-3 py-2 rounded-sm mt-1">
                    <option value="start">Start</option>
                    <option value="extend">Extend</option>
                    <option value="confirm_permanent">Mark permanent</option>
                    <option value="cancel">Cancel</option>
                    <option value="note">Add note</option>
                  </select>
                </div>
                <div>
                  <Label className="text-zinc-300">Start date</Label>
                  <Input type="date" value={probationForm.start_date} onChange={(e) => setProbationForm(prev => ({ ...prev, start_date: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                </div>
                <div>
                  <Label className="text-zinc-300">End date</Label>
                  <Input type="date" value={probationForm.end_date} onChange={(e) => setProbationForm(prev => ({ ...prev, end_date: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                </div>
                <div className="flex items-end justify-end">
                  <Button onClick={addProbationEvent} className="bg-red-600 hover:bg-red-700 w-full">Apply</Button>
                </div>
              </div>
              <div>
                <Label className="text-zinc-300">Notes</Label>
                <Textarea value={probationForm.notes} onChange={(e) => setProbationForm(prev => ({ ...prev, notes: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
              </div>
              <Card className="bg-zinc-950 border-zinc-800">
                <CardHeader className="border-b border-zinc-800">
                  <CardTitle className="text-white font-heading uppercase tracking-wide text-sm">Current</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="text-zinc-500 text-sm">Status: {data?.probation?.status || '—'}</div>
                  <div className="text-zinc-600 text-xs mt-1">{data?.probation?.start_date || '—'} → {data?.probation?.end_date || '—'}</div>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="visa" className="mt-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-white font-heading uppercase tracking-wide text-lg">Visa</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div>
                  <Label className="text-zinc-300">Visa document</Label>
                  <div className="mt-2">
                    <FileUpload value={visaForm.file_url} onChange={(v) => setVisaForm(prev => ({ ...prev, file_url: v }))} accept=".pdf,.png,.jpg,.jpeg" />
                  </div>
                </div>
                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-zinc-300">Status</Label>
                    <select value={visaForm.visa_status} onChange={(e) => setVisaForm(prev => ({ ...prev, visa_status: e.target.value }))} className="w-full bg-zinc-950 border border-zinc-800 text-white px-3 py-2 rounded-sm mt-1">
                      <option value="applied">Applied</option>
                      <option value="under_process">Under Process</option>
                      <option value="probation">Probation</option>
                      <option value="renewal">Renewal</option>
                      <option value="cancel">Cancel</option>
                      <option value="own_visa">Own Visa</option>
                      <option value="expired">Expired</option>
                      <option value="rejected">Rejected</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-zinc-300">Sponsor type</Label>
                    <Input value={visaForm.sponsor_type} onChange={(e) => setVisaForm(prev => ({ ...prev, sponsor_type: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                  </div>
                  <div>
                    <Label className="text-zinc-300">Issue date</Label>
                    <Input type="date" value={visaForm.issue_date} onChange={(e) => setVisaForm(prev => ({ ...prev, issue_date: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                  </div>
                  <div>
                    <Label className="text-zinc-300">Expiry date</Label>
                    <Input type="date" value={visaForm.expiry_date} onChange={(e) => setVisaForm(prev => ({ ...prev, expiry_date: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-zinc-300">Notes</Label>
                    <Textarea value={visaForm.notes} onChange={(e) => setVisaForm(prev => ({ ...prev, notes: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={addVisa} className="bg-red-600 hover:bg-red-700">Add Visa Record</Button>
              </div>
              <Card className="bg-zinc-950 border-zinc-800">
                <CardHeader className="border-b border-zinc-800">
                  <CardTitle className="text-white font-heading uppercase tracking-wide text-sm">Visa Records</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  {(data?.visas || []).length === 0 ? (
                    <div className="text-zinc-500 text-sm">No visa records.</div>
                  ) : (
                    <div className="space-y-2">
                      {data.visas.map(v => (
                        <div key={v.staff_visa_id} className="bg-zinc-900/40 border border-zinc-800 rounded-sm p-3">
                          <div className="flex items-center justify-between">
                            <div className="text-white text-sm">{String(v.visa_status || '').replace(/_/g, ' ')}</div>
                            <div className="text-zinc-500 text-xs">{v.issue_date || '—'} → {v.expiry_date || '—'}</div>
                          </div>
                          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                            <select value={v.visa_status || 'applied'} onChange={(e) => updateVisaRecord(v.staff_visa_id, { visa_status: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 text-white px-3 py-2 rounded-sm">
                              <option value="applied">Applied</option>
                              <option value="under_process">Under Process</option>
                              <option value="probation">Probation</option>
                              <option value="renewal">Renewal</option>
                              <option value="cancel">Cancel</option>
                              <option value="own_visa">Own Visa</option>
                              <option value="expired">Expired</option>
                              <option value="rejected">Rejected</option>
                              <option value="completed">Completed</option>
                            </select>
                            <div className="text-zinc-600 text-xs flex items-center justify-end">{v.expiry_state ? `Expiry: ${String(v.expiry_state).toUpperCase()}` : ' '}</div>
                          </div>
                          {v.file_url ? (
                            <div className="mt-2">
                              <a className="text-red-400 text-xs hover:underline break-all" href={v.file_url} target="_blank" rel="noreferrer">View / Download</a>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="mt-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-white font-heading uppercase tracking-wide text-lg">Performance</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              {perfLoading ? <div className="text-zinc-500 text-sm">Loading…</div> : null}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="bg-zinc-950 border-zinc-800">
                  <CardHeader className="border-b border-zinc-800">
                    <CardTitle className="text-white font-heading uppercase tracking-wide text-sm">Uploaded Reports</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-zinc-300">Report type</Label>
                        <select value={reportForm.report_type} onChange={(e) => setReportForm(prev => ({ ...prev, report_type: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-800 text-white px-3 py-2 rounded-sm mt-1">
                          <option value="work_report">Work report</option>
                          <option value="attendance_report">Attendance report</option>
                          <option value="task_report">Task report</option>
                          <option value="performance_report">Performance report</option>
                        </select>
                      </div>
                      <div>
                        <Label className="text-zinc-300">Title</Label>
                        <Input value={reportForm.title} onChange={(e) => setReportForm(prev => ({ ...prev, title: e.target.value }))} className="bg-zinc-900 border-zinc-800 text-white mt-1" />
                      </div>
                      <div className="md:col-span-2">
                        <Label className="text-zinc-300">Upload</Label>
                        <div className="mt-2">
                          <FileUpload value={reportForm.file_url} onChange={(v) => setReportForm(prev => ({ ...prev, file_url: v }))} accept=".pdf,.png,.jpg,.jpeg" />
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <Label className="text-zinc-300">Notes</Label>
                        <Textarea value={reportForm.notes} onChange={(e) => setReportForm(prev => ({ ...prev, notes: e.target.value }))} className="bg-zinc-900 border-zinc-800 text-white mt-1" />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={addPerfReport} className="bg-red-600 hover:bg-red-700">Upload</Button>
                    </div>
                    <div className="border-t border-zinc-800 pt-3">
                      {(perfData.reports || []).length === 0 ? (
                        <div className="text-zinc-500 text-sm">No reports.</div>
                      ) : (
                        <div className="space-y-2">
                          {(perfData.reports || []).map(r => (
                            <div key={r.staff_performance_report_id} className="bg-zinc-900/40 border border-zinc-800 rounded-sm p-3">
                              <div className="flex items-center justify-between">
                                <div className="text-white text-sm">{r.title || reportTypeLabel(r.report_type)}</div>
                                <div className="text-zinc-500 text-xs">{fmt(r.created_at)}</div>
                              </div>
                              {r.notes ? <div className="text-zinc-500 text-xs mt-1 whitespace-pre-wrap">{r.notes}</div> : null}
                              {r.file_url ? <a className="text-red-400 text-xs hover:underline break-all mt-2 inline-block" href={r.file_url} target="_blank" rel="noreferrer">Open attachment</a> : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <Card className="bg-zinc-950 border-zinc-800">
                    <CardHeader className="border-b border-zinc-800">
                      <CardTitle className="text-white font-heading uppercase tracking-wide text-sm">Warnings</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-zinc-300">Title</Label>
                          <Input value={warningForm.title} onChange={(e) => setWarningForm(prev => ({ ...prev, title: e.target.value }))} className="bg-zinc-900 border-zinc-800 text-white mt-1" />
                        </div>
                        <div>
                          <Label className="text-zinc-300">Date</Label>
                          <Input type="date" value={warningForm.date} onChange={(e) => setWarningForm(prev => ({ ...prev, date: e.target.value }))} className="bg-zinc-900 border-zinc-800 text-white mt-1" />
                        </div>
                        <div>
                          <Label className="text-zinc-300">Severity</Label>
                          <select value={warningForm.severity} onChange={(e) => setWarningForm(prev => ({ ...prev, severity: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-800 text-white px-3 py-2 rounded-sm mt-1">
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                          </select>
                        </div>
                        <div>
                          <Label className="text-zinc-300">Attachment</Label>
                          <div className="mt-2">
                            <FileUpload value={warningForm.file_url} onChange={(v) => setWarningForm(prev => ({ ...prev, file_url: v }))} accept=".pdf,.png,.jpg,.jpeg" />
                          </div>
                        </div>
                        <div className="md:col-span-2">
                          <Label className="text-zinc-300">Notes</Label>
                          <Textarea value={warningForm.notes} onChange={(e) => setWarningForm(prev => ({ ...prev, notes: e.target.value }))} className="bg-zinc-900 border-zinc-800 text-white mt-1" />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Button onClick={addWarning} className="bg-red-600 hover:bg-red-700">Add Warning</Button>
                      </div>
                      <div className="border-t border-zinc-800 pt-3">
                        {(perfData.warnings || []).length === 0 ? (
                          <div className="text-zinc-500 text-sm">No warnings.</div>
                        ) : (
                          <div className="space-y-2">
                            {(perfData.warnings || []).map(w => (
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
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-zinc-950 border-zinc-800">
                    <CardHeader className="border-b border-zinc-800">
                      <CardTitle className="text-white font-heading uppercase tracking-wide text-sm">Awards</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-zinc-300">Title</Label>
                          <Input value={awardForm.title} onChange={(e) => setAwardForm(prev => ({ ...prev, title: e.target.value }))} className="bg-zinc-900 border-zinc-800 text-white mt-1" />
                        </div>
                        <div>
                          <Label className="text-zinc-300">Date</Label>
                          <Input type="date" value={awardForm.date} onChange={(e) => setAwardForm(prev => ({ ...prev, date: e.target.value }))} className="bg-zinc-900 border-zinc-800 text-white mt-1" />
                        </div>
                        <div>
                          <Label className="text-zinc-300">Category</Label>
                          <Input value={awardForm.category} onChange={(e) => setAwardForm(prev => ({ ...prev, category: e.target.value }))} className="bg-zinc-900 border-zinc-800 text-white mt-1" />
                        </div>
                        <div>
                          <Label className="text-zinc-300">Attachment</Label>
                          <div className="mt-2">
                            <FileUpload value={awardForm.file_url} onChange={(v) => setAwardForm(prev => ({ ...prev, file_url: v }))} accept=".pdf,.png,.jpg,.jpeg" />
                          </div>
                        </div>
                        <div className="md:col-span-2">
                          <Label className="text-zinc-300">Notes</Label>
                          <Textarea value={awardForm.notes} onChange={(e) => setAwardForm(prev => ({ ...prev, notes: e.target.value }))} className="bg-zinc-900 border-zinc-800 text-white mt-1" />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Button onClick={addAward} className="bg-red-600 hover:bg-red-700">Add Award</Button>
                      </div>
                      <div className="border-t border-zinc-800 pt-3">
                        {(perfData.awards || []).length === 0 ? (
                          <div className="text-zinc-500 text-sm">No awards.</div>
                        ) : (
                          <div className="space-y-2">
                            {(perfData.awards || []).map(a => (
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
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
              <Card className="bg-zinc-950 border-zinc-800">
                <CardHeader className="border-b border-zinc-800">
                  <CardTitle className="text-white font-heading uppercase tracking-wide text-sm">HR Notes</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                  <div>
                    <Label className="text-zinc-300">Add note</Label>
                    <Textarea value={noteForm.note} onChange={(e) => setNoteForm(prev => ({ ...prev, note: e.target.value }))} className="bg-zinc-900 border-zinc-800 text-white mt-1" />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-zinc-500 text-xs font-heading uppercase tracking-wider">Confidential</label>
                    <input type="checkbox" checked={noteForm.is_confidential} onChange={(e) => setNoteForm(prev => ({ ...prev, is_confidential: e.target.checked }))} />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={addNote} className="bg-red-600 hover:bg-red-700">Add Note</Button>
                  </div>
                  <div className="border-t border-zinc-800 pt-3">
                    {(data?.notes || []).length === 0 ? (
                      <div className="text-zinc-500 text-sm">No notes.</div>
                    ) : (
                      <div className="space-y-2">
                        {data.notes.map(n => (
                          <div key={n.staff_note_id} className="bg-zinc-900/40 border border-zinc-800 rounded-sm p-3">
                            <div className="text-zinc-500 text-xs">{fmt(n.created_at)}</div>
                            <div className="text-white text-sm mt-1 whitespace-pre-wrap">{n.note}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-zinc-950 border-zinc-800">
                <CardHeader className="border-b border-zinc-800">
                  <CardTitle className="text-white font-heading uppercase tracking-wide text-sm">Employment Timeline</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-zinc-300">Type</Label>
                      <select value={eventForm.event_type} onChange={(e) => setEventForm(prev => ({ ...prev, event_type: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-800 text-white px-3 py-2 rounded-sm mt-1">
                        <option value="salary_revision">Salary revision</option>
                        <option value="promotion">Promotion</option>
                        <option value="transfer">Transfer</option>
                        <option value="disciplinary_action">Disciplinary action</option>
                        <option value="note">Note</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-zinc-300">Effective date</Label>
                      <Input type="date" value={eventForm.effective_date} onChange={(e) => setEventForm(prev => ({ ...prev, effective_date: e.target.value }))} className="bg-zinc-900 border-zinc-800 text-white mt-1" />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-zinc-300">Title</Label>
                      <Input value={eventForm.title} onChange={(e) => setEventForm(prev => ({ ...prev, title: e.target.value }))} className="bg-zinc-900 border-zinc-800 text-white mt-1" />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-zinc-300">Details</Label>
                      <Textarea value={eventForm.details} onChange={(e) => setEventForm(prev => ({ ...prev, details: e.target.value }))} className="bg-zinc-900 border-zinc-800 text-white mt-1" />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={addEmploymentEvent} className="bg-red-600 hover:bg-red-700">Add Event</Button>
                  </div>
                  <div className="border-t border-zinc-800 pt-3">
                    {(data?.employment_events || []).length === 0 ? (
                      <div className="text-zinc-500 text-sm">No events.</div>
                    ) : (
                      <div className="space-y-2">
                        {data.employment_events.map(ev => (
                          <div key={ev.staff_employment_event_id} className="bg-zinc-900/40 border border-zinc-800 rounded-sm p-3">
                            <div className="flex items-center justify-between">
                              <div className="text-white text-sm">{String(ev.event_type || '').replace(/_/g, ' ')}</div>
                              <div className="text-zinc-500 text-xs">{ev.effective_date || '—'}</div>
                            </div>
                            <div className="text-zinc-500 text-xs mt-1">{ev.title || '—'} • {fmt(ev.created_at)}</div>
                            {ev.details ? <div className="text-zinc-200 text-sm mt-2 whitespace-pre-wrap">{ev.details}</div> : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-zinc-950 border-zinc-800">
                <CardHeader className="border-b border-zinc-800">
                  <CardTitle className="text-white font-heading uppercase tracking-wide text-sm">Audit / History</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  {(data?.audit_logs || []).length === 0 ? (
                    <div className="text-zinc-500 text-sm">No audit history.</div>
                  ) : (
                    <div className="space-y-2">
                      {(data.audit_logs || []).slice(0, 50).map((a) => (
                        <div key={a.audit_id} className="bg-zinc-900/40 border border-zinc-800 rounded-sm p-3">
                          <div className="flex items-center justify-between">
                            <div className="text-white text-sm">{String(a.action || '').replace(/_/g, ' ')}</div>
                            <div className="text-zinc-500 text-xs">{fmt(a.created_at)}</div>
                          </div>
                          {(a.changed_fields || []).length > 0 ? (
                            <div className="text-zinc-600 text-xs mt-1">Fields: {(a.changed_fields || []).join(', ')}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requests" className="mt-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-white font-heading uppercase tracking-wide text-lg">Requests Inbox</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {inboxLoading ? (
                <div className="text-zinc-500 text-sm">Loading…</div>
              ) : inbox.length === 0 ? (
                <div className="text-zinc-500 text-sm">No requests.</div>
              ) : (
                <div className="space-y-2">
                  {inbox.filter(r => r.staff_id === staffId).map((r) => (
                    <div key={r.staff_request_id} className="bg-zinc-950/60 border border-zinc-800 rounded-sm p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-white text-sm">{String(r.request_type || '').replace(/_/g, ' ')}</div>
                        <div className="text-zinc-500 text-xs">{String(r.status || '').toUpperCase()}</div>
                      </div>
                      <div className="text-zinc-600 text-xs mt-1">{fmt(r.created_at)} • {r.from_date || '—'} → {r.to_date || '—'}</div>
                      {(r.history || []).length > 0 ? (
                        <div className="mt-2 border-t border-zinc-800 pt-2 space-y-1">
                          {(r.history || []).slice(-5).reverse().map((h, idx) => (
                            <div key={`${r.staff_request_id}-h-${idx}`} className="text-zinc-500 text-xs">
                              {fmt(h.at)} • {String(h.action || '').replace(/_/g, ' ')} {h.comment ? `— ${h.comment}` : ''}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div className="flex items-center justify-end gap-2 mt-2">
                        <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => actOnRequest(r.staff_request_id, 'send_back')}>Send back</Button>
                        <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => actOnRequest(r.staff_request_id, 'reject')}>Reject</Button>
                        <Button className="bg-red-600 hover:bg-red-700" onClick={() => actOnRequest(r.staff_request_id, 'approve')}>Approve</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assets" className="mt-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-white font-heading uppercase tracking-wide text-lg">Assets</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-zinc-300">Asset type</Label>
                  <Input value={assetForm.asset_type} onChange={(e) => setAssetForm(prev => ({ ...prev, asset_type: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                </div>
                <div>
                  <Label className="text-zinc-300">Asset tag</Label>
                  <Input value={assetForm.asset_tag} onChange={(e) => setAssetForm(prev => ({ ...prev, asset_tag: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                </div>
                <div>
                  <Label className="text-zinc-300">Assigned at</Label>
                  <Input type="date" value={assetForm.assigned_at} onChange={(e) => setAssetForm(prev => ({ ...prev, assigned_at: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                </div>
                <div>
                  <Label className="text-zinc-300">Returned at</Label>
                  <Input type="date" value={assetForm.returned_at} onChange={(e) => setAssetForm(prev => ({ ...prev, returned_at: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-zinc-300">Notes</Label>
                <Textarea value={assetForm.notes} onChange={(e) => setAssetForm(prev => ({ ...prev, notes: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
              </div>
              <div className="flex justify-end">
                <Button onClick={addAsset} className="bg-red-600 hover:bg-red-700">Assign Asset</Button>
              </div>
              <div className="border-t border-zinc-800 pt-4">
                {(data?.assets || []).length === 0 ? (
                  <div className="text-zinc-500 text-sm">No assets.</div>
                ) : (
                  <div className="space-y-2">
                    {data.assets.map(a => (
                      <div key={a.staff_asset_id} className="bg-zinc-950/60 border border-zinc-800 rounded-sm p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-white text-sm">{a.asset_type}</div>
                          <div className="text-zinc-500 text-xs">{a.asset_tag || '—'}</div>
                        </div>
                        <div className="text-zinc-600 text-xs mt-1">{a.assigned_at || '—'} → {a.returned_at || '—'} • {fmt(a.created_at)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exit" className="mt-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-white font-heading uppercase tracking-wide text-lg">Exit / Separation</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-zinc-300">Exit type</Label>
                  <select value={exitForm.exit_type} onChange={(e) => setExitForm(prev => ({ ...prev, exit_type: e.target.value }))} className="w-full bg-zinc-950 border border-zinc-800 text-white px-3 py-2 rounded-sm mt-1">
                    <option value="resignation">Resignation</option>
                    <option value="termination">Termination</option>
                  </select>
                </div>
                <div>
                  <Label className="text-zinc-300">Status</Label>
                  <select value={exitForm.status} onChange={(e) => setExitForm(prev => ({ ...prev, status: e.target.value }))} className="w-full bg-zinc-950 border border-zinc-800 text-white px-3 py-2 rounded-sm mt-1">
                    <option value="draft">Draft</option>
                    <option value="submitted">Submitted</option>
                    <option value="approved">Approved</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <Label className="text-zinc-300">Effective date</Label>
                  <Input type="date" value={exitForm.effective_date} onChange={(e) => setExitForm(prev => ({ ...prev, effective_date: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                </div>
                <div>
                  <Label className="text-zinc-300">Reason</Label>
                  <Input value={exitForm.reason} onChange={(e) => setExitForm(prev => ({ ...prev, reason: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-zinc-300">Notes</Label>
                <Textarea value={exitForm.notes} onChange={(e) => setExitForm(prev => ({ ...prev, notes: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white mt-1" />
              </div>
              <div className="flex justify-end">
                <Button onClick={addExitCase} className="bg-red-600 hover:bg-red-700">Create Exit Case</Button>
              </div>
              <div className="border-t border-zinc-800 pt-4">
                {(data?.exit_cases || []).length === 0 ? (
                  <div className="text-zinc-500 text-sm">No exit cases.</div>
                ) : (
                  <div className="space-y-2">
                    {data.exit_cases.map(c => (
                      <div key={c.staff_exit_id} className="bg-zinc-950/60 border border-zinc-800 rounded-sm p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-white text-sm">{c.exit_type}</div>
                          <div className="text-zinc-500 text-xs">{String(c.status || '').toUpperCase()}</div>
                        </div>
                        <div className="text-zinc-600 text-xs mt-1">{c.effective_date || '—'} • {fmt(c.created_at)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

