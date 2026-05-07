import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import EmployeeSelfProfilePanel from '@/pages/employee/EmployeeSelfProfilePanel';

export default function CoachEmployeeProfilePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#09090b]">
      <div className="px-6 sm:px-8 lg:px-12 py-6 max-w-[1440px] mx-auto">
        <button
          type="button"
          onClick={() => navigate('/coach')}
          className="flex items-center gap-2 text-zinc-500 hover:text-white font-heading uppercase tracking-wider text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} /> Back to Coach Portal
        </button>
      </div>
      <EmployeeSelfProfilePanel />
    </div>
  );
}

