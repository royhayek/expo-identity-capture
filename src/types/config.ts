import { VerifiedDocType } from './extraction';

// ============================================================================
// THEME & STYLING CONFIGURATION
// ============================================================================

export interface ThemeColors {
  primary?: string;      // Default: '#007AFF'
  secondary?: string;    // Default: '#34C759'
  danger?: string;       // Default: '#FF3B30'
  warning?: string;      // Default: '#FF9500'
  background?: string;   // Default: '#000000'
  surface?: string;      // Default: '#FFFFFF'
  overlay?: string;      // Default: 'rgba(0, 0, 0, 0.6)'
  text?: {
    primary?: string;    // Default: '#333333'
    secondary?: string;  // Default: '#666666'
    disabled?: string;   // Default: '#999999'
    inverse?: string;    // Default: '#FFFFFF'
  };
  border?: {
    default?: string;    // Default: '#FFFFFF'
    detected?: string;   // Default: '#4CAF50'
    frame?: string;      // Default: '#FFFFFF'
  };
  progress?: {
    gradient?: string[]; // Default: ['#4CAF50', '#2196F3', '#9C27B0']
    background?: string; // Default: 'rgba(255,255,255,0.3)'
  };
}

export interface TypographyConfig {
  fonts?: {
    regular?: string;    // Default: 'System'
    medium?: string;     // Default: 'System'
    semibold?: string;   // Default: 'System'
    bold?: string;       // Default: 'System'
  };
  sizes?: {
    xs?: number;         // Default: 12
    sm?: number;         // Default: 14
    base?: number;       // Default: 16
    lg?: number;         // Default: 18
    xl?: number;         // Default: 24
    xxl?: number;        // Default: 28
  };
  lineHeights?: {
    tight?: number;      // Default: 1.2
    normal?: number;     // Default: 1.4
    relaxed?: number;    // Default: 1.6
  };
  weights?: {
    normal?: string;     // Default: '400'
    medium?: string;     // Default: '500'
    semibold?: string;   // Default: '600'
    bold?: string;       // Default: '700'
  };
}

export interface FrameDimensions {
  top?: string;          // Percentage, e.g., '28%'
  left?: string;         // Percentage, e.g., '10%'
  right?: string;        // Percentage, e.g., '10%'
  height?: string;       // Percentage, e.g., '50%'
}

export interface LayoutConfig {
  frame?: Partial<Record<VerifiedDocType, FrameDimensions>>;
  borderRadius?: number; // Default: 16
  buttons?: {
    capture?: { width?: number; height?: number }; // Default: 70x70
    header?: { width?: number; height?: number };  // Default: 60x60
  };
  spacing?: {
    xs?: number;         // Default: 4
    sm?: number;         // Default: 8
    md?: number;         // Default: 16
    lg?: number;         // Default: 24
    xl?: number;         // Default: 32
  };
  overlay?: {
    opacity?: number;    // Default: 0.6
  };
}

export interface AnimationConfig {
  progress?: {
    duration?: number;   // Default: 1500ms
    easing?: 'linear' | 'ease' | 'easeIn' | 'easeOut' | 'easeInOut'; // Default: 'linear'
  };
  modal?: {
    type?: 'slide' | 'fade' | 'none'; // Default: 'slide'
    duration?: number;   // Default: 300ms
  };
  transitions?: {
    enableAnimations?: boolean; // Default: true
    reducedMotion?: boolean;    // Default: false
  };
}

// ============================================================================
// LOCALIZATION CONFIGURATION
// ============================================================================

export type DocumentLabels = {
  [K in VerifiedDocType]?: string;
};

export type DocumentInstructions = {
  [K in VerifiedDocType]?: string;
};

export interface AlertMessages {
  captureSuccess?: string;
  captureFailed?: string;
  ocrValidationFailed?: string;
  processingTimeout?: string;
  cameraPermissionDenied?: string;
  cameraNotAvailable?: string;
  documentCaptured?: string;
  retakePhoto?: string;
  useThisPhoto?: string;
}

export interface LocalizationConfig {
  language?: 'en' | 'ar' | 'fr' | string; // Default: 'en'
  customStrings?: {
    [language: string]: {
      // Document labels
      documentLabels?: DocumentLabels;
      
      // Instructions
      instructions?: DocumentInstructions;
      
      // Alerts and messages
      alerts?: AlertMessages;
      
      // UI elements
      ui?: {
        capture?: string;
        retake?: string;
        cancel?: string;
        done?: string;
        loading?: string;
        error?: string;
        flashOn?: string;
        flashOff?: string;
        back?: string;
        front?: string;
        selfie_instruction?: string;
        selfieTitle?: string;
        capturing?: string;
        holdSteadyCapturing?: string;
        documentDetected?: string;
        cameraPermissionRequired?: string;
        grantPermission?: string;
        noCamera?: string;
        noFrontCamera?: string;
      };
    };
  };
}

// ============================================================================
// BEHAVIOR & FUNCTIONALITY CONFIGURATION
// ============================================================================

export interface DetectionConfig {
  ocr?: {
    timeout?: number;                    // Default: 5000ms
    throttleInterval?: number;           // Default: 1500ms
    minTextLength?: number;              // Default: 10
    consecutiveFailureThreshold?: number; // Default: 3
    confidenceThresholds?: {
      high?: number;     // Default: 0.9
      medium?: number;   // Default: 0.7
      low?: number;      // Default: 0.3
    };
  };
  
  vision?: {
    confidenceThreshold?: number;        // Default: 0.6
    aspectRatioTolerance?: number;       // Default: 0.2
    frameSizeConstraints?: {
      min?: number;      // Default: 0.4
      max?: number;      // Default: 0.7
    };
    stabilityThreshold?: number;         // Default: 10
    edgeMargin?: number;                // Default: 0.05
  };
  
  processing?: {
    frameSkipCount?: number;             // Default: 5
    maxRetries?: number;                 // Default: 2
    processingTimeout?: number;          // Default: 30000ms
  };
}

export interface CameraConfig {
  defaultDevice?: 'front' | 'back';     // Default: 'back'
  flash?: {
    enabled?: boolean;                   // Default: true
    default?: 'on' | 'off' | 'auto';   // Default: 'off'
  };
  photo?: {
    quality?: number;                    // Default: 0.8
    format?: 'jpeg' | 'png';            // Default: 'jpeg'
    enableShutterSound?: boolean;        // Default: false
  };
  permissions?: {
    requestOnMount?: boolean;            // Default: true
    showPermissionAlert?: boolean;       // Default: true
  };
}

export interface ImageProcessingConfig {
  quality?: number;              // Default: 0.8
  maxDimensions?: {
    width?: number;              // Default: 1920
    height?: number;             // Default: 1080
  };
  format?: 'jpeg' | 'png';      // Default: 'jpeg'
  compression?: {
    enabled?: boolean;           // Default: true
    quality?: number;            // Default: 0.8
  };
  output?: 'uri' | 'base64';    // Default: 'uri'
}

// ============================================================================
// DOCUMENT CONFIGURATION
// ============================================================================

export interface FieldPosition {
  x: number;        // Normalized 0-1
  y: number;        // Normalized 0-1
  w: number;        // Normalized 0-1
  h: number;        // Normalized 0-1
  type?: 'text' | 'number' | 'date' | 'mrz';
  validation?: {
    pattern?: RegExp;
    minLength?: number;
    maxLength?: number;
    required?: boolean;
  };
}

export interface DocumentTemplate {
  docType: VerifiedDocType;
  size?: { w: number; h: number };
  aspectRatio?: number;
  fields?: Record<string, FieldPosition>;
  validation?: {
    requiredFields?: string[];
    optionalFields?: string[];
  };
}

export interface ValidationConfig {
  keywords?: Partial<Record<VerifiedDocType, {
    specific?: string[];      // Document-specific keywords
    general?: string[];       // General document indicators
    excludePatterns?: RegExp[]; // Debug/invalid text patterns
  }>>;
  
  textQuality?: {
    minLength?: number;              // Default: 10
    minAlphanumericRatio?: number;   // Default: 0.5
    debugPatternThreshold?: number;  // Default: 2
  };
  
  matching?: {
    requiredSpecificMatches?: number;  // Default: 1
    requiredGeneralMatches?: number;   // Default: 1
    caseSensitive?: boolean;           // Default: false
  };
}

// ============================================================================
// LIVENESS DETECTION CONFIGURATION
// ============================================================================

export interface LivenessConfig {
  /** Enable liveness detection for documents */
  enableForDocuments?: boolean;        // Default: false
  /** Enable liveness detection for selfies */
  enableForSelfies?: boolean;          // Default: false
  /** Minimum score to pass liveness check (0-1) */
  threshold?: number;                   // Default: 0.55
  /** Detection methods to enable */
  methods?: {
    /** Detect moire patterns from screen pixel grids */
    moire?: boolean;                    // Default: true
    /** Detect color banding from limited screen color depth */
    colorBanding?: boolean;             // Default: true
    /** Analyze edge sharpness uniformity */
    edgeSharpness?: boolean;            // Default: true
    /** Detect screen reflections and backlight */
    reflection?: boolean;               // Default: true
    /** Analyze texture (paper/skin vs flat screen) */
    texture?: boolean;                  // Default: true
  };
  /** Weights for each detection method (must sum to ~1) */
  weights?: {
    moire?: number;                     // Default: 0.25
    colorBanding?: number;              // Default: 0.20
    edgeSharpness?: number;             // Default: 0.20
    reflection?: number;                // Default: 0.15
    texture?: number;                   // Default: 0.20
  };
  /** Block capture if liveness check fails */
  blockOnFailure?: boolean;             // Default: false (just warn)
  /** Show liveness score in UI */
  showScoreInUI?: boolean;              // Default: true when enabled
}

// ============================================================================
// MAIN CONFIGURATION INTERFACE
// ============================================================================

export interface IdentityCaptureConfig {
  theme?: {
    colors?: ThemeColors;
    typography?: TypographyConfig;
    layout?: LayoutConfig;
    animation?: AnimationConfig;
  };

  localization?: LocalizationConfig;

  behavior?: {
    detection?: DetectionConfig;
    camera?: CameraConfig;
    imageProcessing?: ImageProcessingConfig;
    liveness?: LivenessConfig;
  };

  documents?: {
    templates?: Record<VerifiedDocType, DocumentTemplate>;
    validation?: ValidationConfig;
  };
}

// Export default configuration values for fallback
export const DEFAULT_CONFIG: Required<IdentityCaptureConfig> = {
  theme: {
    colors: {
      primary: '#007AFF',
      secondary: '#34C759',
      danger: '#FF3B30',
      warning: '#FF9500',
      background: '#000000',
      surface: '#FFFFFF',
      overlay: 'rgba(0, 0, 0, 0.6)',
      text: {
        primary: '#333333',
        secondary: '#666666',
        disabled: '#999999',
        inverse: '#FFFFFF',
      },
      border: {
        default: '#FFFFFF',
        detected: '#4CAF50',
        frame: '#FFFFFF',
      },
      progress: {
        gradient: ['#4CAF50', '#2196F3', '#9C27B0'],
        background: 'rgba(255,255,255,0.3)',
      },
    },
    typography: {
      fonts: {
        regular: 'System',
        medium: 'System',
        semibold: 'System',
        bold: 'System',
      },
      sizes: {
        xs: 12,
        sm: 14,
        base: 16,
        lg: 18,
        xl: 24,
        xxl: 28,
      },
      lineHeights: {
        tight: 1.2,
        normal: 1.4,
        relaxed: 1.6,
      },
      weights: {
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
      },
    },
    layout: {
      frame: {
        passport: { top: '28%', left: '12%', right: '12%', height: '48%' },
        civil_id: { top: '35%', left: '8%', right: '8%', height: '25%' },
        army_card: { top: '35%', left: '8%', right: '8%', height: '25%' },
        residence_permit: { top: '35%', left: '8%', right: '8%', height: '25%' },
        civil_register: { top: '35%', left: '10%', right: '10%', height: '30%' },
      },
      borderRadius: 16,
      buttons: {
        capture: { width: 70, height: 70 },
        header: { width: 60, height: 60 },
      },
      spacing: {
        xs: 4,
        sm: 8,
        md: 16,
        lg: 24,
        xl: 32,
      },
      overlay: {
        opacity: 0.6,
      },
    },
    animation: {
      progress: {
        duration: 1500,
        easing: 'linear',
      },
      modal: {
        type: 'slide',
        duration: 300,
      },
      transitions: {
        enableAnimations: true,
        reducedMotion: false,
      },
    },
  },
  
  localization: {
    language: 'en',
    customStrings: {},
  },
  
  behavior: {
    detection: {
      ocr: {
        timeout: 5000,
        throttleInterval: 1500,
        minTextLength: 10,
        consecutiveFailureThreshold: 3,
        confidenceThresholds: {
          high: 0.9,
          medium: 0.7,
          low: 0.3,
        },
      },
      vision: {
        confidenceThreshold: 0.6,
        aspectRatioTolerance: 0.2,
        frameSizeConstraints: {
          min: 0.4,
          max: 0.7,
        },
        stabilityThreshold: 10,
        edgeMargin: 0.05,
      },
      processing: {
        frameSkipCount: 5,
        maxRetries: 2,
        processingTimeout: 30000,
      },
    },
    camera: {
      defaultDevice: 'back',
      flash: {
        enabled: true,
        default: 'off',
      },
      photo: {
        quality: 0.8,
        format: 'jpeg',
        enableShutterSound: false,
      },
      permissions: {
        requestOnMount: true,
        showPermissionAlert: true,
      },
    },
    imageProcessing: {
      quality: 0.8,
      maxDimensions: {
        width: 1920,
        height: 1080,
      },
      format: 'jpeg',
      compression: {
        enabled: true,
        quality: 0.8,
      },
      output: 'uri',
    },
    liveness: {
      enableForDocuments: false,
      enableForSelfies: false,
      threshold: 0.55,
      methods: {
        moire: true,
        colorBanding: true,
        edgeSharpness: true,
        reflection: true,
        texture: true,
      },
      weights: {
        moire: 0.25,
        colorBanding: 0.20,
        edgeSharpness: 0.20,
        reflection: 0.15,
        texture: 0.20,
      },
      blockOnFailure: false,
      showScoreInUI: true,
    },
  },

  documents: {
    templates: {} as Record<VerifiedDocType, DocumentTemplate>,
    validation: {
      keywords: {} as Record<VerifiedDocType, any>,
      textQuality: {
        minLength: 10,
        minAlphanumericRatio: 0.5,
        debugPatternThreshold: 2,
      },
      matching: {
        requiredSpecificMatches: 1,
        requiredGeneralMatches: 1,
        caseSensitive: false,
      },
    },
  },
};