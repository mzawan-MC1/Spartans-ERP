import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ManagerLayout from '@/components/ManagerLayout';
import { locationAPI } from '@/lib/api';
import EmployeeMasterProfilePanel from '@/pages/employee/EmployeeMasterProfilePanel';

export default function StaffMasterProfilePage() {
  const { staffId } = useParams();
  const [locationId, setLocationId] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await locationAPI.list();
        if (!mounted) return;
        setLocationId(res.data?.[0]?.location_id || null);
      } catch {
        if (mounted) setLocationId(null);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <ManagerLayout activePage="staff">
      {() => <EmployeeMasterProfilePanel staffId={staffId} locationId={locationId} />}
    </ManagerLayout>
  );
}

