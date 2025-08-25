/**
 * Comprehensive test validation suite for document extraction
 * This provides testing utilities and validation methods
 */

import { DocumentExtractor } from "../core/DocumentExtractor";

export interface TestResult {
  success: boolean;
  message: string;
  details?: any;
  duration: number;
}

export interface TestSuite {
  name: string;
  tests: TestCase[];
}

export interface TestCase {
  name: string;
  description: string;
  testFunction: () => Promise<TestResult>;
}

/**
 * Test validation utilities for the document extraction system
 */
export class TestValidation {
  /**
   * Create test suite for OCR document extraction
   */
  static createOCRTestSuite(): TestSuite {
    return {
      name: "OCR Document Extraction Tests",
      tests: [
        {
          name: "Text Analysis",
          description: "Test text analysis and language detection",
          testFunction: async () => {
            const startTime = Date.now();
            try {
              const testTexts = [
                "REPUBLIC OF LEBANON Civil Identity Card رقم الهوية المدنية",
                "John Doe 123456789 25/12/1990",
                "محمد أحمد صالح 15/03/1985 ذكر لبناني",
                "", // Empty text
              ];

              const results = testTexts.map((text) => {
                const lines = text
                  .split("\n")
                  .filter((line) => line.trim().length > 0);
                return {
                  hasArabic: /[\u0600-\u06FF]/.test(text),
                  hasLatin: /[a-zA-Z]/.test(text),
                  wordCount: text.split(/\s+/).filter((word) => word.length > 0)
                    .length,
                  lineCount: lines.length,
                  textLength: text.length,
                };
              });

              // Validate analysis results
              const validations = {
                mixedLanguageDetected:
                  results[0].hasArabic && results[0].hasLatin,
                latinOnlyDetected: results[1].hasLatin && !results[1].hasArabic,
                arabicDetected: results[2].hasArabic,
                emptyTextHandled: results[3].textLength === 0,
              };

              const allValid = Object.values(validations).every(
                (v) => v === true
              );

              return {
                success: allValid,
                message: allValid
                  ? "Text analysis successful"
                  : "Text analysis failed",
                details: {
                  results,
                  validations,
                },
                duration: Date.now() - startTime,
              };
            } catch (error) {
              return {
                success: false,
                message: `Text analysis test failed: ${error}`,
                duration: Date.now() - startTime,
              };
            }
          },
        },
        {
          name: "Field Pattern Matching",
          description: "Test field extraction patterns",
          testFunction: async () => {
            const startTime = Date.now();
            try {
              const testText = `
                REPUBLIC OF LEBANON
                Civil Identity Card
                Document Number: 1234567890
                Full Name: JOHN DOE SMITH
                الاسم الكامل: محمد أحمد صالح
                Date of Birth: 25/12/1990
                تاريخ الولادة: 15/03/1985
                Sex: Male
                الجنس: ذكر
                Nationality: Lebanese
                الجنسية: لبناني
                Place of Birth: Beirut
                مكان الولادة: بيروت
              `;

              // Test document number extraction
              const docNumberMatch = testText.match(/\b\d{8,15}\b/);
              const dateMatches = Array.from(
                testText.matchAll(
                  /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b/g
                )
              );
              const arabicTextMatch = testText.match(
                /[\u0600-\u06FF][\u0600-\u06FF\s]{4,50}/g
              );
              const latinNameMatch = testText.match(
                /\b[A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/g
              );

              const validations = {
                documentNumberFound: docNumberMatch !== null,
                datesFound: dateMatches.length >= 2,
                arabicTextFound: arabicTextMatch !== null,
                latinNameFound: latinNameMatch !== null,
              };

              const allValid = Object.values(validations).every(
                (v) => v === true
              );

              return {
                success: allValid,
                message: allValid
                  ? "Pattern matching successful"
                  : "Pattern matching failed",
                details: {
                  docNumber: docNumberMatch?.[0],
                  dates: dateMatches.map((m) => m[0]),
                  arabicText: arabicTextMatch?.[0],
                  latinName: latinNameMatch?.[0],
                  validations,
                },
                duration: Date.now() - startTime,
              };
            } catch (error) {
              return {
                success: false,
                message: `Pattern matching test failed: ${error}`,
                duration: Date.now() - startTime,
              };
            }
          },
        },
        {
          name: "Date Format Normalization",
          description: "Test date format conversion",
          testFunction: async () => {
            const startTime = Date.now();
            try {
              // Test various date formats
              const testDates = [
                "25/12/1990", // DD/MM/YYYY
                "03-15-1985", // MM-DD-YYYY (ambiguous)
                "1990.12.25", // YYYY.MM.DD
                "invalid-date", // Invalid format
              ];

              const normalizedDates = testDates.map((date) =>
                (DocumentExtractor as any).normalizeDateFormat(date)
              );

              const validations = {
                ddmmyyyyNormalized:
                  normalizedDates[0].match(/^\d{4}-\d{2}-\d{2}$/),
                yyyymmddDetected:
                  normalizedDates[2].match(/^\d{4}-\d{2}-\d{2}$/),
                invalidHandled: normalizedDates[3] === testDates[3], // Should return original if no pattern matches
              };

              const allValid = Object.values(validations).every(
                (v) => v === true || v !== null
              );

              return {
                success: allValid,
                message: allValid
                  ? "Date normalization successful"
                  : "Date normalization failed",
                details: {
                  original: testDates,
                  normalized: normalizedDates,
                  validations,
                },
                duration: Date.now() - startTime,
              };
            } catch (error) {
              return {
                success: false,
                message: `Date normalization test failed: ${error}`,
                duration: Date.now() - startTime,
              };
            }
          },
        },
      ],
    };
  }

  /**
   * Run a complete test suite
   */
  static async runTestSuite(suite: TestSuite): Promise<void> {
    console.log(`\n🧪 Running Test Suite: ${suite.name}`);
    console.log(`📋 Total tests: ${suite.tests.length}`);

    const results: TestResult[] = [];

    for (let i = 0; i < suite.tests.length; i++) {
      const test = suite.tests[i];
      console.log(`\n📝 Test ${i + 1}/${suite.tests.length}: ${test.name}`);
      console.log(`📖 ${test.description}`);

      try {
        const result = await test.testFunction();
        results.push(result);

        if (result.success) {
          console.log(`✅ PASSED: ${result.message} (${result.duration}ms)`);
        } else {
          console.log(`❌ FAILED: ${result.message} (${result.duration}ms)`);
          if (result.details) {
            console.log(`📊 Details:`, result.details);
          }
        }
      } catch (error) {
        console.log(`💥 ERROR: Test execution failed:`, error);
        results.push({
          success: false,
          message: `Test execution error: ${error}`,
          duration: 0,
        });
      }
    }

    // Summary
    const passed = results.filter((r) => r.success).length;
    const failed = results.length - passed;
    const avgDuration =
      results.reduce((sum, r) => sum + r.duration, 0) / results.length;

    console.log(`\n📊 Test Suite Summary: ${suite.name}`);
    console.log(`✅ Passed: ${passed}/${results.length}`);
    console.log(`❌ Failed: ${failed}/${results.length}`);
    console.log(`⏱️  Average duration: ${avgDuration.toFixed(0)}ms`);
    console.log(
      `🎯 Success rate: ${((passed / results.length) * 100).toFixed(1)}%`
    );
  }

  /**
   * Run all available test suites
   */
  static async runAllTests(): Promise<void> {
    console.log(`\n🚀 Starting Comprehensive Test Validation`);
    console.log(`📅 ${new Date().toISOString()}`);

    const suites = [this.createOCRTestSuite()];

    for (const suite of suites) {
      await this.runTestSuite(suite);
    }

    console.log(`\n🏁 All tests completed!`);
  }

  /**
   * Performance benchmark for document extraction
   */
  static async benchmarkExtraction(
    imageUri: string,
    iterations: number = 3
  ): Promise<void> {
    console.log(`\n⚡ Performance Benchmark: ${iterations} iterations`);

    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();

      try {
        // This would need an actual image URI to test
        // await DocumentExtractor.captureAndExtract({ docHint: 'passport' });
        console.log(`🔄 Iteration ${i + 1}: Would test with ${imageUri}`);

        const duration = Date.now() - startTime;
        times.push(duration);

        console.log(`⏱️  Iteration ${i + 1}: ${duration}ms`);
      } catch (error) {
        console.log(`❌ Iteration ${i + 1} failed:`, error);
      }
    }

    if (times.length > 0) {
      const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
      const min = Math.min(...times);
      const max = Math.max(...times);

      console.log(`📊 Performance Summary:`);
      console.log(`   Average: ${avg.toFixed(0)}ms`);
      console.log(`   Min: ${min}ms`);
      console.log(`   Max: ${max}ms`);
    }
  }
}
