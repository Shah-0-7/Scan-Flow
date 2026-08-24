export interface Point {
  x: number;
  y: number;
}

export type FilterType = 'original' | 'magic' | 'grayscale' | 'bw' | 'highlight';

export interface Adjustments {
  brightness: number;
  contrast: number;
  saturation: number;
}

export interface ScannedPage {
  id: string;
  originalImage: string;
  croppedImage: string | null;
  cropPoints: Point[] | null;
  filter: FilterType;
  adjustments: Adjustments | null;
}
