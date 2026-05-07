import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PublicLayout from '@/components/PublicLayout';
import { publicAPI, blogsAPI } from '@/lib/api';
import { isVideoUrl, resolveMediaUrl } from '@/lib/media';
import { Loader2, Calendar, ArrowRight } from 'lucide-react';

export default function BlogListPage() {
  const { i18n } = useTranslation();
  const [blogs, setBlogs] = useState([]);
  const [siteSettings, setSiteSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const getUrl = (url) => resolveMediaUrl(url);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [settingsRes, blogsRes] = await Promise.all([
          publicAPI.getSiteSettings().catch(() => ({ data: null })),
          blogsAPI.getPublic().catch(() => ({ data: { blogs: [] } })),
        ]);
        setSiteSettings(settingsRes.data);
        setBlogs(blogsRes.data.blogs || []);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, [i18n.language]);

  if (loading) return <div className="min-h-screen bg-white flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-red-600" /></div>;

  return (
    <PublicLayout siteSettings={siteSettings}>
      <section className="py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="font-heading font-extrabold text-3xl lg:text-4xl text-black uppercase tracking-tight mb-4" data-testid="blog-list-title">Blog</h1>
          <p className="text-gray-600 mb-10">Latest news, tips, and updates from Spartans</p>

          {blogs.length === 0 ? (
            <p className="text-gray-500 py-12 text-center">No blog posts yet. Check back soon!</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {blogs.map(b => (
                <Link key={b.blog_id} to={`/blog/${b.slug}`} className="group" data-testid={`blog-card-${b.slug}`}>
                  {b.featured_image && (
                    <div className="h-48 rounded-sm overflow-hidden mb-4">
                      {isVideoUrl(getUrl(b.featured_image)) ? (
                        <video
                          src={getUrl(b.featured_image)}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          muted
                          loop
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <img src={getUrl(b.featured_image)} alt={b.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
                    <Calendar className="w-3.5 h-3.5" />
                    {(b.created_at || '').slice(0, 10)}
                    {b.tags?.length > 0 && <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded-sm text-xs">{b.tags[0]}</span>}
                  </div>
                  <h2 className="font-heading font-bold text-lg text-black group-hover:text-red-600 transition-colors">{b.title}</h2>
                  <p className="text-gray-600 text-sm mt-2 line-clamp-2">{b.excerpt}</p>
                  <div className="mt-3 flex items-center gap-1 text-red-600 text-sm font-medium">Read more <ArrowRight className="w-4 h-4" /></div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </PublicLayout>
  );
}
