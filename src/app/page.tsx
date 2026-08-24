"use client";

import { useEffect, useRef } from "react";
import { useScannerStore } from "@/store/useScannerStore";
import { Camera, Upload, Settings, LogOut, CheckCircle2 } from "lucide-react";

import { CameraCapture } from "@/components/CameraCapture";
import { CropEditor } from "@/components/CropEditor";
import { BatchCarousel } from "@/components/BatchCarousel";
import { ExportPanel } from "@/components/ExportPanel";
import { ExportPage } from "@/components/ExportPage";

export default function Home() {
  const { setOpenCvReady, openCvReady, scannerMode, setScannerMode, pages, addPage, setCurrentPageId, setEditReturnMode, clearPages } = useScannerStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Check if OpenCV is loaded
    const checkOpenCv = setInterval(() => {
      if (typeof window !== "undefined" && (window as any).cv) {
        setOpenCvReady(true);
        clearInterval(checkOpenCv);
      }
    }, 500);

    return () => clearInterval(checkOpenCv);
  }, [setOpenCvReady]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(file => {
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            addPage({
              originalImage: event.target.result as string,
              croppedImage: null,
              cropPoints: null,
              filter: 'original'
            });
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(file => {
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            addPage({
              originalImage: event.target.result as string,
              croppedImage: null,
              cropPoints: null,
              filter: 'original'
            });
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-surface flex flex-col">
        <div className="p-6 flex flex-col items-center border-b border-border">
          <img src="/logo.png" alt="Scan Flow" className="w-24 h-24 object-contain mb-3" />
          <h1 className="text-xl font-bold">Scan Flow</h1>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => { clearPages(); setTimeout(() => fileInputRef.current?.click(), 50); }}
            className="w-full flex items-center gap-3 bg-primary text-primary-foreground px-4 py-3 rounded-xl font-medium transition-transform active:scale-95"
          >
            <Upload size={20} />
            Start New Batch
          </button>
          
          <button 
            onClick={() => setScannerMode('capture')}
            className="w-full flex items-center gap-3 bg-surface-hover text-foreground px-4 py-3 rounded-xl font-medium transition-colors hover:bg-surface-hover/80 mt-2"
          >
            <Camera size={20} />
            Capture
          </button>
        </nav>

        <div className="p-4 border-t border-border space-y-2">
          <button className="w-full flex items-center gap-3 text-gray-400 hover:text-foreground px-4 py-2 transition-colors">
            <Settings size={20} />
            Settings
          </button>
          <button className="w-full flex items-center gap-3 text-gray-400 hover:text-foreground px-4 py-2 transition-colors">
            <LogOut size={20} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        <header className="h-16 border-b border-border flex items-center px-8 justify-between bg-background z-10 flex-shrink-0">
          <div className="flex gap-6 text-sm font-medium">
            <button onClick={() => setScannerMode('preview')} className={`text-foreground pb-1 border-b-2 transition-colors ${scannerMode !== 'export' ? 'border-primary' : 'border-transparent hover:border-gray-500'}`}>Dashboard</button>
            <button onClick={() => setScannerMode('capture')} className={`pb-1 border-b-2 transition-colors ${scannerMode === 'capture' ? 'text-foreground border-primary' : 'border-transparent text-gray-400 hover:text-foreground'}`}>Scanner</button>
            <button onClick={() => setScannerMode('export')} className={`text-foreground pb-1 border-b-2 transition-colors ${scannerMode === 'export' ? 'border-primary' : 'border-transparent text-gray-400 hover:text-foreground'}`}>Export</button>
          </div>
          
          <div className="flex items-center gap-4 text-sm text-gray-400">
            {scannerMode !== 'export' && <ExportPanel />}
            {openCvReady ? (
              <span className="flex items-center gap-1 text-green-500"><CheckCircle2 size={16} /> Engine Ready</span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
                Loading Engine...
              </span>
            )}
          </div>
        </header>

        {scannerMode === 'export' ? (
          <ExportPage />
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div 
              className="flex-1 p-8 overflow-y-auto"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              {/* Hero Section */}
              <div className="bg-primary text-primary-foreground rounded-3xl p-10 mb-8 max-w-4xl mx-auto shadow-2xl">
                <h2 className="text-4xl font-bold mb-4">Ready to Digitize?</h2>
                <p className="text-primary-foreground/80 text-lg mb-8 max-w-lg">
                  Quickly capture and organize your documents with our intelligent scanning engine.
                </p>
                <button onClick={() => fileInputRef.current?.click()} className="bg-primary-foreground text-primary px-6 py-3 rounded-xl font-semibold shadow-lg hover:bg-black transition-colors">
                  Start New Scan
                </button>
              </div>
              
              {pages.length === 0 ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="max-w-4xl mx-auto border-2 border-dashed border-border rounded-3xl p-12 flex flex-col items-center justify-center text-gray-500 bg-surface/50 hover:bg-surface transition-colors cursor-pointer"
                >
                  <div className="w-16 h-16 rounded-full bg-surface-hover flex items-center justify-center mb-4 text-foreground">
                    <Upload size={24} />
                  </div>
                  <h3 className="text-xl font-medium text-foreground mb-2">Drop new scan here</h3>
                  <p>or click to browse files</p>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
                  {pages.map((page, i) => (
                    <div 
                      key={page.id} 
                      onClick={() => { 
                      setCurrentPageId(page.id);
                      setEditReturnMode('preview');
                      setScannerMode('edit'); 
                    }}
                      className="aspect-[3/4] rounded-2xl bg-surface border border-border overflow-hidden relative shadow-lg cursor-pointer hover:border-primary transition-colors group"
                    >
                      <img src={page.croppedImage || page.originalImage} className="w-full h-full object-cover" />
                      <div className="absolute top-2 right-2 bg-black/60 rounded-full px-3 py-1 text-xs font-medium text-white shadow-sm backdrop-blur-md">Page {i+1}</div>
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                        <span className="text-white text-xs font-medium bg-black/60 rounded-full px-3 py-1">Edit Crop</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {pages.length > 0 && <BatchCarousel />}
          </div>
        )}
      </main>

      <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
      
      {scannerMode === 'capture' && <CameraCapture />}
      {scannerMode === 'edit' && <CropEditor />}
    </div>
  );
}
