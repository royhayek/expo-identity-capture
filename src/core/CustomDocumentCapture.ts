import { VerifiedDocType } from "../types/extraction";
import { Camera } from 'react-native-vision-camera';
import OpenCVDocumentDetection from './OpenCVDocumentDetection';
import GlobalCameraManager from './CameraManager';

/**
 * Custom Document Capture using OpenCV and Vision Camera
 * This module provides a custom document scanning solution with:
 * - Complete UI control (Cancel + Flash only)
 * - Single capture mode
 * - Real-time document detection
 * - Perspective correction
 * - OpenCV-based edge detection
 */

export interface CustomCaptureOptions {
  docHint: VerifiedDocType;
  enableFlash?: boolean;
  quality?: number; // 0-100
  maxRetries?: number;
}

export interface CustomCaptureResult {
  originalImageUri: string;
  processedImageUri: string;
  detectedCorners: { x: number; y: number }[];
  captureTimestamp: string;
}

export class CustomDocumentCapture {
  private static instance: CustomDocumentCapture;
  
  /**
   * Get singleton instance
   */
  public static getInstance(): CustomDocumentCapture {
    if (!CustomDocumentCapture.instance) {
      CustomDocumentCapture.instance = new CustomDocumentCapture();
    }
    return CustomDocumentCapture.instance;
  }

  /**
   * Start custom document capture with OpenCV-based detection
   */
  public async captureDocument(options: CustomCaptureOptions): Promise<CustomCaptureResult> {
    console.log(`📸 Starting custom document capture for ${options.docHint}...`);
    
    try {
      // Step 1: Initialize camera and UI
      await this.initializeCamera();
      
      // Step 2: Open camera view and wait for capture
      const captureResult = await this.openCameraView(options);
      
      // Step 3: Process captured image
      if (captureResult.cancelled) {
        throw new Error('Document capture cancelled by user');
      }
      
      console.log(`✅ Custom document capture completed`);
      return captureResult;
      
    } catch (error) {
      console.error(`❌ Custom document capture failed:`, error);
      throw error;
    }
  }

  /**
   * Initialize camera with Vision Camera
   */
  private async initializeCamera(): Promise<void> {
    console.log(`📱 Initializing camera...`);
    
    try {
      // Check camera permissions
      const cameraPermission = await Camera.getCameraPermissionStatus();
      
      if (cameraPermission !== 'granted') {
        console.log('📋 Requesting camera permission...');
        const newCameraPermission = await Camera.requestCameraPermission();
        
        if (newCameraPermission !== 'granted') {
          throw new Error('Camera permission denied');
        }
      }

      // OpenCV is automatically initialized with react-native-fast-opencv
      // Just log that we're ready to use it
      console.log('🔬 OpenCV ready for use (auto-initialized)');

      console.log('✅ Camera initialized successfully');
    } catch (error) {
      console.error('❌ Camera initialization failed:', error);
      throw new Error(`Failed to initialize camera: ${error.message}`);
    }
  }

  /**
   * Open camera view for document capture
   */
  private async openCameraView(options: CustomCaptureOptions): Promise<CustomCaptureResult & { cancelled?: boolean }> {
    console.log(`📱 Opening camera view for ${options.docHint}...`);
    
    try {
      // Use the global camera manager to show the camera
      const cameraManager = GlobalCameraManager.getInstance();
      const result = await cameraManager.showCamera(options.docHint);
      
      if (result.cancelled) {
        console.log('❌ Camera capture cancelled by user');
        return {
          originalImageUri: '',
          processedImageUri: '',
          detectedCorners: [],
          captureTimestamp: new Date().toISOString(),
          cancelled: true,
        };
      }
      
      console.log('✅ Photo captured successfully:', result.imageUri);
      
      // Process the captured image
      const processedResult: CustomCaptureResult = {
        originalImageUri: result.imageUri,
        processedImageUri: result.imageUri, // TODO: Apply OpenCV processing
        detectedCorners: [
          // TODO: Detect actual corners using OpenCV
          { x: 100, y: 150 },
          { x: 400, y: 150 },
          { x: 400, y: 550 },
          { x: 100, y: 550 }
        ],
        captureTimestamp: new Date().toISOString(),
      };
      
      return processedResult;
      
    } catch (error) {
      console.error('Camera view error:', error);
      throw error;
    }
  }


  /**
   * Check if detected corners are stable between frames
   */
  private areCornersStable(
    previous: { x: number; y: number }[] | null, 
    current: { x: number; y: number }[]
  ): boolean {
    if (!previous || previous.length !== current.length) {
      return false;
    }

    const STABILITY_THRESHOLD = 10; // pixels
    
    for (let i = 0; i < previous.length; i++) {
      const distance = Math.sqrt(
        Math.pow(previous[i].x - current[i].x, 2) + 
        Math.pow(previous[i].y - current[i].y, 2)
      );
      
      if (distance > STABILITY_THRESHOLD) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Process captured image with OpenCV
   */
  private async processWithOpenCV(captureData: any, options: CustomCaptureOptions): Promise<CustomCaptureResult> {
    console.log(`🔬 Processing with OpenCV...`);
    
    try {
      const startTime = Date.now();
      
      // For now, return the capture data as-is since we don't have real image files yet
      // In production, this would do actual OpenCV processing
      
      // TODO: Implement actual image capture and processing
      // Step 1: Create temporary file for original image (in real implementation)
      const originalImageUri = `file://temp/original_${Date.now()}.jpg`;
      
      // Step 2: Apply perspective correction using detected corners
      const processedImageUri = await this.applyPerspectiveCorrection(
        originalImageUri,
        captureData.corners,
        options.docHint
      );

      const processingTime = Date.now() - startTime;
      console.log(`✅ OpenCV processing completed in ${processingTime}ms`);

      return {
        originalImageUri,
        processedImageUri,
        detectedCorners: captureData.corners,
        captureTimestamp: captureData.captureTimestamp,
      };

    } catch (error) {
      console.error('❌ OpenCV processing failed:', error);
      
      // Re-throw to trigger fallback to regular scanner in DocumentExtractor
      throw error;
    }
  }

  /**
   * Detect document contours using OpenCV
   */
  private async detectDocumentContours(imageUri: string): Promise<{ x: number; y: number }[]> {
    console.log(`🔍 Detecting document contours in ${imageUri}...`);
    
    try {
      // Use OpenCV document detection module
      const frameBuffer = await this.loadImageAsBuffer(imageUri);
      const detectedDocument = await OpenCVDocumentDetection.processFrame(frameBuffer, 'civil_id');
      
      if (detectedDocument && detectedDocument.isValidShape) {
        console.log(`✅ Document contours detected with confidence ${detectedDocument.confidence}`);
        return detectedDocument.corners;
      } else {
        console.warn(`⚠️ No valid document contours found`);
        return [];
      }
      
    } catch (error) {
      console.error('❌ Contour detection failed:', error);
      return [];
    }
  }

  /**
   * Load image as buffer for OpenCV processing
   */
  private async loadImageAsBuffer(imageUri: string): Promise<ArrayBuffer> {
    // In real implementation, this would load the actual image file
    // For now, return a mock buffer
    console.log(`📂 Loading image buffer from ${imageUri}...`);
    return new ArrayBuffer(0);
  }

  /**
   * Apply perspective correction to document
   */
  private async applyPerspectiveCorrection(
    imageUri: string, 
    corners: { x: number; y: number }[],
    docType: VerifiedDocType
  ): Promise<string> {
    console.log(`🔄 Applying perspective correction for ${docType}...`);
    
    try {
      // Use OpenCV document detection module for perspective correction
      const processingResult = await OpenCVDocumentDetection.applyPerspectiveCorrection(
        imageUri,
        corners,
        docType
      );

      console.log(`✅ Perspective correction applied in ${processingResult.processingTime}ms`);
      return processingResult.processedImageUri;
      
    } catch (error) {
      console.error('❌ Perspective correction failed:', error);
      console.log('🔄 Falling back to original image...');
      return imageUri;
    }
  }

  /**
   * Validate document shape based on type
   */
  private validateDocumentShape(corners: { x: number; y: number }[], docType: VerifiedDocType): boolean {
    // Custom validation based on document type
    if (docType === 'passport') {
      // Expect vertical rectangle for opened passport
      return this.isVerticalRectangle(corners);
    } else {
      // Expect horizontal rectangle for other documents
      return this.isHorizontalRectangle(corners);
    }
  }

  /**
   * Check if detected shape is a vertical rectangle
   */
  private isVerticalRectangle(corners: { x: number; y: number }[]): boolean {
    if (corners.length !== 4) return false;
    
    // Calculate aspect ratio
    const width = Math.max(...corners.map(c => c.x)) - Math.min(...corners.map(c => c.x));
    const height = Math.max(...corners.map(c => c.y)) - Math.min(...corners.map(c => c.y));
    const aspectRatio = width / height;
    
    // Vertical rectangle should have aspect ratio < 1.0
    return aspectRatio >= 0.5 && aspectRatio <= 0.8;
  }

  /**
   * Check if detected shape is a horizontal rectangle
   */
  private isHorizontalRectangle(corners: { x: number; y: number }[]): boolean {
    if (corners.length !== 4) return false;
    
    // Calculate aspect ratio
    const width = Math.max(...corners.map(c => c.x)) - Math.min(...corners.map(c => c.x));
    const height = Math.max(...corners.map(c => c.y)) - Math.min(...corners.map(c => c.y));
    const aspectRatio = width / height;
    
    // Horizontal rectangle should have aspect ratio > 1.0
    return aspectRatio >= 1.2 && aspectRatio <= 2.0;
  }
}

export default CustomDocumentCapture;