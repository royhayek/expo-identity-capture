# expo-identity-capture

**The Complete Identity Verification Solution for React Native & Expo**

A comprehensive, production-ready package for capturing and extracting data from identity documents and selfies in Expo apps. Built with advanced computer vision, OCR, and customizable UI components.

---

## 🚀 Quick Start

```bash
# Install the package
npm install expo-identity-capture

# Install peer dependencies
npx expo install expo-camera expo-file-system expo-image-manipulator react-native-svg react-native-worklets react-native-nitro-modules
npm install react-native-vision-camera react-native-vision-camera-worklets react-native-nitro-image react-native-fast-opencv react-native-document-scanner-plugin

# Basic usage
import { IdentityCapture, IdentityCaptureProvider } from 'expo-identity-capture';

// Wrap your app
<IdentityCaptureProvider>
  <YourApp />
</IdentityCaptureProvider>

// Capture documents with extraction
const result = await IdentityCapture.captureAndExtract({
  docHint: 'passport',
  enableQualityCheck: true
});
```

---

## 📋 Table of Contents

1. [Features & Capabilities](#-features--capabilities)
2. [Installation & Setup](#️-installation--setup)
3. [Configuration System](#️-configuration-system)
4. [API Reference](#-api-reference)
5. [Document Capture & Extraction](#-document-capture--extraction)
6. [Selfie Capture](#-selfie-capture)
7. [Custom Camera Integration](#-custom-camera-integration)
8. [Localization System](#-localization-system)
9. [Theming & Customization](#-theming--customization)
10. [Advanced Usage](#-advanced-usage)
11. [Performance Optimization](#⚡-performance-optimization)
12. [Troubleshooting](#-troubleshooting)

---

## 🎯 Features & Capabilities

### 📄 Document Support
- **Passports** - Full MRZ extraction, photo detection
- **Civil IDs** - Front/back capture with field extraction
- **Army Cards** - Military identification processing  
- **Residence Permits** - Immigration document handling
- **Civil Registers** - Birth certificate processing

### 🧠 Intelligence Features
- **OCR Text Extraction** - ML Kit powered text recognition
- **Document Detection** - Automatic document type identification
- **Quality Assessment** - Blur, glare, and brightness analysis
- **Field Validation** - Smart validation of extracted data
- **Flow Management** - Automatic multi-sided capture flows

### 📱 User Experience
- **Native Camera UI** - Custom camera with document frame guides
- **Real-time Feedback** - Live document detection indicators
- **Multi-language Support** - English, Arabic, French built-in
- **Accessibility** - Full accessibility support
- **Responsive Design** - Adaptive layouts for all screen sizes

### 🔧 Technical Features
- **TypeScript** - Full type safety and IntelliSense support
- **Expo Compatible** - Works with Expo managed and bare workflows
- **Performance Optimized** - Efficient image processing and memory management
- **Configurable** - Extensive configuration options for all aspects
- **Extensible** - Plugin architecture for custom implementations

---

## ⚙️ Installation & Setup

### Step 1: Install Core Package

```bash
npm install expo-identity-capture
```

### Step 2: Install Peer Dependencies

Version 2 targets the New Architecture only: Expo SDK 57+, React Native 0.85+, React 19.2+.

```bash
# Expo modules (versions matched to your SDK)
npx expo install expo-camera expo-file-system expo-image-manipulator react-native-svg

# Worklets and Nitro (already present if you use Reanimated 4 / other Nitro modules)
npx expo install react-native-worklets react-native-nitro-modules

# Camera, frame processing and document scanning
npm install react-native-vision-camera react-native-vision-camera-worklets react-native-nitro-image \
  react-native-fast-opencv react-native-document-scanner-plugin
```

| Peer | Version |
| --- | --- |
| `react-native-vision-camera`, `react-native-vision-camera-worklets` | `>=5.2.4` |
| `react-native-nitro-modules` / `react-native-nitro-image` | `>=0.37.0` / `>=0.15.2` |
| `react-native-worklets` | `>=0.10.0` |
| `react-native-fast-opencv` | `>=1.0.1` |
| `react-native-document-scanner-plugin` | `>=2.0.4` |

`babel-preset-expo` adds the `react-native-worklets` Babel plugin on its own when the package is installed; outside
Expo, add `react-native-worklets/plugin` to your Babel config.

#### Upgrading from 1.x

- `react-native-worklets-core` and `vision-camera-resize-plugin` are no longer used: remove them (two worklet runtimes
  in one app conflict). Frame processing runs on VisionCamera 5's `useFrameOutput` and `react-native-worklets`.
- `react-native-fast-opencv` moved from a dependency to a peer, at 1.x (its object API replaced `createObject`/`invoke`).
- `DocumentScanner` is now the plugin's default export: call `DocumentScanner.scanDocument(...)` directly.
- `LivenessDetection` is unchanged; `scoreLiveness(buffer, width, height)` is the same check as a plain worklet.

### Step 3: Configure Expo Project

Add to your `app.json` or `app.config.js`:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-camera",
        {
          "cameraPermission": "This app uses the camera to capture identity documents and selfies for verification purposes."
        }
      ]
    ],
    "ios": {
      "infoPlist": {
        "NSCameraUsageDescription": "Camera access is required to capture identity documents and selfies for verification."
      }
    },
    "android": {
      "permissions": ["android.permission.CAMERA"]
    }
  }
}
```

### Step 4: Prebuild Your App

```bash
npx expo prebuild --clean
```

### Step 5: Platform-Specific Setup

#### iOS Setup
```bash
cd ios && pod install && cd ..
```

#### Android Setup
No additional setup required. Permissions are handled automatically.

---

## 📷 Embeddable Live Cameras (2.2+)

Two views draw **only the camera and its overlay**; your app lays out the screen around them (header, titles,
status text, buttons) and follows their state.

### `DocumentScanView`

The back camera in a rounded viewport, a frame guide for an ID-1 card or an upright passport page with the outside
dimmed, OpenCV edge detection, and a photo taken on its own once the document holds still, cropped to the guide.

```tsx
const scanRef = useRef<DocumentScanViewRef>(null);

<DocumentScanView
  ref={scanRef}
  docType="civil_id"                // 'passport' frames an upright page
  style={{ width: 362, height: 400 }}
  accentColor="#55D4C9"             // the guide once found
  onStatusChange={setStatus}        // 'starting' | 'searching' | 'found' | 'capturing'
  onCapture={({ uri, originalUri }) => upload(uri)}
  onError={({ code }) => {}}        // 'PERMISSION_DENIED' | 'NO_CAMERA' | 'CAPTURE_FAILED'
/>
<Button title="Take photo" onPress={() => scanRef.current?.capture()} />
```

### `SelfieLivenessView`

The front camera in a circle ringed by bars, a head-turn challenge (left, right, up in a shuffled order; ML Kit face
angles via `react-native-vision-camera-face-detector`), then a photo taken on its own once the face is back in front
of the camera. The photo goes through the passive check (`scoreLiveness`: a printed photo or a screen) before it is
handed back; under `livenessThreshold` the state becomes `notLive` and `restart()` starts over.

```tsx
<SelfieLivenessView
  ref={livenessRef}
  style={{ width: 362 }}
  colors={{ idle: '#D4D9E6', active: '#55D4C9', done: '#3DB8AF', error: '#E65359', warning: '#F3B44A' }}
  onStateChange={setState}          // { phase, direction, steps, completed, progress }
  onCapture={({ uri, livenessScore }) => upload(uri)}
/>
```

The challenge itself (`advanceChallenge`, `startChallenge`) is a pure state machine you can test and tune
(`challenge={{ yawThreshold: 25, pitchThreshold: 15, yawSign: 1 }}`). **Check `yawSign` on a device**: it decides
which way ML Kit's yaw counts as the customer's left on the mirrored preview.

Both need the camera permission granted before they mount. The passive check is a heuristic, not certified
presentation-attack detection.

## 🛠️ Configuration System

The package uses a powerful configuration system that allows you to customize every aspect of the capture experience.

### Basic Configuration

```tsx
import { IdentityCaptureProvider, IdentityCaptureConfig } from 'expo-identity-capture';

const config: IdentityCaptureConfig = {
  theme: {
    colors: {
      primary: '#007AFF',
      secondary: '#34C759',
      danger: '#FF3B30'
    }
  },
  localization: {
    language: 'en'
  },
  behavior: {
    detection: {
      ocr: {
        timeout: 5000,
        minTextLength: 10
      }
    }
  }
};

function App() {
  return (
    <IdentityCaptureProvider config={config}>
      <YourAppContent />
    </IdentityCaptureProvider>
  );
}
```

### Complete Configuration Interface

```tsx
interface IdentityCaptureConfig {
  theme?: {
    colors?: {
      primary?: string;           // Default: '#007AFF'
      secondary?: string;         // Default: '#34C759'
      danger?: string;           // Default: '#FF3B30'
      warning?: string;          // Default: '#FF9500'
      background?: string;       // Default: '#000000'
      surface?: string;          // Default: '#FFFFFF'
      overlay?: string;          // Default: 'rgba(0, 0, 0, 0.6)'
      text?: {
        primary?: string;        // Default: '#333333'
        secondary?: string;      // Default: '#666666'
        disabled?: string;       // Default: '#999999'
        inverse?: string;        // Default: '#FFFFFF'
      };
      border?: {
        default?: string;        // Default: '#FFFFFF'
        detected?: string;       // Default: '#4CAF50'
        frame?: string;         // Default: '#FFFFFF'
      };
      progress?: {
        gradient?: string[];     // Default: ['#4CAF50', '#2196F3', '#9C27B0']
        background?: string;     // Default: 'rgba(255,255,255,0.3)'
      };
    };
    typography?: {
      fonts?: {
        regular?: string;        // Default: 'System'
        medium?: string;         // Default: 'System'
        semibold?: string;       // Default: 'System'
        bold?: string;          // Default: 'System'
      };
      sizes?: {
        xs?: number;            // Default: 12
        sm?: number;            // Default: 14
        base?: number;          // Default: 16
        lg?: number;            // Default: 18
        xl?: number;            // Default: 24
        xxl?: number;           // Default: 28
      };
    };
    layout?: {
      frame?: {
        passport?: { top?: string; left?: string; right?: string; height?: string; };
        civil_id?: { top?: string; left?: string; right?: string; height?: string; };
        army_card?: { top?: string; left?: string; right?: string; height?: string; };
        residence_permit?: { top?: string; left?: string; right?: string; height?: string; };
        civil_register?: { top?: string; left?: string; right?: string; height?: string; };
      };
      borderRadius?: number;     // Default: 16
      buttons?: {
        capture?: { width?: number; height?: number }; // Default: 70x70
        header?: { width?: number; height?: number };  // Default: 60x60
      };
      spacing?: {
        xs?: number;            // Default: 4
        sm?: number;            // Default: 8
        md?: number;            // Default: 16
        lg?: number;            // Default: 24
        xl?: number;            // Default: 32
      };
    };
    animation?: {
      progress?: {
        duration?: number;       // Default: 1500ms
        easing?: 'linear' | 'ease' | 'easeIn' | 'easeOut' | 'easeInOut';
      };
      modal?: {
        type?: 'slide' | 'fade' | 'none'; // Default: 'slide'
        duration?: number;       // Default: 300ms
      };
    };
  };
  
  localization?: {
    language?: 'en' | 'ar' | 'fr' | string; // Default: 'en'
    customStrings?: {
      [language: string]: {
        documentLabels?: {
          passport?: string;
          civil_id?: string;
          army_card?: string;
          residence_permit?: string;
          civil_register?: string;
        };
        instructions?: {
          passport?: string;
          civil_id?: string;
          army_card?: string;
          residence_permit?: string;
          civil_register?: string;
        };
        alerts?: {
          captureSuccess?: string;
          captureFailed?: string;
          ocrValidationFailed?: string;
          processingTimeout?: string;
          cameraPermissionDenied?: string;
          cameraNotAvailable?: string;
        };
        ui?: {
          capture?: string;
          retake?: string;
          cancel?: string;
          done?: string;
          loading?: string;
          error?: string;
          flashOn?: string;
          flashOff?: string;
        };
      };
    };
  };
  
  behavior?: {
    detection?: {
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
      };
    };
    camera?: {
      defaultDevice?: 'front' | 'back';     // Default: 'back'
      flash?: {
        enabled?: boolean;                   // Default: true
        default?: 'on' | 'off' | 'auto';   // Default: 'off'
      };
      photo?: {
        quality?: number;                    // Default: 0.8
        format?: 'jpeg' | 'png';            // Default: 'jpeg'
      };
    };
    imageProcessing?: {
      quality?: number;              // Default: 0.8
      maxDimensions?: {
        width?: number;              // Default: 1920
        height?: number;             // Default: 1080
      };
      format?: 'jpeg' | 'png';      // Default: 'jpeg'
      output?: 'uri' | 'base64';    // Default: 'uri'
    };
  };
}
```

### Dynamic Configuration Updates

```tsx
import { useConfig } from 'expo-identity-capture';

function MyComponent() {
  const { updateConfig } = useConfig();
  
  const switchToArabic = () => {
    updateConfig({
      localization: {
        language: 'ar'
      }
    });
  };
  
  const enableDarkMode = () => {
    updateConfig({
      theme: {
        colors: {
          primary: '#0A84FF',
          background: '#1C1C1E',
          surface: '#2C2C2E'
        }
      }
    });
  };
}
```

---

## 📚 API Reference

### Main API Object

```tsx
import { IdentityCapture } from 'expo-identity-capture';

// Available methods
IdentityCapture.captureAndExtract(options)      // Document capture with OCR
IdentityCapture.captureMultipleDocuments(type, options) // Multi-sided capture
IdentityCapture.detectDocumentType(imageUri)    // Document type detection
IdentityCapture.validateExtractedData(result)   // Data validation
IdentityCapture.captureSelfie(options)          // Selfie capture
```

### Document Capture & Extraction

#### captureAndExtract(options)

The primary method for capturing documents with automatic text extraction.

```tsx
interface CaptureOptions {
  docHint?: 'passport' | 'civil_id' | 'army_card' | 'residence_permit' | 'civil_register';
  enableQualityCheck?: boolean;        // Default: true
  confidenceThreshold?: number;        // Default: 0.7
  saveProcessedImages?: boolean;       // Default: true
  useCustomCapture?: boolean;          // Default: false
  enableFlash?: boolean;              // Default: true
}

interface ExtractedIdResult {
  docType: 'passport' | 'civil_id' | 'army_card' | 'residence_permit' | 'civil_register';
  originalImageUri: string;
  processedImageUri: string;
  crops?: Record<string, string>;     // Field crops
  fields: {
    documentNumber?: { value: string | null; confidence: number; source: 'mrz' | 'ocr' | 'derived' };
    fullNameArabic?: { value: string | null; confidence: number; source: 'mrz' | 'ocr' | 'derived' };
    fullNameLatin?: { value: string | null; confidence: number; source: 'mrz' | 'ocr' | 'derived' };
    givenNames?: { value: string | null; confidence: number; source: 'mrz' | 'ocr' | 'derived' };
    surname?: { value: string | null; confidence: number; source: 'mrz' | 'ocr' | 'derived' };
    dateOfBirth?: { value: string | null; confidence: number; source: 'mrz' | 'ocr' | 'derived' };
    sex?: { value: string | null; confidence: number; source: 'mrz' | 'ocr' | 'derived' };
    nationality?: { value: string | null; confidence: number; source: 'mrz' | 'ocr' | 'derived' };
    placeOfBirth?: { value: string | null; confidence: number; source: 'mrz' | 'ocr' | 'derived' };
    dateOfIssue?: { value: string | null; confidence: number; source: 'mrz' | 'ocr' | 'derived' };
    dateOfExpiry?: { value: string | null; confidence: number; source: 'mrz' | 'ocr' | 'derived' };
    motherName?: { value: string | null; confidence: number; source: 'mrz' | 'ocr' | 'derived' };
    fatherName?: { value: string | null; confidence: number; source: 'mrz' | 'ocr' | 'derived' };
  };
  mrz?: {
    raw: string;
    type: 'TD1' | 'TD2' | 'TD3';
    checks: { 
      documentNumber: boolean; 
      dob: boolean; 
      expiry: boolean; 
      composite: boolean; 
    };
  };
  quality: {
    blurScore: number;
    brightness: number;
    glareDetected: boolean;
  };
}

// Usage examples
const result = await IdentityCapture.captureAndExtract({
  docHint: 'passport',
  enableQualityCheck: true,
  confidenceThreshold: 0.8
});

console.log('Document type:', result.docType);
console.log('Document number:', result.fields.documentNumber?.value);
console.log('Full name:', result.fields.fullNameLatin?.value);
console.log('Date of birth:', result.fields.dateOfBirth?.value);
console.log('Quality score:', result.quality.blurScore);
```

#### captureMultipleDocuments(docType, options)

For capturing multiple sides of a document (e.g., front and back of civil ID).

```tsx
const results = await IdentityCapture.captureMultipleDocuments('civil_id', {
  enableQualityCheck: true
});

// results is an array of ExtractedIdResult
console.log(`Captured ${results.length} sides`);
results.forEach((result, index) => {
  console.log(`Side ${index + 1}:`, result.fields.documentNumber?.value);
});
```

#### detectDocumentType(imageUri)

Detect document type from an existing image.

```tsx
const docType = await IdentityCapture.detectDocumentType('file:///path/to/image.jpg');
console.log('Detected document type:', docType); // 'passport' | 'civil_id' | etc.
```

#### validateExtractedData(result)

Validate extracted document data.

```tsx
const validation = IdentityCapture.validateExtractedData(result);
console.log('Is valid:', validation.isValid);
console.log('Issues:', validation.issues);
console.log('Confidence:', validation.confidence);
```

### Selfie Capture

#### captureSelfie(options)

Capture selfies with front camera.

```tsx
interface SelfieCaptureOptions {
  output?: 'uri' | 'base64';
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  onSuccess?: (result: SelfieCaptureResult) => void;
  onCancel?: () => void;
  onError?: (error: Error) => void;
}

interface SelfieCaptureResult {
  image: string;      // URI or base64
  capturedAt: string; // ISO timestamp
}

// Usage
const result = await IdentityCapture.captureSelfie({
  quality: 0.8,
  maxWidth: 800,
  maxHeight: 800,
  output: 'uri'
});

console.log('Selfie captured:', result.image);
```

---

## 📄 Document Capture & Extraction

### Supported Document Types

| Document Type | Description | Sides | MRZ Support | OCR Fields |
|---------------|-------------|-------|-------------|------------|
| `passport` | International passport | Single | ✅ Full MRZ | 15+ fields |
| `civil_id` | National ID card | Front + Back | ❌ No MRZ | 12+ fields |
| `army_card` | Military identification | Single | ❌ No MRZ | 8+ fields |
| `residence_permit` | Immigration permit | Single | ✅ Partial MRZ | 10+ fields |
| `civil_register` | Birth certificate | Single | ❌ No MRZ | 6+ fields |

### Document Flow Examples

#### Single Document Capture

```tsx
import { IdentityCapture } from 'expo-identity-capture';

// Passport capture with full extraction
const capturePassport = async () => {
  try {
    const result = await IdentityCapture.captureAndExtract({
      docHint: 'passport',
      enableQualityCheck: true,
      confidenceThreshold: 0.8
    });

    // Access extracted fields
    const documentNumber = result.fields.documentNumber?.value;
    const fullName = result.fields.fullNameLatin?.value;
    const nationality = result.fields.nationality?.value;
    const expiryDate = result.fields.dateOfExpiry?.value;

    // Access MRZ data if available
    if (result.mrz) {
      console.log('MRZ Type:', result.mrz.type);
      console.log('MRZ Raw:', result.mrz.raw);
      console.log('MRZ Checks:', result.mrz.checks);
    }

    // Access quality metrics
    console.log('Image quality:', result.quality.blurScore);
    console.log('Brightness:', result.quality.brightness);
    console.log('Glare detected:', result.quality.glareDetected);

  } catch (error) {
    console.error('Capture failed:', error.message);
  }
};
```

#### Multi-Side Document Capture

```tsx
// Civil ID capture (front and back automatically)
const captureCivilId = async () => {
  try {
    const results = await IdentityCapture.captureMultipleDocuments('civil_id', {
      enableQualityCheck: true,
      saveProcessedImages: true
    });

    // Process front side (first result)
    const frontSide = results[0];
    const documentNumber = frontSide.fields.documentNumber?.value;
    const fullName = frontSide.fields.fullNameArabic?.value;

    // Process back side (second result)
    const backSide = results[1];
    const fatherName = backSide.fields.fatherName?.value;
    const motherName = backSide.fields.motherName?.value;

    console.log('Front side data:', { documentNumber, fullName });
    console.log('Back side data:', { fatherName, motherName });

  } catch (error) {
    if (error.message.includes('cancelled')) {
      console.log('User cancelled the capture process');
    } else {
      console.error('Multi-capture failed:', error);
    }
  }
};
```

### Quality Assessment

The package automatically assesses image quality and provides metrics:

```tsx
const result = await IdentityCapture.captureAndExtract({
  docHint: 'passport',
  enableQualityCheck: true
});

const quality = result.quality;

// Blur assessment (0-1, higher is better)
if (quality.blurScore < 0.5) {
  console.warn('Image might be blurry');
}

// Brightness assessment (0-1, 0.3-0.7 is optimal)
if (quality.brightness < 0.2 || quality.brightness > 0.8) {
  console.warn('Image has poor lighting');
}

// Glare detection
if (quality.glareDetected) {
  console.warn('Glare detected on document');
}
```

### Field Confidence Scoring

Each extracted field includes a confidence score:

```tsx
const result = await IdentityCapture.captureAndExtract({ docHint: 'passport' });

Object.entries(result.fields).forEach(([fieldName, field]) => {
  if (field && field.value) {
    console.log(`${fieldName}: ${field.value} (${Math.round(field.confidence * 100)}% confidence)`);
    
    // Handle low confidence fields
    if (field.confidence < 0.7) {
      console.warn(`Low confidence for ${fieldName}, manual review recommended`);
    }
  }
});
```

---

## 🤳 Selfie Capture

### Basic Selfie Capture

```tsx
import { IdentityCapture } from 'expo-identity-capture';

const captureSelfie = async () => {
  try {
    const result = await IdentityCapture.captureSelfie({
      quality: 0.8,
      maxWidth: 800,
      maxHeight: 800,
      output: 'uri'
    });

    console.log('Selfie captured:', result.image);
    console.log('Captured at:', new Date(result.capturedAt).toLocaleString());

    // Use the selfie
    setUserSelfie(result.image);

  } catch (error) {
    if (error.message.includes('cancelled')) {
      console.log('User cancelled selfie capture');
    } else {
      console.error('Selfie capture failed:', error);
    }
  }
};
```

### Selfie with Callbacks

```tsx
const captureSelfieWithCallbacks = () => {
  IdentityCapture.captureSelfie({
    quality: 0.9,
    output: 'base64',
    onSuccess: (result) => {
      console.log('Selfie captured successfully!');
      uploadSelfie(result.image);
    },
    onCancel: () => {
      console.log('User cancelled selfie capture');
      showMessage('Selfie capture cancelled');
    },
    onError: (error) => {
      console.error('Selfie capture error:', error);
      showErrorMessage('Failed to capture selfie');
    }
  });
};
```

---

## 📱 Custom Camera Integration

The package provides custom camera components for advanced integration scenarios.

### CameraManager Component

```tsx
import { CameraManager } from 'expo-identity-capture';
import { useState } from 'react';

function MyCustomCapture() {
  const [showCamera, setShowCamera] = useState(false);
  const [docType, setDocType] = useState('passport');

  const handleCapture = (imageUri: string) => {
    console.log('Captured image:', imageUri);
    setShowCamera(false);
    // Process the captured image
    processImage(imageUri);
  };

  const handleCancel = () => {
    setShowCamera(false);
    console.log('Camera cancelled');
  };

  return (
    <View>
      <Button title="Open Camera" onPress={() => setShowCamera(true)} />
      
      <CameraManager
        visible={showCamera}
        docType={docType}
        onCapture={handleCapture}
        onCancel={handleCancel}
        disableDetection={false}  // Enable document detection
        enableFlash={true}        // Show flash toggle
      />
    </View>
  );
}
```

### SelfieManager Component

```tsx
import { SelfieManager } from 'expo-identity-capture';

function MyCustomSelfie() {
  const [showSelfie, setShowSelfie] = useState(false);

  const handleSelfieCapture = (imageUri: string) => {
    console.log('Selfie captured:', imageUri);
    setShowSelfie(false);
    processSelfie(imageUri);
  };

  return (
    <View>
      <Button title="Take Selfie" onPress={() => setShowSelfie(true)} />
      
      <SelfieManager
        visible={showSelfie}
        onCapture={handleSelfieCapture}
        onCancel={() => setShowSelfie(false)}
        enableFlash={false}  // Disable flash for selfies
      />
    </View>
  );
}
```

### CustomCameraView Component

For embedding camera directly in your UI:

```tsx
import { CustomCameraView } from 'expo-identity-capture';

function EmbeddedCamera() {
  const handleCapture = (imageUri: string) => {
    console.log('Document captured:', imageUri);
  };

  return (
    <View style={{ flex: 1 }}>
      <Text>Position your document in the frame</Text>
      
      <CustomCameraView
        docType="passport"
        onCapture={handleCapture}
        disableDetection={false}
        enableFlash={true}
        style={{ flex: 1, borderRadius: 12 }}
      />
    </View>
  );
}
```

---

## 🌍 Localization System

### Built-in Languages

The package comes with built-in support for English, Arabic, and French.

```tsx
import { IdentityCapture, arabicStrings, frenchStrings } from 'expo-identity-capture';

// Use Arabic localization
const resultAr = await IdentityCapture.captureAndExtract({
  docHint: 'civil_id',
  // Arabic strings automatically applied when language is 'ar' in config
});

// Override with specific language strings
const resultFr = await IdentityCapture.captureSelfie({
  // French strings automatically applied when language is 'fr' in config
});
```

### Custom Localization

```tsx
const customConfig: IdentityCaptureConfig = {
  localization: {
    language: 'es', // Spanish
    customStrings: {
      es: {
        documentLabels: {
          passport: 'Pasaporte',
          civil_id: 'Cédula de Identidad',
          army_card: 'Tarjeta Militar',
          residence_permit: 'Permiso de Residencia',
          civil_register: 'Registro Civil'
        },
        instructions: {
          passport: 'Coloca tu pasaporte dentro del marco y asegúrate de que todo el texto sea claramente visible.',
          civil_id: 'Coloca tu cédula dentro del marco. Primero capturaremos el frente.',
          army_card: 'Coloca tu tarjeta militar dentro del marco.',
          residence_permit: 'Coloca tu permiso de residencia dentro del marco.',
          civil_register: 'Coloca tu registro civil dentro del marco.'
        },
        alerts: {
          captureSuccess: '¡Documento capturado exitosamente!',
          captureFailed: 'Error al capturar el documento. Por favor, inténtalo de nuevo.',
          ocrValidationFailed: 'No se pudo validar el texto del documento. Asegúrate de que el documento sea claramente visible.',
          processingTimeout: 'El procesamiento tardó demasiado tiempo. Por favor, inténtalo de nuevo.',
          cameraPermissionDenied: 'Se requiere permiso de cámara para capturar documentos.',
          cameraNotAvailable: 'La cámara no está disponible en este dispositivo.'
        },
        ui: {
          capture: 'Capturar',
          retake: 'Volver a tomar',
          cancel: 'Cancelar',
          done: 'Hecho',
          loading: 'Cargando...',
          error: 'Error',
          flashOn: 'Flash activado',
          flashOff: 'Flash desactivado'
        }
      }
    }
  }
};
```

### Dynamic Language Switching

```tsx
import { useConfig } from 'expo-identity-capture';

function LanguageSelector() {
  const { updateConfig } = useConfig();

  const switchLanguage = (language: string) => {
    updateConfig({
      localization: {
        language
      }
    });
  };

  return (
    <View>
      <Button title="English" onPress={() => switchLanguage('en')} />
      <Button title="العربية" onPress={() => switchLanguage('ar')} />
      <Button title="Français" onPress={() => switchLanguage('fr')} />
    </View>
  );
}
```

### Accessing Localized Strings

```tsx
import { useLocalizedStrings } from 'expo-identity-capture';

function MyComponent() {
  const { getDocumentLabel, getInstructionText, getAlertMessage, getUIText } = useLocalizedStrings();

  const documentLabel = getDocumentLabel('passport');
  const instruction = getInstructionText('passport');
  const successMessage = getAlertMessage('captureSuccess');
  const captureText = getUIText('capture');

  return (
    <View>
      <Text>{documentLabel}</Text>
      <Text>{instruction}</Text>
      <Button title={captureText} onPress={handleCapture} />
    </View>
  );
}
```

---

## 🎨 Theming & Customization

### Color Theming

```tsx
const darkThemeConfig: IdentityCaptureConfig = {
  theme: {
    colors: {
      primary: '#0A84FF',      // iOS blue for dark mode
      secondary: '#32D74B',    // iOS green for dark mode
      danger: '#FF453A',       // iOS red for dark mode
      warning: '#FF9F0A',      // iOS orange for dark mode
      background: '#000000',   // Black background
      surface: '#1C1C1E',      // Dark surface
      overlay: 'rgba(0, 0, 0, 0.8)', // Darker overlay
      text: {
        primary: '#FFFFFF',    // White text
        secondary: '#AEAEB2',  // Light gray text
        disabled: '#636366',   // Disabled text
        inverse: '#000000'     // Black text on light backgrounds
      },
      border: {
        default: '#FFFFFF',    // White borders
        detected: '#32D74B',   // Green when document detected
        frame: '#FFFFFF'       // White frame outline
      },
      progress: {
        gradient: ['#32D74B', '#007AFF', '#AF52DE'], // Green to blue to purple
        background: 'rgba(255,255,255,0.2)'
      }
    }
  }
};
```

### Typography Customization

```tsx
const customTypographyConfig: IdentityCaptureConfig = {
  theme: {
    typography: {
      fonts: {
        regular: 'Inter-Regular',
        medium: 'Inter-Medium',
        semibold: 'Inter-SemiBold',
        bold: 'Inter-Bold'
      },
      sizes: {
        xs: 11,    // Small text
        sm: 13,    // Secondary text
        base: 16,  // Body text
        lg: 19,    // Headers
        xl: 24,    // Large headers
        xxl: 32    // Title text
      },
      weights: {
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700'
      }
    }
  }
};
```

### Layout Customization

```tsx
const customLayoutConfig: IdentityCaptureConfig = {
  theme: {
    layout: {
      frame: {
        passport: { 
          top: '25%',    // Higher positioning
          left: '15%',   // Narrower frame
          right: '15%', 
          height: '45%'  // Shorter frame
        },
        civil_id: { 
          top: '32%',    // Centered
          left: '10%',   // Wider frame
          right: '10%', 
          height: '28%'  // Taller frame
        }
      },
      borderRadius: 20,      // More rounded corners
      buttons: {
        capture: { width: 80, height: 80 },  // Larger capture button
        header: { width: 48, height: 48 }    // Smaller header buttons
      },
      spacing: {
        xs: 6,     // Increased small spacing
        sm: 12,    // Increased medium spacing
        md: 20,    // Increased large spacing
        lg: 28,    // Increased XL spacing
        xl: 36     // Increased XXL spacing
      }
    }
  }
};
```

### Animation Customization

```tsx
const customAnimationConfig: IdentityCaptureConfig = {
  theme: {
    animation: {
      progress: {
        duration: 2000,        // Slower progress animation
        easing: 'easeInOut'    // Smooth easing
      },
      modal: {
        type: 'fade',          // Fade transition instead of slide
        duration: 400          // Longer transition
      },
      transitions: {
        enableAnimations: true, // Enable all animations
        reducedMotion: false   // Don't reduce motion
      }
    }
  }
};
```

### Using Theme Hooks

```tsx
import { useThemedStyles, useFrameStyle, useProgressColors } from 'expo-identity-capture';

function ThemedComponent() {
  const themedStyles = useThemedStyles();
  const frameStyle = useFrameStyle('passport');
  const progressColors = useProgressColors();

  return (
    <View style={[themedStyles.container, { backgroundColor: themedStyles.colors.surface }]}>
      <View style={[themedStyles.frame, frameStyle]}>
        <Text style={[themedStyles.text, { color: themedStyles.colors.text.primary }]}>
          Position your passport here
        </Text>
      </View>
    </View>
  );
}
```

---

## 🚀 Advanced Usage

### Complete Integration Example

```tsx
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  ActivityIndicator
} from 'react-native';
import {
  IdentityCapture,
  IdentityCaptureProvider,
  IdentityCaptureConfig,
  ExtractedIdResult,
  SelfieCaptureResult,
  CameraManager,
  SelfieManager,
  useConfig,
  useLocalizedStrings
} from 'expo-identity-capture';

// Configuration
const appConfig: IdentityCaptureConfig = {
  theme: {
    colors: {
      primary: '#007AFF',
      secondary: '#34C759',
      danger: '#FF3B30'
    },
    animation: {
      progress: { duration: 1800 }
    }
  },
  localization: {
    language: 'en',
    customStrings: {
      en: {
        documentLabels: {
          passport: 'Travel Passport',
          civil_id: 'National Identity Card'
        }
      }
    }
  },
  behavior: {
    detection: {
      ocr: {
        timeout: 8000,
        minTextLength: 8,
        confidenceThresholds: {
          high: 0.9,
          medium: 0.75,
          low: 0.5
        }
      }
    },
    imageProcessing: {
      quality: 0.85,
      maxDimensions: {
        width: 1920,
        height: 1080
      }
    }
  }
};

// Main App Component
function App() {
  return (
    <IdentityCaptureProvider config={appConfig}>
      <IdentityVerificationFlow />
    </IdentityCaptureProvider>
  );
}

// Verification Flow Component
function IdentityVerificationFlow() {
  const [step, setStep] = useState<'select' | 'document' | 'selfie' | 'results'>('select');
  const [documentResult, setDocumentResult] = useState<ExtractedIdResult | null>(null);
  const [selfieResult, setSelfieResult] = useState<SelfieCaptureResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCustomCamera, setShowCustomCamera] = useState(false);
  const [showSelfieCamera, setShowSelfieCamera] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState<'passport' | 'civil_id' | 'army_card'>('passport');

  const { updateConfig } = useConfig();
  const { getDocumentLabel, getUIText } = useLocalizedStrings();

  // Document capture handler
  const handleDocumentCapture = useCallback(async (docType: 'passport' | 'civil_id' | 'army_card') => {
    setLoading(true);
    try {
      const result = await IdentityCapture.captureAndExtract({
        docHint: docType,
        enableQualityCheck: true,
        confidenceThreshold: 0.75,
        saveProcessedImages: true
      });

      setDocumentResult(result);
      setStep('selfie');

      // Validate the extraction
      const validation = IdentityCapture.validateExtractedData(result);
      if (!validation.isValid) {
        Alert.alert(
          'Validation Warning',
          `Some data quality issues detected:\\n${validation.issues.join('\\n')}\\nConfidence: ${Math.round(validation.confidence * 100)}%`,
          [
            { text: 'Retake', onPress: () => handleDocumentCapture(docType) },
            { text: 'Continue', onPress: () => setStep('selfie') }
          ]
        );
        return;
      }

      Alert.alert('Success', 'Document captured and processed successfully!');

    } catch (error) {
      console.error('Document capture error:', error);
      if (error.message.includes('cancelled')) {
        console.log('User cancelled document capture');
      } else {
        Alert.alert('Error', `Document capture failed: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Selfie capture handler
  const handleSelfieCapture = useCallback(async () => {
    setLoading(true);
    try {
      const result = await IdentityCapture.captureSelfie({
        quality: 0.8,
        maxWidth: 800,
        maxHeight: 800,
        output: 'uri'
      });

      setSelfieResult(result);
      setStep('results');
      Alert.alert('Success', 'Selfie captured successfully!');

    } catch (error) {
      console.error('Selfie capture error:', error);
      if (error.message.includes('cancelled')) {
        console.log('User cancelled selfie capture');
      } else {
        Alert.alert('Error', `Selfie capture failed: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Custom camera capture handler
  const handleCustomCameraCapture = useCallback((imageUri: string) => {
    setShowCustomCamera(false);
    console.log('Custom camera captured:', imageUri);
    // Process the custom captured image
    // This would typically involve additional processing
    Alert.alert('Custom Capture', 'Image captured with custom camera!');
  }, []);

  // Custom selfie capture handler
  const handleCustomSelfieCapture = useCallback((imageUri: string) => {
    setShowSelfieCamera(false);
    setSelfieResult({
      image: imageUri,
      capturedAt: new Date().toISOString()
    });
    setStep('results');
    Alert.alert('Success', 'Selfie captured with custom camera!');
  }, []);

  // Language switcher
  const switchLanguage = (language: 'en' | 'ar' | 'fr') => {
    updateConfig({
      localization: { language }
    });
  };

  // Reset flow
  const resetFlow = () => {
    setStep('select');
    setDocumentResult(null);
    setSelfieResult(null);
  };

  // Render different steps
  const renderStep = () => {
    switch (step) {
      case 'select':
        return (
          <View style={{ padding: 20 }}>
            <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 30, textAlign: 'center' }}>
              Identity Verification
            </Text>

            {/* Language Selection */}
            <View style={{ marginBottom: 30 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 15 }}>Language:</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {['en', 'ar', 'fr'].map((lang) => (
                  <TouchableOpacity
                    key={lang}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      backgroundColor: '#e0e0e0',
                      borderRadius: 20
                    }}
                    onPress={() => switchLanguage(lang as any)}
                  >
                    <Text>{lang.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Document Selection */}
            <View style={{ marginBottom: 30 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 15 }}>Select Document Type:</Text>
              
              {(['passport', 'civil_id', 'army_card'] as const).map((docType) => (
                <TouchableOpacity
                  key={docType}
                  style={{
                    backgroundColor: selectedDocType === docType ? '#007AFF' : '#f0f0f0',
                    padding: 15,
                    marginBottom: 10,
                    borderRadius: 8
                  }}
                  onPress={() => setSelectedDocType(docType)}
                >
                  <Text style={{
                    color: selectedDocType === docType ? 'white' : 'black',
                    fontSize: 16,
                    fontWeight: '500'
                  }}>
                    {getDocumentLabel(docType)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Capture Options */}
            <View style={{ gap: 15 }}>
              <TouchableOpacity
                style={{ backgroundColor: '#007AFF', padding: 15, borderRadius: 8 }}
                onPress={() => handleDocumentCapture(selectedDocType)}
                disabled={loading}
              >
                <Text style={{ color: 'white', textAlign: 'center', fontSize: 16, fontWeight: '600' }}>
                  {loading ? 'Processing...' : `Capture ${getDocumentLabel(selectedDocType)}`}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ backgroundColor: '#34C759', padding: 15, borderRadius: 8 }}
                onPress={() => {
                  setShowCustomCamera(true);
                  setStep('document');
                }}
              >
                <Text style={{ color: 'white', textAlign: 'center', fontSize: 16, fontWeight: '600' }}>
                  Use Custom Camera
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case 'document':
        return (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            {loading && (
              <View>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={{ marginTop: 10, fontSize: 16 }}>Processing document...</Text>
              </View>
            )}
          </View>
        );

      case 'selfie':
        return (
          <View style={{ padding: 20, justifyContent: 'center', flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 30, textAlign: 'center' }}>
              Now take a selfie
            </Text>

            <View style={{ gap: 15 }}>
              <TouchableOpacity
                style={{ backgroundColor: '#FF9500', padding: 15, borderRadius: 8 }}
                onPress={handleSelfieCapture}
                disabled={loading}
              >
                <Text style={{ color: 'white', textAlign: 'center', fontSize: 16, fontWeight: '600' }}>
                  {loading ? 'Processing...' : 'Take Selfie'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ backgroundColor: '#34C759', padding: 15, borderRadius: 8 }}
                onPress={() => setShowSelfieCamera(true)}
              >
                <Text style={{ color: 'white', textAlign: 'center', fontSize: 16, fontWeight: '600' }}>
                  Use Custom Selfie Camera
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ backgroundColor: '#666', padding: 15, borderRadius: 8 }}
                onPress={() => setStep('select')}
              >
                <Text style={{ color: 'white', textAlign: 'center', fontSize: 16 }}>
                  Back to Document Selection
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case 'results':
        return (
          <ScrollView style={{ padding: 20 }}>
            <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 30, textAlign: 'center' }}>
              Verification Results
            </Text>

            {/* Document Results */}
            {documentResult && (
              <View style={{ backgroundColor: 'white', padding: 20, borderRadius: 12, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 }}>
                <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 15 }}>Document Information</Text>
                
                <View style={{ gap: 10 }}>
                  <Text><Text style={{ fontWeight: '600' }}>Type:</Text> {documentResult.docType}</Text>
                  
                  {documentResult.fields.documentNumber?.value && (
                    <Text>
                      <Text style={{ fontWeight: '600' }}>Document Number:</Text> {documentResult.fields.documentNumber.value}
                      <Text style={{ color: '#666', fontSize: 12 }}> ({Math.round(documentResult.fields.documentNumber.confidence * 100)}% confidence)</Text>
                    </Text>
                  )}
                  
                  {documentResult.fields.fullNameLatin?.value && (
                    <Text>
                      <Text style={{ fontWeight: '600' }}>Name:</Text> {documentResult.fields.fullNameLatin.value}
                      <Text style={{ color: '#666', fontSize: 12 }}> ({Math.round(documentResult.fields.fullNameLatin.confidence * 100)}% confidence)</Text>
                    </Text>
                  )}
                  
                  {documentResult.fields.dateOfBirth?.value && (
                    <Text>
                      <Text style={{ fontWeight: '600' }}>Date of Birth:</Text> {documentResult.fields.dateOfBirth.value}
                      <Text style={{ color: '#666', fontSize: 12 }}> ({Math.round(documentResult.fields.dateOfBirth.confidence * 100)}% confidence)</Text>
                    </Text>
                  )}
                  
                  {documentResult.fields.nationality?.value && (
                    <Text>
                      <Text style={{ fontWeight: '600' }}>Nationality:</Text> {documentResult.fields.nationality.value}
                      <Text style={{ color: '#666', fontSize: 12 }}> ({Math.round(documentResult.fields.nationality.confidence * 100)}% confidence)</Text>
                    </Text>
                  )}
                </View>

                {/* Quality Metrics */}
                <View style={{ marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderTopColor: '#eee' }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 10 }}>Quality Assessment</Text>
                  <Text>Blur Score: {Math.round(documentResult.quality.blurScore * 100)}%</Text>
                  <Text>Brightness: {Math.round(documentResult.quality.brightness * 100)}%</Text>
                  <Text>Glare Detected: {documentResult.quality.glareDetected ? 'Yes' : 'No'}</Text>
                </View>

                {/* MRZ Information */}
                {documentResult.mrz && (
                  <View style={{ marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderTopColor: '#eee' }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 10 }}>MRZ Information</Text>
                    <Text>Type: {documentResult.mrz.type}</Text>
                    <Text>Document Check: {documentResult.mrz.checks.documentNumber ? '✅' : '❌'}</Text>
                    <Text>Date of Birth Check: {documentResult.mrz.checks.dob ? '✅' : '❌'}</Text>
                    <Text>Expiry Check: {documentResult.mrz.checks.expiry ? '✅' : '❌'}</Text>
                    <Text>Composite Check: {documentResult.mrz.checks.composite ? '✅' : '❌'}</Text>
                  </View>
                )}

                {/* Document Images */}
                <View style={{ marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderTopColor: '#eee' }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 10 }}>Captured Images</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, marginBottom: 5 }}>Original</Text>
                      <Image 
                        source={{ uri: documentResult.originalImageUri }} 
                        style={{ width: '100%', height: 100, borderRadius: 8 }}
                        resizeMode="cover"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, marginBottom: 5 }}>Processed</Text>
                      <Image 
                        source={{ uri: documentResult.processedImageUri }} 
                        style={{ width: '100%', height: 100, borderRadius: 8 }}
                        resizeMode="cover"
                      />
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* Selfie Results */}
            {selfieResult && (
              <View style={{ backgroundColor: 'white', padding: 20, borderRadius: 12, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 }}>
                <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 15 }}>Selfie</Text>
                
                <View style={{ alignItems: 'center' }}>
                  <Image 
                    source={{ uri: selfieResult.image }} 
                    style={{ width: 200, height: 200, borderRadius: 100 }}
                    resizeMode="cover"
                  />
                  <Text style={{ marginTop: 10, color: '#666' }}>
                    Captured: {new Date(selfieResult.capturedAt).toLocaleString()}
                  </Text>
                </View>
              </View>
            )}

            {/* Action Buttons */}
            <View style={{ gap: 15, marginTop: 20 }}>
              <TouchableOpacity
                style={{ backgroundColor: '#007AFF', padding: 15, borderRadius: 8 }}
                onPress={() => {
                  // Export or save results
                  const results = {
                    document: documentResult,
                    selfie: selfieResult,
                    completedAt: new Date().toISOString()
                  };
                  console.log('Verification complete:', results);
                  Alert.alert('Success', 'Identity verification completed successfully!');
                }}
              >
                <Text style={{ color: 'white', textAlign: 'center', fontSize: 16, fontWeight: '600' }}>
                  Complete Verification
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ backgroundColor: '#666', padding: 15, borderRadius: 8 }}
                onPress={resetFlow}
              >
                <Text style={{ color: 'white', textAlign: 'center', fontSize: 16 }}>
                  Start Over
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        );

      default:
        return null;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      {renderStep()}

      {/* Custom Camera Modal */}
      <CameraManager
        visible={showCustomCamera}
        docType={selectedDocType}
        onCapture={handleCustomCameraCapture}
        onCancel={() => {
          setShowCustomCamera(false);
          setStep('select');
        }}
        disableDetection={false}
        enableFlash={true}
      />

      {/* Custom Selfie Modal */}
      <SelfieManager
        visible={showSelfieCamera}
        onCapture={handleCustomSelfieCapture}
        onCancel={() => setShowSelfieCamera(false)}
        enableFlash={false}
      />

      {/* Loading Overlay */}
      {loading && (
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <View style={{
            backgroundColor: 'white',
            padding: 30,
            borderRadius: 12,
            alignItems: 'center'
          }}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={{ marginTop: 15, fontSize: 16, fontWeight: '500' }}>
              Processing...
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

export default App;
```

---

## ⚡ Performance Optimization

### Image Quality vs Performance

```tsx
// Optimize for different use cases

// High quality for archival/compliance
const archivalCapture = await IdentityCapture.captureAndExtract({
  docHint: 'passport',
  // Use default settings for maximum quality
});

// Balanced for most applications
const balancedCapture = await IdentityCapture.captureAndExtract({
  docHint: 'civil_id',
  // Default settings provide good balance
});

// Optimized for quick processing
const config: IdentityCaptureConfig = {
  behavior: {
    imageProcessing: {
      quality: 0.7,              // Reduced quality for faster processing
      maxDimensions: {
        width: 1280,             // Smaller dimensions
        height: 720
      }
    },
    detection: {
      ocr: {
        timeout: 3000,           // Faster timeout
        minTextLength: 5         // More lenient requirements
      }
    }
  }
};
```

### Memory Management

```tsx
// Process images immediately to free memory
const result = await IdentityCapture.captureAndExtract({ docHint: 'passport' });

// Upload or save immediately
await uploadDocument(result);

// Clear references
setDocumentResult(null);
```

### Batch Processing

```tsx
// Process multiple documents efficiently
const processMultipleDocuments = async (documentTypes: string[]) => {
  const results = [];
  
  for (const docType of documentTypes) {
    try {
      const result = await IdentityCapture.captureAndExtract({
        docHint: docType as any,
        enableQualityCheck: false, // Disable for faster processing
      });
      
      results.push(result);
      
      // Process immediately to free memory
      await processDocument(result);
      
    } catch (error) {
      console.error(`Failed to process ${docType}:`, error);
    }
  }
  
  return results;
};
```

---

## 🛠 Troubleshooting

### Common Issues

#### Camera Permission Issues

```tsx
// Check and request permissions
import { Camera } from 'expo-camera';

const checkCameraPermissions = async () => {
  const { status } = await Camera.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      'Camera Permission Required',
      'Please enable camera access in your device settings to capture documents.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => {
          // Platform-specific settings opening
          if (Platform.OS === 'ios') {
            Linking.openURL('app-settings:');
          } else {
            Linking.openSettings();
          }
        }}
      ]
    );
    return false;
  }
  return true;
};
```

#### OCR Processing Issues

```tsx
// Handle OCR failures gracefully
const captureWithFallback = async (docType: string) => {
  try {
    // Try with high confidence first
    const result = await IdentityCapture.captureAndExtract({
      docHint: docType as any,
      confidenceThreshold: 0.8,
      enableQualityCheck: true
    });
    return result;
    
  } catch (error) {
    if (error.message.includes('OCR')) {
      console.warn('High confidence OCR failed, trying with lower threshold');
      
      // Retry with lower confidence
      const result = await IdentityCapture.captureAndExtract({
        docHint: docType as any,
        confidenceThreshold: 0.5,
        enableQualityCheck: false
      });
      
      return result;
    }
    throw error;
  }
};
```

#### Memory Issues

```tsx
// Monitor memory usage
const captureWithMemoryManagement = async () => {
  console.log('Memory before capture:', performance.memory?.usedJSHeapSize);
  
  try {
    const result = await IdentityCapture.captureAndExtract({ docHint: 'passport' });
    
    // Process immediately
    await processResult(result);
    
    // Force garbage collection (development only)
    if (__DEV__ && global.gc) {
      global.gc();
    }
    
    console.log('Memory after capture:', performance.memory?.usedJSHeapSize);
    
    return result;
    
  } catch (error) {
    // Clean up on error
    if (__DEV__ && global.gc) {
      global.gc();
    }
    throw error;
  }
};
```

#### Build Issues

```bash
# Clean build
rm -rf node_modules
npm install
npx expo prebuild --clean

# iOS specific
cd ios
pod install --clean-install
cd ..

# Android specific
cd android
./gradlew clean
cd ..
```

### Debug Mode

Enable verbose logging:

```tsx
// Add to your app's entry point
if (__DEV__) {
  // Enable detailed logging
  console.log('Identity Capture Debug Mode Enabled');
  
  // Override console methods to add timestamps
  const originalLog = console.log;
  console.log = (...args) => {
    originalLog(`[${new Date().toISOString()}]`, ...args);
  };
}
```

### Platform-Specific Issues

#### iOS Issues

```tsx
// Handle iOS-specific camera issues
import { Platform } from 'react-native';

if (Platform.OS === 'ios') {
  // iOS 17+ camera permission changes
  const checkiOS17Permissions = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    
    if (status === 'denied') {
      Alert.alert(
        'Camera Access Required',
        'This app needs camera access to capture documents. Please enable it in Settings.',
        [{ text: 'OK' }]
      );
      return false;
    }
    
    return true;
  };
}
```

#### Android Issues

```tsx
// Handle Android-specific issues
if (Platform.OS === 'android') {
  // Check for camera2 API support
  const checkCamera2Support = () => {
    // Most modern Android devices support Camera2
    // Add specific checks if needed for older devices
    if (Platform.Version < 21) {
      console.warn('Android version may have limited camera support');
    }
  };
}
```

### Performance Monitoring

```tsx
// Monitor capture performance
const monitorCapture = async (docType: string) => {
  const startTime = Date.now();
  
  try {
    const result = await IdentityCapture.captureAndExtract({
      docHint: docType as any
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Log performance metrics
    console.log(`Capture completed in ${duration}ms`);
    console.log(`Fields extracted: ${Object.keys(result.fields).length}`);
    console.log(`Quality score: ${result.quality.blurScore}`);
    
    // Report to analytics (optional)
    // analytics.track('document_capture_completed', {
    //   docType,
    //   duration,
    //   fieldsExtracted: Object.keys(result.fields).length,
    //   qualityScore: result.quality.blurScore
    // });
    
    return result;
    
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.error(`Capture failed after ${duration}ms:`, error.message);
    
    // Report error to analytics (optional)
    // analytics.track('document_capture_failed', {
    //   docType,
    //   duration,
    //   error: error.message
    // });
    
    throw error;
  }
};
```

---

## 📞 Support & Resources

### Documentation
- [API Reference](/docs/api)
- [Configuration Guide](/docs/configuration)
- [Troubleshooting Guide](/docs/troubleshooting)

### Community
- [GitHub Issues](https://github.com/your-org/expo-identity-capture/issues)
- [Discussions](https://github.com/your-org/expo-identity-capture/discussions)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/expo-identity-capture)

### Professional Support
- 📧 Email: support@yourcompany.com
- 💬 Slack: [Community Channel](https://slack.yourcompany.com)
- 📞 Phone: +1-800-SUPPORT

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

Built with:
- [Expo](https://expo.dev) - React Native development platform
- [React Native Vision Camera](https://github.com/mrousavy/react-native-vision-camera) - Camera functionality
- [ML Kit](https://developers.google.com/ml-kit) - Text recognition
- [React Native Document Scanner](https://github.com/Michaelvilleneuve/react-native-document-scanner-plugin) - Document scanning

---

*This package is production-ready and actively maintained. Star ⭐ the repository if you find it useful!*