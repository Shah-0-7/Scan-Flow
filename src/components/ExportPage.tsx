"use client";
import { useScannerStore } from "@/store/useScannerStore";
import { LayoutGrid, List, FileText, FileArchive, Upload, Camera, ArrowLeft, Scan } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { DndContext, closestCenter, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ExportSuccessModal } from './ExportSuccessModal';

function SortableGridItem({ page, index, onCameraClick, onEdit }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  const style = { 
    transform: CSS.Transform.toString(transform), 
    transition,
    zIndex: isDragging ? 100 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className="group relative aspect-[3/4] min-w-[120px] md:min-w-0 bg-surface rounded-xl overflow-hidden border border-border hover:border-primary transition-colors cursor-grab active:cursor-grabbing snap-center"
      {...attributes}
      {...listeners}
    >
      <img src={page.croppedImage || page.originalImage} className="w-full h-full object-cover pointer-events-none select-none" />
      <div className="hidden md:block absolute top-2 left-2 bg-black/80 rounded-full px-2 py-0.5 text-xs font-medium text-white backdrop-blur-md z-10">P.{index + 1}</div>

      {/* Edit crop button on hover */}
      <div className="absolute inset-0 pointer-events-none group-hover:bg-black/40 transition-colors z-10 flex items-center justify-center">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="opacity-0 group-hover:opacity-100 pointer-events-auto cursor-pointer text-white text-xs font-semibold bg-black/60 rounded-full px-3 py-1.5 backdrop-blur-sm transition-opacity hover:bg-black/80 shadow-lg"
        >
          Edit Crop
        </button>
      </div>

      <div className="hidden md:block absolute bottom-0 w-full bg-surface border-t border-border p-2 text-xs text-center text-gray-300 truncate pointer-events-none select-none z-20">
        Page_{index+1}.jpg
      </div>

      {/* Mobile Page Indicator */}
      <div className="md:hidden absolute -bottom-6 w-full text-center text-xs font-medium text-gray-400">
        P.{index + 1}
      </div>
    </div>
  );
}

export function ExportPage() {
  const { pages, setScannerMode, reorderPages, addPage, setCurrentPageId, setEditReturnMode, addRecentDocument, clearPages } = useScannerStore();
  const [format, setFormat] = useState<'pdf' | 'zip'>('pdf');
  const [docName, setDocName] = useState('ScanFlow_Document');
  const [quality, setQuality] = useState(0.8);
  const [pageSize, setPageSize] = useState<'fit' | 'a4' | 'letter'>('fit');
  const [estimatedSize, setEstimatedSize] = useState<number | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [exportedBlob, setExportedBlob] = useState<Blob | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      reorderPages(active.id, over.id);
    }
  };

  const getCompressedImage = (src: string, q: number): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL("image/jpeg", q));
        } else {
          resolve(src);
        }
      };
      img.src = src;
    });
  };



  useEffect(() => {
    let isMounted = true;
    if (pages.length === 0) {
      setEstimatedSize(0);
      return;
    }

    const calculateSize = async () => {
      setIsCalculating(true);
      let totalBytes = 0;
      for (let i = 0; i < pages.length; i++) {
        const rawImg = pages[i].croppedImage || pages[i].originalImage;
        const compressedImg = await getCompressedImage(rawImg, quality);
        const base64Data = compressedImg.split(',')[1];
        if (base64Data) {
          const padding = (base64Data.match(/=+$/) || [''])[0].length;
          totalBytes += (base64Data.length * (3 / 4)) - padding;
        }
      }
      
      // Rough overhead estimation
      if (format === 'pdf') {
        totalBytes += (pages.length * 5000) + 10000;
      } else {
        totalBytes += (pages.length * 2000);
      }

      if (isMounted) {
        setEstimatedSize(totalBytes);
        setIsCalculating(false);
      }
    };
    
    // Debounce to prevent freezing the UI while sliding
    const timeout = setTimeout(calculateSize, 300);
    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [quality, pages, format]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };



  const handleExport = async () => {
    if (pages.length === 0) return;
    
    addRecentDocument({
      id: Date.now().toString(),
      name: docName,
      date: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
      size: formatSize(estimatedSize || 0),
      type: format
    });
    
      let finalBlob: Blob | null = null;
      if (format === 'pdf') {
        const doc = new jsPDF();
        doc.deletePage(1); // Remove default A4 page to generate dynamic pages
        
        for (let i = 0; i < pages.length; i++) {
          try {
            const rawImg = pages[i].croppedImage || pages[i].originalImage;
            const compressedImg = await getCompressedImage(rawImg, quality);
            const imgProps = doc.getImageProperties(compressedImg);
            
            let pdfWidth, pdfHeight;
            if (pageSize === 'fit') {
              // Scale image to fit within A4 dimensions (595 x 842 pt) while preserving aspect ratio
              const A4_W = 595, A4_H = 842;
              const imgRatio = imgProps.width / imgProps.height;
              if (imgRatio > A4_W / A4_H) {
                pdfWidth = A4_W;
                pdfHeight = A4_W / imgRatio;
              } else {
                pdfHeight = A4_H;
                pdfWidth = A4_H * imgRatio;
              }
              doc.addPage([pdfWidth, pdfHeight], pdfWidth > pdfHeight ? 'landscape' : 'portrait');
              doc.addImage(compressedImg, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            } else {
              doc.addPage(pageSize);
              pdfWidth = doc.internal.pageSize.getWidth();
              pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
              doc.addImage(compressedImg, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            }
          } catch (e) {
            console.error("Failed to add image to PDF", e);
          }
        }
        finalBlob = doc.output('blob');
        saveAs(finalBlob, `${docName}.pdf`);
      } else {
        const zip = new JSZip();
        for (let i = 0; i < pages.length; i++) {
          const rawImg = pages[i].croppedImage || pages[i].originalImage;
          const compressedImg = await getCompressedImage(rawImg, quality);
          const base64Data = compressedImg.split(',')[1];
          zip.file(`Page_${i + 1}.jpg`, base64Data, { base64: true });
        }
        finalBlob = await zip.generateAsync({ type: "blob" });
        saveAs(finalBlob, `${docName}.zip`);
      }

      setExportedBlob(finalBlob);
      setIsSuccessModalOpen(true);
  };



  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden bg-background relative">
      
      {/* Mobile Top Bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-4 bg-background flex-shrink-0 z-20">
        <button onClick={() => setScannerMode('preview')} className="text-white">
          <ArrowLeft size={24} />
        </button>
      </div>

      {/* Batch Queue Area */}
      <div className="flex-none md:flex-1 p-4 md:p-8 overflow-visible md:overflow-y-auto">
        <div className="flex justify-between items-start md:items-end mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-2xl md:text-3xl font-bold text-white">Batch Queue</h2>
              <span className="md:hidden bg-surface border border-border/50 text-gray-300 text-xs px-2 py-0.5 rounded-full font-medium shadow-sm">
                {pages.length} Pages
              </span>
            </div>
            <p className="text-gray-400 text-xs md:text-sm max-w-[280px] md:max-w-full">Review and configure export settings for your document batch.</p>
          </div>
          <div className="hidden md:flex gap-2 text-gray-400">
            <button className="p-2 rounded-lg bg-surface hover:text-white transition-colors"><LayoutGrid size={20} /></button>
            <button className="p-2 rounded-lg hover:bg-surface hover:text-white transition-colors"><List size={20} /></button>
          </div>
        </div>

        <div className="flex flex-row md:grid md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6 overflow-x-auto md:overflow-visible hide-scrollbar snap-x pb-8 md:pb-0 px-2 md:px-0 -mx-2 md:mx-0">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={pages.map(p => p.id)} strategy={rectSortingStrategy}>
              {pages.map((page, i) => (
                <SortableGridItem 
                  key={page.id} 
                  page={page} 
                  index={i} 
                  onCameraClick={() => setScannerMode('capture')} 
                  onEdit={() => {
                    setCurrentPageId(page.id);
                    setEditReturnMode('export');
                    setScannerMode('edit');
                  }}
                />
              ))}
            </SortableContext>
          </DndContext>
          
          <button onClick={() => fileInputRef.current?.click()} className="aspect-[3/4] min-w-[120px] md:min-w-0 bg-surface/30 border-2 border-dashed border-gray-400 rounded-xl flex flex-col items-center justify-center text-gray-300 hover:bg-white hover:border-white hover:text-gray-900 transition-all cursor-pointer snap-center">
            <Upload size={24} className="mb-2" />
            <span className="font-medium text-sm">Add Page</span>
          </button>
          <button onClick={() => setScannerMode('capture')} className="aspect-[3/4] min-w-[120px] md:min-w-0 bg-primary/5 border-2 border-dashed border-primary/50 rounded-xl flex flex-col items-center justify-center text-primary hover:bg-primary hover:text-primary-foreground transition-colors snap-center">
            <Camera size={24} className="mb-2" />
            <span className="font-medium text-sm">Scan Page</span>
          </button>
        </div>
        <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
      </div>
      
      {/* Mobile Divider */}
      <div className="md:hidden border-t border-border/50 mx-4 my-2"></div>

      {/* Export Settings Sidebar */}
      <div className="w-full md:w-80 md:border-l border-border bg-transparent md:bg-surface p-4 md:p-6 flex flex-col md:overflow-y-auto flex-none md:flex-1 pb-24 md:pb-6 relative">
        <h3 className="text-xl font-bold mb-4 text-white">Export Settings</h3>
        <p className="text-sm text-gray-400 mb-8 hidden md:block">Configure final output before saving.</p>

        <div className="space-y-8 flex-1">
          <div>
            <label className="text-xs text-gray-300 md:text-gray-400 font-mono tracking-widest mb-2 block">Document Name</label>
            <input 
              type="text" 
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-primary transition-colors shadow-inner"
            />
          </div>

          <div>
            <label className="text-xs text-gray-300 md:text-gray-400 font-mono tracking-widest mb-2 block">Output Format</label>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => setFormat('pdf')}
                className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-colors ${
                  format === 'pdf' ? 'bg-transparent text-primary border-primary bg-primary/5' : 'bg-surface border-border text-gray-400 hover:text-white hover:border-gray-500'
                }`}
              >
                <FileText size={20} className={format === 'pdf' ? 'text-primary' : 'text-gray-300'} />
                <span className={`text-xs font-medium ${format === 'pdf' ? 'text-primary' : 'text-gray-300'}`}>Merge to PDF</span>
              </button>
              <button 
                onClick={() => setFormat('zip')}
                className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-colors ${
                  format === 'zip' ? 'bg-transparent text-primary border-primary bg-primary/5' : 'bg-surface border-border text-gray-400 hover:text-white hover:border-gray-500'
                }`}
              >
                <FileArchive size={20} className={format === 'zip' ? 'text-primary' : 'text-gray-300'} />
                <span className={`text-xs font-medium ${format === 'zip' ? 'text-primary' : 'text-gray-300'}`}>ZIP Images</span>
              </button>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs text-gray-300 md:text-gray-400 font-mono tracking-widest block">Quality &amp; Size</label>
              <span className="text-xs text-primary font-bold">
                {isCalculating ? "Calculating..." : `~${formatSize(estimatedSize || 0)}`}
              </span>
            </div>
            <input 
              type="range" 
              min="0.1" 
              max="1" 
              step="0.01" 
              value={quality} 
              onChange={(e) => setQuality(parseFloat(e.target.value))}
              className="w-full accent-primary" 
            />
            <div className="flex justify-between text-[10px] text-gray-500 mt-1 uppercase font-semibold tracking-wider">
              <span>Low</span>
              <span>Med</span>
              <span>High</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-300 md:text-gray-400 font-mono tracking-widest mb-2 block">Page Size</label>
            <div className="relative">
              <select 
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value as 'fit' | 'a4' | 'letter')}
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-primary appearance-none transition-colors shadow-inner"
              >
                <option value="fit">Fit Image Size</option>
                <option value="a4">A4 (210 × 297 mm)</option>
                <option value="letter">Letter (8.5 × 11 in)</option>
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-gray-400">
                <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" fillRule="evenodd"></path></svg>
              </div>
            </div>
          </div>
        </div>

        <div className="md:pt-6 md:border-t border-border md:mt-6 mt-8">
          <button onClick={handleExport} className="w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-xl hover:bg-[#e0d0b0] transition-colors flex items-center justify-center gap-2 shadow-[0_4px_14px_0_rgba(242,227,198,0.39)]">
            <Upload size={18} /> Export Document
          </button>
        </div>
      </div>

      <ExportSuccessModal
        isOpen={isSuccessModalOpen}
        onClose={() => setIsSuccessModalOpen(false)}
        fileName={`${docName}.${format}`}
        fileSize={formatSize(estimatedSize || 0)}
        pageCount={pages.length}
        fileBlob={exportedBlob}
        onStartNewScan={() => {
          setIsSuccessModalOpen(false);
          clearPages();
          setScannerMode('home');
        }}
        onDownloadAgain={handleExport}
      />
    </div>
  );
}
