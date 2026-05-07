import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { salesAPI } from '@/lib/api';
import { toast } from 'sonner';
import FileUpload from '@/components/FileUpload';
import { downloadCsv } from '@/lib/csv';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus, Phone, Mail, Calendar, User, MessageSquare, Loader2, GripVertical, X,
} from 'lucide-react';

const PIPELINE_STAGES = [
  { key: 'new', label: 'New', color: 'bg-blue-500', border: 'border-blue-500/30', text: 'text-blue-400' },
  { key: 'under_discussion', label: 'Under Discussion', color: 'bg-amber-500', border: 'border-amber-500/30', text: 'text-amber-400' },
  { key: 'under_process', label: 'Under Process', color: 'bg-purple-500', border: 'border-purple-500/30', text: 'text-purple-400' },
  { key: 'call_back_requested', label: 'Call Back Requested', color: 'bg-cyan-500', border: 'border-cyan-500/30', text: 'text-cyan-400' },
  { key: 'follow_up_pending', label: 'Follow-up Pending', color: 'bg-fuchsia-500', border: 'border-fuchsia-500/30', text: 'text-fuchsia-400' },
  { key: 'no_response', label: 'No Response', color: 'bg-zinc-600', border: 'border-zinc-600/30', text: 'text-zinc-400' },
  { key: 'converted', label: 'Converted', color: 'bg-green-500', border: 'border-green-500/30', text: 'text-green-400' },
  { key: 'not_interested', label: 'Not Interested', color: 'bg-zinc-600', border: 'border-zinc-600/30', text: 'text-zinc-400' },
  { key: 'duplicate', label: 'Duplicate', color: 'bg-zinc-700', border: 'border-zinc-700/30', text: 'text-zinc-400' },
  { key: 'transferred', label: 'Transferred', color: 'bg-zinc-700', border: 'border-zinc-700/30', text: 'text-zinc-400' },
];

const STATUS_OPTIONS = [
  'new',
  'converted',
  'canceled',
  'not_interested',
  'under_discussion',
  'under_process',
  'call_back_requested',
  'follow_up_pending',
  'no_response',
  'duplicate',
  'transferred',
];

const LOST_REASON_STATUSES = new Set(['canceled', 'not_interested', 'no_response', 'duplicate']);
const LOST_REASON_CATEGORIES = [
  { value: 'budget_issue', label: 'Budget Issue' },
  { value: 'joined_elsewhere', label: 'Already Joined Elsewhere' },
  { value: 'not_reachable', label: 'Not Reachable' },
  { value: 'duplicate_record', label: 'Duplicate Record' },
  { value: 'wrong_inquiry', label: 'Wrong Inquiry' },
  { value: 'no_longer_interested', label: 'No Longer Interested' },
  { value: 'other', label: 'Other' },
];

const SOURCE_OPTIONS = [
  'WEBSITE_CONTACT_US',
  'WEBSITE_JOIN_FORM',
  'MANUAL_CSR_ENTRY',
  'BULK_IMPORT',
  'META',
  'TIKTOK',
  'SNAPCHAT',
  'OTHER',
];

const PURPOSE_OPTIONS = [
  { value: 'self', label: 'Self' },
  { value: 'kids', label: 'Kids' },
  { value: 'family', label: 'Family' },
  { value: 'friends', label: 'Friends' },
];

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(s => String(s || '').trim());
}

function parseLeadsCsv(text, defaultLocationId) {
  const rows = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean);
  if (rows.length === 0) return [];
  const header = parseCsvLine(rows[0]).map(h => h.toLowerCase());
  const idx = (name) => header.indexOf(name);

  return rows.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const get = (name) => (idx(name) >= 0 ? (cols[idx(name)] || '') : '');
    const tags = get('tags');
    return {
      full_name: get('full_name'),
      phone: get('phone') || get('phone_number'),
      email: get('email'),
      source: get('source') || 'BULK_IMPORT',
      location_id: get('location_id') || get('assigned_location_id') || defaultLocationId || '',
      notes: get('notes'),
      gender: get('gender') || null,
      address: get('address'),
      purpose: get('purpose'),
      program_interest: get('program_interest'),
      membership_plan: get('membership_plan'),
      lead_priority: get('lead_priority') || 'MEDIUM',
      temperature: get('lead_temperature') || get('temperature') || 'WARM',
      tags: tags ? tags.split(';').map(t => t.trim()).filter(Boolean) : [],
    };
  }).filter(r => r.full_name);
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function SalesLeadsTab({
  currentLocation,
  locations,
  onRefreshStats,
  currentStaffId = null,
  leadView = 'all',
  actorKind = null,
  canManage = true,
}) {
  const [leads, setLeads] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [conflict, setConflict] = useState(null);
  const [conflictTransfer, setConflictTransfer] = useState({ target_location_id: '', target_team_id: '', target_agent_staff_id: '' });
  const [conflictTransferTeams, setConflictTransferTeams] = useState([]);
  const [conflictTransferStaff, setConflictTransferStaff] = useState([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    location_id: '', full_name: '', phone_number: '', email: '', source: 'MANUAL_CSR_ENTRY', notes: '',
    lead_priority: 'MEDIUM', temperature: 'WARM',
    gender: '',
    address: '',
    purpose: 'self',
    program_interest: '',
    membership_plan: '',
  });
  const [editForm, setEditForm] = useState({});
  const [activityForm, setActivityForm] = useState({ activity_type: 'call_made', note: '', next_action_date: '' });
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertForm, setConvertForm] = useState({ gender: 'male', password: '', address: '', purpose: 'self', program_interest: '', membership_plan: '' });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkResult, setBulkResult] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [attachmentForm, setAttachmentForm] = useState({ file_url: '', file_name: '', attachment_type: 'other', note: '' });
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeForm, setMergeForm] = useState({ other_lead_id: '', keep: 'this' });
  const [statusReason, setStatusReason] = useState({ open: false, lead: null, status: '', category: 'other', comment: '', pendingDetailPatch: null });
  const [filters, setFilters] = useState({
    working_group: '',
    gender: '',
    purpose: '',
    program_interest: '',
    membership_plan: '',
  });
  const dragItem = useRef(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = currentLocation ? { location_id: currentLocation.location_id, limit: 500 } : { limit: 500 };
      if (filters.working_group) params.working_group = filters.working_group;
      if (filters.gender) params.gender = filters.gender;
      if (filters.purpose) params.purpose = filters.purpose;
      if (filters.program_interest) params.program_interest = filters.program_interest;
      if (filters.membership_plan) params.membership_plan = filters.membership_plan;
      const lr = await salesAPI.listLeads(params);
      setLeads(lr.data.leads);
      try {
        const tr = await salesAPI.listTeams(currentLocation ? { location_id: currentLocation.location_id } : {});
        setTeams(tr.data.teams || []);
      } catch {
        setTeams([]);
      }
    } catch { toast.error('Failed to load leads'); }
    finally { setLoading(false); }
  }, [currentLocation, filters]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const effectiveKind = (actorKind || '').toUpperCase();
  const canActOnLead = (lead) => {
    if (!canManage) return false;
    if (effectiveKind === 'CSR' && currentStaffId) {
      return (lead?.assigned_agent_staff_id || lead?.assigned_csr_staff_id) === currentStaffId;
    }
    return true;
  };

  const handleDragStart = (e, lead) => {
    if (!canActOnLead(lead)) return;
    dragItem.current = lead;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', lead.sales_lead_id);
    e.currentTarget.style.opacity = '0.4';
  };

  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = '1';
    dragItem.current = null;
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e, targetStatus) => {
    e.preventDefault();
    const lead = dragItem.current;
    if (!canActOnLead(lead)) return;
    if (!lead || lead.status === targetStatus) return;
    if (LOST_REASON_STATUSES.has(String(targetStatus || '').toLowerCase())) {
      setStatusReason({ open: true, lead, status: targetStatus, category: 'other', comment: '', pendingDetailPatch: null });
      return;
    }
    // Optimistic update
    setLeads(prev => prev.map(l => l.sales_lead_id === lead.sales_lead_id ? { ...l, status: targetStatus, pipeline_stage: targetStatus } : l));
    try {
      await salesAPI.updateLeadStatus(lead.sales_lead_id, { status: targetStatus, note: '' });
      onRefreshStats?.();
    } catch {
      toast.error('Failed to update status');
      fetchLeads();
    }
  };

  const submitStatusReason = async () => {
    const leadId = statusReason?.lead?.sales_lead_id;
    const st = String(statusReason?.status || '').toLowerCase();
    const comment = String(statusReason?.comment || '').trim();
    const category = String(statusReason?.category || '').trim() || 'other';
    if (!leadId || !st) return;
    if (!comment) return toast.error('Reason is required');
    setSaving(true);
    try {
      await salesAPI.updateLeadStatus(leadId, {
        status: st,
        note: comment,
        reason_category: category,
        reason_comment: comment,
      });
      if (statusReason?.pendingDetailPatch && Object.keys(statusReason.pendingDetailPatch).length) {
        await salesAPI.updateLead(leadId, statusReason.pendingDetailPatch);
      }
      toast.success('Status updated');
      setStatusReason({ open: false, lead: null, status: '', category: 'other', comment: '', pendingDetailPatch: null });
      if (showDetail && showDetail.sales_lead_id === leadId) setShowDetail(null);
      fetchLeads();
      onRefreshStats?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateLead = async () => {
    if (!form.full_name.trim()) return toast.error('Name is required');
    setSaving(true);
    try {
      await salesAPI.createLead(form);
      toast.success('Lead created');
      setShowCreate(false);
      setForm({
        location_id: '', full_name: '', phone_number: '', email: '', source: 'MANUAL_CSR_ENTRY', notes: '',
        lead_priority: 'MEDIUM', temperature: 'WARM',
        gender: '',
        address: '',
        purpose: 'self',
        program_interest: '',
        membership_plan: '',
      });
      fetchLeads();
      onRefreshStats?.();
    } catch (e) {
      const d = e?.response?.data?.detail;
      if (e?.response?.status === 409 && d?.kind === 'lead_duplicate' && d?.existing_lead_id) {
        setConflict({ kind: 'lead_duplicate', detail: d });
        toast.error('Duplicate lead already exists');
      } else if (e?.response?.status === 409 && d?.kind === 'member_exists') {
        setConflict({ kind: 'member_exists', detail: d });
        toast.error('This email/phone is already an existing member');
      } else {
        toast.error(d?.message || d || 'Failed');
      }
    }
    finally { setSaving(false); }
  };

  const openDetail = async (lead) => {
    try {
      const [r, tr, ar] = await Promise.all([
        salesAPI.getLead(lead.sales_lead_id),
        salesAPI.getLeadTimeline(lead.sales_lead_id, { limit: 200 }),
        salesAPI.listLeadAttachments(lead.sales_lead_id, { limit: 200 }),
      ]);
      setShowDetail(r.data);
      setTimeline(tr.data.events || []);
      setAttachments(ar.data.attachments || []);
      setAttachmentForm({ file_url: '', file_name: '', attachment_type: 'other', note: '' });
      setMergeForm({ other_lead_id: '', keep: 'this' });
      setEditForm({
        full_name: r.data.full_name || '',
        email: r.data.email || '',
        phone_number: r.data.phone_number || r.data.phone || '',
        status: r.data.status,
        assigned_location_id: r.data.assigned_location_id || r.data.location_id || '',
        assigned_team_id: r.data.assigned_team_id || '',
        assigned_agent_staff_id: r.data.assigned_agent_staff_id || '',
        next_follow_up_date: r.data.next_follow_up_date || '',
        notes: r.data.notes || '',
        lead_priority: r.data.lead_priority || 'MEDIUM',
        temperature: r.data.temperature || 'WARM',
        gender: r.data.gender || '',
        address: r.data.address || '',
        purpose: r.data.purpose || 'self',
        program_interest: r.data.program_interest || '',
        membership_plan: r.data.membership_plan || '',
        membership_type: r.data.membership_type || '',
        membership_price: r.data.membership_price || '',
      });
    } catch { toast.error('Failed to load lead'); }
  };

  const handleUpdateLead = async () => {
    setSaving(true);
    try {
      const updates = {};
      Object.entries(editForm).forEach(([k, v]) => {
        if (k === 'assigned_location_id') return;
        if (v === '' || v === null || v === undefined) return;
        let cur = showDetail?.[k];
        if (k === 'phone_number') cur = showDetail?.phone_number || showDetail?.phone || '';
        if (k === 'assigned_team_id') cur = showDetail?.assigned_team_id || '';
        if (k === 'assigned_agent_staff_id') cur = showDetail?.assigned_agent_staff_id || '';
        if (k === 'membership_price') cur = String(showDetail?.membership_price || '');
        if (String(v) !== String(cur ?? '')) updates[k] = v;
      });

      if (updates.membership_price) updates.membership_price = parseFloat(updates.membership_price);
      const nextStatus = updates.status;
      const restPatch = (() => {
        const { status, ...rest } = updates;
        return rest;
      })();
      if (nextStatus && nextStatus !== showDetail.status && LOST_REASON_STATUSES.has(String(nextStatus || '').toLowerCase())) {
        setStatusReason({ open: true, lead: showDetail, status: nextStatus, category: 'other', comment: '', pendingDetailPatch: restPatch });
        setSaving(false);
        return;
      }
      if (nextStatus && nextStatus !== showDetail.status) {
        await salesAPI.updateLeadStatus(showDetail.sales_lead_id, { status: nextStatus, note: '' });
      }
      if (Object.keys(restPatch).length) {
        await salesAPI.updateLead(showDetail.sales_lead_id, restPatch);
      }
      toast.success('Lead updated');
      setShowDetail(null);
      fetchLeads();
      onRefreshStats?.();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
    finally { setSaving(false); }
  };

  const backendUrl = process.env.REACT_APP_BACKEND_URL;
  const fullAssetUrl = useCallback((u) => {
    if (!u) return '';
    return u.startsWith('/') ? `${backendUrl}${u}` : u;
  }, [backendUrl]);

  const refreshLeadExtras = useCallback(async (leadId) => {
    if (!leadId) return;
    try {
      const [tr, ar] = await Promise.all([
        salesAPI.getLeadTimeline(leadId, { limit: 200 }),
        salesAPI.listLeadAttachments(leadId, { limit: 200 }),
      ]);
      setTimeline(tr.data.events || []);
      setAttachments(ar.data.attachments || []);
    } catch {}
  }, []);

  const addAttachment = async () => {
    if (!showDetail?.sales_lead_id) return;
    if (!attachmentForm.file_url) return toast.error('Upload a file first');
    setSaving(true);
    try {
      await salesAPI.addLeadAttachment(showDetail.sales_lead_id, {
        file_url: attachmentForm.file_url,
        file_name: attachmentForm.file_name,
        attachment_type: attachmentForm.attachment_type,
        note: attachmentForm.note,
      });
      toast.success('Attachment added');
      setAttachmentForm({ file_url: '', file_name: '', attachment_type: 'other', note: '' });
      refreshLeadExtras(showDetail.sales_lead_id);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const executeMerge = async () => {
    if (!showDetail?.sales_lead_id) return;
    const otherId = String(mergeForm.other_lead_id || '').trim();
    if (!otherId) return toast.error('Enter a lead ID to merge');
    if (otherId === showDetail.sales_lead_id) return toast.error('Choose a different lead ID');
    setSaving(true);
    try {
      if (mergeForm.keep === 'other') {
        await salesAPI.mergeLead(otherId, { source_lead_id: showDetail.sales_lead_id });
      } else {
        await salesAPI.mergeLead(showDetail.sales_lead_id, { source_lead_id: otherId });
      }
      toast.success('Leads merged');
      setMergeOpen(false);
      setShowDetail(null);
      fetchLeads();
      onRefreshStats?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Merge failed');
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    const lid = currentLocation?.location_id || (locations.length === 1 ? locations[0].location_id : '');
    setForm({
      location_id: lid, full_name: '', phone_number: '', email: '', source: 'MANUAL_CSR_ENTRY', notes: '',
      lead_priority: 'MEDIUM', temperature: 'WARM',
      gender: '',
      address: '',
      purpose: 'self',
      program_interest: '',
      membership_plan: '',
    });
    setShowCreate(true);
  };

  const addActivity = async () => {
    if (!showDetail) return;
    setSaving(true);
    try {
      await salesAPI.addLeadActivity(showDetail.sales_lead_id, {
        activity_type: activityForm.activity_type,
        note: activityForm.note,
        next_action_date: activityForm.next_action_date || null,
      });
      const tr = await salesAPI.getLeadTimeline(showDetail.sales_lead_id, { limit: 200 });
      setTimeline(tr.data.events || []);
      if (activityForm.next_action_date) {
        setEditForm(f => ({ ...f, next_follow_up_date: activityForm.next_action_date }));
      }
      setActivityForm({ activity_type: 'call_made', note: '', next_action_date: '' });
      toast.success('Activity added');
    } catch {
      toast.error('Failed to add activity');
    } finally {
      setSaving(false);
    }
  };

  const convertLead = async () => {
    if (!showDetail) return;
    setSaving(true);
    try {
      const r0 = await salesAPI.convertLeadToMember(showDetail.sales_lead_id, convertForm);
      const temp = r0?.data?.temp_password;
      if (temp) toast.success(`Converted. Temp password: ${temp}`);
      else toast.success('Converted to member');
      setConvertOpen(false);
      fetchLeads();
      const r = await salesAPI.getLead(showDetail.sales_lead_id);
      setShowDetail(r.data);
      const tr = await salesAPI.getLeadTimeline(showDetail.sales_lead_id, { limit: 200 });
      setTimeline(tr.data.events || []);
      onRefreshStats?.();
    } catch (e) {
      toast.error(e.response?.data?.detail?.message || e.response?.data?.detail || 'Conversion failed');
    } finally {
      setSaving(false);
    }
  };

  const openConflictLead = async (openMergeAfter = false) => {
    const id = conflict?.detail?.existing_lead_id || conflict?.detail?.linked?.existing_lead_id;
    if (!id) return;
    setSaving(true);
    try {
      const [r, tr] = await Promise.all([
        salesAPI.getLead(id),
        salesAPI.getLeadTimeline(id, { limit: 200 }),
      ]);
      setShowDetail(r.data);
      setTimeline(tr.data.events || []);
      setEditForm({
        status: r.data.status,
        assigned_team_id: r.data.assigned_team_id || '',
        assigned_agent_staff_id: r.data.assigned_agent_staff_id || '',
        next_follow_up_date: r.data.next_follow_up_date || '',
        notes: r.data.notes || '',
        lead_priority: r.data.lead_priority || 'MEDIUM',
        temperature: r.data.temperature || 'WARM',
        membership_type: r.data.membership_type || '',
        membership_price: r.data.membership_price || '',
      });
      setConflict(null);
      if (openMergeAfter) {
        setMergeForm({ other_lead_id: '', keep: 'this' });
        setMergeOpen(true);
      }
    } catch (e) {
      toast.error(e?.response?.status === 403 ? 'You can’t open this lead, but you can request transfer if allowed.' : 'Failed to open lead');
    } finally {
      setSaving(false);
    }
  };

  const claimConflictLead = async () => {
    const id = conflict?.detail?.existing_lead_id || conflict?.detail?.linked?.existing_lead_id;
    if (!id || !currentStaffId) return;
    setSaving(true);
    try {
      await salesAPI.transferLead(id, { target_agent_staff_id: currentStaffId, note: 'Claim from duplicate flow' });
      toast.success('Lead transferred');
      setConflict(null);
      fetchLeads();
      onRefreshStats?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail?.message || e?.response?.data?.detail || 'Transfer failed');
    } finally {
      setSaving(false);
    }
  };

  const loadConflictTransferOptions = useCallback(async (lid) => {
    if (!lid) {
      setConflictTransferTeams([]);
      setConflictTransferStaff([]);
      return;
    }
    try {
      const [tr, sr] = await Promise.all([
        salesAPI.listTeams({ location_id: lid }),
        salesAPI.getAvailableStaff({ location_id: lid }),
      ]);
      setConflictTransferTeams(tr.data.teams || []);
      setConflictTransferStaff(sr.data || []);
    } catch {
      setConflictTransferTeams([]);
      setConflictTransferStaff([]);
    }
  }, []);

  useEffect(() => {
    if (!conflict?.detail) return;
    const baseLid = conflict.detail.location_id || conflict.detail.linked?.location_id || currentLocation?.location_id || '';
    setConflictTransfer({ target_location_id: baseLid, target_team_id: '', target_agent_staff_id: '' });
    if (baseLid) loadConflictTransferOptions(baseLid);
  }, [conflict, currentLocation, loadConflictTransferOptions]);

  const transferConflictLead = async () => {
    const id = conflict?.detail?.existing_lead_id || conflict?.detail?.linked?.existing_lead_id;
    if (!id) return;
    if (!conflictTransfer.target_agent_staff_id && !conflictTransfer.target_team_id && !conflictTransfer.target_location_id) {
      return toast.error('Select a transfer target');
    }
    setSaving(true);
    try {
      await salesAPI.transferLead(id, {
        target_location_id: conflictTransfer.target_location_id || null,
        target_team_id: conflictTransfer.target_team_id || null,
        target_agent_staff_id: conflictTransfer.target_agent_staff_id || null,
        note: 'Transfer from duplicate flow',
      });
      toast.success('Lead transferred');
      setConflict(null);
      fetchLeads();
      onRefreshStats?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail?.message || e?.response?.data?.detail || 'Transfer failed');
    } finally {
      setSaving(false);
    }
  };

  const downloadBulkSample = () => {
    const sample = [
      'full_name,email,phone_number,source,assigned_location_id,notes,gender,address,purpose,program_interest,membership_plan,lead_priority,lead_temperature,tags',
      'John Doe,john@example.com,0500000000,META,loc_123,Interested in trial,male,Sharjah,self,boxing,monthly,HIGH,hot,meta;boxing',
    ].join('\n');
    downloadTextFile('crm_leads_sample.csv', sample, 'text/csv');
  };

  const startBulkImport = async () => {
    const lid = currentLocation?.location_id || (locations.length === 1 ? locations[0].location_id : '');
    const rows = parseLeadsCsv(bulkText, lid);
    if (!rows.length) return toast.error('No rows found');
    setSaving(true);
    try {
      const r = await salesAPI.bulkImportLeads({ rows });
      setBulkResult(r.data);
      toast.success('Bulk import processed');
      fetchLeads();
      onRefreshStats?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Bulk import failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-zinc-600 animate-spin" /></div>;

  const visibleLeads = (() => {
    const v = String(leadView || 'all').toLowerCase();
    if ((v === 'mine' || v === 'direct') && currentStaffId) {
      return leads.filter(l => (l.owner_bucket || '').toLowerCase() === 'direct' || (l.assigned_agent_staff_id || l.assigned_csr_staff_id) === currentStaffId);
    }
    if (v === 'team') return leads.filter(l => (l.owner_bucket || '').toLowerCase() === 'team');
    if (v === 'branch') return leads.filter(l => (l.owner_bucket || '').toLowerCase() === 'branch');
    return leads;
  })();

  const groupedLeads = {};
  PIPELINE_STAGES.forEach(s => { groupedLeads[s.key] = []; });
  visibleLeads.forEach(l => {
    if (groupedLeads[l.status]) groupedLeads[l.status].push(l);
    else groupedLeads['new'].push(l);
  });
  const canEditDetail = showDetail ? canActOnLead(showDetail) : false;

  return (
    <div data-testid="sales-leads-tab">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-heading font-bold text-white text-lg uppercase tracking-wider">Lead Pipeline</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const rows = visibleLeads.map(l => ({
                sales_lead_id: l.sales_lead_id,
                full_name: l.full_name,
                email: l.email,
                phone_number: l.phone_number || l.phone || '',
                status: l.status,
                reporting_class: l.reporting_class,
                working_group: l.working_group,
                next_follow_up_date: l.next_follow_up_date,
                overdue_days: l.follow_up_state?.overdue_days ?? '',
                escalated_to_kind: l.follow_up_state?.escalated_to_kind ?? '',
                escalated_to_name: l.follow_up_state?.escalated_to_name ?? '',
                location_name: l.location_name,
                location_id: l.location_id,
                assigned_team_name: l.assigned_team_name,
                assigned_team_id: l.assigned_team_id,
                assigned_csr_name: l.assigned_agent_name,
                assigned_csr_staff_id: l.assigned_csr_staff_id || l.assigned_agent_staff_id,
                source: l.source,
                source_platform: l.source_platform,
                campaign_name: l.campaign_name,
                adset_or_adgroup: l.adset_or_adgroup,
                source_reference: l.source_reference,
                created_at: l.created_at,
              }));
              downloadCsv('crm_leads_export.csv', rows);
            }}
            className="bg-zinc-800 hover:bg-zinc-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-xs transition-all active:scale-95"
          >
            Export CSV
          </button>
          {canManage && (
            <>
              <button onClick={() => { setBulkOpen(true); setBulkResult(null); }}
                className="bg-zinc-800 hover:bg-zinc-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-xs transition-all active:scale-95">
                Bulk Upload
              </button>
              <button data-testid="create-lead-btn" onClick={openCreate}
                className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-xs transition-all flex items-center gap-2 active:scale-95">
                <Plus className="w-3.5 h-3.5" strokeWidth={2} /> New Lead
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-zinc-900/40 border border-zinc-800 rounded-sm p-3 mb-5">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-zinc-500">Working</Label>
            <Select value={filters.working_group || 'all'} onValueChange={(v) => setFilters(prev => ({ ...prev, working_group: v === 'all' ? '' : v }))}>
              <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white text-xs h-9">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="working">Working</SelectItem>
                <SelectItem value="not_working">Not Working</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
                <SelectItem value="transferred">Transferred</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-zinc-500">Gender</Label>
            <Select value={filters.gender || 'all'} onValueChange={(v) => setFilters(prev => ({ ...prev, gender: v === 'all' ? '' : v }))}>
              <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white text-xs h-9">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                <SelectItem value="all">All</SelectItem>
                {GENDER_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-zinc-500">Purpose</Label>
            <Select value={filters.purpose || 'all'} onValueChange={(v) => setFilters(prev => ({ ...prev, purpose: v === 'all' ? '' : v }))}>
              <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white text-xs h-9">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                <SelectItem value="all">All</SelectItem>
                {PURPOSE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-zinc-500">Program Interest</Label>
            <Input value={filters.program_interest} onChange={(e) => setFilters(prev => ({ ...prev, program_interest: e.target.value }))}
              className="bg-zinc-950 border-zinc-800 text-white text-xs h-9" placeholder="e.g. boxing" />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-zinc-500">Membership Plan</Label>
            <Input value={filters.membership_plan} onChange={(e) => setFilters(prev => ({ ...prev, membership_plan: e.target.value }))}
              className="bg-zinc-950 border-zinc-800 text-white text-xs h-9" placeholder="e.g. monthly" />
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div data-testid="kanban-board" className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '60vh' }}>
        {PIPELINE_STAGES.map(stage => (
          <div key={stage.key} data-testid={`kanban-col-${stage.key}`}
            className="flex-shrink-0 w-[240px]"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, stage.key)}>
            {/* Column Header */}
            <div className={`flex items-center gap-2 mb-3 px-1`}>
              <div className={`w-2 h-2 rounded-full ${stage.color}`} />
              <span className="font-heading text-xs uppercase tracking-wider text-zinc-300">{stage.label}</span>
              <span className="text-zinc-600 text-xs ml-auto">{groupedLeads[stage.key].length}</span>
            </div>
            {/* Column body */}
            <div className={`bg-zinc-950/50 border ${stage.border} rounded-sm min-h-[200px] p-2 space-y-2`}>
              {groupedLeads[stage.key].map(lead => (
                <div key={lead.sales_lead_id} data-testid={`lead-card-${lead.sales_lead_id}`}
                  draggable={canActOnLead(lead)}
                  onDragStart={(e) => handleDragStart(e, lead)}
                  onDragEnd={handleDragEnd}
                  onClick={() => openDetail(lead)}
                  className={`bg-zinc-900 border border-zinc-800 hover:border-zinc-700 p-3 rounded-sm transition-all hover:bg-zinc-800/50 group ${
                    canActOnLead(lead) ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                  }`}>
                  <div className="flex items-start gap-2 mb-2">
                    {canActOnLead(lead) ? (
                      <GripVertical className="w-3 h-3 text-zinc-700 mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    ) : (
                      <div className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-white text-sm font-body leading-tight truncate">{lead.full_name}</div>
                      {lead.follow_up_state?.is_overdue && (
                        <div className="flex items-center gap-1 mt-1">
                          {lead.follow_up_state?.escalation_level >= 2 ? (
                            <Badge className="text-[9px] px-1.5 py-0 bg-red-600 text-white border-0">ESCALATED (MANAGER)</Badge>
                          ) : lead.follow_up_state?.escalation_level >= 1 ? (
                            <Badge className="text-[9px] px-1.5 py-0 bg-red-600 text-white border-0">ESCALATED (TL)</Badge>
                          ) : (
                            <Badge className="text-[9px] px-1.5 py-0 bg-amber-600 text-white border-0">OVERDUE</Badge>
                          )}
                          <span className="text-[10px] text-zinc-500">{lead.follow_up_state?.overdue_days}d</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1 text-[11px] text-zinc-500 font-body pl-5">
                    {(lead.phone_number || lead.phone) && <div className="flex items-center gap-1"><Phone className="w-2.5 h-2.5" /> {lead.phone_number || lead.phone}</div>}
                    {lead.email && <div className="flex items-center gap-1 truncate"><Mail className="w-2.5 h-2.5" /> {lead.email}</div>}
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-zinc-700 text-zinc-500">{lead.source}</Badge>
                    {lead.program_interest && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-zinc-700 text-zinc-500">{lead.program_interest}</Badge>
                    )}
                      {lead.assigned_agent_name && (
                        <span className="flex items-center gap-0.5 text-zinc-600"><User className="w-2.5 h-2.5" /> {lead.assigned_agent_name}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Create Lead Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">New Lead</DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">Add a lead from a walk-in, call, or referral.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {!currentLocation && locations.length > 1 && (
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Branch</Label>
                <Select value={form.location_id} onValueChange={v => setForm(f => ({ ...f, location_id: v }))}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {locations.map(lo => <SelectItem key={lo.location_id} value={lo.location_id}>{lo.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Full Name</Label>
              <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                className="bg-zinc-950 border-zinc-800 text-white mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Phone Number</Label>
                <Input value={form.phone_number} onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))}
                  className="bg-zinc-950 border-zinc-800 text-white mt-1" />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Email</Label>
                <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="bg-zinc-950 border-zinc-800 text-white mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Gender</Label>
                <Select value={form.gender || 'none'} onValueChange={v => setForm(f => ({ ...f, gender: v === 'none' ? '' : v }))}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="none">Prefer not to say</SelectItem>
                    {GENDER_OPTIONS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Purpose</Label>
                <Select value={form.purpose} onValueChange={v => setForm(f => ({ ...f, purpose: v }))}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {PURPOSE_OPTIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Program Interest</Label>
              <Input value={form.program_interest} onChange={e => setForm(f => ({ ...f, program_interest: e.target.value }))}
                className="bg-zinc-950 border-zinc-800 text-white mt-1" />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Membership Plan</Label>
              <Input value={form.membership_plan} onChange={e => setForm(f => ({ ...f, membership_plan: e.target.value }))}
                className="bg-zinc-950 border-zinc-800 text-white mt-1" />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Address</Label>
              <Textarea value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                className="bg-zinc-950 border-zinc-800 text-white mt-1 resize-none" rows={2} />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Source</Label>
              <Select value={form.source} onValueChange={v => setForm(f => ({ ...f, source: v }))}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {SOURCE_OPTIONS.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Priority</Label>
                <Select value={form.lead_priority} onValueChange={v => setForm(f => ({ ...f, lead_priority: v }))}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {['LOW', 'MEDIUM', 'HIGH'].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Temperature</Label>
                <Select value={form.temperature} onValueChange={v => setForm(f => ({ ...f, temperature: v }))}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {['COLD', 'WARM', 'HOT'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="bg-zinc-950 border-zinc-800 text-white mt-1 resize-none" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-zinc-400 hover:text-white text-xs font-heading uppercase transition-colors">Cancel</button>
            <button data-testid="confirm-create-lead" onClick={handleCreateLead} disabled={saving}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-sm text-xs font-heading uppercase tracking-wider disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-3 h-3 animate-spin" />} Create
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lead Detail Drawer */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider flex items-center justify-between">
              <span>{showDetail?.full_name}</span>
              <button
                onClick={() => setMergeOpen(true)}
                disabled={saving || !canEditDetail}
                className="text-[11px] font-heading uppercase tracking-wider text-zinc-300 hover:text-white border border-zinc-700 px-2 py-1 rounded-sm disabled:opacity-50"
                type="button"
              >
                Merge Lead
              </button>
            </DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">View and edit lead details.</DialogDescription>
          </DialogHeader>
          {showDetail && (
            <div className="space-y-4 py-2">
              {/* Contact Info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {(showDetail.phone_number || showDetail.phone) && <div className="flex items-center gap-2 text-zinc-300"><Phone className="w-3.5 h-3.5 text-zinc-500" /> {showDetail.phone_number || showDetail.phone}</div>}
                {showDetail.email && <div className="flex items-center gap-2 text-zinc-300"><Mail className="w-3.5 h-3.5 text-zinc-500" /> {showDetail.email}</div>}
                <div className="flex items-center gap-2 text-zinc-400"><Badge variant="outline" className="text-[10px] border-zinc-700">{showDetail.source}</Badge></div>
              {(showDetail.source_platform || showDetail.campaign_name || showDetail.adset_or_adgroup || showDetail.source_reference) && (
                <div className="col-span-2 flex items-center gap-2">
                  {showDetail.source_platform && <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">{showDetail.source_platform}</Badge>}
                  {showDetail.campaign_name && <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">{showDetail.campaign_name}</Badge>}
                  {showDetail.adset_or_adgroup && <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">{showDetail.adset_or_adgroup}</Badge>}
                  {showDetail.source_reference && <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">{showDetail.source_reference}</Badge>}
                </div>
              )}
                <div className="flex items-center gap-2 text-zinc-400 text-xs"><Calendar className="w-3 h-3" /> {new Date(showDetail.created_at).toLocaleDateString()}</div>
              </div>
              {showDetail.follow_up_state?.is_overdue && (
                <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-zinc-300 text-xs font-heading uppercase tracking-wider">Follow-up</p>
                    <Badge className={`text-[10px] px-2 py-0 border-0 ${showDetail.follow_up_state.escalation_level >= 1 ? 'bg-red-600 text-white' : 'bg-amber-600 text-white'}`}>
                      {showDetail.follow_up_state.escalation_level >= 2 ? 'ESCALATED (MANAGER)' : showDetail.follow_up_state.escalation_level >= 1 ? 'ESCALATED (TL)' : 'OVERDUE'}
                    </Badge>
                  </div>
                  <p className="text-zinc-500 text-xs mt-1">Next follow-up: {showDetail.next_follow_up_date || '—'}</p>
                  <p className="text-zinc-500 text-xs">Overdue: {showDetail.follow_up_state.overdue_days} days</p>
                  {(showDetail.follow_up_state.escalated_to_kind || showDetail.follow_up_state.escalated_to_name) && (
                    <p className="text-zinc-500 text-xs">Escalated to: {showDetail.follow_up_state.escalated_to_kind || '—'} {showDetail.follow_up_state.escalated_to_name ? `(${showDetail.follow_up_state.escalated_to_name})` : ''}</p>
                  )}
                </div>
              )}
              {showDetail.notes && (
                <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-sm">
                  <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1"><MessageSquare className="w-3 h-3" /> Notes</div>
                  <p className="text-zinc-300 text-sm font-body">{showDetail.notes}</p>
                </div>
              )}
              <hr className="border-zinc-800" />
              {/* Editable fields */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider">Full Name</Label>
                  <Input value={editForm.full_name || ''} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
                    disabled={!canEditDetail}
                    className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider">Phone Number</Label>
                  <Input value={editForm.phone_number || ''} onChange={e => setEditForm(f => ({ ...f, phone_number: e.target.value }))}
                    disabled={!canEditDetail}
                    className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider">Email</Label>
                  <Input value={editForm.email || ''} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                    disabled={!canEditDetail}
                    className="bg-zinc-950 border-zinc-800 text-white mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Branch</Label>
                <Input
                  value={showDetail.location_name || editForm.assigned_location_id || showDetail.location_id || ''}
                  disabled
                  className="bg-zinc-950 border-zinc-800 text-white mt-1 opacity-80"
                />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Status</Label>
                <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider">Priority</Label>
                  <Select value={editForm.lead_priority || 'MEDIUM'} onValueChange={v => setEditForm(f => ({ ...f, lead_priority: v }))}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      {['LOW', 'MEDIUM', 'HIGH'].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider">Temperature</Label>
                  <Select value={editForm.temperature || 'WARM'} onValueChange={v => setEditForm(f => ({ ...f, temperature: v }))}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      {['COLD', 'WARM', 'HOT'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider">Gender</Label>
                  <Select value={editForm.gender || 'none'} onValueChange={v => setEditForm(f => ({ ...f, gender: v === 'none' ? '' : v }))}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      <SelectItem value="none">Prefer not to say</SelectItem>
                      {GENDER_OPTIONS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider">Purpose</Label>
                  <Select value={editForm.purpose || 'self'} onValueChange={v => setEditForm(f => ({ ...f, purpose: v }))}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      {PURPOSE_OPTIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Program Interest</Label>
                <Input value={editForm.program_interest || ''} onChange={e => setEditForm(f => ({ ...f, program_interest: e.target.value }))}
                  className="bg-zinc-950 border-zinc-800 text-white mt-1" />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Membership Plan</Label>
                <Input value={editForm.membership_plan || ''} onChange={e => setEditForm(f => ({ ...f, membership_plan: e.target.value }))}
                  className="bg-zinc-950 border-zinc-800 text-white mt-1" />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Address</Label>
                <Textarea value={editForm.address || ''} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))}
                  className="bg-zinc-950 border-zinc-800 text-white mt-1 resize-none" rows={2} />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Assigned Team</Label>
                <Select value={editForm.assigned_team_id} onValueChange={v => setEditForm(f => ({ ...f, assigned_team_id: v }))}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {teams.map(t => <SelectItem key={t.sales_team_id} value={t.sales_team_id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Next Follow-up</Label>
                <Input type="date" value={editForm.next_follow_up_date}
                  onChange={e => setEditForm(f => ({ ...f, next_follow_up_date: e.target.value }))}
                  className="bg-zinc-950 border-zinc-800 text-white mt-1" />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Notes</Label>
                <Textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  className="bg-zinc-950 border-zinc-800 text-white mt-1 resize-none" rows={3} />
              </div>
              {editForm.status === 'under_process' && (
                <div className="bg-green-950/20 border border-green-900/30 p-3 rounded-sm space-y-3">
                  <p className="text-green-400 text-xs font-heading uppercase tracking-wider">Membership Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-zinc-400 text-xs">Type</Label>
                      <Select value={editForm.membership_type} onValueChange={v => setEditForm(f => ({ ...f, membership_type: v }))}>
                        <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1 h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800">
                          {['MONTHLY', 'QUARTERLY', 'YEARLY'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-zinc-400 text-xs">Price (AED)</Label>
                      <Input type="number" value={editForm.membership_price}
                        onChange={e => setEditForm(f => ({ ...f, membership_price: e.target.value }))}
                        className="bg-zinc-950 border-zinc-800 text-white mt-1 h-8 text-xs" />
                    </div>
                  </div>
                </div>
              )}

              <hr className="border-zinc-800" />
              <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-sm space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-zinc-300 text-xs font-heading uppercase tracking-wider">Activity</p>
                  <button
                    onClick={() => {
                      setConvertForm(f => ({
                        ...f,
                        gender: showDetail?.gender || f.gender || 'male',
                        address: showDetail?.address || '',
                        purpose: showDetail?.purpose || 'self',
                        program_interest: showDetail?.program_interest || '',
                        membership_plan: showDetail?.membership_plan || '',
                      }));
                      setConvertOpen(true);
                    }}
                    className="text-[11px] font-heading uppercase tracking-wider text-zinc-300 hover:text-white border border-zinc-700 px-2 py-1 rounded-sm"
                    disabled={saving || !canEditDetail}
                  >
                    Convert to Member
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider">Type</Label>
                    <Select disabled={!canEditDetail} value={activityForm.activity_type} onValueChange={v => setActivityForm(f => ({ ...f, activity_type: v }))}>
                      <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800">
                        {['call_made', 'whatsapp_sent', 'no_answer', 'follow_up_done', 'callback_scheduled', 'meeting_booked', 'trial_booked', 'visit_done', 'note_added'].map(t => (
                          <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider">Next Action</Label>
                    <Input type="date" value={activityForm.next_action_date}
                      onChange={e => setActivityForm(f => ({ ...f, next_action_date: e.target.value }))}
                      disabled={!canEditDetail}
                      className="bg-zinc-900 border-zinc-800 text-white mt-1" />
                  </div>
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider">Note</Label>
                  <Textarea value={activityForm.note} onChange={e => setActivityForm(f => ({ ...f, note: e.target.value }))}
                    disabled={!canEditDetail}
                    className="bg-zinc-900 border-zinc-800 text-white mt-1 resize-none" rows={2} />
                </div>
                <button
                  onClick={addActivity}
                  disabled={saving || !canEditDetail}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-2 rounded-sm text-xs font-heading uppercase tracking-wider disabled:opacity-50"
                >
                  Add Activity
                </button>
              </div>

              <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-sm space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-zinc-300 text-xs font-heading uppercase tracking-wider">Attachments</p>
                  <button
                    onClick={() => refreshLeadExtras(showDetail.sales_lead_id)}
                    className="text-[11px] font-heading uppercase tracking-wider text-zinc-400 hover:text-white border border-zinc-800 px-2 py-1 rounded-sm"
                    type="button"
                  >
                    Refresh
                  </button>
                </div>
                {(attachments || []).length === 0 ? (
                  <p className="text-zinc-500 text-sm">No attachments yet.</p>
                ) : (
                  <div className="space-y-2">
                    {attachments.slice(0, 20).map(a => (
                      <div key={a.sales_lead_attachment_id} className="border border-zinc-800 bg-zinc-900/40 rounded-sm p-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-zinc-200 text-sm truncate">{a.file_name || a.file_url}</p>
                            <p className="text-zinc-500 text-xs">{(a.attachment_type || 'other').toString().replace(/_/g, ' ')}</p>
                            {a.note && <p className="text-zinc-400 text-xs mt-1">{a.note}</p>}
                          </div>
                          <button
                            onClick={() => window.open(fullAssetUrl(a.file_url), '_blank', 'noopener,noreferrer')}
                            className="text-xs font-heading uppercase tracking-wider text-white bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded-sm"
                            type="button"
                          >
                            Open
                          </button>
                        </div>
                        <div className="text-zinc-600 text-[11px] mt-1">
                          {(a.created_at || '').slice(0, 19).replace('T', ' ')} · {a.uploaded_by_staff_id || a.uploaded_by_user_id || '—'}
                        </div>
                      </div>
                    ))}
                    {(attachments.length || 0) > 20 && (
                      <p className="text-[11px] text-zinc-500">Showing first 20 of {attachments.length} attachments.</p>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <FileUpload
                      value={attachmentForm.file_url}
                      onChange={(v) => setAttachmentForm(f => ({ ...f, file_url: v }))}
                      accept="*/*"
                      maxSize={20}
                    />
                  </div>
                  <div>
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider">Type</Label>
                    <Select value={attachmentForm.attachment_type || 'other'} onValueChange={(v) => setAttachmentForm(f => ({ ...f, attachment_type: v }))}>
                      <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800">
                        {['quotation', 'intro_form', 'waiver', 'screenshot', 'trial_booking_proof', 'other'].map(t => (
                          <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider">File Name</Label>
                    <Input value={attachmentForm.file_name} onChange={(e) => setAttachmentForm(f => ({ ...f, file_name: e.target.value }))}
                      className="bg-zinc-900 border-zinc-800 text-white mt-1" placeholder="Optional" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider">Note</Label>
                    <Textarea value={attachmentForm.note} onChange={(e) => setAttachmentForm(f => ({ ...f, note: e.target.value }))}
                      className="bg-zinc-900 border-zinc-800 text-white mt-1 resize-none" rows={2} />
                  </div>
                </div>
                <button
                  onClick={addAttachment}
                  disabled={saving || !canEditDetail}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-2 rounded-sm text-xs font-heading uppercase tracking-wider disabled:opacity-50"
                  type="button"
                >
                  Add Attachment
                </button>
              </div>

              <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-sm space-y-2">
                <p className="text-zinc-300 text-xs font-heading uppercase tracking-wider">Timeline</p>
                {timeline.length === 0 ? (
                  <p className="text-zinc-500 text-sm">No events yet.</p>
                ) : (
                  <div className="space-y-2">
                    {timeline.slice(0, 30).map(ev => (
                      <div key={ev.sales_lead_event_id} className="border border-zinc-800 bg-zinc-900/40 rounded-sm p-2">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-300 text-xs font-heading uppercase tracking-wider">{ev.type}</span>
                          <span className="text-zinc-600 text-[11px]">{(ev.created_at || '').slice(0, 19).replace('T', ' ')}</span>
                        </div>
                        {ev.payload?.note && <p className="text-zinc-400 text-sm mt-1">{ev.payload.note}</p>}
                        {ev.payload?.activity_type && <p className="text-zinc-500 text-xs mt-1">{String(ev.payload.activity_type).replace(/_/g, ' ')}</p>}
                        {ev.payload?.old_status && ev.payload?.new_status && (
                          <p className="text-zinc-500 text-xs mt-1">{ev.payload.old_status} → {ev.payload.new_status}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <button onClick={() => setShowDetail(null)} className="px-4 py-2 text-zinc-400 hover:text-white text-xs font-heading uppercase transition-colors">Close</button>
            <button data-testid="save-lead-detail" onClick={handleUpdateLead} disabled={saving || !canEditDetail}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-sm text-xs font-heading uppercase tracking-wider disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-3 h-3 animate-spin" />} Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">Merge Lead</DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">
              Merge two lead records. The secondary lead becomes inactive and its timeline/attachments are moved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="bg-zinc-950 border border-zinc-800 rounded-sm p-3 space-y-1">
              <p className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Primary (Current)</p>
              <p className="text-zinc-200 text-sm">{showDetail?.full_name || '—'}</p>
              <p className="text-zinc-500 text-xs">Lead ID: {showDetail?.sales_lead_id || '—'}</p>
            </div>
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Other Lead ID (Secondary)</Label>
              <Input
                value={mergeForm.other_lead_id}
                onChange={(e) => setMergeForm(f => ({ ...f, other_lead_id: e.target.value }))}
                className="bg-zinc-950 border-zinc-800 text-white mt-1"
                placeholder="e.g. sl_abc123..."
              />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Keep As Primary</Label>
              <Select value={mergeForm.keep} onValueChange={(v) => setMergeForm(f => ({ ...f, keep: v }))}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="this">Keep current lead</SelectItem>
                  <SelectItem value="other">Keep other lead</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded-sm p-3 text-xs text-zinc-500 space-y-1">
              <div>No silent overwrite: only missing fields are filled, notes are appended with a merge marker.</div>
              <div>The secondary lead is marked inactive and linked to the primary.</div>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setMergeOpen(false)} className="px-4 py-2 text-zinc-400 hover:text-white text-xs font-heading uppercase transition-colors">Cancel</button>
            <button onClick={executeMerge} disabled={saving || !canEditDetail}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-sm text-xs font-heading uppercase tracking-wider disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-3 h-3 animate-spin" />} Merge
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">Convert Lead</DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">Create member profile and portal password.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {showDetail && (
              <div className="bg-zinc-950 border border-zinc-800 rounded-sm p-3 space-y-1">
                <p className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Lead Identity</p>
                <p className="text-zinc-200 text-sm">{showDetail.full_name || '—'}</p>
                <p className="text-zinc-500 text-xs">{showDetail.email || '—'}</p>
                <p className="text-zinc-500 text-xs">{showDetail.phone_number || showDetail.phone || '—'}</p>
              </div>
            )}
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Gender</Label>
              <Select value={convertForm.gender} onValueChange={v => setConvertForm(f => ({ ...f, gender: v }))}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {['male', 'female'].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Purpose</Label>
              <Select value={convertForm.purpose} onValueChange={v => setConvertForm(f => ({ ...f, purpose: v }))}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {PURPOSE_OPTIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Program Interest</Label>
              <Input value={convertForm.program_interest} onChange={e => setConvertForm(f => ({ ...f, program_interest: e.target.value }))}
                className="bg-zinc-950 border-zinc-800 text-white mt-1" />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Membership Plan</Label>
              <Input value={convertForm.membership_plan} onChange={e => setConvertForm(f => ({ ...f, membership_plan: e.target.value }))}
                className="bg-zinc-950 border-zinc-800 text-white mt-1" />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Address</Label>
              <Textarea value={convertForm.address} onChange={e => setConvertForm(f => ({ ...f, address: e.target.value }))}
                className="bg-zinc-950 border-zinc-800 text-white mt-1 resize-none" rows={2} />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Password (optional)</Label>
              <Input value={convertForm.password} onChange={e => setConvertForm(f => ({ ...f, password: e.target.value }))}
                className="bg-zinc-950 border-zinc-800 text-white mt-1" />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setConvertOpen(false)} className="px-4 py-2 text-zinc-400 hover:text-white text-xs font-heading uppercase transition-colors">Cancel</button>
            <button onClick={convertLead} disabled={saving || !canEditDetail}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-sm text-xs font-heading uppercase tracking-wider disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-3 h-3 animate-spin" />} Convert
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!conflict} onOpenChange={() => setConflict(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">Duplicate Detected</DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">Resolve before creating a new record.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {conflict?.kind === 'member_exists' ? (
              <div className="bg-zinc-950 border border-zinc-800 rounded-sm p-3 space-y-2">
                <div>
                  <p className="text-zinc-200 text-sm">This email/phone already belongs to an existing member.</p>
                  <p className="text-zinc-500 text-xs mt-1">Member: {conflict?.detail?.member_name || '—'} ({conflict?.detail?.member_id || '—'})</p>
                  <p className="text-zinc-500 text-xs">Status: {conflict?.detail?.member_status || '—'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-zinc-500 text-xs">Branch: {conflict?.detail?.location_name || conflict?.detail?.location_id || '—'}</p>
                  <p className="text-zinc-500 text-xs">CSR: {conflict?.detail?.current_csr_name || conflict?.detail?.current_csr_staff_id || '—'}</p>
                  <p className="text-zinc-500 text-xs">Team Lead: {conflict?.detail?.current_team_lead_name || conflict?.detail?.current_team_lead_staff_id || '—'}</p>
                  <p className="text-zinc-500 text-xs">Owner/Manager: {conflict?.detail?.location_owner_id || '—'}</p>
                </div>
                {conflict?.detail?.linked?.existing_lead_id && (
                  <div className="border-t border-zinc-800 pt-2 space-y-1">
                    <p className="text-zinc-200 text-xs font-heading uppercase tracking-wider">Linked Lead</p>
                    <p className="text-zinc-500 text-xs">Lead ID: {conflict.detail.linked.existing_lead_id}</p>
                    <p className="text-zinc-500 text-xs">Status: {conflict.detail.linked.existing_lead_status || '—'} ({conflict.detail.linked.existing_lead_reporting_class || '—'})</p>
                    <p className="text-zinc-500 text-xs">Branch: {conflict?.detail?.location_name || conflict?.detail?.location_id || '—'}</p>
                    <p className="text-zinc-500 text-xs">Team: {conflict.detail.linked.assigned_team_name || conflict.detail.linked.assigned_team_id || '—'}</p>
                    <p className="text-zinc-500 text-xs">CSR: {conflict.detail.linked.assigned_csr_name || conflict.detail.linked.assigned_csr_staff_id || '—'}</p>
                    <p className="text-zinc-500 text-xs">Team Lead: {conflict.detail.linked.assigned_team_lead_name || conflict.detail.linked.assigned_team_lead_staff_id || '—'}</p>
                    <p className="text-zinc-500 text-xs">Owner/Manager: {conflict.detail.linked.current_supervisor_name || conflict.detail.linked.current_supervisor_staff_id || conflict?.detail?.location_owner_id || '—'}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-zinc-950 border border-zinc-800 rounded-sm p-3 space-y-1">
                <p className="text-zinc-200 text-sm">A lead already exists with the same email/phone.</p>
                <p className="text-zinc-500 text-xs">Lead ID: {conflict?.detail?.existing_lead_id || '—'}</p>
                <p className="text-zinc-500 text-xs">Status: {conflict?.detail?.existing_lead_status || '—'} ({conflict?.detail?.existing_lead_reporting_class || '—'})</p>
                <p className="text-zinc-500 text-xs">Branch: {conflict?.detail?.location_name || conflict?.detail?.location_id || '—'}</p>
                <p className="text-zinc-500 text-xs">Team: {conflict?.detail?.assigned_team_name || conflict?.detail?.assigned_team_id || '—'}</p>
                <p className="text-zinc-500 text-xs">CSR: {conflict?.detail?.assigned_csr_name || conflict?.detail?.assigned_csr_staff_id || conflict?.detail?.assigned_agent_staff_id || '—'}</p>
                <p className="text-zinc-500 text-xs">Team Lead: {conflict?.detail?.assigned_team_lead_name || conflict?.detail?.assigned_team_lead_staff_id || '—'}</p>
                <p className="text-zinc-500 text-xs">Owner/Manager: {conflict?.detail?.current_supervisor_name || conflict?.detail?.current_supervisor_staff_id || conflict?.detail?.location_owner_id || '—'}</p>
              </div>
            )}

            {(canManage && effectiveKind !== 'CSR' && (conflict?.detail?.existing_lead_id || conflict?.detail?.linked?.existing_lead_id)) && (
              <div className="bg-zinc-950 border border-zinc-800 rounded-sm p-3 space-y-3">
                <p className="text-zinc-200 text-xs font-heading uppercase tracking-wider">Transfer</p>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider">Branch</Label>
                    <Select
                      value={conflictTransfer.target_location_id || 'none'}
                      onValueChange={(v) => {
                        const lid = v === 'none' ? '' : v;
                        setConflictTransfer(t => ({ ...t, target_location_id: lid, target_team_id: '', target_agent_staff_id: '' }));
                        if (lid) loadConflictTransferOptions(lid);
                      }}
                    >
                      <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800">
                        <SelectItem value="none">Unassigned</SelectItem>
                        {(locations || []).map(l => (
                          <SelectItem key={l.location_id} value={l.location_id}>{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider">Team</Label>
                    <Select value={conflictTransfer.target_team_id || 'none'} onValueChange={(v) => setConflictTransfer(t => ({ ...t, target_team_id: v === 'none' ? '' : v }))}>
                      <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white mt-1"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800">
                        <SelectItem value="none">Unassigned</SelectItem>
                        {(conflictTransferTeams || []).map(t => (
                          <SelectItem key={t.sales_team_id} value={t.sales_team_id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider">CSR</Label>
                    <Select value={conflictTransfer.target_agent_staff_id || 'none'} onValueChange={(v) => setConflictTransfer(t => ({ ...t, target_agent_staff_id: v === 'none' ? '' : v }))}>
                      <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white mt-1"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800">
                        <SelectItem value="none">Unassigned</SelectItem>
                        {(conflictTransferStaff || []).map(s => (
                          <SelectItem key={s.staff_id} value={s.staff_id}>
                            {`${s.first_name || ''} ${s.last_name || ''}`.trim() || s.staff_id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <button onClick={() => setConflict(null)} className="px-4 py-2 text-zinc-400 hover:text-white text-xs font-heading uppercase transition-colors">Close</button>
            {conflict?.kind === 'member_exists' && (
              <button
                onClick={() => {
                  const id = conflict?.detail?.member_id;
                  if (!id) return;
                  const base = window.location.pathname.startsWith('/manager') ? '/manager/members' : '/owner/members';
                  window.open(`${base}/${id}`, '_blank', 'noopener,noreferrer');
                }}
                className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-sm text-xs font-heading uppercase tracking-wider"
              >
                Open Member
              </button>
            )}
            {(conflict?.detail?.existing_lead_id || conflict?.detail?.linked?.existing_lead_id) && (
              <>
                <button onClick={() => openConflictLead(false)} disabled={saving}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-sm text-xs font-heading uppercase tracking-wider disabled:opacity-50">
                  Open Lead
                </button>
                {(canManage && effectiveKind !== 'CSR') && (
                  <button onClick={() => openConflictLead(true)} disabled={saving}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-sm text-xs font-heading uppercase tracking-wider disabled:opacity-50">
                    Merge Lead
                  </button>
                )}
                <button onClick={claimConflictLead} disabled={saving || !currentStaffId || !canManage}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-sm text-xs font-heading uppercase tracking-wider disabled:opacity-50">
                  Transfer To Me
                </button>
                {(canManage && effectiveKind !== 'CSR') && (
                  <button onClick={transferConflictLead} disabled={saving}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-sm text-xs font-heading uppercase tracking-wider disabled:opacity-50">
                    Transfer
                  </button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">Bulk Upload Leads</DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">Paste CSV or upload a CSV file to import leads.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2">
              <button onClick={downloadBulkSample} className="bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-2 rounded-sm text-xs font-heading uppercase tracking-wider">
                Download Sample CSV
              </button>
              <input
                type="file"
                accept=".csv,text/csv"
                className="text-zinc-400 text-xs"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const reader = new FileReader();
                  reader.onload = () => setBulkText(String(reader.result || ''));
                  reader.readAsText(f);
                }}
              />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">CSV Content</Label>
              <Textarea value={bulkText} onChange={e => setBulkText(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-white mt-1 resize-none font-mono text-xs" rows={10} />
            </div>
            {bulkResult ? (
              <div className="bg-zinc-950 border border-zinc-800 rounded-sm p-3 space-y-3">
                <div className="space-y-1">
                  <p className="text-zinc-200 text-sm">Import Results</p>
                  <p className="text-zinc-500 text-xs">New leads: {bulkResult?.new_leads?.length || 0}</p>
                  <p className="text-zinc-500 text-xs">Duplicate leads: {bulkResult?.duplicate_leads?.length || 0}</p>
                  <p className="text-zinc-500 text-xs">Existing members: {bulkResult?.existing_members?.length || 0}</p>
                  <p className="text-zinc-500 text-xs">Invalid rows: {bulkResult?.invalid_rows?.length || 0}</p>
                </div>

                {(bulkResult?.new_leads?.length || 0) > 0 && (
                  <div className="space-y-2">
                    <p className="text-zinc-200 text-xs font-heading uppercase tracking-wider">New Leads Created</p>
                    <div className="space-y-2">
                      {(bulkResult?.new_leads || []).slice(0, 20).map((n) => (
                        <div key={`${n.row_index}-${n.sales_lead_id}`} className="border border-zinc-800 rounded-sm p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs text-zinc-300">
                              {n.full_name || '—'} · {n.email || n.phone || '—'}
                            </div>
                            <button
                              onClick={async () => {
                                try {
                                  const r = await salesAPI.getLead(n.sales_lead_id);
                                  setShowDetail(r.data);
                                  const t = await salesAPI.getLeadTimeline(n.sales_lead_id);
                                  setTimeline(t.data.events || []);
                                } catch {
                                  toast.error('Unable to open the lead');
                                }
                              }}
                              className="text-xs font-heading uppercase tracking-wider text-white bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded-sm"
                            >
                              Open
                            </button>
                          </div>
                          <div className="text-[11px] text-zinc-500 mt-1">
                            {n.location_name || n.location_id || '—'} · CSR: {n.assigned_csr_name || n.assigned_csr_staff_id || '—'} · TL: {n.assigned_team_lead_name || n.assigned_team_lead_staff_id || '—'}
                          </div>
                        </div>
                      ))}
                    </div>
                    {(bulkResult?.new_leads?.length || 0) > 20 && (
                      <p className="text-[11px] text-zinc-500">Showing first 20 of {bulkResult.new_leads.length} new leads.</p>
                    )}
                  </div>
                )}

                {(bulkResult?.duplicate_leads?.length || 0) > 0 && (
                  <div className="space-y-2">
                    <p className="text-zinc-200 text-xs font-heading uppercase tracking-wider">Duplicate Leads</p>
                    <div className="space-y-2">
                      {(bulkResult?.duplicate_leads || []).slice(0, 20).map((d) => (
                        <div key={`${d.row_index}-${d.existing_lead_id}`} className="border border-zinc-800 rounded-sm p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs text-zinc-300">
                              {d.full_name || '—'} · {d.email || d.phone || '—'}
                            </div>
                            <button
                              onClick={async () => {
                                try {
                                  const r = await salesAPI.getLead(d.existing_lead_id);
                                  setShowDetail(r.data);
                                  const t = await salesAPI.getLeadTimeline(d.existing_lead_id);
                                  setTimeline(t.data.events || []);
                                } catch {
                                  toast.error('Unable to open the existing lead');
                                }
                              }}
                              className="text-xs font-heading uppercase tracking-wider text-white bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded-sm"
                            >
                              Open
                            </button>
                          </div>
                          <div className="text-[11px] text-zinc-500 mt-1">
                            {d.location_name || d.location_id || '—'} · CSR: {d.assigned_csr_name || d.assigned_csr_staff_id || '—'} · TL: {d.assigned_team_lead_name || d.assigned_team_lead_staff_id || '—'} · Lead: {d.existing_lead_id}
                          </div>
                        </div>
                      ))}
                    </div>
                    {(bulkResult?.duplicate_leads?.length || 0) > 20 && (
                      <p className="text-[11px] text-zinc-500">Showing first 20 of {bulkResult.duplicate_leads.length} duplicate leads.</p>
                    )}
                  </div>
                )}

                {(bulkResult?.existing_members?.length || 0) > 0 && (
                  <div className="space-y-2">
                    <p className="text-zinc-200 text-xs font-heading uppercase tracking-wider">Existing Members</p>
                    <div className="space-y-2">
                      {(bulkResult?.existing_members || []).slice(0, 20).map((m) => (
                        <div key={`${m.row_index}-${m.member_id}`} className="border border-zinc-800 rounded-sm p-2 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs text-zinc-300">
                              {m.member_name || '—'} · {m.email || m.phone || '—'} · Member: {m.member_id}
                            </div>
                            <div className="flex items-center gap-2">
                              {m.existing_lead_id && (
                                <button
                                  onClick={async () => {
                                    try {
                                      const r = await salesAPI.getLead(m.existing_lead_id);
                                      setShowDetail(r.data);
                                      const t = await salesAPI.getLeadTimeline(m.existing_lead_id);
                                      setTimeline(t.data.events || []);
                                    } catch {
                                      toast.error('Unable to open the lead');
                                    }
                                  }}
                                  className="text-xs font-heading uppercase tracking-wider text-white bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded-sm"
                                >
                                  Open Lead
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  const base = window.location.pathname.startsWith('/manager') ? '/manager/members' : '/owner/members';
                                  window.open(`${base}/${m.member_id}`, '_blank', 'noopener,noreferrer');
                                }}
                                className="text-xs font-heading uppercase tracking-wider text-white bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded-sm"
                              >
                                Open Member
                              </button>
                            </div>
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            {m.location_name || m.location_id || '—'} · CSR: {m.current_csr_name || m.current_csr_staff_id || '—'} · TL: {m.current_team_lead_name || m.current_team_lead_staff_id || '—'}
                          </div>
                        </div>
                      ))}
                    </div>
                    {(bulkResult?.existing_members?.length || 0) > 20 && (
                      <p className="text-[11px] text-zinc-500">Showing first 20 of {bulkResult.existing_members.length} existing members.</p>
                    )}
                  </div>
                )}

                {(bulkResult?.invalid_rows?.length || 0) > 0 && (
                  <div className="space-y-2">
                    <p className="text-zinc-200 text-xs font-heading uppercase tracking-wider">Invalid Rows</p>
                    <div className="space-y-2">
                      {(bulkResult?.invalid_rows || []).slice(0, 20).map((r) => (
                        <div key={`${r.row_index}-${r.reason}`} className="border border-zinc-800 rounded-sm p-2">
                          <div className="text-xs text-zinc-300">Row {r.row_index + 1} · {r.full_name || '—'} · {r.email || r.phone || '—'}</div>
                          <div className="text-[11px] text-zinc-500 mt-1">{r.reason || 'Invalid row'}</div>
                        </div>
                      ))}
                    </div>
                    {(bulkResult?.invalid_rows?.length || 0) > 20 && (
                      <p className="text-[11px] text-zinc-500">Showing first 20 of {bulkResult.invalid_rows.length} invalid rows.</p>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <button onClick={() => setBulkOpen(false)} className="px-4 py-2 text-zinc-400 hover:text-white text-xs font-heading uppercase transition-colors">Close</button>
            <button onClick={startBulkImport} disabled={saving}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-sm text-xs font-heading uppercase tracking-wider disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-3 h-3 animate-spin" />} Import
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!statusReason.open} onOpenChange={(v) => { if (!v) setStatusReason({ open: false, lead: null, status: '', category: 'other', comment: '', pendingDetailPatch: null }); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">Reason Required</DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">
              A reason is required to set status to {String(statusReason.status || '').replace(/_/g, ' ')}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Reason Category</Label>
              <Select value={statusReason.category || 'other'} onValueChange={(v2) => setStatusReason(s => ({ ...s, category: v2 }))}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {LOST_REASON_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Reason / Comment</Label>
              <Textarea
                value={statusReason.comment}
                onChange={(e) => setStatusReason(s => ({ ...s, comment: e.target.value }))}
                className="bg-zinc-950 border-zinc-800 text-white mt-1 resize-none"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setStatusReason({ open: false, lead: null, status: '', category: 'other', comment: '', pendingDetailPatch: null })}
              className="px-4 py-2 text-zinc-400 hover:text-white text-xs font-heading uppercase transition-colors">
              Cancel
            </button>
            <button onClick={submitStatusReason} disabled={saving}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-sm text-xs font-heading uppercase tracking-wider disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-3 h-3 animate-spin" />} Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
