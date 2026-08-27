"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useScannerStore } from "@/store/useScannerStore";
import { X, RotateCcw, Check, Wand2, Scan, SlidersHorizontal, Crop, Square, Type, Sparkles } from "lucide-react";
import { FilterType, Adjustments } from "@/types";

interface Point { x: number; y: number; }

type Tab = 'crop' | 'filter' | 'adjust';

// ─── Native Edge Detection for Auto Boundaries ────────────────────────────────
function detectDocumentBoundaries(src: string): Promise<Point[] | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const processSize = 300; // Downscale for fast processing
      const scaleX = img.naturalWidth / processSize;
      const scaleY = img.naturalHeight / processSize;
      
      const canvas = document.createElement('canvas');
      canvas.width = processSize;
      canvas.height = processSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(null); return; }
      
      ctx.drawImage(img, 0, 0, processSize, processSize);
      const imgData = ctx.getImageData(0, 0, processSize, processSize);
      const data = imgData.data;
      
      const gray = new Float32Array(processSize * processSize);
      for(let i=0; i<data.length; i+=4) {
         gray[i/4] = 0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2];
      }
      
      const sobelData = new Float32Array(processSize * processSize);
      let maxGrad = 0;
      for (let y=1; y<processSize-1; y++) {
         for (let x=1; x<processSize-1; x++) {
            const idx = y*processSize + x;
            const gx = 
               -1 * gray[idx - processSize - 1] + 1 * gray[idx - processSize + 1] +
               -2 * gray[idx - 1]               + 2 * gray[idx + 1] +
               -1 * gray[idx + processSize - 1] + 1 * gray[idx + processSize + 1];
               
            const gy = 
               -1 * gray[idx - processSize - 1] - 2 * gray[idx - processSize] - 1 * gray[idx - processSize + 1] +
                1 * gray[idx + processSize - 1] + 2 * gray[idx + processSize] + 1 * gray[idx + processSize + 1];
                
            const grad = Math.sqrt(gx*gx + gy*gy);
            sobelData[idx] = grad;
            if (grad > maxGrad) maxGrad = grad;
         }
      }
      
      const edgeThreshold = maxGrad * 0.25; 
      let points = [];
      for(let y=1; y<processSize-1; y++) {
         for(let x=1; x<processSize-1; x++) {
            if (sobelData[y*processSize + x] > edgeThreshold) {
               points.push({x, y});
            }
         }
      }
      
      if (points.length < 50) {
         resolve(null);
         return;
      }
      
      let tl = points[0], tr = points[0], br = points[0], bl = points[0];
      for (let p of points) {
         if (p.x + p.y < tl.x + tl.y) tl = p;
         if (p.x - p.y > tr.x - tr.y) tr = p;
         if (p.x + p.y > br.x + br.y) br = p;
         if (p.x - p.y < bl.x - bl.y) bl = p;
      }
      
      // Add slight padding inwards (if possible) or just use raw detected extremities
      resolve([
         {x: tl.x * scaleX, y: tl.y * scaleY},
         {x: tr.x * scaleX, y: tr.y * scaleY},
         {x: br.x * scaleX, y: br.y * scaleY},
         {x: bl.x * scaleX, y: bl.y * scaleY}
      ]);
    };
    img.src = src;
  });
}

// ─── Warp worker source — runs off main thread (non-blocking) ──────────────────
const WARP_WORKER_SRC = `
self.onmessage = function(e) {
  var d = e.data;
  var src32 = new Uint32Array(d.srcBuf);
  var dst32 = new Uint32Array(d.outW * d.outH);
  var tl = d.tl, tr = d.tr, br = d.br, bl = d.bl;
  var invW = 1.0 / d.outW, invH = 1.0 / d.outH;
  for (var dy = 0; dy < d.outH; dy++) {
    var ty = dy * invH;
    var lx = (1-ty)*tl.x + ty*bl.x, ly = (1-ty)*tl.y + ty*bl.y;
    var rx = (1-ty)*tr.x + ty*br.x, ry = (1-ty)*tr.y + ty*br.y;
    var dxr = rx-lx, dyr = ry-ly;
    var base = dy * d.outW;
    for (var dx = 0; dx < d.outW; dx++) {
      var tx = dx * invW;
      var ix = (lx + tx*dxr + 0.5) | 0;
      var iy = (ly + tx*dyr + 0.5) | 0;
      if (ix >= 0 && ix < d.srcW && iy >= 0 && iy < d.srcH)
        dst32[base + dx] = src32[iy * d.srcW + ix];
    }
  }
  self.postMessage(dst32.buffer, [dst32.buffer]);
};
`;

function warpPerspective(
  src: string,
  corners: Point[],
  outW: number,
  outH: number
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const srcCanvas = document.createElement("canvas");
      srcCanvas.width = img.naturalWidth;
      srcCanvas.height = img.naturalHeight;
      const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true })!;
      srcCtx.drawImage(img, 0, 0);

      let srcData: ImageData;
      try {
        srcData = srcCtx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
      } catch {
        const xs = corners.map(c => c.x);
        const ys = corners.map(c => c.y);
        const x0 = Math.max(0, Math.min(...xs));
        const y0 = Math.max(0, Math.min(...ys));
        const w = Math.min(img.naturalWidth - x0, Math.max(...xs) - x0);
        const h = Math.min(img.naturalHeight - y0, Math.max(...ys) - y0);
        const dst = document.createElement("canvas");
        dst.width = w; dst.height = h;
        dst.getContext("2d")!.drawImage(img, x0, y0, w, h, 0, 0, w, h);
        resolve(dst.toDataURL("image/jpeg", 0.92));
        return;
      }

      const [tl, tr, br, bl] = corners;
      const srcBuf = srcData.data.buffer;

      const blob = new Blob([WARP_WORKER_SRC], { type: "application/javascript" });
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);

      const finish = (dstBuf: ArrayBuffer) => {
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
        const dstCanvas = document.createElement("canvas");
        dstCanvas.width = outW; dstCanvas.height = outH;
        const dstCtx = dstCanvas.getContext("2d")!;
        const dstImgData = dstCtx.createImageData(outW, outH);
        new Uint8Array(dstImgData.data.buffer).set(new Uint8Array(dstBuf));
        dstCtx.putImageData(dstImgData, 0, 0);
        resolve(dstCanvas.toDataURL("image/jpeg", 0.92));
      };

      worker.onmessage = (ev) => finish(ev.data);
      worker.onerror = () => {
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
        // Fallback: simple bounding-box crop
        const xs = corners.map(c => c.x), ys = corners.map(c => c.y);
        const x0 = Math.min(...xs), y0 = Math.min(...ys);
        const fw = Math.max(...xs) - x0, fh = Math.max(...ys) - y0;
        const fb = document.createElement("canvas");
        fb.width = outW; fb.height = outH;
        fb.getContext("2d")!.drawImage(srcCanvas, x0, y0, fw, fh, 0, 0, outW, outH);
        resolve(fb.toDataURL("image/jpeg", 0.92));
      };

      // Transfer srcBuf zero-copy into the worker
      worker.postMessage(
        { srcBuf, srcW: img.naturalWidth, srcH: img.naturalHeight, outW, outH, tl, tr, br, bl },
        [srcBuf]
      );
    };
    img.src = src;
  });
}

// ─── Apply filter and adjustments — GPU-accelerated via ctx.filter ───────────
// One drawImage call with ctx.filter replaces the entire per-pixel JS loop
function applyFilter(src: string, filter: FilterType, adj: Adjustments): Promise<string> {
  return new Promise((resolve) => {
    if (filter === "original" && adj.brightness === 0 && adj.contrast === 0 && adj.saturation === 0) {
      resolve(src);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;

      // Build CSS filter string — browser/GPU handles all the maths
      let f = "";
      if (adj.brightness !== 0) f += `brightness(${1 + adj.brightness / 100}) `;
      if (adj.contrast   !== 0) f += `contrast(${1 + adj.contrast / 100}) `;
      if (adj.saturation !== 0) f += `saturate(${1 + adj.saturation / 100}) `;
      if (filter === "grayscale")      f += "grayscale(100%) ";
      else if (filter === "bw")        f += "grayscale(100%) contrast(1000%) ";
      else if (filter === "magic")     f += "contrast(150%) brightness(110%) saturate(120%) ";
      else if (filter === "highlight") f += "contrast(200%) brightness(120%) grayscale(20%) ";

      if (f.trim()) ctx.filter = f.trim();
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.src = src;
  });
}

// ─── CropEditor ───────────────────────────────────────────────────────────────
export function CropEditor() {
  const { pages, currentPageId, updatePage, setScannerMode, editReturnMode } = useScannerStore();
  const page = pages.find((p) => p.id === currentPageId);

  const containerRef = useRef<HTMLDivElement>(null);
  const [imgLoaded, setImgLoaded]     = useState(false);
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0, offX: 0, offY: 0 });
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [corners, setCorners]         = useState<Point[]>([]);
  const [activeCorner, setActiveCorner] = useState<number | null>(null);
  const dragRef = useRef<{ x: number, y: number, originalCorners: Point[] } | null>(null);
  const [lockedRatio, setLockedRatio]   = useState<number | null>(null);
  
  const [activeTab, setActiveTab]     = useState<Tab>('crop');
  const [filter, setFilter]           = useState<FilterType>(page?.filter ?? "original");
  const [adjustments, setAdjustments] = useState<Adjustments>(page?.adjustments ?? { brightness: 0, contrast: 0, saturation: 0 });
  
  const [processing, setProcessing]   = useState(false);
  const [currentSrc, setCurrentSrc]   = useState<string>("");
  const [mobileEditOpen, setMobileEditOpen] = useState(false);
  const [mobileEditTab, setMobileEditTab]   = useState<'filters' | 'adjustments'>('filters');
  const [activeAdjustment, setActiveAdjustment] = useState<'brightness' | 'contrast' | 'saturation' | null>('brightness');

  useEffect(() => {
    if (page) setCurrentSrc(page.originalImage);
  }, []);

  const getPreviewStyle = () => {
    let cssFilter = "";
    if (adjustments.brightness !== 0) cssFilter += `brightness(${1 + adjustments.brightness / 100}) `;
    if (adjustments.contrast !== 0) cssFilter += `contrast(${1 + adjustments.contrast / 100}) `;
    if (adjustments.saturation !== 0) cssFilter += `saturate(${1 + adjustments.saturation / 100}) `;
    
    if (filter === 'grayscale') cssFilter += 'grayscale(100%) ';
    else if (filter === 'bw') cssFilter += 'grayscale(100%) contrast(1000%) ';
    else if (filter === 'magic') cssFilter += 'contrast(150%) brightness(110%) saturate(120%) ';
    else if (filter === 'highlight') cssFilter += 'contrast(200%) brightness(120%) grayscale(20%) ';

    return cssFilter.trim() ? { filter: cssFilter } : {};
  };

  const computeDisplay = useCallback((imgEl?: HTMLImageElement) => {
    if (!containerRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    
    // Use the passed image element, or fall back to naturalSize state
    const iw = imgEl ? imgEl.naturalWidth : naturalSize.w;
    const ih = imgEl ? imgEl.naturalHeight : naturalSize.h;
    
    if (!iw || !ih) return;
    const scale = Math.min(cw / iw, ch / ih);
    const dw = iw * scale, dh = ih * scale;
    const offX = (cw - dw) / 2, offY = (ch - dh) / 2;
    setDisplaySize({ w: dw, h: dh, offX, offY });
    
    if (imgEl) {
      setNaturalSize({ w: iw, h: ih });
    }
  }, [naturalSize]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      computeDisplay();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [computeDisplay]);

  const setDefaultCorners = useCallback((iw: number, ih: number) => {
    // Default to full image bounds so no auto-crop is applied
    setCorners([
      { x: 0,  y: 0  },
      { x: iw, y: 0  },
      { x: iw, y: ih },
      { x: 0,  y: ih },
    ]);
  }, []);

  const handleAutoDetect = async () => {
    if (!currentSrc || !naturalSize.w) return;
    setLockedRatio(null);
    const bounds = await detectDocumentBoundaries(currentSrc);
    if (bounds) {
      setCorners(bounds);
    } else {
      setDefaultCorners(naturalSize.w, naturalSize.h);
    }
  };

  const applyAspectRatio = (ratio: number | 'free') => {
    if (ratio === 'free') {
      setLockedRatio(null);
      setDefaultCorners(naturalSize.w, naturalSize.h);
      return;
    }
    setLockedRatio(ratio);
    const iw = naturalSize.w;
    const ih = naturalSize.h;
    if (!iw || !ih) return;

    let targetW = iw;
    let targetH = iw / ratio;

    if (targetH > ih) {
      targetH = ih;
      targetW = ih * ratio;
    }

    // Shrink slightly to give some padding
    targetW *= 0.9;
    targetH *= 0.9;

    const offX = (iw - targetW) / 2;
    const offY = (ih - targetH) / 2;

    setCorners([
      { x: offX, y: offY },
      { x: offX + targetW, y: offY },
      { x: offX + targetW, y: offY + targetH },
      { x: offX, y: offY + targetH },
    ]);
  };

  const onImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    computeDisplay(img);
    if (page?.cropPoints && page.cropPoints.length === 4) {
      setCorners(page.cropPoints);
    } else {
      setDefaultCorners(img.naturalWidth, img.naturalHeight);
    }
    setImgLoaded(true);
  }, [computeDisplay, setDefaultCorners, page?.cropPoints]);

  const toScreen = (p: Point): Point => ({
    x: displaySize.w ? p.x * (displaySize.w / naturalSize.w) + displaySize.offX : 0,
    y: displaySize.h ? p.y * (displaySize.h / naturalSize.h) + displaySize.offY : 0,
  });
  const toImage = (sx: number, sy: number): Point => ({
    x: naturalSize.w ? (sx - displaySize.offX) / (displaySize.w / naturalSize.w) : 0,
    y: naturalSize.h ? (sy - displaySize.offY) / (displaySize.h / naturalSize.h) : 0,
  });

  const onPointerDown = (idx: number, e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    setActiveCorner(idx);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeCorner === null || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pt = toImage(e.clientX - rect.left, e.clientY - rect.top);
    
    // Handle moving the entire crop box
    if (activeCorner === 4 && dragRef.current) {
      const dx = pt.x - dragRef.current.x;
      const dy = pt.y - dragRef.current.y;
      const { originalCorners } = dragRef.current;
      
      const minX = Math.min(...originalCorners.map(c => c.x));
      const minY = Math.min(...originalCorners.map(c => c.y));
      const maxX = Math.max(...originalCorners.map(c => c.x));
      const maxY = Math.max(...originalCorners.map(c => c.y));
      
      // Clamp shift to image bounds
      let shiftX = dx;
      let shiftY = dy;
      if (minX + shiftX < 0) shiftX = -minX;
      if (minY + shiftY < 0) shiftY = -minY;
      if (maxX + shiftX > naturalSize.w) shiftX = naturalSize.w - maxX;
      if (maxY + shiftY > naturalSize.h) shiftY = naturalSize.h - maxY;
      
      setCorners(originalCorners.map(c => ({
        x: c.x + shiftX,
        y: c.y + shiftY
      })));
      return;
    }

    if (lockedRatio) {
       const newCorners = [...corners];
       let newW, newH;
       let targetX = pt.x;
       let targetY = pt.y;

       if (activeCorner === 0) { // TL
         newW = corners[2].x - targetX;
         newH = corners[2].y - targetY;
         if (Math.abs(newW) > Math.abs(newH) * lockedRatio) {
            newW = newH * lockedRatio;
            targetX = corners[2].x - newW;
         } else {
            newH = newW / lockedRatio;
            targetY = corners[2].y - newH;
         }
         newCorners[0] = {x: targetX, y: targetY};
         newCorners[1] = {x: corners[2].x, y: targetY};
         newCorners[3] = {x: targetX, y: corners[2].y};
       } else if (activeCorner === 1) { // TR
         newW = targetX - corners[3].x;
         newH = corners[3].y - targetY;
         if (Math.abs(newW) > Math.abs(newH) * lockedRatio) {
            newW = newH * lockedRatio;
            targetX = corners[3].x + newW;
         } else {
            newH = newW / lockedRatio;
            targetY = corners[3].y - newH;
         }
         newCorners[1] = {x: targetX, y: targetY};
         newCorners[0] = {x: corners[3].x, y: targetY};
         newCorners[2] = {x: targetX, y: corners[3].y};
       } else if (activeCorner === 2) { // BR
         newW = targetX - corners[0].x;
         newH = targetY - corners[0].y;
         if (Math.abs(newW) > Math.abs(newH) * lockedRatio) {
            newW = newH * lockedRatio;
            targetX = corners[0].x + newW;
         } else {
            newH = newW / lockedRatio;
            targetY = corners[0].y + newH;
         }
         newCorners[2] = {x: targetX, y: targetY};
         newCorners[1] = {x: targetX, y: corners[0].y};
         newCorners[3] = {x: corners[0].x, y: targetY};
       } else if (activeCorner === 3) { // BL
         newW = corners[1].x - targetX;
         newH = targetY - corners[1].y;
         if (Math.abs(newW) > Math.abs(newH) * lockedRatio) {
            newW = newH * lockedRatio;
            targetX = corners[1].x - newW;
         } else {
            newH = newW / lockedRatio;
            targetY = corners[1].y + newH;
         }
         newCorners[3] = {x: targetX, y: targetY};
         newCorners[0] = {x: targetX, y: corners[1].y};
         newCorners[2] = {x: corners[1].x, y: targetY};
       }

       if (targetX >= 0 && targetX <= naturalSize.w && targetY >= 0 && targetY <= naturalSize.h) {
         setCorners(newCorners);
       }
    } else {
       const clamped = {
         x: Math.max(0, Math.min(naturalSize.w, pt.x)),
         y: Math.max(0, Math.min(naturalSize.h, pt.y)),
       };
       setCorners(prev => prev.map((c, i) => i === activeCorner ? clamped : c));
    }
  };

  const onPointerUp = () => setActiveCorner(null);

  const handleRotate = () => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalHeight;
      canvas.height = img.naturalWidth;
      const ctx = canvas.getContext("2d")!;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      const rotated = canvas.toDataURL("image/jpeg", 0.95);
      setCurrentSrc(rotated);
      setImgLoaded(false);
      setCorners([]);
    };
    img.src = currentSrc;
  };

  const handleConfirm = async () => {
    if (!page || corners.length < 4 || !naturalSize.w) return;
    setProcessing(true);
    try {
      // Check if corners cover the full image — if so, skip the expensive warp
      const isFullImage =
        corners[0].x === 0 && corners[0].y === 0 &&
        corners[1].x === naturalSize.w && corners[1].y === 0 &&
        corners[2].x === naturalSize.w && corners[2].y === naturalSize.h &&
        corners[3].x === 0 && corners[3].y === naturalSize.h;

      const warped = isFullImage
        ? currentSrc
        : await warpPerspective(
            currentSrc, corners,
            Math.max(Math.round(Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y)), 100),
            Math.max(Math.round(Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y)), 100)
          );

      const filtered = await applyFilter(warped, filter, adjustments);
      updatePage(page.id, { croppedImage: filtered, cropPoints: corners, filter, adjustments });
      setScannerMode(editReturnMode);
    } catch (err) {
      console.error("Crop/Filter failed", err);
    } finally {
      setProcessing(false);
    }
  };

  if (!page) return null;

  const screenCorners = corners.length === 4 ? corners.map(toScreen) : [];

  const FILTERS: { key: FilterType; label: string }[] = [
    { key: "original",  label: "Original"  },
    { key: "magic",     label: "Magic"     },
    { key: "highlight", label: "Highlight" },
    { key: "grayscale", label: "Grayscale" },
    { key: "bw",        label: "B&W"       },
  ];

  const RATIOS: { label: string; value: number | 'free' }[] = [
    { label: 'Free', value: 'free' },
    { label: '1:1', value: 1 },
    { label: '4:3', value: 4/3 },
    { label: '16:9', value: 16/9 },
    { label: 'A4', value: 210/297 },
  ];

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Desktop Header */}
      <div className="hidden md:flex items-center justify-between px-6 py-4 bg-surface border-b border-border flex-shrink-0 z-10 relative">
        <button onClick={() => setScannerMode(editReturnMode)} className="p-2 rounded-full hover:bg-surface-hover transition-colors text-gray-400 hover:text-white">
          <X size={20} />
        </button>
        
        {/* Top Tab Bar */}
        <div className="flex bg-background rounded-xl p-1 shadow-inner">
          <button 
            onClick={() => setActiveTab('crop')} 
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'crop' ? 'bg-surface text-white shadow' : 'text-gray-400 hover:text-white'}`}
          >
            <Crop size={16} /> Crop
          </button>
          <button 
            onClick={() => setActiveTab('filter')} 
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'filter' ? 'bg-surface text-white shadow' : 'text-gray-400 hover:text-white'}`}
          >
            <Wand2 size={16} /> Filters
          </button>
          <button 
            onClick={() => setActiveTab('adjust')} 
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'adjust' ? 'bg-surface text-white shadow' : 'text-gray-400 hover:text-white'}`}
          >
            <SlidersHorizontal size={16} /> Adjust
          </button>
        </div>

        <div className="flex gap-2">
          <button onClick={handleRotate} className="flex items-center gap-1 px-3 py-2 rounded-xl bg-surface-hover text-white text-sm hover:bg-border transition-colors">
            <RotateCcw size={16} /> Rotate
          </button>
          <button
            onClick={handleConfirm}
            disabled={processing || corners.length < 4}
            className="flex items-center gap-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-[#e0d0b0] transition-colors disabled:opacity-50"
          >
            {processing ? "Saving…" : <><Check size={16} /> Done</>}
          </button>
        </div>
      </div>

      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between px-4 py-4 bg-transparent flex-shrink-0 z-20 absolute top-0 w-full">
        <button onClick={() => setScannerMode(editReturnMode)} className="text-white">
          <X size={24} />
        </button>
        <div className="text-center">
          <div className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">EDITING</div>
          <div className="text-white font-semibold text-sm truncate max-w-[200px]">Page {pages.findIndex(p => p.id === page.id) + 1}</div>
        </div>
        <button onClick={() => setMobileEditOpen(true)} className="text-primary">
          <Sparkles size={24} />
        </button>
      </div>

      {/* Image + overlay — touch-none prevents page scroll while dragging crop handles */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden bg-black pb-[140px] md:pb-0"
        style={{ touchAction: 'none' }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* Mobile Grid Background */}
        <div className="md:hidden absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>

        {currentSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={currentSrc}
            src={currentSrc}
            alt="document to crop"
            onLoad={onImgLoad}
            className="absolute pointer-events-none select-none object-contain"
            style={{
              left: displaySize.offX,
              top: displaySize.offY,
              width: displaySize.w,
              height: displaySize.h,
              ...getPreviewStyle()
            }}
          />
        )}

        {/* SVG crop overlay (Only show when crop tab is active) */}
        {imgLoaded && screenCorners.length === 4 && activeTab === 'crop' && !mobileEditOpen && (
          <svg className="absolute inset-0 w-full h-full" style={{ overflow: "visible" }}>
            <defs>
              <mask id="crop-mask">
                <rect width="100%" height="100%" fill="white" />
                <polygon points={screenCorners.map(p => `${p.x},${p.y}`).join(" ")} fill="black" />
              </mask>
              <clipPath id="poly-clip">
                <polygon points={screenCorners.map(p => `${p.x},${p.y}`).join(" ")} />
              </clipPath>
            </defs>

            <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#crop-mask)" />
            
            {/* Center polygon for dragging the entire crop box */}
            <polygon 
              points={screenCorners.map(p => `${p.x},${p.y}`).join(" ")} 
              fill="transparent" 
              style={{ cursor: lockedRatio ? "move" : "default", pointerEvents: "all" }}
              onPointerDown={(e) => {
                if (!lockedRatio) return; // Only allow dragging center if ratio is locked (as requested)
                e.preventDefault(); e.stopPropagation();
                setActiveCorner(4);
                if (!containerRef.current) return;
                const rect = containerRef.current.getBoundingClientRect();
                const pt = toImage(e.clientX - rect.left, e.clientY - rect.top);
                dragRef.current = { x: pt.x, y: pt.y, originalCorners: [...corners] };
                (e.target as Element).setPointerCapture(e.pointerId);
              }}
            />

            {[1/3, 2/3].map(t => {
              const top   = { x: screenCorners[0].x + (screenCorners[1].x - screenCorners[0].x) * t, y: screenCorners[0].y + (screenCorners[1].y - screenCorners[0].y) * t };
              const bot   = { x: screenCorners[3].x + (screenCorners[2].x - screenCorners[3].x) * t, y: screenCorners[3].y + (screenCorners[2].y - screenCorners[3].y) * t };
              const left  = { x: screenCorners[0].x + (screenCorners[3].x - screenCorners[0].x) * t, y: screenCorners[0].y + (screenCorners[3].y - screenCorners[0].y) * t };
              const right = { x: screenCorners[1].x + (screenCorners[2].x - screenCorners[1].x) * t, y: screenCorners[1].y + (screenCorners[2].y - screenCorners[1].y) * t };
              return (
                <g key={t} clipPath="url(#poly-clip)" stroke="rgba(255,255,255,0.2)" strokeWidth="1" fill="none">
                  <line x1={top.x} y1={top.y} x2={bot.x} y2={bot.y} />
                  <line x1={left.x} y1={left.y} x2={right.x} y2={right.y} />
                </g>
              );
            })}

            <polygon points={screenCorners.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#f2e3c6" strokeWidth="2" />

            {screenCorners.map((sc, i) => (
              <g key={i} style={{ cursor: "grab" }}>
                <circle cx={sc.x} cy={sc.y} r={20} fill="transparent" onPointerDown={(e) => onPointerDown(i, e as any)} style={{ pointerEvents: "all" }} />
                <circle cx={sc.x} cy={sc.y} r={10} fill="rgba(242,227,198,0.2)" stroke="#f2e3c6" strokeWidth="2.5" style={{ pointerEvents: "none" }} />
                {/* Mobile corner accents */}
                <circle cx={sc.x} cy={sc.y} r={4} fill="#f2e3c6" className="md:hidden" style={{ pointerEvents: "none" }} />
              </g>
            ))}
            
            {/* Mobile edge grabbers */}
            <g className="md:hidden">
               <rect x={(screenCorners[0].x + screenCorners[3].x)/2 - 4} y={(screenCorners[0].y + screenCorners[3].y)/2 - 12} width="8" height="24" rx="4" fill="transparent" stroke="#f2e3c6" strokeWidth="1.5" />
               <rect x={(screenCorners[1].x + screenCorners[2].x)/2 - 4} y={(screenCorners[1].y + screenCorners[2].y)/2 - 12} width="8" height="24" rx="4" fill="transparent" stroke="#f2e3c6" strokeWidth="1.5" />
            </g>
          </svg>
        )}


        {!imgLoaded && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 animate-pulse">
            Loading…
          </div>
        )}
      </div>

      {/* Spacer to push image up when mobile sheet is open */}
      <div className={`md:hidden bg-black ${mobileEditOpen ? (mobileEditTab === 'filters' ? 'h-[160px]' : 'h-[320px]') : 'h-0'}`} />

      {/* Desktop Contextual Bottom Bar */}
      <div className="hidden md:flex flex-shrink-0 bg-surface border-t border-border px-6 py-6 h-32 items-center justify-center relative transition-all">
        
        {/* Crop Tab Content */}
        {activeTab === 'crop' && (
          <div className="flex flex-col items-center w-full max-w-2xl gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex gap-4">
              {RATIOS.map(r => (
                <button
                  key={r.label}
                  onClick={() => applyAspectRatio(r.value)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
                    lockedRatio === r.value || (lockedRatio === null && r.value === 'free')
                      ? 'bg-primary/20 text-primary border-primary/50 shadow-sm'
                      : 'bg-background text-gray-400 hover:text-white hover:bg-surface-hover border-border'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button onClick={handleAutoDetect} className="text-xs text-gray-400 hover:text-white flex items-center gap-1 transition-colors">
              <Scan size={14} /> Auto-detect Boundaries
            </button>
          </div>
        )}

        {/* Filter Tab Content */}
        {activeTab === 'filter' && (
          <div className="flex flex-col items-center w-full max-w-2xl gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
             <div className="flex items-center gap-3 overflow-x-auto w-full justify-center hide-scrollbar">
              {FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-6 py-3 rounded-2xl text-sm font-medium transition-all flex-shrink-0 ${
                    filter === f.key
                      ? "bg-primary text-primary-foreground shadow-[0_4px_14px_0_rgba(242,227,198,0.39)] scale-105"
                      : "bg-background border border-border text-gray-400 hover:text-white hover:border-gray-500"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400">Click 'Done' to apply filter changes to the final image.</p>
          </div>
        )}

        {/* Adjust Tab Content */}
        {activeTab === 'adjust' && (
          <div className="flex w-full max-w-2xl gap-8 animate-in fade-in slide-in-from-bottom-4 duration-300 px-4">
            <div className="flex-1 space-y-1">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Brightness</span>
                <span>{adjustments.brightness}</span>
              </div>
              <input 
                type="range" min="-100" max="100" 
                value={adjustments.brightness}
                onChange={(e) => setAdjustments(prev => ({...prev, brightness: parseInt(e.target.value)}))}
                className="w-full accent-primary" 
              />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Contrast</span>
                <span>{adjustments.contrast}</span>
              </div>
              <input 
                type="range" min="-100" max="100" 
                value={adjustments.contrast}
                onChange={(e) => setAdjustments(prev => ({...prev, contrast: parseInt(e.target.value)}))}
                className="w-full accent-primary" 
              />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Saturation</span>
                <span>{adjustments.saturation}</span>
              </div>
              <input 
                type="range" min="-100" max="100" 
                value={adjustments.saturation}
                onChange={(e) => setAdjustments(prev => ({...prev, saturation: parseInt(e.target.value)}))}
                className="w-full accent-primary" 
              />
            </div>
          </div>
        )}
      </div>

      {/* Mobile Floating Bottom Action Panel */}
      <div className="md:hidden absolute bottom-8 w-full flex flex-col items-center gap-3 px-4 z-20">
        {/* Aspect Ratio Buttons */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar w-full justify-center">
          {RATIOS.map(r => (
            <button
              key={r.label}
              onClick={() => applyAspectRatio(r.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                lockedRatio === r.value || (lockedRatio === null && r.value === 'free')
                  ? 'bg-primary/20 text-primary border-primary/50'
                  : 'bg-black/50 text-gray-300 border-white/10 backdrop-blur-sm'
              }`}
            >
              {r.label}
            </button>
          ))}
          <button
            onClick={handleAutoDetect}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border bg-black/50 text-primary border-primary/30 backdrop-blur-sm flex items-center gap-1"
          >
            <Scan size={12} /> Auto
          </button>
        </div>

        {/* Rotate & Confirm */}
        <div className="bg-surface border border-border/50 rounded-2xl p-2 flex gap-2 shadow-2xl backdrop-blur-md w-[80%] max-w-[300px]">
          <button onClick={handleRotate} className="flex-1 flex flex-col items-center justify-center gap-1 py-3 text-white">
            <RotateCcw size={20} />
            <span className="text-xs font-medium">Rotate</span>
          </button>
          <button 
            onClick={handleConfirm}
            disabled={processing || corners.length < 4}
            className="flex-[1.5] bg-primary text-primary-foreground rounded-xl flex flex-col items-center justify-center py-3 disabled:opacity-50"
          >
            <Crop size={20} />
            <span className="text-xs font-semibold">{processing ? "Saving…" : "Confirm Crop"}</span>
          </button>
        </div>
      </div>

      {/* Mobile Edit Bottom Sheet */}
      {mobileEditOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileEditOpen(false)}
          />

          {/* Sheet */}
          <div className="relative bg-surface rounded-t-3xl shadow-2xl border-t border-border/50 z-10 pb-8">
            {/* Handle */}
            <div className="flex justify-center pt-3 mb-2">
              <div className="w-10 h-1.5 rounded-full bg-gray-600"></div>
            </div>

            {/* Tabs */}
            <div className="flex mx-4 mb-4 bg-background rounded-xl p-1">
              <button
                onClick={() => setMobileEditTab('filters')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  mobileEditTab === 'filters' ? 'bg-surface text-white shadow' : 'text-gray-400'
                }`}
              >
                <Wand2 size={14} /> Filters
              </button>
              <button
                onClick={() => setMobileEditTab('adjustments')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  mobileEditTab === 'adjustments' ? 'bg-surface text-white shadow' : 'text-gray-400'
                }`}
              >
                <SlidersHorizontal size={14} /> Adjust
              </button>
            </div>

            {/* Filters Tab */}
            {mobileEditTab === 'filters' && (
              <div className="px-4">
                <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-2">
                  {FILTERS.map(f => (
                    <button
                      key={f.key}
                      onClick={() => setFilter(f.key)}
                      className={`flex-shrink-0 w-20 h-16 rounded-2xl flex items-center justify-center text-xs font-semibold border-2 transition-all ${
                        filter === f.key
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-gray-400 hover:border-gray-500"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Adjustments Tab */}
            {mobileEditTab === 'adjustments' && (
              <div className="px-4">
                {/* Dynamic Slider */}
                {activeAdjustment && (
                  <div className="mb-6 animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex justify-between text-xs text-gray-400 mb-2">
                      <span className="font-semibold text-white capitalize">{activeAdjustment}</span>
                      <span className="text-primary font-bold">
                        {adjustments[activeAdjustment] > 0 ? `+${adjustments[activeAdjustment]}` : adjustments[activeAdjustment]}
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="range" min="-100" max="100"
                        value={adjustments[activeAdjustment]}
                        onChange={(e) => setAdjustments(prev => ({ ...prev, [activeAdjustment]: parseInt(e.target.value) }))}
                        className="w-full h-1.5 accent-primary rounded-full appearance-none outline-none"
                        style={{
                          background: adjustments[activeAdjustment] > 0
                            ? `linear-gradient(to right, #333 50%, #f2e3c6 50%, #f2e3c6 ${(adjustments[activeAdjustment] + 100) / 2}%, #333 ${(adjustments[activeAdjustment] + 100) / 2}%)`
                            : `linear-gradient(to right, #333 ${(adjustments[activeAdjustment] + 100) / 2}%, #f2e3c6 ${(adjustments[activeAdjustment] + 100) / 2}%, #f2e3c6 50%, #333 50%)`
                        }}
                      />
                      {/* Center tick mark */}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-3 bg-white/30 rounded-full pointer-events-none"></div>
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-600 mt-2">
                      <span>-100</span><span>0</span><span>+100</span>
                    </div>
                  </div>
                )}
                
                {/* Adjustment Selection Buttons */}
                <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-2">
                  {(['brightness', 'contrast', 'saturation'] as const).map(adj => (
                    <button
                      key={adj}
                      onClick={() => setActiveAdjustment(activeAdjustment === adj ? null : adj)}
                      className={`flex-shrink-0 w-24 h-16 rounded-2xl flex items-center justify-center border-2 transition-all ${
                        activeAdjustment === adj
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-gray-400 hover:border-gray-500"
                      }`}
                    >
                      <span className="text-[10px] uppercase tracking-wider font-bold">{adj}</span>
                    </button>
                  ))}
                </div>
                
                {/* Reset */}
                <button
                  onClick={() => setAdjustments({ brightness: 0, contrast: 0, saturation: 0 })}
                  className="w-full text-xs text-gray-400 mt-4 border border-border rounded-xl py-2 hover:text-white hover:border-gray-500 transition-colors"
                >
                  Reset All
                </button>
              </div>
            )}

            {/* Apply Button */}
            <div className="px-4 mt-5">
              <button
                onClick={() => setMobileEditOpen(false)}
                className="w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-xl shadow-[0_4px_14px_0_rgba(242,227,198,0.3)] hover:bg-[#e0d0b0] transition-colors"
              >
                Apply &amp; Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
