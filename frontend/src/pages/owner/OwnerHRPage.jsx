import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import TopNav from '@/components/TopNav';
import { authAPI, hrAPI, instructorAPI, locationAPI, payrollAPI, staffAPI } from '@/lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import FileUpload from '@/components/FileUpload';
import { BarChart3, ClipboardCheck, DollarSign, Loader2, Plus, Users, Bell } from 'lucide-react';

export default function OwnerHRPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  const [locations, setLocations] = useState([]);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [section, setSection] = useState('employees');
  const [urlInitialized, setUrlInitialized] = useState(false);

  const [loading, setLoading] = useState(true);
  const [owners, setOwners] = useState([]);
  const [staff, setStaff] = useState([]);
  const [orphanInstructors, setOrphanInstructors] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [payrollLoading, setPayrollLoading] = useState(false);

  const locationId = useMemo(() => currentLocation?.location_id || '', [currentLocation]);
  const locationNameById = useMemo(() => {
    const m = new Map();
    (locations || []).forEach((l) => m.set(l.location_id, l.name));
    return m;
  }, [locations]);

  const [statusFilter, setStatusFilter] = useState('active');
  const [employeeTab, setEmployeeTab] = useState('staff');
  const [payrollTab, setPayrollTab] = useState('staff');

  const [staffDialog, setStaffDialog] = useState({ open: false, editing: null, defaultRole: 'STAFF' });
  const [staffForm, setStaffForm] = useState({
    location_id: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    role: 'STAFF',
    employee_type: 'STAFF',
    employment_type: 'FULL_TIME',
    join_date: new Date().toISOString().split('T')[0],
    profile_image_path: null,
    notes: '',
    pay_structure: { type: 'FIXED_SALARY', base_amount: 0, currency: 'AED' },
    password: '',
  });
  const [savingStaff, setSavingStaff] = useState(false);
  const [deleteStaffDialog, setDeleteStaffDialog] = useState({ open: false, staff: null });

  const HEAD_OFFICE_LOCATION_ID = '__HEAD_OFFICE__';
  const isHeadOfficeLocation = (v) => v === HEAD_OFFICE_LOCATION_ID;
  const toFormLocationId = (v) => (v ? v : HEAD_OFFICE_LOCATION_ID);
  const toPayloadLocationId = (v) => (isHeadOfficeLocation(v) ? null : v);
  const toApiLocationIdParam = (v) => (isHeadOfficeLocation(v) ? 'head_office' : v);

  const [periodStart, setPeriodStart] = useState(new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1).toISOString().split('T')[0]);
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().split('T')[0]);
  const [payrollDialog, setPayrollDialog] = useState({ open: false });
  const [payrollForm, setPayrollForm] = useState({ staff_id: '', period_start: '', period_end: '', base_pay: 0, variable_pay: 0, bonuses: 0, deductions: 0, notes: '' });
  const [savingPayroll, setSavingPayroll] = useState(false);
  const [viewDialog, setViewDialog] = useState({ open: false, type: '', data: null });
  const [alertsDialog, setAlertsDialog] = useState({ open: false });
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alerts, setAlerts] = useState({ documents: [], visas: [], agreements: [], probation_endings: [] });

  const loadAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const params = locationId ? { location_id: locationId } : {};
      const res = await staffAPI.notificationsInbox(params);
      setAlerts(res.data || { documents: [], visas: [], agreements: [], probation_endings: [] });
    } catch {
      setAlerts({ documents: [], visas: [], agreements: [], probation_endings: [] });
    } finally {
      setAlertsLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    const load = async () => {
      try {
        const [meRes, locRes] = await Promise.all([authAPI.getMe(), locationAPI.list()]);
        setUser(meRes.data);
        setLocations(locRes.data || []);
        const qp = searchParams.get('location_id');
        const initial = !qp || qp === 'all'
          ? null
          : (locRes.data || []).find(l => l.location_id === qp) || null;
        setCurrentLocation(initial);
        const t = searchParams.get('tab');
        if (t) setSection(t);
        setUrlInitialized(true);
      } catch {
        navigate('/login', { replace: true });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [navigate, searchParams]);

  useEffect(() => {
    if (!urlInitialized) return;
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('location_id', currentLocation?.location_id || 'all');
      next.set('tab', section);
      return next;
    }, { replace: true });
  }, [currentLocation, setSearchParams, section, urlInitialized]);

  const urlTab = searchParams.get('tab') || 'employees';
  const urlLocationId = searchParams.get('location_id') || 'all';

  useEffect(() => {
    if (!urlInitialized) return;
    if (urlTab && urlTab !== section) setSection(urlTab);
    const nextLocation = urlLocationId === 'all' ? null : (locations || []).find((l) => l.location_id === urlLocationId) || null;
    const currentId = currentLocation?.location_id || 'all';
    const nextId = nextLocation?.location_id || 'all';
    if (nextId !== currentId) setCurrentLocation(nextLocation);
  }, [currentLocation?.location_id, locations, section, urlInitialized, urlLocationId, urlTab]);

  const isInstructorRole = useCallback((r) => (r || '').toUpperCase().includes('INSTRUCTOR'), []);
  const getAdminTypeLabel = useCallback((role) => {
    const r = (role || '').toString().trim().toUpperCase();
    if (r === 'OWNER' || r === 'ADMIN') return 'Admin';
    if (r === 'OWNER_FULL') return 'Admin (Full Access)';
    if (r.includes('FULL')) return 'Admin (Full Access)';
    return 'Admin';
  }, []);

  const fetchEmployees = useCallback(async () => {
    setEmployeesLoading(true);
    try {
      const staffParams = {};
      if (locationId) staffParams.location_id = locationId;
      if (statusFilter === 'active') staffParams.is_active = true;
      if (statusFilter === 'inactive') staffParams.is_active = false;
      if (statusFilter === 'deleted') staffParams.include_deleted = true;

      const ownerParams = {};
      if (statusFilter === 'active') ownerParams.is_active = true;
      if (statusFilter === 'inactive') ownerParams.is_active = false;
      if (statusFilter === 'deleted') ownerParams.include_deleted = true;

      const [staffRes, ownersRes] = await Promise.all([
        staffAPI.list(staffParams),
        hrAPI.owners(ownerParams),
      ]);

      let staffRows = staffRes.data || [];
      if (statusFilter === 'deleted') staffRows = staffRows.filter((s) => !!s.deleted_at);
      else staffRows = staffRows.filter((s) => !s.deleted_at);
      setStaff(staffRows);
      let ownerRows = ownersRes.data?.owners || [];
      if (statusFilter === 'deleted') ownerRows = ownerRows.filter((o) => !!o.deleted_at);
      else ownerRows = ownerRows.filter((o) => !o.deleted_at);
      setOwners(ownerRows);

      const instructorParams = {};
      if (statusFilter === 'active') instructorParams.is_active = true;
      if (statusFilter === 'inactive') instructorParams.is_active = false;
      if (statusFilter === 'deleted') instructorParams.include_deleted = true;

      const instructorLists = locationId
        ? [await instructorAPI.list(locationId, instructorParams).then((r) => r.data || [])]
        : await Promise.all((locations || []).map((l) => instructorAPI.list(l.location_id, instructorParams).then((r) => r.data || []).catch(() => [])));

      const instructors = instructorLists.flat();
      const staffIds = new Set(staffRows.map((s) => s.staff_id));
      const orphans = instructors.filter((i) => !i.staff_id || !staffIds.has(i.staff_id));
      setOrphanInstructors(orphans);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load employees');
      setOwners([]);
      setStaff([]);
      setOrphanInstructors([]);
    } finally {
      setEmployeesLoading(false);
    }
  }, [locationId, locations, statusFilter]);

  const fetchPayroll = useCallback(async () => {
    setPayrollLoading(true);
    try {
      const params = { period_start: periodStart, period_end: periodEnd };
      if (locationId) params.location_id = locationId;
      const res = await payrollAPI.list(params);
      setPayroll(res.data || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load payroll');
      setPayroll([]);
    } finally {
      setPayrollLoading(false);
    }
  }, [locationId, periodStart, periodEnd]);

  useEffect(() => {
    if (section === 'employees') fetchEmployees();
  }, [fetchEmployees, section]);

  useEffect(() => {
    if (section === 'payroll') {
      fetchPayroll();
      fetchEmployees();
    }
  }, [fetchEmployees, fetchPayroll, section]);

  const handleLocationSwitch = (loc) => {
    setCurrentLocation(loc);
  };

  const openCreateStaff = (defaultRole) => {
    const defaultLocationId = currentLocation?.location_id || (locations[0]?.location_id || HEAD_OFFICE_LOCATION_ID);
    setStaffForm({
      location_id: defaultLocationId,
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      role: defaultRole,
      employee_type: defaultRole?.includes('INSTRUCTOR') ? 'INSTRUCTOR' : defaultRole?.includes('RECEPTIONIST') ? 'RECEPTIONIST' : defaultRole?.includes('MANAGER') ? 'MANAGER' : defaultRole === 'ADMIN' ? 'ADMIN' : 'STAFF',
      employment_type: 'FULL_TIME',
      join_date: new Date().toISOString().split('T')[0],
      profile_image_path: null,
      notes: '',
      pay_structure: { type: 'FIXED_SALARY', base_amount: 0, currency: 'AED' },
      password: '',
    });
    setStaffDialog({ open: true, editing: null, defaultRole });
  };

  const openEditStaff = (s) => {
    setStaffForm({
      location_id: toFormLocationId(s.location_id),
      first_name: s.first_name || '',
      last_name: s.last_name || '',
      email: s.email || '',
      phone: s.phone || '',
      role: s.role || 'STAFF',
      employee_type: s.employee_type || ((s.role || '').includes('INSTRUCTOR') ? 'INSTRUCTOR' : (s.role || '').includes('RECEPTIONIST') ? 'RECEPTIONIST' : (s.role || '').includes('MANAGER') ? 'MANAGER' : 'STAFF'),
      employment_type: s.employment_type || 'FULL_TIME',
      join_date: s.join_date || new Date().toISOString().split('T')[0],
      profile_image_path: s.profile_image_path || null,
      notes: s.notes || '',
      pay_structure: s.pay_structure || { type: 'FIXED_SALARY', base_amount: 0, currency: 'AED' },
      password: '',
    });
    setStaffDialog({ open: true, editing: s, defaultRole: s.role || 'STAFF' });
  };

  const handleSaveStaff = async () => {
    if (!staffForm.first_name.trim()) { toast.error('First name required'); return; }
    if (!staffForm.location_id) { toast.error('Select a branch'); return; }
    setSavingStaff(true);
    const normalizedLocationId = toPayloadLocationId(staffForm.location_id);
    const payload = {
      ...staffForm,
      location_id: normalizedLocationId,
      email: staffForm.email.trim().toLowerCase(),
      pay_structure: {
        ...staffForm.pay_structure,
        base_amount: Number(staffForm.pay_structure?.base_amount || 0),
      },
    };
    try {
      if (staffDialog.editing) {
        const scopeLocationId = staffDialog.editing.location_id || undefined;
        await staffAPI.update(staffDialog.editing.staff_id, payload, scopeLocationId);
        toast.success('Employee updated');
      } else {
        await staffAPI.create(payload, toApiLocationIdParam(staffForm.location_id));
        toast.success('Employee added');
      }
      setStaffDialog({ open: false, editing: null, defaultRole: 'STAFF' });
      fetchEmployees();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed');
    } finally {
      setSavingStaff(false);
    }
  };

  const handleToggleStaffActive = async (s) => {
    try {
      await staffAPI.update(s.staff_id, { is_active: !s.is_active }, s.location_id);
      toast.success(s.is_active ? 'Employee deactivated' : 'Employee activated');
      fetchEmployees();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed');
    }
  };

  const handleDeleteStaff = async () => {
    if (!deleteStaffDialog.staff) return;
    setSavingStaff(true);
    try {
      await staffAPI.delete(deleteStaffDialog.staff.staff_id, deleteStaffDialog.staff.location_id);
      toast.success('Employee deleted');
      setDeleteStaffDialog({ open: false, staff: null });
      fetchEmployees();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed');
    } finally {
      setSavingStaff(false);
    }
  };

  const handleRestoreStaff = async (s) => {
    try {
      await staffAPI.restore(s.staff_id, s.location_id);
      toast.success('Employee restored');
      fetchEmployees();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed');
    }
  };

  const openCreatePayroll = () => {
    const ownerStaffIdSet = new Set((owners || []).map((o) => o.employee?.staff_id || o.staff_id).filter(Boolean));
    const eligible = staff
      .filter((s) => !s.deleted_at && s.is_active)
      .filter((s) => (
        payrollTab === 'coaches'
          ? isInstructorRole(s.role)
          : payrollTab === 'staff'
            ? !isInstructorRole(s.role)
            : payrollTab === 'owners'
              ? ownerStaffIdSet.has(s.staff_id)
              : false
      ));
    const first = eligible[0];
    setPayrollForm({
      staff_id: first?.staff_id || '',
      period_start: periodStart,
      period_end: periodEnd,
      base_pay: first?.pay_structure?.base_amount || 0,
      variable_pay: 0,
      bonuses: 0,
      deductions: 0,
      notes: '',
    });
    setPayrollDialog({ open: true });
  };

  const handlePayrollStaffChange = (sid) => {
    const s = staff.find((x) => x.staff_id === sid);
    setPayrollForm((p) => ({ ...p, staff_id: sid, base_pay: s?.pay_structure?.base_amount || 0 }));
  };

  const handleCreatePayroll = async () => {
    if (!payrollForm.staff_id) { toast.error('Select employee'); return; }
    const s = staff.find((x) => x.staff_id === payrollForm.staff_id);
    const isAdminStaff = s?.role === 'OWNER' || s?.role === 'OWNER_FULL';
    if (!isAdminStaff && !s?.location_id) { toast.error('Employee branch not found'); return; }
    setSavingPayroll(true);
    try {
      const payload = {
        ...payrollForm,
        base_pay: Number(payrollForm.base_pay || 0),
        variable_pay: Number(payrollForm.variable_pay || 0),
        bonuses: Number(payrollForm.bonuses || 0),
        deductions: Number(payrollForm.deductions || 0),
      };
      await payrollAPI.create(payload, isAdminStaff ? '' : s.location_id);
      toast.success('Payroll created');
      setPayrollDialog({ open: false });
      fetchPayroll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed');
    } finally {
      setSavingPayroll(false);
    }
  };

  const handlePayrollStatus = async (rec, status) => {
    try {
      await payrollAPI.updateStatus(rec.payroll_id, { status }, rec.location_id || '');
      toast.success(`Marked as ${status}`);
      fetchPayroll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const staffOnly = staff.filter((s) => !isInstructorRole(s.role));
  const coaches = staff.filter((s) => isInstructorRole(s.role));
  const ownerStaffIdSet = new Set((owners || []).map((o) => o.employee?.staff_id || o.staff_id).filter(Boolean));
  const staffForPayroll = staff
    .filter((s) => !s.deleted_at && s.is_active)
    .filter((s) => (
      payrollTab === 'coaches'
        ? isInstructorRole(s.role)
        : payrollTab === 'staff'
          ? !isInstructorRole(s.role)
          : payrollTab === 'owners'
            ? ownerStaffIdSet.has(s.staff_id)
            : false
    ));

  const payrollStaffIdSet = new Set(staffForPayroll.map((s) => s.staff_id));
  const filteredPayroll = payroll.filter((p) => payrollStaffIdSet.has(p.staff_id));

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col">
      <TopNav user={user} locations={locations} currentLocation={currentLocation} onLocationSwitch={handleLocationSwitch} />
      <main className="flex-1 px-6 sm:px-8 lg:px-12 py-8 max-w-[1440px] mx-auto w-full">
        <div className="mb-6">
          <h1 className="font-heading font-extrabold text-white text-4xl sm:text-5xl uppercase tracking-tight mb-2">HR</h1>
          <p className="text-zinc-500 font-body text-base">
            {currentLocation ? currentLocation.name : 'All Locations'} — Admin HR
          </p>
        </div>

        <div className="lg:hidden mb-6">
          <div className="bg-zinc-950 border border-zinc-800 rounded-sm p-2 flex flex-wrap gap-2">
            {[
              { key: 'employees', label: 'Employees' },
              { key: 'payroll', label: 'Payroll' },
              { key: 'attendance', label: 'Employee Attendance' },
              { key: 'performance', label: 'Performance' },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setSection(item.key)}
                className={`px-3 py-2 rounded-sm text-xs font-heading uppercase tracking-wider transition-colors ${
                  section === item.key ? 'bg-red-600/10 text-red-400' : 'bg-zinc-900/60 text-zinc-500 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

            {section === 'employees' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Status</Label>
                    <div className="flex gap-1">
                      {['active', 'inactive', 'deleted'].map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setStatusFilter(f)}
                          className={`px-3 py-1.5 rounded-sm text-xs font-heading uppercase tracking-wider transition-colors ${
                            statusFilter === f ? 'bg-zinc-700 text-white' : 'bg-zinc-900/50 text-zinc-500 hover:text-white'
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {employeeTab !== 'owners' && (
                      <button
                        type="button"
                        onClick={() => openCreateStaff(employeeTab === 'coaches' ? 'INSTRUCTOR' : 'STAFF')}
                        className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm transition-all active:scale-95 flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" strokeWidth={1.5} />
                        Add Employee
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setAlertsDialog({ open: true }); loadAlerts(); }}
                      className="bg-transparent border border-zinc-800 text-zinc-300 hover:border-zinc-700 font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm transition-all active:scale-95 flex items-center gap-2"
                    >
                      <Bell className="w-4 h-4" strokeWidth={1.5} />
                      Alerts
                    </button>
                  </div>
                </div>

                <Tabs value={employeeTab} onValueChange={setEmployeeTab}>
                  <TabsList className="bg-zinc-900 border border-zinc-800">
                    <TabsTrigger value="owners">Admins</TabsTrigger>
                    <TabsTrigger value="staff">Staff</TabsTrigger>
                    <TabsTrigger value="coaches">Coaches / Instructors</TabsTrigger>
                  </TabsList>

                  <TabsContent value="owners" className="mt-4">
                    {employeesLoading ? (
                      <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-zinc-600 animate-spin" /></div>
                    ) : owners.length === 0 ? (
                      <div className="border border-dashed border-zinc-800 rounded-sm p-12 text-center text-zinc-500">No admins found.</div>
                    ) : (
                      <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-zinc-800">
                              <th className="text-left p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Admin</th>
                              <th className="text-left p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs hidden sm:table-cell">Email</th>
                              <th className="text-left p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Admin Roles</th>
                              <th className="text-center p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Status</th>
                              <th className="text-right p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {owners.map((o) => (
                              <tr key={o.user_id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                                <td className="p-3 text-white text-sm">{o.name || '—'}</td>
                                <td className="p-3 text-zinc-400 text-sm hidden sm:table-cell">{o.email || '—'}</td>
                                <td className="p-3 text-zinc-300 text-sm">
                                  {Array.isArray(o.admin_roles) && o.admin_roles.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {o.admin_roles.map((r, idx) => (
                                        <span key={r?.role_id || idx} className="px-2 py-0.5 bg-zinc-800 rounded text-xs text-white">
                                          {r?.name || r?.code || '—'}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-zinc-800 rounded text-xs text-white">{getAdminTypeLabel(o.role)}</span>
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  <Badge
                                    className={o.deleted_at
                                      ? 'bg-red-600/10 text-red-300 border-0'
                                      : ((o.is_active ?? true)
                                        ? 'bg-emerald-500/20 text-emerald-400 border-0'
                                        : 'bg-zinc-700/50 text-zinc-400 border-0')}
                                  >
                                    {o.deleted_at ? 'Deleted' : ((o.is_active ?? true) ? 'Active' : 'Inactive')}
                                  </Badge>
                                </td>
                                <td className="p-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const sid = o?.employee?.staff_id || o?.staff_id;
                                      if (sid) {
                                        const lid = o?.employee?.location_id || o?.location_id || '';
                                        const qp = lid ? `?location_id=${encodeURIComponent(lid)}` : '';
                                        navigate(`/hr/employees/${sid}${qp}`);
                                        return;
                                      }
                                      setViewDialog({ open: true, type: 'admin', data: o });
                                    }}
                                    className="text-zinc-300 hover:text-white text-xs"
                                  >
                                    View
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="staff" className="mt-4">
                    <StaffTable
                      loading={employeesLoading}
                      rows={staffOnly}
                      locationNameById={locationNameById}
                      onView={(s) => {
                        const lid = s?.location_id || locationId || '';
                        const qp = lid ? `?location_id=${encodeURIComponent(lid)}` : '';
                        navigate(`/hr/employees/${s.staff_id}${qp}`);
                      }}
                      onEdit={openEditStaff}
                      onToggleActive={handleToggleStaffActive}
                      onDelete={(s) => setDeleteStaffDialog({ open: true, staff: s })}
                      onRestore={handleRestoreStaff}
                    />
                  </TabsContent>

                  <TabsContent value="coaches" className="mt-4 space-y-4">
                    <StaffTable
                      loading={employeesLoading}
                      rows={coaches}
                      locationNameById={locationNameById}
                      onView={(s) => {
                        const lid = s?.location_id || locationId || '';
                        const qp = lid ? `?location_id=${encodeURIComponent(lid)}` : '';
                        navigate(`/hr/employees/${s.staff_id}${qp}`);
                      }}
                      onEdit={openEditStaff}
                      onToggleActive={handleToggleStaffActive}
                      onDelete={(s) => setDeleteStaffDialog({ open: true, staff: s })}
                      onRestore={handleRestoreStaff}
                    />
                    {!employeesLoading && orphanInstructors.length > 0 && (
                      <div className="bg-zinc-900/30 border border-zinc-800 rounded-sm overflow-x-auto">
                        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                          <div className="text-white font-heading uppercase tracking-wider text-xs">Unlinked Instructors</div>
                          <div className="text-zinc-500 text-xs font-body">Created from Programs module (no staff record)</div>
                        </div>
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-zinc-800">
                              <th className="text-left p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Instructor</th>
                              <th className="text-left p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs hidden sm:table-cell">Email</th>
                              <th className="text-left p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs hidden sm:table-cell">Phone</th>
                              <th className="text-left p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Branch</th>
                              <th className="text-center p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Status</th>
                              <th className="text-right p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {orphanInstructors.map((i) => (
                              <tr key={i.instructor_id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                                <td className="p-3 text-white text-sm">{i.full_name || '—'}</td>
                                <td className="p-3 text-zinc-400 text-sm hidden sm:table-cell">{i.email || '—'}</td>
                                <td className="p-3 text-zinc-400 text-sm hidden sm:table-cell">{i.phone || '—'}</td>
                                <td className="p-3 text-zinc-300 text-sm">{locationNameById.get(i.location_id) || i.location_id || '—'}</td>
                                <td className="p-3 text-center">
                                  <Badge className={(i.is_active ?? true) ? 'bg-emerald-500/20 text-emerald-400 border-0' : 'bg-zinc-700/50 text-zinc-400 border-0'}>
                                    {(i.is_active ?? true) ? 'Active' : 'Inactive'}
                                  </Badge>
                                </td>
                                <td className="p-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => setViewDialog({ open: true, type: 'instructor', data: i })}
                                    className="text-zinc-300 hover:text-white text-xs"
                                  >
                                    View
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            )}

            {section === 'payroll' && (
              <div className="space-y-5">
                <Tabs value={payrollTab} onValueChange={setPayrollTab}>
                  <TabsList className="bg-zinc-900 border border-zinc-800">
                    <TabsTrigger value="owners">Admins</TabsTrigger>
                    <TabsTrigger value="staff">Staff</TabsTrigger>
                    <TabsTrigger value="coaches">Coaches / Instructors</TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="flex items-end justify-between gap-4 flex-wrap">
                  <div className="flex gap-4">
                    <div className="space-y-1">
                      <Label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">From</Label>
                      <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-9 text-xs w-36" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">To</Label>
                      <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-9 text-xs w-36" />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={openCreatePayroll}
                    disabled={staffForPayroll.length === 0}
                    className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm transition-all active:scale-95 flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" strokeWidth={1.5} />
                    Create Payroll
                  </button>
                </div>

                {payrollLoading ? (
                  <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-zinc-600 animate-spin" /></div>
                ) : filteredPayroll.length === 0 ? (
                  <div className="border border-dashed border-zinc-800 rounded-sm p-12 text-center text-zinc-500">No payroll records.</div>
                ) : (
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-zinc-800">
                          {!locationId && <th className="text-left p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Branch</th>}
                          <th className="text-left p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Employee</th>
                          <th className="text-left p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs hidden sm:table-cell">Period</th>
                          <th className="text-right p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Base</th>
                          <th className="text-right p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs hidden md:table-cell">Bonus</th>
                          <th className="text-right p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Total</th>
                          <th className="text-center p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Status</th>
                          <th className="text-right p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPayroll.map((p) => (
                          <tr key={p.payroll_id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                            {!locationId && <td className="p-3 text-zinc-300 text-sm">{locationNameById.get(p.location_id) || p.location_id || '—'}</td>}
                            <td className="p-3 text-white text-sm">{p.staff_name || p.staff_id}</td>
                            <td className="p-3 text-zinc-400 text-xs hidden sm:table-cell">{p.period_start} — {p.period_end}</td>
                            <td className="p-3 text-right text-zinc-300 text-sm">{Number(p.base_pay || 0).toLocaleString()}</td>
                            <td className="p-3 text-right text-zinc-400 text-sm hidden md:table-cell">{Number(p.bonuses || 0).toLocaleString()}</td>
                            <td className="p-3 text-right text-white text-sm font-medium">{Number(p.total_payable || 0).toLocaleString()} {p.currency || 'AED'}</td>
                            <td className="p-3 text-center">
                              <Badge className={p.status === 'PAID' ? 'bg-emerald-500/20 text-emerald-400 border-0' : p.status === 'APPROVED' ? 'bg-amber-500/20 text-amber-400 border-0' : 'bg-zinc-700/50 text-zinc-400 border-0'}>
                                {p.status || '—'}
                              </Badge>
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {p.status === 'DRAFT' && (
                                  <button
                                    type="button"
                                    onClick={() => handlePayrollStatus(p, 'APPROVED')}
                                    className="text-amber-400 hover:text-amber-300 p-1"
                                  >
                                    Approve
                                  </button>
                                )}
                                {p.status === 'APPROVED' && (
                                  <button
                                    type="button"
                                    onClick={() => handlePayrollStatus(p, 'PAID')}
                                    className="text-emerald-400 hover:text-emerald-300 p-1"
                                  >
                                    Mark Paid
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {section === 'attendance' && (
              <div className="border border-dashed border-zinc-800 rounded-sm p-12 text-center text-zinc-500">
                Employee attendance tracking is not available yet.
              </div>
            )}

            {section === 'performance' && (
              <div className="border border-dashed border-zinc-800 rounded-sm p-12 text-center text-zinc-500">
                Performance module is not available yet.
              </div>
            )}

        <Dialog open={staffDialog.open} onOpenChange={(open) => setStaffDialog((d) => ({ ...d, open }))}>
          <DialogContent className="bg-zinc-950 border-zinc-800 text-white">
            <DialogHeader>
              <DialogTitle className="font-heading uppercase tracking-wider">{staffDialog.editing ? 'Edit Employee' : 'Add Employee'}</DialogTitle>
              <DialogDescription className="text-zinc-500">
                {staffDialog.editing ? 'Update employee details.' : 'Create a new employee record.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Branch</Label>
                <Select value={staffForm.location_id} onValueChange={(v) => setStaffForm((f) => ({ ...f, location_id: v }))}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white text-sm h-10">
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value={HEAD_OFFICE_LOCATION_ID}>Head Office</SelectItem>
                    {(locations || []).map((l) => (
                      <SelectItem key={l.location_id} value={l.location_id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">First Name</Label>
                <Input value={staffForm.first_name} onChange={(e) => setStaffForm((f) => ({ ...f, first_name: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Last Name</Label>
                <Input value={staffForm.last_name} onChange={(e) => setStaffForm((f) => ({ ...f, last_name: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Email</Label>
                <Input value={staffForm.email} onChange={(e) => setStaffForm((f) => ({ ...f, email: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Phone</Label>
                <Input value={staffForm.phone} onChange={(e) => setStaffForm((f) => ({ ...f, phone: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Role</Label>
                <Select value={staffForm.role} onValueChange={(v) => setStaffForm((f) => ({ ...f, role: v }))}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white text-sm h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="ADMIN">Manager</SelectItem>
                    <SelectItem value="RECEPTIONIST">Receptionist</SelectItem>
                    <SelectItem value="STAFF">Staff</SelectItem>
                    <SelectItem value="INSTRUCTOR">Coach / Instructor</SelectItem>
                    <SelectItem value="MANAGER_ASSISTANT">Manager Assistant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Employee Type</Label>
                <Select value={staffForm.employee_type} onValueChange={(v) => setStaffForm((f) => ({ ...f, employee_type: v }))}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white text-sm h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="MANAGER">Manager</SelectItem>
                    <SelectItem value="RECEPTIONIST">Receptionist</SelectItem>
                    <SelectItem value="STAFF">Staff</SelectItem>
                    <SelectItem value="INSTRUCTOR">Coach / Instructor</SelectItem>
                    <SelectItem value="EXTERNAL">Outside Company / External</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Employment Type</Label>
                <Select value={staffForm.employment_type} onValueChange={(v) => setStaffForm((f) => ({ ...f, employment_type: v }))}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white text-sm h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="FULL_TIME">Full Time</SelectItem>
                    <SelectItem value="PART_TIME">Part Time</SelectItem>
                    <SelectItem value="CONTRACT">Contract-based</SelectItem>
                    <SelectItem value="CONTRACTOR">Contractor</SelectItem>
                    <SelectItem value="EXTERNAL">External</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Join Date</Label>
                <Input type="date" value={staffForm.join_date} onChange={(e) => setStaffForm((f) => ({ ...f, join_date: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Base Salary (AED)</Label>
                <Input
                  type="number"
                  value={staffForm.pay_structure?.base_amount ?? 0}
                  onChange={(e) => setStaffForm((f) => ({ ...f, pay_structure: { ...(f.pay_structure || {}), base_amount: e.target.value } }))}
                  className="bg-zinc-950 border-zinc-800 text-white"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Profile Image</Label>
                <FileUpload
                  value={staffForm.profile_image_path}
                  onChange={(v) => setStaffForm((f) => ({ ...f, profile_image_path: v }))}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Notes</Label>
                <Input value={staffForm.notes} onChange={(e) => setStaffForm((f) => ({ ...f, notes: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white" />
              </div>
              {!staffDialog.editing && (
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Create Login Password (optional)</Label>
                  <Input type="password" value={staffForm.password} onChange={(e) => setStaffForm((f) => ({ ...f, password: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white" />
                </div>
              )}
            </div>
            <DialogFooter>
              <button
                type="button"
                onClick={handleSaveStaff}
                disabled={savingStaff}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm"
              >
                {savingStaff ? 'Saving...' : 'Save'}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteStaffDialog.open} onOpenChange={(open) => setDeleteStaffDialog((d) => ({ ...d, open }))}>
          <DialogContent className="bg-zinc-950 border-zinc-800 text-white">
            <DialogHeader>
              <DialogTitle className="font-heading uppercase tracking-wider">Delete Employee</DialogTitle>
              <DialogDescription className="text-zinc-500">This will move the employee to deleted status. You can restore later.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button
                type="button"
                onClick={() => setDeleteStaffDialog({ open: false, staff: null })}
                className="bg-zinc-800 hover:bg-zinc-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteStaff}
                disabled={savingStaff}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm"
              >
                {savingStaff ? 'Deleting...' : 'Delete'}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={payrollDialog.open} onOpenChange={(open) => setPayrollDialog({ open })}>
          <DialogContent className="bg-zinc-950 border-zinc-800 text-white">
            <DialogHeader>
              <DialogTitle className="font-heading uppercase tracking-wider">Create Payroll</DialogTitle>
              <DialogDescription className="text-zinc-500">Create a payroll record for an employee.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Employee</Label>
                <Select value={payrollForm.staff_id} onValueChange={handlePayrollStaffChange}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white text-sm h-10">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {staffForPayroll.map((s) => (
                      <SelectItem key={s.staff_id} value={s.staff_id}>
                        {s.first_name} {s.last_name}{!locationId ? ` — ${s.location_id ? (locationNameById.get(s.location_id) || s.location_id) : 'Head Office'}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Period Start</Label>
                  <Input type="date" value={payrollForm.period_start} onChange={(e) => setPayrollForm((f) => ({ ...f, period_start: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Period End</Label>
                  <Input type="date" value={payrollForm.period_end} onChange={(e) => setPayrollForm((f) => ({ ...f, period_end: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Base Pay</Label>
                  <Input type="number" value={payrollForm.base_pay} onChange={(e) => setPayrollForm((f) => ({ ...f, base_pay: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Variable Pay</Label>
                  <Input type="number" value={payrollForm.variable_pay} onChange={(e) => setPayrollForm((f) => ({ ...f, variable_pay: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Bonuses</Label>
                  <Input type="number" value={payrollForm.bonuses} onChange={(e) => setPayrollForm((f) => ({ ...f, bonuses: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Deductions</Label>
                  <Input type="number" value={payrollForm.deductions} onChange={(e) => setPayrollForm((f) => ({ ...f, deductions: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Notes</Label>
                <Input value={payrollForm.notes} onChange={(e) => setPayrollForm((f) => ({ ...f, notes: e.target.value }))} className="bg-zinc-950 border-zinc-800 text-white" />
              </div>
            </div>
            <DialogFooter>
              <button
                type="button"
                onClick={handleCreatePayroll}
                disabled={savingPayroll}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm"
              >
                {savingPayroll ? 'Creating...' : 'Create'}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={viewDialog.open} onOpenChange={(open) => setViewDialog((d) => ({ ...d, open }))}>
          <DialogContent className="bg-zinc-950 border-zinc-800 text-white">
            <DialogHeader>
              <DialogTitle className="font-heading uppercase tracking-wider">Employee Details</DialogTitle>
              <DialogDescription className="text-zinc-500">View employee information.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              {viewDialog.type === 'admin' && viewDialog.data && (
                <>
                  <div className="flex justify-between gap-4"><span className="text-zinc-500">Name</span><span className="text-white">{viewDialog.data.name || '—'}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-zinc-500">Email</span><span className="text-white">{viewDialog.data.email || '—'}</span></div>
                  <div className="flex justify-between gap-4">
                    <span className="text-zinc-500">Admin Roles</span>
                    <span className="text-white">
                      {Array.isArray(viewDialog.data.admin_roles) && viewDialog.data.admin_roles.length > 0
                        ? viewDialog.data.admin_roles.map((r) => r?.name || r?.code).filter(Boolean).join(', ')
                        : getAdminTypeLabel(viewDialog.data.role)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4"><span className="text-zinc-500">Status</span><span className="text-white">{(viewDialog.data.is_active ?? true) ? 'Active' : 'Inactive'}</span></div>
                </>
              )}
              {viewDialog.type === 'staff' && viewDialog.data && (
                <>
                  <div className="flex justify-between gap-4"><span className="text-zinc-500">Name</span><span className="text-white">{viewDialog.data.first_name} {viewDialog.data.last_name}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-zinc-500">Role</span><span className="text-white">{viewDialog.data.role || '—'}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-zinc-500">Branch</span><span className="text-white">{locationNameById.get(viewDialog.data.location_id) || viewDialog.data.location_id || '—'}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-zinc-500">Email</span><span className="text-white">{viewDialog.data.email || '—'}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-zinc-500">Phone</span><span className="text-white">{viewDialog.data.phone || '—'}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-zinc-500">Status</span><span className="text-white">{viewDialog.data.deleted_at ? 'Deleted' : (viewDialog.data.is_active ? 'Active' : 'Inactive')}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-zinc-500">Employment</span><span className="text-white">{viewDialog.data.employment_type || '—'}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-zinc-500">Join Date</span><span className="text-white">{viewDialog.data.join_date || '—'}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-zinc-500">Base Salary</span><span className="text-white">{Number(viewDialog.data.pay_structure?.base_amount || 0).toLocaleString()} {(viewDialog.data.pay_structure?.currency || 'AED')}</span></div>
                </>
              )}
              {viewDialog.type === 'instructor' && viewDialog.data && (
                <>
                  <div className="flex justify-between gap-4"><span className="text-zinc-500">Name</span><span className="text-white">{viewDialog.data.full_name || '—'}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-zinc-500">Branch</span><span className="text-white">{locationNameById.get(viewDialog.data.location_id) || viewDialog.data.location_id || '—'}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-zinc-500">Email</span><span className="text-white">{viewDialog.data.email || '—'}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-zinc-500">Phone</span><span className="text-white">{viewDialog.data.phone || '—'}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-zinc-500">Status</span><span className="text-white">{(viewDialog.data.is_active ?? true) ? 'Active' : 'Inactive'}</span></div>
                </>
              )}
            </div>
            <DialogFooter>
              <button
                type="button"
                onClick={() => setViewDialog({ open: false, type: '', data: null })}
                className="bg-zinc-800 hover:bg-zinc-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm"
              >
                Close
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={alertsDialog.open} onOpenChange={(open) => setAlertsDialog((d) => ({ ...d, open }))}>
          <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-heading uppercase tracking-wider">Expiring Alerts</DialogTitle>
              <DialogDescription className="text-zinc-500">Agreements, documents, visas, and probation ending soon.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={loadAlerts}
                  disabled={alertsLoading}
                  className="bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white font-heading font-bold uppercase tracking-wider px-3 py-2 rounded-sm text-xs"
                >
                  {alertsLoading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>

              <div>
                <div className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider mb-2">Probation Ending (7 days)</div>
                {(alerts.probation_endings || []).length === 0 ? (
                  <div className="text-zinc-500 text-sm">No upcoming probation endings.</div>
                ) : (
                  <div className="space-y-2">
                    {(alerts.probation_endings || []).slice(0, 50).map((p) => (
                      <div key={p.staff_probation_id} className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-white text-sm">{p.staff?.employee_code || p.staff_id} • {(p.staff?.first_name || '')} {(p.staff?.last_name || '')}</div>
                          <div className="text-zinc-500 text-xs">{p.days_left < 0 ? 'OVERDUE' : `${p.days_left} days`}</div>
                        </div>
                        <div className="text-zinc-600 text-xs mt-1">End: {p.end_date || '—'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider mb-2">Agreements Expiring</div>
                {(alerts.agreements || []).length === 0 ? (
                  <div className="text-zinc-500 text-sm">No expiring agreements.</div>
                ) : (
                  <div className="space-y-2">
                    {(alerts.agreements || []).slice(0, 50).map((a) => (
                      <div key={a.staff_agreement_id} className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-white text-sm">{a.staff_id} • {a.agreement_type || 'Agreement'}</div>
                          <div className="text-zinc-500 text-xs">{a.days_left != null ? `${a.days_left} days` : ''}</div>
                        </div>
                        <div className="text-zinc-600 text-xs mt-1">Expiry: {a.end_date || '—'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider mb-2">Documents Expiring</div>
                  {(alerts.documents || []).length === 0 ? (
                    <div className="text-zinc-500 text-sm">No expiring documents.</div>
                  ) : (
                    <div className="space-y-2">
                      {(alerts.documents || []).slice(0, 25).map((d) => (
                        <div key={d.staff_document_id} className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-3">
                          <div className="text-white text-sm">{d.staff_id} • {d.document_type}</div>
                          <div className="text-zinc-600 text-xs mt-1">Expiry: {d.expiry_date || '—'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider mb-2">Visas Expiring</div>
                  {(alerts.visas || []).length === 0 ? (
                    <div className="text-zinc-500 text-sm">No expiring visas.</div>
                  ) : (
                    <div className="space-y-2">
                      {(alerts.visas || []).slice(0, 25).map((v) => (
                        <div key={v.staff_visa_id} className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-3">
                          <div className="text-white text-sm">{v.staff_id} • Visa</div>
                          <div className="text-zinc-600 text-xs mt-1">Expiry: {v.expiry_date || '—'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <DialogFooter>
              <button
                type="button"
                onClick={() => setAlertsDialog({ open: false })}
                className="bg-zinc-800 hover:bg-zinc-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm"
              >
                Close
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

function StaffTable({ loading, rows, locationNameById, onView, onEdit, onToggleActive, onDelete, onRestore }) {
  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-zinc-600 animate-spin" /></div>;
  }
  if (!rows || rows.length === 0) {
    return <div className="border border-dashed border-zinc-800 rounded-sm p-12 text-center text-zinc-500">No employees found.</div>;
  }
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="text-left p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Employee</th>
            <th className="text-left p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Role</th>
            <th className="text-left p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs hidden sm:table-cell">Email</th>
            <th className="text-left p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs hidden sm:table-cell">Phone</th>
            <th className="text-left p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Branch</th>
            <th className="text-center p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Status</th>
            <th className="text-right p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.staff_id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
              <td className="p-3 text-white text-sm">{s.first_name} {s.last_name}</td>
              <td className="p-3 text-zinc-300 text-sm">{s.role || '—'}</td>
              <td className="p-3 text-zinc-400 text-sm hidden sm:table-cell">{s.email || '—'}</td>
              <td className="p-3 text-zinc-400 text-sm hidden sm:table-cell">{s.phone || '—'}</td>
              <td className="p-3 text-zinc-300 text-sm">{locationNameById.get(s.location_id) || s.location_id || '—'}</td>
              <td className="p-3 text-center">
                {s.deleted_at ? (
                  <Badge className="bg-red-600/20 text-red-400 border-0">Deleted</Badge>
                ) : (
                  <button
                    type="button"
                    onClick={() => onToggleActive?.(s)}
                    className={`px-2 py-0.5 rounded-sm font-heading uppercase text-[10px] border transition-colors ${
                      s.is_active
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30'
                        : 'bg-zinc-700/50 text-zinc-500 border-zinc-600 hover:bg-zinc-700'
                    }`}
                  >
                    {s.is_active ? 'Active' : 'Inactive'}
                  </button>
                )}
              </td>
              <td className="p-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  {s.deleted_at ? (
                    <>
                      <button type="button" onClick={() => onView?.(s)} className="text-zinc-300 hover:text-white text-xs">View</button>
                      <button type="button" onClick={() => onRestore?.(s)} className="text-emerald-400 hover:text-emerald-300 text-xs">Restore</button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => onView?.(s)} className="text-zinc-300 hover:text-white text-xs">View</button>
                      <button type="button" onClick={() => onEdit?.(s)} className="text-zinc-300 hover:text-white text-xs">Edit</button>
                      <button type="button" onClick={() => onDelete?.(s)} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
