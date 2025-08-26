/**
 * OpenCV Document Detection Module
 * Handles real-time document detection, edge detection, and perspective correction
 * This module serves as a bridge to OpenCV functionality when available
 */

import { VerifiedDocType } from "../types/extraction";

export interface DetectedDocument {
  corners: { x: number; y: number }[];
  confidence: number;
  area: number;
  aspectRatio: number;
  isValidShape: boolean;
}

export interface ProcessingResult {
  originalImageUri: string;
  processedImageUri: string;
  detectedDocument: DetectedDocument;
  processingTime: number;
}

export class OpenCVDocumentDetection {
  private static readonly MIN_CONTOUR_AREA = 10000;
  private static readonly APPROX_POLY_EPSILON = 0.02;
  private static readonly CANNY_THRESHOLD_1 = 50;
  private static readonly CANNY_THRESHOLD_2 = 150;

  /**
   * Process camera frame for real-time document detection
   * Note: This will use native OpenCV when react-native-fast-opencv is properly configured
   * Currently falls back to JS implementation in DocumentDetectionProcessor
   */
  static async processFrame(imageBuffer: ArrayBuffer, docType: VerifiedDocType): Promise<DetectedDocument | null> {
    try {
      const startTime = Date.now();
      
      // TODO: Integrate with react-native-fast-opencv when native module is configured
      // The JS implementation in DocumentDetectionProcessor provides real edge detection
      
      const processingTime = Date.now() - startTime;
      if (processingTime > 0) {
        console.log(`📊 OpenCV bridge checked in ${processingTime}ms`);
      }

      // Return null to use the JS implementation
      return null;

    } catch (error) {
      console.error('❌ OpenCV processing failed:', error);
      return null;
    }
  }

  /**
   * Apply perspective correction to captured image
   */
  static async applyPerspectiveCorrection(
    imageUri: string,
    corners: { x: number; y: number }[],
    docType: VerifiedDocType
  ): Promise<ProcessingResult> {
    try {
      const startTime = Date.now();
      console.log(`🔬 Applying perspective correction for ${docType}...`);

      // Calculate target dimensions based on document type
      const targetDimensions = this.getTargetDimensions(corners, docType);

      // TODO: Implement actual perspective correction with OpenCV
      // For now, return the original image with detection metadata
      
      const result: ProcessingResult = {
        originalImageUri: imageUri,
        processedImageUri: imageUri, // Will be corrected image when OpenCV is integrated
        detectedDocument: {
          corners,
          confidence: 0.9,
          area: this.calculateArea(corners),
          aspectRatio: targetDimensions.width / targetDimensions.height,
          isValidShape: true
        },
        processingTime: Date.now() - startTime
      };

      console.log(`✅ Perspective correction metadata prepared in ${result.processingTime}ms`);
      return result;

    } catch (error) {
      console.error('❌ Perspective correction failed:', error);
      throw new Error(`Failed to apply perspective correction: ${error.message}`);
    }
  }

  /**
   * Calculate target dimensions for perspective correction
   */
  private static getTargetDimensions(
    corners: { x: number; y: number }[], 
    docType: VerifiedDocType
  ): { width: number; height: number } {
    // Calculate current dimensions
    const width1 = this.calculateDistance(corners[0], corners[1]);
    const width2 = this.calculateDistance(corners[2], corners[3]);
    const height1 = this.calculateDistance(corners[0], corners[3]);
    const height2 = this.calculateDistance(corners[1], corners[2]);

    const avgWidth = (width1 + width2) / 2;
    const avgHeight = (height1 + height2) / 2;

    // Adjust dimensions based on document type
    if (docType === 'passport') {
      // Passport should be vertical (taller than wide)
      if (avgWidth > avgHeight) {
        // Swap dimensions to ensure vertical orientation
        return { width: avgHeight, height: avgWidth };
      }
      return { width: avgWidth, height: avgHeight };
    } else {
      // Other documents should be horizontal (wider than tall)
      if (avgHeight > avgWidth) {
        // Swap dimensions to ensure horizontal orientation
        return { width: avgHeight, height: avgWidth };
      }
      return { width: avgWidth, height: avgHeight };
    }
  }

  /**
   * Calculate distance between two points
   */
  private static calculateDistance(
    point1: { x: number; y: number }, 
    point2: { x: number; y: number }
  ): number {
    const dx = point2.x - point1.x;
    const dy = point2.y - point1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Calculate area of polygon defined by corners
   */
  private static calculateArea(corners: { x: number; y: number }[]): number {
    if (corners.length !== 4) return 0;
    
    // Shoelace formula for polygon area
    let area = 0;
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      area += corners[i].x * corners[j].y;
      area -= corners[j].x * corners[i].y;
    }
    return Math.abs(area) / 2;
  }

  /**
   * Validate document shape based on type and aspect ratio
   */
  static validateDocumentShape(
    corners: { x: number; y: number }[], 
    docType: VerifiedDocType
  ): boolean {
    if (corners.length !== 4) return false;

    const dimensions = this.getTargetDimensions(corners, docType);
    const aspectRatio = dimensions.width / dimensions.height;

    if (docType === 'passport') {
      // Passport: expect vertical rectangle (aspect ratio < 1.0)
      return aspectRatio >= 0.5 && aspectRatio <= 0.8;
    } else {
      // Other documents: expect horizontal rectangle (aspect ratio > 1.0)
      return aspectRatio >= 1.2 && aspectRatio <= 2.0;
    }
  }
}

export default OpenCVDocumentDetection;