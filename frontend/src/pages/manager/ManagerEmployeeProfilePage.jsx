import ManagerLayout from '@/components/ManagerLayout';
import EmployeeSelfProfilePanel from '@/pages/employee/EmployeeSelfProfilePanel';

export default function ManagerEmployeeProfilePage() {
  return (
    <ManagerLayout activePage="profile">
      {() => <EmployeeSelfProfilePanel />}
    </ManagerLayout>
  );
}

