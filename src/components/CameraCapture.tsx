"use client";
import { useState, useRef, useEffect } from "react";
import { X, Upload } from "lucide-react";
import { useScannerStore } from "@/store/useScannerStore";

export function CameraCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>("");
  const { addPage, setScannerMode } = useScannerStore();

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      setError("Unable to access camera.");
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        const imageUrl = canvas.toDataURL("image/jpeg", 0.9);
        addPage({
          originalImage: imageUrl,
          croppedImage: null,
          cropPoints: null,
          filter: 'original'
        });
        setScannerMode('preview');
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(file => {
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
      setScannerMode('preview');
    }
  };

  return (
    <div className="absolute inset-0 bg-black flex flex-col z-50">
      <div className="absolute top-0 w-full p-6 flex justify-between items-center z-10 bg-gradient-to-b from-black/80 to-transparent">
        <button onClick={() => setScannerMode('preview')} className="text-white p-3 rounded-full bg-surface-hover/50 backdrop-blur-md hover:bg-surface-hover transition-colors">
          <X size={24} />
        </button>
        <button onClick={() => fileInputRef.current?.click()} className="text-white px-4 py-2 flex items-center gap-2 rounded-full bg-surface-hover/50 backdrop-blur-md hover:bg-surface-hover transition-colors font-medium">
          <Upload size={20} /> Upload Images
        </button>
        <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
      </div>
      
      {error ? (
        <div className="flex-1 flex items-center justify-center text-red-400 font-medium">{error}</div>
      ) : (
        <video ref={videoRef} autoPlay playsInline className="flex-1 object-cover h-full w-full" />
      )}
      
      <div className="absolute bottom-0 w-full p-10 flex justify-center items-center z-10 bg-gradient-to-t from-black via-black/80 to-transparent">
        <button onClick={capturePhoto} className="w-24 h-24 rounded-full border-4 border-primary flex items-center justify-center p-1 active:scale-90 transition-transform">
          <div className="w-full h-full bg-primary rounded-full"></div>
        </button>
      </div>
    </div>
  );
}
