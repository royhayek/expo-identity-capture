import { VerifiedDocType } from '../types/extraction';
import { LocalizationConfig, DocumentLabels, DocumentInstructions, AlertMessages } from '../types/config';

// Default strings for fallback
export const DEFAULT_STRINGS = {
  en: {
    documentLabels: {
      passport: 'Passport',
      civil_id: 'Civil ID',
      army_card: 'Army Card', 
      residence_permit: 'Residence Permit',
      civil_register: 'Civil Register',
    } as DocumentLabels,
    
    instructions: {
      passport: 'Hold your passport in your hand and make sure it fully fits in the frame.',
      civil_id: 'Hold your civil ID in your hand and make sure it fully fits in the frame.',
      army_card: 'Hold your army card in your hand and make sure it fully fits in the frame.',
      residence_permit: 'Hold your residence permit in your hand and make sure it fully fits in the frame.',
      civil_register: 'Hold your civil register in your hand and make sure it fully fits in the frame.',
    } as DocumentInstructions,
    
    alerts: {
      captureSuccess: 'Document captured successfully!',
      captureFailed: 'Failed to capture document. Please try again.',
      ocrValidationFailed: 'Could not validate document text. Please ensure document is clearly visible.',
      processingTimeout: 'Processing timeout. Please try again.',
      cameraPermissionDenied: 'Camera permission is required to capture documents.',
      cameraNotAvailable: 'Camera is not available on this device.',
      documentCaptured: 'Document Captured',
      retakePhoto: 'Retake',
      useThisPhoto: 'Use This Photo',
    } as AlertMessages,
    
    ui: {
      capture: 'Capture',
      retake: 'Retake',
      cancel: 'Cancel',
      done: 'Done',
      loading: 'Loading...',
      error: 'Error',
      flashOn: 'Flash On',
      flashOff: 'Flash Off',
      back: 'Back',
      front: 'Front',
      selfie_instruction: 'Position your face in the center and look into the camera',
    },
  },
  
  ar: {
    documentLabels: {
      passport: 'جواز السفر',
      civil_id: 'الهوية المدنية',
      army_card: 'البطاقة العسكرية',
      residence_permit: 'إقامة',
      civil_register: 'السجل المدني',
    } as DocumentLabels,
    
    instructions: {
      passport: 'أمسك جواز سفرك بيدك وتأكد من ظهوره بالكامل داخل الإطار.',
      civil_id: 'أمسك هويتك المدنية بيدك وتأكد من ظهورها بالكامل داخل الإطار.',
      army_card: 'أمسك بطاقتك العسكرية بيدك وتأكد من ظهورها بالكامل داخل الإطار.',
      residence_permit: 'أمسك إقامتك بيدك وتأكد من ظهورها بالكامل داخل الإطار.',
      civil_register: 'أمسك سجلك المدني بيدك وتأكد من ظهوره بالكامل داخل الإطار.',
    } as DocumentInstructions,
    
    alerts: {
      captureSuccess: 'تم التقاط الوثيقة بنجاح!',
      captureFailed: 'فشل في التقاط الوثيقة. يرجى المحاولة مرة أخرى.',
      ocrValidationFailed: 'لا يمكن التحقق من نص الوثيقة. يرجى التأكد من وضوح الوثيقة.',
      processingTimeout: 'انتهت مهلة المعالجة. يرجى المحاولة مرة أخرى.',
      cameraPermissionDenied: 'إذن الكاميرا مطلوب لالتقاط الوثائق.',
      cameraNotAvailable: 'الكاميرا غير متوفرة على هذا الجهاز.',
      documentCaptured: 'تم التقاط الوثيقة',
      retakePhoto: 'إعادة التقاط',
      useThisPhoto: 'استخدام هذه الصورة',
    } as AlertMessages,
    
    ui: {
      capture: 'التقاط',
      retake: 'إعادة التقاط',
      cancel: 'إلغاء',
      done: 'تم',
      loading: 'جارٍ التحميل...',
      error: 'خطأ',
      flashOn: 'الفلاش مفعل',
      flashOff: 'الفلاش مطفئ',
      back: 'رجوع',
      front: 'أمامي',
      selfie_instruction: 'ضع وجهك في الوسط وانظر إلى الكاميرا',
    },
  },
  
  fr: {
    documentLabels: {
      passport: 'Passeport',
      civil_id: 'Carte d\'identité',
      army_card: 'Carte militaire',
      residence_permit: 'Permis de séjour',
      civil_register: 'Registre civil',
    } as DocumentLabels,
    
    instructions: {
      passport: 'Tenez votre passeport dans votre main et assurez-vous qu\'il s\'adapte entièrement dans le cadre.',
      civil_id: 'Tenez votre carte d\'identité dans votre main et assurez-vous qu\'elle s\'adapte entièrement dans le cadre.',
      army_card: 'Tenez votre carte militaire dans votre main et assurez-vous qu\'elle s\'adapte entièrement dans le cadre.',
      residence_permit: 'Tenez votre permis de séjour dans votre main et assurez-vous qu\'il s\'adapte entièrement dans le cadre.',
      civil_register: 'Tenez votre registre civil dans votre main et assurez-vous qu\'il s\'adapte entièrement dans le cadre.',
    } as DocumentInstructions,
    
    alerts: {
      captureSuccess: 'Document capturé avec succès!',
      captureFailed: 'Échec de la capture du document. Veuillez réessayer.',
      ocrValidationFailed: 'Impossible de valider le texte du document. Veuillez vous assurer que le document est clairement visible.',
      processingTimeout: 'Délai de traitement dépassé. Veuillez réessayer.',
      cameraPermissionDenied: 'L\'autorisation de la caméra est requise pour capturer des documents.',
      cameraNotAvailable: 'La caméra n\'est pas disponible sur cet appareil.',
      documentCaptured: 'Document Capturé',
      retakePhoto: 'Reprendre',
      useThisPhoto: 'Utiliser Cette Photo',
    } as AlertMessages,
    
    ui: {
      capture: 'Capturer',
      retake: 'Reprendre',
      cancel: 'Annuler',
      done: 'Terminé',
      loading: 'Chargement...',
      error: 'Erreur',
      flashOn: 'Flash Activé',
      flashOff: 'Flash Désactivé',
      back: 'Retour',
      front: 'Avant',
      selfie_instruction: 'Positionnez votre visage au centre et regardez dans la caméra',
    },
  },
};

export class ConfigurableLocalizationManager {
  private config: LocalizationConfig;
  
  constructor(config: LocalizationConfig = {}) {
    this.config = config;
  }
  
  updateConfig(config: LocalizationConfig) {
    this.config = config;
  }
  
  getCurrentLanguage(): string {
    return this.config.language || 'en';
  }
  
  getDocumentLabel(docType: VerifiedDocType): string {
    const lang = this.getCurrentLanguage();
    
    // Try custom strings first
    const customLabel = this.config.customStrings?.[lang]?.documentLabels?.[docType];
    if (customLabel) {
      return customLabel;
    }
    
    // Fall back to default strings
    const defaultLang = DEFAULT_STRINGS[lang as keyof typeof DEFAULT_STRINGS];
    if (defaultLang?.documentLabels?.[docType]) {
      return defaultLang.documentLabels[docType]!;
    }
    
    // Ultimate fallback to English
    return DEFAULT_STRINGS.en.documentLabels[docType] || 'Document';
  }
  
  getInstructionText(docType: VerifiedDocType): string {
    const lang = this.getCurrentLanguage();
    
    // Try custom strings first
    const customInstruction = this.config.customStrings?.[lang]?.instructions?.[docType];
    if (customInstruction) {
      return customInstruction;
    }
    
    // Fall back to default strings
    const defaultLang = DEFAULT_STRINGS[lang as keyof typeof DEFAULT_STRINGS];
    if (defaultLang?.instructions?.[docType]) {
      return defaultLang.instructions[docType]!;
    }
    
    // Ultimate fallback to English
    return DEFAULT_STRINGS.en.instructions[docType] || 'Hold your document in your hand and make sure it fully fits in the frame.';
  }
  
  getAlertMessage(key: keyof AlertMessages): string {
    const lang = this.getCurrentLanguage();
    
    // Try custom strings first
    const customAlert = this.config.customStrings?.[lang]?.alerts?.[key];
    if (customAlert) {
      return customAlert;
    }
    
    // Fall back to default strings
    const defaultLang = DEFAULT_STRINGS[lang as keyof typeof DEFAULT_STRINGS];
    if (defaultLang?.alerts?.[key]) {
      return defaultLang.alerts[key]!;
    }
    
    // Ultimate fallback to English
    return DEFAULT_STRINGS.en.alerts[key] || '';
  }
  
  getUIText(key: string): string {
    const lang = this.getCurrentLanguage();
    
    // Try custom strings first
    const customUI = this.config.customStrings?.[lang]?.ui?.[key];
    if (customUI) {
      return customUI;
    }
    
    // Fall back to default strings
    const defaultLang = DEFAULT_STRINGS[lang as keyof typeof DEFAULT_STRINGS];
    if (defaultLang?.ui?.[key]) {
      return defaultLang.ui[key];
    }
    
    // Ultimate fallback to English
    return DEFAULT_STRINGS.en.ui[key] || key;
  }
  
  // Helper to get all available languages
  getAvailableLanguages(): string[] {
    const defaultLanguages = Object.keys(DEFAULT_STRINGS);
    const customLanguages = Object.keys(this.config.customStrings || {});
    
    return [...new Set([...defaultLanguages, ...customLanguages])];
  }
  
  // Helper to check if a language is supported
  isLanguageSupported(language: string): boolean {
    return this.getAvailableLanguages().includes(language);
  }
  
  // Helper to get the best matching language (with fallback)
  getBestMatchingLanguage(preferredLanguage: string): string {
    if (this.isLanguageSupported(preferredLanguage)) {
      return preferredLanguage;
    }
    
    // Try language code without region (e.g., 'ar' from 'ar-SA')
    const langCode = preferredLanguage.split('-')[0];
    if (this.isLanguageSupported(langCode)) {
      return langCode;
    }
    
    // Fall back to English
    return 'en';
  }
}

// Export a default instance for backward compatibility
export const defaultLocalizationManager = new ConfigurableLocalizationManager();