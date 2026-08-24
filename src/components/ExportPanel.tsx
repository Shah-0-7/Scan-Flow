"use client";
import { useScannerStore } from "@/store/useScannerStore";
import { Upload } from "lucide-react";

export function ExportPanel() {
  const { pages, setScannerMode } = useScannerStore();

  if (pages.length === 0) return null;

  return (
    <button onClick={() => setScannerMode('export')} className="bg-surface-hover hover:bg-surface text-foreground border border-border px-4 py-2 rounded-xl flex items-center gap-2 font-medium transition-colors text-sm">
      <Upload size={16} /> Export
    </button>
  );
}
