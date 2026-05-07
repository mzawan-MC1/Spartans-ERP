import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { 
  Upload, Download, FileSpreadsheet, CheckCircle, XCircle, AlertTriangle, 
  ArrowLeft, Loader2, RefreshCw, FileDown, Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { memberImportAPI } from '@/lib/api';
import ManagerLayout from '@/components/ManagerLayout';

export default function MemberImportPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  
  const [step, setStep] = useState('upload'); // upload, preview, importing, complete
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [importMode, setImportMode] = useState('upsert');
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [pollingInterval, setPollingInterval] = useState(null);

  // Poll job status
  const pollJobStatus = useCallback(async (jid) => {
    try {
      const res = await memberImportAPI.getJob(jid);
      setJobStatus(res.data);
      
      if (res.data.status === 'completed' || res.data.status === 'failed') {
        setStep('complete');
        if (pollingInterval) {
          clearInterval(pollingInterval);
          setPollingInterval(null);
        }
      }
    } catch (err) {
      console.error('Failed to poll job status', err);
    }
  }, [pollingInterval]);

  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  const handleDownloadTemplate = async () => {
    try {
      const res = await memberImportAPI.getTemplate();
      const { template, filename } = res.data;
      
      // Create blob and download
      const blob = new Blob([template], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast.success('Template downloaded');
    } catch (err) {
      toast.error('Failed to download template');
    }
  };

  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      toast.error('Please select a CSV file');
      return;
    }
    
    setFile(selectedFile);
    setLoading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      
      const res = await memberImportAPI.preview(formData);
      setPreviewData(res.data);
      setStep('preview');
      toast.success(`Preview loaded: ${res.data.total_rows} rows found`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to preview CSV');
      setFile(null);
    } finally {
      setLoading(false);
    }
  };

  const handleStartImport = async () => {
    if (!file) {
      toast.error('No file selected');
      return;
    }
    
    setLoading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await memberImportAPI.start(formData, importMode);
      setJobId(res.data.job_id);
      setJobStatus({
        status: 'pending',
        total: res.data.total,
        processed: 0,
        success: 0,
        failed: res.data.validation_errors,
        progress: 0
      });
      setStep('importing');
      toast.success('Import started');
      
      // Start polling
      const interval = setInterval(() => pollJobStatus(res.data.job_id), 2000);
      setPollingInterval(interval);
      
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to start import');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadErrors = async () => {
    if (!jobId) return;
    
    try {
      const res = await memberImportAPI.getErrors(jobId);
      const { csv_content, filename } = res.data;
      
      const blob = new Blob([csv_content], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast.success('Errors downloaded');
    } catch (err) {
      toast.error('Failed to download errors');
    }
  };

  const handleReset = () => {
    setStep('upload');
    setFile(null);
    setPreviewData(null);
    setJobId(null);
    setJobStatus(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <ManagerLayout>
      <div className="p-6 sm:p-8 lg:p-10 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/manager/members')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Upload className="h-6 w-6 text-orange-500" />
              Bulk Member Import
            </h1>
            <p className="text-zinc-400 text-sm">Import members from a CSV file</p>
          </div>
        </div>

        {/* Step: Upload */}
        {step === 'upload' && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white">Upload CSV File</CardTitle>
              <CardDescription>
                Download the template, fill in your member data, and upload the CSV file.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Download Template */}
              <div className="bg-zinc-800 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-8 w-8 text-green-500" />
                  <div>
                    <p className="font-medium text-white">CSV Template</p>
                    <p className="text-sm text-zinc-400">Download the template with required columns</p>
                  </div>
                </div>
                <Button variant="outline" onClick={handleDownloadTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>

              {/* Upload Area */}
              <div 
                className="border-2 border-dashed border-zinc-700 rounded-lg p-8 text-center hover:border-orange-500/50 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="csv-file-input"
                />
                {loading ? (
                  <Loader2 className="h-12 w-12 text-orange-500 mx-auto mb-4 animate-spin" />
                ) : (
                  <Upload className="h-12 w-12 text-zinc-500 mx-auto mb-4" />
                )}
                <p className="text-white font-medium mb-1">
                  {loading ? 'Processing...' : 'Click to upload CSV file'}
                </p>
                <p className="text-sm text-zinc-500">or drag and drop</p>
              </div>

              {/* Instructions */}
              <div className="bg-zinc-800/50 rounded-lg p-4">
                <h3 className="font-medium text-white mb-2">Required Fields:</h3>
                <ul className="text-sm text-zinc-400 space-y-1">
                  <li>• <code className="text-orange-400">full_name</code> - Member's full name</li>
                  <li>• <code className="text-orange-400">phone</code> OR <code className="text-orange-400">email</code> - At least one is required</li>
                </ul>
                <h3 className="font-medium text-white mt-4 mb-2">Optional Fields:</h3>
                <p className="text-sm text-zinc-400">
                  gender, dob, address, emergency contact, medical info, membership details
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Preview */}
        {step === 'preview' && previewData && (
          <div className="space-y-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white">Preview Import</CardTitle>
                <CardDescription>
                  Review the data before importing. File: {file?.name}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-zinc-800 rounded-lg p-4 text-center">
                    <p className="text-3xl font-bold text-white">{previewData.total_rows}</p>
                    <p className="text-sm text-zinc-400">Total Rows</p>
                  </div>
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-center">
                    <p className="text-3xl font-bold text-green-500">{previewData.valid_rows}</p>
                    <p className="text-sm text-green-400">Valid Rows</p>
                  </div>
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center">
                    <p className="text-3xl font-bold text-red-500">{previewData.error_rows}</p>
                    <p className="text-sm text-red-400">Errors</p>
                  </div>
                </div>

                {/* Import Mode */}
                <div className="bg-zinc-800 rounded-lg p-4">
                  <Label className="text-white mb-3 block">Import Mode</Label>
                  <RadioGroup value={importMode} onValueChange={setImportMode} className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="upsert" id="upsert" />
                      <Label htmlFor="upsert" className="cursor-pointer">
                        <span className="text-white font-medium">Update or Create</span>
                        <span className="text-zinc-400 text-sm ml-2">Update existing members, create new ones</span>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="create_only" id="create_only" />
                      <Label htmlFor="create_only" className="cursor-pointer">
                        <span className="text-white font-medium">Create Only</span>
                        <span className="text-zinc-400 text-sm ml-2">Skip duplicates (fail if exists)</span>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Preview Table */}
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-zinc-900">
                      <tr className="border-b border-zinc-800">
                        <th className="text-left p-2 text-zinc-400">Row</th>
                        <th className="text-left p-2 text-zinc-400">Name</th>
                        <th className="text-left p-2 text-zinc-400">Phone</th>
                        <th className="text-left p-2 text-zinc-400">Email</th>
                        <th className="text-left p-2 text-zinc-400">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.preview_data.slice(0, 50).map((row, idx) => (
                        <tr key={idx} className="border-b border-zinc-800/50">
                          <td className="p-2 text-zinc-500">{row.row_num}</td>
                          <td className="p-2 text-white">{row.full_name}</td>
                          <td className="p-2 text-zinc-300">{row.phone || '-'}</td>
                          <td className="p-2 text-zinc-300">{row.email || '-'}</td>
                          <td className="p-2">
                            {row.is_valid ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Errors */}
                {previewData.row_errors.length > 0 && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                    <h3 className="font-medium text-red-400 mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Validation Errors ({previewData.row_errors.length})
                    </h3>
                    <div className="max-h-40 overflow-y-auto space-y-2">
                      {previewData.row_errors.slice(0, 20).map((err, idx) => (
                        <div key={idx} className="text-sm">
                          <span className="text-red-300">Row {err.row_num}:</span>
                          <span className="text-red-400 ml-2">{err.errors.join(', ')}</span>
                        </div>
                      ))}
                      {previewData.row_errors.length > 20 && (
                        <p className="text-red-400 text-sm">...and {previewData.row_errors.length - 20} more errors</p>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex justify-between">
              <Button variant="outline" onClick={handleReset}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button 
                onClick={handleStartImport}
                disabled={loading || previewData.valid_rows === 0}
                className="bg-orange-500 hover:bg-orange-600"
                data-testid="start-import-btn"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Start Import ({previewData.valid_rows} rows)
              </Button>
            </div>
          </div>
        )}

        {/* Step: Importing */}
        {step === 'importing' && jobStatus && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
                Importing Members...
              </CardTitle>
              <CardDescription>
                Please wait while we process your import. Do not close this page.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Progress */}
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-zinc-400">Progress</span>
                  <span className="text-white">{jobStatus.progress || 0}%</span>
                </div>
                <Progress value={jobStatus.progress || 0} className="h-3" />
              </div>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-zinc-800 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-white">{jobStatus.total}</p>
                  <p className="text-xs text-zinc-400">Total</p>
                </div>
                <div className="bg-zinc-800 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-blue-400">{jobStatus.processed}</p>
                  <p className="text-xs text-zinc-400">Processed</p>
                </div>
                <div className="bg-green-500/10 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-500">{jobStatus.success}</p>
                  <p className="text-xs text-green-400">Success</p>
                </div>
                <div className="bg-red-500/10 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-red-500">{jobStatus.failed}</p>
                  <p className="text-xs text-red-400">Failed</p>
                </div>
              </div>

              <p className="text-center text-zinc-500 text-sm">
                Processing batch... This may take a few minutes for large files.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Step: Complete */}
        {step === 'complete' && jobStatus && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                {jobStatus.status === 'completed' && jobStatus.failed === 0 ? (
                  <CheckCircle className="h-6 w-6 text-green-500" />
                ) : jobStatus.status === 'completed' ? (
                  <AlertTriangle className="h-6 w-6 text-yellow-500" />
                ) : (
                  <XCircle className="h-6 w-6 text-red-500" />
                )}
                Import {jobStatus.status === 'completed' ? 'Complete' : 'Failed'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Final Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-zinc-800 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-white">{jobStatus.total}</p>
                  <p className="text-sm text-zinc-400">Total Rows</p>
                </div>
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-green-500">{jobStatus.success}</p>
                  <p className="text-sm text-green-400">Successfully Imported</p>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-red-500">{jobStatus.failed}</p>
                  <p className="text-sm text-red-400">Failed</p>
                </div>
              </div>

              {/* Duration */}
              {jobStatus.started_at && jobStatus.finished_at && (
                <p className="text-center text-zinc-400 text-sm">
                  Completed in {Math.round((new Date(jobStatus.finished_at) - new Date(jobStatus.started_at)) / 1000)} seconds
                </p>
              )}

              {/* Errors Summary */}
              {jobStatus.failed > 0 && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-red-400 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      {jobStatus.total_errors || jobStatus.failed} Errors
                    </h3>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleDownloadErrors}
                      className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                    >
                      <FileDown className="h-4 w-4 mr-2" />
                      Download Errors CSV
                    </Button>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {jobStatus.errors?.slice(0, 10).map((err, idx) => (
                      <div key={idx} className="text-sm">
                        <span className="text-red-300">Row {err.row}:</span>
                        <span className="text-red-400 ml-2">
                          {err.errors ? err.errors.join(', ') : err.error}
                        </span>
                      </div>
                    ))}
                    {(jobStatus.total_errors || jobStatus.failed) > 10 && (
                      <p className="text-red-400 text-sm">
                        ...and {(jobStatus.total_errors || jobStatus.failed) - 10} more errors
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={handleReset}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Import More
                </Button>
                <Button 
                  onClick={() => navigate('/manager/members')}
                  className="bg-orange-500 hover:bg-orange-600"
                >
                  <Users className="h-4 w-4 mr-2" />
                  View Members
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ManagerLayout>
  );
}
