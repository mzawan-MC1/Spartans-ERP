import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, User, Phone, Mail, MapPin, Calendar, Heart, Shield, CreditCard, Edit, AlertTriangle, Clock, CheckCircle, XCircle, Download, CalendarCheck, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { membersAPI, membershipsAPI, paymentsAPI, attendanceAPI } from '@/lib/api';
import ManagerLayout from '@/components/ManagerLayout';
import MemberDocumentsPanel from '@/components/MemberDocumentsPanel';

import { ActionTooltip } from '@/components/ui/tooltip';

export default function MemberViewPage() {
  return (
    <ManagerLayout>
      {({ location }) => <MemberViewContent location={location} />}
    </ManagerLayout>
  );
}

function MembershipCard({ m, locationId }) {
  const [freezes, setFreezes] = useState([]);
  const [freezeDialog, setFreezeDialog] = useState(false);
  const [editingFreezeId, setEditingFreezeId] = useState(null);
  const [freezeForm, setFreezeForm] = useState({ start_date: '', end_date: '', reason: '' });
  const [loading, setLoading] = useState(false);
  const [membershipData, setMembershipData] = useState(m);

  useEffect(() => {
    if (m.membership_id) {
      membershipsAPI.listFreezes(m.membership_id, locationId).then(res => setFreezes(res.data)).catch(console.error);
    }
  }, [m.membership_id, locationId]);

  useEffect(() => {
    setMembershipData(m);
  }, [m]);

  const openAddFreeze = () => {
    setEditingFreezeId(null);
    setFreezeForm({ start_date: '', end_date: '', reason: '' });
    setFreezeDialog(true);
  };

  const openEditFreeze = (freeze) => {
    setEditingFreezeId(freeze.freeze_id);
    setFreezeForm({
      start_date: freeze.start_date.slice(0, 10),
      end_date: freeze.end_date.slice(0, 10),
      reason: freeze.reason || ''
    });
    setFreezeDialog(true);
  };

  const handleSaveFreeze = async () => {
    if (!freezeForm.start_date || !freezeForm.end_date) return toast.error('Start and end dates are required');
    try {
      setLoading(true);
      if (editingFreezeId) {
        await membershipsAPI.updateFreeze(m.membership_id, editingFreezeId, freezeForm, locationId);
        toast.success('Membership freeze updated');
      } else {
        await membershipsAPI.createFreeze(m.membership_id, freezeForm, locationId);
        toast.success('Membership frozen successfully');
      }
      setFreezeDialog(false);
      setFreezeForm({ start_date: '', end_date: '', reason: '' });
      // Refresh freezes and membership
      const [freezesRes, memRes] = await Promise.all([
        membershipsAPI.listFreezes(m.membership_id, locationId),
        membershipsAPI.get(m.membership_id, locationId)
      ]);
      setFreezes(freezesRes.data);
      setMembershipData(memRes.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save freeze');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelFreeze = async (freezeId) => {
    if (!window.confirm('Are you sure you want to cancel this freeze? This will revert the membership end date.')) return;
    try {
      setLoading(true);
      await membershipsAPI.deleteFreeze(m.membership_id, freezeId, locationId);
      toast.success('Freeze cancelled');
      const [freezesRes, memRes] = await Promise.all([
        membershipsAPI.listFreezes(m.membership_id, locationId),
        membershipsAPI.get(m.membership_id, locationId)
      ]);
      setFreezes(freezesRes.data);
      setMembershipData(memRes.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to cancel freeze');
    } finally {
      setLoading(false);
    }
  };

  const totalFreezeDays = freezes.reduce((acc, f) => {
    const start = new Date(f.start_date);
    const end = new Date(f.end_date);
    return acc + Math.round((end - start) / (1000 * 60 * 60 * 24));
  }, 0);

  return (
    <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {['active', 'completed', 'paid', 'approved'].includes((membershipData.status || '').toLowerCase()) ? (
            <CheckCircle className="h-4 w-4 text-green-400" />
          ) : ['cancelled', 'expired', 'past_due', 'failed', 'declined', 'refunded', 'renewal_required'].includes((membershipData.status || '').toLowerCase()) ? (
            <XCircle className="h-4 w-4 text-red-400" />
          ) : (
            <Clock className="h-4 w-4 text-yellow-400" />
          )}
          <Badge className={
            ['active', 'completed', 'paid', 'approved'].includes((membershipData.status || '').toLowerCase()) ? 'bg-green-500/20 text-green-400 border-green-500/30' : 
            ['cancelled', 'expired', 'past_due', 'failed', 'declined', 'refunded', 'renewal_required'].includes((membershipData.status || '').toLowerCase()) ? 'bg-red-500/20 text-red-400 border-red-500/30' :
            'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
          }>
            {(membershipData.status || 'Unknown').toUpperCase()}
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-zinc-400 text-sm capitalize">{((membershipData.type === 'kids_program' ? 'kids' : (membershipData.type === 'dedicated_program' ? 'full_access' : membershipData.type)) || 'standard').replace(/_/g, ' ')}</span>
          {['active', 'pending', 'paid', 'approved', 'completed'].includes((membershipData.status || '').toLowerCase()) && (membershipData.freeze_max_days ?? 60) > 0 && (membershipData.freeze_max_uses ?? 2) > 0 && (
            <Button size="sm" variant="outline" className="h-7 text-xs border-zinc-700 text-zinc-300" onClick={openAddFreeze}>
              Freeze
            </Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
        <div>
          <p className="text-zinc-500 text-xs uppercase tracking-wider font-heading">Start Date</p>
          <p className="text-white">{membershipData.start_date || '—'}</p>
        </div>
        <div>
          <p className="text-zinc-500 text-xs uppercase tracking-wider font-heading">End Date</p>
          <p className="text-white">{membershipData.end_date ? membershipData.end_date.slice(0, 10) : '—'}</p>
        </div>
        {membershipData.payment_plan_name && (
          <div>
            <p className="text-zinc-500 text-xs uppercase tracking-wider font-heading">Plan</p>
            <p className="text-white">{membershipData.payment_plan_name}</p>
          </div>
        )}
        {membershipData.auto_renew !== undefined && (
          <div>
            <p className="text-zinc-500 text-xs uppercase tracking-wider font-heading">Auto Renew</p>
            <p className="text-white">{membershipData.auto_renew ? 'Yes' : 'No'}</p>
          </div>
        )}
      </div>

      {/* Freeze Info */}
      {freezes.length > 0 && (
        <div className="mt-4 pt-4 border-t border-zinc-700/50">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-bold text-zinc-300">Freeze History</h4>
            <div className="text-xs text-zinc-500">
              Used: {totalFreezeDays} days ({freezes.length} uses) | Remaining: {Math.max(0, (membershipData.freeze_max_days ?? 60) - totalFreezeDays)} days ({Math.max(0, (membershipData.freeze_max_uses ?? 2) - freezes.length)} uses) | Allowed: {membershipData.freeze_max_days ?? 60} days, {membershipData.freeze_max_uses ?? 2} uses
            </div>
          </div>
          <div className="space-y-2">
            {freezes.map(f => {
              const start = new Date(f.start_date);
              const end = new Date(f.end_date);
              const days = Math.round((end - start) / (1000 * 60 * 60 * 24));
              return (
                <div key={f.freeze_id} className="flex items-center justify-between bg-zinc-900/50 p-2 rounded text-xs">
                  <div className="text-zinc-400">
                    <span className="text-zinc-300">{f.start_date}</span> to <span className="text-zinc-300">{f.end_date}</span>
                    <span className="ml-2 text-orange-400 font-bold">({days} days)</span>
                    {f.reason && <span className="ml-2 italic opacity-75">- {f.reason}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <ActionTooltip label="Edit Freeze">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700" onClick={() => openEditFreeze(f)} disabled={loading}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </ActionTooltip>
                    <ActionTooltip label="Cancel Freeze">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => handleCancelFreeze(f.freeze_id)} disabled={loading}>
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </ActionTooltip>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Freeze Dialog */}
      <Dialog open={freezeDialog} onOpenChange={setFreezeDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle>{editingFreezeId ? 'Edit Freeze' : 'Freeze Membership'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-zinc-400">Start Date</label>
                <input
                  type="date"
                  value={freezeForm.start_date}
                  onChange={(e) => setFreezeForm({ ...freezeForm, start_date: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-sm p-2 text-white"
                  min={membershipData.start_date}
                  max={membershipData.end_date?.slice(0, 10)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-zinc-400">End Date</label>
                <input
                  type="date"
                  value={freezeForm.end_date}
                  onChange={(e) => setFreezeForm({ ...freezeForm, end_date: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-sm p-2 text-white"
                  min={freezeForm.start_date || membershipData.start_date}
                  max={membershipData.end_date?.slice(0, 10)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-zinc-400">Reason (Optional)</label>
              <input
                type="text"
                value={freezeForm.reason}
                onChange={(e) => setFreezeForm({ ...freezeForm, reason: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-sm p-2 text-white"
                placeholder="e.g. Travel, Medical"
              />
            </div>
            <div className="text-xs text-zinc-500 bg-zinc-800/50 p-3 rounded border border-zinc-700">
              <p>• Max {membershipData.freeze_max_days ?? 60} days total freeze allowed per membership.</p>
              <p>• Max {membershipData.freeze_max_uses ?? 2} freezes allowed per membership.</p>
              <p>• Membership end date will be extended by the freeze duration.</p>
              <p className="mt-2 text-zinc-400">Current usage: {totalFreezeDays} days, {freezes.length} uses.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFreezeDialog(false)} disabled={loading}>Cancel</Button>
            <Button onClick={handleSaveFreeze} disabled={loading} className="bg-red-600 hover:bg-red-700 text-white">
              {loading ? 'Saving...' : editingFreezeId ? 'Update Freeze' : 'Apply Freeze'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MemberViewContent({ location }) {
  const { memberId } = useParams();
  const navigate = useNavigate();
  const [member, setMember] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [payments, setPayments] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [portalPassword, setPortalPassword] = useState('');
  const [updatingPortalPassword, setUpdatingPortalPassword] = useState(false);
  
  const locationId = location?.location_id;

  useEffect(() => {
    const fetchMember = async () => {
      if (!memberId || !locationId) return;
      try {
        setLoading(true);
        const [memberRes, membershipsRes, paymentsRes] = await Promise.all([
          membersAPI.get(memberId, locationId),
          membershipsAPI.list(locationId, { member_id: memberId }).catch(() => ({ data: { memberships: [] } })),
          paymentsAPI.list(locationId, { member_id: memberId }).catch(() => ({ data: { payments: [] } })),
        ]);
        setMember(memberRes.data);
        const uId = memberRes.data?.user_id;
        if (uId) {
          const attRes = await attendanceAPI.list(locationId, { customer_id: uId }).catch(() => ({ data: [] }));
          setAttendance(attRes.data || []);
        } else {
          setAttendance([]);
        }
        
        const rawMemberships = membershipsRes.data.memberships || membershipsRes.data || [];
        const rawPayments = paymentsRes.data.payments || paymentsRes.data || [];
        setMemberships(rawMemberships);
        
        // Ensure payments are sorted by date descending so newest are at the top
        setPayments(rawPayments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      } catch (err) {
        toast.error('Failed to load member');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchMember();
  }, [memberId, locationId]);

  const headerPlan = useMemo(() => {
    const parseDate = (v) => {
      if (!v) return 0;
      const t = Date.parse(v);
      return Number.isNaN(t) ? 0 : t;
    };
    const sortValue = (mem) => {
      return parseDate(mem?.end_date) || parseDate(mem?.start_date) || parseDate(mem?.created_at) || 0;
    };
    const withPlan = (memberships || []).filter(mem => mem && (mem.payment_plan_name || mem.payment_plan_id));
    if (withPlan.length === 0) return null;
    const activeMem = withPlan.find(mem => (mem.status || '').toLowerCase() === 'active') || null;
    const historyCandidates = withPlan.filter(mem => ['active', 'expired'].includes((mem.status || '').toLowerCase()));
    const pool = historyCandidates.length ? historyCandidates : withPlan;
    const last = [...pool].sort((a, b) => sortValue(b) - sortValue(a))[0] || null;
    const chosen = member?.is_active ? (activeMem || last) : last;
    const name = chosen?.payment_plan_name || '';
    if (!name) return null;
    return {
      label: member?.is_active ? 'Plan' : 'Last Plan',
      name,
    };
  }, [memberships, member?.is_active]);
  const headerMembershipStatus = useMemo(() => {
    const parseDate = (v) => {
      if (!v) return 0;
      const t = Date.parse(v);
      return Number.isNaN(t) ? 0 : t;
    };
    const sortValue = (mem) => {
      return parseDate(mem?.end_date) || parseDate(mem?.start_date) || parseDate(mem?.created_at) || 0;
    };
    const list = memberships || [];
    if (list.length === 0) return null;
    const activeMem = list.find(mem => (mem?.status || '').toLowerCase() === 'active') || null;
    const latest = [...list].sort((a, b) => sortValue(b) - sortValue(a))[0] || null;
    const chosen = activeMem || latest;
    const s = (chosen?.status || '').toLowerCase();
    if (!s) return null;
    return s;
  }, [memberships]);

  if (loading) {
    return (
      <div className="p-6 sm:p-8 lg:p-10 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-4 border-red-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="p-6 sm:p-8 lg:p-10 text-center">
        <p className="text-zinc-400">Member not found</p>
        <Button onClick={() => navigate('/manager/members')} className="mt-4">
          Back to Members
        </Button>
      </div>
    );
  }

  // Get medical data - handle both 'medical' and 'medical_info' field names
  const medical = member.medical || member.medical_info || {};
  const hasMedicalData = Object.keys(medical).length > 0;

  const handleDownloadInvoice = async (paymentId) => {
    try {
      const res = await paymentsAPI.downloadInvoice(paymentId, locationId);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice_${paymentId.slice(-12)}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success('Invoice downloaded');
    } catch (err) {
      toast.error('Failed to download invoice');
    }
  };

  const handleSetPortalPassword = async () => {
    if (!portalPassword || portalPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    try {
      setUpdatingPortalPassword(true);
      await membersAPI.setPortalPassword(memberId, portalPassword, locationId);
      setPortalPassword('');
      toast.success('Portal password updated');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to update portal password');
    } finally {
      setUpdatingPortalPassword(false);
    }
  };

  const handleResetPortalPassword = async () => {
    try {
      setUpdatingPortalPassword(true);
      const res = await membersAPI.resetPortalPassword(memberId, locationId);
      const temp = res?.data?.temp_password;
      if (temp) toast.success(`Temporary password: ${temp}`);
      else toast.success('Password reset');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to reset portal password');
    } finally {
      setUpdatingPortalPassword(false);
    }
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-5xl space-y-6" data-testid="member-view-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <ActionTooltip label="Back to Members">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/manager/members')}
              data-testid="back-btn"
              className="text-zinc-400 hover:text-white"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </ActionTooltip>
          <div className="flex items-center gap-4">
            {member.profile_photo_url ? (
              <img 
                src={member.profile_photo_url.startsWith('/') ? `${process.env.REACT_APP_BACKEND_URL}${member.profile_photo_url}` : member.profile_photo_url}
                alt={member.full_name}
                className="w-16 h-16 rounded-full object-cover border-2 border-zinc-700"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center border-2 border-zinc-700">
                <User className="h-8 w-8 text-zinc-500" />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-white font-heading uppercase tracking-wide">{member.full_name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="font-mono text-zinc-400 border-zinc-700">{member.member_no}</Badge>
                {headerMembershipStatus ? (
                  <Badge className={
                    headerMembershipStatus === 'active' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                    ['past_due', 'expired', 'cancelled', 'failed', 'declined', 'renewal_required'].includes(headerMembershipStatus) ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                    'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                  }>
                    {headerMembershipStatus.toUpperCase()}
                  </Badge>
                ) : (
                  <Badge className="bg-zinc-700 text-zinc-400">NO MEMBERSHIP</Badge>
                )}
              </div>
              {headerPlan && (
                <div className="mt-1 text-xs text-zinc-500">
                  {headerPlan.label}:{' '}
                  <span className="text-zinc-300">{headerPlan.name}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <Button 
          onClick={() => navigate(`/manager/members/${memberId}/edit`)}
          className="bg-red-600 hover:bg-red-700 text-white font-heading uppercase tracking-wide"
          data-testid="edit-member-btn"
        >
          <Edit className="h-4 w-4 mr-2" />
          Edit Member
        </Button>
      </div>

      <Tabs defaultValue="details" className="w-full">
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="details" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400">Details</TabsTrigger>
          <TabsTrigger value="membership" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400">Membership</TabsTrigger>
          <TabsTrigger value="payments" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400" data-testid="payments-tab">Payments</TabsTrigger>
          <TabsTrigger value="attendance" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400">Attendance</TabsTrigger>
          <TabsTrigger value="medical" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400">Medical</TabsTrigger>
          <TabsTrigger value="documents" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-4 mt-4">
          {/* Personal Information */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-white flex items-center gap-2 font-heading uppercase tracking-wide text-lg">
                <User className="h-5 w-5 text-red-500" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <p className="text-zinc-500 text-xs uppercase tracking-wider font-heading">Full Name</p>
                  <p className="text-white font-medium">{member.full_name || '—'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-zinc-500 text-xs uppercase tracking-wider font-heading">Gender</p>
                  <p className="text-white font-medium capitalize">{member.gender || '—'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-zinc-500 text-xs uppercase tracking-wider font-heading flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Date of Birth
                  </p>
                  <p className="text-white font-medium">{member.dob || '—'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-zinc-500 text-xs uppercase tracking-wider font-heading flex items-center gap-1">
                    <Phone className="h-3 w-3" /> Phone
                  </p>
                  <p className="text-white font-medium">{member.phone || '—'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-zinc-500 text-xs uppercase tracking-wider font-heading flex items-center gap-1">
                    <Mail className="h-3 w-3" /> Email
                  </p>
                  <p className="text-white font-medium">{member.email || '—'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-zinc-500 text-xs uppercase tracking-wider font-heading flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Address
                  </p>
                  <p className="text-white font-medium">{member.address || '—'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Emergency Contact */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-white flex items-center gap-2 font-heading uppercase tracking-wide text-lg">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Emergency Contact
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {member.emergency_contact && (member.emergency_contact.name || member.emergency_contact.phone) ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-1">
                    <p className="text-zinc-500 text-xs uppercase tracking-wider font-heading">Name</p>
                    <p className="text-white font-medium">{member.emergency_contact.name || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-zinc-500 text-xs uppercase tracking-wider font-heading">Phone</p>
                    <p className="text-white font-medium">{member.emergency_contact.phone || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-zinc-500 text-xs uppercase tracking-wider font-heading">Relation</p>
                    <p className="text-white font-medium capitalize">{member.emergency_contact.relation || '—'}</p>
                  </div>
                </div>
              ) : (
                <p className="text-zinc-500">No emergency contact on file</p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-white flex items-center gap-2 font-heading uppercase tracking-wide text-lg">
                <Lock className="h-5 w-5 text-red-500" />
                Portal Access
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div className="md:col-span-2 space-y-2">
                  <Label className="text-zinc-300">Set new password</Label>
                  <Input
                    type="password"
                    value={portalPassword}
                    onChange={(e) => setPortalPassword(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-white"
                    placeholder="Minimum 6 characters"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSetPortalPassword} disabled={updatingPortalPassword} className="bg-red-600 hover:bg-red-700 text-white">
                    Save
                  </Button>
                  <Button variant="outline" onClick={handleResetPortalPassword} disabled={updatingPortalPassword} className="border-zinc-700 text-zinc-300">
                    Reset
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="membership" className="space-y-4 mt-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-white flex items-center gap-2 font-heading uppercase tracking-wide text-lg">
                <CreditCard className="h-5 w-5 text-red-500" />
                Memberships
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {memberships.length > 0 ? (
                <div className="space-y-4">
                  {memberships.map((m, idx) => (
                    <MembershipCard key={m.membership_id || idx} m={m} locationId={locationId} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CreditCard className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
                  <p className="text-zinc-500">No memberships found</p>
                  <p className="text-zinc-600 text-sm mt-1">Add a membership when editing this member</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4 mt-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-white flex items-center gap-2 font-heading uppercase tracking-wide text-lg">
                <CreditCard className="h-5 w-5 text-red-500" />
                Payment History
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {payments.length > 0 ? (
                <div className="space-y-4">
                  {payments.map((p, idx) => (
                    <div key={p.payment_id || idx} className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {['paid', 'approved', 'completed'].includes((p.status || '').toLowerCase()) ? (
                            <CheckCircle className="h-4 w-4 text-green-400" />
                          ) : ['failed', 'declined', 'cancelled', 'refunded'].includes((p.status || '').toLowerCase()) ? (
                            <XCircle className="h-4 w-4 text-red-400" />
                          ) : (
                            <Clock className="h-4 w-4 text-yellow-400" />
                          )}
                          <Badge className={
                            ['paid', 'approved', 'completed'].includes((p.status || '').toLowerCase()) ? 'bg-green-500/20 text-green-400 border-green-500/30' : 
                            ['failed', 'declined', 'cancelled', 'refunded'].includes((p.status || '').toLowerCase()) ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                            'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                          }>
                            {(p.status || 'Unknown').toUpperCase()}
                          </Badge>
                          <span className="text-zinc-400 text-sm capitalize">{(p.method || '').replace('_', ' ')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-orange-500">{p.amount} {p.currency}</span>
                          {['paid', 'approved', 'completed'].includes((p.status || '').toLowerCase()) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownloadInvoice(p.payment_id)}
                              className="border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700"
                              data-testid={`download-invoice-${p.payment_id}`}
                            >
                              <Download className="h-4 w-4 mr-1" />
                              Invoice
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-zinc-500 text-xs uppercase tracking-wider font-heading">Date</p>
                          <p className="text-white">{(p.paid_at || p.created_at || '').slice(0, 10)}</p>
                        </div>
                        <div>
                          <p className="text-zinc-500 text-xs uppercase tracking-wider font-heading">Payment ID</p>
                          <p className="text-white font-mono text-xs">{(p.payment_id || '').slice(-12).toUpperCase()}</p>
                        </div>
                        {p.receipt_url && (
                          <div>
                            <p className="text-zinc-500 text-xs uppercase tracking-wider font-heading">Receipt</p>
                            <a
                              href={p.receipt_url.startsWith('/') ? `${process.env.REACT_APP_BACKEND_URL}${p.receipt_url}` : p.receipt_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-orange-400 hover:underline text-sm"
                            >
                              View Receipt
                            </a>
                          </div>
                        )}
                        {p.receipt_info && (
                          <div>
                            <p className="text-zinc-500 text-xs uppercase tracking-wider font-heading">Receipt Info</p>
                            <p className="text-white">{p.receipt_info}</p>
                          </div>
                        )}
                        {p.notes && (
                          <div>
                            <p className="text-zinc-500 text-xs uppercase tracking-wider font-heading">Admin Notes</p>
                            <p className="text-white italic">{p.notes}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CreditCard className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
                  <p className="text-zinc-500">No payments found</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance" className="space-y-4 mt-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-white flex items-center gap-2 font-heading uppercase tracking-wide text-lg">
                <CalendarCheck className="h-5 w-5 text-red-500" />
                Attendance History
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {attendance.length === 0 ? (
                <div className="text-center py-8">
                  <CalendarCheck className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
                  <p className="text-zinc-500">No attendance records found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {attendance.map((a) => (
                    <div key={a.record_id} className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700 flex items-center justify-between">
                      <div>
                        <p className="text-white font-medium">{new Date(a.attendance_date_time).toLocaleString()}</p>
                        <p className="text-zinc-500 text-sm">Program: {a.program_id}</p>
                      </div>
                      <Badge className={(a.status || '').toLowerCase() === 'present' ? 'bg-green-500/20 text-green-400 border-green-500/30' : (a.status || '').toLowerCase() === 'late' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}>
                        {(a.status || 'unknown').toUpperCase()}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="medical" className="space-y-4 mt-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="text-white flex items-center gap-2 font-heading uppercase tracking-wide text-lg">
                <Heart className="h-5 w-5 text-red-500" />
                Medical Information
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {hasMedicalData ? (
                <div className="space-y-4">
                  {/* Medical Conditions */}
                  <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-zinc-300 font-medium">Medical Conditions</span>
                      <Badge className={medical.conditions || medical.has_conditions ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 'bg-zinc-700 text-zinc-400'}>
                        {medical.conditions || medical.has_conditions ? 'Yes' : 'None'}
                      </Badge>
                    </div>
                    {(medical.conditions || medical.conditions_details) && (
                      <p className="text-zinc-400 text-sm">{medical.conditions || medical.conditions_details}</p>
                    )}
                  </div>

                  {/* Injuries */}
                  <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-zinc-300 font-medium">Injuries</span>
                      <Badge className={medical.injuries || medical.has_injuries ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 'bg-zinc-700 text-zinc-400'}>
                        {medical.injuries || medical.has_injuries ? 'Yes' : 'None'}
                      </Badge>
                    </div>
                    {(medical.injuries || medical.injuries_details) && (
                      <p className="text-zinc-400 text-sm">{medical.injuries || medical.injuries_details}</p>
                    )}
                  </div>

                  {/* Allergies */}
                  {medical.allergies && (
                    <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-zinc-300 font-medium">Allergies</span>
                        <Badge className={medical.allergies && medical.allergies !== 'None' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 'bg-zinc-700 text-zinc-400'}>
                          {medical.allergies && medical.allergies !== 'None' ? 'Yes' : 'None'}
                        </Badge>
                      </div>
                      {medical.allergies && medical.allergies !== 'None' && (
                        <p className="text-zinc-400 text-sm">{medical.allergies}</p>
                      )}
                    </div>
                  )}

                  {/* Medications */}
                  <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-zinc-300 font-medium">Medications</span>
                      <Badge className={medical.medications || medical.taking_medications ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 'bg-zinc-700 text-zinc-400'}>
                        {medical.medications || medical.taking_medications ? 'Yes' : 'None'}
                      </Badge>
                    </div>
                    {(medical.medications || medical.medications_details) && (
                      <p className="text-zinc-400 text-sm">{medical.medications || medical.medications_details}</p>
                    )}
                  </div>

                  {/* Doctor Info */}
                  {(medical.doctor_name || medical.doctor_phone) && (
                    <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                      <span className="text-zinc-300 font-medium block mb-2">Doctor Information</span>
                      <div className="grid grid-cols-2 gap-4">
                        {medical.doctor_name && (
                          <div>
                            <p className="text-zinc-500 text-xs uppercase tracking-wider">Name</p>
                            <p className="text-zinc-300">{medical.doctor_name}</p>
                          </div>
                        )}
                        {medical.doctor_phone && (
                          <div>
                            <p className="text-zinc-500 text-xs uppercase tracking-wider">Phone</p>
                            <p className="text-zinc-300">{medical.doctor_phone}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Medical Notes */}
                  {medical.notes && (
                    <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                      <span className="text-zinc-300 font-medium block mb-2">Additional Notes</span>
                      <p className="text-zinc-400 text-sm">{medical.notes}</p>
                    </div>
                  )}

                  {/* Consent Status */}
                  <div className="flex items-center gap-2 pt-2">
                    {medical.consent ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-green-400" />
                        <span className="text-green-400 text-sm">Medical consent provided</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 text-zinc-500" />
                        <span className="text-zinc-500 text-sm">No medical consent on file</span>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Heart className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
                  <p className="text-zinc-500">No medical information on file</p>
                  <p className="text-zinc-600 text-sm mt-1">Medical details can be added when editing this member</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="space-y-4 mt-4">
          <MemberDocumentsPanel memberId={memberId} locationId={location?.location_id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
