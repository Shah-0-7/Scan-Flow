"use client";

import { useRef, useCallback, memo, useState } from "react";
import { PrivacyModal } from "@/components/PrivacyModal";

// ─── Inner Hero UI ───────────────────────────────────────────────
// memo'd so it never re-renders during the animation loop
const Hero = memo(function Hero({
  onTransition,
  onPrivacy,
}: {
  onTransition: (x: number, y: number) => void;
  onPrivacy: () => void;
}) {
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className="absolute inset-0 flex flex-col bg-[#111111] text-[#fcfcfc] overflow-hidden select-none cursor-pointer"
      onClick={(e) => onTransition(e.clientX, e.clientY)}
    >
      {/* Top Navigation */}
      <header className="flex justify-between items-center px-8 py-6 z-10 flex-shrink-0" onClick={stop}>
        <div className="text-sm font-black italic tracking-widest text-[#f2e3c6]">SCANFLOW</div>
        <nav className="flex gap-10 text-sm tracking-widest text-[#cccccc]">
          <button
            onClick={(e) => { e.stopPropagation(); onTransition(e.clientX, e.clientY); }}
            className="hover:text-white transition-colors font-normal"
          >
            SCAN
          </button>
          <button onClick={stop} className="text-white font-bold border-b-2 border-[#f2e3c6] pb-0.5">
            EDIT
          </button>
          <button onClick={stop} className="hover:text-white transition-colors font-normal">
            SAVE
          </button>
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center relative z-10 pointer-events-none">
        <span
          className="text-[#f2e3c6] leading-none -rotate-3 inline-block"
          style={{ fontFamily: "var(--font-permanent-marker), cursive", fontSize: "clamp(4rem, 12vw, 11rem)" }}
        >
          ScanFlow
        </span>
        <p className="text-[#888888] tracking-[0.55em] mt-6 uppercase" style={{ fontSize: "10px" }}>
          Effortless Scanning
        </p>
      </main>

      {/* Right scroll indicator */}
      <div className="absolute right-8 top-1/2 -translate-y-1/2 flex flex-col items-center gap-3 z-10 pointer-events-none">
        <div className="w-1.5 h-1.5 rounded-full border border-[#555555]" />
        <div className="w-px h-20 bg-gradient-to-b from-[#444444] to-transparent" />
        <div className="w-1 h-1 rounded-full bg-[#555555]" />
      </div>

      {/* Bottom */}
      <div className="z-10 flex-shrink-0" onClick={stop}>
        <div className="px-8 pb-5">
          <button
            onClick={(e) => { e.stopPropagation(); onTransition(e.clientX, e.clientY); }}
            className="bg-[#f2e3c6] text-[#111111] text-[11px] font-semibold tracking-widest px-7 py-2.5 rounded-full hover:bg-[#e8d5b0] active:scale-95 transition-all"
          >
            CLICK TO SCAN
          </button>
        </div>
        <div className="border-t border-[#222222] mx-8" />
        <footer className="flex justify-between items-center px-8 py-5 text-[11px] text-[#555555] tracking-wider">
          <p>© 2026 ScanFlow. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPrivacy(); }} className="hover:text-[#999] transition-colors">Privacy</a>
            <a href="#" onClick={stop} className="hover:text-[#999] transition-colors">Terms</a>
            <a href="#" onClick={stop} className="hover:text-[#999] transition-colors">Contact</a>
          </div>
        </footer>
      </div>
    </div>
  );
});

// ─── HeroOverlay ─────────────────────────────────────────────────
// Self-contained: all animation uses refs only → ZERO React re-renders at 60fps
export function HeroOverlay({ onComplete }: { onComplete: () => void }) {
  const overlayRef   = useRef<HTMLDivElement>(null);
  const svgPathRef   = useRef<SVGPathElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const animRef      = useRef<number | null>(null);
  const activeRef    = useRef(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const startTransition = useCallback((cx: number, cy: number) => {
    if (activeRef.current) return;
    activeRef.current = true;

    const W = window.innerWidth;
    const H = window.innerHeight;
    const maxR = Math.sqrt(Math.max(cx, W - cx) ** 2 + Math.max(cy, H - cy) ** 2) + 80;
    const DURATION = 950; // fast because it's now truly 60fps

    // ── Canvas setup ──
    const canvas = canvasRef.current;
    if (canvas) {
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width  = W + "px";
      canvas.style.height = H + "px";
      canvas.style.display = "block";
      const ctx = canvas.getContext("2d")!;
      ctx.scale(dpr, dpr);
    }

    const startTime = performance.now();

    const tick = (now: number) => {
      const t      = Math.min((now - startTime) / DURATION, 1);
      const eased  = 1 - Math.pow(1 - t, 3);
      const r      = eased * maxR;

      // ── Direct DOM: update SVG clip hole ──
      const overlay = overlayRef.current;
      const path    = svgPathRef.current;
      if (overlay && path && r > 1) {
        path.setAttribute(
          "d",
          `M0,0 H${W} V${H} H0 Z ` +
          `M${cx + r},${cy} A${r},${r} 0 1 0 ${cx - r},${cy} ` +
          `A${r},${r} 0 1 0 ${cx + r},${cy} Z`
        );
        if (!overlay.style.clipPath) {
          overlay.style.clipPath = "url(#hero-hole-dyn)";
        }
      }

      // ── Direct DOM: draw wave ring on canvas ──
      if (canvas && r > 2) {
        const dpr = window.devicePixelRatio || 1;
        const ctx = canvas.getContext("2d")!;
        ctx.clearRect(0, 0, W, H);
        const rW  = 32;
        const grd = ctx.createRadialGradient(cx, cy, Math.max(0, r - rW), cx, cy, r + rW * 0.5);
        grd.addColorStop(0,    "rgba(242,227,198,0)");
        grd.addColorStop(0.38, "rgba(242,227,198,0.12)");
        grd.addColorStop(0.72, "rgba(242,227,198,0.92)");
        grd.addColorStop(0.88, "rgba(242,227,198,0.3)");
        grd.addColorStop(1,    "rgba(242,227,198,0)");
        ctx.beginPath();
        ctx.arc(cx, cy, r + rW * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();
      }

      if (t < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        if (canvas) canvas.style.display = "none";
        onComplete(); // single callback — no setState here
      }
    };

    animRef.current = requestAnimationFrame(tick);
  }, [onComplete]);

  return (
    <>
      {/* Hidden SVG: wave distort filter + clip-path definition */}
      <svg aria-hidden style={{ position: "fixed", width: 0, height: 0, overflow: "hidden" }}>
        <defs>
          <filter id="wave-distort-hero" x="-25%" y="-25%" width="150%" height="150%">
            <feTurbulence type="turbulence" baseFrequency="0.042 0.02" numOctaves="5" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="20" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <clipPath id="hero-hole-dyn" clipPathUnits="userSpaceOnUse">
            {/* d is written imperatively — React never touches it during animation */}
            <path ref={svgPathRef} fillRule="evenodd" d="" />
          </clipPath>
        </defs>
      </svg>

      {/* Hero overlay — clipPath written imperatively, no React re-render */}
      <div ref={overlayRef} className="absolute inset-0" style={{ zIndex: 50 }}>
        <Hero onTransition={startTransition} onPrivacy={() => setShowPrivacy(true)} />
      </div>

      {/* Wave ring canvas — drawn imperatively each frame */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 60, filter: "url(#wave-distort-hero)", display: "none" }}
      />

      <PrivacyModal isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </>
  );
}
