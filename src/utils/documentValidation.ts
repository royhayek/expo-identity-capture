import { VerifiedDocType } from '../types/extraction';

export interface DocumentValidationResult {
  isValid: boolean;
  confidence: number;
  detectedKeywords: string[];
  documentType: VerifiedDocType;
  textLength: number;
}

/**
 * Normalize text for consistent comparison
 * - Applies Unicode NFC normalization (composed form)
 * - Converts to lowercase for Latin characters
 * - Removes common Arabic diacritics that may vary between OCR outputs
 */
function normalizeText(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    // Remove Arabic diacritics (tashkeel) that OCR may inconsistently include
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // Normalize different forms of Arabic characters
    .replace(/[\u0622\u0623\u0625]/g, '\u0627') // Normalize alef variants to plain alef
    .replace(/[\u0649]/g, '\u064A') // Normalize alef maksura to ya
    .replace(/[\u0629]/g, '\u0647'); // Normalize ta marbuta to ha (sometimes OCR confuses them)
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
        // English keywords
        'residence', 'permit', 'residency permit', 'resident', 'residency',
        'visa', 'stay', 'immigration', 'work', 'foreign',
        'nationality', 'profession', 'expiry', 'issue date',
        'surname', 'name', 'father', 'pere', 'birth',
        // French keywords (Lebanese permits are trilingual)
        'permis de séjour', 'séjour', 'prénom', 'nationalité',
        'date de naissance', "date d'émission", "date d'expiration",
        // Arabic keywords
        'إقامة', 'جواز إقامة', 'تصريح إقامة', 'مقيم',
        'سنوية', 'عمل', 'المهنة', 'الجنسية',
        'وزارة الداخلية', 'الأمن العام', 'المديرية العامة', 'الامن العام',
        'تاريخ الولادة', 'تاريخ الإصدار', 'تاريخ الانتهاء',
        'الشهرة', 'الاسم', 'الأب', 'هجرة',
        // Additional common Arabic words found on residence permits
        'الجمهورية', 'اللبنانية', 'البلديات', 'والبلديات',
        'والاب', 'الاب', 'ايرلندية', 'فئة', 'مدير'
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
      // Normalize text for consistent matching (especially Arabic)
      const text = normalizeText(ocrText.trim());

      console.log(`[Validation] Normalized text length: ${text.length}, doc type: ${expectedDocType}`);

      // Basic text validation
      if (!text || text.length < minTextLength) {
        console.log(`[Validation] Text too short: ${text.length} < ${minTextLength}`);
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

      // Count specific keyword matches with normalized comparison
      keywords.specific.forEach(keyword => {
        const normalizedKeyword = normalizeText(keyword);
        if (text.includes(normalizedKeyword)) {
          detectedSpecific.push(keyword);
        }
      });

      // Count general keyword matches with normalized comparison
      keywords.general.forEach(keyword => {
        const normalizedKeyword = normalizeText(keyword);
        if (text.includes(normalizedKeyword)) {
          detectedGeneral.push(keyword);
        }
      });

      console.log(`[Validation] Specific keywords found: ${detectedSpecific.length}`, detectedSpecific.slice(0, 5));
      console.log(`[Validation] General keywords found: ${detectedGeneral.length}`, detectedGeneral.slice(0, 5));

      // Calculate confidence based on matches
      const specificWeight = 0.7; // Specific keywords are more important
      const generalWeight = 0.3;
      const textLengthBonus = Math.min(text.length / 100, 0.2); // Up to 20% bonus for longer text

      const specificScore = Math.min(detectedSpecific.length / 2, 1) * specificWeight;
      const generalScore = Math.min(detectedGeneral.length / 3, 1) * generalWeight;
      const confidence = Math.min(specificScore + generalScore + textLengthBonus, 1);

      // Validation criteria - need at least 1 specific keyword OR 2 general keywords
      // This is more lenient for documents where specific keywords may not be recognized perfectly
      const hasMinimumKeywords = detectedSpecific.length >= 1 || detectedGeneral.length >= 2;
      const hasGoodConfidence = confidence >= 0.3; // Lowered threshold slightly
      const isValid = hasMinimumKeywords && hasGoodConfidence;

      console.log(`[Validation] Result: isValid=${isValid}, confidence=${(confidence * 100).toFixed(0)}%, hasMinKeywords=${hasMinimumKeywords}`);

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