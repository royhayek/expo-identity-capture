import { DocumentType, CaptureStep, FlowState } from '../types';

export class FlowRules {
  static getRequiredSteps(documentType: DocumentType, flowState: FlowState): CaptureStep[] {
    switch (documentType) {
      case 'passport':
        return [
          {
            type: 'passport',
            required: true,
            completed: flowState.hasPassport,
          },
        ];

      case 'civil_id':
        return [
          {
            type: 'civil_id',
            side: 'front',
            required: true,
            completed: flowState.hasCivilIdFront,
          },
          {
            type: 'civil_id',
            side: 'back',
            required: true,
            completed: flowState.hasCivilIdBack,
          },
        ];

      case 'army_card':
        return [
          {
            type: 'army_card',
            required: true,
            completed: flowState.hasArmyCard,
          },
        ];

      case 'residence_permit':
        return [
          {
            type: 'residence_permit',
            required: true,
            completed: flowState.hasResidencePermit,
          },
        ];

      default:
        return [];
    }
  }

  static getNextRequiredDocument(flowState: FlowState): DocumentType | null {
    if (flowState.hasPassport && flowState.isNonLebanesePassport && !flowState.hasResidencePermit) {
      return 'residence_permit';
    }

    if (flowState.hasCivilIdFront && !flowState.hasCivilIdBack) {
      return 'civil_id';
    }

    return null;
  }

  static isFlowComplete(documentType: DocumentType, flowState: FlowState): boolean {
    switch (documentType) {
      case 'passport':
        if (flowState.isNonLebanesePassport) {
          return flowState.hasPassport && flowState.hasResidencePermit;
        }
        return flowState.hasPassport;

      case 'civil_id':
        return flowState.hasCivilIdFront && flowState.hasCivilIdBack;

      case 'army_card':
        return flowState.hasArmyCard;

      case 'residence_permit':
        return flowState.hasResidencePermit;

      default:
        return false;
    }
  }

  static validateDocumentCapture(documentType: DocumentType, side?: string): boolean {
    if (documentType === 'civil_id') {
      return side === 'front' || side === 'back';
    }
    return true;
  }

  static getDocumentSides(documentType: DocumentType): string[] {
    switch (documentType) {
      case 'civil_id':
        return ['front', 'back'];
      default:
        return [];
    }
  }
}