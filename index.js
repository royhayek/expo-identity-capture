const React = require('react');

// Mock IdentityCaptureProvider
const IdentityCaptureProvider = ({ children }) => {
  return React.createElement(React.Fragment, null, children);
};

// Mock capture functions
const captureDocument = async (type, options = {}) => {
  throw new Error('Camera capture not implemented in this demo');
};

const captureSelfie = async (options = {}) => {
  throw new Error('Selfie capture not implemented in this demo');
};

// Mock localization
const arabicStrings = {};
const frenchStrings = {};

// Export everything
module.exports = {
  IdentityCaptureProvider,
  captureDocument,
  captureSelfie,
  arabicStrings,
  frenchStrings,
  DocumentCaptureAPI: { captureDocument },
  SelfieCaptureAPI: { captureSelfie },
  LocalizationManager: {},
  createLocalizedStrings: () => ({}),
  FlowRules: {},
  ImageProcessor: {},
};