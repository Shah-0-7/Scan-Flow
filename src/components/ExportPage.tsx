"use client";
import { useScannerStore } from "@/store/useScannerStore";
import { LayoutGrid, List, FileText, FileArchive, Upload, Camera } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { DndContext, closestCenter, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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
      className="group relative aspect-[3/4] bg-surface rounded-xl overflow-hidden border border-border hover:border-primary transition-colors cursor-grab active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <img src={page.croppedImage || page.originalImage} className="w-full h-full object-cover pointer-events-none select-none" />
      <div className="absolute top-2 left-2 bg-black/80 rounded-full px-2 py-0.5 text-xs font-medium text-white backdrop-blur-md z-10">P.{index + 1}</div>

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

      <div className="absolute bottom-0 w-full bg-surface border-t border-border p-2 text-xs text-center text-gray-300 truncate pointer-events-none select-none z-20">
        Page_{index+1}.jpg
      </div>
    </div>
  );
}

export function ExportPage() {
  const { pages, setScannerMode, reorderPages, addPage, setCurrentPageId, setEditReturnMode } = useScannerStore();
  const [format, setFormat] = useState<'pdf' | 'zip'>('pdf');
  const [docName, setDocName] = useState('ScanFlow_Document');
  const [quality, setQuality] = useState(0.8);
  const [pageSize, setPageSize] = useState<'fit' | 'a4' | 'letter'>('fit');
  const [estimatedSize, setEstimatedSize] = useState<number | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
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
              adjustments: { brightness: 100, contrast: 100, saturation: 100 }
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
            // Assume 96 DPI: 1 pixel = 0.75 points
            pdfWidth = imgProps.width * 0.75;
            pdfHeight = imgProps.height * 0.75;
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
      doc.save(`${docName}.pdf`);
    } else {
      const zip = new JSZip();
      for (let i = 0; i < pages.length; i++) {
        const rawImg = pages[i].croppedImage || pages[i].originalImage;
        const compressedImg = await getCompressedImage(rawImg, quality);
        const base64Data = compressedImg.split(',')[1];
        zip.file(`Page_${i + 1}.jpg`, base64Data, { base64: true });
      }
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `${docName}.zip`);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-background">
      {/* Batch Queue Area */}
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="flex justify-between items-end mb-6">
          <div>
            <h2 className="text-3xl font-bold mb-1">Batch Queue</h2>
            <p className="text-gray-400 text-sm">{pages.length} pages ready for export. Drag to reorder.</p>
          </div>
          <div className="flex gap-2 text-gray-400">
            <button className="p-2 rounded-lg bg-surface hover:text-white transition-colors"><LayoutGrid size={20} /></button>
            <button className="p-2 rounded-lg hover:bg-surface hover:text-white transition-colors"><List size={20} /></button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
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
          
          <button onClick={() => fileInputRef.current?.click()} className="aspect-[3/4] bg-surface/30 border-2 border-dashed border-gray-400 rounded-xl flex flex-col items-center justify-center text-gray-300 hover:bg-white hover:border-white hover:text-gray-900 transition-all cursor-pointer">
            <Upload size={24} className="mb-2" />
            <span className="font-medium">Add Page</span>
          </button>
          <button onClick={() => setScannerMode('capture')} className="aspect-[3/4] bg-primary/5 border-2 border-dashed border-primary/50 rounded-xl flex flex-col items-center justify-center text-primary hover:bg-primary hover:text-primary-foreground transition-colors">
            <Camera size={24} className="mb-2" />
            <span className="font-medium">Scan Page</span>
          </button>
        </div>
        <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
      </div>

      {/* Export Settings Sidebar */}
      <div className="w-80 border-l border-border bg-surface p-6 flex flex-col overflow-y-auto">
        <h3 className="text-xl font-bold mb-2">Export Settings</h3>
        <p className="text-sm text-gray-400 mb-8">Configure final output before saving.</p>

        <div className="space-y-6 flex-1">
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Document Name</label>
            <input 
              type="text" 
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Output Format</label>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => setFormat('pdf')}
                className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-colors ${
                  format === 'pdf' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-gray-400 hover:text-white hover:border-gray-500'
                }`}
              >
                <FileText size={24} />
                <span className="text-sm font-medium">Merge to PDF</span>
              </button>
              <button 
                onClick={() => setFormat('zip')}
                className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-colors ${
                  format === 'zip' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-gray-400 hover:text-white hover:border-gray-500'
                }`}
              >
                <FileArchive size={24} />
                <span className="text-sm font-medium">ZIP Images</span>
              </button>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs text-gray-400 uppercase tracking-wider block">Quality</label>
              <span className="text-xs text-gray-400">
                {isCalculating ? "Calculating..." : estimatedSize !== null ? `Approx. ${formatSize(estimatedSize)}` : ""}
              </span>
            </div>
            <input 
              type="range" 
              min="0.1" 
              max="1" 
              step="0.1" 
              value={quality} 
              onChange={(e) => setQuality(parseFloat(e.target.value))}
              className="w-full accent-primary" 
            />
            <div className="flex justify-between text-[10px] text-gray-500 mt-1">
              <span>Low</span>
              <span>High</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Page Size Match</label>
            <select 
              value={pageSize}
              onChange={(e) => setPageSize(e.target.value as 'fit' | 'a4' | 'letter')}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary appearance-none transition-colors"
            >
              <option value="fit">Fit Image Size</option>
              <option value="a4">A4 (210 x 297 mm)</option>
              <option value="letter">Letter (8.5 x 11 in)</option>
            </select>
          </div>
        </div>

        <div className="pt-6 border-t border-border mt-6">
          <button onClick={handleExport} className="w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:bg-[#e0d0b0] transition-colors flex items-center justify-center gap-2">
            <Upload size={18} /> Export Document
          </button>
        </div>
      </div>
    </div>
  );
}
