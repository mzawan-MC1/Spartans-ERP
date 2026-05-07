import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { locationAPI, categoryAPI, programAPI, instructorAPI, scheduleAPI, attendanceAPI, authAPI } from '@/lib/api';
import TopNav from '@/components/TopNav';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ArrowLeft, Building2, BookOpen, Users, Calendar, ClipboardCheck, MapPin, Phone, Mail, Clock, Settings } from 'lucide-react';
import OwnerLocationCMSPanel from '@/pages/owner/OwnerLocationCMSPanel';
import OwnerLocationInstructorsPanel from '@/pages/owner/OwnerLocationInstructorsPanel';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SCHEDULE_COLUMNS = [
  { label: 'Saturday', idx: 5 },
  { label: 'Sunday', idx: 6 },
  { label: 'Monday', idx: 0 },
  { label: 'Tuesday', idx: 1 },
  { label: 'Wednesday', idx: 2 },
  { label: 'Thursday', idx: 3 },
  { label: 'Friday', idx: 4 },
];
const SCHEDULE_DISCIPLINE_OPTIONS = [
  { key: 'all', label: 'All Categories' },
  { key: 'boxing', label: 'Boxing' },
  { key: 'gym', label: 'GYM' },
  { key: 'mma', label: 'MMA' },
  { key: 'crossfit', label: 'CrossFit' },
  { key: 'muay_thai', label: 'Muay Thai' },
];

function _normalizeCategoryName(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function _scheduleInstructorLabel(s, instMap) {
  if (s?.instructor_id) return instMap[s.instructor_id] || 'TBD';
  if (Array.isArray(s?.instructor_ids) && s.instructor_ids.length > 0) {
    const names = s.instructor_ids.map(id => instMap[id]).filter(Boolean);
    return names.length ? names.join(', ') : 'TBD';
  }
  return 'TBD';
}
const TABS = [
  { key: 'info', label: 'Info', icon: Building2 },
  { key: 'programs', label: 'Programs', icon: BookOpen },
  { key: 'schedule', label: 'Schedule', icon: Calendar },
  { key: 'attendance', label: 'Attendance', icon: ClipboardCheck },
  { key: 'attendance', label: 'Attendance', icon: ClipboardCheck },
  { key: 'cms', label: 'Location CMS', icon: Settings },
  { key: 'instructors', label: 'Instructors', icon: Users },
];

export default function LocationDetailPage() {
  const { locationId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [locations, setLocations] = useState([]);
  const [location, setLocation] = useState(null);
  const [activeTab, setActiveTab] = useState('info');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [categories, setCategories] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [attSummary, setAttSummary] = useState(null);
  const [scheduleDiscipline, setScheduleDiscipline] = useState('all');

  useEffect(() => {
    const load = async () => {
      try {
        const [userRes, locsRes, locRes] = await Promise.all([authAPI.getMe(), locationAPI.list(), locationAPI.get(locationId)]);
        setUser(userRes.data);
        setLocations(locsRes.data);
        setLocation(locRes.data);
        const ov = await locationAPI.getOverview(locationId);
        setOverview(ov.data);
      } catch (err) {
        if (err.response?.status === 401) navigate('/login', { replace: true });
        else { toast.error('Location not found'); navigate('/dashboard', { replace: true }); }
      } finally { setLoading(false); }
    };
    load();
  }, [locationId, navigate]);

  useEffect(() => {
    if (!locationId || !user) return;
    const loadTab = async () => {
      try {
        if (activeTab === 'programs') {
          const [cRes, pRes, iRes] = await Promise.all([
            categoryAPI.list(locationId), programAPI.list(locationId), instructorAPI.list(locationId)
          ]);
          setCategories(cRes.data);
          setPrograms(pRes.data);
          setInstructors(iRes.data);
        } else if (activeTab === 'schedule') {
          const [sRes, cRes, pRes, iRes] = await Promise.all([
            scheduleAPI.list(locationId),
            categoryAPI.list(locationId),
            programAPI.list(locationId),
            instructorAPI.list(locationId),
          ]);
          setSchedules(sRes.data);
          setCategories(cRes.data);
          setPrograms(pRes.data);
          setInstructors(iRes.data);
        } else if (activeTab === 'attendance') {
          const res = await attendanceAPI.summary(locationId);
          setAttSummary(res.data);
        }
      } catch {}
    };
    loadTab();
  }, [activeTab, locationId, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const progMap = Object.fromEntries(programs.map(p => [p.program_id, p.name]));
  const progObjMap = Object.fromEntries(programs.map(p => [p.program_id, p]));
  const instMap = Object.fromEntries(instructors.map(i => [i.instructor_id, i.full_name]));
  const categoryIdByKey = (() => {
    const out = {};
    const normalized = new Map(categories.map(c => [_normalizeCategoryName(c.name), c.category_id]));
    out.boxing = normalized.get('boxing');
    out.gym = normalized.get('gym') || normalized.get('gymtraining') || normalized.get('fitnessgym');
    out.mma = normalized.get('mma') || normalized.get('mixedmartialarts');
    out.crossfit = normalized.get('crossfit');
    out.muay_thai = normalized.get('muaythai');
    return out;
  })();
  const scheduleCategoryId = scheduleDiscipline === 'all' ? null : (categoryIdByKey[scheduleDiscipline] || '__missing__');
  const filteredSchedules = (() => {
    const active = schedules.filter(s => s.is_active);
    if (!scheduleCategoryId) return active;
    if (scheduleCategoryId === '__missing__') return [];
    return active.filter(s => {
      const p = progObjMap[s.program_id];
      return p && p.category_id === scheduleCategoryId;
    });
  })();

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col">
      <TopNav user={user} locations={locations} />
      <main className="flex-1 px-6 sm:px-8 lg:px-12 py-8 max-w-[1440px] mx-auto w-full">
        <button data-testid="back-to-dashboard-from-detail" onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-zinc-500 hover:text-white font-heading uppercase tracking-wider text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} /> Back to Dashboard
        </button>

        <h1 className="font-heading font-extrabold text-white text-4xl sm:text-5xl uppercase tracking-tight mb-2">{location?.name}</h1>
        <p className="text-zinc-500 font-body text-base mb-8">{location?.city}, {location?.country}</p>

        {/* Overview Cards */}
        {overview && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            {[
              { label: 'Categories', value: overview.categories, icon: BookOpen, color: 'text-amber-400' },
              { label: 'Programs', value: overview.programs, icon: BookOpen, color: 'text-red-500' },
              { label: 'Instructors', value: overview.instructors, icon: Users, color: 'text-emerald-400' },
              { label: 'Classes/Week', value: overview.upcoming_sessions, icon: Calendar, color: 'text-blue-400' },
              { label: 'Att. Rate', value: `${overview.attendance_rate}%`, icon: ClipboardCheck, color: 'text-zinc-300' },
            ].map((s, i) => (
              <div key={s.label} className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-sm opacity-0 animate-fade-in-up" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">{s.label}</span>
                  <s.icon className={`w-4 h-4 ${s.color}`} strokeWidth={1.5} />
                </div>
                <p className={`font-heading font-extrabold text-2xl ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800 mb-8">
          {TABS.map(tab => (
            <button key={tab.key} data-testid={`tab-${tab.key}`} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 font-heading uppercase tracking-wider text-xs transition-all border-b-2 ${
                activeTab === tab.key ? 'border-red-600 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}>
              <tab.icon className="w-3.5 h-3.5" strokeWidth={1.5} /> {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'info' && location && (
          <div data-testid="location-info-tab" className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-6 max-w-2xl space-y-4">
            <Row label="Name" value={location.name} />
            <Row label="Address" value={location.address} icon={MapPin} />
            <Row label="City" value={`${location.city}, ${location.country}`} />
            <Row label="Phone" value={location.phone} icon={Phone} />
            <Row label="Email" value={location.email} icon={Mail} />
            <Row label="Timezone" value={location.timezone} />
            <Row label="Currency" value={location.default_currency} />
            <Row label="Status" value={<Badge className={`rounded-sm font-heading uppercase text-[10px] border-0 ${location.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-700/50 text-zinc-500'}`}>{location.status}</Badge>} />
            <div className="pt-4">
              <button data-testid="edit-from-detail-btn" onClick={() => navigate(`/locations/${locationId}/edit`)}
                className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm transition-all">
                Edit Location
              </button>
            </div>
          </div>
        )}

        {activeTab === 'programs' && (
          <div data-testid="location-programs-tab" className="space-y-6">
            {/* Active Categories */}
            {(() => {
              const activeCategories = categories.filter(c => c.is_active && !c.deleted_at);
              return (
                <>
                  <h3 className="font-heading font-bold text-white text-sm uppercase tracking-wider">Categories ({activeCategories.length})</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {activeCategories.map(c => (
                      <div key={c.category_id} className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-4">
                        <p className="text-white font-body text-sm font-medium">{c.name}</p>
                        <p className="text-zinc-600 text-xs mt-0.5">{c.age_group} | {c.skill_level}</p>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
            
            {/* Active Programs */}
            {(() => {
              const activePrograms = programs.filter(p => p.is_active && !p.deleted_at);
              return (
                <>
                  <h3 className="font-heading font-bold text-white text-sm uppercase tracking-wider mt-6">Programs ({activePrograms.length})</h3>
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm overflow-hidden">
                    <table className="w-full">
                      <thead><tr className="border-b border-zinc-800">
                        <th className="text-left p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Program</th>
                        <th className="text-left p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs hidden sm:table-cell">Capacity</th>
                        <th className="text-left p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs hidden sm:table-cell">Difficulty</th>
                        <th className="text-center p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Status</th>
                      </tr></thead>
                      <tbody>
                        {activePrograms.map(p => (
                          <tr key={p.program_id} className="border-b border-zinc-800/50">
                            <td className="p-3 text-white text-sm">{p.name}</td>
                            <td className="p-3 text-zinc-400 text-sm hidden sm:table-cell">{p.capacity}</td>
                            <td className="p-3 hidden sm:table-cell">
                              <Badge className="rounded-sm font-heading uppercase text-[10px] bg-zinc-800 text-zinc-300 border-0">{p.difficulty_level}</Badge>
                            </td>
                            <td className="p-3 text-center">
                              <Badge className="rounded-sm font-heading uppercase text-[10px] border-0 bg-emerald-500/20 text-emerald-400">Active</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}
            
            {/* Active Instructors */}
            {(() => {
              const activeInstructors = instructors.filter(i => i.is_active && !i.deleted_at);
              return (
                <>
                  <h3 className="font-heading font-bold text-white text-sm uppercase tracking-wider mt-6">Instructors ({activeInstructors.length})</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {activeInstructors.map(i => (
                      <div key={i.instructor_id} className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-4">
                        <p className="text-white font-body text-sm font-medium">{i.full_name}</p>
                        <p className="text-zinc-600 text-xs mt-0.5">{i.specialties}</p>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {activeTab === 'schedule' && (
          <div data-testid="location-schedule-tab" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="font-heading font-bold text-white text-sm uppercase tracking-wider">Schedule</h3>
                <p className="text-zinc-600 text-xs mt-1">View weekly schedule by day</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 text-xs font-heading uppercase tracking-wider">Discipline</span>
                <select
                  value={scheduleDiscipline}
                  onChange={(e) => setScheduleDiscipline(e.target.value)}
                  className="bg-zinc-900/50 border border-zinc-800 text-white text-sm rounded-sm px-3 py-2 focus:outline-none focus:border-red-600"
                >
                  {SCHEDULE_DISCIPLINE_OPTIONS.map(o => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <div className="grid grid-cols-7 gap-3 min-w-[1120px]">
                {SCHEDULE_COLUMNS.map(col => {
                  const items = filteredSchedules
                    .filter(s => s.day_of_week === col.idx)
                    .sort((a, b) => a.start_time.localeCompare(b.start_time));
                  return (
                    <div key={col.idx} className="bg-zinc-900/40 border border-zinc-800 rounded-sm p-3 min-w-[150px]">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-heading font-bold text-white text-xs uppercase tracking-wider flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${items.length > 0 ? 'bg-red-500' : 'bg-zinc-700'}`} />
                          {col.label}
                        </h4>
                        <span className="text-zinc-600 text-[10px] font-heading uppercase tracking-wider">{items.length}</span>
                      </div>

                      {items.length === 0 ? (
                        <div className="text-zinc-600 text-xs">No classes</div>
                      ) : (
                        <div className="space-y-2">
                          {items.map(s => (
                            <div key={s.schedule_id} className="bg-zinc-950/60 border border-zinc-800 rounded-sm p-2">
                              <div className="flex items-center gap-1.5 text-red-500">
                                <Clock className="w-3.5 h-3.5" strokeWidth={1.5} />
                                <span className="font-heading font-bold text-xs">{s.start_time} - {s.end_time}</span>
                              </div>
                              <p className="text-white font-body text-xs mt-1">{progMap[s.program_id] || 'Unknown'}</p>
                              <p className="text-zinc-500 text-[11px] mt-0.5">{_scheduleInstructorLabel(s, instMap)}{s.room ? ` | ${s.room}` : ''}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'attendance' && attSummary && (
          <div data-testid="location-attendance-tab" className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Records', value: attSummary.total, color: 'text-zinc-300' },
                { label: 'Present', value: attSummary.present, color: 'text-emerald-400' },
                { label: 'Absent', value: attSummary.absent, color: 'text-red-400' },
                { label: 'Late', value: attSummary.late, color: 'text-amber-400' },
              ].map(s => (
                <div key={s.label} className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-sm">
                  <span className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">{s.label}</span>
                  <p className={`font-heading font-extrabold text-2xl ${s.color} mt-1`}>{s.value}</p>
                </div>
              ))}
            </div>
            {attSummary.per_program?.length > 0 && (
              <>
                <h3 className="font-heading font-bold text-white text-sm uppercase tracking-wider">Per Program</h3>
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm overflow-hidden">
                  <table className="w-full">
                    <thead><tr className="border-b border-zinc-800">
                      <th className="text-left p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Program</th>
                      <th className="text-center p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Total</th>
                      <th className="text-center p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Present</th>
                      <th className="text-center p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Rate</th>
                    </tr></thead>
                    <tbody>
                      {attSummary.per_program.filter(p => p.total > 0).map(p => (
                        <tr key={p.program_id} className="border-b border-zinc-800/50">
                          <td className="p-3 text-white text-sm">{p.name}</td>
                          <td className="p-3 text-center text-zinc-400 text-sm">{p.total}</td>
                          <td className="p-3 text-center text-emerald-400 text-sm">{p.present}</td>
                          <td className="p-3 text-center text-zinc-300 text-sm">{p.total > 0 ? Math.round(p.present / p.total * 100) : 0}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'cms' && (
          <div data-testid="location-cms-tab" className="space-y-6">
            <OwnerLocationCMSPanel locationId={locationId} />
          </div>
        )}

        {activeTab === 'instructors' && (
          <div data-testid="location-instructors-tab" className="space-y-6">
            <OwnerLocationInstructorsPanel locationId={locationId} />
          </div>
        )}
      </main>
    </div>
  );
}

function Row({ label, value, icon: Icon }) {
  return (
    <div className="flex items-start gap-4">
      <span className="text-zinc-500 text-xs font-heading uppercase tracking-wider w-24 shrink-0 pt-0.5">{label}</span>
      <span className="text-white text-sm font-body flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 text-zinc-500" strokeWidth={1.5} />}
        {value}
      </span>
    </div>
  );
}
