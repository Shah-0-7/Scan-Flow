import type { Metadata } from "next";
import { Geist, Geist_Mono, Permanent_Marker } from "next/font/google";
import "./globals.css";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const permanentMarker = Permanent_Marker({
  variable: "--font-permanent-marker",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Scan Flow",
  description: "Web Document Scanner with automatic edge detection and perspective cropping.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${permanentMarker.variable} antialiased min-h-screen bg-background text-foreground flex flex-col`}
      >
        {children}
        <Script 
          src="https://docs.opencv.org/4.8.0/opencv.js" 
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
