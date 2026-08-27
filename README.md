```markdown
# 📄 ScanFlow Pro

> **100% Local, Privacy-First Document Scanner & PDF Builder**

ScanFlow Pro is a modern web application designed for fast, high-precision document digitization. It runs entirely inside your browser using client-side image processing—ensuring your sensitive documents never touch a server or remote database.

---

## ✨ Key Features

* **🤖 Live Document Auto-Detection**: Real-time edge detection overlay with target alignment visual cues and automatic frame targeting.
* **📐 Perspective Adjustment Workshop**: Fine-tune cropped document boundaries using interactive draggable corner anchors, quick rotation controls, and clean surface flattening.
* **📚 Bulk Scanning & Batch Queue**: Capture multiple pages sequentially, drag-and-drop to reorder in the queue, and assemble complex documents effortlessly.
* **⚡ Multi-Format Export Options**: Export scans as custom merged multi-page PDFs (with standard page size matching like A4) or download compressed ZIP archives.
* **🔒 100% In-Browser Execution**: All image processing, deskewing, and file assembly run locally via JavaScript and WebAssembly. Zero uploads, zero tracking, fully functional offline.

---

## 🛠️ Tech Stack

* **Frontend Framework:** React with TypeScript
* **Build Tool:** Vite
* **Styling:** Tailwind CSS (Dark Mode & Modern Accent Design System)
* **Image Processing & Math:** Canvas API, OpenCV.js / WebAssembly
* **Export Pipeline:** `jsPDF` (PDF generation), `JSZip` (Image archives)
* **Deployment:** Cloudflare Pages

---

## 🚀 Getting Started

### Prerequisites

* [Node.js](https://nodejs.org/) (v18.0 or higher)
* `npm` or `yarn`

### Installation & Local Development

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/Shah-0-7/Scan-Flow.git](https://github.com/Shah-0-7/Scan-Flow.git)
   cd Scan-Flow

```

2. **Install dependencies:**
```bash
npm install

```


3. **Start the development server:**
```bash
npm run dev

```


4. Open your browser and visit `http://localhost:5173`.

---

## ☁️ Cloudflare Pages Deployment

This project is configured for continuous static deployment on Cloudflare Pages.

* **Build Command:** `npm run build`
* **Output Directory:** `dist`

> **Note on Client-Side Routing:** To ensure sub-routes load cleanly without 404s on browser refresh, a `_redirects` file is located in the `public/` directory:
> ```text
> /*   /index.html   200
> 
> ```
> 
> 

---

## 🔐 Privacy & Security Architecture

* **Zero Cloud Uploads:** No API keys, external endpoints, or remote file storage.
* **Zero Data Retention:** Captured pages reside strictly within browser RAM and clear upon tab closure.
* **Offline Compatible:** Once loaded, you can disconnect from the internet and continue scanning without interruption.

---

## 📄 License

Distributed under the MIT License. Copyright (c) 2026 [Shah-0-7]. See `LICENSE` for more information.
```

```
