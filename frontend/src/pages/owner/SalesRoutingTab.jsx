import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { salesAPI } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function SalesRoutingTab({ currentLocation, locations }) {
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState([]);
  const [apiUnavailable, setApiUnavailable] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [teams, setTeams] = useState([]);
  const [staff, setStaff] = useState([]);
  const [slaSettings, setSlaSettings] = useState({ csr_reminder_delay_days: 0, team_lead_escalation_delay_days: 1, manager_escalation_delay_days: 2 });
  const [slaSaving, setSlaSaving] = useState(false);
  const [maqsamSettings, setMaqsamSettings] = useState({
    is_enabled: false,
    base_url: '',
    access_key_id: '',
    access_secret: '',
    has_secret: false,
    last_sync_at: null,
    last_sync_status: null,
    last_sync_error: null,
    last_sync_count: 0,
    contacts_enabled: false,
    contacts_lang: 'en',
    contacts_custom_fields_format: 'labels',
    contacts_include_pagination: false,
    contacts_last_sync_at: null,
    contacts_last_sync_status: null,
    contacts_last_sync_error: null,
    contacts_last_sync_count: 0,
    contacts_last_sync_matched: 0,
    contacts_last_sync_unmatched: 0,
    contacts_last_sync_conflict: 0,
    contacts_field_mappings: {},
  });
  const [maqsamSaving, setMaqsamSaving] = useState(false);
  const [maqsamSyncing, setMaqsamSyncing] = useState(false);
  const [maqsamLoading, setMaqsamLoading] = useState(false);
  const [maqsamAgents, setMaqsamAgents] = useState([]);
  const [maqsamCounts, setMaqsamCounts] = useState({ total: 0, mapped: 0, unmapped: 0 });
  const [maqsamTab, setMaqsamTab] = useState('agents');
  const [maqsamContactsLoading, setMaqsamContactsLoading] = useState(false);
  const [maqsamContactsSyncing, setMaqsamContactsSyncing] = useState(false);
  const [maqsamContacts, setMaqsamContacts] = useState([]);
  const [maqsamContactsCounts, setMaqsamContactsCounts] = useState({ total: 0, matched: 0, unmatched: 0, conflict: 0, linked: 0 });
  const [maqsamContactSearch, setMaqsamContactSearch] = useState({ q: '' });
  const [maqsamSearching, setMaqsamSearching] = useState(false);
  const [newMaqsamContactMapping, setNewMaqsamContactMapping] = useState({ key: '', target: 'email' });

  const [createForm, setCreateForm] = useState({
    name: '',
    is_active: true,
    source_platform: '',
    location_id: '',
    assigned_team_id: '',
    assigned_agent_staff_id: '',
    assigned_team_lead_staff_id: '',
  });

  const effectiveLocations = useMemo(() => (locations || []).filter(Boolean), [locations]);
  const selectedLocationId = useMemo(() => (createForm.location_id || currentLocation?.location_id || ''), [createForm.location_id, currentLocation]);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const r = await salesAPI.listRoutingRules();
      setRules(r.data.rules || []);
      setApiUnavailable(false);
    } catch (e) {
      const status = e?.response?.status;
      if (status === 404) {
        setApiUnavailable(true);
        setRules([]);
      } else if (status === 401) {
        toast.error('Session expired. Please log in again.');
        setRules([]);
      } else if (status === 403) {
        toast.error(e?.response?.data?.detail || 'Permission denied');
        setRules([]);
      } else {
        toast.error('Failed to load routing rules');
        setRules([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTeamsAndStaff = useCallback(async () => {
    try {
      const lid = selectedLocationId;
      const [tr, sr] = await Promise.all([
        salesAPI.listTeams(lid ? { location_id: lid } : {}),
        lid ? salesAPI.getAvailableStaff({ location_id: lid }) : Promise.resolve({ data: [] }),
      ]);
      setTeams(tr.data.teams || []);
      setStaff(sr.data || []);
    } catch {
      setTeams([]);
      setStaff([]);
    }
  }, [selectedLocationId]);

  useEffect(() => { fetchRules(); }, [fetchRules]);
  useEffect(() => { fetchTeamsAndStaff(); }, [fetchTeamsAndStaff]);

  const fetchSlaSettings = useCallback(async () => {
    try {
      const r = await salesAPI.getSlaSettings(currentLocation?.location_id ? { location_id: currentLocation.location_id } : {});
      setSlaSettings(r.data?.settings || { csr_reminder_delay_days: 0, team_lead_escalation_delay_days: 1, manager_escalation_delay_days: 2 });
    } catch {
      setSlaSettings({ csr_reminder_delay_days: 0, team_lead_escalation_delay_days: 1, manager_escalation_delay_days: 2 });
    }
  }, [currentLocation]);

  useEffect(() => { fetchSlaSettings(); }, [fetchSlaSettings]);

  const maqsamParams = useMemo(() => (currentLocation?.location_id ? { location_id: currentLocation.location_id } : {}), [currentLocation]);

  const fetchMaqsamSettings = useCallback(async () => {
    setMaqsamLoading(true);
    try {
      const r = await salesAPI.getMaqsamSettings(maqsamParams);
      setMaqsamSettings(r.data?.settings || {
        is_enabled: false,
        base_url: '',
        access_key_id: '',
        access_secret: '',
        has_secret: false,
        last_sync_at: null,
        last_sync_status: null,
        last_sync_error: null,
        last_sync_count: 0,
        contacts_enabled: false,
        contacts_lang: 'en',
        contacts_custom_fields_format: 'labels',
        contacts_include_pagination: false,
        contacts_last_sync_at: null,
        contacts_last_sync_status: null,
        contacts_last_sync_error: null,
        contacts_last_sync_count: 0,
        contacts_last_sync_matched: 0,
        contacts_last_sync_unmatched: 0,
        contacts_last_sync_conflict: 0,
        contacts_field_mappings: {},
      });
    } catch {
      setMaqsamSettings({
        is_enabled: false,
        base_url: '',
        access_key_id: '',
        access_secret: '',
        has_secret: false,
        last_sync_at: null,
        last_sync_status: null,
        last_sync_error: null,
        last_sync_count: 0,
        contacts_enabled: false,
        contacts_lang: 'en',
        contacts_custom_fields_format: 'labels',
        contacts_include_pagination: false,
        contacts_last_sync_at: null,
        contacts_last_sync_status: null,
        contacts_last_sync_error: null,
        contacts_last_sync_count: 0,
        contacts_last_sync_matched: 0,
        contacts_last_sync_unmatched: 0,
        contacts_last_sync_conflict: 0,
        contacts_field_mappings: {},
      });
    } finally {
      setMaqsamLoading(false);
    }
  }, [maqsamParams]);

  const fetchMaqsamAgents = useCallback(async () => {
    try {
      const r = await salesAPI.listMaqsamAgents(maqsamParams);
      setMaqsamAgents((r.data?.agents || []).map(a => ({
        ...a,
        mapping_enabled: !!a.mapping_enabled,
        mapped_staff_id: a.mapped_staff_id || '',
        mapped_role: (a.mapped_role || '').toUpperCase() || 'CSR',
        mapped_team_lead_staff_id: a.mapped_team_lead_staff_id || '',
      })));
      setMaqsamCounts(r.data?.counts || { total: 0, mapped: 0, unmapped: 0 });
    } catch {
      setMaqsamAgents([]);
      setMaqsamCounts({ total: 0, mapped: 0, unmapped: 0 });
    }
  }, [maqsamParams]);

  useEffect(() => { fetchMaqsamSettings(); }, [fetchMaqsamSettings]);
  useEffect(() => { fetchMaqsamAgents(); }, [fetchMaqsamAgents]);

  const fetchMaqsamContacts = useCallback(async () => {
    setMaqsamContactsLoading(true);
    try {
      const r = await salesAPI.listMaqsamContacts({ ...maqsamParams, limit: 200 });
      setMaqsamContacts(r.data?.contacts || []);
      setMaqsamContactsCounts(r.data?.counts || { total: 0, matched: 0, unmatched: 0, conflict: 0, linked: 0 });
    } catch {
      setMaqsamContacts([]);
      setMaqsamContactsCounts({ total: 0, matched: 0, unmatched: 0, conflict: 0, linked: 0 });
    } finally {
      setMaqsamContactsLoading(false);
    }
  }, [maqsamParams]);

  useEffect(() => { fetchMaqsamContacts(); }, [fetchMaqsamContacts]);

  const saveMaqsamSettings = async () => {
    setMaqsamSaving(true);
    try {
      await salesAPI.updateMaqsamSettings({
        is_enabled: !!maqsamSettings.is_enabled,
        base_url: maqsamSettings.base_url || '',
        access_key_id: maqsamSettings.access_key_id || '',
        access_secret: maqsamSettings.access_secret || '',
        contacts_enabled: !!maqsamSettings.contacts_enabled,
        contacts_lang: maqsamSettings.contacts_lang || 'en',
        contacts_custom_fields_format: maqsamSettings.contacts_custom_fields_format || 'labels',
        contacts_include_pagination: !!maqsamSettings.contacts_include_pagination,
        contacts_field_mappings: maqsamSettings.contacts_field_mappings || {},
      }, maqsamParams);
      toast.success('Maqsam settings saved');
      fetchMaqsamSettings();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to save Maqsam settings');
    } finally {
      setMaqsamSaving(false);
    }
  };

  const syncMaqsam = async () => {
    setMaqsamSyncing(true);
    try {
      const r = await salesAPI.syncMaqsamAgents(maqsamParams);
      toast.success(`Maqsam sync complete (${r.data?.synced_count ?? 0} agents)`);
      fetchMaqsamSettings();
      fetchMaqsamAgents();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Maqsam sync failed');
      fetchMaqsamSettings();
    } finally {
      setMaqsamSyncing(false);
    }
  };

  const syncMaqsamContacts = async () => {
    setMaqsamContactsSyncing(true);
    try {
      const r = await salesAPI.syncMaqsamContacts(maqsamParams);
      toast.success(`Maqsam contacts sync complete (${r.data?.synced_count ?? 0} contacts)`);
      fetchMaqsamSettings();
      fetchMaqsamContacts();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Maqsam contacts sync failed');
      fetchMaqsamSettings();
    } finally {
      setMaqsamContactsSyncing(false);
    }
  };

  const searchMaqsamContacts = async () => {
    const q = (maqsamContactSearch.q || '').trim();
    if (!q) return toast.error('Enter a search term');
    setMaqsamSearching(true);
    try {
      const r = await salesAPI.searchMaqsamContacts({ ...maqsamParams, q });
      const found = r.data?.contacts || [];
      toast.success(`Found ${found.length} contact(s)`);
      fetchMaqsamContacts();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Maqsam contact search failed');
    } finally {
      setMaqsamSearching(false);
    }
  };

  const promptLinkContact = async (c) => {
    const mode = window.prompt('Link this contact to: type "lead" or "member"');
    if (!mode) return;
    const kind = String(mode || '').trim().toLowerCase();
    if (!['lead', 'member'].includes(kind)) return toast.error('Invalid type (use lead or member)');
    const targetId = window.prompt(`Enter ${kind} id to link`);
    if (!targetId) return;
    try {
      await salesAPI.linkMaqsamContact(c.identifier, { target_kind: kind, target_id: String(targetId).trim(), note: '' }, maqsamParams);
      toast.success('Linked');
      fetchMaqsamContacts();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Link failed');
    }
  };

  const unlinkContact = async (c) => {
    try {
      await salesAPI.unlinkMaqsamContact(c.identifier, maqsamParams);
      toast.success('Unlinked');
      fetchMaqsamContacts();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Unlink failed');
    }
  };

  const createLeadFromContact = async (c) => {
    try {
      await salesAPI.createLeadFromMaqsamContact(c.identifier, { location_id: currentLocation?.location_id || '' }, maqsamParams);
      toast.success('Lead created');
      fetchMaqsamContacts();
    } catch (e) {
      toast.error(e?.response?.data?.detail?.message || e?.response?.data?.detail || 'Create lead failed');
    }
  };

  const updateContactFieldMapping = (srcKey, nextTarget) => {
    const key = String(srcKey || '').trim();
    setMaqsamSettings(s => {
      const cur = { ...(s.contacts_field_mappings || {}) };
      if (!key) return s;
      if (!nextTarget) delete cur[key];
      else cur[key] = nextTarget;
      return { ...s, contacts_field_mappings: cur };
    });
  };

  const removeContactFieldMapping = (srcKey) => {
    const key = String(srcKey || '').trim();
    setMaqsamSettings(s => {
      const cur = { ...(s.contacts_field_mappings || {}) };
      delete cur[key];
      return { ...s, contacts_field_mappings: cur };
    });
  };

  const saveMaqsamMapping = async (identifier) => {
    const agent = (maqsamAgents || []).find(a => a.identifier === identifier);
    if (!agent) return;
    try {
      await salesAPI.updateMaqsamAgentMapping(identifier, {
        mapping_enabled: !!agent.mapping_enabled,
        mapped_staff_id: agent.mapped_staff_id || null,
        mapped_role: agent.mapped_role || null,
        mapped_location_id: currentLocation?.location_id || null,
        mapped_team_lead_staff_id: agent.mapped_team_lead_staff_id || null,
      }, maqsamParams);
      toast.success('Mapping saved');
      fetchMaqsamAgents();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to save mapping');
    }
  };

  const saveSlaSettings = async () => {
    setSlaSaving(true);
    try {
      await salesAPI.updateSlaSettings(
        {
          csr_reminder_delay_days: parseInt(slaSettings.csr_reminder_delay_days, 10) || 0,
          team_lead_escalation_delay_days: parseInt(slaSettings.team_lead_escalation_delay_days, 10) || 0,
          manager_escalation_delay_days: parseInt(slaSettings.manager_escalation_delay_days, 10) || 0,
        },
        currentLocation?.location_id ? { location_id: currentLocation.location_id } : {},
      );
      toast.success('SLA settings saved');
      fetchSlaSettings();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to save SLA settings');
    } finally {
      setSlaSaving(false);
    }
  };

  const teamLeads = useMemo(() => (staff || []).filter(s => String(s.sales_role || '').toUpperCase() === 'TEAM_LEAD'), [staff]);
  const csrs = useMemo(() => (staff || []).filter(s => ['CSR', 'AGENT'].includes(String(s.sales_role || '').toUpperCase())), [staff]);

  const createRule = async () => {
    if (!createForm.name.trim()) return toast.error('Name is required');
    setSavingId('new');
    try {
      const payload = {
        name: createForm.name.trim(),
        is_active: !!createForm.is_active,
        source_platform: (createForm.source_platform || '').trim(),
        location_id: createForm.location_id || currentLocation?.location_id || '',
        assigned_team_id: createForm.assigned_team_id || '',
        assigned_agent_staff_id: createForm.assigned_agent_staff_id || '',
        assigned_team_lead_staff_id: createForm.assigned_team_lead_staff_id || '',
      };
      await salesAPI.createRoutingRule(payload);
      toast.success('Routing rule created');
      setCreateForm({
        name: '',
        is_active: true,
        source_platform: '',
        location_id: '',
        assigned_team_id: '',
        assigned_agent_staff_id: '',
        assigned_team_lead_staff_id: '',
      });
      fetchRules();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to create routing rule');
    } finally {
      setSavingId(null);
    }
  };

  const updateRule = async (ruleId, patch) => {
    setSavingId(ruleId);
    try {
      await salesAPI.updateRoutingRule(ruleId, patch);
      toast.success('Routing rule updated');
      fetchRules();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to update routing rule');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div data-testid="sales-routing-tab" className="space-y-6">
      <Card className="bg-zinc-900/50 border-zinc-800 rounded-sm">
        <CardHeader>
          <CardTitle className="text-white font-heading uppercase tracking-wider text-sm">Follow-up SLA Settings</CardTitle>
          <CardDescription className="text-zinc-500 text-sm">
            Controls reminders and escalations for overdue follow-ups.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">CSR Reminder Delay (days)</label>
            <Input
              type="number"
              value={slaSettings.csr_reminder_delay_days}
              onChange={(e) => setSlaSettings(s => ({ ...s, csr_reminder_delay_days: e.target.value }))}
              className="bg-zinc-950 border-zinc-800 text-white text-xs h-9"
            />
          </div>
          <div>
            <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">Team Lead Escalation (days)</label>
            <Input
              type="number"
              value={slaSettings.team_lead_escalation_delay_days}
              onChange={(e) => setSlaSettings(s => ({ ...s, team_lead_escalation_delay_days: e.target.value }))}
              className="bg-zinc-950 border-zinc-800 text-white text-xs h-9"
            />
          </div>
          <div>
            <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">Manager Escalation (days)</label>
            <Input
              type="number"
              value={slaSettings.manager_escalation_delay_days}
              onChange={(e) => setSlaSettings(s => ({ ...s, manager_escalation_delay_days: e.target.value }))}
              className="bg-zinc-950 border-zinc-800 text-white text-xs h-9"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={saveSlaSettings} disabled={slaSaving} className="w-full bg-red-600 hover:bg-red-700 text-white rounded-sm">
              Save SLA
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card className="bg-zinc-900/50 border-zinc-800 rounded-sm">
        <CardHeader>
          <CardTitle className="text-white font-heading uppercase tracking-wider text-sm">Maqsam Integration</CardTitle>
          <CardDescription className="text-zinc-500 text-sm">
            Configure Maqsam, sync Agents and Contacts, and map inbound ownership safely into Spartans CRM.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-6 gap-3">
            <div className="lg:col-span-1">
              <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">Enabled</label>
              <div className="h-9 flex items-center">
                <Switch checked={!!maqsamSettings.is_enabled} onCheckedChange={(v) => setMaqsamSettings(s => ({ ...s, is_enabled: !!v }))} />
              </div>
            </div>
            <div className="lg:col-span-2">
              <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">Base URL</label>
              <Input
                value={maqsamSettings.base_url}
                onChange={(e) => setMaqsamSettings(s => ({ ...s, base_url: e.target.value }))}
                className="bg-zinc-950 border-zinc-800 text-white text-xs h-9"
                placeholder="e.g. maqsam.com"
              />
            </div>
            <div className="lg:col-span-1">
              <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">Access Key ID</label>
              <Input
                value={maqsamSettings.access_key_id}
                onChange={(e) => setMaqsamSettings(s => ({ ...s, access_key_id: e.target.value }))}
                className="bg-zinc-950 border-zinc-800 text-white text-xs h-9"
                placeholder="key id"
              />
            </div>
            <div className="lg:col-span-1">
              <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">Access Secret</label>
              <Input
                type="password"
                value={maqsamSettings.access_secret}
                onChange={(e) => setMaqsamSettings(s => ({ ...s, access_secret: e.target.value }))}
                className="bg-zinc-950 border-zinc-800 text-white text-xs h-9"
                placeholder={maqsamSettings.has_secret ? '••••••••' : 'secret'}
              />
            </div>
            <div className="lg:col-span-1 flex items-end gap-2">
              <Button onClick={saveMaqsamSettings} disabled={maqsamSaving} className="w-full bg-red-600 hover:bg-red-700 text-white rounded-sm">
                Save
              </Button>
            </div>
          </div>

          <Tabs value={maqsamTab} onValueChange={setMaqsamTab} className="space-y-4">
            <TabsList className="bg-zinc-950 border border-zinc-800 rounded-sm">
              <TabsTrigger value="agents" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white">Agents</TabsTrigger>
              <TabsTrigger value="contacts" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white">Contacts</TabsTrigger>
            </TabsList>

            <TabsContent value="agents" className="space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap bg-zinc-950/50 border border-zinc-800 rounded-sm p-3">
                <div className="text-xs text-zinc-500 space-y-1">
                  <div>Credentials: {maqsamSettings.has_secret ? 'Saved' : 'Not saved'}</div>
                  <div>Last agents sync: {maqsamSettings.last_sync_at || '—'} {maqsamSettings.last_sync_status ? `(${maqsamSettings.last_sync_status})` : ''}</div>
                  {!!maqsamSettings.last_sync_error && <div className="text-red-400">Error: {maqsamSettings.last_sync_error}</div>}
                </div>
                <div className="text-xs text-zinc-500 space-y-1">
                  <div>Agents: {maqsamCounts.total}</div>
                  <div>Mapped: {maqsamCounts.mapped} · Unmapped: {maqsamCounts.unmapped}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={syncMaqsam} disabled={maqsamSyncing || maqsamLoading} className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-sm">
                    Sync Agents
                  </Button>
                </div>
              </div>

              {maqsamAgents.length > 0 ? (
                <div className="border border-zinc-800 rounded-sm overflow-hidden">
                  <div className="bg-zinc-950/50 border-b border-zinc-800 px-3 py-2 text-xs text-zinc-400 font-heading uppercase tracking-wider">
                    Agent Mapping
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800 text-left">
                          <th className="px-3 py-2 text-zinc-500 font-heading uppercase tracking-wider">Agent</th>
                          <th className="px-3 py-2 text-zinc-500 font-heading uppercase tracking-wider">Identifier</th>
                          <th className="px-3 py-2 text-zinc-500 font-heading uppercase tracking-wider">Active</th>
                          <th className="px-3 py-2 text-zinc-500 font-heading uppercase tracking-wider">Map</th>
                          <th className="px-3 py-2 text-zinc-500 font-heading uppercase tracking-wider">Role</th>
                          <th className="px-3 py-2 text-zinc-500 font-heading uppercase tracking-wider">Staff</th>
                          <th className="px-3 py-2 text-zinc-500 font-heading uppercase tracking-wider">Team Lead</th>
                          <th className="px-3 py-2 text-zinc-500 font-heading uppercase tracking-wider text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {maqsamAgents.map((a, idx) => (
                          <tr key={a.identifier} className={`border-b border-zinc-800/50 ${idx % 2 === 0 ? 'bg-zinc-900/20' : ''}`}>
                            <td className="px-3 py-2 text-zinc-300">
                              <div className="font-body text-white">{a.name || '—'}</div>
                              <div className="text-zinc-500">{a.email || '—'}</div>
                            </td>
                            <td className="px-3 py-2 text-zinc-400">{a.identifier}</td>
                            <td className="px-3 py-2 text-zinc-400">{String(!!a.active)}</td>
                            <td className="px-3 py-2">
                              <Switch
                                checked={!!a.mapping_enabled}
                                onCheckedChange={(v) => setMaqsamAgents(prev => prev.map(x => x.identifier === a.identifier ? { ...x, mapping_enabled: !!v } : x))}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Select
                                value={(a.mapped_role || 'CSR').toUpperCase()}
                                onValueChange={(v) => setMaqsamAgents(prev => prev.map(x => x.identifier === a.identifier ? { ...x, mapped_role: v } : x))}
                              >
                                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white text-xs h-8 w-[130px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-zinc-800">
                                  {['CSR', 'TEAM_LEAD', 'OTHER'].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-3 py-2">
                              <Select
                                value={a.mapped_staff_id || 'none'}
                                onValueChange={(v) => setMaqsamAgents(prev => prev.map(x => x.identifier === a.identifier ? { ...x, mapped_staff_id: v === 'none' ? '' : v } : x))}
                              >
                                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white text-xs h-8 w-[220px]">
                                  <SelectValue placeholder="Unmapped" />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-zinc-800">
                                  <SelectItem value="none">Unmapped</SelectItem>
                                  {(staff || []).map(s => (
                                    <SelectItem key={s.staff_id} value={s.staff_id}>
                                      {`${s.first_name || ''} ${s.last_name || ''}`.trim() || s.staff_id}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-3 py-2">
                              {String((a.mapped_role || 'CSR').toUpperCase()) === 'CSR' ? (
                                <Select
                                  value={a.mapped_team_lead_staff_id || 'none'}
                                  onValueChange={(v) => setMaqsamAgents(prev => prev.map(x => x.identifier === a.identifier ? { ...x, mapped_team_lead_staff_id: v === 'none' ? '' : v } : x))}
                                >
                                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white text-xs h-8 w-[220px]">
                                    <SelectValue placeholder="Optional" />
                                  </SelectTrigger>
                                  <SelectContent className="bg-zinc-900 border-zinc-800">
                                    <SelectItem value="none">None</SelectItem>
                                    {(teamLeads || []).map(s => (
                                      <SelectItem key={s.staff_id} value={s.staff_id}>
                                        {`${s.first_name || ''} ${s.last_name || ''}`.trim() || s.staff_id}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <div className="text-zinc-600">—</div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Button onClick={() => saveMaqsamMapping(a.identifier)} className="bg-red-600 hover:bg-red-700 text-white rounded-sm h-8 px-3">
                                Save
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-zinc-600">
                  {maqsamLoading ? 'Loading Maqsam settings…' : 'No Maqsam agents synced yet. Save credentials and run Sync Agents.'}
                </div>
              )}
            </TabsContent>

            <TabsContent value="contacts" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-6 gap-3 bg-zinc-950/50 border border-zinc-800 rounded-sm p-3">
                <div className="lg:col-span-1">
                  <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">Contacts Enabled</label>
                  <div className="h-9 flex items-center">
                    <Switch checked={!!maqsamSettings.contacts_enabled} onCheckedChange={(v) => setMaqsamSettings(s => ({ ...s, contacts_enabled: !!v }))} />
                  </div>
                </div>
                <div className="lg:col-span-1">
                  <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">Lang</label>
                  <Select value={(maqsamSettings.contacts_lang || 'en').toLowerCase()} onValueChange={(v) => setMaqsamSettings(s => ({ ...s, contacts_lang: v }))}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white text-xs h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      <SelectItem value="en">en</SelectItem>
                      <SelectItem value="ar">ar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="lg:col-span-2">
                  <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">Custom Fields Format</label>
                  <Select value={(maqsamSettings.contacts_custom_fields_format || 'labels').toLowerCase()} onValueChange={(v) => setMaqsamSettings(s => ({ ...s, contacts_custom_fields_format: v }))}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white text-xs h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      <SelectItem value="labels">labels</SelectItem>
                      <SelectItem value="uuid">uuid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="lg:col-span-1">
                  <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">Include Pagination</label>
                  <div className="h-9 flex items-center">
                    <Switch checked={!!maqsamSettings.contacts_include_pagination} onCheckedChange={(v) => setMaqsamSettings(s => ({ ...s, contacts_include_pagination: !!v }))} />
                  </div>
                </div>
                <div className="lg:col-span-1 flex items-end">
                  <Button onClick={saveMaqsamSettings} disabled={maqsamSaving} className="w-full bg-red-600 hover:bg-red-700 text-white rounded-sm">
                    Save Contacts Settings
                  </Button>
                </div>
              </div>

              <div className="bg-zinc-950/50 border border-zinc-800 rounded-sm p-3 space-y-3">
                <div className="text-xs text-zinc-400 font-heading uppercase tracking-wider">Custom Field Mapping (Maqsam → CRM Lead)</div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
                  <Input
                    value={newMaqsamContactMapping.key}
                    onChange={(e) => setNewMaqsamContactMapping(s => ({ ...s, key: e.target.value }))}
                    className="bg-zinc-950 border-zinc-800 text-white text-xs h-9"
                    placeholder="Maqsam custom field key (label or UUID)"
                  />
                  <Select value={newMaqsamContactMapping.target} onValueChange={(v) => setNewMaqsamContactMapping(s => ({ ...s, target: v }))}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white text-xs h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      {['email', 'gender', 'address', 'program_interest', 'membership_plan', 'notes', 'source_reference'].map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => {
                      const k = (newMaqsamContactMapping.key || '').trim();
                      if (!k) return toast.error('Enter a custom field key');
                      updateContactFieldMapping(k, newMaqsamContactMapping.target);
                      setNewMaqsamContactMapping({ key: '', target: 'email' });
                    }}
                    className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-sm h-9"
                  >
                    Add Mapping
                  </Button>
                </div>

                {Object.keys(maqsamSettings.contacts_field_mappings || {}).length > 0 ? (
                  <div className="border border-zinc-800 rounded-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-zinc-800 text-left">
                            <th className="px-3 py-2 text-zinc-500 font-heading uppercase tracking-wider">Maqsam Key</th>
                            <th className="px-3 py-2 text-zinc-500 font-heading uppercase tracking-wider">CRM Field</th>
                            <th className="px-3 py-2 text-zinc-500 font-heading uppercase tracking-wider text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(maqsamSettings.contacts_field_mappings || {}).map(([k, v], idx) => (
                            <tr key={k} className={`border-b border-zinc-800/50 ${idx % 2 === 0 ? 'bg-zinc-900/20' : ''}`}>
                              <td className="px-3 py-2 text-zinc-300">{k}</td>
                              <td className="px-3 py-2">
                                <Select value={v} onValueChange={(nv) => updateContactFieldMapping(k, nv)}>
                                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white text-xs h-8 w-[220px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-zinc-900 border-zinc-800">
                                    {['email', 'gender', 'address', 'program_interest', 'membership_plan', 'notes', 'source_reference'].map(t => (
                                      <SelectItem key={t} value={t}>{t}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Button onClick={() => removeContactFieldMapping(k)} className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-sm h-8 px-3">
                                  Remove
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-zinc-600">No mappings yet. Add optional mappings to prefill leads from custom_fields.</div>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap bg-zinc-950/50 border border-zinc-800 rounded-sm p-3">
                <div className="text-xs text-zinc-500 space-y-1">
                  <div>Last contacts sync: {maqsamSettings.contacts_last_sync_at || '—'} {maqsamSettings.contacts_last_sync_status ? `(${maqsamSettings.contacts_last_sync_status})` : ''}</div>
                  {!!maqsamSettings.contacts_last_sync_error && <div className="text-red-400">Error: {maqsamSettings.contacts_last_sync_error}</div>}
                  <div>Last sync counts: matched {maqsamSettings.contacts_last_sync_matched ?? 0} · unmatched {maqsamSettings.contacts_last_sync_unmatched ?? 0} · conflict {maqsamSettings.contacts_last_sync_conflict ?? 0}</div>
                </div>
                <div className="text-xs text-zinc-500 space-y-1">
                  <div>Contacts: {maqsamContactsCounts.total}</div>
                  <div>Matched: {maqsamContactsCounts.matched} · Unmatched: {maqsamContactsCounts.unmatched} · Conflict: {maqsamContactsCounts.conflict}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={syncMaqsamContacts} disabled={maqsamContactsSyncing || maqsamContactsLoading} className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-sm">
                    Sync Contacts
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  value={maqsamContactSearch.q}
                  onChange={(e) => setMaqsamContactSearch(s => ({ ...s, q: e.target.value }))}
                  className="bg-zinc-950 border-zinc-800 text-white text-xs h-9"
                  placeholder="Search Maqsam contacts (name / phone / etc.)"
                />
                <Button onClick={searchMaqsamContacts} disabled={maqsamSearching} className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-sm h-9 px-4">
                  Search
                </Button>
                <Button onClick={fetchMaqsamContacts} disabled={maqsamContactsLoading} className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-sm h-9 px-4">
                  Refresh List
                </Button>
              </div>

              {maqsamContacts.length > 0 ? (
                <div className="border border-zinc-800 rounded-sm overflow-hidden">
                  <div className="bg-zinc-950/50 border-b border-zinc-800 px-3 py-2 text-xs text-zinc-400 font-heading uppercase tracking-wider">
                    Contacts
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800 text-left">
                          <th className="px-3 py-2 text-zinc-500 font-heading uppercase tracking-wider">Contact</th>
                          <th className="px-3 py-2 text-zinc-500 font-heading uppercase tracking-wider">Phone</th>
                          <th className="px-3 py-2 text-zinc-500 font-heading uppercase tracking-wider">Priority</th>
                          <th className="px-3 py-2 text-zinc-500 font-heading uppercase tracking-wider">Match</th>
                          <th className="px-3 py-2 text-zinc-500 font-heading uppercase tracking-wider">Branch</th>
                          <th className="px-3 py-2 text-zinc-500 font-heading uppercase tracking-wider">CSR</th>
                          <th className="px-3 py-2 text-zinc-500 font-heading uppercase tracking-wider">Team Lead</th>
                          <th className="px-3 py-2 text-zinc-500 font-heading uppercase tracking-wider">Status</th>
                          <th className="px-3 py-2 text-zinc-500 font-heading uppercase tracking-wider text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {maqsamContacts.map((c, idx) => {
                          const lead = c.matched_lead || null;
                          const member = c.matched_member || null;
                          const branchName = lead?.location_name || member?.location_name || '—';
                          const csrName = lead?.csr_name || member?.csr_name || '—';
                          const tlName = lead?.team_lead_name || member?.team_lead_name || '—';
                          const st = lead?.status || member?.member_status || '—';
                          const match = (c.match_status || '').toLowerCase();
                          return (
                            <tr key={c.identifier} className={`border-b border-zinc-800/50 ${idx % 2 === 0 ? 'bg-zinc-900/20' : ''}`}>
                              <td className="px-3 py-2 text-zinc-300">
                                <div className="text-white">{c.name || '—'}</div>
                                <div className="text-zinc-500">{c.identifier}</div>
                              </td>
                              <td className="px-3 py-2 text-zinc-400">{c.phone || '—'}</td>
                              <td className="px-3 py-2 text-zinc-400">{String(!!c.high_priority)}</td>
                              <td className="px-3 py-2 text-zinc-400">{c.match_status || 'unmatched'}</td>
                              <td className="px-3 py-2 text-zinc-400">{branchName}</td>
                              <td className="px-3 py-2 text-zinc-400">{csrName}</td>
                              <td className="px-3 py-2 text-zinc-400">{tlName}</td>
                              <td className="px-3 py-2 text-zinc-400">{st}</td>
                              <td className="px-3 py-2 text-right space-x-2">
                                {(match === 'unmatched') && (
                                  <Button onClick={() => createLeadFromContact(c)} className="bg-red-600 hover:bg-red-700 text-white rounded-sm h-8 px-3">
                                    Create Lead
                                  </Button>
                                )}
                                {(match === 'linked_member' || match === 'matched_member') && member?.member_id && (
                                  <Button onClick={() => window.open(`/owner/members/${member.member_id}`, '_blank')} className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-sm h-8 px-3">
                                    Open Member
                                  </Button>
                                )}
                                {(match === 'linked_lead' || match === 'matched_lead') && (lead?.sales_lead_id || c.linked_lead_id) && (
                                  <Button onClick={() => navigator.clipboard.writeText(String(lead?.sales_lead_id || c.linked_lead_id)) && toast.success('Lead ID copied')} className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-sm h-8 px-3">
                                    Copy Lead ID
                                  </Button>
                                )}
                                {(match === 'linked_member' || match === 'linked_lead') ? (
                                  <Button onClick={() => unlinkContact(c)} className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-sm h-8 px-3">
                                    Unlink
                                  </Button>
                                ) : (
                                  <Button onClick={() => promptLinkContact(c)} className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-sm h-8 px-3">
                                    Link
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-zinc-600">
                  {maqsamContactsLoading ? 'Loading contacts…' : 'No contacts synced yet. Enable Contacts and run Sync Contacts.'}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <Card className="bg-zinc-900/50 border-zinc-800 rounded-sm">
        <CardHeader>
          <CardTitle className="text-white font-heading uppercase tracking-wider text-sm">Inbound & Routing Rules</CardTitle>
          <CardDescription className="text-zinc-500 text-sm">
            Route inbound leads (Meta/TikTok/Snapchat/Website/etc.) to a default branch/team/CSR. Use source_platform=* as a default fallback.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-zinc-950/50 border border-zinc-800 rounded-sm p-3 text-xs text-zinc-500 space-y-1">
            <div>Inbound fields captured into lead details: source_platform, campaign_name, adset_or_adgroup, source_reference.</div>
            <div>Routing match order: exact source_platform → * (wildcard) → empty (default fallback).</div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-6 gap-3">
            <div className="lg:col-span-2">
              <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">Rule Name</label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm(f => ({ ...f, name: e.target.value }))}
                className="bg-zinc-950 border-zinc-800 text-white text-xs h-9"
                placeholder="e.g. META → Sharjah → Team A → CSR 1"
              />
            </div>
            <div>
              <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">Active</label>
              <div className="h-9 flex items-center">
                <Switch checked={!!createForm.is_active} onCheckedChange={(v) => setCreateForm(f => ({ ...f, is_active: !!v }))} />
              </div>
            </div>
            <div>
              <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">Source Platform</label>
              <Select value={(createForm.source_platform || '').trim() || 'default'} onValueChange={(v) => setCreateForm(f => ({ ...f, source_platform: v === 'default' ? '' : v }))}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white text-xs h-9">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="default">Default (empty)</SelectItem>
                  <SelectItem value="*">Wildcard (*)</SelectItem>
                  {['META', 'TIKTOK', 'SNAPCHAT', 'MAQSAM', 'WEBSITE', 'OTHER'].map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">Branch</label>
              <Select value={createForm.location_id || 'auto'} onValueChange={(v) => setCreateForm(f => ({ ...f, location_id: v === 'auto' ? '' : v, assigned_team_id: '', assigned_agent_staff_id: '' }))}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white text-xs h-9">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="auto">{currentLocation ? `Current: ${currentLocation.name}` : 'Select branch'}</SelectItem>
                  {effectiveLocations.map(l => (
                    <SelectItem key={l.location_id} value={l.location_id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">Team</label>
              <Select value={createForm.assigned_team_id || 'none'} onValueChange={(v) => setCreateForm(f => ({ ...f, assigned_team_id: v === 'none' ? '' : v }))}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white text-xs h-9">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="none">Unassigned</SelectItem>
                  {teams.map(t => <SelectItem key={t.sales_team_id} value={t.sales_team_id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">CSR / Agent</label>
              <Select value={createForm.assigned_agent_staff_id || 'none'} onValueChange={(v) => setCreateForm(f => ({ ...f, assigned_agent_staff_id: v === 'none' ? '' : v }))}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white text-xs h-9">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="none">Unassigned</SelectItem>
                  {csrs.map(s => (
                    <SelectItem key={s.staff_id} value={s.staff_id}>{`${s.first_name || ''} ${s.last_name || ''}`.trim() || s.staff_id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">Team Lead Visibility</label>
              <Select value={createForm.assigned_team_lead_staff_id || 'none'} onValueChange={(v) => setCreateForm(f => ({ ...f, assigned_team_lead_staff_id: v === 'none' ? '' : v }))}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white text-xs h-9">
                  <SelectValue placeholder="Auto / Unassigned" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="none">Auto / Unassigned</SelectItem>
                  {teamLeads.map(s => (
                    <SelectItem key={s.staff_id} value={s.staff_id}>{`${s.first_name || ''} ${s.last_name || ''}`.trim() || s.staff_id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={createRule}
                disabled={savingId === 'new'}
                className="bg-red-600 hover:bg-red-700 text-white rounded-sm h-9 text-xs font-heading uppercase tracking-wider"
              >
                Create Rule
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900/50 border-zinc-800 rounded-sm">
        <CardHeader>
          <CardTitle className="text-white font-heading uppercase tracking-wider text-sm">Existing Rules</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-zinc-500 text-sm">Loading…</div>
          ) : (
            <div className="space-y-3">
              {apiUnavailable ? (
                <div className="text-zinc-500 text-sm">Routing rules are not available on the current backend.</div>
              ) : rules.length === 0 ? (
                <div className="text-zinc-500 text-sm">No routing rules yet.</div>
              ) : (
                rules.map(rule => (
                  <div key={rule.sales_routing_rule_id || rule.rule_id || rule.name} className="border border-zinc-800 rounded-sm p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-white text-sm font-heading uppercase tracking-wider">{rule.name}</div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!!rule.is_active}
                          onCheckedChange={(v) => updateRule(rule.sales_routing_rule_id || rule.rule_id, { is_active: !!v })}
                          disabled={savingId === (rule.sales_routing_rule_id || rule.rule_id)}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">Source Platform</label>
                        <Select
                          value={(rule.source_platform || '').trim() || 'default'}
                          onValueChange={(v) => updateRule(rule.sales_routing_rule_id || rule.rule_id, { source_platform: v === 'default' ? '' : v })}
                        >
                          <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white text-xs h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800">
                            <SelectItem value="default">Default (empty)</SelectItem>
                            <SelectItem value="*">Wildcard (*)</SelectItem>
                            {['META', 'TIKTOK', 'SNAPCHAT', 'WEBSITE', 'OTHER'].map(p => (
                              <SelectItem key={p} value={p}>{p}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">Branch</label>
                        <Select
                          value={rule.location_id || 'none'}
                          onValueChange={(v) => updateRule(rule.sales_routing_rule_id || rule.rule_id, { location_id: v === 'none' ? '' : v })}
                        >
                          <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white text-xs h-9">
                            <SelectValue placeholder="Unassigned" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800">
                            <SelectItem value="none">Unassigned</SelectItem>
                            {effectiveLocations.map(l => (
                              <SelectItem key={l.location_id} value={l.location_id}>{l.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">Team</label>
                        <Select
                          value={rule.assigned_team_id || 'none'}
                          onValueChange={(v) => updateRule(rule.sales_routing_rule_id || rule.rule_id, { assigned_team_id: v === 'none' ? '' : v })}
                        >
                          <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white text-xs h-9">
                            <SelectValue placeholder="Unassigned" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800">
                            <SelectItem value="none">Unassigned</SelectItem>
                            {teams.map(t => <SelectItem key={t.sales_team_id} value={t.sales_team_id}>{t.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">CSR / Agent</label>
                        <Select
                          value={rule.assigned_agent_staff_id || 'none'}
                          onValueChange={(v) => updateRule(rule.sales_routing_rule_id || rule.rule_id, { assigned_agent_staff_id: v === 'none' ? '' : v })}
                        >
                          <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white text-xs h-9">
                            <SelectValue placeholder="Unassigned" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800">
                            <SelectItem value="none">Unassigned</SelectItem>
                            {csrs.map(s => (
                              <SelectItem key={s.staff_id} value={s.staff_id}>{`${s.first_name || ''} ${s.last_name || ''}`.trim() || s.staff_id}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <div>
                        <label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider block mb-1">Team Lead Visibility</label>
                        <Select
                          value={rule.assigned_team_lead_staff_id || 'none'}
                          onValueChange={(v) => updateRule(rule.sales_routing_rule_id || rule.rule_id, { assigned_team_lead_staff_id: v === 'none' ? '' : v })}
                        >
                          <SelectTrigger className="bg-zinc-950 border-zinc-800 text-white text-xs h-9">
                            <SelectValue placeholder="Auto / Unassigned" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800">
                            <SelectItem value="none">Auto / Unassigned</SelectItem>
                            {teamLeads.map(s => (
                              <SelectItem key={s.staff_id} value={s.staff_id}>{`${s.first_name || ''} ${s.last_name || ''}`.trim() || s.staff_id}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
