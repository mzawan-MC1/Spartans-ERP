import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ManagerLayout from '@/components/ManagerLayout';
import { scheduleAPI, programAPI, instructorAPI, categoryAPI } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, RefreshCw, Clock, BookOpen, Users, ArrowRight, Filter, RotateCcw } from 'lucide-react';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function SchedulePage() {
  return (
    <ManagerLayout activePage="schedule">
      {() => <ScheduleContent />}
    </ManagerLayout>
  );
}

const EMPTY = { program_id: '', instructor_ids: [], day_of_week: 0, start_time: '09:00', end_time: '10:00', room: '', capacity_override: '' };

function ScheduleContent() {
  const navigate = useNavigate();
  const [schedules, setSchedules] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [categories, setCategories] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState({ open: false, editing: null });
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, schedule: null });
  const [statusFilter, setStatusFilter] = useState('active');
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');

  const fetchData = useCallback(async () => {
    try {
      const schedParams = {};
      if (statusFilter === 'active') {
        schedParams.is_active = true;
      } else if (statusFilter === 'inactive') {
        schedParams.is_active = false;
      } else if (statusFilter === 'deleted') {
        schedParams.include_deleted = true;
      }

      const [sRes, pRes, iRes, cRes] = await Promise.all([
        scheduleAPI.list(null, schedParams),
        programAPI.list(),
        instructorAPI.list(),
        categoryAPI.list()
      ]);

      let data = sRes.data;
      if (statusFilter === 'deleted') {
        data = data.filter(s => s.deleted_at);
      } else {
        data = data.filter(s => !s.deleted_at);
      }

      setSchedules(data);
      setPrograms(pRes.data.filter(p => p.is_active && !p.deleted_at));
      setInstructors(iRes.data.filter(i => i.is_active && !i.deleted_at));
      
      const activeCats = cRes.data.filter(c => c.is_active && !c.deleted_at);
      setCategories(activeCats);
      if (activeCats.length > 0 && selectedCategoryId === 'all') {
        setSelectedCategoryId(activeCats[0].category_id);
      }
    } catch {} finally { setLoading(false); }
  }, [statusFilter, selectedCategoryId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const progMap = Object.fromEntries(programs.map(p => [p.program_id, p.name]));
  const progCategoryMap = Object.fromEntries(programs.map(p => [p.program_id, p.category_id]));
  const instMap = Object.fromEntries(instructors.map(i => [i.instructor_id, i.full_name]));

  // Filter schedules based on the selected category
  const filteredSchedules = schedules.filter(s => {
    if (selectedCategoryId === 'all') return true;
    return progCategoryMap[s.program_id] === selectedCategoryId;
  });

  const grouped = DAY_NAMES.map((name, idx) => ({
    day: name,
    dayIdx: idx,
    items: filteredSchedules.filter(s => s.day_of_week === idx).sort((a, b) => a.start_time.localeCompare(b.start_time)),
  }));

  const openCreate = () => {
    // Default to the first program in the selected category
    const categoryPrograms = programs.filter(p => p.category_id === selectedCategoryId);
    setForm({ ...EMPTY, program_id: categoryPrograms[0]?.program_id || programs[0]?.program_id || '', instructor_ids: [] });
    setDialog({ open: true, editing: null });
  };
  const openEdit = (s) => {
    // Support both old instructor_id and new instructor_ids format
    const instructorIds = s.instructor_ids || (s.instructor_id ? [s.instructor_id] : []);
    setForm({
      program_id: s.program_id, instructor_ids: instructorIds,
      day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time,
      room: s.room || '', capacity_override: s.capacity_override || ''
    });
    setDialog({ open: true, editing: s });
  };

  const handleSave = async () => {
    if (!form.program_id || !form.instructor_ids || form.instructor_ids.length === 0) { 
      toast.error('Program and at least one instructor required'); 
      return; 
    }
    setSaving(true);
    const payload = { 
      ...form, 
      day_of_week: parseInt(form.day_of_week), 
      capacity_override: form.capacity_override ? parseInt(form.capacity_override) : null 
    };
    try {
      if (dialog.editing) {
        await scheduleAPI.update(dialog.editing.schedule_id, payload);
        toast.success('Schedule updated');
      } else {
        await scheduleAPI.create(payload);
        toast.success('Schedule created');
      }
      setDialog({ open: false, editing: null });
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleToggleStatus = async (s) => {
    try {
      if (s.is_active) {
        await scheduleAPI.update(s.schedule_id, { is_active: false });
        toast.success('Schedule deactivated');
      } else {
        await scheduleAPI.update(s.schedule_id, { is_active: true });
        toast.success('Schedule activated');
      }
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
  };

  const handleDelete = async () => {
    if (!deleteDialog.schedule) return;
    setSaving(true);
    try {
      await scheduleAPI.delete(deleteDialog.schedule.schedule_id);
      toast.success('Schedule deleted');
      setDeleteDialog({ open: false, schedule: null });
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleRestore = async (s) => {
    try {
      await scheduleAPI.restore(s.schedule_id);
      toast.success('Schedule restored');
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
  };

  const handleGenerate = async (s) => {
    setGenerating(s.schedule_id);
    try {
      const res = await scheduleAPI.generateSessions(s.schedule_id, 8);
      toast.success(res.data.message);
    } catch (err) { toast.error(err.response?.data?.detail || 'Generation failed'); }
    finally { setGenerating(null); }
  };

  return (
    <div data-testid="schedule-page" className="p-6 sm:p-8 lg:p-10 max-w-[1200px]">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading font-extrabold text-white text-4xl sm:text-5xl uppercase tracking-tight">Schedule</h1>
          <p className="text-zinc-500 font-body mt-1 text-base">Weekly class schedule</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/manager/attendance')}
            className="bg-transparent border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm transition-all active:scale-95"
          >
            Class Attendance
          </button>
          <button data-testid="add-schedule-btn" onClick={openCreate}
            className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm transition-all active:scale-95 flex items-center gap-2">
            <Plus className="w-4 h-4" strokeWidth={1.5} /> Add Schedule
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2 scrollbar-thin">
        <button
          onClick={() => setSelectedCategoryId('all')}
          className={`px-4 py-2 rounded-sm text-sm font-heading uppercase tracking-wider transition-colors whitespace-nowrap ${
            selectedCategoryId === 'all'
              ? 'bg-red-600 text-white'
              : 'bg-zinc-800/50 text-zinc-400 hover:text-white hover:bg-zinc-800'
          }`}
        >
          All Categories
        </button>
        {categories.map((c) => (
          <button
            key={c.category_id}
            onClick={() => setSelectedCategoryId(c.category_id)}
            className={`px-4 py-2 rounded-sm text-sm font-heading uppercase tracking-wider transition-colors whitespace-nowrap ${
              selectedCategoryId === c.category_id
                ? 'bg-red-600 text-white'
                : 'bg-zinc-800/50 text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Filter Row */}
      <div className="flex items-center gap-3 mb-6">
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
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : programs.length === 0 ? (
        <div data-testid="no-programs-state" className="border border-dashed border-zinc-800 rounded-sm p-16 text-center">
          <BookOpen className="w-12 h-12 text-zinc-700 mx-auto mb-4" strokeWidth={1.5} />
          <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wider mb-2">No Programs Yet</h3>
          <p className="text-zinc-500 font-body text-sm mb-6 max-w-md mx-auto">
            Before creating schedules, you need to create at least one program.
          </p>
          <button data-testid="go-to-programs-btn" onClick={() => navigate('/manager/programs')}
            className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-6 py-2 rounded-sm text-sm transition-all active:scale-95 inline-flex items-center gap-2">
            <Plus className="w-4 h-4" strokeWidth={1.5} /> Create Program First
            <ArrowRight className="w-4 h-4 ml-1" strokeWidth={1.5} />
          </button>
        </div>
      ) : instructors.length === 0 ? (
        <div data-testid="no-instructors-state" className="border border-dashed border-zinc-800 rounded-sm p-16 text-center">
          <Users className="w-12 h-12 text-zinc-700 mx-auto mb-4" strokeWidth={1.5} />
          <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wider mb-2">No Instructors Yet</h3>
          <p className="text-zinc-500 font-body text-sm mb-6 max-w-md mx-auto">
            Before creating schedules, you need to add at least one instructor.
          </p>
          <button data-testid="go-to-instructors-btn" onClick={() => navigate('/manager/instructors')}
            className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-6 py-2 rounded-sm text-sm transition-all active:scale-95 inline-flex items-center gap-2">
            <Plus className="w-4 h-4" strokeWidth={1.5} /> Add Instructor First
            <ArrowRight className="w-4 h-4 ml-1" strokeWidth={1.5} />
          </button>
        </div>
      ) : filteredSchedules.length === 0 ? (
        <div className="border border-dashed border-zinc-800 rounded-sm p-16 text-center">
          <p className="text-zinc-500 font-heading uppercase tracking-wider text-sm">
            {statusFilter === 'deleted' 
              ? 'No deleted schedules' 
              : statusFilter === 'inactive' 
                ? 'No inactive schedules' 
                : 'No schedules found for this category'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ day, dayIdx, items }) => (
            <div key={dayIdx} data-testid={`schedule-day-${dayIdx}`}>
              <h3 className="font-heading font-bold text-white text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${items.length > 0 ? 'bg-red-500' : 'bg-zinc-700'}`} />
                {day}
                <span className="text-zinc-600 text-xs font-body ml-1">({items.length} classes)</span>
              </h3>
              {items.length === 0 ? (
                <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-sm p-4 text-center">
                  <p className="text-zinc-600 text-xs font-body">No classes scheduled</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {items.map((s) => (
                    <div key={s.schedule_id} data-testid={`schedule-item-${s.schedule_id}`}
                      className={`bg-zinc-900/50 border rounded-sm p-4 flex items-center justify-between gap-4 transition-colors ${
                        s.deleted_at ? 'border-red-800/50' : 'border-zinc-800 hover:border-zinc-700'
                      }`}>
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className={`flex items-center gap-1.5 shrink-0 ${s.deleted_at ? 'text-zinc-600' : 'text-red-500'}`}>
                          <Clock className="w-3.5 h-3.5" strokeWidth={1.5} />
                          <span className={`font-heading font-bold text-sm ${s.deleted_at ? 'line-through' : ''}`}>{s.start_time} - {s.end_time}</span>
                        </div>
                        <div className="min-w-0">
                          <p className={`font-body text-sm font-medium truncate ${s.deleted_at ? 'text-zinc-500 line-through' : 'text-white'}`}>
                            {progMap[s.program_id] || 'Unknown'}
                          </p>
                          <p className="text-zinc-500 text-xs">
                            {/* Show all instructors */}
                            {(s.instructor_ids || [s.instructor_id]).filter(Boolean).map(id => instMap[id] || 'TBD').join(', ') || 'TBD'}
                            {s.room ? ` | ${s.room}` : ''}
                          </p>
                        </div>
                        {/* Status indicator */}
                        {s.deleted_at ? (
                          <Badge className="rounded-sm font-heading uppercase text-[10px] border-0 bg-red-500/20 text-red-400 shrink-0">Deleted</Badge>
                        ) : (
                          <button
                            data-testid={`toggle-status-sched-${s.schedule_id}`}
                            onClick={() => handleToggleStatus(s)}
                            className={`px-2 py-0.5 rounded-sm font-heading uppercase text-[10px] border transition-colors shrink-0 ${
                              s.is_active 
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30' 
                                : 'bg-zinc-700/50 text-zinc-500 border-zinc-600 hover:bg-zinc-700'
                            }`}
                          >
                            {s.is_active ? 'Active' : 'Inactive'}
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {s.deleted_at ? (
                          <button data-testid={`restore-sched-${s.schedule_id}`} onClick={() => handleRestore(s)}
                            className="text-zinc-500 hover:text-emerald-400 transition-colors p-1" title="Restore">
                            <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </button>
                        ) : (
                          <>
                            {s.is_active && (
                              <button data-testid={`gen-sessions-${s.schedule_id}`} onClick={() => handleGenerate(s)} disabled={generating === s.schedule_id}
                                title="Generate sessions"
                                className="text-zinc-500 hover:text-blue-400 transition-colors p-1">
                                {generating === s.schedule_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />}
                              </button>
                            )}
                            <button data-testid={`edit-sched-${s.schedule_id}`} onClick={() => openEdit(s)} className="text-zinc-500 hover:text-white transition-colors p-1">
                              <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
                            </button>
                            <button data-testid={`delete-sched-${s.schedule_id}`} onClick={() => setDeleteDialog({ open: true, schedule: s })}
                              className="text-zinc-500 hover:text-red-400 transition-colors p-1">
                              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialog.open} onOpenChange={(open) => !open && setDialog({ open: false, editing: null })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 rounded-sm">
          <DialogHeader><DialogTitle className="font-heading text-white uppercase tracking-wider">{dialog.editing ? 'Edit Schedule' : 'Add Schedule'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Program *</Label>
              <Select value={form.program_id} onValueChange={(v) => setForm({ ...form, program_id: v })}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-10"><SelectValue placeholder="Select program" /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {programs
                    .filter(p => selectedCategoryId === 'all' || p.category_id === selectedCategoryId)
                    .map(p => (<SelectItem key={p.program_id} value={p.program_id} className="text-zinc-300 focus:bg-zinc-800 focus:text-white">{p.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Instructors * (select one or more)</Label>
              <div className="bg-zinc-950 border border-zinc-800 rounded-sm p-3 max-h-48 overflow-y-auto space-y-2">
                {instructors.map(i => (
                  <label key={i.instructor_id} className="flex items-center gap-3 cursor-pointer hover:bg-zinc-800/50 p-2 rounded-sm transition-colors">
                    <input
                      type="checkbox"
                      checked={form.instructor_ids?.includes(i.instructor_id) || false}
                      onChange={(e) => {
                        const newIds = e.target.checked
                          ? [...(form.instructor_ids || []), i.instructor_id]
                          : (form.instructor_ids || []).filter(id => id !== i.instructor_id);
                        setForm({ ...form, instructor_ids: newIds });
                      }}
                      className="w-4 h-4 rounded border-zinc-600 bg-zinc-900 text-red-600 focus:ring-red-500 focus:ring-offset-zinc-900"
                    />
                    <span className="text-zinc-300 text-sm">{i.full_name}</span>
                  </label>
                ))}
              </div>
              {form.instructor_ids?.length > 0 && (
                <p className="text-xs text-zinc-500">{form.instructor_ids.length} instructor(s) selected</p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Day *</Label>
                <Select value={String(form.day_of_week)} onValueChange={(v) => setForm({ ...form, day_of_week: parseInt(v) })}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-10"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {DAY_NAMES.map((d, i) => (<SelectItem key={i} value={String(i)} className="text-zinc-300 focus:bg-zinc-800 focus:text-white">{d}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Start</Label>
                <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                  className="bg-zinc-950 border-zinc-800 focus:border-red-600 rounded-sm text-white h-10" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">End</Label>
                <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                  className="bg-zinc-950 border-zinc-800 focus:border-red-600 rounded-sm text-white h-10" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Room</Label>
                <Input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })}
                  placeholder="e.g. Dojo A" className="bg-zinc-950 border-zinc-800 focus:border-red-600 rounded-sm text-white h-10" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Capacity Override</Label>
                <Input type="number" value={form.capacity_override} onChange={(e) => setForm({ ...form, capacity_override: e.target.value })}
                  placeholder="Default" className="bg-zinc-950 border-zinc-800 focus:border-red-600 rounded-sm text-white h-10" />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <button onClick={() => setDialog({ open: false, editing: null })}
              className="bg-transparent border border-zinc-700 text-zinc-300 font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm transition-all">Cancel</button>
            <button data-testid="save-schedule-btn" onClick={handleSave} disabled={saving}
              className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm transition-all disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, schedule: null })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 rounded-sm max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">Delete Schedule</DialogTitle>
            <DialogDescription className="text-zinc-400 font-body">
              Are you sure you want to delete this schedule? It can be restored later from the Deleted filter.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-4">
            <button onClick={() => setDeleteDialog({ open: false, schedule: null })}
              className="bg-transparent border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm transition-all">
              Cancel
            </button>
            <button data-testid="confirm-delete-schedule-btn" onClick={handleDelete} disabled={saving}
              className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm transition-all disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
