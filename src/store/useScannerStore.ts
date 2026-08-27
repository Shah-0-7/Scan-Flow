import { create } from 'zustand';
import { ScannedPage, Point, RecentDocument } from '@/types';

interface ScannerState {
  pages: ScannedPage[];
  currentPageId: string | null;
  scannerMode: 'home' | 'capture' | 'edit' | 'preview' | 'export';
  editReturnMode: 'preview' | 'export';
  openCvReady: boolean;
  recentDocuments: RecentDocument[];
  
  // Actions
  setOpenCvReady: (ready: boolean) => void;
  setScannerMode: (mode: 'home' | 'capture' | 'edit' | 'preview' | 'export') => void;
  setEditReturnMode: (mode: 'preview' | 'export') => void;
  addPage: (page: Omit<ScannedPage, 'id'>) => void;
  updatePage: (id: string, updates: Partial<ScannedPage>) => void;
  removePage: (id: string) => void;
  setCurrentPageId: (id: string | null) => void;
  reorderPages: (activeId: string, overId: string) => void;
  clearPages: () => void;
  addRecentDocument: (doc: RecentDocument) => void;
}

export const useScannerStore = create<ScannerState>((set) => ({
  pages: [],
  currentPageId: null,
  scannerMode: 'home',
  editReturnMode: 'preview',
  openCvReady: false,
  recentDocuments: [],

  setOpenCvReady: (ready) => set({ openCvReady: ready }),
  setScannerMode: (mode) => set({ scannerMode: mode }),
  setEditReturnMode: (mode) => set({ editReturnMode: mode }),
  
  addPage: (pageData) => set((state) => {
    const id = Date.now().toString();
    const newPage = { ...pageData, id };
    return {
      pages: [...state.pages, newPage],
      currentPageId: id,
    };
  }),

  updatePage: (id, updates) => set((state) => ({
    pages: state.pages.map((page) => 
      page.id === id ? { ...page, ...updates } : page
    )
  })),

  removePage: (id) => set((state) => {
    const newPages = state.pages.filter(p => p.id !== id);
    return {
      pages: newPages,
      currentPageId: state.currentPageId === id 
        ? (newPages.length > 0 ? newPages[0].id : null) 
        : state.currentPageId,
      scannerMode: newPages.length === 0 ? 'capture' : state.scannerMode
    };
  }),

  setCurrentPageId: (id) => set({ currentPageId: id }),

  reorderPages: (activeId, overId) => set((state) => {
    const oldIndex = state.pages.findIndex(p => p.id === activeId);
    const newIndex = state.pages.findIndex(p => p.id === overId);
    
    if (oldIndex === -1 || newIndex === -1) return state;
    
    const newPages = [...state.pages];
    const [movedItem] = newPages.splice(oldIndex, 1);
    newPages.splice(newIndex, 0, movedItem);
    
    return { pages: newPages };
  }),

  clearPages: () => set({ pages: [], currentPageId: null, scannerMode: 'preview' }),
  addRecentDocument: (doc) => set((state) => {
    // Keep only the 10 most recent
    const newRecent = [doc, ...state.recentDocuments].slice(0, 10);
    return { recentDocuments: newRecent };
  }),
}));
