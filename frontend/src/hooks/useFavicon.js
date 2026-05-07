import { useState, useEffect } from 'react';
import { publicAPI } from '@/lib/api';
import { resolveMediaUrl } from '@/lib/media';

let cachedFaviconUrl = null;
let fetchPromise = null;

export function useFavicon() {
  const [faviconUrl, setFaviconUrl] = useState(cachedFaviconUrl || '/favicon.png');

  useEffect(() => {
    if (cachedFaviconUrl) {
      setFaviconUrl(cachedFaviconUrl);
      if (/\.gif(\?.*)?$/i.test(cachedFaviconUrl)) {
        (async () => {
          try {
            const headRes = await fetch(cachedFaviconUrl, { method: 'HEAD' });
            const size = Number(headRes.headers.get('content-length') || 0);
            if (Number.isFinite(size) && size > 10 * 1024 * 1024) {
              cachedFaviconUrl = '/favicon.png';
              setFaviconUrl('/favicon.png');
            }
          } catch {}
        })();
      }
      return;
    }

    if (!fetchPromise) {
      fetchPromise = publicAPI.getSiteSettings()
        .then(async (res) => {
          if (res.data?.favicon_url) {
            const url = resolveMediaUrl(res.data.favicon_url);
            if (/\.gif(\?.*)?$/i.test(url)) {
              try {
                const headRes = await fetch(url, { method: 'HEAD' });
                const size = Number(headRes.headers.get('content-length') || 0);
                if (Number.isFinite(size) && size > 10 * 1024 * 1024) {
                  cachedFaviconUrl = '/favicon.png';
                  return '/favicon.png';
                }
              } catch {}
            }
            cachedFaviconUrl = url;
            return url;
          }
          cachedFaviconUrl = '/favicon.png';
          return '/favicon.png';
        })
        .catch(() => {
          cachedFaviconUrl = '/favicon.png';
          return '/favicon.png';
        });
    }

    fetchPromise.then(url => {
      setFaviconUrl(url);
    });
  }, []);

  return faviconUrl;
}
