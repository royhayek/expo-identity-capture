import { VerifiedDocType } from '../types/extraction';

export interface DocumentValidationResult {
  isValid: boolean;
  confidence: number;
  detectedKeywords: string[];
  documentType: VerifiedDocType;
  textLength: number;
}

/**
 * Document validation utility using OCR text analysis
 */
export class DocumentValidation {
  /**
   * Get validation keywords for different document types
   */
  private static getDocumentKeywords(docType: VerifiedDocType): { specific: string[], general: string[] } {
    const documentKeywords: Record<VerifiedDocType, string[]> = {
      passport: [
        'passport', 'passeport', 'جواز سفر', 'جواز',
        'republic', 'state', 'nationality', 'birth', 'sex',
        'country', 'given name', 'surname', 'دولة', 'جمهورية',
        'travel document', 'travel', 'international'
      ],
      civil_id: [
        'civil', 'identity', 'card', 'national', 'citizen',
        'بطاقة مدنية', 'هوية', 'republic', 'state',
        'الجمهورية', 'الكويت', 'kuwait', 'مدني', 'رقم مدني',
        'civil id', 'national id', 'id card'
      ],
      army_card: [
        'military', 'army', 'armed forces', 'service', 'rank',
        'القوات المسلحة', 'عسكرية', 'الجيش', 'رتبة', 'عسكري',
        'defense', 'soldier', 'officer'
      ],
      residence_permit: [
        'residence', 'permit', 'visa', 'stay', 'إقامة',
        'تصريح إقامة', 'resident', 'immigration', 'work',
        'هجرة', 'مقيم', 'إذن', 'residency', 'foreign'
      ],
      civil_register: [
        'register', 'civil register', 'سجل مدني', 'قيد', 'عائلي',
        'family', 'أسرة', 'registration', 'قيود', 'نفوس',
        'population', 'records', 'سجلات', 'دائرة النفوس',
        'birth certificate', 'family record'
      ]
    };

    const generalIndicators = [
      'republic', 'state', 'government', 'ministry', 'authority',
      'number', 'date', 'name', 'nationality', 'issued', 'valid',
      'الجمهورية', 'دولة', 'حكومة', 'وزارة', 'رسمي',
      'رقم', 'تاريخ', 'اسم', 'جنسية', 'صادر', 'صالح',
      'official', 'document', 'certificate'
    ];

    return {
      specific: documentKeywords[docType] || [],
      general: generalIndicators
    };
  }

  /**
   * Validate document text using OCR results
   */
  static validateDocumentText(
    ocrText: string, 
    expectedDocType: VerifiedDocType,
    minTextLength: number = 15
  ): DocumentValidationResult {
    try {
      const text = ocrText.toLowerCase().trim();
      
      // Basic text validation
      if (!text || text.length < minTextLength) {
        return {
          isValid: false,
          confidence: 0.1,
          detectedKeywords: [],
          documentType: expectedDocType,
          textLength: text.length
        };
      }

      // Filter out debug/log text patterns
      const debugPatterns = [
        /log\s+/i, /console/i, /debug/i, /error/i, /warning/i,
        /starting\s+/i, /validation/i, /detected\s+text/i,
        /analysis/i, /buffer/i, /dimensions/i, /confidence/i
      ];

      let debugMatches = 0;
      debugPatterns.forEach(pattern => {
        if (pattern.test(text)) debugMatches++;
      });

      if (debugMatches >= 2) {
        return {
          isValid: false,
          confidence: 0.1,
          detectedKeywords: [],
          documentType: expectedDocType,
          textLength: text.length
        };
      }

      const keywords = this.getDocumentKeywords(expectedDocType);
      const detectedSpecific: string[] = [];
      const detectedGeneral: string[] = [];

      // Count specific keyword matches
      keywords.specific.forEach(keyword => {
        if (text.includes(keyword.toLowerCase())) {
          detectedSpecific.push(keyword);
        }
      });

      // Count general keyword matches
      keywords.general.forEach(keyword => {
        if (text.includes(keyword.toLowerCase())) {
          detectedGeneral.push(keyword);
        }
      });

      // Calculate confidence based on matches
      const specificWeight = 0.7; // Specific keywords are more important
      const generalWeight = 0.3;
      const textLengthBonus = Math.min(text.length / 100, 0.2); // Up to 20% bonus for longer text

      const specificScore = Math.min(detectedSpecific.length / 2, 1) * specificWeight;
      const generalScore = Math.min(detectedGeneral.length / 3, 1) * generalWeight;
      const confidence = Math.min(specificScore + generalScore + textLengthBonus, 1);

      // Validation criteria
      const hasMinimumKeywords = detectedSpecific.length >= 1 && detectedGeneral.length >= 1;
      const hasGoodConfidence = confidence >= 0.4;
      const isValid = hasMinimumKeywords && hasGoodConfidence;

      return {
        isValid,
        confidence,
        detectedKeywords: [...detectedSpecific, ...detectedGeneral],
        documentType: expectedDocType,
        textLength: text.length
      };

    } catch (error) {
      console.error('❌ Document validation error:', error);
      return {
        isValid: false,
        confidence: 0,
        detectedKeywords: [],
        documentType: expectedDocType,
        textLength: 0
      };
    }
  }

  /**
   * Get human-readable validation message
   */
  static getValidationMessage(result: DocumentValidationResult): string {
    if (result.isValid) {
      return `✅ Valid ${result.documentType} detected with ${(result.confidence * 100).toFixed(0)}% confidence`;
    }

    if (result.textLength < 15) {
      return `❌ Insufficient text detected (${result.textLength} characters). Please ensure the document is clearly visible.`;
    }

    if (result.detectedKeywords.length === 0) {
      return `❌ No ${result.documentType} keywords detected. Please verify you're capturing the correct document type.`;
    }

    return `❌ Document validation failed. Expected ${result.documentType} but confidence is only ${(result.confidence * 100).toFixed(0)}%`;
  }
}