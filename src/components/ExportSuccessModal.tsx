"use client";
import { useEffect } from "react";
import { Download, Share, Plus, Edit2, ShieldCheck, File as FileIcon, X } from "lucide-react";

interface ExportSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  fileSize: string;
  pageCount: number;
  fileBlob: Blob | null;
  onStartNewScan: () => void;
  onDownloadAgain: () => void;
}

export function ExportSuccessModal({
  isOpen,
  onClose,
  fileName,
  fileSize,
  pageCount,
  fileBlob,
  onStartNewScan,
  onDownloadAgain
}: ExportSuccessModalProps) {

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleShare = async () => {
    if (!navigator.share) {
      alert("Web Share API is not supported on this browser (or you are not on HTTPS/localhost).");
      await navigator.clipboard.writeText(`${fileName} - ${pageCount} pages, ${fileSize}`);
      return;
    }

    if (!fileBlob) {
      alert("Error: File blob is missing.");
      return;
    }

    try {
      let sharedFile = false;
      const mimeType = fileName.endsWith('.pdf') ? 'application/pdf' : 'application/zip';
      const file = new File([fileBlob], fileName, { type: mimeType });
      
      try {
        await navigator.share({
          files: [file],
          title: fileName
        });
        sharedFile = true;
      } catch (e: any) {
        if (e.name === 'AbortError') return;
        alert(`File share failed: ${e.message || e.name}. Falling back to text...`);
      }
      
      if (!sharedFile) {
        if (navigator.share) {
          try {
            await navigator.share({
              title: 'Document Ready',
              text: `Check out my scanned document: ${fileName} (${pageCount} pages, ${fileSize})`,
            });
          } catch (e: any) {
            if (e.name === 'AbortError') return;
            console.warn("Text sharing failed, falling back to clipboard", e);
            await navigator.clipboard.writeText(`${fileName} - ${pageCount} pages, ${fileSize}`);
            alert("Document details copied to clipboard!");
          }
        } else {
          await navigator.clipboard.writeText(`${fileName} - ${pageCount} pages, ${fileSize}`);
          alert("Document details copied to clipboard!");
        }
      }
    } catch (error) {
      console.error("Error sharing:", error);
      try {
        await navigator.clipboard.writeText(`${fileName} - ${pageCount} pages, ${fileSize}`);
        alert("Document details copied to clipboard as fallback!");
      } catch (e) {
        // silent
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal Card */}
      <div className="relative bg-surface border border-border w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 pb-4 border-b border-white/5 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl font-bold text-white">Document Ready!</h2>
              <ShieldCheck className="text-primary w-5 h-5" />
            </div>
            <p className="text-sm text-gray-400">Successfully generated and saved.</p>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 bg-surface-hover rounded-full"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 pt-4">
          
          {/* Metadata Card */}
          <div className="bg-background rounded-xl p-4 flex items-center gap-4 mb-6 border border-border/50">
            <div className="bg-primary/10 text-primary p-3 rounded-lg shrink-0">
              <FileIcon size={24} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-white font-medium truncate text-sm mb-1" title={fileName}>
                {fileName}
              </h3>
              <div className="flex items-center gap-2 text-xs font-semibold">
                <span className="text-primary bg-primary/10 px-2 py-0.5 rounded-md">{fileSize}</span>
                <span className="text-gray-400 bg-surface-hover px-2 py-0.5 rounded-md">{pageCount} Pages</span>
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="grid grid-cols-4 gap-2">
            <button 
              onClick={onDownloadAgain}
              className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-surface-hover text-gray-300 hover:text-white transition-all group"
              title="Download Again"
            >
              <div className="bg-background group-hover:bg-primary/20 group-hover:text-primary p-2.5 rounded-full transition-colors">
                <Download size={20} />
              </div>
              <span className="text-[10px] font-medium">Download</span>
            </button>
            
            <button 
              onClick={handleShare}
              className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-surface-hover text-gray-300 hover:text-white transition-all group"
              title="Share Details"
            >
              <div className="bg-background group-hover:bg-primary/20 group-hover:text-primary p-2.5 rounded-full transition-colors">
                <Share size={20} />
              </div>
              <span className="text-[10px] font-medium">Share</span>
            </button>
            
            <button 
              onClick={onStartNewScan}
              className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-surface-hover text-gray-300 hover:text-white transition-all group"
              title="Start New Scan"
            >
              <div className="bg-background group-hover:bg-primary/20 group-hover:text-primary p-2.5 rounded-full transition-colors">
                <Plus size={20} />
              </div>
              <span className="text-[10px] font-medium">New Scan</span>
            </button>
            
            <button 
              onClick={onClose}
              className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-surface-hover text-gray-300 hover:text-white transition-all group"
              title="Keep Editing"
            >
              <div className="bg-background group-hover:bg-primary/20 group-hover:text-primary p-2.5 rounded-full transition-colors">
                <Edit2 size={20} />
              </div>
              <span className="text-[10px] font-medium">Edit</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
