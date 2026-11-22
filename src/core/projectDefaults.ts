import type {
  BuildPlateSize,
  FilamentColor,
  FilamentFinishId,
  FontStyleId,
  ProjectConfig,
  TemplateId,
  TemplateMeta,
} from '../types/project';

export const BUILD_PLATE_PRESETS: BuildPlateSize[] = [
  {
    presetId: 'compact-180',
    label: '180 × 180 mm (Compacta / A1 Mini)',
    widthMm: 180,
    depthMm: 180,
    heightMm: 180,
  },
  {
    presetId: 'standard-220',
    label: '220 × 220 mm (Padrão / Ender 3)',
    widthMm: 220,
    depthMm: 220,
    heightMm: 250,
  },
  {
    presetId: 'medium-256',
    label: '256 × 256 mm (Bambu A1 / P1S)',
    widthMm: 256,
    depthMm: 256,
    heightMm: 256,
  },
  {
    presetId: 'large-300',
    label: '300 × 300 mm (Mesa Grande)',
    widthMm: 300,
    depthMm: 300,
    heightMm: 300,
  },
];

export const DEFAULT_BUILD_PLATE: BuildPlateSize = BUILD_PLATE_PRESETS[2]; // 256 × 256 × 256 mm

export const TEMPLATES: Record<TemplateId, TemplateMeta> = {
  'heart-name': {
    id: 'heart-name',
    shortLabel: 'Coração Nome',
    title: 'Coração com Nome Dupla Vista',
    summary: 'Por cima se lê o nome em 3D e pela frente se vê o coração.',
    defaultText: 'VITORIA',
    defaultSubtitle: '',
    minWidthMm: 40,
    maxWidthMm: 180,
    minHeightMm: 35,
    maxHeightMm: 155,
    minDepthMm: 12,
    maxDepthMm: 60,
    frontHint: 'Frente (Coração)',
    topHint: 'Cima (Nome)',
  },
  monogram: {
    id: 'monogram',
    shortLabel: 'Inicial + Nome',
    title: 'Inicial 3D com Nome Cursivo',
    summary: 'Letra inicial em destaque com nome cursivo ligado em relevo frontal.',
    defaultText: 'Gabriel',
    defaultSubtitle: '',
    minWidthMm: 75,
    maxWidthMm: 185,
    minHeightMm: 70,
    maxHeightMm: 175,
    minDepthMm: 14,
    maxDepthMm: 38,
    frontHint: 'Frente',
    topHint: 'Cima',
  },
  'box-letter': {
    id: 'box-letter',
    shortLabel: 'Letra Caixa',
    title: 'Letra Caixa 2 Cores (Encaixe)',
    summary: 'Letras ocas com borda arredondada e tampas frontais de encaixe para 2 cores.',
    defaultText: 'ELISA',
    defaultSubtitle: '',
    minWidthMm: 85,
    maxWidthMm: 220,
    minHeightMm: 34,
    maxHeightMm: 92,
    minDepthMm: 14,
    maxDepthMm: 36,
    frontHint: 'Frente',
    topHint: 'Cima',
  },
  'svg-keychain': {
    id: 'svg-keychain',
    shortLabel: 'Chaveiro SVG',
    title: 'Chaveiro de Imagem ou Vetor SVG',
    summary: 'Importe imagem PNG/JPG ou vetor SVG para gerar chaveiro 3D com furo ou arco.',
    defaultText: 'PATINHA',
    defaultSubtitle: '',
    minWidthMm: 32,
    maxWidthMm: 95,
    minHeightMm: 32,
    maxHeightMm: 95,
    minDepthMm: 3.5,
    maxDepthMm: 10,
    frontHint: 'Frente',
    topHint: 'Cima',
  },
  'name-sign': {
    id: 'name-sign',
    shortLabel: 'Letreiro',
    title: 'Letreiro de Mesa Personalizado',
    summary: 'Letras 3D encorpadas sobre base chanfrada pronta para mesa.',
    defaultText: 'LUCAS',
    defaultSubtitle: 'ESTÚDIO 3D',
    minWidthMm: 80,
    maxWidthMm: 210,
    minHeightMm: 26,
    maxHeightMm: 70,
    minDepthMm: 14,
    maxDepthMm: 36,
    frontHint: 'Frente',
    topHint: 'Cima',
  },
  keychain: {
    id: 'keychain',
    shortLabel: 'Chaveiro',
    title: 'Chaveiro com Nome em Relevo',
    summary: 'Base compacta com argola reforçada e nome pronto para troca de cor.',
    defaultText: 'SOFIA',
    defaultSubtitle: '',
    minWidthMm: 46,
    maxWidthMm: 95,
    minHeightMm: 18,
    maxHeightMm: 48,
    minDepthMm: 4,
    maxDepthMm: 10,
    frontHint: 'Frente',
    topHint: 'Cima',
  },
  plaque: {
    id: 'plaque',
    shortLabel: 'Placa',
    title: 'Placa Decorativa de Porta',
    summary: 'Moldura chanfrada com nome principal, subtítulo e furos opcionais.',
    defaultText: 'ATELIÊ',
    defaultSubtitle: 'IMPRESSÃO 3D',
    minWidthMm: 90,
    maxWidthMm: 210,
    minHeightMm: 42,
    maxHeightMm: 110,
    minDepthMm: 4,
    maxDepthMm: 12,
    frontHint: 'Frente',
    topHint: 'Cima',
  },
};

export const TEMPLATE_ORDER: TemplateId[] = [
  'heart-name',
  'monogram',
  'box-letter',
  'svg-keychain',
  'name-sign',
  'keychain',
  'plaque',
];

export const FILAMENT_COLORS: FilamentColor[] = [
  { id: 'ruby', name: 'Vermelho Rubi', hex: '#D93848' },
  { id: 'terracotta', name: 'Terracota Maker', hex: '#C6533B' },
  { id: 'lavender', name: 'Azul Lavanda', hex: '#6374E5' },
  { id: 'slate', name: 'Azul Ardósia', hex: '#3B4C63' },
  { id: 'rose', name: 'Rosa Quartzo', hex: '#E36B8B' },
  { id: 'onyx', name: 'Preto Ônix', hex: '#232730' },
  { id: 'ice', name: 'Branco Gelo', hex: '#F3F5F8' },
  { id: 'cobalt', name: 'Azul Cobalto', hex: '#2563EB' },
  { id: 'emerald', name: 'Verde Esmeralda', hex: '#159A6E' },
  { id: 'silk-gold', name: 'Dourado Seda', hex: '#D4A137' },
];

export const FILAMENT_FINISHES: {
  id: FilamentFinishId;
  label: string;
}[] = [
  { id: 'pla-matte', label: 'PLA Fosco' },
  { id: 'pla-silk', label: 'PLA Seda' },
  { id: 'pla-gloss', label: 'PLA Brilhante' },
  { id: 'petg-clear', label: 'PETG Acetinado' },
];

export const FONT_STYLES: {
  id: FontStyleId;
  label: string;
}[] = [
  { id: 'serif', label: 'Serif Bold' },
  { id: 'geometric', label: 'Geométrica' },
  { id: 'condensed', label: 'Condensada' },
  { id: 'wide', label: 'Larga' },
];

const SHARED_EXTRA_DEFAULTS = {
  monogramInitial: '',
  monogramNamePos: 34,
  boxLetterLayout: 'assembled' as const,
  boxLetterBorderMm: 3.2,
  boxLetterJoined: true,
  svgSourceType: 'preset' as const,
  svgPresetId: 'paw' as const,
  svgRawContent: '',
  svgFileName: '',
  imagePixels: null,
  imageThreshold: 140,
  imageInvert: false,
  imageTraceMode: 'auto' as const,
  imageSmoothness: 2,
  imageDespeckle: 1,
  svgBorderMm: 2.8,
  svgAttachMode: 'arch' as const,
};

export function createDefaultConfig(template: TemplateId = 'heart-name'): ProjectConfig {
  switch (template) {
    case 'heart-name':
      return {
        ...SHARED_EXTRA_DEFAULTS,
        template: 'heart-name',
        text: 'VITORIA',
        subtitle: '',
        fontStyle: 'serif',
        widthMm: 65,
        heightMm: 55,
        depthMm: 20,
        textScale: 99,
        bevelMm: 0.6,
        primaryColor: '#C6533B',
        accentColor: '#F3F5F8',
        useDualColor: false,
        finish: 'pla-matte',
        keyringArch: true,
        heartMode: 'pure',
        heartKeyring: false,
        signBaseStyle: 'beveled',
        keychainShape: 'capsule',
        keychainRingPos: 'left',
        keychainRaisedBorder: true,
        plaqueMountHoles: true,
        plaqueRounded: true,
      };
    case 'monogram':
      return {
        ...SHARED_EXTRA_DEFAULTS,
        template: 'monogram',
        text: 'Gabriel',
        subtitle: '',
        fontStyle: 'serif',
        widthMm: 125,
        heightMm: 120,
        depthMm: 22,
        textScale: 96,
        bevelMm: 0.5,
        primaryColor: '#6374E5',
        accentColor: '#F3F5F8',
        useDualColor: true,
        finish: 'pla-silk',
        keyringArch: false,
        heartMode: 'pure',
        heartKeyring: false,
        signBaseStyle: 'beveled',
        keychainShape: 'capsule',
        keychainRingPos: 'left',
        keychainRaisedBorder: true,
        plaqueMountHoles: true,
        plaqueRounded: true,
      };
    case 'box-letter':
      return {
        ...SHARED_EXTRA_DEFAULTS,
        template: 'box-letter',
        text: 'ELISA',
        subtitle: '',
        fontStyle: 'geometric',
        widthMm: 165,
        heightMm: 58,
        depthMm: 22,
        textScale: 96,
        bevelMm: 0.6,
        primaryColor: '#3B4C63',
        accentColor: '#F3F5F8',
        useDualColor: true,
        finish: 'pla-silk',
        keyringArch: false,
        heartMode: 'pure',
        heartKeyring: false,
        signBaseStyle: 'beveled',
        keychainShape: 'capsule',
        keychainRingPos: 'left',
        keychainRaisedBorder: true,
        plaqueMountHoles: true,
        plaqueRounded: true,
      };
    case 'svg-keychain':
      return {
        ...SHARED_EXTRA_DEFAULTS,
        template: 'svg-keychain',
        text: 'PATINHA',
        subtitle: '',
        fontStyle: 'geometric',
        widthMm: 52,
        heightMm: 52,
        depthMm: 5.5,
        textScale: 94,
        bevelMm: 0.45,
        primaryColor: '#232730',
        accentColor: '#F3F5F8',
        useDualColor: true,
        finish: 'pla-matte',
        keyringArch: true,
        heartMode: 'pure',
        heartKeyring: false,
        signBaseStyle: 'beveled',
        keychainShape: 'capsule',
        keychainRingPos: 'left',
        keychainRaisedBorder: true,
        plaqueMountHoles: true,
        plaqueRounded: true,
      };
    case 'name-sign':
      return {
        ...SHARED_EXTRA_DEFAULTS,
        template: 'name-sign',
        text: 'LUCAS',
        subtitle: 'ESTÚDIO 3D',
        fontStyle: 'geometric',
        widthMm: 145,
        heightMm: 42,
        depthMm: 22,
        textScale: 94,
        bevelMm: 0.8,
        primaryColor: '#2563EB',
        accentColor: '#232730',
        useDualColor: true,
        finish: 'pla-matte',
        keyringArch: false,
        heartMode: 'solid-front',
        heartKeyring: false,
        signBaseStyle: 'beveled',
        keychainShape: 'capsule',
        keychainRingPos: 'left',
        keychainRaisedBorder: true,
        plaqueMountHoles: true,
        plaqueRounded: true,
      };
    case 'keychain':
      return {
        ...SHARED_EXTRA_DEFAULTS,
        template: 'keychain',
        text: 'SOFIA',
        subtitle: '',
        fontStyle: 'geometric',
        widthMm: 68,
        heightMm: 26,
        depthMm: 6,
        textScale: 90,
        bevelMm: 0.4,
        primaryColor: '#F3F5F8',
        accentColor: '#D93848',
        useDualColor: true,
        finish: 'pla-gloss',
        keyringArch: true,
        heartMode: 'solid-front',
        heartKeyring: false,
        signBaseStyle: 'beveled',
        keychainShape: 'capsule',
        keychainRingPos: 'left',
        keychainRaisedBorder: true,
        plaqueMountHoles: true,
        plaqueRounded: true,
      };
    case 'plaque':
      return {
        ...SHARED_EXTRA_DEFAULTS,
        template: 'plaque',
        text: 'ATELIÊ',
        subtitle: 'IMPRESSÃO 3D',
        fontStyle: 'geometric',
        widthMm: 150,
        heightMm: 68,
        depthMm: 7,
        textScale: 90,
        bevelMm: 0.5,
        primaryColor: '#D4A137',
        accentColor: '#232730',
        useDualColor: true,
        finish: 'pla-matte',
        keyringArch: false,
        heartMode: 'solid-front',
        heartKeyring: false,
        signBaseStyle: 'beveled',
        keychainShape: 'capsule',
        keychainRingPos: 'left',
        keychainRaisedBorder: true,
        plaqueMountHoles: true,
        plaqueRounded: true,
      };
  }
}

export interface TextValidationResult {
  valid: boolean;
  normalized: string;
  error: string | null;
}

const SUPPORTED_CHAR_REGEX = /^[A-Z0-9ÁÀÂÃÉÊÍÓÔÕÚÇ &+\-.!♥]+$/;

export function validateProjectText(rawText: string, maxLength = 14): TextValidationResult {
  const trimmed = rawText.trim().toUpperCase();

  if (trimmed.length === 0) {
    return {
      valid: false,
      normalized: '',
      error: 'Digite um nome ou palavra para gerar o modelo 3D.',
    };
  }

  if (trimmed.length > maxLength) {
    return {
      valid: false,
      normalized: trimmed.slice(0, maxLength),
      error: `Use até ${maxLength} caracteres para manter boa resistência na impressão.`,
    };
  }

  if (!SUPPORTED_CHAR_REGEX.test(trimmed)) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Use letras (com ou sem acento), números ou símbolos simples (& - ! . ♥).',
    };
  }

  return {
    valid: true,
    normalized: trimmed,
    error: null,
  };
}
