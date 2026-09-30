import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PublicLayout from '@/components/PublicLayout';
import { publicAPI } from '@/lib/api';
import { isVideoUrl, resolveMediaUrl } from '@/lib/media';
import { ChevronRight, Check, ArrowLeft, Users } from 'lucide-react';

export default function DisciplinesPage() {
  const { slug } = useParams();
  const { t, i18n } = useTranslation();
  const [siteSettings, setSiteSettings] = useState(null);
  const [disciplines, setDisciplines] = useState([]);
  const [selectedDiscipline, setSelectedDiscipline] = useState(null);
  const [loading, setLoading] = useState(true);

  const getImageUrl = (url) => {
    return resolveMediaUrl(url);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [settingsRes, disciplinesRes] = await Promise.all([
          publicAPI.getSiteSettings().catch(() => ({ data: null })),
          publicAPI.getDisciplines(),
        ]);
        setSiteSettings(settingsRes.data);
        setDisciplines(disciplinesRes.data || []);

        if (slug) {
          const discRes = await publicAPI.getDiscipline(slug);
          setSelectedDiscipline(discRes.data);
        } else {
          setSelectedDiscipline(null);
        }
      } catch (err) {
        console.error('Failed to load disciplines');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [slug, i18n.language]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Single discipline view
  if (slug && selectedDiscipline) {
    return (
      <PublicLayout siteSettings={siteSettings}>
        <section className="bg-black text-white py-16 lg:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex items-center gap-2 text-sm text-gray-400 mb-6">
              <Link to="/" className="hover:text-white">{t('nav.home')}</Link>
              <ChevronRight className="w-4 h-4" />
              <Link to="/disciplines" className="hover:text-white">{t('nav.disciplines')}</Link>
              <ChevronRight className="w-4 h-4" />
              <span className="text-white">{selectedDiscipline.name}</span>
            </nav>
            <div className="flex items-center gap-6">
              {selectedDiscipline.image_url ? (
                <div className="w-24 h-24 rounded-sm overflow-hidden border-2 border-white/20 bg-zinc-800">
                  {isVideoUrl(getImageUrl(selectedDiscipline.image_url)) ? (
                    <video
                      src={getImageUrl(selectedDiscipline.image_url)}
                      className="w-full h-full object-cover"
                      muted
                      loop
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img 
                      src={getImageUrl(selectedDiscipline.image_url)} 
                      alt={selectedDiscipline.name} 
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              ) : (
                <span className="text-5xl">{selectedDiscipline.icon || '🥋'}</span>
              )}
              <div>
                <h1 className="font-heading font-extrabold text-3xl lg:text-5xl uppercase tracking-tight">
                  {selectedDiscipline.name}
                </h1>
                <p className="text-gray-400 mt-2">{selectedDiscipline.short_description}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 lg:py-24 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Standard 12-column Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
              
              {/* Left Column: Article Content */}
              <div className="lg:col-span-8 min-w-0 w-full overflow-hidden">
                <div 
                  className="w-full prose prose-lg break-words whitespace-normal max-w-none public-richtext discipline-content"
                  dangerouslySetInnerHTML={{ __html: selectedDiscipline.full_description || '' }}
                />
                <Link
                  to="/disciplines"
                  className="inline-flex items-center gap-2 text-red-600 hover:text-red-700 font-medium mt-8"
                >
                  <ArrowLeft className="w-4 h-4" /> {t('disciplines.backToAll')}
                </Link>
              </div>

              {/* Right Column: Sidebar */}
              <div className="lg:col-span-4 w-full self-start space-y-8">
                {selectedDiscipline.benefits?.length > 0 && (
                  <div className="bg-gray-50 rounded-sm p-6">
                    <h3 className="font-heading font-bold text-lg text-black mb-4">{t('disciplines.benefits')}</h3>
                    <ul className="space-y-3">
                      {selectedDiscipline.benefits.map((benefit, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <Check className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                          <span className="text-gray-700 text-sm">{benefit}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedDiscipline.suitable_for && (
                  <div className="bg-gray-50 rounded-sm p-6">
                    <h3 className="font-heading font-bold text-lg text-black mb-4 flex items-center gap-2">
                      <Users className="w-5 h-5 text-red-600" /> {t('disciplines.suitableFor')}
                    </h3>
                    <p className="text-gray-700 text-sm">{selectedDiscipline.suitable_for}</p>
                  </div>
                )}

                <div className="bg-red-600 rounded-sm p-6 text-white">
                  <h3 className="font-heading font-bold text-lg mb-2">{t('disciplines.readyToTrain.title')}</h3>
                  <p className="text-red-100 text-sm mb-4">
                    {t('disciplines.readyToTrain.subtitle', { name: selectedDiscipline.name })}
                  </p>
                  <Link
                    to="/contact"
                    className="block bg-white text-red-600 hover:bg-gray-100 font-semibold px-6 py-2.5 rounded-sm transition-colors text-center text-sm"
                  >
                    {t('disciplines.readyToTrain.cta')}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </PublicLayout>
    );
  }

  // Disciplines list view
  return (
    <PublicLayout siteSettings={siteSettings}>
      <section className="bg-black text-white py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex items-center gap-2 text-sm text-gray-400 mb-6">
            <Link to="/" className="hover:text-white">{t('nav.home')}</Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-white">{t('nav.disciplines')}</span>
          </nav>
          <h1 className="font-heading font-extrabold text-3xl lg:text-5xl uppercase tracking-tight">
            {t('disciplines.title')}
          </h1>
          <p className="text-gray-400 mt-4 max-w-2xl">
            {t('disciplines.subtitle')}
          </p>
        </div>
      </section>

      <section data-testid="disciplines-list" className="py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {disciplines.length === 0 ? (
            <div className="text-center py-16">
              <span className="text-5xl mb-4 block">🥋</span>
              <h2 className="text-xl font-heading font-bold text-gray-700">{t('disciplines.empty.title')}</h2>
              <p className="text-gray-500 mt-2">{t('disciplines.empty.subtitle')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {disciplines.map((discipline, i) => (
                <Link
                  key={discipline.discipline_id || i}
                  to={`/disciplines/${discipline.slug}`}
                  data-testid={`discipline-item-${discipline.slug}`}
                  className="group bg-white border border-gray-200 rounded-sm overflow-hidden hover:shadow-lg transition-shadow"
                >
                  <div className="flex">
                    <div className="w-32 lg:w-40 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                      {getImageUrl(discipline.image_url) ? (
                        isVideoUrl(getImageUrl(discipline.image_url)) ? (
                          <video
                            src={getImageUrl(discipline.image_url)}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            muted
                            loop
                            playsInline
                            preload="metadata"
                          />
                        ) : (
                          <img 
                            src={getImageUrl(discipline.image_url)} 
                            alt={discipline.name} 
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        )
                      ) : (
                        <span className="text-5xl">{discipline.icon || '🥋'}</span>
                      )}
                    </div>
                    <div className="p-6 flex-1">
                      <h2 className="font-heading font-bold text-xl text-black group-hover:text-red-600 transition-colors">
                        {discipline.name}
                      </h2>
                      <p className="text-gray-600 text-sm mt-2 line-clamp-2">
                        {discipline.short_description}
                      </p>
                      
                      {discipline.benefits?.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {discipline.benefits.slice(0, 3).map((benefit, j) => (
                            <span key={j} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                              {benefit}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="mt-4 flex items-center gap-1 text-red-600 text-sm font-medium">
                        {t('common.learnMore')} <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="bg-gray-50 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-heading font-bold text-2xl text-black">{t('disciplines.notSure.title')}</h2>
          <p className="text-gray-600 mt-2 max-w-xl mx-auto">{t('disciplines.notSure.subtitle')}</p>
          <Link
            to="/contact"
            className="inline-block mt-6 bg-red-600 hover:bg-red-700 text-white font-semibold px-8 py-3 rounded-sm transition-colors"
          >
            {t('disciplines.notSure.cta')}
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}
