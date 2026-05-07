import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { User, Calendar, CreditCard, FileText, LogOut, Clock, CheckCircle, AlertTriangle, Settings, ArrowRight, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { membersAPI, membershipsAPI, paymentsAPI, paymentPlansAPI, scheduleAPI, authAPI, publicAPI, uploadAPI } from '@/lib/api';
import api from '@/lib/api';
import { resolveMediaUrl } from '@/lib/media';

export default function MemberPortal() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [payments, setPayments] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState(null);
  const [paymentPlans, setPaymentPlans] = useState([]);
  const [profileEdit, setProfileEdit] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileForm, setProfileForm] = useState({ phone: '', address: '', emergency_contact: { name: '', phone: '', relation: '' } });
  const [usePrimaryEmergency, setUsePrimaryEmergency] = useState(false);
  const [primaryContact, setPrimaryContact] = useState(null);
  
  const [availablePaymentMethods, setAvailablePaymentMethods] = useState([]);
  const [manualPaymentAvailable, setManualPaymentAvailable] = useState(false);
  const [payDialog, setPayDialog] = useState(false);
  const [selectedPendingPayment, setSelectedPendingPayment] = useState(null);
  const [payIntent, setPayIntent] = useState('pending');
  const [paymentMethod, setPaymentMethod] = useState('online');
  const [processingPayment, setProcessingPayment] = useState(false);
  const [payReceiptInfo, setPayReceiptInfo] = useState('');
  const [payReceiptUrl, setPayReceiptUrl] = useState('');
  const [payReceiptFileName, setPayReceiptFileName] = useState('');
  const [payUploadingReceipt, setPayUploadingReceipt] = useState(false);

  const [purchaseDialog, setPurchaseDialog] = useState(false);
  const [purchaseType, setPurchaseType] = useState('full_access');
  const [purchasePlanId, setPurchasePlanId] = useState('');
  const [purchaseAutoRenew, setPurchaseAutoRenew] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseAcceptTerms, setPurchaseAcceptTerms] = useState(false);
  const [purchaseReceiptInfo, setPurchaseReceiptInfo] = useState('');
  const [purchaseReceiptUrl, setPurchaseReceiptUrl] = useState('');
  const [purchaseReceiptFileName, setPurchaseReceiptFileName] = useState('');
  const [purchaseUploadingReceipt, setPurchaseUploadingReceipt] = useState(false);

  const [addProfileDialog, setAddProfileDialog] = useState(false);
  const [newProfile, setNewProfile] = useState({ full_name: '', gender: '', relationship: '', dependent_type: 'kids', email: '', password: '' });
  const [creatingProfile, setCreatingProfile] = useState(false);

  const [freezeDialog, setFreezeDialog] = useState(false);
  const [freezeForMembershipId, setFreezeForMembershipId] = useState(null);
  const [freezeForm, setFreezeForm] = useState({ start_date: '', end_date: '', reason: '' });
  const [freezing, setFreezing] = useState(false);
  const [selectedScheduleCategory, setSelectedScheduleCategory] = useState('all');

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const locationId = user.location_id;
  const memberId = user.member_id;

  useEffect(() => {
    const activeProfile = profiles.find(p => p.member_id === (activeProfileId || memberId));
    const dependentType = activeProfile?.dependent_type;
    if (dependentType === 'kids') {
      setPurchaseType('kids');
    } else {
      setPurchaseType(prev => (prev === 'kids' ? 'full_access' : prev));
    }
  }, [activeProfileId, memberId, profiles]);

  const fetchData = useCallback(async () => {
    if (!locationId || !memberId) return;
    
    try {
      setLoading(true);
      setSchedules([]);
      const targetMemberId = activeProfileId || memberId;
      const [profilesRes, memberRes, membershipsRes, paymentsRes, plansRes, methodsRes] = await Promise.all([
        membersAPI.listProfiles().catch(() => ({ data: { profiles: [] } })),
        membersAPI.get(targetMemberId, locationId),
        membershipsAPI.list(locationId),
        paymentsAPI.list(locationId),
        paymentPlansAPI.list(locationId).catch(() => ({ data: { plans: [] } })),
        api.get('/payment-methods', { params: { location_id: locationId } }).catch(() => ({ data: [] }))
      ]);
      
      const memberData = memberRes.data;
      setMember(memberData);
      const allMemberships = membershipsRes.data.memberships || [];
      const allPayments = paymentsRes.data.payments || [];
      const normalizedMemberships = allMemberships
        .filter(m => m.member_id === targetMemberId)
        .map(m => ({ ...m, type: m.type === 'kids_program' ? 'kids' : (m.type === 'dedicated_program' ? 'full_access' : m.type) }));
      setMemberships(normalizedMemberships);
      setPayments(allPayments.filter(p => p.member_id === targetMemberId));
      setPaymentPlans(plansRes.data?.plans || []);

      const loadedProfiles = profilesRes.data?.profiles || [];
      setProfiles(loadedProfiles.length > 0 ? loadedProfiles : [{ member_id: memberId, full_name: memberRes.data?.full_name, is_primary: true }]);
      if (!activeProfileId) setActiveProfileId(targetMemberId);
      
      const allMethods = Array.isArray(methodsRes.data) ? methodsRes.data : [];
      const onlineMethods = allMethods.filter(m => m.provider !== 'cash');
      setAvailablePaymentMethods(onlineMethods);
      setManualPaymentAvailable(allMethods.some(m => m.provider === 'cash') || allMethods.length === 0);
      
      // Try to load schedules
      const scheduleLocationId = memberData?.location_id || locationId;
      try {
        const [scheduleRes, programsRes, categoriesRes] = await Promise.all([
          publicAPI.getSchedule(scheduleLocationId),
          publicAPI.getPrograms(scheduleLocationId),
          publicAPI.getCategories(scheduleLocationId),
        ]);
        const scheduleRows = scheduleRes.data || [];
        const programs = programsRes.data || [];
        const categories = categoriesRes.data || [];
        const programById = Object.fromEntries(programs.map(p => [p.program_id, p]));
        const categoryById = Object.fromEntries(categories.map(c => [c.category_id, c]));
        const enriched = scheduleRows
          .filter(s => !s.location_id || s.location_id === scheduleLocationId)
          .filter(s => s.is_active !== false)
          .map((s) => {
            const prog = programById[s.program_id];
            const cat = prog ? categoryById[prog.category_id] : null;
            return {
              ...s,
              program_name: prog?.name || s.program_name,
              category_id: prog?.category_id || s.category_id,
              category_name: cat?.name || s.category_name,
            };
          });
        setSchedules(enriched);
      } catch (err) {
        try {
          const schedulesRes = await scheduleAPI.list(scheduleLocationId, { is_active: true });
          const rows = schedulesRes.data || [];
          setSchedules(rows.filter(s => !s.location_id || s.location_id === scheduleLocationId));
        } catch (fallbackErr) {
          console.error('Failed to load schedules', fallbackErr);
        }
      }
    } catch (err) {
      toast.error('Failed to load member data');
    } finally {
      setLoading(false);
    }
  }, [locationId, memberId, activeProfileId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setProfileEdit(false);
    setUsePrimaryEmergency(false);
    setPrimaryContact(null);
    setProfileForm({
      phone: member?.phone || '',
      address: member?.address || '',
      emergency_contact: {
        name: member?.emergency_contact?.name || '',
        phone: member?.emergency_contact?.phone || '',
        relation: member?.emergency_contact?.relation || '',
      },
    });
  }, [member?.member_id]);

  useEffect(() => {
    if (purchasePlanId) {
      const p = paymentPlans.find(x => x.plan_id === purchasePlanId);
      if (p && (p.membership_type || 'full_access') !== purchaseType) {
        setPurchasePlanId('');
      }
    }
  }, [purchaseType, purchasePlanId, paymentPlans]);

  const handleLogout = async () => {
    try {
      await authAPI.logout();
    } catch (err) {
      console.error('Logout error', err);
    }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const activeMembership = memberships.find(m => m.status === 'active');
  const pendingPayments = payments.filter(p => p.status === 'pending');
  const loggedInProfile = profiles.find(p => p.member_id === memberId);
  const isPrimaryLogin = !!loggedInProfile?.is_primary;
  const activeMembershipType = activeMembership?.type;
  const paymentPlanById = useMemo(() => {
    const m = {};
    for (const p of paymentPlans || []) {
      if (p?.plan_id) m[p.plan_id] = p;
    }
    return m;
  }, [paymentPlans]);
  const planDisplay = useMemo(() => {
    const parseDate = (v) => {
      if (!v) return 0;
      const t = Date.parse(v);
      return Number.isNaN(t) ? 0 : t;
    };
    const sortValue = (mem) => {
      return parseDate(mem?.end_date) || parseDate(mem?.start_date) || parseDate(mem?.created_at) || 0;
    };
    const planName = (mem) => {
      return mem?.payment_plan_name || paymentPlanById[mem?.payment_plan_id]?.name || '';
    };
    const withPlan = (memberships || []).filter(mem => planName(mem));
    if (withPlan.length === 0) return null;
    const activeMem = withPlan.find(mem => (mem.status || '').toLowerCase() === 'active') || null;
    const historyCandidates = withPlan.filter(mem => ['active', 'expired'].includes((mem.status || '').toLowerCase()));
    const pool = historyCandidates.length ? historyCandidates : withPlan;
    const last = [...pool].sort((a, b) => sortValue(b) - sortValue(a))[0] || null;
    const chosen = activeMem || last;
    const name = chosen ? planName(chosen) : '';
    if (!name) return null;
    return {
      label: activeMem ? 'Plan' : 'Last Plan',
      name,
    };
  }, [memberships, paymentPlanById]);
  const membershipStatusSummary = useMemo(() => {
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
    return activeMem || latest;
  }, [memberships]);
  const isGymSchedule = (s) => {
    const cat = (s?.category_name || '').toLowerCase();
    const prog = (s?.program_name || '').toLowerCase();
    const room = (s?.room || '').toLowerCase();
    return cat.includes('gym') || cat.includes('crossfit') || cat.includes('fitness')
      || prog.includes('gym') || prog.includes('crossfit') || prog.includes('fitness')
      || room.includes('gym');
  };
  const visibleSchedules = !activeMembershipType
    ? []
    : activeMembershipType === 'only_gym'
      ? schedules.filter(isGymSchedule)
      : activeMembershipType === 'kids'
        ? schedules.filter(s => !isGymSchedule(s))
        : schedules;

  const scheduleCategoryOptions = useMemo(() => {
    const map = new Map();
    for (const s of visibleSchedules || []) {
      const id = s?.category_id || '';
      const name = s?.category_name || '';
      if (!id || !name) continue;
      if (!map.has(id)) map.set(id, name);
    }
    return Array.from(map.entries()).map(([category_id, name]) => ({ category_id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [visibleSchedules]);

  const filteredSchedules = useMemo(() => {
    if (selectedScheduleCategory === 'all') return visibleSchedules || [];
    const exists = (scheduleCategoryOptions || []).some(c => c.category_id === selectedScheduleCategory);
    if (!exists) return visibleSchedules || [];
    return (visibleSchedules || []).filter(s => (s?.category_id || '') === selectedScheduleCategory);
  }, [visibleSchedules, selectedScheduleCategory, scheduleCategoryOptions]);

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
    const normalizeDay = (v) => {
      if (v === 0 || v === 1 || v === 2 || v === 3 || v === 4 || v === 5 || v === 6) return v;
      const s = String(v || '').trim().toLowerCase();
      const byName = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6 };
      if (s in byName) return byName[s];
      const n = Number.parseInt(s, 10);
      if (Number.isFinite(n) && n >= 0 && n <= 6) return n;
      return null;
    };
    const timeSort = (t) => {
      const s = String(t || '').trim();
      const m = /^(\d{1,2}):(\d{2})/.exec(s);
      if (!m) return 9999;
      const hh = Number.parseInt(m[1], 10);
      const mm = Number.parseInt(m[2], 10);
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 9999;
      return hh * 60 + mm;
    };
    const formatTime = (t) => {
      const s = String(t || '').trim();
      const m = /^(\d{1,2}):(\d{2})/.exec(s);
      if (!m) return s;
      let hh = Number.parseInt(m[1], 10);
      const mm = m[2];
      const ampm = hh >= 12 ? 'PM' : 'AM';
      hh = hh % 12;
      if (hh === 0) hh = 12;
      const hh2 = String(hh).padStart(2, '0');
      return `${hh2}:${mm} ${ampm}`;
    };
    const buckets = new Map(days.map(d => [d.key, []]));
    for (const s of filteredSchedules || []) {
      const idx = normalizeDay(s?.day_of_week);
      if (idx == null) continue;
      buckets.get(idx).push(s);
    }
    for (const d of days) {
      buckets.get(d.key).sort((a, b) => timeSort(a?.start_time) - timeSort(b?.start_time));
    }
    return {
      days,
      buckets,
      formatTime,
    };
  }, [filteredSchedules]);

  const handlePayNow = (payment) => {
    setPayIntent('pending');
    setSelectedPendingPayment(payment);
    setPayReceiptInfo('');
    setPayReceiptUrl('');
    setPayReceiptFileName('');
    if (availablePaymentMethods.length > 0) setPaymentMethod(availablePaymentMethods[0].provider);
    else if (manualPaymentAvailable) setPaymentMethod('cash');
    setPayDialog(true);
  };

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
      toast.error(err?.response?.data?.detail || 'Failed to download invoice');
    }
  };

  const handleProceedPayment = (membership) => {
    const plan = paymentPlanById[membership?.payment_plan_id];
    if (!plan || !plan.price) {
      toast.error('Unable to determine renewal amount for this membership');
      return;
    }
    setPayIntent('renewal');
    setSelectedPendingPayment({
      membership_id: membership.membership_id,
      amount: plan.price,
      currency: plan.currency || 'AED',
    });
    setPayReceiptInfo('');
    setPayReceiptUrl('');
    setPayReceiptFileName('');
    if (availablePaymentMethods.length > 0) setPaymentMethod(availablePaymentMethods[0].provider);
    else if (manualPaymentAvailable) setPaymentMethod('cash');
    else setPaymentMethod('');
    setPayDialog(true);
  };

  const applyPrimaryEmergency = async (enabled) => {
    setUsePrimaryEmergency(enabled);
    if (!enabled) {
      setProfileForm(prev => ({
        ...prev,
        emergency_contact: {
          name: member?.emergency_contact?.name || '',
          phone: member?.emergency_contact?.phone || '',
          relation: member?.emergency_contact?.relation || '',
        },
      }));
      return;
    }

    let primary = profiles.find(p => p.is_primary);
    if (!primary) {
      try {
        const res = await membersAPI.getPrimaryContact();
        primary = res.data?.primary || null;
      } catch {
        primary = null;
      }
    }

    setPrimaryContact(primary);
    if (!primary) return;

    const rel = member?.dependent_type === 'kids' ? 'Parent/Guardian' : 'Primary';
    setProfileForm(prev => ({
      ...prev,
      emergency_contact: {
        name: primary.full_name || primary.name || '',
        phone: primary.phone || '',
        relation: prev.emergency_contact?.relation || rel,
      },
    }));
  };

  const saveProfile = async () => {
    const targetMemberId = activeProfileId || memberId;
    if (!targetMemberId) return;
    try {
      setProfileSaving(true);
      await membersAPI.update(targetMemberId, {
        phone: profileForm.phone,
        address: profileForm.address,
        emergency_contact: {
          name: profileForm.emergency_contact.name,
          phone: profileForm.emergency_contact.phone,
          relation: profileForm.emergency_contact.relation,
        },
      }, locationId);
      toast.success('Profile updated');
      setProfileEdit(false);
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const processPayment = async () => {
    if (!selectedPendingPayment) return;
    const targetMemberId = activeProfileId || memberId;
    if (!targetMemberId) return;
    try {
      setProcessingPayment(true);
      if (paymentMethod === 'cash') {
        if (!manualPaymentAvailable) {
          toast.error('Manual payment is unavailable');
          return;
        }
        if (!payReceiptUrl && !payReceiptInfo.trim()) {
          toast.error('Upload receipt or add payment details');
          return;
        }
        await paymentsAPI.recordCash({
          member_id: targetMemberId,
          membership_id: selectedPendingPayment.membership_id,
          amount: selectedPendingPayment.amount,
          currency: selectedPendingPayment.currency || 'AED',
          receipt_info: payReceiptInfo,
          receipt_url: payReceiptUrl || null,
        }, locationId);
        toast.success('Payment submitted for approval');
        setPayDialog(false);
        setPayReceiptInfo('');
        setPayReceiptUrl('');
        setPayReceiptFileName('');
        fetchData();
        return;
      }

      if (!paymentMethod) {
        toast.error('Select a payment method');
        return;
      }

      const res = await paymentsAPI.initiate({
        member_id: targetMemberId,
        membership_id: selectedPendingPayment.membership_id,
        method: paymentMethod,
        amount: selectedPendingPayment.amount,
        currency: selectedPendingPayment.currency || 'AED',
      }, locationId);

      if (res.data.checkout_url || res.data.checkout_data?.checkout_url) {
        window.location.href = res.data.checkout_url || res.data.checkout_data.checkout_url;
        return;
      }

      toast.success('Payment processed');
      setPayDialog(false);
      fetchData();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to initiate payment');
    } finally {
      setProcessingPayment(false);
    }
  };

  const processPurchase = async () => {
    const targetMemberId = activeProfileId || memberId;
      const plan = paymentPlans.find(p => p.plan_id === purchasePlanId);
    if (!plan) {
      toast.error('Select a payment plan');
      return;
    }
    if ((plan.membership_type || 'full_access') !== purchaseType) {
      toast.error('Selected payment plan does not match membership type');
      return;
    }
    try {
      setPurchasing(true);
      const startDate = new Date().toISOString().slice(0, 10);
      if (!member?.terms_accepted_at) {
        if (targetMemberId !== memberId) {
          toast.error('Terms & Conditions must be accepted for this profile. Please contact staff.');
          return;
        }
        if (!purchaseAcceptTerms) {
          toast.error('Terms & Conditions must be accepted');
          return;
        }
        await membersAPI.acceptTerms();
      }
      const membershipRes = await membershipsAPI.create(targetMemberId, {
        member_id: targetMemberId,
        type: purchaseType,
        start_date: startDate,
        payment_plan_id: purchasePlanId,
        auto_renew: purchaseAutoRenew,
      }, locationId);

      const createdMembership = membershipRes.data;
      setPurchaseDialog(false);
      if (availablePaymentMethods.length > 0) {
        const method = availablePaymentMethods[0].provider;
        const payRes = await paymentsAPI.initiate({
          member_id: targetMemberId,
          membership_id: createdMembership.membership_id,
          method,
          amount: plan.price,
          currency: plan.currency || 'AED',
        }, locationId);

        const checkoutUrl = payRes.data.checkout_url || payRes.data.checkout_data?.checkout_url;
        if (checkoutUrl) {
          window.location.href = checkoutUrl;
          return;
        }
        toast.success('Membership created');
        fetchData();
        return;
      }

      if (!manualPaymentAvailable) {
        toast.error('No payment methods available');
        fetchData();
        return;
      }

      if (!purchaseReceiptUrl && !purchaseReceiptInfo.trim()) {
        toast.error('Upload receipt or add payment details');
        fetchData();
        return;
      }

      await paymentsAPI.recordCash({
        member_id: targetMemberId,
        membership_id: createdMembership.membership_id,
        amount: plan.price,
        currency: plan.currency || 'AED',
        receipt_info: purchaseReceiptInfo,
        receipt_url: purchaseReceiptUrl || null,
      }, locationId);

      toast.success('Payment submitted for approval');
      setPurchaseReceiptInfo('');
      setPurchaseReceiptUrl('');
      setPurchaseReceiptFileName('');
      fetchData();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to create membership');
    } finally {
      setPurchasing(false);
    }
  };

  const uploadPurchaseReceipt = async (file) => {
    if (!file) return;
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (!allowed.includes(file.type)) {
      toast.error('Only PDF, PNG, or JPG files are allowed');
      return;
    }
    try {
      setPurchaseUploadingReceipt(true);
      const res = await uploadAPI.upload(file);
      setPurchaseReceiptUrl(res.data?.url || '');
      setPurchaseReceiptFileName(file.name || '');
      toast.success('Receipt uploaded');
    } catch {
      toast.error('Failed to upload receipt');
    } finally {
      setPurchaseUploadingReceipt(false);
    }
  };

  const uploadPayReceipt = async (file) => {
    if (!file) return;
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (!allowed.includes(file.type)) {
      toast.error('Only PDF, PNG, or JPG files are allowed');
      return;
    }
    try {
      setPayUploadingReceipt(true);
      const res = await uploadAPI.upload(file);
      setPayReceiptUrl(res.data?.url || '');
      setPayReceiptFileName(file.name || '');
      toast.success('Receipt uploaded');
    } catch {
      toast.error('Failed to upload receipt');
    } finally {
      setPayUploadingReceipt(false);
    }
  };

  const createLinkedProfile = async () => {
    if (!newProfile.full_name || !newProfile.gender) {
      toast.error('Full name and gender are required');
      return;
    }
    try {
      setCreatingProfile(true);
      const res = await membersAPI.createProfile({
        full_name: newProfile.full_name,
        gender: newProfile.gender,
        relationship: newProfile.relationship,
        dependent_type: newProfile.dependent_type,
        email: newProfile.email,
        password: newProfile.password,
      });
      setAddProfileDialog(false);
      setNewProfile({ full_name: '', gender: '', relationship: '', dependent_type: 'kids', email: '', password: '' });
      fetchData();
      const tempPassword = res?.data?.temp_password;
      const depEmail = res?.data?.email;
      if (tempPassword || depEmail) {
        toast.success(`Profile added. Email: ${depEmail || '—'} Temporary password: ${tempPassword || '—'}`);
      } else {
        toast.success('Profile added');
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to add profile');
    } finally {
      setCreatingProfile(false);
    }
  };

  const submitFreeze = async () => {
    if (!freezeForMembershipId) return;
    if (!freezeForm.start_date || !freezeForm.end_date) {
      toast.error('Start and end dates are required');
      return;
    }
    try {
      setFreezing(true);
      await membershipsAPI.createFreeze(freezeForMembershipId, {
        start_date: freezeForm.start_date,
        end_date: freezeForm.end_date,
        reason: freezeForm.reason,
      }, locationId);
      setFreezeDialog(false);
      setFreezeForMembershipId(null);
      setFreezeForm({ start_date: '', end_date: '', reason: '' });
      fetchData();
      toast.success('Freeze request submitted');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to submit freeze');
    } finally {
      setFreezing(false);
    }
  };

  const toggleAutoRenew = async (membershipIdToUpdate, value) => {
    try {
      await membershipsAPI.update(membershipIdToUpdate, { auto_renew: value }, locationId);
      fetchData();
      toast.success(value ? 'Auto-renew enabled' : 'Auto-renew disabled');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to update auto-renew');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="bg-zinc-900 border-b border-zinc-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {member?.profile_photo_url ? (
              <img 
                src={resolveMediaUrl(member.profile_photo_url)}
                alt={member.full_name}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                <User className="h-5 w-5 text-orange-500" />
              </div>
            )}
            <div>
              <h1 className="text-lg font-bold text-white">{member?.full_name}</h1>
              <p className="text-sm text-zinc-400">{member?.member_no}</p>
              {profiles.length > 1 && (
                <div className="mt-2">
                  <select
                    value={activeProfileId || memberId}
                    onChange={(e) => setActiveProfileId(e.target.value)}
                    className="bg-zinc-950 border border-zinc-800 text-white text-xs px-2 py-1 rounded-sm"
                  >
                    {profiles.map((p) => (
                      <option key={p.member_id} value={p.member_id}>
                        {p.full_name}{p.is_primary ? ' (Primary)' : (p.relationship ? ` (${p.relationship})` : '')}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isPrimaryLogin && (
              <Button variant="outline" onClick={() => setAddProfileDialog(true)} className="border-zinc-800 text-zinc-300">
                Add Family/Friend
              </Button>
            )}
            <Button variant="ghost" onClick={handleLogout} className="text-zinc-400">
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4 flex items-center gap-4">
              {activeMembership ? (
                <>
                  <CheckCircle className="h-10 w-10 text-green-500" />
                  <div>
                    <p className="text-sm text-zinc-400">Membership</p>
                    <p className="text-lg font-bold text-green-500">Active</p>
                    <p className="text-xs text-zinc-500">Until {activeMembership.end_date}</p>
                    {planDisplay?.name && planDisplay.label === 'Plan' && (
                      <p className="text-xs text-zinc-500">
                        Plan: <span className="text-zinc-300">{planDisplay.name}</span>
                      </p>
                    )}
                  </div>
                </>
              ) : membershipStatusSummary ? (
                <>
                  <AlertTriangle className={`h-10 w-10 ${
                    ['past_due', 'expired', 'cancelled', 'renewal_required'].includes((membershipStatusSummary.status || '').toLowerCase())
                      ? 'text-red-500'
                      : 'text-yellow-500'
                  }`} />
                  <div>
                    <p className="text-sm text-zinc-400">Membership</p>
                    <p className={`text-lg font-bold ${
                      ['past_due', 'expired', 'cancelled', 'renewal_required'].includes((membershipStatusSummary.status || '').toLowerCase())
                        ? 'text-red-500'
                        : 'text-yellow-500'
                    }`}>
                      {(membershipStatusSummary.status || 'No Active Plan').toUpperCase()}
                    </p>
                    {membershipStatusSummary.end_date && (
                      <p className="text-xs text-zinc-500">Until {membershipStatusSummary.end_date}</p>
                    )}
                    {planDisplay?.name && planDisplay.label === 'Last Plan' && (
                      <p className="text-xs text-zinc-500">
                        Last Plan: <span className="text-zinc-300">{planDisplay.name}</span>
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-10 w-10 text-yellow-500" />
                  <div>
                    <p className="text-sm text-zinc-400">Membership</p>
                    <p className="text-lg font-bold text-yellow-500">No Active Plan</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4 flex items-center gap-4">
              <Calendar className="h-10 w-10 text-blue-500" />
              <div>
                <p className="text-sm text-zinc-400">This Week</p>
                <p className="text-lg font-bold text-white">{visibleSchedules.length} Classes</p>
                <p className="text-xs text-zinc-500">Available</p>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4 flex items-center gap-4">
              <CreditCard className="h-10 w-10 text-orange-500" />
              <div>
                <p className="text-sm text-zinc-400">Pending Payments</p>
                <p className="text-lg font-bold text-white">{pendingPayments.length}</p>
                {pendingPayments.length > 0 && (
                  <p className="text-xs text-orange-500">Action required</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="membership" className="space-y-4">
          <TabsList className="bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="membership">Membership</TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>

          {/* Membership Tab */}
          <TabsContent value="membership" className="space-y-4">
            {memberships.length === 0 ? (
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-8 text-center">
                  <CreditCard className="h-12 w-12 text-zinc-500 mx-auto mb-4" />
                  <p className="text-zinc-400">No memberships found</p>
                  <p className="text-sm text-zinc-500 mb-4">Choose your membership and payment plan to activate access</p>
                  {isPrimaryLogin ? (
                    <Button
                      onClick={() => {
                        if (!purchasePlanId && paymentPlans.length > 0) setPurchasePlanId(paymentPlans[0].plan_id);
                      setPurchaseAcceptTerms(false);
                        setPurchaseDialog(true);
                      }}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Select Membership
                    </Button>
                  ) : (
                    <p className="text-sm text-zinc-500">Membership payments are managed by the primary account</p>
                  )}
                </CardContent>
              </Card>
            ) : (
              memberships.map((membership) => (
                <Card key={membership.membership_id} className="bg-zinc-900 border-zinc-800">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={
                            membership.status === 'active' ? 'bg-green-500/20 text-green-400' :
                            membership.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                            (membership.status === 'expired' || membership.status === 'past_due') ? 'bg-red-500/20 text-red-400' :
                            'bg-zinc-500/20 text-zinc-400'
                          }>
                            {membership.status.toUpperCase()}
                          </Badge>
                          <Badge variant="outline" className="capitalize">
                            {membership.type.replace('_', ' ')}
                          </Badge>
                        </div>
                        <p className="text-white font-medium">
                          {membership.type === 'full_access'
                            ? 'Full Access Membership'
                            : membership.type === 'only_gym'
                              ? 'Only Gym Membership'
                              : membership.type === 'kids'
                                ? 'Kids Membership'
                                : 'Membership'}
                        </p>
                        {(membership.payment_plan_name || paymentPlanById[membership.payment_plan_id]?.name) && (
                          <p className="text-xs text-zinc-500 mt-1">
                            Plan:{' '}
                            <span className="text-zinc-300">
                              {membership.payment_plan_name || paymentPlanById[membership.payment_plan_id]?.name}
                            </span>
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-zinc-400">Valid Period</p>
                        <p className="text-white">{membership.start_date} → {membership.end_date}</p>
                      </div>
                    </div>
                    {membership.auto_renew && (
                      <p className="text-sm text-green-400 mt-4">
                        <CheckCircle className="h-4 w-4 inline mr-1" />
                        Auto-renewal enabled
                      </p>
                    )}
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      {isPrimaryLogin && ['expired', 'past_due', 'renewal_required'].includes((membership.status || '').toLowerCase()) && (
                        <Button
                          className="bg-orange-500 hover:bg-orange-600 text-white"
                          onClick={() => handleProceedPayment(membership)}
                        >
                          Proceed Payment
                        </Button>
                      )}
                      {isPrimaryLogin && membership.status === 'active' && ((membership.freeze_max_days == null ? true : membership.freeze_max_days > 0) && (membership.freeze_max_uses == null ? true : membership.freeze_max_uses > 0)) && (
                        <Button
                          variant="outline"
                          className="border-zinc-800 text-zinc-300"
                          onClick={() => {
                            setFreezeForMembershipId(membership.membership_id);
                            setFreezeDialog(true);
                          }}
                        >
                          Request Freeze
                        </Button>
                      )}
                      {isPrimaryLogin && (
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={!!membership.auto_renew}
                            onCheckedChange={(v) => toggleAutoRenew(membership.membership_id, !!v)}
                          />
                          <span className="text-sm text-zinc-300">Auto-renew</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Schedule Tab */}
          <TabsContent value="schedule" className="space-y-4">
            {!activeMembershipType ? (
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-8 text-center">
                  <Calendar className="h-12 w-12 text-zinc-500 mx-auto mb-4" />
                  <p className="text-zinc-400">No active membership</p>
                  <p className="text-sm text-zinc-500 mt-1">Activate a membership to view your schedule</p>
                </CardContent>
              </Card>
            ) : visibleSchedules.length === 0 ? (
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-8 text-center">
                  <Calendar className="h-12 w-12 text-zinc-500 mx-auto mb-4" />
                  <p className="text-zinc-400">No schedules available</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {scheduleCategoryOptions.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={selectedScheduleCategory === 'all' ? 'default' : 'outline'}
                      className={selectedScheduleCategory === 'all' ? 'bg-red-600 hover:bg-red-700' : 'border-zinc-800 text-zinc-300'}
                      onClick={() => setSelectedScheduleCategory('all')}
                    >
                      All Classes
                    </Button>
                    {scheduleCategoryOptions.map((c) => (
                      <Button
                        key={c.category_id}
                        size="sm"
                        variant={selectedScheduleCategory === c.category_id ? 'default' : 'outline'}
                        className={selectedScheduleCategory === c.category_id ? 'bg-red-600 hover:bg-red-700' : 'border-zinc-800 text-zinc-300'}
                        onClick={() => setSelectedScheduleCategory(c.category_id)}
                      >
                        {c.name}
                      </Button>
                    ))}
                  </div>
                )}
                <Card className="bg-zinc-900 border-zinc-800">
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
                                    {scheduleGrid.formatTime(s.start_time)}
                                  </div>
                                  <div className="text-sm font-medium text-white mt-1">
                                    {s.program_name || 'Class'}
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
              </div>
            )}
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments" className="space-y-4">
            {payments.length === 0 ? (
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-8 text-center">
                  <CreditCard className="h-12 w-12 text-zinc-500 mx-auto mb-4" />
                  <p className="text-zinc-400">No payment history</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-0">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left p-4 text-zinc-400 font-medium">Date</th>
                        <th className="text-left p-4 text-zinc-400 font-medium">Method</th>
                        <th className="text-left p-4 text-zinc-400 font-medium">Amount</th>
                        <th className="text-left p-4 text-zinc-400 font-medium">Status</th>
                        <th className="text-right p-4 text-zinc-400 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((payment) => (
                        <tr key={payment.payment_id} className="border-b border-zinc-800">
                          <td className="p-4 text-white">
                            {new Date(payment.created_at).toLocaleDateString()}
                          </td>
                          <td className="p-4 text-zinc-300 capitalize">{payment.method}</td>
                          <td className="p-4 text-white font-medium">
                            {payment.amount} {payment.currency}
                          </td>
                          <td className="p-4">
                            <Badge className={
                              ['paid', 'approved', 'completed'].includes((payment.status || '').toLowerCase()) ? 'bg-green-500/20 text-green-400' :
                              (payment.status || '').toLowerCase() === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                              'bg-red-500/20 text-red-400'
                            }>
                              {payment.status}
                            </Badge>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {['paid', 'approved', 'completed'].includes((payment.status || '').toLowerCase()) && (
                                <Button size="sm" variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => handleDownloadInvoice(payment.payment_id)}>
                                  <Download className="h-4 w-4 mr-2" />
                                  Invoice
                                </Button>
                              )}
                              {['declined', 'failed', 'cancelled', 'canceled'].includes((payment.status || '').toLowerCase()) && isPrimaryLogin && (
                                <Button size="sm" onClick={() => handlePayNow(payment)} className="bg-orange-500 hover:bg-orange-600">
                                  Pay Now
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-white flex items-center gap-2">
                    <User className="h-5 w-5 text-orange-500" />
                    Personal Information
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {profileEdit ? (
                      <>
                        <Button variant="ghost" onClick={() => setProfileEdit(false)} disabled={profileSaving}>Cancel</Button>
                        <Button onClick={saveProfile} disabled={profileSaving} className="bg-red-600 hover:bg-red-700">
                          {profileSaving ? 'Saving...' : 'Save'}
                        </Button>
                      </>
                    ) : (
                      <Button variant="outline" onClick={() => setProfileEdit(true)} className="border-zinc-800 text-zinc-300">
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-zinc-400">Full Name</p>
                    <p className="text-white">{member?.full_name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-400">Member ID</p>
                    <p className="text-white font-mono">{member?.member_no || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-400">Email</p>
                    <p className="text-white">{member?.email || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-400">Phone</p>
                    {profileEdit ? (
                      <Input
                        value={profileForm.phone}
                        onChange={(e) => setProfileForm(prev => ({ ...prev, phone: e.target.value }))}
                        className="bg-zinc-950 border-zinc-800 text-white mt-1"
                      />
                    ) : (
                      <p className="text-white">{member?.phone || '-'}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-zinc-400">Gender</p>
                    <p className="text-white capitalize">{member?.gender || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-400">Date of Birth</p>
                    <p className="text-white">{member?.dob || '-'}</p>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-zinc-400">Address</p>
                  {profileEdit ? (
                    <Input
                      value={profileForm.address}
                      onChange={(e) => setProfileForm(prev => ({ ...prev, address: e.target.value }))}
                      className="bg-zinc-950 border-zinc-800 text-white mt-1"
                      placeholder="Address"
                    />
                  ) : (
                    <p className="text-white">{member?.address || '-'}</p>
                  )}
                </div>
                
                <div className="pt-4 border-t border-zinc-800">
                  <h3 className="text-sm font-medium text-zinc-400 mb-2">Emergency Contact</h3>
                  {profileEdit && member?.primary_member_id && (
                    <div className="flex items-center gap-2 mb-4">
                      <Checkbox checked={usePrimaryEmergency} onCheckedChange={(v) => applyPrimaryEmergency(!!v)} />
                      <span className="text-sm text-zinc-300">Use primary member as emergency contact</span>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-zinc-500">Name</p>
                      {profileEdit ? (
                        <Input
                          value={profileForm.emergency_contact.name}
                          onChange={(e) => setProfileForm(prev => ({ ...prev, emergency_contact: { ...prev.emergency_contact, name: e.target.value } }))}
                          className="bg-zinc-950 border-zinc-800 text-white mt-1"
                          disabled={usePrimaryEmergency && !!primaryContact}
                        />
                      ) : (
                        <p className="text-white">{member?.emergency_contact?.name || '-'}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-zinc-500">Phone</p>
                      {profileEdit ? (
                        <Input
                          value={profileForm.emergency_contact.phone}
                          onChange={(e) => setProfileForm(prev => ({ ...prev, emergency_contact: { ...prev.emergency_contact, phone: e.target.value } }))}
                          className="bg-zinc-950 border-zinc-800 text-white mt-1"
                          disabled={usePrimaryEmergency && !!primaryContact}
                        />
                      ) : (
                        <p className="text-white">{member?.emergency_contact?.phone || '-'}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-zinc-500">Relation</p>
                      {profileEdit ? (
                        <Input
                          value={profileForm.emergency_contact.relation}
                          onChange={(e) => setProfileForm(prev => ({ ...prev, emergency_contact: { ...prev.emergency_contact, relation: e.target.value } }))}
                          className="bg-zinc-950 border-zinc-800 text-white mt-1"
                        />
                      ) : (
                        <p className="text-white">{member?.emergency_contact?.relation || '-'}</p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Pay Now Dialog */}
      <Dialog open={payDialog} onOpenChange={setPayDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle>{payIntent === 'renewal' ? 'Proceed Payment' : 'Complete Payment'}</DialogTitle>
            <DialogDescription className="sr-only">Select a payment method and proceed.</DialogDescription>
          </DialogHeader>
          {selectedPendingPayment && (
            <div className="space-y-4 py-4">
              <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 flex justify-between items-center">
                <span className="text-zinc-400">{payIntent === 'renewal' ? 'Renewal Amount' : 'Amount Due'}</span>
                <span className="text-xl font-bold text-white">
                  {selectedPendingPayment.amount} {selectedPendingPayment.currency || 'AED'}
                </span>
              </div>
              
              <div className="space-y-3">
                <Label>Select Payment Method</Label>
                {availablePaymentMethods.length === 0 && !manualPaymentAvailable ? (
                  <p className="text-sm text-zinc-500">No payment methods available.</p>
                ) : (
                  <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="space-y-2">
                    {availablePaymentMethods.map((method) => (
                      <div key={method.provider} className={`flex items-center space-x-2 p-3 rounded-lg border ${paymentMethod === method.provider ? 'border-orange-500 bg-orange-500/10' : 'border-zinc-800'}`}>
                        <RadioGroupItem value={method.provider} id={`pay-${method.provider}`} />
                        <Label htmlFor={`pay-${method.provider}`} className="cursor-pointer flex-1">
                          {method.display_name} {method.is_sandbox && <span className="text-xs text-yellow-500 ml-2">(Sandbox)</span>}
                        </Label>
                      </div>
                    ))}
                    {manualPaymentAvailable && (
                      <div className={`flex items-center space-x-2 p-3 rounded-lg border ${paymentMethod === 'cash' ? 'border-orange-500 bg-orange-500/10' : 'border-zinc-800'}`}>
                        <RadioGroupItem value="cash" id="pay-cash" />
                        <Label htmlFor="pay-cash" className="cursor-pointer flex-1">
                          Manual / Receipt
                        </Label>
                      </div>
                    )}
                  </RadioGroup>
                )}
              </div>

              {paymentMethod === 'cash' && manualPaymentAvailable && (
                <div className="pt-4 border-t border-zinc-800 space-y-3">
                  <div className="text-sm text-zinc-300">
                    Upload your receipt or add payment details to submit for approval.
                  </div>
                  <div className="space-y-2">
                    <Label>Receipt Upload (PDF/PNG/JPG)</Label>
                    <input
                      type="file"
                      disabled={payUploadingReceipt}
                      onChange={(e) => uploadPayReceipt(e.target.files?.[0])}
                      className="w-full text-sm text-zinc-300"
                    />
                    {(payReceiptFileName || payReceiptUrl) && (
                      <div className="text-xs text-zinc-500">{payReceiptFileName || payReceiptUrl}</div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Payment Details</Label>
                    <Input
                      value={payReceiptInfo}
                      onChange={(e) => setPayReceiptInfo(e.target.value)}
                      className="bg-zinc-950 border-zinc-800 text-white"
                      placeholder="e.g. Cash paid at reception, reference #..."
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayDialog(false)} disabled={processingPayment}>Cancel</Button>
            <Button 
              onClick={processPayment} 
              disabled={
                processingPayment ||
                !selectedPendingPayment ||
                !paymentMethod ||
                (paymentMethod === 'cash'
                  ? (!manualPaymentAvailable || (!payReceiptUrl && !payReceiptInfo.trim()))
                  : (availablePaymentMethods.length === 0))
              }
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {processingPayment ? 'Processing...' : (paymentMethod === 'cash' ? 'Submit for Approval' : 'Proceed to Checkout')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={purchaseDialog} onOpenChange={setPurchaseDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle>Select Membership</DialogTitle>
            <DialogDescription className="sr-only">Choose a membership type and payment plan to proceed with payment.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Membership Type</Label>
              <RadioGroup value={purchaseType} onValueChange={setPurchaseType} className="space-y-2">
                {(profiles.find(p => p.member_id === (activeProfileId || memberId))?.dependent_type !== 'kids') && (
                  <>
                    <div className="flex items-center space-x-2 p-3 rounded-lg border border-zinc-800">
                      <RadioGroupItem value="full_access" id="mt-full" />
                      <Label htmlFor="mt-full" className="cursor-pointer flex-1">Full Access</Label>
                    </div>
                    <div className="flex items-center space-x-2 p-3 rounded-lg border border-zinc-800">
                      <RadioGroupItem value="only_gym" id="mt-gym" />
                      <Label htmlFor="mt-gym" className="cursor-pointer flex-1">Only Gym</Label>
                    </div>
                  </>
                )}
                {(profiles.find(p => p.member_id === (activeProfileId || memberId))?.dependent_type === 'kids') && (
                  <div className="flex items-center space-x-2 p-3 rounded-lg border border-zinc-800">
                    <RadioGroupItem value="kids" id="mt-kids" />
                    <Label htmlFor="mt-kids" className="cursor-pointer flex-1">Kids</Label>
                  </div>
                )}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>Payment Plan</Label>
              <select
                value={purchasePlanId}
                onChange={(e) => setPurchasePlanId(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-white px-3 py-2 rounded-sm"
              >
                <option value="" disabled>Select a plan</option>
                {paymentPlans.filter(p => (p.membership_type || 'full_access') === purchaseType).map((p) => (
                  <option key={p.plan_id} value={p.plan_id}>
                    {p.name} — {p.currency || 'AED'} {p.price} / {p.billing_cycle}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox checked={purchaseAutoRenew} onCheckedChange={(v) => setPurchaseAutoRenew(!!v)} />
              <span className="text-sm text-zinc-300">Enable auto-renew</span>
            </div>

            {!member?.terms_accepted_at && (activeProfileId || memberId) === memberId && (
              <div className="flex items-center gap-2">
                <Checkbox checked={purchaseAcceptTerms} onCheckedChange={(v) => setPurchaseAcceptTerms(!!v)} />
                <span className="text-sm text-zinc-300">I accept Terms & Conditions</span>
              </div>
            )}

            {availablePaymentMethods.length === 0 && manualPaymentAvailable && (
              <div className="pt-4 border-t border-zinc-800 space-y-3">
                <div className="text-sm text-zinc-300">
                  Online payment is unavailable right now. Upload your receipt or add payment details to submit for approval.
                </div>
                <div className="space-y-2">
                  <Label>Receipt Upload (PDF/PNG/JPG)</Label>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => uploadPurchaseReceipt(e.target.files?.[0] || null)}
                    className="w-full text-sm text-zinc-300 file:mr-3 file:py-2 file:px-3 file:rounded-sm file:border-0 file:bg-zinc-800 file:text-white hover:file:bg-zinc-700"
                    disabled={purchaseUploadingReceipt || purchasing}
                  />
                  {(purchaseReceiptFileName || purchaseReceiptUrl) && (
                    <div className="text-xs text-zinc-500">{purchaseReceiptFileName || purchaseReceiptUrl}</div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Payment Details</Label>
                  <Input
                    value={purchaseReceiptInfo}
                    onChange={(e) => setPurchaseReceiptInfo(e.target.value)}
                    className="bg-zinc-950 border-zinc-800 text-white"
                    placeholder="Bank transfer reference, date, etc."
                    disabled={purchasing}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPurchaseDialog(false)} disabled={purchasing}>Cancel</Button>
            <Button onClick={processPurchase} disabled={purchasing} className="bg-red-600 hover:bg-red-700">
              {purchasing ? 'Processing...' : (availablePaymentMethods.length > 0 ? 'Proceed to Payment' : 'Submit for Approval')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addProfileDialog} onOpenChange={setAddProfileDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle>Add Family/Friend</DialogTitle>
            <DialogDescription className="sr-only">Create a linked dependent profile for family or friends.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Full name</Label>
              <Input
                value={newProfile.full_name}
                onChange={(e) => setNewProfile({ ...newProfile, full_name: e.target.value })}
                className="bg-zinc-950 border-zinc-800 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label>Dependent type</Label>
              <select
                value={newProfile.dependent_type}
                onChange={(e) => {
                  const dep = e.target.value;
                  setNewProfile({ ...newProfile, dependent_type: dep, relationship: dep === 'kids' ? 'Kid' : dep === 'spouse' ? 'Spouse' : 'Friend' });
                }}
                className="w-full bg-zinc-950 border border-zinc-800 text-white px-3 py-2 rounded-sm"
              >
                <option value="kids">Kids</option>
                <option value="spouse">Spouse</option>
                <option value="friend">Friend/Other</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Gender</Label>
              <select
                value={newProfile.gender}
                onChange={(e) => setNewProfile({ ...newProfile, gender: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 text-white px-3 py-2 rounded-sm"
              >
                <option value="" disabled>Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Relationship</Label>
              <Input
                value={newProfile.relationship}
                onChange={(e) => setNewProfile({ ...newProfile, relationship: e.target.value })}
                className="bg-zinc-950 border-zinc-800 text-white"
                placeholder="Kid, spouse, friend..."
              />
            </div>
            <div className="space-y-2">
              <Label>Email (for dependent login)</Label>
              <Input
                value={newProfile.email}
                onChange={(e) => setNewProfile({ ...newProfile, email: e.target.value })}
                className="bg-zinc-950 border-zinc-800 text-white"
                placeholder="optional"
              />
            </div>
            <div className="space-y-2">
              <Label>Temporary password (optional)</Label>
              <Input
                value={newProfile.password}
                onChange={(e) => setNewProfile({ ...newProfile, password: e.target.value })}
                className="bg-zinc-950 border-zinc-800 text-white"
                placeholder="leave blank to auto-generate"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddProfileDialog(false)} disabled={creatingProfile}>Cancel</Button>
            <Button onClick={createLinkedProfile} disabled={creatingProfile} className="bg-red-600 hover:bg-red-700">
              {creatingProfile ? 'Saving...' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={freezeDialog} onOpenChange={setFreezeDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle>Request Freeze</DialogTitle>
            <DialogDescription className="sr-only">Submit a membership freeze request by providing start and end dates.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start date</Label>
                <Input
                  type="date"
                  value={freezeForm.start_date}
                  onChange={(e) => setFreezeForm({ ...freezeForm, start_date: e.target.value })}
                  className="bg-zinc-950 border-zinc-800 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label>End date</Label>
                <Input
                  type="date"
                  value={freezeForm.end_date}
                  onChange={(e) => setFreezeForm({ ...freezeForm, end_date: e.target.value })}
                  className="bg-zinc-950 border-zinc-800 text-white"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input
                value={freezeForm.reason}
                onChange={(e) => setFreezeForm({ ...freezeForm, reason: e.target.value })}
                className="bg-zinc-950 border-zinc-800 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFreezeDialog(false)} disabled={freezing}>Cancel</Button>
            <Button onClick={submitFreeze} disabled={freezing} className="bg-red-600 hover:bg-red-700">
              {freezing ? 'Submitting...' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
