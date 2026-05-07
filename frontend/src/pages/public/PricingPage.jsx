import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PublicLayout from '@/components/PublicLayout';
import { publicAPI } from '@/lib/api';
import { ChevronRight, Check, Star } from 'lucide-react';

export default function PricingPage() {
  const { t, i18n } = useTranslation();
  const [siteSettings, setSiteSettings] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [membershipType, setMembershipType] = useState('full_access');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [settingsRes, plansRes] = await Promise.all([
          publicAPI.getSiteSettings().catch(() => ({ data: null })),
          publicAPI.getPricing(),
        ]);
        setSiteSettings(settingsRes.data);
        setPlans(plansRes.data || []);
      } catch (err) {
        console.error('Failed to load pricing');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [i18n.language]);

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
            <span className="text-white">{t('nav.pricing')}</span>
          </nav>
          <h1 className="font-heading font-extrabold text-3xl lg:text-5xl uppercase tracking-tight">
            {t('pricing.title')}
          </h1>
          <p className="text-gray-400 mt-4 max-w-2xl">
            {t('pricing.subtitle')}
          </p>
        </div>
      </section>

      {/* Pricing Grid */}
      <section data-testid="pricing-list" className="py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap gap-2 mb-8">
            <button
              type="button"
              onClick={() => setMembershipType('full_access')}
              className={`px-4 py-2 rounded-sm border text-sm font-semibold transition-colors ${
                membershipType === 'full_access'
                  ? 'bg-red-600 border-red-600 text-white'
                  : 'bg-white border-gray-200 text-black hover:bg-gray-50'
              }`}
            >
              Full Access
            </button>
            <button
              type="button"
              onClick={() => setMembershipType('only_gym')}
              className={`px-4 py-2 rounded-sm border text-sm font-semibold transition-colors ${
                membershipType === 'only_gym'
                  ? 'bg-red-600 border-red-600 text-white'
                  : 'bg-white border-gray-200 text-black hover:bg-gray-50'
              }`}
            >
              Only Gym
            </button>
            <button
              type="button"
              onClick={() => setMembershipType('kids')}
              className={`px-4 py-2 rounded-sm border text-sm font-semibold transition-colors ${
                membershipType === 'kids'
                  ? 'bg-red-600 border-red-600 text-white'
                  : 'bg-white border-gray-200 text-black hover:bg-gray-50'
              }`}
            >
              Kids
            </button>
          </div>

          {plans.filter(p => (p.membership_type || 'full_access') === membershipType).length === 0 ? (
            <div className="text-center py-16">
              <span className="text-5xl mb-4 block">💰</span>
              <h2 className="text-xl font-heading font-bold text-gray-700">{t('pricing.empty.title')}</h2>
              <p className="text-gray-500 mt-2">{t('pricing.empty.subtitle')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {plans
                .filter(p => (p.membership_type || 'full_access') === membershipType)
                .map((plan, i) => (
                <div
                  key={plan.plan_id || i}
                  data-testid={`pricing-card-${i}`}
                  className={`relative bg-white border rounded-sm overflow-hidden transition-shadow hover:shadow-lg ${
                    plan.is_popular ? 'border-red-600 border-2' : 'border-gray-200'
                  }`}
                >
                  {plan.is_popular && (
                    <div className="absolute top-0 right-0 bg-red-600 text-white text-xs font-bold px-3 py-1 flex items-center gap-1">
                      <Star className="w-3 h-3" /> {t('pricing.popular')}
                    </div>
                  )}
                  
                  <div className="p-6">
                    <h3 className="font-heading font-bold text-xl text-black">{plan.name}</h3>
                    <p className="text-gray-600 text-sm mt-1">{plan.description}</p>
                    
                    <div className="mt-6">
                      <span className="font-heading font-extrabold text-4xl text-red-600">
                        {plan.currency} {plan.price.toLocaleString()}
                      </span>
                      <span className="text-gray-500 text-sm ml-1">/{plan.billing_period}</span>
                    </div>

                    {plan.features?.length > 0 && (
                      <ul className="mt-6 space-y-3">
                        {plan.features.map((feature, j) => (
                          <li key={j} className="flex items-start gap-2">
                            <Check className="w-5 h-5 text-red-600 flex-shrink-0" />
                            <span className="text-gray-700 text-sm">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <Link
                      to="/contact"
                      className={`block mt-8 text-center font-semibold py-3 rounded-sm transition-colors ${
                        plan.is_popular
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : 'bg-gray-100 hover:bg-gray-200 text-black'
                      }`}
                    >
                      {t('pricing.getStarted')}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* FAQ CTA */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-heading font-bold text-2xl text-black">{t('pricing.faqCta.title')}</h2>
          <p className="text-gray-600 mt-2">{t('pricing.faqCta.subtitle')}</p>
          <div className="mt-6 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/faqs"
              className="bg-white border border-gray-300 hover:border-gray-400 text-black font-semibold px-8 py-3 rounded-sm transition-colors"
            >
              {t('pricing.faqCta.viewFaqs')}
            </Link>
            <Link
              to="/contact"
              className="bg-red-600 hover:bg-red-700 text-white font-semibold px-8 py-3 rounded-sm transition-colors"
            >
              {t('pricing.contactUs')}
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
