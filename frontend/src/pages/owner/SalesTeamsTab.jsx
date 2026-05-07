import { useState, useEffect, useCallback } from 'react';
import { salesAPI } from '@/lib/api';
import { toast } from 'sonner';
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
  Plus, Users, ChevronRight, UserPlus, ArrowRightLeft, X, MapPin, Loader2,
  Pencil, Trash2, Shield,
} from 'lucide-react';
import { PerformanceSummaryStrip } from './SalesPerformanceTab';
import { ActionTooltip } from '@/components/ui/tooltip';

export default function SalesTeamsTab({ currentLocation, locations, onRefreshStats }) {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showTransfer, setShowTransfer] = useState(null);
  const [showEditTeam, setShowEditTeam] = useState(false);
  const [showEditMember, setShowEditMember] = useState(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(null);
  const [availableStaff, setAvailableStaff] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', location_id: '', team_lead_staff_id: '', supervisor_staff_id: '', supervisor_role: '' });
  const [editForm, setEditForm] = useState({ name: '', description: '', team_lead_staff_id: '', supervisor_staff_id: '', supervisor_role: '' });
  const [memberForm, setMemberForm] = useState({ staff_id: '', member_type: 'AGENT', reports_to_staff_id: '' });
  const [editMemberForm, setEditMemberForm] = useState({ member_type: '', reports_to_staff_id: '' });
  const [transferForm, setTransferForm] = useState({ target_location_id: '', target_team_id: '' });
  const [targetTeams, setTargetTeams] = useState([]);
  const [saving, setSaving] = useState(false);

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    try {
      const params = currentLocation ? { location_id: currentLocation.location_id } : {};
      const r = await salesAPI.listTeams(params);
      setTeams(r.data.teams);
    } catch { toast.error('Failed to load teams'); }
    finally { setLoading(false); }
  }, [currentLocation]);

  useEffect(() => { fetchTeams(); }, [fetchTeams]);

  const fetchTeamDetail = async (teamId) => {
    try {
      const r = await salesAPI.getTeam(teamId);
      setSelectedTeam(r.data);
    } catch { toast.error('Failed to load team details'); }
  };

  const fetchStaff = async (lid) => {
    try {
      const r = await salesAPI.getAvailableStaff({ location_id: lid });
      setAvailableStaff(r.data);
    } catch { setAvailableStaff([]); }
  };

  const handleCreateTeam = async () => {
    if (!form.name.trim()) return toast.error('Team name is required');
    setSaving(true);
    try {
      await salesAPI.createTeam({
        location_id: form.location_id,
        name: form.name,
        description: form.description,
        team_lead_staff_id: form.team_lead_staff_id || '',
        supervisor_staff_id: form.supervisor_staff_id || '',
        supervisor_role: form.supervisor_role || '',
      });
      toast.success('Team created');
      setShowCreate(false);
      setForm({ name: '', description: '', location_id: '', team_lead_staff_id: '', supervisor_staff_id: '', supervisor_role: '' });
      fetchTeams();
      onRefreshStats?.();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to create team'); }
    finally { setSaving(false); }
  };

  const handleAddMember = async () => {
    if (!memberForm.staff_id) return toast.error('Select a staff member');
    setSaving(true);
    try {
      await salesAPI.addTeamMember(selectedTeam.sales_team_id, memberForm);
      toast.success('Member added');
      setShowAddMember(false);
      setMemberForm({ staff_id: '', member_type: 'AGENT', reports_to_staff_id: '' });
      fetchTeamDetail(selectedTeam.sales_team_id);
      onRefreshStats?.();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to add member'); }
    finally { setSaving(false); }
  };

  const handleRemoveMember = async (memberId) => {
    try {
      await salesAPI.deactivateTeamMember(selectedTeam.sales_team_id, memberId);
      toast.success('Member removed');
      fetchTeamDetail(selectedTeam.sales_team_id);
      onRefreshStats?.();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const handleDeactivateTeam = async (teamId) => {
    try {
      await salesAPI.deactivateTeam(teamId);
      toast.success('Team deactivated');
      setSelectedTeam(null);
      setShowConfirmDelete(null);
      fetchTeams();
      onRefreshStats?.();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const handleUpdateTeam = async () => {
    if (!editForm.name.trim()) return toast.error('Team name is required');
    setSaving(true);
    try {
      await salesAPI.updateTeam(selectedTeam.sales_team_id, {
        name: editForm.name,
        description: editForm.description,
        team_lead_staff_id: editForm.team_lead_staff_id || null,
        supervisor_staff_id: editForm.supervisor_staff_id || null,
        supervisor_role: editForm.supervisor_role || null,
      });
      toast.success('Team updated');
      setShowEditTeam(false);
      fetchTeamDetail(selectedTeam.sales_team_id);
      fetchTeams();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to update team'); }
    finally { setSaving(false); }
  };

  const handleUpdateMember = async () => {
    if (!editMemberForm.member_type) return toast.error('Select a role');
    setSaving(true);
    try {
      await salesAPI.updateTeamMember(selectedTeam.sales_team_id, showEditMember, {
        member_type: editMemberForm.member_type,
        reports_to_staff_id: editMemberForm.reports_to_staff_id || null,
      });
      toast.success('Member role updated');
      setShowEditMember(null);
      fetchTeamDetail(selectedTeam.sales_team_id);
      onRefreshStats?.();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to update member'); }
    finally { setSaving(false); }
  };

  const handleTransfer = async () => {
    if (!transferForm.target_team_id) return toast.error('Select a target team');
    setSaving(true);
    try {
      await salesAPI.transferAgent(showTransfer, transferForm);
      toast.success('Agent transferred');
      setShowTransfer(null);
      fetchTeamDetail(selectedTeam.sales_team_id);
      fetchTeams();
      onRefreshStats?.();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to transfer'); }
    finally { setSaving(false); }
  };

  const openCreate = () => {
    const lid = currentLocation?.location_id || (locations.length === 1 ? locations[0].location_id : '');
    setForm({ name: '', description: '', location_id: lid, team_lead_staff_id: '', supervisor_staff_id: '', supervisor_role: '' });
    if (lid) fetchStaff(lid);
    setShowCreate(true);
  };

  const openAddMember = () => {
    setMemberForm({ staff_id: '', member_type: 'AGENT', reports_to_staff_id: '' });
    if (selectedTeam) fetchStaff(selectedTeam.location_id);
    setShowAddMember(true);
  };

  const openTransfer = (memberId, memberLocId) => {
    setTransferForm({ target_location_id: memberLocId, target_team_id: '' });
    setShowTransfer(memberId);
    salesAPI.listTeams({ location_id: memberLocId }).then(r => setTargetTeams(r.data.teams)).catch(() => {});
  };

  const openEditTeam = () => {
    setEditForm({
      name: selectedTeam.name,
      description: selectedTeam.description || '',
      team_lead_staff_id: selectedTeam.team_lead_staff_id || '',
      supervisor_staff_id: selectedTeam.supervisor_staff_id || '',
      supervisor_role: selectedTeam.supervisor_role || '',
    });
    fetchStaff(selectedTeam.location_id);
    setShowEditTeam(true);
  };

  const openEditMember = (member) => {
    setEditMemberForm({ member_type: member.member_type, reports_to_staff_id: member.reports_to_staff_id || '' });
    setShowEditMember(member.sales_team_member_id);
  };

  // --- RENDER ---
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-zinc-600 animate-spin" /></div>;

  // Determine if we're in manager context (only 1 location provided)
  const isManagerContext = locations.length === 1;

  return (
    <div data-testid="sales-teams-tab">
      {/* Performance Summary Strip */}
      {!selectedTeam && (
        <PerformanceSummaryStrip 
          currentLocation={currentLocation} 
          isManager={isManagerContext} 
        />
      )}

      {/* Header row */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-heading font-bold text-white text-lg uppercase tracking-wider">
          {selectedTeam ? selectedTeam.name : 'Sales Teams'}
        </h2>
        <div className="flex gap-2">
          {selectedTeam && (
            <button data-testid="back-to-teams" onClick={() => setSelectedTeam(null)}
              className="bg-zinc-800 text-zinc-300 hover:text-white px-3 py-1.5 rounded-sm text-xs font-heading uppercase tracking-wider transition-colors">
              All Teams
            </button>
          )}
          {!selectedTeam && (
            <button data-testid="create-team-btn" onClick={openCreate}
              className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-xs transition-all flex items-center gap-2 active:scale-95">
              <Plus className="w-3.5 h-3.5" strokeWidth={2} /> New Team
            </button>
          )}
        </div>
      </div>

      {/* Teams List */}
      {!selectedTeam && (
        <div className="grid gap-3">
          {teams.length === 0 && (
            <div className="text-center py-16 text-zinc-600 font-body">
              No sales teams yet. Create your first team to get started.
            </div>
          )}
          {teams.map(t => (
            <button key={t.sales_team_id} data-testid={`team-card-${t.sales_team_id}`}
              onClick={() => fetchTeamDetail(t.sales_team_id)}
              className="w-full text-left bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 p-5 rounded-sm transition-all group">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-heading font-bold text-white text-sm uppercase tracking-wider truncate">{t.name}</h3>
                    <Badge variant="outline" className={`text-[10px] ${t.is_active ? 'border-emerald-600/40 text-emerald-400' : 'border-zinc-700 text-zinc-500'}`}>
                      {t.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-zinc-500 text-xs font-body">
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {t.location_name}</span>
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {t.member_count} members</span>
                    {t.team_lead && <span>Lead: {t.team_lead.first_name} {t.team_lead.last_name}</span>}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-700 group-hover:text-zinc-400 transition-colors" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Team Detail */}
      {selectedTeam && (
        <div data-testid="team-detail">
          <div className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-sm mb-4">
            <div className="flex items-center gap-4 text-zinc-400 text-xs font-body mb-4">
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {selectedTeam.location_name}</span>
              <Badge variant="outline" className={`text-[10px] ${selectedTeam.is_active ? 'border-emerald-600/40 text-emerald-400' : 'border-zinc-700 text-zinc-500'}`}>
                {selectedTeam.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            {selectedTeam.description && <p className="text-zinc-400 text-sm font-body mb-4">{selectedTeam.description}</p>}
            <div className="flex gap-2 flex-wrap">
              <button data-testid="add-member-btn" onClick={openAddMember}
                className="bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-sm text-xs font-heading uppercase tracking-wider flex items-center gap-1.5 transition-colors">
                <UserPlus className="w-3 h-3" /> Add Member
              </button>
              <button data-testid="edit-team-btn" onClick={openEditTeam}
                className="bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-sm text-xs font-heading uppercase tracking-wider flex items-center gap-1.5 transition-colors">
                <Pencil className="w-3 h-3" /> Edit Team
              </button>
              {selectedTeam.is_active && (
                <button data-testid="deactivate-team-btn" onClick={() => setShowConfirmDelete({ type: 'team', id: selectedTeam.sales_team_id, name: selectedTeam.name })}
                  className="bg-zinc-900 hover:bg-red-900/30 text-zinc-500 hover:text-red-400 px-3 py-1.5 rounded-sm text-xs font-heading uppercase tracking-wider flex items-center gap-1.5 transition-colors">
                  <Trash2 className="w-3 h-3" /> Deactivate
                </button>
              )}
            </div>
          </div>

          {/* Members list */}
          <h3 className="font-heading font-bold text-zinc-300 text-xs uppercase tracking-wider mb-3">Team Members</h3>
          <div className="space-y-2">
            {(selectedTeam.members || []).length === 0 && (
              <p className="text-zinc-600 text-sm font-body py-4">No members yet.</p>
            )}
            {(selectedTeam.members || []).map(m => (
              <div key={m.sales_team_member_id} data-testid={`member-row-${m.sales_team_member_id}`}
                className="bg-zinc-900/30 border border-zinc-800/60 p-4 rounded-sm flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white text-sm font-body">
                      {m.staff?.first_name} {m.staff?.last_name}
                    </span>
                    <Badge variant="outline" className={`text-[10px] ${m.member_type === 'TEAM_LEAD' ? 'border-amber-600/40 text-amber-400' : 'border-blue-600/40 text-blue-400'}`}>
                      {m.member_type === 'TEAM_LEAD' ? 'Team Lead' : 'Agent'}
                    </Badge>
                  </div>
                  <span className="text-zinc-600 text-xs font-body">{m.staff?.role} — {m.staff?.email}</span>
                </div>
                <div className="flex gap-1.5">
                  <ActionTooltip label="Change Role">
                    <button data-testid={`edit-role-${m.sales_team_member_id}`}
                      onClick={() => openEditMember(m)}
                      className="p-1.5 hover:bg-zinc-800 rounded-sm text-zinc-500 hover:text-amber-400 transition-colors">
                      <Shield className="w-3.5 h-3.5" />
                    </button>
                  </ActionTooltip>
                  <ActionTooltip label="Transfer">
                    <button data-testid={`transfer-${m.sales_team_member_id}`}
                      onClick={() => openTransfer(m.sales_team_member_id, selectedTeam.location_id)}
                      className="p-1.5 hover:bg-zinc-800 rounded-sm text-zinc-500 hover:text-blue-400 transition-colors">
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                    </button>
                  </ActionTooltip>
                  <ActionTooltip label="Remove Member">
                    <button data-testid={`remove-${m.sales_team_member_id}`}
                      onClick={() => setShowConfirmDelete({ type: 'member', id: m.sales_team_member_id, name: `${m.staff?.first_name} ${m.staff?.last_name}` })}
                      className="p-1.5 hover:bg-zinc-800 rounded-sm text-zinc-500 hover:text-red-400 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </ActionTooltip>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Team Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">New Sales Team</DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">Create a new sales team for a branch.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!currentLocation && locations.length > 1 && (
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Branch</Label>
                <Select value={form.location_id} onValueChange={v => { setForm(f => ({ ...f, location_id: v, team_lead_staff_id: '' })); fetchStaff(v); }}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {locations.map(l => <SelectItem key={l.location_id} value={l.location_id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Team Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Sharjah Sales Team A" className="bg-zinc-950 border-zinc-800 text-white mt-1" />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Description</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional" className="bg-zinc-950 border-zinc-800 text-white mt-1 resize-none" rows={2} />
            </div>
            {availableStaff.length > 0 && (
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Team Lead (optional)</Label>
                <Select value={form.team_lead_staff_id} onValueChange={v => setForm(f => ({ ...f, team_lead_staff_id: v }))}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue placeholder="Select team lead" /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {availableStaff.map(s => (
                      <SelectItem key={s.staff_id} value={s.staff_id}>{s.first_name} {s.last_name} ({s.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {availableStaff.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider">Reporting Manager</Label>
                  <Select value={form.supervisor_staff_id} onValueChange={v => setForm(f => ({ ...f, supervisor_staff_id: v }))}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      {availableStaff.map(s => (
                        <SelectItem key={s.staff_id} value={s.staff_id}>{s.first_name} {s.last_name} ({s.role})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider">Manager Type</Label>
                  <Select value={form.supervisor_role} onValueChange={v => setForm(f => ({ ...f, supervisor_role: v }))}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      {['GENERAL_MANAGER', 'SALES_MANAGER', 'BRANCH_MANAGER'].map(r => (
                        <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-zinc-400 hover:text-white text-xs font-heading uppercase transition-colors">Cancel</button>
            <button data-testid="confirm-create-team" onClick={handleCreateTeam} disabled={saving}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-sm text-xs font-heading uppercase tracking-wider disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-3 h-3 animate-spin" />} Create
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={showAddMember} onOpenChange={setShowAddMember}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">Add Team Member</DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">Select a staff member to add to the team.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Staff Member</Label>
              <Select value={memberForm.staff_id} onValueChange={v => setMemberForm(f => ({ ...f, staff_id: v }))}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {availableStaff.map(s => (
                    <SelectItem key={s.staff_id} value={s.staff_id}>{s.first_name} {s.last_name} ({s.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Role</Label>
              <Select value={memberForm.member_type} onValueChange={v => setMemberForm(f => ({ ...f, member_type: v }))}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="AGENT">Agent</SelectItem>
                  <SelectItem value="TEAM_LEAD">Team Lead</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {memberForm.member_type === 'AGENT' && availableStaff.length > 0 && (
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Reports To (Team Lead)</Label>
                <Select value={memberForm.reports_to_staff_id} onValueChange={v => setMemberForm(f => ({ ...f, reports_to_staff_id: v }))}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {availableStaff.map(s => (
                      <SelectItem key={s.staff_id} value={s.staff_id}>{s.first_name} {s.last_name} ({s.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <button onClick={() => setShowAddMember(false)} className="px-4 py-2 text-zinc-400 hover:text-white text-xs font-heading uppercase transition-colors">Cancel</button>
            <button data-testid="confirm-add-member" onClick={handleAddMember} disabled={saving}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-sm text-xs font-heading uppercase tracking-wider disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-3 h-3 animate-spin" />} Add
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Dialog */}
      <Dialog open={!!showTransfer} onOpenChange={() => setShowTransfer(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">Transfer Agent</DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">Move this agent to a different team or branch.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Target Branch</Label>
              <Select value={transferForm.target_location_id} onValueChange={v => {
                setTransferForm(f => ({ ...f, target_location_id: v, target_team_id: '' }));
                salesAPI.listTeams({ location_id: v, is_active: true }).then(r => setTargetTeams(r.data.teams)).catch(() => {});
              }}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {locations.map(lo => <SelectItem key={lo.location_id} value={lo.location_id}>{lo.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Target Team</Label>
              <Select value={transferForm.target_team_id} onValueChange={v => setTransferForm(f => ({ ...f, target_team_id: v }))}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue placeholder="Select team" /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {targetTeams.filter(tt => tt.sales_team_id !== selectedTeam?.sales_team_id).map(tt => (
                    <SelectItem key={tt.sales_team_id} value={tt.sales_team_id}>{tt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setShowTransfer(null)} className="px-4 py-2 text-zinc-400 hover:text-white text-xs font-heading uppercase transition-colors">Cancel</button>
            <button data-testid="confirm-transfer" onClick={handleTransfer} disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-sm text-xs font-heading uppercase tracking-wider disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-3 h-3 animate-spin" />} Transfer
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Team Dialog */}
      <Dialog open={showEditTeam} onOpenChange={setShowEditTeam}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">Edit Team</DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">Update team details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Team Name</Label>
              <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Sharjah Sales Team A" className="bg-zinc-950 border-zinc-800 text-white mt-1" />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Description</Label>
              <Textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional" className="bg-zinc-950 border-zinc-800 text-white mt-1 resize-none" rows={2} />
            </div>
            {availableStaff.length > 0 && (
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Team Lead</Label>
                <Select value={editForm.team_lead_staff_id || 'none'} onValueChange={v => setEditForm(f => ({ ...f, team_lead_staff_id: v === 'none' ? '' : v }))}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue placeholder="Select team lead" /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="none">No Team Lead</SelectItem>
                    {availableStaff.map(s => (
                      <SelectItem key={s.staff_id} value={s.staff_id}>{s.first_name} {s.last_name} ({s.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {availableStaff.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider">Reporting Manager</Label>
                  <Select value={editForm.supervisor_staff_id || 'none'} onValueChange={v => setEditForm(f => ({ ...f, supervisor_staff_id: v === 'none' ? '' : v }))}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      <SelectItem value="none">None</SelectItem>
                      {availableStaff.map(s => (
                        <SelectItem key={s.staff_id} value={s.staff_id}>{s.first_name} {s.last_name} ({s.role})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider">Manager Type</Label>
                  <Select value={editForm.supervisor_role || 'none'} onValueChange={v => setEditForm(f => ({ ...f, supervisor_role: v === 'none' ? '' : v }))}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      <SelectItem value="none">None</SelectItem>
                      {['GENERAL_MANAGER', 'SALES_MANAGER', 'BRANCH_MANAGER'].map(r => (
                        <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <button onClick={() => setShowEditTeam(false)} className="px-4 py-2 text-zinc-400 hover:text-white text-xs font-heading uppercase transition-colors">Cancel</button>
            <button data-testid="confirm-edit-team" onClick={handleUpdateTeam} disabled={saving}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-sm text-xs font-heading uppercase tracking-wider disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-3 h-3 animate-spin" />} Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Member Role Dialog */}
      <Dialog open={!!showEditMember} onOpenChange={() => setShowEditMember(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">Change Role</DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">Update member's role in this team.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Role</Label>
              <Select value={editMemberForm.member_type} onValueChange={v => setEditMemberForm(f => ({ ...f, member_type: v }))}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="AGENT">Agent</SelectItem>
                  <SelectItem value="TEAM_LEAD">Team Lead</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-zinc-600 text-xs mt-2">Note: Promoting to Team Lead will demote any existing team lead to Agent.</p>
            </div>
            {editMemberForm.member_type === 'AGENT' && availableStaff.length > 0 && (
              <div>
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Reports To (Team Lead)</Label>
                <Select value={editMemberForm.reports_to_staff_id || 'none'} onValueChange={v => setEditMemberForm(f => ({ ...f, reports_to_staff_id: v === 'none' ? '' : v }))}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white mt-1"><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="none">None</SelectItem>
                    {availableStaff.map(s => (
                      <SelectItem key={s.staff_id} value={s.staff_id}>{s.first_name} {s.last_name} ({s.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <button onClick={() => setShowEditMember(null)} className="px-4 py-2 text-zinc-400 hover:text-white text-xs font-heading uppercase transition-colors">Cancel</button>
            <button data-testid="confirm-edit-role" onClick={handleUpdateMember} disabled={saving}
              className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-sm text-xs font-heading uppercase tracking-wider disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-3 h-3 animate-spin" />} Update
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <Dialog open={!!showConfirmDelete} onOpenChange={() => setShowConfirmDelete(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">Confirm {showConfirmDelete?.type === 'team' ? 'Deactivate' : 'Remove'}</DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">
              {showConfirmDelete?.type === 'team'
                ? `Are you sure you want to deactivate "${showConfirmDelete?.name}"? This will also remove all team members.`
                : `Are you sure you want to remove "${showConfirmDelete?.name}" from this team?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <button onClick={() => setShowConfirmDelete(null)} className="px-4 py-2 text-zinc-400 hover:text-white text-xs font-heading uppercase transition-colors">Cancel</button>
            <button
              data-testid="confirm-delete"
              onClick={() => {
                if (showConfirmDelete?.type === 'team') {
                  handleDeactivateTeam(showConfirmDelete.id);
                } else {
                  handleRemoveMember(showConfirmDelete.id);
                  setShowConfirmDelete(null);
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-sm text-xs font-heading uppercase tracking-wider flex items-center gap-2">
              <Trash2 className="w-3 h-3" /> {showConfirmDelete?.type === 'team' ? 'Deactivate' : 'Remove'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
