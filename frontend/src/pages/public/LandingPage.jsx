import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PublicLayout from '@/components/PublicLayout';
import { publicAPI, blogsAPI } from '@/lib/api';
import { isVideoUrl, resolveMediaUrl } from '@/lib/media';
import { cmsField } from '@/lib/cmsI18n';
import { MapPin, Users, Award, ChevronRight, ArrowRight, Star, ChevronDown, Calendar, Play } from 'lucide-react';

// Auto-scrolling gallery row
function GalleryRow({ images, direction = 'left', speed = 30 }) {
  const scrollRef = useRef(null);
  const getUrl = (url) => resolveMediaUrl(url);

  // Duplicate for seamless loop
  const doubled = [...images, ...images];

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || images.length === 0) return;
    let animId;
    let pos = direction === 'left' ? 0 : el.scrollWidth / 2;
    const step = direction === 'left' ? 0.5 : -0.5;
    const tick = () => {
      pos += step;
      if (direction === 'left' && pos >= el.scrollWidth / 2) pos = 0;
      if (direction === 'right' && pos <= 0) pos = el.scrollWidth / 2;
      el.scrollLeft = pos;
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [images, direction]);

  if (images.length === 0) return null;

  return (
    <div ref={scrollRef} className="flex gap-3 overflow-hidden" style={{ scrollBehavior: 'auto' }}>
      {doubled.map((img, idx) => (
        <div key={idx} className="flex-shrink-0 w-72 h-48 rounded-sm overflow-hidden">
          {isVideoUrl(img.image_url) ? (
            <video
              src={getUrl(img.image_url)}
              className="w-full h-full object-cover"
              muted
              loop
              playsInline
              preload="metadata"
            />
          ) : (
            <img
              src={getUrl(img.image_url)}
              alt={img.caption || 'Gallery'}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          )}
        </div>
      ))}
    </div>
  );
}

// Star rating display
function StarRating({ rating, size = 'w-4 h-4' }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`${size} ${s <= Math.round(rating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`}
        />
      ))}
    </div>
  );
}

// FAQ Accordion item
function FaqItem({ question, answer, isOpen, onToggle }) {
  return (
    <div className="border-b border-gray-200">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-5 text-left group"
        data-testid={`faq-toggle`}
      >
        <span className={`font-heading font-semibold pr-4 transition-colors ${isOpen ? 'text-red-600' : 'text-black group-hover:text-red-600'}`}>
          {question}
        </span>
        <ChevronDown className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180 text-red-600' : ''}`} />
      </button>
      <div 
        className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-96 opacity-100 mb-5' : 'max-h-0 opacity-0'}`}
      >
        <div className="text-gray-600 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: answer }} />
      </div>
    </div>
  );
}

// Animated Counter Component
function AnimatedCounter({ end, duration = 2000, suffix = '' }) {
  const [count, setCount] = useState(0);
  const countRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    
    if (countRef.current) {
      observer.observe(countRef.current);
    }
    
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    
    let startTimestamp = null;
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      setCount(Math.floor(progress * end));
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  }, [isVisible, end, duration]);

  return <span ref={countRef}>{count}{suffix}</span>;
}

export default function LandingPage() {
  const { t, i18n } = useTranslation();
  const [siteSettings, setSiteSettings] = useState(null);
  const [stats, setStats] = useState(null);
  const [disciplines, setDisciplines] = useState([]);
  const [branches, setBranches] = useState([]);
  const [reviews, setReviews] = useState({ reviews: [], rating: 0, total_reviews: 0 });
  const [gallery, setGallery] = useState([]);
  const [faqs, setFaqs] = useState([]);
  const [featuredBlogs, setFeaturedBlogs] = useState([]);
  const [openFaqIndex, setOpenFaqIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [blogsLoading, setBlogsLoading] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [videoSrc, setVideoSrc] = useState(null);

  const getImageUrl = (url) => resolveMediaUrl(url);

  const isExternalUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
    const u = url.trim().toLowerCase();
    return u.startsWith('http://') || u.startsWith('https://') || u.startsWith('mailto:') || u.startsWith('tel:');
  };

  // Derived state for hero images
  const heroImages = useMemo(() => {
    return siteSettings?.hero_images?.length > 0 
      ? siteSettings.hero_images 
      : (siteSettings?.hero_image_url ? [siteSettings.hero_image_url] : []);
  }, [siteSettings]);

  const [currentHeroIndex, setCurrentHeroIndex] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [settingsRes, statsRes, disciplinesRes, branchesRes, reviewsRes, galleryRes, faqsRes] = await Promise.all([
          publicAPI.getSiteSettings().catch(() => ({ data: null })),
          publicAPI.getStats().catch(() => ({ data: null })),
          publicAPI.getDisciplines().catch(() => ({ data: [] })),
          publicAPI.getBranches().catch(() => ({ data: [] })),
          publicAPI.getGoogleReviews().catch(() => ({ data: { reviews: [], rating: 0, total_reviews: 0 } })),
          publicAPI.getGallery().catch(() => ({ data: { images: [] } })),
          publicAPI.getFaqs({ featured: true }).catch(() => ({ data: [] })),
        ]);
        setSiteSettings(settingsRes.data);
        setStats(statsRes.data);
        setDisciplines(disciplinesRes.data?.slice(0, 4) || []);
        setBranches(branchesRes.data?.slice(0, 3) || []);
        setReviews(reviewsRes.data || { reviews: [], rating: 0, total_reviews: 0 });
        setGallery(galleryRes.data?.images || []);
        setFaqs(faqsRes.data || []);
      } catch (err) {
        console.error('Failed to load landing page data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [i18n.language]);

  useEffect(() => {
    const resolved = siteSettings?.video_url ? getImageUrl(siteSettings.video_url) : null;
    const autoplay = siteSettings?.video_autoplay === true;
    setVideoEnabled(autoplay);
    setVideoSrc(autoplay ? resolved : null);
  }, [siteSettings?.video_url, siteSettings?.video_autoplay]);

  // Separate effect for blogs to prevent blocking
  useEffect(() => {
    const fetchBlogs = async () => {
      setBlogsLoading(true);
      try {
        // Fetch featured blogs, limiting to 3 latest
        const res = await blogsAPI.getPublic({ featured: true, limit: 3 });
        if (res.data && Array.isArray(res.data.blogs)) {
          setFeaturedBlogs(res.data.blogs);
        } else {
          setFeaturedBlogs([]);
        }
      } catch (err) {
        console.error('Failed to load blogs', err);
        setFeaturedBlogs([]);
      } finally {
        setBlogsLoading(false);
      }
    };
    fetchBlogs();
  }, [i18n.language]);

  useEffect(() => {
    if (heroImages.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentHeroIndex((prev) => (prev + 1) % heroImages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [heroImages]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const halfGallery = Math.ceil(gallery.length / 2);
  const row1 = gallery.slice(0, halfGallery);
  const row2 = gallery.slice(halfGallery);

  return (
    <PublicLayout siteSettings={siteSettings}>
      {/* Hero Section */}
      <section data-testid="hero-section" className="relative bg-black text-white overflow-hidden min-h-[500px] lg:min-h-[600px]">
        {heroImages.length > 0 && heroImages.map((img, idx) => (
          <div 
            key={idx}
            className={`absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000 ${
              idx === currentHeroIndex ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ backgroundImage: `url('${getImageUrl(img)}')` }}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/50 to-red-900/30 z-10" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.03%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-30 z-10" />
        
        <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-36">
          <div className="max-w-3xl">
            <h1 className="font-heading font-extrabold text-4xl sm:text-5xl lg:text-6xl uppercase tracking-tight leading-tight drop-shadow-lg">
              {siteSettings?.tagline || t('home.hero.title')}
            </h1>
            <p className="mt-6 text-lg text-gray-200 max-w-xl drop-shadow">
              {siteSettings?.description || t('home.hero.subtitle')}
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4">
              {(() => {
                const href = cmsField(siteSettings, 'hero_primary_cta_url', i18n.language, '/contact');
                const label = cmsField(siteSettings, 'hero_primary_cta_text', i18n.language, t('home.hero.cta'));
                const className = "bg-red-600 hover:bg-red-700 text-white font-semibold px-8 py-3 rounded-sm transition-colors text-center shadow-lg";
                if (isExternalUrl(href)) {
                  return (
                    <a href={href} data-testid="hero-cta-btn" className={className}>
                      {label}
                    </a>
                  );
                }
                return (
                  <Link to={href} data-testid="hero-cta-btn" className={className}>
                    {label}
                  </Link>
                );
              })()}
              {(() => {
                const href = cmsField(siteSettings, 'hero_secondary_cta_url', i18n.language, '/disciplines');
                const label = cmsField(siteSettings, 'hero_secondary_cta_text', i18n.language, t('home.hero.secondaryCta'));
                const className = "border border-white/30 hover:border-white/50 text-white font-semibold px-8 py-3 rounded-sm transition-colors text-center backdrop-blur-sm";
                if (isExternalUrl(href)) {
                  return (
                    <a href={href} data-testid="hero-explore-btn" className={className}>
                      {label}
                    </a>
                  );
                }
                return (
                  <Link to={href} data-testid="hero-explore-btn" className={className}>
                    {label}
                  </Link>
                );
              })()}
            </div>
          </div>
        </div>
      </section>

      {/* Video Section */}
      {siteSettings?.video_url && (
        <section className="py-16 bg-white text-black text-center border-b border-gray-100">
           <div className="w-[80%] mx-auto">
             {siteSettings.video_section_title && (
               <h1 className="font-heading font-extrabold text-3xl lg:text-5xl uppercase mb-10 tracking-tight text-black">
                 {siteSettings.video_section_title}
               </h1>
             )}
             <div className="relative w-full aspect-video bg-black rounded-sm overflow-hidden shadow-2xl border border-gray-200">
              {videoEnabled ? (
                <video 
                  src={videoSrc} 
                  poster={getImageUrl(siteSettings.video_thumbnail)}
                  controls 
                  autoPlay={siteSettings.video_autoplay}
                  muted={siteSettings.video_autoplay}
                  className="w-full h-full object-cover"
                  preload={siteSettings.video_autoplay ? "auto" : "none"}
                  playsInline
                />
              ) : (
                <button
                  type="button"
                  aria-label="Play video"
                  onClick={() => {
                    const resolved = getImageUrl(siteSettings.video_url);
                    setVideoEnabled(true);
                    setVideoSrc(resolved);
                  }}
                  className="absolute inset-0 w-full h-full group"
                >
                  {siteSettings.video_thumbnail ? (
                    <img
                      src={getImageUrl(siteSettings.video_thumbnail)}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-black" />
                  )}
                  <div className="absolute inset-0 bg-black/35 group-hover:bg-black/25 transition-colors" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/90 text-black shadow-lg group-hover:scale-105 transition-transform">
                      <Play className="w-7 h-7 ml-0.5" />
                    </span>
                  </div>
                </button>
              )}
             </div>
           </div>
        </section>
      )}

      {/* Stats Section */}
      <section className="bg-gray-50 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {siteSettings?.custom_stats?.length > 0 ? (
            <div className="flex flex-wrap justify-center gap-8 lg:gap-16">
              {siteSettings.custom_stats.map((stat, idx) => {
                const num = parseInt(stat.value) || 0;
                const suffix = stat.value.toString().replace(/\d/g, '');
                return (
                  <div key={idx} className="text-center min-w-[150px]">
                    <div className="text-4xl lg:text-5xl font-heading font-extrabold text-red-600">
                      <AnimatedCounter end={num} suffix={suffix} />
                    </div>
                    <div className="text-base text-gray-600 mt-2 font-medium uppercase tracking-wide">{stat.label}</div>
                  </div>
                );
              })}
            </div>
          ) : (stats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-3xl lg:text-4xl font-heading font-extrabold text-red-600">
                  <AnimatedCounter end={stats.branches || 4} suffix="+" />
                </div>
                <div className="text-sm text-gray-600 mt-1">{t('home.stats.locations')}</div>
              </div>
              <div className="text-center">
                <div className="text-3xl lg:text-4xl font-heading font-extrabold text-red-600">
                  <AnimatedCounter end={stats.disciplines || 4} suffix="+" />
                </div>
                <div className="text-sm text-gray-600 mt-1">{t('home.stats.disciplines')}</div>
              </div>
              <div className="text-center">
                <div className="text-3xl lg:text-4xl font-heading font-extrabold text-red-600">
                  <AnimatedCounter end={stats.instructors || 15} suffix="+" />
                </div>
                <div className="text-sm text-gray-600 mt-1">{t('home.stats.expertCoaches')}</div>
              </div>
              <div className="text-center">
                <div className="text-3xl lg:text-4xl font-heading font-extrabold text-red-600">
                  <AnimatedCounter end={stats.programs || 40} suffix="+" />
                </div>
                <div className="text-sm text-gray-600 mt-1">{t('home.stats.programs')}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Disciplines Section */}
      <section data-testid="disciplines-section" className="py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2 className="font-heading font-extrabold text-2xl lg:text-3xl text-black uppercase tracking-tight">
                {t('home.disciplines.title')}
              </h2>
              <p className="text-gray-600 mt-2">{t('home.disciplines.subtitle')}</p>
            </div>
            <Link
              to="/disciplines"
              className="hidden sm:flex items-center gap-1 text-red-600 hover:text-red-700 font-medium text-sm"
            >
              {t('common.viewAll')} <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {disciplines.map((discipline, i) => (
              <Link
                key={discipline.discipline_id || i}
                to={`/disciplines/${discipline.slug}`}
                data-testid={`discipline-card-${discipline.slug}`}
                className="group bg-white border border-gray-200 rounded-sm overflow-hidden hover:shadow-lg transition-shadow"
              >
                <div className="h-40 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center relative">
                  {getImageUrl(discipline.image_url) ? (
                    <img 
                      src={getImageUrl(discipline.image_url)} 
                      alt={discipline.name} 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-5xl">{discipline.icon || '🥋'}</span>
                  )}
                </div>
                <div className="p-5">
                  <h3 className="font-heading font-bold text-lg text-black group-hover:text-red-600 transition-colors">
                    {discipline.name}
                  </h3>
                  <p className="text-gray-600 text-sm mt-2 line-clamp-2">
                    {discipline.short_description}
                  </p>
                  <div className="mt-4 flex items-center gap-1 text-red-600 text-sm font-medium">
                    {t('common.learnMore')} <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="sm:hidden mt-6 text-center">
            <Link
              to="/disciplines"
              className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 font-medium"
            >
              {t('home.disciplines.viewAll')} <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Gallery Section */}
      {gallery.length > 0 && (
        <section data-testid="gallery-section" className="py-16 lg:py-20 bg-black overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-10">
            <h2 className="font-heading font-extrabold text-2xl lg:text-3xl text-white uppercase tracking-tight text-center">
              Our Gym
            </h2>
            <p className="text-gray-400 mt-2 text-center">Take a look inside our facilities</p>
          </div>
          <div className="space-y-3">
            <GalleryRow images={row1} direction="left" />
            <GalleryRow images={row2} direction="right" />
          </div>
        </section>
      )}

      {/* Why Choose Us */}
      <section className="bg-gray-50 text-black py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-heading font-extrabold text-2xl lg:text-3xl uppercase tracking-tight">
              {t('home.whyTrain.title', { defaultValue: 'Why Train With Spartans' }).replace('<1>', '').replace('</1>', '')}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-600/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Award className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="font-heading font-bold text-lg mb-2">{t('home.whyTrain.expertCoaches.title')}</h3>
              <p className="text-gray-500 text-sm">{t('home.whyTrain.expertCoaches.description')}</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-red-600/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="font-heading font-bold text-lg mb-2">{t('home.whyTrain.supportiveCommunity.title')}</h3>
              <p className="text-gray-500 text-sm">{t('home.whyTrain.supportiveCommunity.description')}</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-red-600/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <MapPin className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="font-heading font-bold text-lg mb-2">{t('home.whyTrain.multipleLocations.title')}</h3>
              <p className="text-gray-500 text-sm">{t('home.whyTrain.multipleLocations.description')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Google Reviews Section */}
      {reviews.reviews?.length > 0 && (
        <section data-testid="reviews-section" className="py-16 lg:py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="font-heading font-extrabold text-2xl lg:text-3xl text-black uppercase tracking-tight">
                What Our Members Say
              </h2>
              <div className="flex items-center justify-center gap-3 mt-4">
                <StarRating rating={reviews.rating} size="w-5 h-5" />
                <span className="font-bold text-lg text-black">{reviews.rating}</span>
                <span className="text-gray-500 text-sm">({reviews.total_reviews} reviews on Google)</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {reviews.reviews.slice(0, 6).map((review, i) => (
                <div
                  key={i}
                  className="bg-white border border-gray-200 rounded-sm p-6 hover:shadow-lg transition-shadow"
                  data-testid={`review-card-${i}`}
                >
                  <div className="flex items-center gap-3 mb-4">
                    {review.profile_photo_url ? (
                      <img src={getImageUrl(review.profile_photo_url)} alt="" className="w-10 h-10 rounded-full" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center text-white font-bold">
                        {(review.author_name || 'U')[0]}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-sm text-black">{review.author_name}</p>
                      <p className="text-xs text-gray-400">{review.relative_time_description}</p>
                    </div>
                  </div>
                  <StarRating rating={review.rating} />
                  <p className="text-gray-600 text-sm mt-3 line-clamp-4">{review.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Branches Section */}
      {branches.length > 0 && (
        <section data-testid="branches-section" className="py-16 lg:py-24 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between mb-10">
              <div>
                <h2 className="font-heading font-extrabold text-2xl lg:text-3xl text-black uppercase tracking-tight">
                  {t('home.locations.title')}
                </h2>
                <p className="text-gray-600 mt-2">{t('home.locations.subtitle')}</p>
              </div>
              <Link
                to="/branches"
                className="hidden sm:flex items-center gap-1 text-red-600 hover:text-red-700 font-medium text-sm"
              >
                {t('common.viewAll')} <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {branches.map((branch, i) => (
                <Link
                  key={branch.location_id || i}
                  to={`/locations/${branch.slug || branch.location_id}`}
                  data-testid={`branch-card-${i}`}
                  className="group bg-white border border-gray-200 rounded-sm hover:shadow-lg transition-shadow overflow-hidden flex flex-col h-full"
                >
                  {branch.logo_url ? (
                    <div className="w-full h-48 overflow-hidden border-b border-gray-100 bg-gray-50">
                      <img 
                        src={getImageUrl(branch.logo_url)} 
                        alt={branch.name} 
                        className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-48 bg-red-50 flex items-center justify-center border-b border-gray-100">
                      <MapPin className="w-12 h-12 text-red-600" />
                    </div>
                  )}
                  
                  <div className="p-6 flex-1 flex flex-col">
                    <h3 className="font-heading font-bold text-lg text-black group-hover:text-red-600 transition-colors">
                      {branch.public_title || branch.name}
                    </h3>
                    <p className="text-red-600 font-medium text-sm mt-1 mb-4">{branch.city}</p>
                    
                    <div className="space-y-2 mt-auto">
                      <p className="text-gray-500 text-sm line-clamp-2">{branch.address}</p>
                      {branch.email && <p className="text-gray-500 text-sm truncate">{branch.email}</p>}
                      {branch.phone && <p className="text-gray-500 text-sm">{branch.phone}</p>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            <div className="sm:hidden mt-6 text-center">
              <Link
                to="/branches"
                className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 font-medium"
              >
                {t('home.locations.viewAll')} <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* FAQs Section */}
      {faqs.length > 0 && (
        <section data-testid="faqs-section" className="py-16 lg:py-24">
          <div className="w-[80%] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="font-heading font-extrabold text-2xl lg:text-3xl text-black uppercase tracking-tight">
                Frequently Asked Questions
              </h2>
              <p className="text-gray-600 mt-2">Got questions? We've got answers.</p>
            </div>
            <div className="divide-y divide-gray-200 border-t border-gray-200">
              {faqs.slice(0, 8).map((faq, i) => (
                <FaqItem 
                  key={faq.faq_id || i} 
                  question={faq.question} 
                  answer={faq.answer} 
                  isOpen={openFaqIndex === i}
                  onToggle={() => setOpenFaqIndex(openFaqIndex === i ? null : i)}
                />
              ))}
            </div>
            <div className="text-center mt-8">
              <Link
                to="/faqs"
                className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 font-medium"
                data-testid="view-all-faqs-btn"
              >
                View All FAQs <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Featured Blogs Section */}
      {featuredBlogs.length > 0 && (
        <section className="py-16 lg:py-24 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between mb-12">
              <div>
                <h2 className="font-heading font-extrabold text-2xl lg:text-3xl text-black uppercase tracking-tight">
                  Latest News & Insights
                </h2>
                <p className="text-gray-600 mt-2">Updates from the Spartans community</p>
              </div>
              <Link to="/blog" className="hidden sm:flex items-center gap-1 text-red-600 hover:text-red-700 font-medium">
                View All <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {featuredBlogs.map(blog => (
                <Link key={blog.slug} to={`/blog/${blog.slug}`} className="group bg-white rounded-sm overflow-hidden border border-gray-100 shadow-sm hover:shadow-md transition-all">
                  <div className="aspect-video bg-gray-100 overflow-hidden relative">
                    {blog.featured_image ? (
                      <img 
                        src={getImageUrl(blog.featured_image)} 
                        alt={blog.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-zinc-100">
                        <span className="text-zinc-300 font-heading text-xl">SPARTANS</span>
                      </div>
                    )}
                    <div className="absolute top-3 left-3 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-sm uppercase tracking-wider">
                      {blog.tags?.[0] || 'News'}
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(blog.created_at).toLocaleDateString()}
                    </div>
                    <h3 className="font-heading font-bold text-lg text-gray-900 mb-2 line-clamp-2 group-hover:text-red-600 transition-colors">
                      {blog.title}
                    </h3>
                    <p className="text-gray-600 text-sm line-clamp-3 mb-4">
                      {blog.excerpt || blog.seo_description}
                    </p>
                    <div className="flex items-center text-red-600 text-sm font-medium">
                      Read Article <ArrowRight className="w-4 h-4 ml-1" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            <div className="mt-8 text-center sm:hidden">
              <Link to="/blog" className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 font-medium">
                View All <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* CTA Section */}
      <section className="bg-red-600 py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-heading font-extrabold text-2xl lg:text-4xl text-white uppercase tracking-tight">
            {t('home.cta.title')}
          </h2>
          <p className="text-red-100 mt-4 max-w-xl mx-auto">
            {t('home.cta.subtitle')}
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/contact"
              data-testid="cta-contact-btn"
              className="bg-white text-red-600 hover:bg-gray-100 font-semibold px-8 py-3 rounded-sm transition-colors"
            >
              {t('home.cta.freeTrial')}
            </Link>
            <Link
              to="/pricing"
              className="border border-white/50 hover:border-white text-white font-semibold px-8 py-3 rounded-sm transition-colors"
            >
              {t('home.cta.viewPricing')}
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
