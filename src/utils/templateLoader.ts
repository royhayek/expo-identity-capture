import { DocumentTemplate, VerifiedDocType } from '../types/extraction';

// Import template JSON files
import civilIdFrontTemplate from '../templates/civil_id_front.json';
import armyCardTemplate from '../templates/army_card.json';

// Note: civil_id_back is not in VerifiedDocType - using civil_id for both front and back

/**
 * Template loader utility for loading document templates from JSON files
 */
export class TemplateLoader {
  private static templates: Map<string, DocumentTemplate> = new Map();

  /**
   * Load template for a specific document type
   */
  static async loadTemplate(docType: VerifiedDocType): Promise<DocumentTemplate | null> {
    const templateKey = docType;

    // Check cache first
    if (this.templates.has(templateKey)) {
      const cached = this.templates.get(templateKey)!;
      console.log(`✅ Using cached template for ${docType}`);
      return cached;
    }

    console.log(`📋 Loading template for ${docType} from JSON files...`);

    try {
      let templateData: DocumentTemplate | null = null;

      // Load template based on document type
      switch (docType) {
        case 'civil_id':
          templateData = this.processTemplateData(civilIdFrontTemplate as any);
          break;
        case 'army_card':
          templateData = this.processTemplateData(armyCardTemplate as any);
          break;
        case 'passport':
          // Passport templates might be dynamic based on version
          templateData = this.getPassportTemplate();
          break;
        case 'residence_permit':
          // Use fallback for now
          templateData = this.getResidencePermitFallback();
          break;
        case 'civil_register':
          // Use civil_id template as fallback for civil_register
          templateData = this.processTemplateData(civilIdFrontTemplate as any);
          templateData.docType = 'civil_register';
          break;
        default:
          console.warn(`⚠️ No template file available for document type: ${docType}`);
          return null;
      }

      if (templateData) {
        console.log(`✅ Template loaded for ${docType}: ${Object.keys(templateData.fields).length} fields defined`);
        console.log(`📐 Template fields bounds:`, {
          minX: Math.min(...Object.values(templateData.fields).map(f => f.x)),
          maxX: Math.max(...Object.values(templateData.fields).map(f => f.x + f.w)),
          minY: Math.min(...Object.values(templateData.fields).map(f => f.y)),
          maxY: Math.max(...Object.values(templateData.fields).map(f => f.y + f.h))
        });
        this.templates.set(templateKey, templateData);
        return templateData;
      }

      return null;
    } catch (error) {
      console.error(`❌ Failed to load template for ${docType}:`, error);
      return null;
    }
  }

  /**
   * Process template data from JSON to ensure proper typing
   */
  private static processTemplateData(jsonData: any): DocumentTemplate {
    return {
      docType: jsonData.docType,
      size: jsonData.size,
      fields: jsonData.fields
    };
  }

  /**
   * Fallback passport template (could be enhanced with version detection)
   */
  private static getPassportTemplate(): DocumentTemplate {
    return {
      docType: "passport",
      size: { w: 1000, h: 1400 },
      fields: {
        passportNumber: { x: 0.6, y: 0.25, w: 0.35, h: 0.05 },
        givenNames: { x: 0.15, y: 0.35, w: 0.8, h: 0.05 },
        surname: { x: 0.15, y: 0.42, w: 0.8, h: 0.05 },
        nationality: { x: 0.15, y: 0.49, w: 0.4, h: 0.04 },
        dateOfBirth: { x: 0.15, y: 0.56, w: 0.3, h: 0.04 },
        placeOfBirth: { x: 0.5, y: 0.56, w: 0.45, h: 0.04 },
        dateOfIssue: { x: 0.15, y: 0.63, w: 0.3, h: 0.04 },
        dateOfExpiry: { x: 0.5, y: 0.63, w: 0.3, h: 0.04 },
      }
    };
  }

  /**
   * Fallback residence permit template
   */
  private static getResidencePermitFallback(): DocumentTemplate {
    return {
      docType: "residence_permit",
      size: { w: 860, h: 540 },
      fields: {
        documentNumber: { x: 0.7, y: 0.12, w: 0.25, h: 0.05 },
        givenNames: { x: 0.3, y: 0.2, w: 0.35, h: 0.05 },
        surname: { x: 0.3, y: 0.27, w: 0.35, h: 0.05 },
        dateOfBirth: { x: 0.3, y: 0.34, w: 0.3, h: 0.05 },
        nationality: { x: 0.3, y: 0.41, w: 0.3, h: 0.05 },
        dateOfExpiry: { x: 0.3, y: 0.55, w: 0.3, h: 0.05 },
      }
    };
  }

  /**
   * Get all available template types
   */
  static getAvailableTemplateTypes(): VerifiedDocType[] {
    return ['civil_id', 'army_card', 'passport', 'residence_permit', 'civil_register'];
  }

  /**
   * Check if template exists for document type
   */
  static hasTemplate(docType: VerifiedDocType): boolean {
    return this.getAvailableTemplateTypes().includes(docType);
  }

  /**
   * Clear template cache
   */
  static clearCache(): void {
    this.templates.clear();
    console.log('🗑️ Template cache cleared');
  }
}