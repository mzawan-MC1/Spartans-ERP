import { useState, useEffect } from 'react';
import CustomerLayout from '@/components/CustomerLayout';
import { customerAPI } from '@/lib/api';
import MemberDocumentsPanel from '@/components/MemberDocumentsPanel';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import FileUpload from '@/components/FileUpload';
import { toast } from 'sonner';
import { Loader2, Save, MapPin } from 'lucide-react';

export default function CustomerProfile() {
  return (
    <CustomerLayout>
      {({ user, location, locations }) => <ProfileContent initialUser={user} location={location} locations={locations} />}
    </CustomerLayout>
  );
}

function ProfileContent({ initialUser, location, locations }) {
  const [form, setForm] = useState({
    first_name: '', last_name: '', phone: '', date_of_birth: '',
    emergency_contact_name: '', emergency_contact_phone: '', profile_image_url: '',
  });
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (initialUser) {
      const nameParts = (initialUser.name || '').split(' ');
      setForm({
        first_name: initialUser.first_name || nameParts[0] || '',
        last_name: initialUser.last_name || nameParts.slice(1).join(' ') || '',
        phone: initialUser.phone || '',
        date_of_birth: initialUser.date_of_birth || '',
        emergency_contact_name: initialUser.emergency_contact_name || '',
        emergency_contact_phone: initialUser.emergency_contact_phone || '',
        profile_image_url: initialUser.profile_image_url || '',
      });
    }
  }, [initialUser]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {};
      Object.entries(form).forEach(([k, v]) => {
        if (v !== '' && v !== null && v !== undefined) payload[k] = v;
      });
      if (Object.keys(payload).length === 0) { toast.error('Nothing to update'); setSaving(false); return; }
      await customerAPI.updateProfile(payload);
      toast.success('Profile updated');
    } catch (err) { toast.error(err.response?.data?.detail || 'Update failed'); }
    finally { setSaving(false); }
  };

  const handleMakePrimary = async (locId) => {
    setSwitching(true);
    try {
      await customerAPI.switchLocation({ location_id: locId, set_as_primary: true });
      toast.success('Primary gym updated');
      window.location.reload();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    finally { setSwitching(false); }
  };

  return (
    <div data-testid="customer-profile-page" className="px-4 sm:px-6 lg:px-12 py-8 max-w-[900px] mx-auto">
      <div className="mb-8">
        <h1 className="font-heading font-extrabold text-white text-4xl sm:text-5xl uppercase tracking-tight">Profile</h1>
        <p className="text-zinc-500 font-body mt-2 text-base">Manage your personal information</p>
      </div>

      <div className="space-y-8">
        {/* Profile Image */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-6">
          <h2 className="font-heading font-bold text-white text-sm uppercase tracking-wider mb-4">Profile Photo</h2>
          <div className="max-w-xs">
            <FileUpload
              value={form.profile_image_url}
              onChange={(url) => setForm({ ...form, profile_image_url: url || '' })}
            />
          </div>
        </div>

        {/* Personal Info */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-6">
          <h2 className="font-heading font-bold text-white text-sm uppercase tracking-wider mb-4">Personal Information</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">First Name</Label>
                <Input data-testid="profile-first-name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  placeholder="First name" className="bg-zinc-950 border-zinc-800 focus:border-red-600 rounded-sm text-white h-10" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Last Name</Label>
                <Input data-testid="profile-last-name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  placeholder="Last name" className="bg-zinc-950 border-zinc-800 focus:border-red-600 rounded-sm text-white h-10" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Phone</Label>
                <Input data-testid="profile-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+971-..." className="bg-zinc-950 border-zinc-800 focus:border-red-600 rounded-sm text-white h-10" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Date of Birth</Label>
                <Input data-testid="profile-dob" type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                  className="bg-zinc-950 border-zinc-800 focus:border-red-600 rounded-sm text-white h-10" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Email</Label>
              <Input value={initialUser?.email || ''} disabled
                className="bg-zinc-950 border-zinc-800 rounded-sm text-zinc-500 h-10" />
            </div>
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-6">
          <h2 className="font-heading font-bold text-white text-sm uppercase tracking-wider mb-4">Emergency Contact</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Contact Name</Label>
              <Input data-testid="profile-emergency-name" value={form.emergency_contact_name}
                onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })}
                placeholder="Emergency contact" className="bg-zinc-950 border-zinc-800 focus:border-red-600 rounded-sm text-white h-10" />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Contact Phone</Label>
              <Input data-testid="profile-emergency-phone" value={form.emergency_contact_phone}
                onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })}
                placeholder="+971-..." className="bg-zinc-950 border-zinc-800 focus:border-red-600 rounded-sm text-white h-10" />
            </div>
          </div>
        </div>

        {/* Gym Location */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-6">
          <h2 className="font-heading font-bold text-white text-sm uppercase tracking-wider mb-4">Gym Location</h2>
          <div className="flex items-center gap-3 mb-4">
            <MapPin className="w-4 h-4 text-red-500" strokeWidth={1.5} />
            <span className="text-white font-body text-sm">{location?.name}</span>
            <span className="text-zinc-600 text-xs">(Primary)</span>
          </div>
          <div className="space-y-2">
            {locations.filter(l => l.location_id !== location?.location_id).map(l => (
              <div key={l.location_id} className="flex items-center justify-between p-3 bg-zinc-950/50 border border-zinc-800/50 rounded-sm">
                <span className="text-zinc-400 text-sm font-body">{l.name} — {l.city}</span>
                <button onClick={() => handleMakePrimary(l.location_id)} disabled={switching}
                  className="text-red-500 text-xs font-heading uppercase tracking-wider hover:text-red-400 transition-colors disabled:opacity-50">
                  Set as Primary
                </button>
              </div>
            ))}
          </div>
        </div>

        <MemberDocumentsPanel memberId={initialUser?.member_id} locationId={location?.location_id} />

        {/* Save */}
        <button data-testid="save-profile-btn" onClick={handleSave} disabled={saving}
          className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-6 py-3 rounded-sm text-sm transition-all disabled:opacity-50 flex items-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" strokeWidth={1.5} />}
          Save Profile
        </button>
      </div>
    </div>
  );
}
