import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { customerAPI, authAPI } from '@/lib/api';
import { MapPin, Loader2 } from 'lucide-react';
import { useFavicon } from '@/hooks/useFavicon';

export default function LocationSelect() {
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const [locations, setLocations] = useState(routeLocation.state?.locations || []);
  const [loading, setLoading] = useState(!routeLocation.state?.locations);
  const [selecting, setSelecting] = useState(null);
  const faviconUrl = useFavicon();

  useEffect(() => {
    if (locations.length > 0) return;
    customerAPI.locations().then(r => setLocations(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, [locations.length]);

  const handleSelect = async (locId) => {
    setSelecting(locId);
    try {
      await customerAPI.switchLocation({ location_id: locId, set_as_primary: true });
      navigate('/customer', { replace: true });
    } catch {
      setSelecting(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <img src={faviconUrl} alt="Spartans Logo" className="w-10 h-10 object-contain rounded-sm" onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; e.target.nextElementSibling.classList.remove('hidden'); }} />
          <div className="w-10 h-10 bg-red-600 rounded-sm flex items-center justify-center hidden">
            <span className="font-heading font-extrabold text-white text-xl leading-none">S</span>
          </div>
          <div>
            <h1 className="font-heading font-bold text-white text-xl uppercase tracking-wider">Spartans</h1>
            <p className="text-zinc-600 text-[10px] uppercase tracking-[0.3em] font-heading">Martial Arts & Fitness</p>
          </div>
        </div>

        <h2 className="font-heading font-extrabold text-white text-3xl uppercase tracking-tight text-center mb-2">
          Select Your Gym
        </h2>
        <p className="text-zinc-500 font-body text-center mb-8">Choose your primary training location</p>

        {loading ? (
          <div className="flex justify-center py-10"><div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div data-testid="location-select-list" className="space-y-3">
            {locations.map((loc) => (
              <button key={loc.location_id} data-testid={`select-location-${loc.location_id}`}
                onClick={() => handleSelect(loc.location_id)}
                disabled={selecting !== null}
                className="w-full bg-zinc-900 border border-zinc-800 hover:border-red-600/50 rounded-sm p-5 flex items-center gap-4 transition-all text-left disabled:opacity-50">
                <div className="w-10 h-10 bg-zinc-800 rounded-sm flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5 text-red-500" strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-body font-medium text-sm">{loc.name}</p>
                  <p className="text-zinc-500 text-xs">{loc.city}{loc.address ? ` — ${loc.address}` : ''}</p>
                </div>
                {selecting === loc.location_id && <Loader2 className="w-4 h-4 text-red-600 animate-spin shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
