import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PublicLayout from '@/components/PublicLayout';
import { publicAPI } from '@/lib/api';
import { isVideoUrl, resolveMediaUrl } from '@/lib/media';
import { MapPin, Phone, Mail, Clock, ChevronRight, ChevronDown, CheckCircle2, Star } from 'lucide-react';

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
          {isVideoUrl(img.image_path || img.image_url) ? (
            <video
              src={getUrl(img.image_path || img.image_url)}
              className="w-full h-full object-cover"
              muted
              loop
              playsInline
              preload="metadata"
            />
          ) : (
            <img
              src={getUrl(img.image_path || img.image_url)}
              alt={img.title || img.caption || 'Gallery'}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          )}
        </div>
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

export default function LocationPage() {
  const { slug } = useParams();
  const { t, i18n } = useTranslation();
  const [siteSettings, setSiteSettings] = useState(null);
  const [branch, setBranch] = useState(null);
  const [faqs, setFaqs] = useState([]);
  const [gallery, setGallery] = useState([]);
  const [categories, setCategories] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [locationReviews, setLocationReviews] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openFaqIndex, setOpenFaqIndex] = useState(null);
  const [selectedScheduleCategory, setSelectedScheduleCategory] = useState('all');
  const [selectedProgramCategory, setSelectedProgramCategory] = useState('all');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setBranch(null);
        setOpenFaqIndex(null);
        setLocationReviews(null);
        const [settingsRes, branchRes] = await Promise.all([
          publicAPI.getSiteSettings().catch(() => ({ data: null })),
          publicAPI.getBranch(slug).catch(() => ({ data: null }))
        ]);
        
        setSiteSettings(settingsRes.data);
        
        if (branchRes.data) {
          setBranch(branchRes.data);
          const locationId = branchRes.data.location_id;
          
          const [faqsRes, catRes, progRes, schedRes, reviewsRes] = await Promise.all([
            publicAPI.getFaqs(locationId).catch(() => ({ data: [] })),
            publicAPI.getCategories(locationId).catch(() => ({ data: [] })),
            publicAPI.getPrograms(locationId).catch(() => ({ data: [] })),
            publicAPI.getSchedule(locationId).catch(() => ({ data: [] })),
            publicAPI.getBranchGoogleReviews(locationId).catch(() => ({ data: null })),
          ]);
          
          setFaqs(faqsRes.data || []);
          setGallery(branchRes.data?.gallery_images || []);
          setCategories(catRes.data || []);
          setPrograms(progRes.data || []);
          setSchedule(schedRes.data || []);
          setLocationReviews(reviewsRes.data);
        }
      } catch (err) {
        console.error('Failed to load location data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [slug, i18n.language]);

  if (loading) {
    return (
      <PublicLayout siteSettings={siteSettings}>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </PublicLayout>
    );
  }

  if (!branch) {
    return (
      <PublicLayout siteSettings={siteSettings}>
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
          <h1 className="font-heading font-extrabold text-3xl text-gray-900 mb-4">Location Not Found</h1>
          <p className="text-gray-600 mb-8">The location you are looking for doesn't exist or is currently inactive.</p>
          <Link to="/" className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase px-6 py-3 rounded-sm transition-colors">
            Return Home
          </Link>
        </div>
      </PublicLayout>
    );
  }

  const getImageUrl = (path) => resolveMediaUrl(path);

  return (
    <PublicLayout siteSettings={siteSettings}>
      {/* Hero Section */}
      <section className="relative pt-24 pb-16 lg:pt-32 lg:pb-24 bg-zinc-950 overflow-hidden min-h-[500px] flex items-center">
        <div className="absolute inset-0">
          {branch.hero_image_path ? (
            <img 
              src={getImageUrl(branch.hero_image_path)} 
              alt={branch.name} 
              className="w-full h-full object-cover opacity-40"
            />
          ) : (
            <div className="w-full h-full bg-zinc-900"></div>
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-transparent"></div>
        </div>
        
        <div className="relative z-10 w-full px-6 sm:px-8 lg:px-12 xl:px-16">
          <div className="w-full max-w-[1400px] lg:w-[1080px] px-[50px]">
            <div className="inline-flex items-center gap-2 bg-red-600/20 text-red-500 px-3 py-1 rounded-full text-sm font-medium mb-6 border border-red-500/20">
              <MapPin className="w-4 h-4" />
              <span>{branch.city}, {branch.country}</span>
            </div>

            <h2 className="font-heading font-extrabold text-4xl sm:text-5xl lg:text-[60px] text-white uppercase tracking-[1px] mb-6 leading-none max-w-[1200px]">
              {branch.public_title || branch.name}
            </h2>

            <p className="text-lg text-gray-300 mb-8 font-body leading-relaxed max-w-[1000px]">
              {branch.public_description || `Welcome to Spartans ${branch.name}. Join our community and transform your life through martial arts and fitness.`}
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                to={`/join?location=${branch.location_id}`}
                className="bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-sm font-heading font-bold uppercase tracking-wider text-center transition-colors"
              >
                Join This Location
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Video Section */}
      {branch.location_video_path ? (
        <section className="py-10 lg:py-12 bg-white border-t border-zinc-900">
          <div className="w-full px-6 sm:px-8 lg:px-12 xl:px-16">
            <div className="w-full max-w-[1400px] mx-auto">
              <h2 className="text-center font-heading font-extrabold text-xl sm:text-2xl lg:text-3xl text-black uppercase tracking-[1px] mb-6 leading-tight">
                {(branch.video_section_title && branch.video_section_title.trim()) ? branch.video_section_title : 'Location Video'}
              </h2>

              <div className="w-full max-w-4xl mx-auto aspect-video rounded-sm overflow-hidden border border-zinc-800 bg-black">
                <video
                  src={resolveMediaUrl(branch.location_video_path)}
                  poster={branch.location_video_thumbnail_path ? resolveMediaUrl(branch.location_video_thumbnail_path) : undefined}
                  controls
                  autoPlay={!!branch.location_video_autoplay}
                  muted={!!branch.location_video_autoplay}
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* Gallery Section */}
      {gallery.length > 0 && (
        <section className="py-16 lg:py-24 bg-zinc-950 overflow-hidden">
          <div className="text-center mb-12 px-4">
            <h2 className="font-heading font-extrabold text-2xl lg:text-3xl text-white uppercase tracking-tight">
              Location Gallery
            </h2>
            <p className="text-zinc-400 mt-2">Take a look inside {branch.name}</p>
          </div>
          
          <div className="relative flex flex-col gap-3">
            {/* Row 1 - Moves Left */}
            <GalleryRow images={gallery} direction="left" />
            
            {/* Row 2 - Moves Right (only if we have enough images to justify a second row) */}
            {gallery.length > 2 && (
              <GalleryRow images={[...gallery].reverse()} direction="right" />
            )}
          </div>
        </section>
      )}

      {locationReviews?.enabled ? (
        <section className="py-16 lg:py-24 bg-white border-t border-gray-100">
          <div className="mx-auto w-full px-4 sm:px-6 lg:w-[calc(100%-200px)] lg:px-0">
            <div className="text-center mb-12">
              <h2 className="font-heading font-extrabold text-2xl lg:text-3xl text-black uppercase tracking-tight">
                {locationReviews.place_name ? `${locationReviews.place_name} Reviews` : 'Google Reviews'}
              </h2>
              <div className="flex items-center justify-center gap-3 mt-4">
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => {
                    const filled = i < Math.round(locationReviews.rating || 0);
                    return (
                      <Star
                        key={i}
                        className={`w-5 h-5 ${filled ? 'text-yellow-400' : 'text-gray-300'}`}
                        fill={filled ? 'currentColor' : 'none'}
                      />
                    );
                  })}
                </div>
                <span className="font-bold text-lg text-black">{locationReviews.rating || 0}</span>
                <span className="text-gray-500 text-sm">({locationReviews.total_reviews || 0} reviews on Google)</span>
              </div>
            </div>

            {(locationReviews.reviews || []).length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {locationReviews.reviews.slice(0, 6).map((review, i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-sm p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                      {review.profile_photo_url ? (
                        <img
                          src={review.profile_photo_url}
                          alt={review.author_name || 'Reviewer'}
                          className="w-10 h-10 rounded-full"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-100" />
                      )}
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 truncate">{review.author_name || 'Google User'}</p>
                        <p className="text-gray-500 text-xs">{review.relative_time_description || ''}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 mb-3">
                      {Array.from({ length: 5 }).map((_, si) => {
                        const filled = si < Math.round(review.rating || 0);
                        return (
                          <Star
                            key={si}
                            className={`w-4 h-4 ${filled ? 'text-yellow-400' : 'text-gray-300'}`}
                            fill={filled ? 'currentColor' : 'none'}
                          />
                        );
                      })}
                    </div>

                    {review.text ? (
                      <p className="text-gray-600 text-sm leading-relaxed line-clamp-6">{review.text}</p>
                    ) : (
                      <p className="text-gray-400 text-sm italic">No review text</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500">
                No reviews available yet.
              </div>
            )}
          </div>
        </section>
      ) : null}

      {/* Details & Map Section */}
      <section className="py-16 lg:py-24 bg-white">
        <div className="mx-auto w-full px-4 sm:px-6 lg:w-[calc(100%-200px)] lg:px-0">
          <div className="flex flex-col lg:flex-row gap-12 items-start">
            <div className="lg:w-[30%]">
              <h2 className="font-heading font-extrabold text-2xl lg:text-3xl text-black uppercase tracking-tight mb-8">
                Location Details
              </h2>
              
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 mb-1">Address</h3>
                    <p className="text-gray-600">{branch.address}</p>
                    <p className="text-gray-600">{branch.city}, {branch.country}</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                    <Phone className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 mb-1">Contact</h3>
                    <p className="text-gray-600">{branch.phone}</p>
                    <p className="text-gray-600">{branch.email}</p>
                  </div>
                </div>

                {branch.operating_hours && branch.operating_hours.length > 0 && (
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                      <Clock className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 mb-2">Operating Hours</h3>
                      <ul className="space-y-1">
                        {branch.operating_hours.map((hours, i) => (
                          <li key={i} className="text-gray-600 text-sm grid grid-cols-2 gap-4">
                            <span className="font-medium">{hours.day}:</span>
                            <span>{hours.open} - {hours.close}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Map */}
            <div className="lg:w-[70%] h-[400px] bg-gray-100 rounded-sm overflow-hidden border border-gray-200 shadow-sm relative">
              {(() => {
                let mapSrc = branch.map_embed_url;
                
                // Ensure it's not the same URL as our app!
                if (mapSrc && mapSrc.includes('localhost:3010')) {
                  mapSrc = null;
                }
                
                if (mapSrc && mapSrc.includes('<iframe')) {
                  const srcMatch = mapSrc.match(/src=[\"']([^\"']+)[\"']/);
                  if (srcMatch && srcMatch[1]) {
                    mapSrc = srcMatch[1];
                  }
                }
                
                return mapSrc ? (
                  <iframe
                    src={mapSrc}
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    allowFullScreen=""
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title={`Map of ${branch.name}`}
                    className="absolute inset-0"
                  ></iframe>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                    <MapPin className="w-12 h-12 mb-2 opacity-50" />
                    <p>Map not available</p>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </section>

      {/* Programs Section */}
      {programs.length > 0 && (
        <section className="py-16 lg:py-24 bg-gray-50">
          <div className="mx-auto w-full px-4 sm:px-6 lg:w-[calc(100%-200px)] lg:px-0">
            <div className="text-center mb-12">
              <h2 className="font-heading font-extrabold text-2xl lg:text-3xl text-black uppercase tracking-tight">
                Programs at {branch.name}
              </h2>
              <p className="text-gray-600 mt-2">Discover what we offer at this location</p>
            </div>
            
            {/* Category Filter for Programs */}
            {categories.length > 0 && (
              <div className="flex justify-center flex-wrap gap-2 mb-8">
                <button
                  onClick={() => setSelectedProgramCategory('all')}
                  className={`px-4 py-2 rounded-sm text-sm font-heading uppercase tracking-wider transition-colors ${
                    selectedProgramCategory === 'all'
                      ? 'bg-red-600 text-white'
                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  All Programs
                </button>
                {categories.map(c => (
                  <button
                    key={c.category_id}
                    onClick={() => setSelectedProgramCategory(c.category_id)}
                    className={`px-4 py-2 rounded-sm text-sm font-heading uppercase tracking-wider transition-colors ${
                      selectedProgramCategory === c.category_id
                        ? 'bg-red-600 text-white'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            
            {programs.filter(prog => selectedProgramCategory === 'all' || prog.category_id === selectedProgramCategory).length === 0 ? (
              <div className="text-center py-12 bg-white border border-dashed border-gray-200 rounded-sm">
                <p className="text-gray-500 font-heading uppercase tracking-wider">No programs found for this category</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {programs
                  .filter(prog => selectedProgramCategory === 'all' || prog.category_id === selectedProgramCategory)
                  .map(prog => {
                    const category = categories.find(c => c.category_id === prog.category_id);
                    return (
                      <div key={prog.program_id} className="bg-white p-6 rounded-sm shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xs font-bold px-2 py-1 bg-red-50 text-red-600 rounded-sm uppercase tracking-wider">
                            {category?.name || 'Program'}
                          </span>
                          {prog.difficulty_level && (
                            <span className="text-xs font-bold px-2 py-1 bg-gray-100 text-gray-600 rounded-sm uppercase tracking-wider">
                              {prog.difficulty_level}
                            </span>
                          )}
                        </div>
                        <h3 className="font-heading font-bold text-xl text-gray-900 mb-2">{prog.name}</h3>
                        <p className="text-gray-600 text-sm line-clamp-3 mb-4">{prog.description}</p>
                      </div>
                    );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Schedule Section */}
      {schedule.length > 0 && (
        <section className="py-16 lg:py-24 bg-white border-t border-gray-100">
          <div className="mx-auto w-full px-4 sm:px-6 lg:w-[calc(100%-200px)] lg:px-0">
            <div className="text-center mb-12">
              <h2 className="font-heading font-extrabold text-2xl lg:text-3xl text-black uppercase tracking-tight">
                Class Schedule
              </h2>
              <p className="text-gray-600 mt-2 max-w-5xl mx-auto">
                Find the perfect time to train. Our schedule is designed to accommodate all levels, from beginners to advanced fighters.
              </p>
            </div>

            {/* Category Filter for Schedule */}
            {categories.length > 0 && (
              <div className="flex justify-center flex-wrap gap-2 mb-8">
                <button
                  onClick={() => setSelectedScheduleCategory('all')}
                  className={`px-4 py-2 rounded-sm text-sm font-heading uppercase tracking-wider transition-colors ${
                    selectedScheduleCategory === 'all'
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  All Classes
                </button>
                {categories.map(c => (
                  <button
                    key={c.category_id}
                    onClick={() => setSelectedScheduleCategory(c.category_id)}
                    className={`px-4 py-2 rounded-sm text-sm font-heading uppercase tracking-wider transition-colors ${
                      selectedScheduleCategory === c.category_id
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            
            {schedule.filter(s => {
              const prog = programs.find(p => p.program_id === s.program_id);
              return selectedScheduleCategory === 'all' || prog?.category_id === selectedScheduleCategory;
            }).length === 0 ? (
              <div className="text-center py-12 bg-gray-50 border border-dashed border-gray-200 rounded-sm">
                <p className="text-gray-500 font-heading uppercase tracking-wider">No schedules found for this category</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr>
                      {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
                        <th key={day} className="p-4 bg-gray-50 border-b-2 border-gray-200 font-heading font-bold text-gray-900 uppercase tracking-wider text-sm w-[14.28%]">
                          {day}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, dayIndex) => {
                        // Filter sessions for this day and category
                        const daySessions = schedule.filter(s => {
                          const prog = programs.find(p => p.program_id === s.program_id);
                          if (selectedScheduleCategory !== 'all' && prog?.category_id !== selectedScheduleCategory) {
                            return false;
                          }

                          // The backend returns class_schedules which uses `day_of_week` (0=Monday, 1=Tuesday, ... 6=Sunday)
                          if (s.day_of_week !== undefined) {
                            return s.day_of_week === dayIndex;
                          }
                          
                          // Fallback if data is missing day_of_week but has start_time
                          if (s.start_time && s.start_time.includes('T')) {
                            const date = new Date(s.start_time);
                            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                            return days[date.getDay()] === day;
                          }
                          
                          return false;
                        }).sort((a, b) => {
                          // Sort by start_time string (e.g. "09:00" vs "18:00")
                          if (a.start_time && b.start_time) {
                            return a.start_time.localeCompare(b.start_time);
                          }
                          return 0;
                        });

                        return (
                          <td key={day} className="p-2 border-b border-gray-100 align-top h-full">
                            <div className="space-y-3">
                              {daySessions.length > 0 ? daySessions.map((session, idx) => {
                                const prog = programs.find(p => p.program_id === session.program_id);
                                
                                // Format the time string (assuming it comes as "HH:MM" or similar from schedule)
                                let timeStr = session.start_time;
                                if (timeStr && timeStr.includes('T')) {
                                  const startDate = new Date(session.start_time);
                                  timeStr = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                } else if (timeStr && timeStr.length === 5) {
                                  // Convert 24h to 12h format if it's a simple HH:MM string
                                  const [h, m] = timeStr.split(':');
                                  const d = new Date();
                                  d.setHours(parseInt(h, 10), parseInt(m, 10));
                                  timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                }
                                
                                return (
                                  <div key={idx} className="bg-gray-50 rounded-sm p-3 border border-gray-100 hover:border-red-200 transition-colors">
                                    <div className="text-xs font-bold text-red-600 mb-1">{timeStr}</div>
                                    <div className="text-sm font-bold text-gray-900 leading-tight">
                                      {prog ? prog.name : 'Class Session'}
                                    </div>
                                    {session.instructor_id && (
                                      <div className="text-xs text-gray-500 mt-1">
                                        {/* We don't have instructor list here, but we can just show it's scheduled */}
                                        {session.room ? `Room: ${session.room}` : 'Scheduled'}
                                      </div>
                                    )}
                                  </div>
                                );
                              }) : (
                                <div className="text-sm text-gray-400 text-center py-4 italic">No classes</div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* FAQs Section */}
      {faqs.length > 0 && (
        <section className="py-16 lg:py-24 bg-white">
          <div className="mx-auto w-full px-4 sm:px-6 lg:w-[calc(100%-200px)] lg:px-0">
            <div className="text-center mb-12">
              <h2 className="font-heading font-extrabold text-2xl lg:text-3xl text-black uppercase tracking-tight">
                Location FAQs
              </h2>
              <p className="text-gray-600 mt-2">Questions specific to {branch.name}</p>
            </div>
            <div className="divide-y divide-gray-200 border-t border-gray-200">
              {faqs.map((faq, i) => (
                <FaqItem 
                  key={faq.faq_id || i} 
                  question={faq.question} 
                  answer={faq.answer} 
                  isOpen={openFaqIndex === i}
                  onToggle={() => setOpenFaqIndex(openFaqIndex === i ? null : i)}
                />
              ))}
            </div>
          </div>
        </section>
      )}

    </PublicLayout>
  );
}
