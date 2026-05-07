import { useState, useEffect, useCallback } from 'react';
import ManagerLayout from '@/components/ManagerLayout';
import { instructorAPI } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { User, Phone, Mail, Filter } from 'lucide-react';

export default function InstructorsPage() {
  return (
    <ManagerLayout activePage="instructors">
      {() => <InstructorsContent />}
    </ManagerLayout>
  );
}

function InstructorsContent() {
  const [instructors, setInstructors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('active');

  const fetchInstructors = useCallback(async () => {
    try {
      const params = {};
      if (statusFilter === 'active') {
        params.is_active = true;
      } else if (statusFilter === 'inactive') {
        params.is_active = false;
      } else if (statusFilter === 'deleted') {
        params.include_deleted = true;
      }
      const res = await instructorAPI.list(null, params);
      let data = res.data;
      if (statusFilter === 'deleted') {
        data = data.filter(i => i.deleted_at);
      } else {
        data = data.filter(i => !i.deleted_at);
      }
      setInstructors(data);
    } catch {} finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchInstructors(); }, [fetchInstructors]);

  return (
    <div data-testid="instructors-page" className="p-6 sm:p-8 lg:p-10 max-w-[1200px]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-heading font-extrabold text-white text-4xl sm:text-5xl uppercase tracking-tight">Instructors</h1>
          <p className="text-zinc-500 font-body mt-1 text-base">Manage your coaching team</p>
        </div>
      </div>
      
      {/* Info banner */}
      <div className="bg-zinc-800/50 border border-zinc-700 rounded-sm p-3 mb-6 flex items-center gap-3">
        <User className="w-5 h-5 text-zinc-400 flex-shrink-0" />
        <p className="text-zinc-400 text-sm">
          To add new instructors, go to <strong className="text-white">Staff</strong> page and add staff with role "Instructor". 
          They will automatically appear here.
        </p>
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
      ) : instructors.length === 0 ? (
        <div className="border border-dashed border-zinc-800 rounded-sm p-16 text-center">
          <User className="w-12 h-12 text-zinc-700 mx-auto mb-4" strokeWidth={1.5} />
          <p className="text-zinc-500 font-heading uppercase tracking-wider text-sm">
            {statusFilter === 'deleted' ? 'No deleted instructors' :
             statusFilter === 'inactive' ? 'No inactive instructors' :
             'No instructors yet'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {instructors.map((inst, i) => (
            <div key={inst.instructor_id} data-testid={`instructor-card-${inst.instructor_id}`}
              className={`bg-zinc-900/50 border rounded-sm p-5 transition-all opacity-0 animate-fade-in-up ${
                inst.deleted_at ? 'border-red-800/50' : 'border-zinc-800 hover:border-zinc-700'
              }`}
              style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {inst.profile_image_path ? (
                    <img 
                      src={inst.profile_image_path.startsWith('/') ? `${process.env.REACT_APP_BACKEND_URL}${inst.profile_image_path}` : inst.profile_image_path} 
                      alt={inst.full_name} 
                      className="w-10 h-10 rounded-full object-cover" 
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                      <User className="w-5 h-5 text-zinc-400" strokeWidth={1.5} />
                    </div>
                  )}
                  <div>
                    <p className={`font-body font-medium text-sm ${inst.deleted_at ? 'text-zinc-500 line-through' : 'text-white'}`}>{inst.full_name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                    {inst.deleted_at ? (
                      <Badge className="rounded-sm font-heading uppercase text-[10px] border-0 bg-red-500/20 text-red-400">Deleted</Badge>
                    ) : (
                      <Badge className={`rounded-sm font-heading uppercase text-[10px] border-0 ${inst.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-700/50 text-zinc-500'}`}>
                        {inst.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    )}
                    </div>
                  </div>
                </div>
                <div />
              </div>
              {inst.specialties && (
                <p className="text-zinc-400 text-xs font-body mb-2">{inst.specialties}</p>
              )}
              <div className="space-y-1.5 mt-3 pt-3 border-t border-zinc-800">
                {inst.phone && <p className="text-zinc-500 text-xs flex items-center gap-1.5"><Phone className="w-3 h-3" strokeWidth={1.5} />{inst.phone}</p>}
                {inst.email && <p className="text-zinc-500 text-xs flex items-center gap-1.5"><Mail className="w-3 h-3" strokeWidth={1.5} />{inst.email}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
