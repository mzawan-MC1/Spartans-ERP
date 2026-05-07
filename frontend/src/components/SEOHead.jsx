import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { seoAPI, publicAPI } from '@/lib/api';
import { resolveMediaUrl } from '@/lib/media';

export default function SEOHead() {
  const location = useLocation();
  const [pageTitle, setPageTitle] = useState('');
  const [metaDesc, setMetaDesc] = useState('');
  const [metaKeywords, setMetaKeywords] = useState('');
  const [headCode, setHeadCode] = useState('');
  const [bodyCode, setBodyCode] = useState('');
  const [faviconUrl, setFaviconUrl] = useState('');

  // Fetch Site Settings for Favicon (Applies to all pages)
  useEffect(() => {
    publicAPI.getSiteSettings()
      .then(res => {
        if (res.data?.favicon_url) {
          setFaviconUrl(resolveMediaUrl(res.data.favicon_url));
        }
      })
      .catch(() => {});
  }, []);

  // Inject favicon manually to ensure it overrides index.html defaults
  useEffect(() => {
    if (!faviconUrl) return;

    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = faviconUrl;
  }, [faviconUrl]);

  useEffect(() => {
    // Only fetch SEO for public pages
    const publicPaths = ['/', '/disciplines', '/pricing', '/branches', '/faqs', '/contact', '/blog'];
    const isPublic = publicPaths.some(
      p => location.pathname === p || location.pathname.startsWith('/blog/')
    );
    if (!isPublic) {
      // Reset for non-public pages
      setPageTitle('');
      setMetaDesc('');
      setMetaKeywords('');
      setHeadCode('');
      setBodyCode('');
      return;
    }
    
    const pagePath = location.pathname === '/' ? '%2F' : location.pathname.split('/')[1];
    
    seoAPI.getPublic(pagePath)
      .then(res => {
        const data = res.data || {};
        const page = data.page || {};
        const global = data.global || {};
        
        // Safely extract strings, ensuring they're actual strings
        setPageTitle(typeof page.page_title === 'string' ? page.page_title : '');
        setMetaDesc(typeof page.meta_description === 'string' ? page.meta_description : '');
        setMetaKeywords(typeof page.meta_keywords === 'string' ? page.meta_keywords : '');
        
        // Combine global and page-specific code
        const combinedHead = [global.head_code, page.head_code].filter(Boolean).join('\n');
        const combinedBody = [global.body_code, page.body_code].filter(Boolean).join('\n');
        setHeadCode(combinedHead);
        setBodyCode(combinedBody);
      })
      .catch(() => {
        // Reset on error
        setPageTitle('');
        setMetaDesc('');
        setMetaKeywords('');
        setHeadCode('');
        setBodyCode('');
      });
  }, [location.pathname]);

  // Inject code snippets into DOM
  useEffect(() => {
    if (!headCode) return;
    const injected = injectCode(headCode, 'head');
    return () => removeInjected(injected);
  }, [headCode]);

  useEffect(() => {
    if (!bodyCode) return;
    const injected = injectCode(bodyCode, 'body');
    return () => removeInjected(injected);
  }, [bodyCode]);

  // Don't render Helmet at all if no SEO data
  if (!pageTitle && !metaDesc && !metaKeywords) {
    return null;
  }

  return (
    <Helmet>
      {pageTitle && <title>{pageTitle}</title>}
      {metaDesc && <meta name="description" content={metaDesc} />}
      {metaKeywords && <meta name="keywords" content={metaKeywords} />}
    </Helmet>
  );
}

// Helper to inject code into head/body
function injectCode(code, target) {
  if (!code || typeof code !== 'string') return [];
  
  const container = document.createElement('div');
  container.innerHTML = code;
  const targetEl = target === 'head' ? document.head : document.body;
  const injected = [];

  container.childNodes.forEach(node => {
    // Skip title elements
    if (node.nodeName === 'TITLE') return;
    
    if (node.nodeName === 'SCRIPT') {
      const script = document.createElement('script');
      if (node.src) script.src = node.src;
      if (node.textContent) script.textContent = node.textContent;
      if (node.type) script.type = node.type;
      targetEl.appendChild(script);
      injected.push(script);
    } else if (node.nodeType === 1) { // Element node
      const clone = node.cloneNode(true);
      targetEl.appendChild(clone);
      injected.push(clone);
    }
  });

  return injected;
}

function removeInjected(elements) {
  elements.forEach(el => {
    try { el.parentNode?.removeChild(el); } catch {}
  });
}
