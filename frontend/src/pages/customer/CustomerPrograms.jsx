import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerLayout from '@/components/CustomerLayout';
import { customerAPI } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Calendar, User, Clock } from 'lucide-react';

export default function CustomerPrograms() {
  return (
    <CustomerLayout>
      {() => <ProgramsContent />}
    </CustomerLayout>
  );
}

function ProgramsContent() {
  const navigate = useNavigate();
  const [programs, setPrograms] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [pRes, cRes] = await Promise.all([
        customerAPI.programs(filter || null),
        customerAPI.categories(),
      ]);
      setPrograms(pRes.data);
      setCategories(cRes.data);
    } catch {} finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div data-testid="customer-programs-page" className="px-4 sm:px-6 lg:px-12 py-8 max-w-[1200px] mx-auto">
      <div className="mb-8">
        <h1 className="font-heading font-extrabold text-white text-4xl sm:text-5xl uppercase tracking-tight">Programs</h1>
        <p className="text-zinc-500 font-body mt-2 text-base">Explore our martial arts & fitness programs</p>
      </div>

      {/* Category Filter Pills */}
      <div className="flex flex-wrap gap-2 mb-8">
        <button data-testid="filter-all" onClick={() => setFilter('')}
          className={`px-4 py-1.5 rounded-sm text-xs font-heading uppercase tracking-wider transition-all ${!filter ? 'bg-red-600 text-white' : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'}`}>
          All
        </button>
        {categories.map(c => (
          <button key={c.category_id} data-testid={`filter-${c.category_id}`}
            onClick={() => setFilter(c.category_id)}
            className={`px-4 py-1.5 rounded-sm text-xs font-heading uppercase tracking-wider transition-all ${filter === c.category_id ? 'bg-red-600 text-white' : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'}`}>
            {c.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : programs.length === 0 ? (
        <div className="border border-dashed border-zinc-800 rounded-sm p-16 text-center">
          <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wider mb-2">No Programs Available</h3>
          <p className="text-zinc-500 font-body text-sm">
            No programs have been set up at this location yet. Please check back later or contact the gym for more information.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {programs.map((p, i) => (
            <div key={p.program_id} data-testid={`program-card-${p.program_id}`}
              className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-6 hover:border-red-600/30 transition-all opacity-0 animate-fade-in-up"
              style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-start justify-between mb-3">
                <Badge className="bg-red-600/10 text-red-400 rounded-sm font-heading uppercase text-[10px] border-0">{p.category_name}</Badge>
                <Badge className="bg-zinc-800 text-zinc-300 rounded-sm font-heading uppercase text-[10px] border-0">{p.difficulty_level}</Badge>
              </div>
              <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wide mb-2">{p.name}</h3>
              {p.description && <p className="text-zinc-500 text-sm font-body mb-4 line-clamp-2">{p.description}</p>}
              <div className="space-y-2 mb-4">
                {p.schedule_summary && (
                  <div className="flex items-center gap-2 text-zinc-400 text-xs">
                    <Clock className="w-3.5 h-3.5" strokeWidth={1.5} />
                    <span className="font-body">{p.schedule_summary}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-zinc-400 text-xs">
                  <User className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span className="font-body">{p.instructor_name}</span>
                </div>
              </div>
              <button data-testid={`book-program-${p.program_id}`}
                onClick={() => navigate(`/customer/schedule?program=${p.program_id}`)}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-xs transition-all active:scale-95 flex items-center justify-center gap-2">
                <Calendar className="w-3.5 h-3.5" strokeWidth={1.5} /> View Schedule & Book
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
