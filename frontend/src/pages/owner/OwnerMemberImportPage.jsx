import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Upload, Download, FileSpreadsheet, ArrowLeft, Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import TopNav from '@/components/TopNav';
import { authAPI, locationAPI, membersAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

const CSV_TEMPLATE = `full_name,phone,email,gender,dob,address,emergency_contact_name,emergency_contact_phone,emergency_contact_relation,medical_conditions,medical_injuries,medical_allergies,medical_medications,medical_notes
John Doe,+971501234567,john@example.com,male,1990-01-15,123 Main St,Jane Doe,+971507654321,Spouse,None,None,None,None,
Sarah Smith,+971502345678,sarah@example.com,female,1985-05-20,456 Oak Ave,Mike Smith,+971508765432,Brother,Asthma,Previous knee injury,Peanuts,Ventolin inhaler,Check before intense cardio
`;

function downloadText(filename, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const splitLine = (line) => {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        const next = line[i + 1];
        if (inQuotes && next === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((v) => v.trim());
  };

  const headers = splitLine(lines[0]).map((h) => h.replace(/^\uFEFF/, '').trim());
  const rows = lines.slice(1).map((line) => {
    const vals = splitLine(line);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = vals[idx] ?? '';
    });
    return row;
  });
  return { headers, rows };
}

function normalize(v) {
  return (v ?? '').toString().trim();
}

function validateRow(row, seenPhones, seenEmails) {
  const errors = [];
  const full_name = normalize(row.full_name);
  const phone = normalize(row.phone);
  const email = normalize(row.email).toLowerCase();

  if (!full_name) errors.push('full_name is required');
  if (!phone && !email) errors.push('phone or email is required');

  if (phone) {
    const cleanedPhone = phone.replace(/[()\-\s]/g, '');
    if (cleanedPhone.length < 7) errors.push(`Invalid phone: ${phone}`);
    if (seenPhones.has(phone)) errors.push(`Duplicate phone in file: ${phone}`);
  }
  if (email) {
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!ok) errors.push(`Invalid email: ${email}`);
    if (seenEmails.has(email)) errors.push(`Duplicate email in file: ${email}`);
  }

  if (phone) seenPhones.add(phone);
  if (email) seenEmails.add(email);

  return { ok: errors.length === 0, errors };
}

export default function OwnerMemberImportPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const [user, setUser] = useState(null);
  const [locations, setLocations] = useState([]);
  const [currentLocation, setCurrentLocation] = useState(null);

  const locationId = useMemo(() => searchParams.get('location_id') || currentLocation?.location_id || '', [currentLocation?.location_id, searchParams]);

  const [step, setStep] = useState('upload');
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [importMode, setImportMode] = useState('upsert');
  const [preview, setPreview] = useState(null);
  const [job, setJob] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [meRes, locRes] = await Promise.all([authAPI.getMe(), locationAPI.list()]);
        setUser(meRes.data);
        setLocations(locRes.data || []);
        const qp = searchParams.get('location_id');
        const initial = (locRes.data || []).find((l) => l.location_id === qp) || (locRes.data || [])[0] || null;
        setCurrentLocation(initial);
      } catch {
        navigate('/login', { replace: true });
      }
    };
    load();
  }, [navigate, searchParams]);

  useEffect(() => {
    if (!currentLocation) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('location_id', currentLocation.location_id);
      return next;
    }, { replace: true });
  }, [currentLocation, setSearchParams]);

  const handleLocationSwitch = (loc) => {
    setCurrentLocation(loc);
    if (loc?.location_id) navigate(`/owner/members/import?location_id=${encodeURIComponent(loc.location_id)}`, { replace: true });
  };

  const backToMembers = useCallback(() => {
    navigate(`/owner/members${locationId ? `?location_id=${encodeURIComponent(locationId)}` : ''}`);
  }, [locationId, navigate]);

  const handleDownloadTemplate = () => {
    downloadText('members_import_template.csv', CSV_TEMPLATE, 'text/csv');
    toast.success('Template downloaded');
  };

  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    if (!selectedFile.name.toLowerCase().endsWith('.csv')) return toast.error('Please select a CSV file');
    if (!locationId) return toast.error('Select a branch first');

    setFile(selectedFile);
    setLoading(true);
    try {
      const text = await selectedFile.text();
      const { headers, rows } = parseCsv(text);
      const seenPhones = new Set();
      const seenEmails = new Set();
      const rowErrors = [];
      const previewData = [];
      let valid = 0;
      let invalid = 0;

      rows.forEach((r, idx) => {
        const { ok, errors } = validateRow(r, seenPhones, seenEmails);
        if (ok) valid += 1; else invalid += 1;
        if (!ok) rowErrors.push({ row: idx + 2, errors, row_data: r });
        if (previewData.length < 10) previewData.push({ row: idx + 2, ok, data: r, errors });
      });

      setPreview({
        headers,
        total_rows: rows.length,
        valid_rows: valid,
        error_rows: invalid,
        preview_data: previewData,
        row_errors: rowErrors,
      });
      setStep('preview');
      toast.success(`Preview loaded: ${rows.length} rows found`);
    } catch {
      toast.error('Failed to read CSV');
      setFile(null);
      setPreview(null);
      setStep('upload');
    } finally {
      setLoading(false);
    }
  };

  const upsertMember = async (row) => {
    const payload = {
      full_name: normalize(row.full_name),
      phone: normalize(row.phone),
      email: normalize(row.email),
      gender: normalize(row.gender),
      dob: normalize(row.dob),
      address: normalize(row.address),
      emergency_contact: {
        name: normalize(row.emergency_contact_name),
        phone: normalize(row.emergency_contact_phone),
        relation: normalize(row.emergency_contact_relation),
      },
      medical: {
        conditions: normalize(row.medical_conditions),
        injuries: normalize(row.medical_injuries),
        allergies: normalize(row.medical_allergies),
        medications: normalize(row.medical_medications),
        notes: normalize(row.medical_notes),
      },
    };

    const hasEmergency = payload.emergency_contact.name || payload.emergency_contact.phone || payload.emergency_contact.relation;
    const hasMedical = payload.medical.conditions || payload.medical.injuries || payload.medical.allergies || payload.medical.medications || payload.medical.notes;
    if (!hasEmergency) delete payload.emergency_contact;
    if (!hasMedical) delete payload.medical;

    if (importMode === 'create_only') {
      const res = await membersAPI.create(payload, locationId);
      return { action: 'created', member: res.data };
    }

    const lookup = payload.phone || payload.email;
    const res = await membersAPI.list(locationId, { status: 'all', search: lookup });
    const candidates = res.data.members || [];
    const existing = candidates.find((m) => (payload.phone && m.phone === payload.phone) || (payload.email && (m.email || '').toLowerCase() === payload.email.toLowerCase()));

    if (existing?.member_id) {
      await membersAPI.update(existing.member_id, payload, locationId);
      return { action: 'updated', member: existing };
    }
    const created = await membersAPI.create(payload, locationId);
    return { action: 'created', member: created.data };
  };

  const handleStartImport = async () => {
    if (!preview || !file) return toast.error('No file selected');
    if (!locationId) return toast.error('Select a branch first');

    const text = await file.text();
    const { rows } = parseCsv(text);
    const seenPhones = new Set();
    const seenEmails = new Set();
    const validRows = [];
    const errors = [];

    rows.forEach((r, idx) => {
      const { ok, errors: rowErrs } = validateRow(r, seenPhones, seenEmails);
      if (ok) validRows.push({ rowNum: idx + 2, row: r });
      else errors.push({ row: idx + 2, errors: rowErrs, row_data: r });
    });

    setJob({ status: 'running', total: validRows.length, processed: 0, success: 0, failed: errors.length, progress: 0, errors });
    setStep('importing');

    for (let i = 0; i < validRows.length; i++) {
      const { rowNum, row } = validRows[i];
      try {
        await upsertMember(row);
        setJob((j) => {
          const processed = (j.processed || 0) + 1;
          const success = (j.success || 0) + 1;
          const progress = j.total ? Math.round((processed / j.total) * 100) : 0;
          return { ...j, processed, success, progress };
        });
      } catch (err) {
        const msg = err.response?.data?.detail || 'Import failed';
        setJob((j) => {
          const processed = (j.processed || 0) + 1;
          const failed = (j.failed || 0) + 1;
          const progress = j.total ? Math.round((processed / j.total) * 100) : 0;
          return { ...j, processed, failed, progress, errors: [...(j.errors || []), { row: rowNum, errors: [msg], row_data: row }] };
        });
      }
    }

    setJob((j) => ({ ...j, status: (j.failed || 0) > 0 ? 'completed_with_errors' : 'completed' }));
    setStep('complete');
    toast.success('Import finished');
  };

  const handleDownloadErrors = () => {
    if (!job?.errors?.length) return;
    const headers = preview?.headers || Object.keys(job.errors[0].row_data || {});
    const rows = job.errors.map((e) => {
      const row = headers.map((h) => JSON.stringify(e.row_data?.[h] ?? '')).join(',');
      return `${row},${JSON.stringify((e.errors || []).join(' | '))}`;
    });
    downloadText('members_import_errors.csv', `${headers.join(',')},errors\n${rows.join('\n')}\n`, 'text/csv');
    toast.success('Errors downloaded');
  };

  const handleReset = () => {
    setStep('upload');
    setFile(null);
    setPreview(null);
    setJob(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen bg-[#09090b]">
      <TopNav user={user} locations={locations} currentLocation={currentLocation} onLocationSwitch={handleLocationSwitch} />
      <div className="p-6 sm:p-8 lg:p-10 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={backToMembers}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2 font-heading uppercase tracking-wide">
              <Upload className="h-6 w-6 text-orange-500" />
              Bulk Member Import
            </h1>
            <p className="text-zinc-400 text-sm">Import members from a CSV file (branch required)</p>
          </div>
          {locationId && <Badge className="ml-auto bg-zinc-800 text-zinc-300 border border-zinc-700">{locationId}</Badge>}
        </div>

        {step === 'upload' && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white">Upload CSV File</CardTitle>
              <CardDescription>Download the template, fill your member data, then upload the CSV file.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-zinc-800 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-8 w-8 text-green-500" />
                  <div>
                    <p className="font-medium text-white">CSV Template</p>
                    <p className="text-sm text-zinc-400">Template columns for member details</p>
                  </div>
                </div>
                <Button variant="outline" onClick={handleDownloadTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>

              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                  locationId ? 'border-zinc-700 hover:border-orange-500/50' : 'border-zinc-800 opacity-60 cursor-not-allowed'
                }`}
                onClick={() => locationId && fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="owner-csv-file-input"
                />
                {loading ? (
                  <Loader2 className="h-12 w-12 text-orange-500 mx-auto mb-4 animate-spin" />
                ) : (
                  <Upload className="h-12 w-12 text-zinc-500 mx-auto mb-4" />
                )}
                <p className="text-white font-medium mb-1">{loading ? 'Processing...' : 'Click to upload CSV file'}</p>
                <p className="text-sm text-zinc-500">{locationId ? 'CSV only' : 'Select a branch from the top first'}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'preview' && preview && (
          <div className="space-y-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white">Preview</CardTitle>
                <CardDescription>Review rows before importing</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  <Badge className="bg-zinc-800 text-zinc-300 border border-zinc-700">Total: {preview.total_rows}</Badge>
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Valid: {preview.valid_rows}</Badge>
                  <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Errors: {preview.error_rows}</Badge>
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-300">Import Mode</Label>
                  <RadioGroup value={importMode} onValueChange={setImportMode} className="flex gap-6">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="upsert" id="upsert" />
                      <Label htmlFor="upsert" className="text-zinc-300">Upsert</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="create_only" id="create_only" />
                      <Label htmlFor="create_only" className="text-zinc-300">Create Only</Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleStartImport} className="bg-red-600 hover:bg-red-700 text-white" disabled={preview.valid_rows === 0}>
                    Start Import
                  </Button>
                  <Button variant="outline" onClick={handleReset}>Choose Another File</Button>
                </div>

                <div className="space-y-2">
                  {preview.preview_data.map((r) => (
                    <div key={r.row} className="flex items-center justify-between bg-zinc-800/50 border border-zinc-700 rounded p-3 text-sm">
                      <div className="text-zinc-300">
                        Row {r.row}: <span className="text-white">{normalize(r.data.full_name) || '—'}</span>
                        <span className="text-zinc-500 ml-2">{normalize(r.data.phone) || normalize(r.data.email) || ''}</span>
                      </div>
                      {r.ok ? <CheckCircle className="h-4 w-4 text-green-400" /> : <XCircle className="h-4 w-4 text-red-400" />}
                    </div>
                  ))}
                </div>

                {preview.row_errors.length > 0 && (
                  <div className="bg-zinc-800/50 border border-zinc-700 rounded p-4">
                    <div className="flex items-center gap-2 text-zinc-300 mb-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      <span className="font-medium">Row Errors</span>
                    </div>
                    <div className="space-y-1 text-sm text-zinc-400 max-h-48 overflow-auto">
                      {preview.row_errors.slice(0, 20).map((e) => (
                        <div key={e.row}>Row {e.row}: {e.errors.join(', ')}</div>
                      ))}
                      {preview.row_errors.length > 20 && (
                        <div>…and {preview.row_errors.length - 20} more</div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {step === 'importing' && job && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white">Importing…</CardTitle>
              <CardDescription>Do not close this page</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={job.progress || 0} />
              <div className="flex flex-wrap gap-3 text-sm">
                <Badge className="bg-zinc-800 text-zinc-300 border border-zinc-700">Processed: {job.processed}/{job.total}</Badge>
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Success: {job.success}</Badge>
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Failed: {job.failed}</Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'complete' && job && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white">Import Complete</CardTitle>
              <CardDescription>{job.status === 'completed' ? 'All rows imported successfully.' : 'Completed with some errors.'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3 text-sm">
                <Badge className="bg-zinc-800 text-zinc-300 border border-zinc-700">Processed: {job.processed}/{job.total}</Badge>
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Success: {job.success}</Badge>
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Failed: {job.failed}</Badge>
              </div>
              <div className="flex gap-2">
                {job.errors?.length > 0 && (
                  <Button variant="outline" onClick={handleDownloadErrors}>
                    <Download className="h-4 w-4 mr-2" />
                    Download Errors
                  </Button>
                )}
                <Button variant="outline" onClick={handleReset}>Import Another File</Button>
                <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={backToMembers}>Back to Members</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

