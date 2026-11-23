export type ThemeMode = 'light' | 'dark';

export type TemplateId =
  | 'heart-name'
  | 'monogram'
  | 'box-letter'
  | 'svg-keychain'
  | 'name-sign'
  | 'keychain'
  | 'plaque';

export type FontStyleId = 'serif' | 'geometric' | 'condensed' | 'wide';

export type FilamentFinishId = 'pla-matte' | 'pla-silk' | 'pla-gloss' | 'petg-clear';

export type CameraPresetId = 'iso' | 'front' | 'top' | 'side';

export type HeartStructureMode = 'pure' | 'desk-stand' | 'solid-front';

export type SignBaseStyle = 'beveled' | 'minimal' | 'stepped';

export type KeychainShape = 'capsule' | 'heart' | 'rectangle';

export type KeychainRingPosition = 'left' | 'top';

export type BoxLetterLayout = 'assembled' | 'separated';

export type SvgPresetId = 'paw' | 'crown' | 'star' | 'bolt';

export type SvgAttachMode = 'arch' | 'hole' | 'loop';

export type KeyringDirection =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

export type ImageTraceMode = 'auto' | 'luminance' | 'alpha';

export type BuildPlatePresetId =
  | 'compact-180'
  | 'standard-220'
  | 'medium-256'
  | 'large-300'
  | 'custom';

export interface BuildPlateSize {
  presetId: BuildPlatePresetId;
  label: string;
  /** Printable bed X width in mm */
  widthMm: number;
  /** Printable bed Y depth in mm (Z axis in Three.js) */
  depthMm: number;
  /** Printable Z vertical height in mm (Y axis in Three.js) */
  heightMm: number;
}

export interface ImportedImagePixels {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

export interface FilamentColor {
  id: string;
  name: string;
  hex: string;
}

export interface ProjectConfig {
  template: TemplateId;
  text: string;
  subtitle: string;
  fontStyle: FontStyleId;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  textScale: number; // percentage 70 - 105
  bevelMm: number; // 0 - 1.6
  primaryColor: string;
  accentColor: string;
  useDualColor: boolean;
  finish: FilamentFinishId;
  /** Negative curved arch tunnel carved at the top of the first letter for a keyring */
  keyringArch: boolean;
  /** 8-way cardinal/intercardinal position for the keyring attachment */
  keyringDirection: KeyringDirection;
  // Heart-Name specific
  heartMode: HeartStructureMode;
  heartKeyring: boolean;
  // Monogram (Inicial + Nome cursivo) specific
  monogramInitial: string;
  monogramNamePos: number; // 20 - 62 (% height)
  // Box-Letter (Letra Caixa 2 peças) specific
  boxLetterLayout: BoxLetterLayout;
  boxLetterBorderMm: number; // 2 - 6
  boxLetterJoined: boolean;
  // SVG / Image Keychain specific
  svgSourceType: 'preset' | 'svg' | 'image';
  svgPresetId: SvgPresetId;
  svgRawContent: string;
  svgFileName: string;
  imagePixels: ImportedImagePixels | null;
  imageThreshold: number; // 15 - 240
  imageInvert: boolean;
  imageTraceMode: ImageTraceMode;
  imageSmoothness: number; // 0 - 3
  imageDespeckle: number; // 0 - 4
  svgBorderMm: number; // 1.5 - 6
  svgAttachMode: SvgAttachMode;
  // Name-Sign specific
  signBaseStyle: SignBaseStyle;
  // Keychain specific
  keychainShape: KeychainShape;
  keychainRingPos: KeychainRingPosition;
  keychainRaisedBorder: boolean;
  // Plaque specific
  plaqueMountHoles: boolean;
  plaqueRounded: boolean;
}

export interface PrintMetrics {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  triangleCount: number;
  volumeCm3: number;
  filamentGrams: number;
  estimatedMinutes: number;
}

export interface CostCalculatorSettings {
  /** Filament spool price in BRL per kilogram (R$/kg) */
  filamentPricePerKg: number;
  /** Machine + energy cost in BRL per printing hour (R$/h) */
  hourlyPrintCost: number;
  /** Part infill percentage (0 - 100%) */
  infillPercent: number;
}

export interface TemplateMeta {
  id: TemplateId;
  shortLabel: string;
  title: string;
  summary: string;
  defaultText: string;
  defaultSubtitle: string;
  minWidthMm: number;
  maxWidthMm: number;
  minHeightMm: number;
  maxHeightMm: number;
  minDepthMm: number;
  maxDepthMm: number;
  frontHint: string;
  topHint: string;
}
