import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import TopNav from '@/components/TopNav';
import { authAPI, locationAPI } from '@/lib/api';
import { AddMemberWizard } from '@/pages/manager/AddMemberPage';

export default function OwnerAddMemberPage() {
  const navigate = useNavigate();
  const { memberId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [user, setUser] = useState(null);
  const [locations, setLocations] = useState([]);
  const [currentLocation, setCurrentLocation] = useState(null);

  const locationId = useMemo(() => searchParams.get('location_id') || currentLocation?.location_id || '', [currentLocation?.location_id, searchParams]);
  const locationQuery = useMemo(() => (locationId ? `?location_id=${encodeURIComponent(locationId)}` : ''), [locationId]);

  useEffect(() => {
    const load = async () => {
      try {
        const [meRes, locRes] = await Promise.all([authAPI.getMe(), locationAPI.list()]);
        setUser(meRes.data);
        setLocations(locRes.data || []);

        const qp = searchParams.get('location_id');
        const initial = (locRes.data || []).find((l) => l.location_id === qp) || (locRes.data || [])[0] || null;
        setCurrentLocation(initial);
      } catch {
        navigate('/login', { replace: true });
      }
    };
    load();
  }, [navigate, searchParams]);

  useEffect(() => {
    if (!currentLocation) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('location_id', currentLocation.location_id);
      return next;
    }, { replace: true });
  }, [currentLocation, setSearchParams]);

  const handleLocationSwitch = (loc) => {
    if (!loc?.location_id) return;
    setCurrentLocation(loc);
    if (memberId) {
      navigate(`/owner/members/${memberId}/edit?location_id=${encodeURIComponent(loc.location_id)}`, { replace: true });
    } else {
      navigate(`/owner/members/new?location_id=${encodeURIComponent(loc.location_id)}`, { replace: true });
    }
  };

  if (!locationId) {
    return (
      <div className="min-h-screen bg-[#09090b]">
        <TopNav user={user} locations={locations} currentLocation={currentLocation} onLocationSwitch={handleLocationSwitch} />
        <div className="p-6 sm:p-8 lg:p-10 max-w-4xl mx-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center text-zinc-400">
            Select a branch from the top before creating or editing a member.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b]">
      <TopNav user={user} locations={locations} currentLocation={currentLocation} onLocationSwitch={handleLocationSwitch} />
      <AddMemberWizard
        locationId={locationId}
        basePath="/owner/members"
        locationQuery={locationQuery}
      />
    </div>
  );
}
