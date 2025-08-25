#!/usr/bin/env node

/**
 * Simple test script for expo-identity-capture
 * Run with: node test.js
 *
 * Note: This tests what we can in Node.js environment.
 * Full functionality requires React Native runtime.
 */

console.log("🧪 Testing expo-identity-capture package structure...\n");

async function testDocumentScanner() {
  console.log("🧪 Testing DocumentScanner availability...");

  if (DocumentScanner) {
    console.log("✅ DocumentScanner is available");
    console.log("📋 DocumentScanner methods:", Object.keys(DocumentScanner));
  } else {
    console.log("❌ DocumentScanner is not available");
  }
}

async function testAPIExports() {
  console.log("🧪 Testing API exports...");

  try {
    // Try to load just the types and interfaces we can test
    const packageJson = require("./package.json");
    console.log("✅ Package info:");
    console.log("  - Name:", packageJson.name);
    console.log("  - Version:", packageJson.version);
    console.log("  - Main:", packageJson.main);
    console.log("  - Types:", packageJson.types);

    // Check if lib directory exists
    const fs = require("fs");
    const libExists = fs.existsSync("./lib");
    console.log(
      "  - Built lib directory:",
      libExists ? "✅ exists" : "❌ missing"
    );

    if (libExists) {
      const libFiles = fs.readdirSync("./lib");
      console.log("  - Lib contents:", libFiles.length, "files/folders");
    }
  } catch (error) {
    console.log("❌ API exports test failed:", error.message);
  }
}

async function testTemplateLoading() {
  console.log("\n🧪 Testing template loading...");

  try {
    // Test civil_id template
    const civilIdTemplate = require("./lib/templates/civil_id_front.json");
    console.log("✅ civil_id template loaded successfully");
    console.log("📋 Template structure:", {
      docType: civilIdTemplate.docType,
      fieldCount: Object.keys(civilIdTemplate.fields || {}).length,
    });
  } catch (error) {
    console.log(
      "⚠️  Could not load civil_id template from JSON:",
      error.message
    );
    console.log("📝 This is expected - will use fallback template");
  }

  try {
    // Test army_card template
    const armyCardTemplate = require("./lib/templates/army_card.json");
    console.log("✅ army_card template loaded successfully");
  } catch (error) {
    console.log(
      "⚠️  Could not load army_card template from JSON:",
      error.message
    );
  }
}

async function testMLKitAvailability() {
  console.log("\n🧪 Testing ML Kit availability...");

  try {
    const MLKit = require("@react-native-ml-kit/text-recognition");
    console.log("✅ ML Kit Text Recognition is available");
    console.log("📋 ML Kit methods:", Object.keys(MLKit.default || MLKit));
  } catch (error) {
    console.log("❌ ML Kit Text Recognition not available:", error.message);
    console.log(
      "💡 This is expected in Node.js - only works in React Native runtime"
    );
  }
}

async function testDocumentScannerPlugin() {
  console.log("\n🧪 Testing Document Scanner Plugin availability...");

  try {
    const DocumentScannerPlugin = require("react-native-document-scanner-plugin");
    console.log("✅ Document Scanner Plugin is available");
    console.log(
      "📋 Plugin methods:",
      Object.keys(DocumentScannerPlugin.default || DocumentScannerPlugin)
    );
  } catch (error) {
    console.log("❌ Document Scanner Plugin not available:", error.message);
    console.log(
      "💡 This is expected in Node.js - only works in React Native runtime"
    );
  }
}

async function runAllTests() {
  console.log("🚀 Starting expo-identity-capture tests...\n");

  await testAPIExports();
  await testTemplateLoading();

  console.log("\n✨ Test suite completed!");
  console.log("\n💡 To test with real images:");
  console.log("   1. Use in a React Native app");
  console.log(
    '   2. Import: import { captureAndExtract } from "expo-identity-capture"'
  );
  console.log('   3. Call: await captureAndExtract({ docHint: "passport" })');
  console.log("   4. Or: await captureAndExtract() // auto-detect");

  console.log("\n🔧 For debugging in your app, check these logs:");
  console.log("   📱 PASSPORT scanning:");
  console.log('     - "🔍 Starting document capture and extraction"');
  console.log("");
  console.log("   🆔 CIVIL_ID scanning:");
  console.log('     - "🔍 Starting document capture and extraction"');
  console.log('     - "Extracting OCR document: civil_id"');
  console.log('     - "Creating civil_id template..."');
  console.log('     - "✅ Created civil_id template"');
  console.log('     - "Extracting text with ML Kit..."');
}

if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testAPIExports,
  testDocumentScanner,
  testTemplateLoading,
  testMLKitAvailability,
  testDocumentScannerPlugin,
};
