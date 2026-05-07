import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PublicLayout from '@/components/PublicLayout';
import { publicAPI } from '@/lib/api';
import { ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';

export default function FAQsPage() {
  const { t, i18n } = useTranslation();
  const [siteSettings, setSiteSettings] = useState(null);
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openFaq, setOpenFaq] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setOpenFaq(null);
        setActiveCategory(t('common.all'));
        const [settingsRes, faqsRes] = await Promise.all([
          publicAPI.getSiteSettings().catch(() => ({ data: null })),
          publicAPI.getFaqs(),
        ]);
        setSiteSettings(settingsRes.data);
        setFaqs(faqsRes.data || []);
      } catch (err) {
        console.error('Failed to load FAQs');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [i18n.language, t]);

  const categories = [t('common.all'), ...new Set(faqs.map(f => f.category))];
  const filteredFaqs = activeCategory === t('common.all')
    ? faqs 
    : faqs.filter(f => f.category === activeCategory);

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
            <span className="text-white">{t('nav.faq')}</span>
          </nav>
          <h1 className="font-heading font-extrabold text-3xl lg:text-5xl uppercase tracking-tight">
            {t('faq.title')}
          </h1>
          <p className="text-gray-400 mt-4 max-w-2xl">
            {t('faq.subtitle')}
          </p>
        </div>
      </section>

      {/* FAQs Section */}
      <section data-testid="faqs-list" className="py-16 lg:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {categories.length > 2 && (
            <div className="flex flex-wrap gap-2 mb-8">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-4 py-2 rounded-sm text-sm font-medium transition-colors ${
                    activeCategory === cat
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {filteredFaqs.length === 0 ? (
            <div className="text-center py-16">
              <span className="text-5xl mb-4 block">❓</span>
              <h2 className="text-xl font-heading font-bold text-gray-700">{t('faq.empty.title')}</h2>
              <p className="text-gray-500 mt-2">{t('faq.empty.subtitle')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredFaqs.map((faq, i) => (
                <div
                  key={faq.faq_id || i}
                  data-testid={`faq-item-${i}`}
                  className="border border-gray-200 rounded-sm overflow-hidden"
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className="font-medium text-black pr-4">{faq.question}</span>
                    {openFaq === i ? (
                      <ChevronUp className="w-5 h-5 text-red-600 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    )}
                  </button>
                  {openFaq === i && (
                    <div className="px-5 pb-5 pt-0">
                      <div className="border-t border-gray-100 pt-4">
                        <p className="text-gray-600 whitespace-pre-wrap">{faq.answer}</p>
                        {faq.category && (
                          <span className="inline-block mt-3 text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded">
                            {faq.category}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Contact CTA */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-heading font-bold text-2xl text-black">{t('faq.contactCta.title')}</h2>
          <p className="text-gray-600 mt-2">{t('faq.contactCta.subtitle')}</p>
          <Link
            to="/contact"
            className="inline-block mt-6 bg-red-600 hover:bg-red-700 text-white font-semibold px-8 py-3 rounded-sm transition-colors"
          >
            {t('faq.contactCta.button')}
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}
