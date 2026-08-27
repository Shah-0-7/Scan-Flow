"use client";

import { useEffect } from "react";

interface PrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PrivacyModal({ isOpen, onClose }: PrivacyModalProps) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[300] p-6"
      onClick={onClose}
      style={{ animation: "privacy-fade-in 0.22s ease forwards" }}
    >
      {/* Blurred backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />

      {/* Modal card */}
      <div
        className="relative max-w-sm sm:max-w-xl w-full mx-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "privacy-scale-in 0.28s cubic-bezier(0.34,1.56,0.64,1) forwards" }}
      >


        {/* ── Glass panel ── */}
        <div
          className="relative overflow-hidden"
          style={{
            borderRadius: 40,
            background:
              "linear-gradient(160deg, rgba(20,20,20,0.6) 0%, rgba(0,0,0,0.8) 100%)",
            backdropFilter: "blur(28px)",
            WebkitBackdropFilter: "blur(28px)",
            border: "1px solid rgba(255,255,255,0.07)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.10), 0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03)",
            zIndex: 2,
          }}
        >
          {/* Top-edge gloss line */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none"
            style={{
              width: "60%",
              height: 1,
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)",
            }}
          />



          {/* Content */}
          <div className="px-6 py-6 sm:px-10 sm:py-10">
            <p className="text-sm sm:text-base leading-[1.85] font-bold tracking-wide text-white">
              Your privacy isn&apos;t a feature—it&apos;s the architecture. Every scan, dynamic crop,
              and PDF generation happens entirely within your local web browser. Your sensitive
              files never touch a cloud server, remote database, or third-party API.
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes privacy-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes privacy-scale-in {
          from { opacity: 0; transform: scale(0.88); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
