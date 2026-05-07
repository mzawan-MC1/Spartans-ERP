import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { authAPI, locationAPI } from '@/lib/api';
import TopNav from '@/components/TopNav';
import EmployeeMasterProfilePanel from '@/pages/employee/EmployeeMasterProfilePanel';

export default function OwnerStaffMasterProfilePage() {
  const navigate = useNavigate();
  const { staffId } = useParams();
  const [searchParams] = useSearchParams();
  const locationId = searchParams.get('location_id') || null;

  const [user, setUser] = useState(null);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [meRes, locRes] = await Promise.all([authAPI.getMe(), locationAPI.list()]);
        if (!mounted) return;
        setUser(meRes.data);
        setLocations(locRes.data || []);
      } catch {
        if (mounted) navigate('/login', { replace: true });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col">
      <TopNav user={user} locations={locations} currentLocation={locations.find(l => l.location_id === locationId) || null} />
      <main className="flex-1">
        <EmployeeMasterProfilePanel staffId={staffId} locationId={locationId} />
      </main>
    </div>
  );
}

