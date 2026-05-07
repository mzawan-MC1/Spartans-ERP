import { useState, useRef } from 'react';
import { uploadAPI } from '@/lib/api';
import { isVideoUrl, resolveMediaUrl } from '@/lib/media';
import { Upload, X, Loader2, Image, FileVideo } from 'lucide-react';

export default function FileUpload({ value, onChange, className = '', accept = "image/*", maxSize = 10 }) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    
    // Validate Size
    if (file.size > maxSize * 1024 * 1024) {
      alert(`File too large. Max size is ${maxSize}MB`);
      return;
    }

    // Validate Type (basic check)
    if (accept === "image/*" && !file.type.startsWith('image/')) {
       alert('Please upload an image file');
       return;
    }
    
    if (accept.includes('video')) {
       const isVideoType = file.type.startsWith('video/');
       const isVideoExt = /\.(mp4|webm|ogg|mov|avi|mkv|m4v)$/i.test(file.name);
       if (!isVideoType && !isVideoExt) {
          alert('Please upload a video file (MP4, WebM, etc.)');
          return;
       }
    }

    setUploading(true);
    try {
      const res = await uploadAPI.upload(file);
      onChange(res.data.url);
    } catch (err) {
      alert('Upload failed');
    } finally { setUploading(false); }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };

  const fullUrl = resolveMediaUrl(value);
  const isVideo = (fullUrl && isVideoUrl(fullUrl)) || accept.includes('video');

  return (
    <div className={className}>
      {fullUrl ? (
        <div className="relative group">
          {isVideo ? (
            <video src={fullUrl} className="w-full h-40 object-cover rounded-sm border border-zinc-800" controls />
          ) : (
            <img src={fullUrl} alt="Upload" className="w-full h-40 object-cover rounded-sm border border-zinc-800" />
          )}
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute top-2 right-2 bg-black/70 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          data-testid="file-upload-dropzone"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-sm p-8 text-center cursor-pointer transition-all ${
            dragOver ? 'border-red-600 bg-red-600/5' : 'border-zinc-800 hover:border-zinc-600 bg-zinc-950'
          }`}
        >
          {uploading ? (
            <Loader2 className="w-8 h-8 text-red-600 animate-spin mx-auto" />
          ) : (
            <>
              {accept.includes('video') ? (
                <FileVideo className="w-8 h-8 text-zinc-600 mx-auto mb-2" strokeWidth={1.5} />
              ) : (
                <Image className="w-8 h-8 text-zinc-600 mx-auto mb-2" strokeWidth={1.5} />
              )}
              <p className="text-zinc-500 text-sm font-body">
                Drag & drop, or <span className="text-red-500">click to browse</span>
              </p>
              <p className="text-zinc-700 text-xs mt-1">
                {accept.includes('video') ? `MP4, WebM, Ogg (Max ${maxSize}MB)` : 'JPG, PNG, WebP, GIF'}
              </p>
            </>
          )}
          <input ref={inputRef} type="file" accept={accept} className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])} />
        </div>
      )}
    </div>
  );
}
