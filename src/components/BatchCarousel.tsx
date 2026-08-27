"use client";
import { useScannerStore } from "@/store/useScannerStore";
import { Plus, Trash2, Edit2, Camera } from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useRef } from "react";
import { SortableContext, sortableKeyboardCoordinates, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortablePageItem({ page, index, isCurrent, onSetCurrent, onRemove, onEdit }: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={`group relative flex-shrink-0 w-24 h-32 rounded-lg overflow-hidden border-2 cursor-grab active:cursor-grabbing transition-all ${
        isCurrent ? 'border-primary shadow-[0_0_15px_rgba(242,227,198,0.3)]' : 'border-transparent hover:border-border'
      }`}
      onClick={() => onSetCurrent(page.id)}
      {...attributes}
      {...listeners}
    >
      <img src={page.croppedImage || page.originalImage} alt={`Page ${index + 1}`} className="w-full h-full object-cover pointer-events-none select-none" />
      <div className="absolute top-1 right-1 bg-black/60 rounded-full text-xs px-2 py-0.5 text-white">{index + 1}</div>
      
      {isCurrent && (
        <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onPointerDown={(e) => { e.stopPropagation(); onEdit(); }} 
            className="p-1.5 bg-surface rounded-full text-white hover:text-primary transition-colors cursor-pointer"
          >
            <Edit2 size={14} />
          </button>
          <button 
            onPointerDown={(e) => { e.stopPropagation(); onRemove(page.id); }} 
            className="p-1.5 bg-surface rounded-full text-white hover:text-red-400 transition-colors cursor-pointer"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export function BatchCarousel() {
  const { pages, currentPageId, setCurrentPageId, removePage, setScannerMode, reorderPages, addPage } = useScannerStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(file => {
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            addPage({
              originalImage: event.target.result as string,
              croppedImage: null,
              cropPoints: null,
              filter: 'original',
              adjustments: { brightness: 0, contrast: 0, saturation: 0 }
            });
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      reorderPages(active.id, over.id);
    }
  };

  if (pages.length === 0) return null;

  return (
    <div className="w-full bg-surface border-t border-border p-4 flex gap-4 overflow-x-auto hide-scrollbar select-none z-20">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={pages.map(p => p.id)} strategy={horizontalListSortingStrategy}>
          {pages.map((page, index) => (
            <SortablePageItem 
              key={page.id} 
              page={page} 
              index={index} 
              isCurrent={currentPageId === page.id}
              onSetCurrent={setCurrentPageId}
              onRemove={removePage}
              onEdit={() => setScannerMode('edit')}
            />
          ))}
        </SortableContext>
      </DndContext>
      
      <button onClick={() => fileInputRef.current?.click()} className="flex-shrink-0 w-24 h-32 rounded-lg border-2 border-dashed border-gray-400 flex flex-col items-center justify-center text-gray-300 hover:bg-white hover:border-white hover:text-gray-900 transition-all cursor-pointer">
        <Plus size={24} className="mb-2" />
        <span className="text-xs font-medium">Add Page</span>
      </button>
      
      <button onClick={() => setScannerMode('capture')} className="flex-shrink-0 w-24 h-32 rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 flex flex-col items-center justify-center text-primary hover:text-primary-foreground hover:bg-primary transition-colors cursor-pointer">
        <Camera size={24} className="mb-2" />
        <span className="text-xs font-medium">Scan Page</span>
      </button>
      <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
    </div>
  );
}
