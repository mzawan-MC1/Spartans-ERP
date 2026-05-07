import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { locationAPI, authAPI, cmsAPI } from '@/lib/api';
import TopNav from '@/components/TopNav';
import FileUpload from '@/components/FileUpload';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Save } from 'lucide-react';

const TIMEZONES = [
  'Asia/Dubai', 'Asia/Riyadh', 'Asia/Muscat', 'Asia/Qatar',
  'Asia/Bahrain', 'Asia/Kuwait', 'Europe/London', 'America/New_York',
];

const CURRENCIES = ['AED', 'SAR', 'OMR', 'QAR', 'BHD', 'KWD', 'USD', 'EUR', 'GBP'];

// Helper to display image dimensions
const ImageDimensions = ({ url }) => {
  const [dims, setDims] = useState(null);

  useEffect(() => {
    if (!url) {
      setDims(null);
      return;
    }
    const img = new Image();
    // Handle both relative (backend) and absolute URLs
    const backendUrl = (process.env.REACT_APP_BACKEND_URL || '').trim().replace(/\/$/, '')
      || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:8000');
    const src = url.startsWith('/') ? `${backendUrl}${url}` : url;
    img.src = src;
    img.onload = () => setDims(`${img.naturalWidth} x ${img.naturalHeight}px`);
    img.onerror = () => setDims(null);
  }, [url]);

  if (!dims) return null;
  return <span className="text-xs text-zinc-500 ml-2 font-normal">({dims})</span>;
};

export default function LocationFormPage() {
  const navigate = useNavigate();
  const { locationId } = useParams();
  const isEdit = Boolean(locationId);

  const [user, setUser] = useState(null);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    address: '',
    city: '',
    country: 'UAE',
    phone: '',
    email: '',
    logo_url: '',
    timezone: 'Asia/Dubai',
    default_currency: 'AED',
    status: 'active',
    is_public: true,
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const userRes = await authAPI.getMe();
        setUser(userRes.data);

        if (userRes.data.role !== 'OWNER') {
          navigate('/dashboard', { replace: true });
          return;
        }

        const locsRes = await locationAPI.list();
        setLocations(locsRes.data);

        if (isEdit) {
          const locRes = await locationAPI.get(locationId);
          setForm({
            name: locRes.data.name || '',
            address: locRes.data.address || '',
            city: locRes.data.city || '',
            country: locRes.data.country || 'UAE',
            phone: locRes.data.phone || '',
            email: locRes.data.email || '',
            logo_url: locRes.data.logo_url || '',
            timezone: locRes.data.timezone || 'Asia/Dubai',
            default_currency: locRes.data.default_currency || 'AED',
            status: locRes.data.status || 'active',
            is_public: locRes.data.is_public !== false, // default true if not set
          });
        }
      } catch (err) {
        if (err.response?.status === 401) navigate('/login', { replace: true });
        else if (err.response?.status === 404) {
          toast.error('Location not found');
          navigate('/dashboard', { replace: true });
        }
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [isEdit, locationId, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Location name is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        address: form.address,
        city: form.city,
        country: form.country,
        phone: form.phone,
        email: form.email,
        logo_url: form.logo_url || null,
        timezone: form.timezone,
        default_currency: form.default_currency,
        status: form.status,
      };

      if (isEdit) {
        await locationAPI.update(locationId, payload);
        // Also update is_public
        await cmsAPI.updateBranchPublic(locationId, { is_public: form.is_public });
        toast.success('Location updated');
      } else {
        const res = await locationAPI.create(payload);
        // Also update is_public
        await cmsAPI.updateBranchPublic(res.data.location_id, { is_public: form.is_public });
        toast.success('Location created');
      }
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col">
      <TopNav user={user} locations={locations} />

      <main className="flex-1 px-6 sm:px-8 lg:px-12 py-8 max-w-[1440px] mx-auto w-full">
        {/* Back Button */}
        <button
          data-testid="back-to-dashboard-btn"
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-zinc-500 hover:text-white font-heading uppercase tracking-wider text-sm mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          Back to Dashboard
        </button>

        {/* Header */}
        <div className="mb-10">
          <h1 className="font-heading font-extrabold text-white text-4xl sm:text-5xl uppercase tracking-tight">
            {isEdit ? 'Edit Location' : 'New Location'}
          </h1>
          <p className="text-zinc-500 font-body mt-2 text-base">
            {isEdit ? 'Update your gym branch details' : 'Add a new gym branch to your network'}
          </p>
        </div>

        {/* Form */}
        <form
          data-testid="location-form"
          onSubmit={handleSubmit}
          className="max-w-2xl bg-zinc-900/50 p-8 border border-zinc-800 rounded-sm"
        >
          <div className="space-y-6">
            {/* Name */}
            <div className="space-y-2">
              <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">
                Location Name *
              </Label>
              <Input
                data-testid="location-name-input"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder='e.g. "Spartans - Dubai Marina"'
                required
                className="bg-zinc-950 border-zinc-800 focus:border-red-600 focus:ring-1 focus:ring-red-600 rounded-sm text-white placeholder:text-zinc-600 h-11"
              />
            </div>

            {/* Address */}
            <div className="space-y-2">
              <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">
                Address
              </Label>
              <Input
                data-testid="location-address-input"
                value={form.address}
                onChange={(e) => updateField('address', e.target.value)}
                placeholder="Street address"
                className="bg-zinc-950 border-zinc-800 focus:border-red-600 focus:ring-1 focus:ring-red-600 rounded-sm text-white placeholder:text-zinc-600 h-11"
              />
            </div>

            {/* City + Country Row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">
                  City
                </Label>
                <Input
                  data-testid="location-city-input"
                  value={form.city}
                  onChange={(e) => updateField('city', e.target.value)}
                  placeholder="City"
                  className="bg-zinc-950 border-zinc-800 focus:border-red-600 focus:ring-1 focus:ring-red-600 rounded-sm text-white placeholder:text-zinc-600 h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">
                  Country
                </Label>
                <Input
                  data-testid="location-country-input"
                  value={form.country}
                  onChange={(e) => updateField('country', e.target.value)}
                  placeholder="Country"
                  className="bg-zinc-950 border-zinc-800 focus:border-red-600 focus:ring-1 focus:ring-red-600 rounded-sm text-white placeholder:text-zinc-600 h-11"
                />
              </div>
            </div>

            {/* Phone + Email Row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">
                  Phone
                </Label>
                <Input
                  data-testid="location-phone-input"
                  value={form.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  placeholder="+971-..."
                  className="bg-zinc-950 border-zinc-800 focus:border-red-600 focus:ring-1 focus:ring-red-600 rounded-sm text-white placeholder:text-zinc-600 h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">
                  Email
                </Label>
                <Input
                  data-testid="location-email-input"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="branch@spartans.ae"
                  className="bg-zinc-950 border-zinc-800 focus:border-red-600 focus:ring-1 focus:ring-red-600 rounded-sm text-white placeholder:text-zinc-600 h-11"
                />
              </div>
            </div>

            {/* Logo URL */}
            <div className="space-y-2">
              <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">
                Logo <ImageDimensions url={form.logo_url} />
              </Label>
              <FileUpload
                value={form.logo_url}
                onChange={(url) => updateField('logo_url', url)}
              />
            </div>

            {/* Visibility / Status */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 flex items-center gap-2 mt-8">
                <input 
                  type="checkbox" 
                  id="loc-is-public" 
                  checked={form.is_public} 
                  onChange={(e) => updateField('is_public', e.target.checked)} 
                  className="w-4 h-4 rounded-sm bg-zinc-950 border-zinc-800 text-red-600 focus:ring-red-600"
                />
                <label htmlFor="loc-is-public" className="text-zinc-400 text-sm cursor-pointer select-none">
                  Show on Public Website
                </label>
              </div>
            </div>

            {/* Timezone + Currency Row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">
                  Timezone
                </Label>
                <Select
                  value={form.timezone}
                  onValueChange={(v) => updateField('timezone', v)}
                >
                  <SelectTrigger
                    data-testid="location-timezone-select"
                    className="bg-zinc-950 border-zinc-800 focus:border-red-600 focus:ring-1 focus:ring-red-600 rounded-sm text-white h-11"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz} className="text-zinc-300 focus:bg-zinc-800 focus:text-white">
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">
                  Currency
                </Label>
                <Select
                  value={form.default_currency}
                  onValueChange={(v) => updateField('default_currency', v)}
                >
                  <SelectTrigger
                    data-testid="location-currency-select"
                    className="bg-zinc-950 border-zinc-800 focus:border-red-600 focus:ring-1 focus:ring-red-600 rounded-sm text-white h-11"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c} className="text-zinc-300 focus:bg-zinc-800 focus:text-white">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Status (edit only) */}
            {isEdit && (
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">
                  Status
                </Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => updateField('status', v)}
                >
                  <SelectTrigger
                    data-testid="location-status-select"
                    className="bg-zinc-950 border-zinc-800 focus:border-red-600 focus:ring-1 focus:ring-red-600 rounded-sm text-white h-11"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="active" className="text-zinc-300 focus:bg-zinc-800 focus:text-white">
                      Active
                    </SelectItem>
                    <SelectItem value="inactive" className="text-zinc-300 focus:bg-zinc-800 focus:text-white">
                      Inactive
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 mt-8 pt-6 border-t border-zinc-800">
            <button
              data-testid="cancel-location-btn"
              type="button"
              onClick={() => navigate('/dashboard')}
              className="bg-transparent border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white font-heading uppercase tracking-wide px-6 py-2.5 rounded-sm text-sm transition-all"
            >
              Cancel
            </button>
            <button
              data-testid="save-location-btn"
              type="submit"
              disabled={saving}
              className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-6 py-2.5 rounded-sm text-sm transition-all duration-200 active:scale-95 disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" strokeWidth={1.5} />
              )}
              {isEdit ? 'Update Location' : 'Create Location'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
