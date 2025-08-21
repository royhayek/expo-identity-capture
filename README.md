# expo-identity-capture

A React Native package for capturing ID documents and selfies in Expo prebuild apps. This package provides a clean, minimal interface for document capture with automatic flow rules and configurable compression settings.

## Features

- 📸 **Document Capture**: Support for passports, civil IDs, army cards, and residence permits
- 🤳 **Selfie Capture**: Front-camera selfie capture with circular frame guide
- 🔄 **Smart Flow Rules**: Automatic enforcement of document requirements (e.g., civil ID front + back)
- 🖼️ **Image Processing**: Configurable compression, quality, and output format
- 🌍 **Localization**: Built-in support for English, Arabic, and French
- 📱 **Expo Compatible**: Designed for Expo prebuild apps with proper permissions
- 🎨 **Minimal UI**: Clean, native-looking camera interface with frame guides

## Installation

```bash
npm install expo-identity-capture
```

### Peer Dependencies

Make sure you have the following peer dependencies installed:

```bash
npx expo install expo-camera expo-image-manipulator expo-image-picker
```

### Expo Configuration

Add the camera plugin to your `app.json` or `app.config.js`:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-camera",
        {
          "cameraPermission": "Allow $(PRODUCT_NAME) to access your camera to capture identity documents and selfies."
        }
      ]
    ]
  }
}
```

## Quick Start

### 1. Wrap Your App

```tsx
import { IdentityCaptureProvider } from 'expo-identity-capture';

export default function App() {
  return (
    <IdentityCaptureProvider>
      {/* Your app content */}
    </IdentityCaptureProvider>
  );
}
```

### 2. Capture Documents

```tsx
import { captureDocument } from 'expo-identity-capture';

const handleCapturePassport = async () => {
  try {
    const result = await captureDocument('passport', {
      quality: 0.8,
      maxWidth: 1920,
      output: 'uri'
    });
    
    console.log('Captured:', result);
    // result.images contains the captured photo URIs
    // result.capturedAt contains the timestamp
  } catch (error) {
    console.error('Capture failed:', error);
  }
};
```

### 3. Capture Selfies

```tsx
import { captureSelfie } from 'expo-identity-capture';

const handleCaptureSelfie = async () => {
  try {
    const result = await captureSelfie({
      quality: 0.8,
      output: 'uri'
    });
    
    console.log('Selfie:', result.image);
  } catch (error) {
    console.error('Selfie capture failed:', error);
  }
};
```

## API Reference

### captureDocument(type, options?)

Captures identity documents with automatic flow enforcement.

**Parameters:**
- `type`: `'passport' | 'civil_id' | 'army_card' | 'residence_permit'`
- `options`: Optional configuration object

**Returns:** `Promise<DocumentCaptureResult>`

```tsx
interface DocumentCaptureResult {
  type: DocumentType;
  images: string[];           // Array of captured image URIs/base64
  sides?: ('front'|'back')[]; // For documents with multiple sides
  capturedAt: string;         // ISO timestamp
}
```

### captureSelfie(options?)

Captures a selfie using the front camera.

**Parameters:**
- `options`: Optional configuration object

**Returns:** `Promise<SelfieCaptureResult>`

```tsx
interface SelfieCaptureResult {
  image: string;      // Captured image URI/base64
  capturedAt: string; // ISO timestamp
}
```

## Configuration Options

Both `captureDocument` and `captureSelfie` accept these options:

```tsx
interface CaptureConfig {
  output?: 'uri' | 'base64';     // Default: 'uri'
  quality?: number;              // 0-1, default: 0.8
  maxWidth?: number;             // Default: 1920
  maxHeight?: number;            // Default: 1080
  strings?: LocalizedStrings;    // Custom localization
  
  // Callbacks
  onSuccess?: (result) => void;
  onCancel?: () => void;
  onError?: (error) => void;
}
```

## Document Flow Rules

The package automatically enforces these capture flows:

### Non-Lebanese Passport
1. Capture passport
2. **Require** residence permit
3. End

### Lebanese Passport
1. Capture passport
2. End

### Civil ID
1. Capture front side
2. **Enforce** back side capture
3. End

### Army Card
1. Capture once
2. End

## Localization

### Built-in Languages

```tsx
import { arabicStrings, frenchStrings } from 'expo-identity-capture';

// Use Arabic strings
const result = await captureDocument('passport', {
  strings: arabicStrings
});

// Use French strings
const result = await captureSelfie({
  strings: frenchStrings
});
```

### Custom Localization

```tsx
const customStrings = {
  capture: 'Take Photo',
  retake: 'Try Again',
  capturePassport: 'Scan Your Passport',
  // ... other strings
};

const result = await captureDocument('civil_id', {
  strings: customStrings
});
```

### Available String Keys

```tsx
interface LocalizedStrings {
  capture?: string;
  retake?: string;
  flashOn?: string;
  flashOff?: string;
  captureDocument?: string;
  captureSelfie?: string;
  capturePassport?: string;
  captureCivilIdFront?: string;
  captureCivilIdBack?: string;
  captureArmyCard?: string;
  captureResidencePermit?: string;
  documentRequired?: string;
  selfieRequired?: string;
  cancel?: string;
  done?: string;
  loading?: string;
  error?: string;
  cameraPermissionDenied?: string;
  cameraNotAvailable?: string;
}
```

## Advanced Usage

### Using Callbacks

```tsx
const result = await captureDocument('civil_id', {
  onSuccess: (result) => {
    console.log('Document captured!', result);
    // Save to your backend/state
  },
  onCancel: () => {
    console.log('User cancelled');
  },
  onError: (error) => {
    console.error('Capture failed:', error.message);
    // Show user-friendly error message
  }
});
```

### Promise-based vs Callback-based

You can use either approach:

```tsx
// Promise-based (recommended)
try {
  const result = await captureDocument('passport');
  handleSuccess(result);
} catch (error) {
  handleError(error);
}

// Callback-based
captureDocument('passport', {
  onSuccess: handleSuccess,
  onError: handleError,
  onCancel: handleCancel
});
```

### Image Processing Options

```tsx
// High quality, large images
const result = await captureDocument('passport', {
  quality: 1.0,
  maxWidth: 2560,
  maxHeight: 1920,
  output: 'uri'
});

// Compressed, base64 for immediate upload
const result = await captureSelfie({
  quality: 0.6,
  maxWidth: 800,
  maxHeight: 800,
  output: 'base64'
});
```

## Expo Prebuild Notes

This package is designed for Expo prebuild (bare workflow) apps. Here's what you need to know:

### Before Prebuild

1. Add the camera plugin to your `app.json`
2. Install all peer dependencies
3. Run `npx expo prebuild`

### iOS Permissions

The camera permission is automatically handled by the Expo camera plugin. The permission message can be customized in your `app.json`:

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSCameraUsageDescription": "This app uses the camera to capture identity documents and selfies."
      }
    }
  }
}
```

### Android Permissions

Camera permission is automatically added to the Android manifest by the Expo camera plugin.

## Error Handling

The package throws specific error types:

```tsx
try {
  const result = await captureDocument('passport');
} catch (error) {
  if (error.message.includes('permission')) {
    // Handle camera permission denied
  } else if (error.message.includes('cancelled')) {
    // Handle user cancellation
  } else {
    // Handle other errors
  }
}
```

Common errors:
- `"Camera permission is required"`
- `"Capture was cancelled by user"`
- `"Another capture is already in progress"`
- `"Failed to process image"`

## Performance Tips

1. **Image Quality**: Use `quality: 0.8` for a good balance of size and quality
2. **Maximum Size**: Set reasonable `maxWidth`/`maxHeight` to avoid memory issues
3. **Output Format**: Use `'uri'` for better performance, `'base64'` only when necessary
4. **Single Instance**: Only one capture can be active at a time

## Demo App

Check out the `/demo` folder for a complete example app showing all features:

```bash
cd demo
npm install
npx expo start
```

The demo includes:
- All document types
- Selfie capture
- Language switching
- Results display
- Error handling examples

## TypeScript Support

The package is written in TypeScript and includes complete type definitions. All interfaces are exported:

```tsx
import {
  DocumentType,
  DocumentCaptureResult,
  SelfieCaptureResult,
  CaptureConfig,
  LocalizedStrings
} from 'expo-identity-capture';
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT

## Support

- 📖 Check the demo app for examples
- 🐛 Report bugs via GitHub Issues
- 💡 Request features via GitHub Issues
- 📧 Contact support for integration help

---

**Note**: This package handles only image capture. It does not perform:
- Liveness detection
- OCR/text extraction
- Document validation
- Biometric matching
- Backend storage

The host app is responsible for processing and storing the captured images.