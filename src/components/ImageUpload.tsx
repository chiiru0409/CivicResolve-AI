import React, { useState, useCallback } from 'react';
import { Upload, X, Scan, CheckCircle, Camera } from 'lucide-react';
import { analyzeImage } from '../services/aiService';
import type { ImageAnalysis } from '../types';

interface ImageUploadProps {
  description?: string;
  onImageUploaded: (file: File, url: string, analysis?: ImageAnalysis) => void;
}

const ImageUpload: React.FC<ImageUploadProps> = ({ description, onImageUploaded }) => {
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<ImageAnalysis | null>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    
    // Convert to Data URL for persistent storage across sessionStorage and DB
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setPreview(dataUrl);
      setAnalyzing(true);
      setAnalysis(null);
      try {
        const result = await analyzeImage(file, description);
        setAnalysis(result);
        onImageUploaded(file, dataUrl, result);
      } finally {
        setAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  }, [description, onImageUploaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const clearImage = () => { setPreview(null); setAnalysis(null); };

  const severityColor: Record<string, string> = {
    High:   'text-civic-red bg-civic-red/10 border-civic-red/30',
    Medium: 'text-civic-yellow bg-civic-yellow/10 border-civic-yellow/30',
    Low:    'text-civic-success bg-civic-success/10 border-civic-success/30',
  };

  return (
    <div className="space-y-4">
      {!preview ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200 cursor-pointer ${
            dragging
              ? 'border-civic-red bg-civic-red/5 scale-[1.01]'
              : 'border-civic-border hover:border-civic-red/50 hover:bg-civic-red/5'
          }`}
        >
          <input
            type="file"
            accept="image/*"
            onChange={handleInputChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label="Upload evidence image"
          />
          <div className="flex flex-col items-center gap-3">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${
              dragging ? 'bg-civic-red/10' : 'bg-civic-elevated'
            }`}>
              {dragging ? (
                <Camera className="w-6 h-6 text-civic-red" />
              ) : (
                <Upload className="w-6 h-6 text-civic-muted" />
              )}
            </div>
            <div>
              <p className="font-semibold text-civic-text">Drop evidence image here</p>
              <p className="text-sm text-civic-muted mt-1">
                AI Vision will analyze the image to identify the issue
              </p>
            </div>
            <p className="text-xs text-civic-muted bg-civic-elevated px-3 py-1 rounded-full border border-civic-border">
              PNG, JPG, WEBP · up to 10MB
            </p>
            {dragging && (
              <p className="text-civic-red font-bold text-sm">Drop here!</p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Image preview */}
          <div className="relative rounded-2xl overflow-hidden border border-civic-border">
            <img src={preview} alt="Evidence" className="w-full h-52 object-cover" />
            <button
              onClick={clearImage}
              className="absolute top-3 right-3 w-8 h-8 bg-civic-red text-white rounded-full flex items-center justify-center hover:bg-civic-red-dark transition-colors shadow-dark-sm"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Analyzing overlay */}
            {analyzing && (
              <div className="absolute inset-0 bg-civic-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-civic-red/20 border-t-civic-red rounded-full animate-spin" />
                  <Scan className="w-6 h-6 text-civic-yellow absolute inset-0 m-auto" />
                </div>
                <p className="text-white font-bold text-sm">AI Vision Analyzing...</p>
                <div className="flex gap-2">
                  {['Detecting objects', 'Assessing severity', 'Classifying'].map((s, i) => (
                    <span key={i} className="text-[10px] bg-white/10 text-white/80 px-2 py-0.5 rounded-full">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Detection box */}
            {analysis && !analyzing && (
              <div className="absolute inset-0 pointer-events-none">
                <div
                  className="absolute border-2 border-civic-yellow rounded-lg"
                  style={{ top: '20%', left: '15%', width: '60%', height: '55%' }}
                >
                  <span className="absolute -top-6 left-0 bg-civic-yellow text-civic-black text-[10px] font-bold px-2 py-0.5 rounded-t-lg">
                    {analysis.detectedObjects[0]}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* AI Vision Result */}
          {analysis && !analyzing && (
            <div className="bg-civic-elevated border border-civic-border rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-civic-yellow/10 rounded-lg flex items-center justify-center">
                    <Scan className="w-4 h-4 text-civic-yellow" />
                  </div>
                  <div>
                    <p className="font-bold text-civic-text text-sm">Vision AI Result</p>
                    <p className="text-civic-yellow text-[11px]">{analysis.confidence}% confidence</p>
                  </div>
                </div>
                <CheckCircle className="w-5 h-5 text-civic-success" />
              </div>

              <div className="space-y-2.5">
                <div>
                  <p className="text-[11px] text-civic-muted mb-1.5 font-semibold uppercase tracking-wide">Detected</p>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.detectedObjects.map((obj, i) => (
                      <span key={i} className="text-xs bg-civic-surface border border-civic-border text-civic-text px-2 py-0.5 rounded-full">
                        {obj}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-4 pt-1">
                  <div>
                    <p className="text-[11px] text-civic-muted mb-0.5">Severity</p>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${severityColor[analysis.severity]}`}>
                      {analysis.severity}
                    </span>
                  </div>
                  <div>
                    <p className="text-[11px] text-civic-muted mb-0.5">Category Detected</p>
                    <p className="text-sm font-bold text-civic-yellow">{analysis.suggestedCategory}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ImageUpload;
