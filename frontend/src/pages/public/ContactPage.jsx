import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PublicLayout from '@/components/PublicLayout';
import { publicAPI } from '@/lib/api';
import { ChevronRight, Send, Loader2, CheckCircle, MapPin } from 'lucide-react';
import { toast } from 'sonner';

export default function ContactPage() {
  const { t, i18n } = useTranslation();
  const [siteSettings, setSiteSettings] = useState(null);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
    branch_id: ''
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [settingsRes, branchesRes] = await Promise.all([
          publicAPI.getSiteSettings().catch(() => ({ data: null })),
          publicAPI.getBranches().catch(() => ({ data: [] })),
        ]);
        setSiteSettings(settingsRes.data);
        setBranches(branchesRes.data || []);
      } catch (err) {
        console.error('Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [i18n.language]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) {
      toast.error(t('validation.required'));
      return;
    }
    setSubmitting(true);
    try {
      await publicAPI.submitContact(form);
      setSubmitted(true);
      toast.success(t('contact.form.success'));
    } catch (err) {
      toast.error(t('contact.form.error'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <PublicLayout siteSettings={siteSettings}>
      {/* Hero */}
      <section className="bg-black text-white py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex items-center gap-2 text-sm text-gray-400 mb-6">
            <Link to="/" className="hover:text-white">{t('nav.home')}</Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-white">{t('nav.contact')}</span>
          </nav>
          <h1 className="font-heading font-extrabold text-3xl lg:text-5xl uppercase tracking-tight">
            {t('contact.title')}
          </h1>
          <p className="text-gray-400 mt-4 max-w-2xl">
            {t('contact.hero.subtitle')}
          </p>
        </div>
      </section>

      {/* Contact Form + Info */}
      <section data-testid="contact-section" className="py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* Contact Form */}
            <div className="lg:col-span-2">
              {submitted ? (
                <div className="bg-green-50 border border-green-200 rounded-sm p-8 text-center">
                  <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
                  <h2 className="font-heading font-bold text-2xl text-green-800">{t('contact.success.title')}</h2>
                  <p className="text-green-700 mt-2">{t('contact.success.message')}</p>
                  <button
                    onClick={() => {
                      setSubmitted(false);
                      setForm({ name: '', email: '', phone: '', subject: '', message: '', branch_id: '' });
                    }}
                    className="mt-6 text-green-700 hover:text-green-800 font-medium"
                  >
                    {t('contact.success.sendAnother')}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t('contact.form.name')} <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="text"
                        data-testid="contact-name"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="w-full border border-gray-300 rounded-sm px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-gray-900"
                        placeholder={t('contact.form.namePlaceholder')}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t('contact.form.email')} <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="email"
                        data-testid="contact-email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        className="w-full border border-gray-300 rounded-sm px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-gray-900"
                        placeholder={t('contact.form.emailPlaceholder')}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">{t('contact.form.phone')}</label>
                      <input
                        type="tel"
                        data-testid="contact-phone"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        className="w-full border border-gray-300 rounded-sm px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-gray-900"
                        placeholder={t('contact.form.phonePlaceholder')}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">{t('contact.form.preferredLocation')}</label>
                      <select
                        data-testid="contact-branch"
                        value={form.branch_id}
                        onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
                        className="w-full border border-gray-300 rounded-sm px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-gray-900"
                      >
                        <option value="">{t('contact.form.selectLocation')}</option>
                        {branches.map((branch) => (
                          <option key={branch.location_id} value={branch.location_id}>
                            {branch.name} - {branch.city}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('contact.form.subject')}</label>
                    <select
                      data-testid="contact-subject"
                      value={form.subject}
                      onChange={(e) => setForm({ ...form, subject: e.target.value })}
                      className="w-full border border-gray-300 rounded-sm px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-gray-900"
                    >
                      <option value="">{t('contact.form.subjectPlaceholder')}</option>
                      <option value="Free Trial">{t('contact.subjects.freeTrial')}</option>
                      <option value="Membership Inquiry">{t('contact.subjects.membership')}</option>
                      <option value="Class Schedule">{t('contact.subjects.classSchedule')}</option>
                      <option value="Corporate Training">{t('contact.subjects.corporate')}</option>
                      <option value="Other">{t('contact.subjects.other')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('contact.form.message')} <span className="text-red-600">*</span>
                    </label>
                    <textarea
                      data-testid="contact-message"
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      rows={5}
                      className="w-full border border-gray-300 rounded-sm px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none text-gray-900"
                      placeholder={t('contact.form.messagePlaceholder')}
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    data-testid="contact-submit"
                    disabled={submitting}
                    className="bg-red-600 hover:bg-red-700 text-white font-semibold px-8 py-3 rounded-sm transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {t('contact.form.sending')}
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        {t('contact.form.submit')}
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>

            {/* Contact Info Sidebar */}
            <div className="space-y-8">
              <div className="bg-gray-50 rounded-sm p-6">
                <h3 className="font-heading font-bold text-lg text-black mb-4">{t('contact.sidebar.getInTouch')}</h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-500">{t('contact.sidebar.email')}</p>
                    <a href={`mailto:${siteSettings?.contact_email || 'info@spartans.ae'}`} className="text-red-600 hover:text-red-700 font-medium">
                      {siteSettings?.contact_email || 'info@spartans.ae'}
                    </a>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">{t('contact.sidebar.phone')}</p>
                    <a href={`tel:${siteSettings?.contact_phone}`} className="text-red-600 hover:text-red-700 font-medium">
                      {siteSettings?.contact_phone || '+971-50-000-0000'}
                    </a>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-sm p-6">
                <h3 className="font-heading font-bold text-lg text-black mb-4">{t('contact.sidebar.ourLocations')}</h3>
                <ul className="space-y-3">
                  {branches.slice(0, 4).map((branch) => (
                    <li key={branch.location_id} className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-red-600 flex-shrink-0 mt-1" />
                      <div>
                        <p className="font-medium text-sm text-black">{branch.name}</p>
                        <p className="text-xs text-gray-500">{branch.city}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <Link to="/branches" className="text-red-600 hover:text-red-700 text-sm font-medium mt-4 inline-block">
                  {t('contact.sidebar.viewAll')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
