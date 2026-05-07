import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PublicLayout from '@/components/PublicLayout';
import { publicAPI } from '@/lib/api';
import { isVideoUrl, resolveMediaUrl } from '@/lib/media';
import { MapPin, Phone, Mail, Clock, ChevronRight } from 'lucide-react';

export default function BranchesPage() {
  const { t, i18n } = useTranslation();
  const [siteSettings, setSiteSettings] = useState(null);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [settingsRes, branchesRes] = await Promise.all([
          publicAPI.getSiteSettings().catch(() => ({ data: null })),
          publicAPI.getBranches(),
        ]);
        setSiteSettings(settingsRes.data);
        setBranches(branchesRes.data || []);
      } catch (err) {
        console.error('Failed to load branches');
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

  const getImageUrl = (url) => {
    return resolveMediaUrl(url);
  };

  return (
    <PublicLayout siteSettings={siteSettings}>
      {/* Hero */}
      <section className="bg-black text-white py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex items-center gap-2 text-sm text-gray-400 mb-6">
            <Link to="/" className="hover:text-white">{t('nav.home')}</Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-white">{t('nav.locations')}</span>
          </nav>
          <h1 className="font-heading font-extrabold text-3xl lg:text-5xl uppercase tracking-tight">
            {t('branches.title')}
          </h1>
          <p className="text-gray-400 mt-4 max-w-2xl">
            {t('branches.subtitle')}
          </p>
        </div>
      </section>

      {/* Branches List */}
      <section data-testid="branches-list" className="py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {branches.length === 0 ? (
            <div className="text-center py-16">
              <MapPin className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h2 className="text-xl font-heading font-bold text-gray-700">{t('branches.empty.title')}</h2>
              <p className="text-gray-500 mt-2">{t('branches.empty.subtitle')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {branches.map((branch, i) => (
                <div
                  key={branch.location_id || i}
                  data-testid={`branch-item-${i}`}
                  className="bg-white border border-gray-200 rounded-sm overflow-hidden hover:shadow-lg transition-shadow"
                >
                  <div className="h-48 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center overflow-hidden">
                    {branch.logo_url ? (
                      isVideoUrl(getImageUrl(branch.logo_url)) ? (
                        <video
                          src={getImageUrl(branch.logo_url)}
                          className="w-full h-full object-cover"
                          muted
                          loop
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <img 
                          src={getImageUrl(branch.logo_url)} 
                          alt={branch.name} 
                          className="w-full h-full object-cover"
                        />
                      )
                    ) : (
                      <MapPin className="w-16 h-16 text-gray-300" />
                    )}
                  </div>
                  
                  <div className="p-6">
                    <h2 className="font-heading font-bold text-xl text-black">
                      {branch.public_title || branch.name}
                    </h2>
                    <p className="text-red-600 font-medium text-sm mt-1">{branch.city}</p>
                    
                    {branch.public_description && (
                      <p className="text-gray-600 text-sm mt-3">{branch.public_description}</p>
                    )}

                    <div className="mt-6 space-y-3">
                      <div className="flex items-start gap-3">
                        <MapPin className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-700 text-sm">{branch.address}</span>
                      </div>
                      
                      {branch.phone && (
                        <div className="flex items-center gap-3">
                          <Phone className="w-5 h-5 text-red-500 flex-shrink-0" />
                          <a href={`tel:${branch.phone}`} className="text-gray-700 text-sm hover:text-red-600">
                            {branch.phone}
                          </a>
                        </div>
                      )}
                      
                      {branch.email && (
                        <div className="flex items-center gap-3">
                          <Mail className="w-5 h-5 text-red-500 flex-shrink-0" />
                          <a href={`mailto:${branch.email}`} className="text-gray-700 text-sm hover:text-red-600">
                            {branch.email}
                          </a>
                        </div>
                      )}
                      
                      {branch.operating_hours && (
                        <div className="flex items-start gap-3">
                          <Clock className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                          <span className="text-gray-700 text-sm">{branch.operating_hours}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-6 pt-6 border-t border-gray-100 flex flex-wrap gap-3">
                      <Link
                        to={`/locations/${branch.slug || branch.location_id}`}
                        className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-2.5 rounded-sm transition-colors text-sm"
                      >
                        View Details
                      </Link>
                      <Link
                        to={`/join?location=${branch.location_id}`}
                        className="inline-flex items-center gap-2 bg-white border border-red-600 text-red-600 hover:bg-red-50 font-semibold px-6 py-2.5 rounded-sm transition-colors text-sm"
                      >
                        Join Now
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-heading font-bold text-2xl text-black">{t('branches.cantFind.title')}</h2>
          <p className="text-gray-600 mt-2">{t('branches.cantFind.subtitle')}</p>
          <Link
            to="/contact"
            className="inline-block mt-6 bg-red-600 hover:bg-red-700 text-white font-semibold px-8 py-3 rounded-sm transition-colors"
          >
            {t('branches.cantFind.cta')}
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}
