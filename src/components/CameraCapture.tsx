"use client";
import { useState, useRef, useEffect } from "react";
import { X, Upload, Zap, SlidersHorizontal, Image as ImageIcon } from "lucide-react";
import { useScannerStore } from "@/store/useScannerStore";
import { FilterType } from "@/types";

export function CameraCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>("");
  const { pages, addPage, setScannerMode } = useScannerStore();
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [liveFilter, setLiveFilter] = useState<FilterType>('original');
  const [showFilters, setShowFilters] = useState(false);

  const getCssFilter = (filter: FilterType) => {
    let f = "";
    if (filter === "grayscale")      f += "grayscale(100%) ";
    else if (filter === "bw")        f += "grayscale(100%) contrast(1000%) ";
    else if (filter === "magic")     f += "contrast(150%) brightness(110%) saturate(120%) ";
    else if (filter === "highlight") f += "contrast(200%) brightness(120%) grayscale(20%) ";
    return f.trim();
  };

  const toggleFlash = async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (track) {
      try {
        // Cast to any since standard TS typings might not include torch yet
        const capabilities = (track.getCapabilities && track.getCapabilities()) as any;
        if (capabilities && capabilities.torch) {
          const newFlashState = !flashEnabled;
          await track.applyConstraints({
            advanced: [{ torch: newFlashState }] as any
          });
          setFlashEnabled(newFlashState);
        }
      } catch (err) {
        console.error("Failed to toggle flash", err);
      }
    }
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      setError("Unable to access camera.");
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        const imageUrl = canvas.toDataURL("image/jpeg", 0.9);
        addPage({
          originalImage: imageUrl,
          croppedImage: null,
          cropPoints: null,
          filter: liveFilter,
          adjustments: { brightness: 0, contrast: 0, saturation: 0 }
        });
        if (mode === 'single') {
          setScannerMode('preview');
        }
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            addPage({
              originalImage: event.target.result as string,
              croppedImage: null,
              cropPoints: null,
              filter: 'original',
              adjustments: { brightness: 0, contrast: 0, saturation: 0 }
            });
          }
        };
        reader.readAsDataURL(file);
      });
      setScannerMode('preview');
    }
  };

  return (
    <div className="absolute inset-0 bg-black flex flex-col z-50">
      {/* Desktop Header */}
      <div className="hidden md:flex absolute top-0 w-full p-6 justify-between items-center z-20 bg-gradient-to-b from-black/80 to-transparent">
        <button onClick={() => setScannerMode('preview')} className="text-white p-3 rounded-full bg-surface-hover/50 backdrop-blur-md hover:bg-surface-hover transition-colors">
          <X size={24} />
        </button>
        <button onClick={() => fileInputRef.current?.click()} className="text-white px-4 py-2 flex items-center gap-2 rounded-full bg-surface-hover/50 backdrop-blur-md hover:bg-surface-hover transition-colors font-medium">
          <Upload size={20} /> Upload Images
        </button>
      </div>

      {/* Mobile Header */}
      <div className="md:hidden absolute top-0 w-full p-6 flex justify-between items-center z-20 bg-gradient-to-b from-black/80 to-transparent">
        <button onClick={() => setScannerMode('preview')} className="text-white p-3 rounded-full bg-surface/50 backdrop-blur-md">
          <X size={20} />
        </button>
        
        <button className="flex items-center gap-2 bg-surface/50 backdrop-blur-md border border-border px-4 py-1.5 rounded-full text-xs font-semibold text-primary uppercase tracking-wider">
          <span className="w-2 h-2 rounded-full bg-primary"></span>
          Auto-Detect
        </button>
        
        <button 
          onClick={toggleFlash}
          className={`p-3 rounded-full backdrop-blur-md transition-colors ${flashEnabled ? 'bg-primary text-primary-foreground' : 'bg-surface/50 text-white'}`}
        >
          <Zap size={20} />
        </button>
      </div>
      
      {error ? (
        <div className="flex-1 flex items-center justify-center text-red-400 font-medium">{error}</div>
      ) : (
        <video ref={videoRef} autoPlay playsInline className="absolute inset-0 object-cover h-full w-full z-0" style={{ filter: getCssFilter(liveFilter) }} />
      )}

      {/* Mobile Viewfinder Overlay */}
      <div className="md:hidden absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center p-8">
        <div className="w-full h-[60%] border border-primary/50 relative">
          {/* Corner accents */}
          <div className="absolute top-[-2px] left-[-2px] w-6 h-6 border-t-2 border-l-2 border-primary"></div>
          <div className="absolute top-[-2px] right-[-2px] w-6 h-6 border-t-2 border-r-2 border-primary"></div>
          <div className="absolute bottom-[-2px] left-[-2px] w-6 h-6 border-b-2 border-l-2 border-primary"></div>
          <div className="absolute bottom-[-2px] right-[-2px] w-6 h-6 border-b-2 border-r-2 border-primary"></div>
        </div>
      </div>
      
      {/* Desktop Shutter Area */}
      <div className="hidden md:flex flex-col absolute bottom-0 w-full p-10 justify-end items-center z-20 bg-gradient-to-t from-black via-black/80 to-transparent">
        {/* Mode Selector */}
        <div className="flex justify-center mb-8">
          <div className="bg-surface/50 backdrop-blur-md rounded-full p-1 flex">
            <button 
              onClick={() => setMode('single')}
              className={`px-6 py-2 rounded-full text-xs font-bold tracking-widest transition-colors ${mode === 'single' ? 'bg-surface-hover text-white shadow' : 'text-gray-400'}`}
            >
              SINGLE
            </button>
            <button 
              onClick={() => setMode('batch')}
              className={`px-6 py-2 rounded-full text-xs font-bold tracking-widest transition-colors ${mode === 'batch' ? 'bg-surface-hover text-white shadow' : 'text-gray-400'}`}
            >
              BATCH
            </button>
          </div>
        </div>

        <div className="flex items-center justify-center gap-16 w-full max-w-md">
          <button 
            onClick={() => setScannerMode('preview')} 
            className="w-16 h-16 rounded-xl border border-border bg-surface flex items-center justify-center overflow-hidden relative cursor-pointer hover:border-gray-500 transition-colors"
          >
            {pages.length > 0 ? (
              <img src={pages[pages.length-1].croppedImage || pages[pages.length-1].originalImage} className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="text-gray-500" size={24} />
            )}
            {pages.length > 0 && (
              <div className="absolute bottom-1 right-1 bg-primary text-primary-foreground text-[10px] font-bold px-1.5 rounded-sm">
                {pages.length}
              </div>
            )}
          </button>
          
          <button onClick={capturePhoto} className="w-24 h-24 rounded-full border-4 border-primary flex items-center justify-center p-1 active:scale-90 transition-transform">
            <div className="w-full h-full bg-primary rounded-full"></div>
          </button>
          
          <div className="relative flex justify-center items-center">
            {showFilters && (
              <div className="absolute left-full ml-4 flex flex-row gap-3 items-center animate-in slide-in-from-left-4 fade-in duration-200">
                {[
                  { key: "original", label: "Orig" },
                  { key: "magic", label: "Magic" },
                  { key: "highlight", label: "High" },
                  { key: "grayscale", label: "Gray" },
                  { key: "bw", label: "B&W" }
                ].map(f => (
                  <button
                    key={f.key}
                    onClick={() => setLiveFilter(f.key as FilterType)}
                    className={`w-12 h-12 rounded-full text-[10px] font-bold flex items-center justify-center transition-all flex-shrink-0 ${
                      liveFilter === f.key
                        ? 'bg-primary text-primary-foreground shadow-lg scale-110'
                        : 'bg-surface/80 text-white backdrop-blur-md border border-white/10 hover:bg-surface'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setShowFilters(!showFilters)} className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors relative z-10 ${showFilters ? 'bg-primary text-primary-foreground shadow-lg' : 'bg-surface text-gray-300 hover:bg-surface-hover hover:text-white'}`}>
              <SlidersHorizontal size={24} />
            </button>
          </div>
        </div>
      </div>



      {/* Mobile Shutter Area */}
      <div className="md:hidden absolute bottom-0 w-full z-20 bg-gradient-to-t from-black via-black/80 to-transparent pb-10 pt-20 px-8">
        {/* Mode Selector */}
        <div className="flex justify-center mb-8">
          <div className="bg-surface/50 backdrop-blur-md rounded-full p-1 flex">
            <button 
              onClick={() => setMode('single')}
              className={`px-6 py-2 rounded-full text-xs font-bold tracking-widest transition-colors ${mode === 'single' ? 'bg-surface-hover text-white shadow' : 'text-gray-400'}`}
            >
              SINGLE
            </button>
            <button 
              onClick={() => setMode('batch')}
              className={`px-6 py-2 rounded-full text-xs font-bold tracking-widest transition-colors ${mode === 'batch' ? 'bg-surface-hover text-white shadow' : 'text-gray-400'}`}
            >
              BATCH
            </button>
          </div>
        </div>

        {/* Shutter Bar */}
        <div className="flex items-center justify-between">
          <button 
            onClick={() => setScannerMode('preview')} 
            className="w-14 h-14 rounded-xl border border-border bg-surface flex items-center justify-center overflow-hidden relative"
          >
            {pages.length > 0 ? (
              <img src={pages[pages.length-1].croppedImage || pages[pages.length-1].originalImage} className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="text-gray-500" size={24} />
            )}
            {pages.length > 0 && (
              <div className="absolute bottom-1 right-1 bg-primary text-primary-foreground text-[10px] font-bold px-1.5 rounded-sm">
                {pages.length}
              </div>
            )}
          </button>
          
          <button onClick={capturePhoto} className="w-20 h-20 rounded-full border-4 border-primary flex items-center justify-center p-1 active:scale-90 transition-transform">
            <div className="w-full h-full bg-primary rounded-full"></div>
          </button>
          
          <div className="relative flex justify-center">
            {showFilters && (
              <div className="absolute bottom-full mb-4 flex flex-col gap-3 items-center animate-in slide-in-from-bottom-2 fade-in duration-200">
                {[
                  { key: "bw", label: "B&W" },
                  { key: "grayscale", label: "Gray" },
                  { key: "highlight", label: "High" },
                  { key: "magic", label: "Magic" },
                  { key: "original", label: "Orig" }
                ].map(f => (
                  <button
                    key={f.key}
                    onClick={() => setLiveFilter(f.key as FilterType)}
                    className={`w-12 h-12 rounded-full text-[10px] font-bold flex items-center justify-center transition-all ${
                      liveFilter === f.key
                        ? 'bg-primary text-primary-foreground shadow-lg scale-110'
                        : 'bg-surface/80 text-white backdrop-blur-md border border-white/10 hover:bg-surface'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setShowFilters(!showFilters)} className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors relative z-10 ${showFilters ? 'bg-primary text-primary-foreground shadow-lg' : 'bg-surface text-gray-300'}`}>
              <SlidersHorizontal size={24} />
            </button>
          </div>
        </div>
      </div>

      <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
    </div>
  );
}
