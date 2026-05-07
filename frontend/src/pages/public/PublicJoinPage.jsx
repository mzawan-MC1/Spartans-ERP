import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, User, Heart, CreditCard, FileText, Check, Loader2, MapPin, Eye, EyeOff } from 'lucide-react';
import DOMPurify from 'dompurify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PublicLayout from '@/components/PublicLayout';
import { publicAPI, publicMemberAPI, uploadAPI, paymentsAPI } from '@/lib/api';
import api from '@/lib/api';

const STEPS = [
  { id: 'personal', label: 'Personal', icon: User },
  { id: 'medical', label: 'Medical', icon: Heart },
  { id: 'membership', label: 'Plan', icon: CreditCard },
  { id: 'agreement', label: 'Agreement', icon: FileText },
  { id: 'payment', label: 'Payment', icon: CreditCard },
];

export default function PublicJoinPage() {
  const { i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const locationId = searchParams.get('location');
  const [siteSettings, setSiteSettings] = useState(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [locationInfo, setLocationInfo] = useState(null);
  const [agreements, setAgreements] = useState([]);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [termsPage, setTermsPage] = useState(null);
  const [termsLoading, setTermsLoading] = useState(false);

  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    password: '',
    gender: '',
    address: '',
    accept_terms: false,
  });
  const activeAgreement = agreements?.length
    ? [...agreements].sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')))[0]
    : null;

  const sanitizeHtml = (content) => {
    const purifyConfig = {
      FORBID_ATTR: ['style'],
      ADD_TAGS: ['iframe'],
      ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling'],
    };
    if (!content) return '';
    if (/<[a-z][\s\S]*>/i.test(content)) return DOMPurify.sanitize(content, purifyConfig);
    const sanitized = DOMPurify.sanitize(content, purifyConfig);
    const paragraphs = sanitized
      .split(/\n\s*\n/)
      .map(p => `<p>${p.replace(/\n/g, '<br />')}</p>`)
      .join('');
    return paragraphs;
  };

  const openTerms = async () => {
    setTermsOpen(true);
    if (termsPage || termsLoading) return;
    setTermsLoading(true);
    try {
      const res = await publicAPI.getPage('terms');
      setTermsPage(res.data);
    } catch {
      toast.error('Unable to load Terms & Conditions');
    } finally {
      setTermsLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const settingsRes = await publicAPI.getSiteSettings().catch(() => ({ data: null }));
        if (mounted) setSiteSettings(settingsRes.data);
        if (!locationId) {
          toast.error('Location is required');
          navigate('/', { replace: true });
          return;
        }
        const res = await publicMemberAPI.getLocationInfo(locationId);
        if (!mounted) return;
        setLocationInfo(res.data?.location || null);
        setAgreements(res.data?.agreements || []);
      } catch {
        if (mounted) toast.error('Unable to load location info');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [locationId, navigate, i18n.language]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.accept_terms) {
      toast.error('You must agree to the Terms & Conditions');
      return;
    }
    if (!form.gender) {
      toast.error('Gender is required');
      return;
    }
    setSubmitting(true);
    try {
      let profile_photo_url = null;
      if (photoFile) {
        const up = await uploadAPI.upload(photoFile);
        profile_photo_url = up.data?.url || up.data?.file_url || null;
      }

      const agreement_id = activeAgreement?.agreement_id || null;
      await publicMemberAPI.register({
        full_name: form.full_name,
        gender: form.gender,
        dob: '',
        phone: form.phone,
        email: form.email,
        password: form.password,
        address: form.address,
        profile_photo_url,
        accept_terms: true,
        agreement_id,
      }, locationId);

      toast.success('Registration successful. Please log in.');
      navigate('/login', { replace: true, state: { email: form.email } });
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (typeof detail === 'string' && detail.toLowerCase().includes('email already registered')) {
        toast.error(detail);
        navigate('/login', { replace: true, state: { email: form.email } });
        return;
      }
      toast.error(detail || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <PublicLayout siteSettings={siteSettings}>
        <div className="min-h-[calc(100vh-80px)] bg-zinc-950 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout siteSettings={siteSettings}>
      <div className="min-h-[calc(100vh-80px)] bg-zinc-950">
        <div className="max-w-2xl mx-auto px-4 py-10">
          <Link
            to="/branches"
            className="text-zinc-400 hover:text-white text-sm flex items-center gap-2 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>

          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white">Create Your Account</CardTitle>
              {locationInfo?.name && (
                <div className="text-zinc-400 text-sm flex items-center gap-2 mt-2">
                  <MapPin className="w-4 h-4" />
                  {locationInfo.name}
                </div>
              )}
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-zinc-300">Full name</Label>
                  <Input
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    className="bg-zinc-950 border-zinc-800 text-white"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-zinc-300">Phone number</Label>
                    <Input
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="bg-zinc-950 border-zinc-800 text-white"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-300">Email</Label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="bg-zinc-950 border-zinc-800 text-white"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-300">Password</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="bg-zinc-950 border-zinc-800 text-white pr-10"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-300">Gender</Label>
                  <select
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 text-white px-3 py-2 rounded-sm"
                    required
                  >
                    <option value="" disabled>Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-300">Address</Label>
                  <Textarea
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="bg-zinc-950 border-zinc-800 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-300">Profile photo</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                    className="bg-zinc-950 border-zinc-800 text-white file:text-zinc-300"
                  />
                </div>

                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={form.accept_terms}
                    onCheckedChange={(v) => setForm({ ...form, accept_terms: !!v })}
                  />
                  <div className="text-sm text-zinc-300 leading-snug">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>I agree to the Terms & Conditions</span>
                      <button
                        type="button"
                        onClick={() => setAgreementOpen(true)}
                        className="text-red-400 hover:text-red-300 underline underline-offset-4"
                      >
                        View Agreement
                      </button>
                      <span className="text-zinc-600">•</span>
                      <button
                        type="button"
                        onClick={openTerms}
                        className="text-red-400 hover:text-red-300 underline underline-offset-4"
                      >
                        Read Terms & Conditions
                      </button>
                    </div>
                  </div>
                </div>

                <Button type="submit" className="w-full bg-red-600 hover:bg-red-700" disabled={submitting}>
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Create account
                </Button>
              </form>
            </CardContent>
          </Card>

          <Dialog open={agreementOpen} onOpenChange={setAgreementOpen}>
            <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-4xl w-[95vw] overflow-x-hidden">
              <DialogHeader>
                <DialogTitle>
                  {activeAgreement?.title || 'Agreement'}
                  {activeAgreement?.version ? ` — v${activeAgreement.version}` : ''}
                </DialogTitle>
              </DialogHeader>
              <div className="max-h-[70vh] overflow-y-auto overflow-x-hidden rounded-md border border-zinc-800 bg-zinc-950 p-4">
                {activeAgreement?.content_html ? (
                  <div
                    className="prose prose-invert max-w-none w-full break-words whitespace-normal overflow-x-hidden prose-pre:whitespace-pre-wrap prose-pre:break-words prose-code:break-words prose-img:max-w-full prose-img:h-auto prose-table:w-full prose-table:table-fixed prose-p:text-zinc-200 prose-li:text-zinc-200 prose-strong:text-white prose-a:text-red-300"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(activeAgreement.content_html) }}
                  />
                ) : (
                  <div className="text-sm text-zinc-300">
                    No active agreement is available for this location.
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
            <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-4xl w-[95vw] overflow-x-hidden">
              <DialogHeader>
                <DialogTitle>{termsPage?.title || 'Terms & Conditions'}</DialogTitle>
              </DialogHeader>
              <div className="max-h-[70vh] overflow-y-auto overflow-x-hidden rounded-md border border-zinc-800 bg-zinc-950 p-4">
                {termsLoading ? (
                  <div className="text-sm text-zinc-400">Loading…</div>
                ) : termsPage?.content ? (
                  <div
                    className="prose prose-invert max-w-none w-full break-words whitespace-normal overflow-x-hidden prose-pre:whitespace-pre-wrap prose-pre:break-words prose-code:break-words prose-img:max-w-full prose-img:h-auto prose-table:w-full prose-table:table-fixed prose-p:text-zinc-200 prose-li:text-zinc-200 prose-strong:text-white prose-a:text-red-300"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(termsPage.content) }}
                  />
                ) : (
                  <div className="text-sm text-zinc-300">Terms page not found.</div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </PublicLayout>
  );
}

function LegacyPublicJoinPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const locationId = searchParams.get('location');
  
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  
  // Location data
  const [locationInfo, setLocationInfo] = useState(null);
  const [paymentPlans, setPaymentPlans] = useState([]);
  const [agreements, setAgreements] = useState([]);
  const [programs, setPrograms] = useState([]);
  
  // Form data
  const [personalData, setPersonalData] = useState({
    full_name: '',
    gender: '',
    dob: '',
    phone: '',
    email: '',
    address: '',
  });
  
  const [emergencyContact, setEmergencyContact] = useState({
    name: '',
    phone: '',
    relation: '',
  });
  
  const [medicalData, setMedicalData] = useState({
    conditions: '',
    injuries: '',
    allergies: '',
    medications: '',
    notes: '',
    doctor_name: '',
    doctor_phone: '',
    consent: false,
  });
  
  const [membershipData, setMembershipData] = useState({
    type: 'full_access',
    program_id: '',
    payment_plan_id: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    auto_renew: false,
  });
  
  const [agreementData, setAgreementData] = useState({
    agreement_id: '',
    checkbox_agreed: false,
    signer_name: '',
  });
  
  const [paymentMethod, setPaymentMethod] = useState('');
  const [availablePaymentMethods, setAvailablePaymentMethods] = useState([]);
  
  // Created data
  const [createdMember, setCreatedMember] = useState(null);

  // Load location info
  useEffect(() => {
    const loadLocationInfo = async () => {
      if (!locationId) {
        toast.error('Location ID is required');
        return;
      }
      
      try {
        setLoading(true);
        const res = await publicMemberAPI.getLocationInfo(locationId);
        setLocationInfo(res.data.location);
        setPaymentPlans(res.data.payment_plans || []);
        setAgreements(res.data.agreements || []);
        setPrograms(res.data.programs || []);
        
        if (res.data.agreements?.length > 0) {
          setAgreementData(prev => ({ ...prev, agreement_id: res.data.agreements[0].agreement_id }));
        }
        
        // Fetch public payment methods
        try {
          const methodsRes = await api.get('/payment-methods', { params: { location_id: locationId } });
          const methods = (methodsRes.data || []).filter(m => m.provider !== 'cash'); // Public join shouldn't usually offer cash, unless configured
          setAvailablePaymentMethods(methods);
          if (methods.length > 0) setPaymentMethod(methods[0].provider);
        } catch (e) {
          console.error("Failed to load payment methods", e);
        }
      } catch (err) {
        toast.error('Failed to load location information');
      } finally {
        setLoading(false);
      }
    };
    
    loadLocationInfo();
  }, [locationId]);

  // Calculate end date based on payment plan
  useEffect(() => {
    if (membershipData.payment_plan_id && membershipData.start_date) {
      const plan = paymentPlans.find(p => p.plan_id === membershipData.payment_plan_id);
      if (plan) {
        const start = new Date(membershipData.start_date);
        let end = new Date(start);
        const cycle = (plan.billing_cycle || plan.billing_period || '').toLowerCase();
        switch (cycle) {
          case 'single':
          case 'daily':
          case 'per class':
            end.setDate(end.getDate() + 1);
            break;
          case 'weekly':
            end.setDate(end.getDate() + 7);
            break;
          case 'monthly':
            end.setMonth(end.getMonth() + 1);
            break;
          case 'quarterly':
          case '3 months':
            end.setMonth(end.getMonth() + 3);
            break;
          case '4 months':
            end.setMonth(end.getMonth() + 4);
            break;
          case '6 months':
            end.setMonth(end.getMonth() + 6);
            break;
          case 'yearly':
          case 'annual':
            end.setFullYear(end.getFullYear() + 1);
            break;
          default:
            end.setMonth(end.getMonth() + 1);
        }
        setMembershipData(prev => ({ ...prev, end_date: end.toISOString().split('T')[0] }));
      }
    }
  }, [membershipData.payment_plan_id, membershipData.start_date, paymentPlans]);

  const validateStep = () => {
    switch (currentStep) {
      case 0:
        if (!personalData.full_name.trim()) {
          toast.error('Full name is required');
          return false;
        }
        if (!personalData.email.trim()) {
          toast.error('Email is required for account creation');
          return false;
        }
        return true;
      case 1:
        if (!medicalData.consent) {
          toast.error('Medical consent is required');
          return false;
        }
        return true;
      case 2:
        if (!membershipData.payment_plan_id) {
          toast.error('Please select a payment plan');
          return false;
        }
        return true;
      case 3:
        if (!agreementData.checkbox_agreed) {
          toast.error('Agreement must be accepted');
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const handleNext = async () => {
    if (!validateStep()) return;
    
    // Register member after agreement step
    if (currentStep === 3 && !createdMember) {
      try {
        setSubmitting(true);
        const res = await publicMemberAPI.register({
          ...personalData,
          emergency_contact: emergencyContact,
          medical: medicalData,
        }, locationId);
        setCreatedMember(res.data);
        toast.success('Registration successful! Check your email for login credentials.');
      } catch (err) {
        toast.error(err.response?.data?.detail || 'Registration failed');
        return;
      } finally {
        setSubmitting(false);
      }
    }
    
    setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const handleComplete = async () => {
    if (!createdMember) {
      toast.error('Please complete registration first');
      return;
    }
    
    // If a payment method is selected, initiate payment
    if (paymentMethod) {
      try {
        setSubmitting(true);
        // Ensure membership is created first
        let memberId = createdMember.member_id;
        let membershipId = null;
        
        // Fetch the memberships to get the active/pending one
        const membershipsRes = await publicMemberAPI.getMemberships(memberId, locationId);
        if (membershipsRes.data.memberships && membershipsRes.data.memberships.length > 0) {
           membershipId = membershipsRes.data.memberships[0].membership_id;
        } else {
           toast.error('Membership not found. Please login to pay.');
           navigate('/login');
           return;
        }
        
        const plan = paymentPlans.find(p => p.plan_id === membershipData.payment_plan_id);
        const amount = plan?.price || 0;
        
        // Use the public initiate endpoint or regular one if exposed
        const res = await paymentsAPI.initiate({
          member_id: memberId,
          membership_id: membershipId,
          method: paymentMethod,
          amount: amount,
          currency: plan?.currency || 'AED'
        }, locationId);
        
        if (res.data.checkout_url || res.data.checkout_data?.checkout_url) {
          toast.success('Redirecting to secure checkout...');
          const url = res.data.checkout_url || res.data.checkout_data.checkout_url;
          window.location.href = url;
          return;
        }
      } catch (err) {
        toast.error('Payment initiation failed. Please login to complete payment.');
        setSubmitting(false);
        navigate('/login');
        return;
      }
    }
    
    toast.success('Registration complete! Please login with your credentials to access the member portal.');
    navigate('/login');
  };

  const visiblePaymentPlans = paymentPlans.filter(p => ['full_access', 'only_gym'].includes(p.membership_type || 'full_access'));
  const selectedPlan = visiblePaymentPlans.find(p => p.plan_id === membershipData.payment_plan_id);

  if (!locationId) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Card className="bg-zinc-900 border-zinc-800 max-w-md">
          <CardContent className="p-6 text-center">
            <MapPin className="h-12 w-12 text-orange-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-white mb-2">Location Required</h1>
            <p className="text-zinc-400">Please use a valid join link with a location parameter.</p>
            <p className="text-zinc-500 text-sm mt-2">Example: /join?location=loc_xxxxx</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white">Join {locationInfo?.name}</h1>
          <p className="text-zinc-400 mt-2">Complete your registration to become a member</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === currentStep;
            const isComplete = index < currentStep;
            
            return (
              <div key={step.id} className="flex items-center">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors ${
                  isActive ? 'border-orange-500 bg-orange-500/20 text-orange-500' :
                  isComplete ? 'border-green-500 bg-green-500/20 text-green-500' :
                  'border-zinc-700 text-zinc-500'
                }`}>
                  {isComplete ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                {index < STEPS.length - 1 && (
                  <div className={`w-8 h-0.5 ${isComplete ? 'bg-green-500' : 'bg-zinc-700'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-6">
            {/* Step 0: Personal */}
            {currentStep === 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-white">Personal Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label htmlFor="full_name">Full Name *</Label>
                    <Input
                      id="full_name"
                      value={personalData.full_name}
                      onChange={(e) => setPersonalData({ ...personalData, full_name: e.target.value })}
                      className="bg-zinc-800 border-zinc-700 mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={personalData.email}
                      onChange={(e) => setPersonalData({ ...personalData, email: e.target.value })}
                      className="bg-zinc-800 border-zinc-700 mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={personalData.phone}
                      onChange={(e) => setPersonalData({ ...personalData, phone: e.target.value })}
                      className="bg-zinc-800 border-zinc-700 mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="gender">Gender</Label>
                    <Select value={personalData.gender} onValueChange={(v) => setPersonalData({ ...personalData, gender: v })}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 mt-1">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="dob">Date of Birth</Label>
                    <Input
                      id="dob"
                      type="date"
                      value={personalData.dob}
                      onChange={(e) => setPersonalData({ ...personalData, dob: e.target.value })}
                      className="bg-zinc-800 border-zinc-700 mt-1"
                    />
                  </div>
                </div>
                
                <div className="pt-4 border-t border-zinc-800">
                  <h3 className="text-md font-semibold text-white mb-3">Emergency Contact</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Input
                      placeholder="Name"
                      value={emergencyContact.name}
                      onChange={(e) => setEmergencyContact({ ...emergencyContact, name: e.target.value })}
                      className="bg-zinc-800 border-zinc-700"
                    />
                    <Input
                      placeholder="Phone"
                      value={emergencyContact.phone}
                      onChange={(e) => setEmergencyContact({ ...emergencyContact, phone: e.target.value })}
                      className="bg-zinc-800 border-zinc-700"
                    />
                    <Input
                      placeholder="Relation"
                      value={emergencyContact.relation}
                      onChange={(e) => setEmergencyContact({ ...emergencyContact, relation: e.target.value })}
                      className="bg-zinc-800 border-zinc-700"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 1: Medical */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-white">Medical Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Textarea
                    placeholder="Medical conditions (if any)"
                    value={medicalData.conditions}
                    onChange={(e) => setMedicalData({ ...medicalData, conditions: e.target.value })}
                    className="bg-zinc-800 border-zinc-700"
                    rows={2}
                  />
                  <Textarea
                    placeholder="Previous injuries (if any)"
                    value={medicalData.injuries}
                    onChange={(e) => setMedicalData({ ...medicalData, injuries: e.target.value })}
                    className="bg-zinc-800 border-zinc-700"
                    rows={2}
                  />
                  <Input
                    placeholder="Allergies"
                    value={medicalData.allergies}
                    onChange={(e) => setMedicalData({ ...medicalData, allergies: e.target.value })}
                    className="bg-zinc-800 border-zinc-700"
                  />
                  <Input
                    placeholder="Current medications"
                    value={medicalData.medications}
                    onChange={(e) => setMedicalData({ ...medicalData, medications: e.target.value })}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
                <div className="flex items-center space-x-2 pt-4">
                  <Checkbox
                    id="consent"
                    checked={medicalData.consent}
                    onCheckedChange={(checked) => setMedicalData({ ...medicalData, consent: checked })}
                  />
                  <Label htmlFor="consent" className="text-sm">
                    I consent to share this medical information for safety purposes *
                  </Label>
                </div>
              </div>
            )}

            {/* Step 2: Membership */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-white">Select Your Plan</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {visiblePaymentPlans.map((plan) => (
                    <div
                      key={plan.plan_id}
                      onClick={() => setMembershipData({ ...membershipData, payment_plan_id: plan.plan_id, type: plan.membership_type || 'full_access' })}
                      className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                        membershipData.payment_plan_id === plan.plan_id
                          ? 'border-orange-500 bg-orange-500/10'
                          : 'border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      <p className="font-medium text-white">{plan.name}</p>
                      <p className="text-2xl font-bold text-orange-500">{plan.price} {plan.currency}</p>
                      <p className="text-sm text-zinc-500 capitalize">{plan.billing_cycle || plan.billing_period}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: Agreement */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-white">Agreement</h2>
                {agreements.length > 0 && (
                  <>
                    <div className="bg-zinc-800 p-4 rounded-lg max-h-48 overflow-y-auto">
                      <div 
                        dangerouslySetInnerHTML={{ __html: agreements[0]?.content_html || '' }}
                        className="prose prose-invert prose-sm"
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="agree"
                        checked={agreementData.checkbox_agreed}
                        onCheckedChange={(checked) => setAgreementData({ ...agreementData, checkbox_agreed: checked })}
                      />
                      <Label htmlFor="agree">I have read and agree to the terms *</Label>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Step 4: Payment */}
            {currentStep === 4 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-white">Complete Registration</h2>
                
                {selectedPlan && (
                  <Card className="bg-zinc-800 border-zinc-700">
                    <CardContent className="p-4 flex justify-between items-center">
                      <div>
                        <p className="text-zinc-400">Selected Plan</p>
                        <p className="font-medium text-white">{selectedPlan.name}</p>
                      </div>
                      <p className="text-xl font-bold text-orange-500">{selectedPlan.price} {selectedPlan.currency}</p>
                    </CardContent>
                  </Card>
                )}
                
                {createdMember && (
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                    <p className="text-green-400 font-medium">Account Created Successfully!</p>
                    <p className="text-sm text-green-300 mt-1">
                      Your temporary password has been sent. Please login to complete payment and access the member portal.
                    </p>
                  </div>
                )}
                
                {!createdMember && (
                  <div className="space-y-3 mt-4">
                    <Label>Select Payment Method</Label>
                    {availablePaymentMethods.length === 0 ? (
                      <p className="text-sm text-zinc-500">No online payment methods available.</p>
                    ) : (
                      <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="space-y-2">
                        {availablePaymentMethods.map((method) => (
                          <div key={method.provider} className={`flex items-center space-x-2 p-3 rounded-lg border ${paymentMethod === method.provider ? 'border-orange-500 bg-orange-500/10' : 'border-zinc-800'}`}>
                            <RadioGroupItem value={method.provider} id={`pay-${method.provider}`} />
                            <Label htmlFor={`pay-${method.provider}`} className="cursor-pointer flex-1">
                              {method.display_name} {method.is_sandbox && <span className="text-xs text-yellow-500 ml-2">(Sandbox)</span>}
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    )}
                  </div>
                )}
                
                <p className="text-zinc-400 text-sm mt-4">
                  Payment will be processed after you confirm your registration.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0 || submitting}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          
          {currentStep < STEPS.length - 1 ? (
            <Button
              onClick={handleNext}
              disabled={submitting}
              className="bg-orange-500 hover:bg-orange-600"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={handleComplete}
              className="bg-green-500 hover:bg-green-600"
            >
              <Check className="h-4 w-4 mr-2" />
              Go to Login
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
