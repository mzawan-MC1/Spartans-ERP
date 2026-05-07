import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ManagerLayout from '@/components/ManagerLayout';
import { staffAPI, rolesAPI, locationAPI } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import FileUpload from '@/components/FileUpload';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, User, Phone, Mail, DollarSign, Filter, RotateCcw, Eye, EyeOff, ArrowRightLeft, Bell } from 'lucide-react';
import { ActionTooltip } from '@/components/ui/tooltip';

export default function StaffPage() {
  return <ManagerLayout>{({ location }) => <StaffContent location={location} />}</ManagerLayout>;
}

const EMPLOYEE_TYPES = ['ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'INSTRUCTOR', 'EXTERNAL'];
const EMP_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'CONTRACTOR', 'EXTERNAL'];
const FALLBACK_ROLES = [
  { code: 'INSTRUCTOR', name: 'Instructor – Standard' },
  { code: 'RECEPTIONIST_FULL', name: 'Receptionist – Full Access' },
  { code: 'MANAGER_OPS', name: 'Manager – Operations' },
  { code: 'MANAGER_FRONTDESK', name: 'Manager – Front Desk' },
  { code: 'MANAGER_FULL', name: 'Manager – Full Access' },
];
const EMPTY = {
  first_name: '', last_name: '', email: '', phone: '', role: 'INSTRUCTOR',
  employee_type: 'INSTRUCTOR',
  employment_type: 'FULL_TIME', join_date: new Date().toISOString().split('T')[0],
  profile_image_path: null, notes: '',
  pay_structure: { type: 'FIXED_SALARY', base_amount: 0, currency: 'AED' },
  password: ''
};

function StaffContent({ location }) {
  const navigate = useNavigate();
  const [staff, setStaff] = useState([]);
  const [roles, setRoles] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState({ open: false, editing: null });
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, staff: null });
  const [transferDialog, setTransferDialog] = useState({ open: false, staff: null });
  const [alertsDialog, setAlertsDialog] = useState({ open: false });
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alerts, setAlerts] = useState({ documents: [], visas: [], agreements: [], probation_endings: [] });
  const [transferToLocationId, setTransferToLocationId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Filter states
  const [statusFilter, setStatusFilter] = useState('active'); // 'active', 'inactive', 'deleted', 'all'
  const [employeeTypeFilter, setEmployeeTypeFilter] = useState('');
  const [employmentTypeFilter, setEmploymentTypeFilter] = useState('');
  
  const backendUrl = process.env.REACT_APP_BACKEND_URL;
  const locationId = location?.location_id;

  const fetchStaff = useCallback(async () => {
    if (!locationId) return;
    try { 
      const params = { location_id: locationId };
      if (statusFilter === 'active') {
        params.is_active = true;
      } else if (statusFilter === 'inactive') {
        params.is_active = false;
      } else if (statusFilter === 'deleted') {
        params.include_deleted = true;
      }
      if (employeeTypeFilter) params.employee_type = employeeTypeFilter;
      if (employmentTypeFilter) params.employment_type = employmentTypeFilter;
      
      // Fetch staff
      const staffRes = await staffAPI.list(params);
      let data = staffRes.data;
      
      // Client-side filter for deleted vs non-deleted
      if (statusFilter === 'deleted') {
        data = data.filter(s => s.deleted_at);
      } else if (statusFilter !== 'deleted') {
        data = data.filter(s => !s.deleted_at);
      }
      setStaff(data);
      
      // Fetch roles separately so failure doesn't block staff list
      try {
        const rolesRes = await rolesAPI.list();
        const loadedRoles = rolesRes.data.roles || [];
        setRoles(loadedRoles.length > 0 ? loadedRoles : FALLBACK_ROLES);
      } catch (err) {
        console.error("Failed to load roles:", err);
        setRoles(FALLBACK_ROLES);
      }
    }
    catch (err) {  
      console.error(err); 
      toast.error("Failed to load staff list");
    } 
    finally { setLoading(false); }
  }, [statusFilter, employeeTypeFilter, employmentTypeFilter, locationId]);

  const loadAlerts = async () => {
    setAlertsLoading(true);
    try {
      const res = await staffAPI.notificationsInbox({ location_id: locationId });
      setAlerts(res.data || { documents: [], visas: [], agreements: [], probation_endings: [] });
    } catch {
      setAlerts({ documents: [], visas: [], agreements: [], probation_endings: [] });
    } finally {
      setAlertsLoading(false);
    }
  };

  useEffect(() => { fetchStaff(); }, [fetchStaff]);
  useEffect(() => {
    const loadLocations = async () => {
      try {
        const res = await locationAPI.list();
        setLocations(res.data || []);
      } catch {
        setLocations([]);
      }
    };
    loadLocations();
  }, []);

  const openCreate = () => { setForm(EMPTY); setDialog({ open: true, editing: null }); setShowPassword(false); };
  const openEdit = (s) => {
    setForm({
      first_name: s.first_name, last_name: s.last_name, email: s.email, phone: s.phone,
      role: s.role, employee_type: s.employee_type || EMPTY.employee_type, employment_type: s.employment_type, join_date: s.join_date,
      profile_image_path: s.profile_image_path, notes: s.notes,
      pay_structure: s.pay_structure || EMPTY.pay_structure,
      password: '',
    });
    setDialog({ open: true, editing: s });
    setShowPassword(false);
  };

  const handleSave = async () => {
    if (!form.first_name.trim()) { toast.error('First name required'); return; }
    setSaving(true);
    const payload = { ...form, email: form.email.trim().toLowerCase() };
    try {
      if (dialog.editing) {
        await staffAPI.update(dialog.editing.staff_id, payload, locationId);
        toast.success('Staff updated');
      } else {
        await staffAPI.create(payload, locationId);
        toast.success('Staff added');
      }
      setDialog({ open: false, editing: null });
      fetchStaff();
    } catch (err) { toast.error(err.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleToggleStatus = async (s) => {
    try {
      if (s.is_active) {
        await staffAPI.update(s.staff_id, { is_active: false }, locationId);
        toast.success('Staff deactivated');
      } else {
        await staffAPI.update(s.staff_id, { is_active: true }, locationId);
        toast.success('Staff activated');
      }
      fetchStaff();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
  };

  const handleDelete = async () => {
    if (!deleteDialog.staff) return;
    setSaving(true);
    try {
      await staffAPI.delete(deleteDialog.staff.staff_id, locationId);
      toast.success('Staff deleted');
      setDeleteDialog({ open: false, staff: null });
      fetchStaff();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleRestore = async (s) => {
    try {
      await staffAPI.restore(s.staff_id, locationId);
      toast.success('Staff restored');
      fetchStaff();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
  };

  const openTransfer = (s) => {
    setTransferToLocationId('');
    setTransferDialog({ open: true, staff: s });
  };

  const handleTransfer = async () => {
    const s = transferDialog.staff;
    if (!s) return;
    if (!transferToLocationId) { toast.error('Select a target location'); return; }
    setSaving(true);
    try {
      await staffAPI.transfer(s.staff_id, { to_location_id: transferToLocationId }, locationId);
      toast.success('Coach transferred');
      setTransferDialog({ open: false, staff: null });
      fetchStaff();
    } catch (err) { toast.error(err.response?.data?.detail || 'Transfer failed'); }
    finally { setSaving(false); }
  };

  const roleColor = (r) => {
    const m = { INSTRUCTOR: 'text-red-400 bg-red-600/10', RECEPTIONIST: 'text-blue-400 bg-blue-600/10', MANAGER_ASSISTANT: 'text-amber-400 bg-amber-600/10', ADMIN: 'text-emerald-400 bg-emerald-600/10' };
    return m[r] || 'text-zinc-400 bg-zinc-800';
  };

  // Count by status for filter badges
  const activeCount = staff.filter(s => s.is_active && !s.deleted_at).length;
  const inactiveCount = staff.filter(s => !s.is_active && !s.deleted_at).length;

  return (
    <div data-testid="staff-page" className="p-6 sm:p-8 lg:p-10 max-w-[1200px]">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading font-extrabold text-white text-4xl sm:text-5xl uppercase tracking-tight">Staff</h1>
          <p className="text-zinc-500 font-body mt-1 text-base">Manage your team</p>
        </div>
        <button data-testid="add-staff-btn" onClick={openCreate}
          className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm transition-all active:scale-95 flex items-center gap-2">
          <Plus className="w-4 h-4" strokeWidth={1.5} /> Add Staff
        </button>
      </div>

      {/* Filter Row */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-2 text-zinc-400">
          <Filter className="w-4 h-4" />
          <span className="text-xs font-heading uppercase tracking-wider">Status:</span>
        </div>
        {['active', 'inactive', 'deleted'].map((filter) => (
          <button
            key={filter}
            data-testid={`filter-${filter}`}
            onClick={() => setStatusFilter(filter)}
            className={`px-3 py-1.5 rounded-sm text-xs font-heading uppercase tracking-wider transition-colors ${
              statusFilter === filter 
                ? filter === 'deleted' 
                  ? 'bg-red-600/20 text-red-400 border border-red-500/30' 
                  : 'bg-zinc-700 text-white' 
                : 'bg-zinc-800/50 text-zinc-500 hover:text-white'
            }`}
          >
            {filter}
          </button>
        ))}

        <div className="flex items-center gap-2 text-zinc-400 ml-0 sm:ml-4">
          <span className="text-xs font-heading uppercase tracking-wider">Employee type:</span>
        </div>
        <Select value={employeeTypeFilter} onValueChange={setEmployeeTypeFilter}>
          <SelectTrigger className="w-[180px] bg-zinc-900 border-zinc-800 text-white">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800">
            <SelectItem value="" className="text-zinc-300 focus:bg-zinc-800 focus:text-white">All</SelectItem>
            {EMPLOYEE_TYPES.map(t => (<SelectItem key={t} value={t} className="text-zinc-300 focus:bg-zinc-800 focus:text-white">{t}</SelectItem>))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 text-zinc-400">
          <span className="text-xs font-heading uppercase tracking-wider">Employment:</span>
        </div>
        <Select value={employmentTypeFilter} onValueChange={setEmploymentTypeFilter}>
          <SelectTrigger className="w-[180px] bg-zinc-900 border-zinc-800 text-white">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800">
            <SelectItem value="" className="text-zinc-300 focus:bg-zinc-800 focus:text-white">All</SelectItem>
            {EMP_TYPES.map(t => (<SelectItem key={t} value={t} className="text-zinc-300 focus:bg-zinc-800 focus:text-white">{t.replace('_', ' ')}</SelectItem>))}
          </SelectContent>
        </Select>

        <button onClick={() => { setAlertsDialog({ open: true }); loadAlerts(); }} className="ml-0 sm:ml-auto bg-transparent border border-zinc-800 text-zinc-300 font-heading uppercase tracking-wide px-3 py-2 rounded-sm text-xs hover:border-zinc-700 flex items-center gap-2">
          <Bell className="w-4 h-4" strokeWidth={1.5} />
          Alerts
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : staff.length === 0 ? (
        <div className="border border-dashed border-zinc-800 rounded-sm p-16 text-center">
          <p className="text-zinc-500 font-heading uppercase tracking-wider text-sm">
            {statusFilter === 'deleted' ? 'No deleted staff members' : 
             statusFilter === 'inactive' ? 'No inactive staff members' : 
             'No staff members yet'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {staff.map((s, i) => (
            <div key={s.staff_id} data-testid={`staff-card-${s.staff_id}`}
              className={`bg-zinc-900/50 border rounded-sm p-5 transition-all opacity-0 animate-fade-in-up ${
                s.deleted_at ? 'border-red-800/50' : 'border-zinc-800 hover:border-zinc-700'
              }`}
              style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {s.profile_image_path ? (
                    <img src={s.profile_image_path.startsWith('/') ? backendUrl + s.profile_image_path : s.profile_image_path} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center"><User className="w-5 h-5 text-zinc-400" strokeWidth={1.5} /></div>
                  )}
                  <div>
                    <p className={`font-body font-medium text-sm ${s.deleted_at ? 'text-zinc-500 line-through' : 'text-white'}`}>{s.first_name} {s.last_name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge className={`rounded-sm font-heading uppercase text-[10px] border-0 ${roleColor(s.role)}`}>{s.role.replace('_', ' ')}</Badge>
                      {s.deleted_at ? (
                        <Badge className="rounded-sm font-heading uppercase text-[10px] border-0 bg-red-500/20 text-red-400">Deleted</Badge>
                      ) : (
                        <button
                          data-testid={`toggle-status-staff-${s.staff_id}`}
                          onClick={() => handleToggleStatus(s)}
                          className={`px-2 py-0.5 rounded-sm font-heading uppercase text-[10px] border transition-colors ${
                            s.is_active 
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30' 
                              : 'bg-zinc-700/50 text-zinc-500 border-zinc-600 hover:bg-zinc-700'
                          }`}
                        >
                          {s.is_active ? 'Active' : 'Inactive'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  {s.deleted_at ? (
                    <ActionTooltip label="Restore">
                      <button data-testid={`restore-staff-${s.staff_id}`} onClick={() => handleRestore(s)} 
                        className="text-zinc-500 hover:text-emerald-400 transition-colors p-1">
                        <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                    </ActionTooltip>
                  ) : (
                    <>
                      <ActionTooltip label="View Profile">
                        <button onClick={() => navigate(`/manager/staff/${s.staff_id}`)} className="text-zinc-500 hover:text-white transition-colors p-1">
                          <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </button>
                      </ActionTooltip>
                      {String(s.role || '').toUpperCase().includes('INSTRUCTOR') && (
                        <ActionTooltip label="Transfer Coach">
                          <button onClick={() => openTransfer(s)} className="text-zinc-500 hover:text-white transition-colors p-1">
                            <ArrowRightLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </button>
                        </ActionTooltip>
                      )}
                      <ActionTooltip label="Edit Staff">
                        <button data-testid={`edit-staff-${s.staff_id}`} onClick={() => openEdit(s)} className="text-zinc-500 hover:text-white transition-colors p-1"><Pencil className="w-3.5 h-3.5" strokeWidth={1.5} /></button>
                      </ActionTooltip>
                      <ActionTooltip label="Delete Staff">
                        <button data-testid={`delete-staff-${s.staff_id}`} onClick={() => setDeleteDialog({ open: true, staff: s })} className="text-zinc-500 hover:text-red-400 transition-colors p-1"><Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} /></button>
                      </ActionTooltip>
                    </>
                  )}
                </div>
              </div>
              <div className="space-y-1.5 pt-3 border-t border-zinc-800">
                {s.phone && <p className="text-zinc-500 text-xs flex items-center gap-1.5"><Phone className="w-3 h-3" strokeWidth={1.5} />{s.phone}</p>}
                {s.email && <p className="text-zinc-500 text-xs flex items-center gap-1.5"><Mail className="w-3 h-3" strokeWidth={1.5} />{s.email}</p>}
                <p className="text-zinc-500 text-xs flex items-center gap-1.5"><DollarSign className="w-3 h-3" strokeWidth={1.5} />{s.pay_structure?.base_amount?.toLocaleString()} {s.pay_structure?.currency}/mo</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialog.open} onOpenChange={(open) => !open && setDialog({ open: false, editing: null })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 rounded-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading text-white uppercase tracking-wider">{dialog.editing ? 'Edit Staff' : 'Add Staff'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="max-w-[200px]">
              <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs mb-2 block">Photo</Label>
              <FileUpload value={form.profile_image_path} onChange={(url) => setForm({ ...form, profile_image_path: url })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">First Name *</Label>
                <Input data-testid="staff-first-name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className="bg-zinc-950 border-zinc-800 focus:border-red-600 rounded-sm text-white h-10" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Last Name</Label>
                <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className="bg-zinc-950 border-zinc-800 focus:border-red-600 rounded-sm text-white h-10" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Email</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-zinc-950 border-zinc-800 focus:border-red-600 rounded-sm text-white h-10" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="bg-zinc-950 border-zinc-800 focus:border-red-600 rounded-sm text-white h-10" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Password</Label>
              <div className="relative">
                <Input 
                  type={showPassword ? "text" : "password"} 
                  value={form.password || ''} 
                  onChange={(e) => setForm({ ...form, password: e.target.value })} 
                  className="bg-zinc-950 border-zinc-800 focus:border-red-600 rounded-sm text-white h-10 pr-10" 
                  placeholder={dialog.editing ? "Leave blank to keep unchanged" : "Create a password"}
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-10"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {roles.map(r => (
                      <SelectItem key={r.code} value={r.code} className="text-zinc-300 focus:bg-zinc-800 focus:text-white">
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Employee Type</Label>
                <Select value={form.employee_type} onValueChange={(v) => setForm({ ...form, employee_type: v })}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-10"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">{EMPLOYEE_TYPES.map(t => (<SelectItem key={t} value={t} className="text-zinc-300 focus:bg-zinc-800 focus:text-white">{t}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Employment Type</Label>
                <Select value={form.employment_type} onValueChange={(v) => setForm({ ...form, employment_type: v })}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-10"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">{EMP_TYPES.map(t => (<SelectItem key={t} value={t} className="text-zinc-300 focus:bg-zinc-800 focus:text-white">{t.replace('_', ' ')}</SelectItem>))}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Join Date</Label>
              <Input type="date" value={form.join_date} onChange={(e) => setForm({ ...form, join_date: e.target.value })} className="bg-zinc-950 border-zinc-800 focus:border-red-600 rounded-sm text-white h-10" />
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded-sm p-4">
              <h3 className="text-zinc-400 font-heading uppercase tracking-wider text-xs mb-3">Pay Structure</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-500 text-xs">Monthly Salary</Label>
                  <Input data-testid="staff-salary" type="number" value={form.pay_structure.base_amount} onChange={(e) => setForm({ ...form, pay_structure: { ...form.pay_structure, base_amount: parseFloat(e.target.value) || 0 } })} className="bg-zinc-900 border-zinc-800 focus:border-red-600 rounded-sm text-white h-10" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-500 text-xs">Currency</Label>
                  <Select value={form.pay_structure.currency} onValueChange={(v) => setForm({ ...form, pay_structure: { ...form.pay_structure, currency: v } })}>
                    <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-sm text-white h-10"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">{['AED', 'USD', 'SAR'].map(c => (<SelectItem key={c} value={c} className="text-zinc-300 focus:bg-zinc-800 focus:text-white">{c}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <button onClick={() => setDialog({ open: false, editing: null })} className="bg-transparent border border-zinc-700 text-zinc-300 font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm">Cancel</button>
            <button data-testid="save-staff-btn" onClick={handleSave} disabled={saving}
              className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, staff: null })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 rounded-sm max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">Delete Staff</DialogTitle>
            <DialogDescription className="text-zinc-400 font-body">
              Are you sure you want to delete <strong className="text-white">{deleteDialog.staff?.first_name} {deleteDialog.staff?.last_name}</strong>? 
              This will remove them from active lists but can be restored later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-4">
            <button onClick={() => setDeleteDialog({ open: false, staff: null })}
              className="bg-transparent border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm transition-all">
              Cancel
            </button>
            <button onClick={handleDelete} disabled={saving}
              className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm transition-all disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transferDialog.open} onOpenChange={(open) => !open && setTransferDialog({ open: false, staff: null })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 rounded-sm max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">Transfer Coach</DialogTitle>
            <DialogDescription className="text-zinc-400 font-body">
              Move <strong className="text-white">{transferDialog.staff?.first_name} {transferDialog.staff?.last_name}</strong> to another branch.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-zinc-500 text-xs">Target Location</Label>
            <Select value={transferToLocationId} onValueChange={setTransferToLocationId}>
              <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-sm text-white h-10">
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                {(locations || []).map((l) => (
                  <SelectItem key={l.location_id} value={l.location_id} className="text-zinc-300 focus:bg-zinc-800 focus:text-white">
                    {l.name || l.location_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2 pt-4">
            <button onClick={() => setTransferDialog({ open: false, staff: null })}
              className="bg-transparent border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm transition-all">
              Cancel
            </button>
            <button onClick={handleTransfer} disabled={saving}
              className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm transition-all disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Transfer
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={alertsDialog.open} onOpenChange={(open) => !open && setAlertsDialog({ open: false })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 rounded-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">Expiring Alerts</DialogTitle>
            <DialogDescription className="text-zinc-400 font-body">Agreements, documents, visas, and probation ending soon.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={loadAlerts} disabled={alertsLoading} className="bg-transparent border border-zinc-800 text-zinc-300 font-heading uppercase tracking-wide px-3 py-2 rounded-sm text-xs hover:border-zinc-700">
                {alertsLoading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>

            <div>
              <div className="text-zinc-400 text-xs font-heading uppercase tracking-wider mb-2">Probation Ending (7 days)</div>
              {(alerts.probation_endings || []).length === 0 ? (
                <div className="text-zinc-500 text-sm">No upcoming probation endings.</div>
              ) : (
                <div className="space-y-2">
                  {(alerts.probation_endings || []).slice(0, 50).map((p) => (
                    <div key={p.staff_probation_id} className="bg-zinc-950 border border-zinc-800 rounded-sm p-3">
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
              <div className="text-zinc-400 text-xs font-heading uppercase tracking-wider mb-2">Agreements Expiring</div>
              {(alerts.agreements || []).length === 0 ? (
                <div className="text-zinc-500 text-sm">No expiring agreements.</div>
              ) : (
                <div className="space-y-2">
                  {(alerts.agreements || []).slice(0, 50).map((a) => (
                    <div key={a.staff_agreement_id} className="bg-zinc-950 border border-zinc-800 rounded-sm p-3">
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <div className="text-zinc-400 text-xs font-heading uppercase tracking-wider mb-2">Documents Expiring</div>
                {(alerts.documents || []).length === 0 ? (
                  <div className="text-zinc-500 text-sm">No expiring documents.</div>
                ) : (
                  <div className="space-y-2">
                    {(alerts.documents || []).slice(0, 25).map((d) => (
                      <div key={d.staff_document_id} className="bg-zinc-950 border border-zinc-800 rounded-sm p-3">
                        <div className="text-white text-sm">{d.staff_id} • {d.document_type}</div>
                        <div className="text-zinc-600 text-xs mt-1">Expiry: {d.expiry_date || '—'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="text-zinc-400 text-xs font-heading uppercase tracking-wider mb-2">Visas Expiring</div>
                {(alerts.visas || []).length === 0 ? (
                  <div className="text-zinc-500 text-sm">No expiring visas.</div>
                ) : (
                  <div className="space-y-2">
                    {(alerts.visas || []).slice(0, 25).map((v) => (
                      <div key={v.staff_visa_id} className="bg-zinc-950 border border-zinc-800 rounded-sm p-3">
                        <div className="text-white text-sm">{v.staff_id} • Visa</div>
                        <div className="text-zinc-600 text-xs mt-1">Expiry: {v.expiry_date || '—'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 pt-4">
            <button onClick={() => setAlertsDialog({ open: false })} className="bg-transparent border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm transition-all">
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
