import ManagerLayout from '@/components/ManagerLayout';

export default function EmployeeAttendancePage() {
  return (
    <ManagerLayout activePage="employee-attendance">
      {() => (
        <div className="p-6 sm:p-8 lg:p-10 max-w-[1200px]">
          <h1 className="font-heading font-extrabold text-white text-4xl sm:text-5xl uppercase tracking-tight">Attendance</h1>
          <p className="text-zinc-500 font-body mt-1 text-base">Employee attendance (branch-scoped)</p>
          <div className="mt-8 border border-dashed border-zinc-800 rounded-sm p-12 text-center">
            <p className="text-zinc-500 font-heading uppercase tracking-wider text-sm">
              Employee attendance tracking is not available yet.
            </p>
          </div>
        </div>
      )}
    </ManagerLayout>
  );
}

