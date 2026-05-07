import { useEffect, useMemo, useState } from 'react';
import { membersAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download.html';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function openBlobInNewTab(blob) {
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (!w) window.location.href = url;
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function MemberDocumentsPanel({ memberId, locationId }) {
  const [loading, setLoading] = useState(true);
  const [signedAgreements, setSignedAgreements] = useState([]);
  const [acceptedTerms, setAcceptedTerms] = useState([]);

  const latestAgreement = useMemo(() => {
    const rows = [...(signedAgreements || [])];
    rows.sort((a, b) => String(b.signed_at || b.created_at || '').localeCompare(String(a.signed_at || a.created_at || '')));
    return rows[0] || null;
  }, [signedAgreements]);

  const latestTerms = useMemo(() => {
    const rows = [...(acceptedTerms || [])];
    rows.sort((a, b) => String(b.accepted_at || '').localeCompare(String(a.accepted_at || '')));
    return rows[0] || null;
  }, [acceptedTerms]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!memberId) return;
      setLoading(true);
      try {
        const [aRes, tRes] = await Promise.all([
          membersAPI.getSignedAgreements(memberId, locationId).catch(() => ({ data: { signed_agreements: [] } })),
          membersAPI.getAcceptedTerms(memberId, locationId).catch(() => ({ data: { accepted_terms: [] } })),
        ]);
        if (!mounted) return;
        setSignedAgreements(aRes.data?.signed_agreements || []);
        setAcceptedTerms(tRes.data?.accepted_terms || []);
      } catch {
        if (mounted) toast.error('Failed to load documents');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [memberId, locationId]);

  const handleView = async () => {
    if (!latestAgreement) return;
    try {
      const res = await membersAPI.viewRegistrationDocumentPdf(memberId, locationId);
      openBlobInNewTab(res.data);
    } catch {
      toast.error('Failed to load document');
    }
  };

  const handleDownload = async () => {
    if (!latestAgreement) return;
    try {
      const res = await membersAPI.downloadRegistrationDocumentPdf(memberId, locationId);
      downloadBlob(res.data, `registration-${memberId}.pdf`);
    } catch {
      toast.error('Failed to download document');
    }
  };

  return (
    <div className="space-y-4">
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="border-b border-zinc-800">
          <CardTitle className="text-white font-heading uppercase tracking-wide text-lg">Documents</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {loading ? (
            <div className="text-zinc-500 text-sm">Loading…</div>
          ) : (
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-zinc-400 text-xs font-heading uppercase tracking-wider">Signed Registration Document</div>
                {latestAgreement ? (
                  <div className="mt-1 space-y-1">
                    <div className="text-white text-sm">Signed Registration Document</div>
                    <div className="text-zinc-500 text-xs">
                      Agreement: {latestAgreement.document_snapshot?.title || '—'}{latestAgreement.document_snapshot?.version ? ` (v${latestAgreement.document_snapshot.version})` : ''} • {_fmt(latestAgreement.signed_at)}
                    </div>
                    <div className="text-zinc-500 text-xs">
                      Terms: {latestTerms?.title || '—'}{latestTerms?.version ? ` (${latestTerms.version})` : ''} • {_fmt(latestTerms?.accepted_at)}
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 text-zinc-500 text-sm">No signed agreement found.</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="border-zinc-800 text-zinc-300" disabled={!latestAgreement} onClick={handleView}>View</Button>
                <Button variant="outline" className="border-zinc-800 text-zinc-300" disabled={!latestAgreement} onClick={handleDownload}>Download</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function _fmt(v) {
  if (!v) return '—';
  return String(v).slice(0, 19).replace('T', ' ');
}
