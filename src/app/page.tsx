"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useScannerStore } from "@/store/useScannerStore";
import { Camera, Upload, CheckCircle2, Menu, LayoutGrid, SquarePen, Share, FileText, FileImage, MoreVertical } from "lucide-react";
import { DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { CameraCapture } from "@/components/CameraCapture";
import { CropEditor } from "@/components/CropEditor";
import { BatchCarousel } from "@/components/BatchCarousel";
import { ExportPanel } from "@/components/ExportPanel";
import { ExportPage } from "@/components/ExportPage";
import { HeroOverlay } from "@/components/Hero";
import { PrivacyModal } from "@/components/PrivacyModal";

function MobileSortablePage({ page, index, onEdit }: { page: any; index: number; onEdit: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
    opacity: isDragging ? 0.7 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="aspect-[3/4] rounded-2xl bg-surface border border-border overflow-hidden relative shadow cursor-grab active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <img src={page.croppedImage || page.originalImage} className="w-full h-full object-cover pointer-events-none select-none" />
      <div className="absolute top-1.5 left-1.5 bg-black/70 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm pointer-events-none">P.{index + 1}</div>
      {/* Tap to edit — separate from drag */}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onEdit}
        className="absolute bottom-1.5 right-1.5 bg-black/60 backdrop-blur-sm rounded-lg px-2 py-0.5 text-[10px] font-semibold text-white"
      >
        Edit
      </button>
    </div>
  );
}

export default function Home() {
  const { setOpenCvReady, openCvReady, scannerMode, setScannerMode, pages, addPage, setCurrentPageId, setEditReturnMode, clearPages, reorderPages, recentDocuments } = useScannerStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showHero, setShowHero] = useState(true);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const mobileSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const handleMobileDragEnd = useCallback((event: any) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      reorderPages(active.id, over.id);
    }
  }, [reorderPages]);

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
              filter: 'original',
              adjustments: { brightness: 0, contrast: 0, saturation: 0 }
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
              filter: 'original',
              adjustments: { brightness: 0, contrast: 0, saturation: 0 }
            });
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };



  return (
    <div className="relative flex h-screen overflow-hidden bg-background">
      {/* Sidebar - Desktop Only */}
      <aside className="hidden md:flex w-64 border-r border-border bg-surface flex-col">
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
          
          <button onClick={() => setScannerMode('capture')}
            className="w-full flex items-center gap-3 bg-surface-hover text-foreground px-4 py-3 rounded-xl font-medium transition-colors hover:bg-surface-hover/80 mt-2"
          >
            <Camera size={20} />
            Capture
          </button>

          <div className="mt-8 pt-6 border-t border-border">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 px-2">Recent Scans</h3>
            <div className="space-y-1">
              {recentDocuments.length > 0 ? (
                recentDocuments.slice(0, 5).map((doc) => (
                  <button key={doc.id} className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface transition-colors flex items-center gap-3 group">
                    {doc.type === 'pdf' ? <FileText className="text-gray-500 group-hover:text-primary transition-colors flex-shrink-0" size={16} /> : <FileImage className="text-gray-500 group-hover:text-primary transition-colors flex-shrink-0" size={16} />}
                    <div className="overflow-hidden">
                      <p className="text-sm font-medium text-gray-300 group-hover:text-white truncate">{doc.name}</p>
                      <p className="text-[10px] text-gray-500 truncate">{doc.date} • {doc.size}</p>
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-2 text-xs text-gray-500 italic">No recent scans</div>
              )}
            </div>
          </div>
        </nav>

        <div className="p-4 border-t border-border space-y-1">
          <button onClick={() => setShowPrivacy(true)} className="w-full flex items-center gap-3 text-gray-400 hover:text-foreground px-4 py-2 rounded-lg transition-colors text-sm">
            Privacy
          </button>
          <button className="w-full flex items-center gap-3 text-gray-400 hover:text-foreground px-4 py-2 rounded-lg transition-colors text-sm">
            Contact
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Header - Desktop Only */}
        <header className="hidden md:flex h-16 border-b border-border items-center px-8 justify-between bg-background z-10 flex-shrink-0">
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

        {/* Header - Mobile Only (for preview and export modes) */}
        {scannerMode !== 'capture' && scannerMode !== 'edit' && (
          <header className="md:hidden h-16 border-b border-border flex items-center px-4 justify-between bg-background z-10 flex-shrink-0">
            {scannerMode === 'export' ? (
              <button onClick={() => setScannerMode('preview')} className="text-foreground p-2 rounded-full hover:bg-surface-hover">
                <Menu size={24} />
              </button>
            ) : (
              <button className="text-foreground p-2 rounded-full hover:bg-surface-hover">
                <Menu size={24} />
              </button>
            )}
            <h1 className="text-lg font-bold">Scan Flow</h1>
            <div className="w-9 h-9 rounded-xl overflow-hidden bg-primary/10 border border-primary/30 flex items-center justify-center p-1">
              <img src="/logo.png" alt="Scan Flow Logo" className="w-full h-full object-contain" />
            </div>
          </header>
        )}

        {scannerMode === 'export' ? (
          <ExportPage />
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden pb-16 md:pb-0">
            <div 
              className="flex-1 p-4 md:p-8 overflow-y-auto"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              {/* Hero Section - Desktop Only */}
              <div className="hidden md:block bg-primary text-primary-foreground rounded-3xl p-10 mb-8 max-w-4xl mx-auto shadow-2xl">
                <h2 className="text-4xl font-bold mb-4">Ready to Digitize?</h2>
                <p className="text-primary-foreground/80 text-lg mb-8 max-w-lg">
                  Quickly capture and organize your documents with our intelligent scanning engine.
                </p>
                <button onClick={() => fileInputRef.current?.click()} className="bg-primary-foreground text-primary px-6 py-3 rounded-xl font-semibold shadow-lg hover:bg-black transition-colors">
                  Start New Scan
                </button>
              </div>
              
              {/* Mobile Only: Upload Dropzone & Recent Documents */}
              <div className="md:hidden flex flex-col mb-8 mt-2">
                {/* Uploaded File Previews on Mobile */}
                {pages.length > 0 ? (
                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-3">
                      <h2 className="text-lg font-bold text-foreground">Scanned Pages</h2>
                      <span className="text-xs text-gray-400 font-medium">{pages.length} page{pages.length !== 1 ? 's' : ''}</span>
                    </div>
                    <DndContext sensors={mobileSensors} collisionDetection={closestCenter} onDragEnd={handleMobileDragEnd}>
                      <SortableContext items={pages.map(p => p.id)} strategy={rectSortingStrategy}>
                        <div className="grid grid-cols-3 gap-3 mb-4">
                          {pages.map((page, i) => (
                            <MobileSortablePage
                              key={page.id}
                              page={page}
                              index={i}
                              onEdit={() => {
                                setCurrentPageId(page.id);
                                setEditReturnMode('preview');
                                setScannerMode('edit');
                              }}
                            />
                          ))}
                          {/* Add More button */}
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="aspect-[3/4] rounded-2xl bg-surface/30 border border-dashed border-gray-600 flex flex-col items-center justify-center text-gray-500 active:bg-surface/60 transition-colors"
                          >
                            <Upload size={20} className="mb-1" />
                            <span className="text-[10px] font-medium">Add More</span>
                          </button>
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                ) : (
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full aspect-[4/3] border-[1px] border-dashed border-gray-600 rounded-3xl p-6 flex flex-col items-center justify-center text-gray-400 bg-transparent hover:bg-surface/30 transition-colors cursor-pointer mb-6"
                  >
                    <div className="mb-4 text-primary">
                      <Upload size={40} className="text-primary bg-primary/10 p-2 rounded-lg" />
                    </div>
                    <h3 className="text-lg font-medium text-foreground mb-2">Drag and drop files here</h3>
                    <p className="text-xs text-gray-500">or click to upload (PDF, JPG, PNG)</p>
                  </div>
                )}

                <div className="flex justify-between items-end mb-4">
                  <h2 className="text-lg font-bold text-foreground">Recent Documents</h2>
                  <button className="text-xs text-gray-400 font-medium">View All</button>
                </div>
                
                <div className="space-y-3">
                  {recentDocuments.length > 0 ? (
                    recentDocuments.map((doc) => (
                      <div key={doc.id} className="bg-surface/50 border border-border rounded-2xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          {doc.type === 'pdf' ? <FileText className="text-gray-400" size={24} /> : <FileImage className="text-gray-400" size={24} />}
                          <div>
                            <h4 className="text-sm font-semibold text-foreground">{doc.name}.{doc.type}</h4>
                            <p className="text-xs text-gray-500">{doc.date} • {doc.size}</p>
                          </div>
                        </div>
                        <button className="text-gray-400"><MoreVertical size={20} /></button>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-gray-500 text-sm py-4">No recent documents</div>
                  )}
                </div>

                {/* Mobile FAB */}
                <button 
                  onClick={() => setScannerMode('capture')}
                  className="fixed bottom-24 right-6 w-14 h-14 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform z-20"
                >
                  <Camera size={24} />
                </button>
              </div>

              {/* Desktop Empty State */}
              {pages.length === 0 ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="hidden md:flex max-w-4xl mx-auto border-2 border-dashed border-border rounded-3xl p-12 flex-col items-center justify-center text-gray-500 bg-surface/50 hover:bg-surface transition-colors cursor-pointer"
                >
                  <div className="w-16 h-16 rounded-full bg-surface-hover flex items-center justify-center mb-4 text-foreground">
                    <Upload size={24} />
                  </div>
                  <h3 className="text-xl font-medium text-foreground mb-2">Drop new scan here</h3>
                  <p>or click to browse files</p>
                </div>
              ) : (
                <div className="hidden md:grid max-w-4xl mx-auto grid-cols-2 md:grid-cols-4 gap-6">
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
            <div className="hidden md:block">
              {pages.length > 0 && <BatchCarousel />}
            </div>
          </div>
        )}
        
        {/* Mobile Bottom Navigation */}
        {scannerMode !== 'capture' && scannerMode !== 'edit' && (
          <nav className="md:hidden fixed bottom-0 w-full h-16 bg-surface border-t border-border flex items-center justify-around px-4 z-30">
            <button onClick={() => setScannerMode('preview')} className={`p-2 flex flex-col items-center gap-1 ${scannerMode !== 'export' ? 'text-primary' : 'text-gray-400'}`}>
              <LayoutGrid size={20} />
            </button>
            <button onClick={() => setScannerMode('capture')} className="p-2 flex flex-col items-center gap-1 text-gray-400 hover:text-foreground transition-colors">
              <Camera size={20} />
            </button>
            <button onClick={() => {
              if (pages.length > 0) {
                setCurrentPageId(pages[0].id);
                setEditReturnMode('preview');
                setScannerMode('edit');
              }
            }} className="p-2 flex flex-col items-center gap-1 text-gray-400 hover:text-foreground transition-colors">
              <SquarePen size={20} />
            </button>
            <button onClick={() => setScannerMode('export')} className={`p-2 flex flex-col items-center gap-1 ${scannerMode === 'export' ? 'text-primary' : 'text-gray-400'}`}>
              <Share size={20} />
            </button>
          </nav>
        )}
      </main>

      <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
      
      {scannerMode === 'capture' && <CameraCapture />}
      {scannerMode === 'edit' && <CropEditor />}

      {/* Hero overlay — unmounts itself after transition via onComplete */}
      {showHero && (
        <HeroOverlay
          onComplete={() => {
            setScannerMode('preview');
            setShowHero(false);
          }}
        />
      )}

      <PrivacyModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </div>
  );
}
