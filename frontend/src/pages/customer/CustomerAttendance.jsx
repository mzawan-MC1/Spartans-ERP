import { useState, useEffect } from 'react';
import CustomerLayout from '@/components/CustomerLayout';
import { customerAPI } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Clock, BookOpen } from 'lucide-react';

export default function CustomerAttendance() {
  return (
    <CustomerLayout>
      {() => <AttendanceContent />}
    </CustomerLayout>
  );
}

function AttendanceContent() {
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [rRes, sRes] = await Promise.all([
          customerAPI.attendance(),
          customerAPI.attendanceSummary(),
        ]);
        setRecords(rRes.data);
        setSummary(sRes.data);
      } catch {} finally { setLoading(false); }
    };
    load();
  }, []);

  const statusIcon = (status) => {
    switch (status) {
      case 'present': return <CheckCircle2 className="w-4 h-4 text-emerald-400" strokeWidth={1.5} />;
      case 'absent': return <XCircle className="w-4 h-4 text-red-400" strokeWidth={1.5} />;
      case 'late': return <Clock className="w-4 h-4 text-amber-400" strokeWidth={1.5} />;
      default: return null;
    }
  };
  const statusColor = (status) => {
    switch (status) {
      case 'present': return 'bg-emerald-500/20 text-emerald-400';
      case 'absent': return 'bg-red-500/20 text-red-400';
      case 'late': return 'bg-amber-500/20 text-amber-400';
      default: return 'bg-zinc-800 text-zinc-400';
    }
  };

  return (
    <div data-testid="customer-attendance-page" className="px-4 sm:px-6 lg:px-12 py-8 max-w-[1200px] mx-auto">
      <div className="mb-8">
        <h1 className="font-heading font-extrabold text-white text-4xl sm:text-5xl uppercase tracking-tight">Attendance</h1>
        <p className="text-zinc-500 font-body mt-2 text-base">Your class attendance history</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          {/* Summary */}
          {summary && (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
              <div className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-sm">
                <span className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Total Attended</span>
                <p className="font-heading font-extrabold text-3xl text-emerald-400 mt-1">{summary.total_attended}</p>
              </div>
              <div className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-sm">
                <span className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">This Month</span>
                <p className="font-heading font-extrabold text-3xl text-red-500 mt-1">{summary.this_month}</p>
              </div>
              {summary.per_program?.length > 0 && (
                <div className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-sm col-span-2 lg:col-span-1">
                  <span className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider mb-2 block">Per Program</span>
                  <div className="space-y-1">
                    {summary.per_program.map(p => (
                      <div key={p.program_id} className="flex items-center justify-between">
                        <span className="text-zinc-400 text-xs font-body truncate">{p.name}</span>
                        <span className="text-white text-xs font-heading font-bold">{p.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Records */}
          <h2 className="font-heading font-bold text-white text-lg uppercase tracking-wider mb-4">History</h2>
          {records.length === 0 ? (
            <div className="border border-dashed border-zinc-800 rounded-sm p-12 text-center">
              <p className="text-zinc-500 font-heading uppercase tracking-wider text-sm">No attendance records yet</p>
            </div>
          ) : (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left p-4 text-zinc-500 font-heading uppercase tracking-wider text-xs">Date</th>
                    <th className="text-left p-4 text-zinc-500 font-heading uppercase tracking-wider text-xs">Program</th>
                    <th className="text-center p-4 text-zinc-500 font-heading uppercase tracking-wider text-xs">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => (
                    <tr key={r.record_id || i} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                      <td className="p-4 text-zinc-300 text-sm font-body">
                        {new Date(r.attendance_date_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        <span className="text-zinc-600 ml-1">{r.attendance_date_time.split('T')[1]?.slice(0, 5)}</span>
                      </td>
                      <td className="p-4 text-white text-sm font-body">{r.program_name}</td>
                      <td className="p-4 text-center">
                        <Badge className={`rounded-sm font-heading uppercase text-[10px] border-0 inline-flex items-center gap-1 ${statusColor(r.status)}`}>
                          {statusIcon(r.status)} {r.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
