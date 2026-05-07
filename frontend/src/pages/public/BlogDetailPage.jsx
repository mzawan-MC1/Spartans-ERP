import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import PublicLayout from '@/components/PublicLayout';
import { publicAPI, blogsAPI } from '@/lib/api';
import { isVideoUrl, resolveMediaUrl } from '@/lib/media';
import { Loader2, Calendar, ArrowLeft, Tag } from 'lucide-react';

export default function BlogDetailPage() {
  const { slug } = useParams();
  const { i18n } = useTranslation();
  const [blog, setBlog] = useState(null);
  const [siteSettings, setSiteSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const getUrl = (url) => resolveMediaUrl(url);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [settingsRes, blogRes] = await Promise.all([
          publicAPI.getSiteSettings().catch(() => ({ data: null })),
          blogsAPI.getPublicBySlug(slug),
        ]);
        setSiteSettings(settingsRes.data);
        setBlog(blogRes.data);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, [slug, i18n.language]);

  if (loading) return <div className="min-h-screen bg-white flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-red-600" /></div>;
  if (!blog) return (
    <PublicLayout siteSettings={siteSettings}>
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <h1 className="font-heading text-2xl text-black mb-4">Blog post not found</h1>
        <Link to="/blog" className="text-red-600 hover:text-red-700 font-medium">Back to Blog</Link>
      </div>
    </PublicLayout>
  );

  return (
    <PublicLayout siteSettings={siteSettings}>
      <Helmet>
        {(blog.seo_title || blog.title) && <title>{blog.seo_title || blog.title}</title>}
        {blog.seo_description && <meta name="description" content={blog.seo_description} />}
        {blog.seo_keywords && <meta name="keywords" content={blog.seo_keywords} />}
        {blog.og_image && <meta property="og:image" content={getUrl(blog.og_image)} />}
        {(blog.seo_title || blog.title) && <meta property="og:title" content={blog.seo_title || blog.title} />}
        <meta property="og:type" content="article" />
      </Helmet>

      <article className="py-12 lg:py-20">
        <div className="w-[85%] max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link to="/blog" className="inline-flex items-center gap-1 text-gray-500 hover:text-red-600 text-sm mb-6">
            <ArrowLeft className="w-4 h-4" /> Back to Blog
          </Link>

          <div className="flex items-center gap-3 text-gray-400 text-sm mb-4">
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {(blog.created_at || '').slice(0, 10)}</span>
            {blog.author && <span>by {blog.author}</span>}
          </div>

          <h1 className="font-heading font-extrabold text-3xl lg:text-4xl text-black uppercase tracking-tight mb-6" data-testid="blog-detail-title">
            {blog.title}
          </h1>

          {blog.featured_image && (
            <div className="rounded-sm overflow-hidden mb-8">
              {isVideoUrl(getUrl(blog.featured_image)) ? (
                <video
                  src={getUrl(blog.featured_image)}
                  className="w-full h-auto max-h-[400px] object-cover"
                  muted
                  loop
                  playsInline
                  preload="metadata"
                />
              ) : (
                <img src={getUrl(blog.featured_image)} alt={blog.title} className="w-full h-auto max-h-[400px] object-cover" />
              )}
            </div>
          )}

          <div
            className="prose prose-lg max-w-none text-gray-700 text-justify break-words whitespace-normal blog-content"
            dangerouslySetInnerHTML={{ __html: blog.content_html }}
            data-testid="blog-content"
          />

          {blog.tags?.length > 0 && (
            <div className="mt-8 pt-6 border-t border-gray-200 flex items-center gap-2 flex-wrap">
              <Tag className="w-4 h-4 text-gray-400" />
              {blog.tags.map((t, i) => (
                <span key={i} className="bg-gray-100 text-gray-600 px-3 py-1 rounded-sm text-sm">{t}</span>
              ))}
            </div>
          )}
        </div>
      </article>
    </PublicLayout>
  );
}
