"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useScannerStore } from "@/store/useScannerStore";
import { X, RotateCcw, Check, Wand2, Scan, SlidersHorizontal, Crop, Square, Type } from "lucide-react";
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

// ─── Perspective warp using scanline approach (no CORS issues) ─────────────────
function warpPerspective(
  src: string,
  corners: Point[], // [TL, TR, BR, BL] in natural image coordinates
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
        const w  = Math.min(img.naturalWidth  - x0, Math.max(...xs) - x0);
        const h  = Math.min(img.naturalHeight - y0, Math.max(...ys) - y0);
        const dst = document.createElement("canvas");
        dst.width = w; dst.height = h;
        dst.getContext("2d")!.drawImage(img, x0, y0, w, h, 0, 0, w, h);
        resolve(dst.toDataURL("image/jpeg", 0.92));
        return;
      }

      const [tl, tr, br, bl] = corners;
      const dstCanvas = document.createElement("canvas");
      dstCanvas.width  = outW;
      dstCanvas.height = outH;
      const dstCtx = dstCanvas.getContext("2d")!;
      const dstData = dstCtx.createImageData(outW, outH);

      const SW = img.naturalWidth;

      for (let dy = 0; dy < outH; dy++) {
        const ty = dy / outH;
        for (let dx = 0; dx < outW; dx++) {
          const tx = dx / outW;
          const sx = (1 - ty) * ((1 - tx) * tl.x + tx * tr.x)
                   +      ty  * ((1 - tx) * bl.x + tx * br.x);
          const sy = (1 - ty) * ((1 - tx) * tl.y + tx * tr.y)
                   +      ty  * ((1 - tx) * bl.y + tx * br.y);

          const ix = Math.round(sx);
          const iy = Math.round(sy);
          const dIdx = (dy * outW + dx) * 4;

          if (ix >= 0 && ix < img.naturalWidth && iy >= 0 && iy < img.naturalHeight) {
            const sIdx = (iy * SW + ix) * 4;
            dstData.data[dIdx]     = srcData.data[sIdx];
            dstData.data[dIdx + 1] = srcData.data[sIdx + 1];
            dstData.data[dIdx + 2] = srcData.data[sIdx + 2];
            dstData.data[dIdx + 3] = 255;
          }
        }
      }

      dstCtx.putImageData(dstData, 0, 0);
      resolve(dstCanvas.toDataURL("image/jpeg", 0.92));
    };
    img.src = src;
  });
}

// ─── Apply filter and adjustments to a data URL ───────────────────────────────
function applyFilter(src: string, filter: FilterType, adj: Adjustments): Promise<string> {
  return new Promise((resolve) => {
    if (filter === "original" && adj.brightness === 0 && adj.contrast === 0 && adj.saturation === 0) { 
      resolve(src); 
      return; 
    }
    
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      const C = adj.contrast;
      const contrastFactor = (259 * (C + 255)) / (255 * (259 - C));
      const S = adj.saturation / 100;

      for (let i = 0; i < data.length; i += 4) {
        let r = data[i], g = data[i + 1], b = data[i + 2];

        // 1. Filter
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        if (filter === "grayscale") {
          r = g = b = gray;
        } else if (filter === "bw") {
          const v = gray > 128 ? 255 : 0;
          r = g = b = v;
        } else if (filter === "magic") {
          const c = 1.5, bright = 10;
          r = Math.min(255, Math.max(0, c * (r - 128) + 128 + bright));
          g = Math.min(255, Math.max(0, c * (g - 128) + 128 + bright));
          b = Math.min(255, Math.max(0, c * (b - 128) + 128));
        } else if (filter === "highlight") {
          const c = 2.0;
          r = Math.min(255, Math.max(0, c * (r - 128) + 128));
          g = Math.min(255, Math.max(0, c * (g - 128) + 128));
          b = Math.min(255, Math.max(0, c * (b - 128) + 128));
        }

        // 2. Adjustments
        r += adj.brightness;
        g += adj.brightness;
        b += adj.brightness;

        r = contrastFactor * (r - 128) + 128;
        g = contrastFactor * (g - 128) + 128;
        b = contrastFactor * (b - 128) + 128;

        if (S !== 0) {
          const curGray = 0.299 * r + 0.587 * g + 0.114 * b;
          r = curGray + (r - curGray) * (1 + S);
          g = curGray + (g - curGray) * (1 + S);
          b = curGray + (b - curGray) * (1 + S);
        }

        data[i] = Math.min(255, Math.max(0, r));
        data[i + 1] = Math.min(255, Math.max(0, g));
        data[i + 2] = Math.min(255, Math.max(0, b));
      }
      ctx.putImageData(imageData, 0, 0);
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
  const [lockedRatio, setLockedRatio]   = useState<number | null>(null);
  
  const [activeTab, setActiveTab]     = useState<Tab>('crop');
  const [filter, setFilter]           = useState<FilterType>(page?.filter ?? "original");
  const [adjustments, setAdjustments] = useState<Adjustments>(page?.adjustments ?? { brightness: 0, contrast: 0, saturation: 0 });
  
  const [processing, setProcessing]   = useState(false);
  const [currentSrc, setCurrentSrc]   = useState<string>("");

  const [baseWarped, setBaseWarped]   = useState<string | null>(null);

  useEffect(() => {
    if (page) setCurrentSrc(page.originalImage);
  }, []);

  useEffect(() => {
    if ((activeTab === 'filter' || activeTab === 'adjust') && corners.length === 4) {
      const generateBaseWarped = async () => {
        try {
          const outW = Math.round(Math.hypot(
            corners[1].x - corners[0].x, corners[1].y - corners[0].y
          ));
          const outH = Math.round(Math.hypot(
            corners[3].x - corners[0].x, corners[3].y - corners[0].y
          ));
          // Downscale for faster preview generation
          const scale = Math.min(1, 800 / Math.max(outW, outH));
          const warped = await warpPerspective(currentSrc, corners, Math.max(outW * scale, 100), Math.max(outH * scale, 100));
          setBaseWarped(warped);
        } catch (e) {
          console.error("Preview warp failed", e);
        }
      };
      generateBaseWarped();
    } else {
      setBaseWarped(null);
    }
  }, [activeTab, corners, currentSrc]);

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

  const computeDisplay = useCallback((imgEl: HTMLImageElement) => {
    if (!containerRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const iw = imgEl.naturalWidth;
    const ih = imgEl.naturalHeight;
    if (!iw || !ih) return;
    const scale = Math.min(cw / iw, ch / ih);
    const dw = iw * scale, dh = ih * scale;
    const offX = (cw - dw) / 2, offY = (ch - dh) / 2;
    setDisplaySize({ w: dw, h: dh, offX, offY });
    setNaturalSize({ w: iw, h: ih });
  }, []);

  const setDefaultCorners = useCallback((iw: number, ih: number) => {
    const p = 0.05;
    setCorners([
      { x: iw * p,       y: ih * p },
      { x: iw * (1 - p), y: ih * p },
      { x: iw * (1 - p), y: ih * (1 - p) },
      { x: iw * p,       y: ih * (1 - p) },
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
      const outW = Math.round(Math.hypot(
        corners[1].x - corners[0].x, corners[1].y - corners[0].y
      ));
      const outH = Math.round(Math.hypot(
        corners[3].x - corners[0].x, corners[3].y - corners[0].y
      ));
      const warped   = await warpPerspective(currentSrc, corners, Math.max(outW, 100), Math.max(outH, 100));
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
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-surface border-b border-border flex-shrink-0 z-10 relative">
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

      {/* Image + overlay */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {currentSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={currentSrc}
            src={currentSrc}
            alt="document to crop"
            onLoad={onImgLoad}
            className={`absolute pointer-events-none select-none object-contain ${activeTab !== 'crop' ? 'opacity-50 blur-sm transition-all duration-300' : 'opacity-100 transition-all duration-300'}`}
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
        {imgLoaded && screenCorners.length === 4 && activeTab === 'crop' && (
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
              </g>
            ))}
          </svg>
        )}

        {/* Preview of cropped image when in filter or adjust tabs */}
        {(activeTab === 'filter' || activeTab === 'adjust') && (
           <div className="absolute inset-0 flex items-center justify-center p-8 pointer-events-none z-10 bg-black/40">
              {baseWarped ? (
                <img 
                  src={baseWarped} 
                  alt="Preview" 
                  className="max-w-full max-h-full object-contain shadow-2xl rounded-sm border border-white/10" 
                  style={getPreviewStyle()}
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-gray-400">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
                  Generating preview...
                </div>
              )}
           </div>
        )}

        {!imgLoaded && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 animate-pulse">
            Loading…
          </div>
        )}
      </div>

      {/* Contextual Bottom Bar */}
      <div className="flex-shrink-0 bg-surface border-t border-border px-6 py-6 h-32 flex items-center justify-center relative transition-all">
        
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
    </div>
  );
}
