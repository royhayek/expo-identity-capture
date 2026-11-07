/**
 * Data Normalization Service
 *
 * Normalizes extracted document data into unified formats.
 * Handles nationality, gender, dates, country names, and place of birth.
 *
 * @module DataNormalizer
 */

// ============================================================================
// Types
// ============================================================================

/** Gender in normalized format */
export type NormalizedGender = 'male' | 'female' | 'other' | 'unknown';

/** Raw and formatted field pair */
export interface NormalizedField<T = string> {
  /** Original raw value from OCR */
  raw: string;
  /** Normalized/formatted value */
  formatted: T;
}

/** Normalized extracted fields */
export interface NormalizedExtractedData {
  documentNumber?: NormalizedField;
  fullName?: NormalizedField;
  fullNameArabic?: NormalizedField;
  givenNames?: NormalizedField;
  surname?: NormalizedField;
  fatherName?: NormalizedField;
  motherName?: NormalizedField;
  dateOfBirth?: NormalizedField;
  dateOfExpiry?: NormalizedField;
  dateOfIssue?: NormalizedField;
  placeOfBirth?: NormalizedField;
  nationality?: NormalizedField;
  gender?: NormalizedField<NormalizedGender>;
  issuingCountry?: NormalizedField;
}

// ============================================================================
// Nationality Mappings
// ============================================================================

/** Arabic nationality to English country name */
const ARABIC_NATIONALITY_MAP: Record<string, string> = {
  // Middle East
  'لبناني': 'Lebanese',
  'لبنانية': 'Lebanese',
  'سوري': 'Syrian',
  'سورية': 'Syrian',
  'عراقي': 'Iraqi',
  'عراقية': 'Iraqi',
  'اردني': 'Jordanian',
  'أردني': 'Jordanian',
  'اردنية': 'Jordanian',
  'أردنية': 'Jordanian',
  'فلسطيني': 'Palestinian',
  'فلسطينية': 'Palestinian',
  'مصري': 'Egyptian',
  'مصرية': 'Egyptian',
  'سعودي': 'Saudi',
  'سعودية': 'Saudi',
  'اماراتي': 'Emirati',
  'إماراتي': 'Emirati',
  'اماراتية': 'Emirati',
  'إماراتية': 'Emirati',
  'كويتي': 'Kuwaiti',
  'كويتية': 'Kuwaiti',
  'قطري': 'Qatari',
  'قطرية': 'Qatari',
  'بحريني': 'Bahraini',
  'بحرينية': 'Bahraini',
  'عماني': 'Omani',
  'عمانية': 'Omani',
  'يمني': 'Yemeni',
  'يمنية': 'Yemeni',

  // Europe
  'ايرلندي': 'Irish',
  'ايرلندية': 'Irish',
  'إيرلندي': 'Irish',
  'إيرلندية': 'Irish',
  'بريطاني': 'British',
  'بريطانية': 'British',
  'انجليزي': 'British',
  'انجليزية': 'British',
  'إنجليزي': 'British',
  'إنجليزية': 'British',
  'فرنسي': 'French',
  'فرنسية': 'French',
  'الماني': 'German',
  'المانية': 'German',
  'ألماني': 'German',
  'ألمانية': 'German',
  'ايطالي': 'Italian',
  'ايطالية': 'Italian',
  'إيطالي': 'Italian',
  'إيطالية': 'Italian',
  'اسباني': 'Spanish',
  'اسبانية': 'Spanish',
  'إسباني': 'Spanish',
  'إسبانية': 'Spanish',
  'هولندي': 'Dutch',
  'هولندية': 'Dutch',
  'بلجيكي': 'Belgian',
  'بلجيكية': 'Belgian',
  'سويسري': 'Swiss',
  'سويسرية': 'Swiss',
  'نمساوي': 'Austrian',
  'نمساوية': 'Austrian',
  'بولندي': 'Polish',
  'بولندية': 'Polish',
  'روسي': 'Russian',
  'روسية': 'Russian',
  'اوكراني': 'Ukrainian',
  'اوكرانية': 'Ukrainian',
  'أوكراني': 'Ukrainian',
  'أوكرانية': 'Ukrainian',
  'يوناني': 'Greek',
  'يونانية': 'Greek',
  'تركي': 'Turkish',
  'تركية': 'Turkish',

  // Americas
  'امريكي': 'American',
  'امريكية': 'American',
  'أمريكي': 'American',
  'أمريكية': 'American',
  'كندي': 'Canadian',
  'كندية': 'Canadian',
  'مكسيكي': 'Mexican',
  'مكسيكية': 'Mexican',
  'برازيلي': 'Brazilian',
  'برازيلية': 'Brazilian',
  'ارجنتيني': 'Argentine',
  'ارجنتينية': 'Argentine',

  // Asia
  'هندي': 'Indian',
  'هندية': 'Indian',
  'باكستاني': 'Pakistani',
  'باكستانية': 'Pakistani',
  'بنغلاديشي': 'Bangladeshi',
  'بنغلاديشية': 'Bangladeshi',
  'سريلانكي': 'Sri Lankan',
  'سريلانكية': 'Sri Lankan',
  'فلبيني': 'Filipino',
  'فلبينية': 'Filipino',
  'اندونيسي': 'Indonesian',
  'اندونيسية': 'Indonesian',
  'إندونيسي': 'Indonesian',
  'إندونيسية': 'Indonesian',
  'صيني': 'Chinese',
  'صينية': 'Chinese',
  'ياباني': 'Japanese',
  'يابانية': 'Japanese',
  'كوري': 'Korean',
  'كورية': 'Korean',

  // Africa
  'سوداني': 'Sudanese',
  'سودانية': 'Sudanese',
  'تونسي': 'Tunisian',
  'تونسية': 'Tunisian',
  'جزائري': 'Algerian',
  'جزائرية': 'Algerian',
  'مغربي': 'Moroccan',
  'مغربية': 'Moroccan',
  'ليبي': 'Libyan',
  'ليبية': 'Libyan',
  'اثيوبي': 'Ethiopian',
  'اثيوبية': 'Ethiopian',
  'إثيوبي': 'Ethiopian',
  'إثيوبية': 'Ethiopian',
  'كيني': 'Kenyan',
  'كينية': 'Kenyan',
  'نيجيري': 'Nigerian',
  'نيجيرية': 'Nigerian',
};

/** 3-letter country code to full name */
const COUNTRY_CODE_MAP: Record<string, string> = {
  'LBN': 'Lebanon', 'LEB': 'Lebanon',
  'SYR': 'Syria',
  'IRQ': 'Iraq',
  'JOR': 'Jordan',
  'PSE': 'Palestine', 'PLE': 'Palestine',
  'EGY': 'Egypt',
  'SAU': 'Saudi Arabia', 'KSA': 'Saudi Arabia',
  'ARE': 'United Arab Emirates', 'UAE': 'United Arab Emirates',
  'KWT': 'Kuwait',
  'QAT': 'Qatar',
  'BHR': 'Bahrain',
  'OMN': 'Oman',
  'YEM': 'Yemen',
  'IRL': 'Ireland',
  'GBR': 'United Kingdom', 'UK': 'United Kingdom',
  'FRA': 'France',
  'DEU': 'Germany', 'GER': 'Germany',
  'ITA': 'Italy',
  'ESP': 'Spain',
  'NLD': 'Netherlands',
  'BEL': 'Belgium',
  'CHE': 'Switzerland',
  'AUT': 'Austria',
  'POL': 'Poland',
  'RUS': 'Russia',
  'UKR': 'Ukraine',
  'GRC': 'Greece',
  'TUR': 'Turkey',
  'USA': 'United States',
  'CAN': 'Canada',
  'MEX': 'Mexico',
  'BRA': 'Brazil',
  'ARG': 'Argentina',
  'IND': 'India',
  'PAK': 'Pakistan',
  'BGD': 'Bangladesh',
  'LKA': 'Sri Lanka',
  'PHL': 'Philippines',
  'IDN': 'Indonesia',
  'CHN': 'China',
  'JPN': 'Japan',
  'KOR': 'South Korea',
  'SDN': 'Sudan',
  'TUN': 'Tunisia',
  'DZA': 'Algeria',
  'MAR': 'Morocco',
  'LBY': 'Libya',
  'ETH': 'Ethiopia',
  'KEN': 'Kenya',
  'NGA': 'Nigeria',
};

// ============================================================================
// Gender Mappings
// ============================================================================

const GENDER_MALE_PATTERNS = [
  'male', 'm', 'ذكر', 'رجل',
  'masculin', 'homme', 'männlich', 'mann',
];

const GENDER_FEMALE_PATTERNS = [
  'female', 'f', 'انثى', 'أنثى', 'امرأة', 'إمرأة',
  'féminin', 'femme', 'weiblich', 'frau',
];

// ============================================================================
// Place Name Mappings
// ============================================================================

/** Common Arabic place names to English */
const PLACE_NAME_MAP: Record<string, string> = {
  // Lebanese cities
  'بيروت': 'Beirut',
  'طرابلس': 'Tripoli',
  'صيدا': 'Sidon',
  'صور': 'Tyre',
  'جبيل': 'Byblos',
  'زحلة': 'Zahle',
  'جونيه': 'Jounieh',
  'البترون': 'Batroun',
  'بعلبك': 'Baalbek',
  'النبطية': 'Nabatieh',
  'عاليه': 'Aley',
  'المتن': 'Metn',
  'كسروان': 'Keserwan',
  'الشوف': 'Chouf',

  // Countries as places
  'لبنان': 'Lebanon',
  'سوريا': 'Syria',
  'العراق': 'Iraq',
  'الاردن': 'Jordan',
  'الأردن': 'Jordan',
  'فلسطين': 'Palestine',
  'مصر': 'Egypt',
  'السعودية': 'Saudi Arabia',
  'الامارات': 'UAE',
  'الإمارات': 'UAE',
  'الكويت': 'Kuwait',
  'قطر': 'Qatar',
  'البحرين': 'Bahrain',
  'عمان': 'Oman',
  'اليمن': 'Yemen',
  'ايرلندا': 'Ireland',
  'إيرلندا': 'Ireland',
  'بريطانيا': 'United Kingdom',
  'انجلترا': 'England',
  'إنجلترا': 'England',
  'فرنسا': 'France',
  'المانيا': 'Germany',
  'ألمانيا': 'Germany',
  'ايطاليا': 'Italy',
  'إيطاليا': 'Italy',
  'اسبانيا': 'Spain',
  'إسبانيا': 'Spain',
  'امريكا': 'United States',
  'أمريكا': 'United States',
  'الولايات المتحدة': 'United States',
  'كندا': 'Canada',
};

// ============================================================================
// Normalization Functions
// ============================================================================

/**
 * Normalize nationality from various formats to English
 */
export function normalizeNationality(raw: string): NormalizedField {
  if (!raw) return { raw: '', formatted: '' };

  const cleaned = raw.trim();

  // Check if it's a 3-letter country code
  const upperCleaned = cleaned.toUpperCase();
  if (COUNTRY_CODE_MAP[upperCleaned]) {
    return { raw: cleaned, formatted: COUNTRY_CODE_MAP[upperCleaned] };
  }

  // Check Arabic nationality mappings
  for (const [arabic, english] of Object.entries(ARABIC_NATIONALITY_MAP)) {
    if (cleaned.includes(arabic)) {
      return { raw: cleaned, formatted: english };
    }
  }

  // If it's already in English or unknown, return as-is with title case
  const formatted = cleaned
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());

  return { raw: cleaned, formatted };
}

/**
 * Normalize gender from various formats
 */
export function normalizeGender(raw: string): NormalizedField<NormalizedGender> {
  if (!raw) return { raw: '', formatted: 'unknown' };

  const cleaned = raw.trim().toLowerCase();

  // Check male patterns
  for (const pattern of GENDER_MALE_PATTERNS) {
    if (cleaned.includes(pattern) || cleaned === pattern) {
      return { raw, formatted: 'male' };
    }
  }

  // Check female patterns
  for (const pattern of GENDER_FEMALE_PATTERNS) {
    if (cleaned.includes(pattern) || cleaned === pattern) {
      return { raw, formatted: 'female' };
    }
  }

  // MRZ codes
  if (cleaned === 'x' || cleaned === '<') {
    return { raw, formatted: 'other' };
  }

  return { raw, formatted: 'unknown' };
}

/**
 * Normalize place name (city/country)
 */
export function normalizePlaceName(raw: string): NormalizedField {
  if (!raw) return { raw: '', formatted: '' };

  const cleaned = raw.trim();

  // Check place name mappings
  for (const [arabic, english] of Object.entries(PLACE_NAME_MAP)) {
    if (cleaned.includes(arabic)) {
      return { raw: cleaned, formatted: english };
    }
  }

  // Return with proper capitalization
  const formatted = cleaned
    .replace(/\s+/g, ' ')
    .trim();

  return { raw: cleaned, formatted };
}

/**
 * Normalize date to ISO format (YYYY-MM-DD)
 */
export function normalizeDate(raw: string): NormalizedField {
  if (!raw) return { raw: '', formatted: '' };

  const cleaned = raw.trim();

  // Convert Arabic numerals to Western
  const westernized = cleaned
    .replace(/[٠]/g, '0').replace(/[١]/g, '1').replace(/[٢]/g, '2')
    .replace(/[٣]/g, '3').replace(/[٤]/g, '4').replace(/[٥]/g, '5')
    .replace(/[٦]/g, '6').replace(/[٧]/g, '7').replace(/[٨]/g, '8')
    .replace(/[٩]/g, '9');

  // Try various date formats
  const patterns = [
    // DD/MM/YYYY
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
    // DD-MM-YYYY
    /(\d{1,2})-(\d{1,2})-(\d{4})/,
    // YYYY/MM/DD
    /(\d{4})\/(\d{1,2})\/(\d{1,2})/,
    // YYYY-MM-DD (already ISO)
    /(\d{4})-(\d{2})-(\d{2})/,
    // DD.MM.YYYY
    /(\d{1,2})\.(\d{1,2})\.(\d{4})/,
  ];

  for (const pattern of patterns) {
    const match = westernized.match(pattern);
    if (match) {
      let day, month, year;

      if (match[1].length === 4) {
        // YYYY/MM/DD or YYYY-MM-DD format
        year = match[1];
        month = match[2].padStart(2, '0');
        day = match[3].padStart(2, '0');
      } else {
        // DD/MM/YYYY or DD-MM-YYYY format
        day = match[1].padStart(2, '0');
        month = match[2].padStart(2, '0');
        year = match[3];
      }

      // Validate date parts
      const monthNum = parseInt(month, 10);
      const dayNum = parseInt(day, 10);
      const yearNum = parseInt(year, 10);

      if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31 && yearNum >= 1900 && yearNum <= 2100) {
        return { raw: cleaned, formatted: `${year}-${month}-${day}` };
      }
    }
  }

  // Return as-is if no pattern matched
  return { raw: cleaned, formatted: westernized };
}

/**
 * Normalize name (clean up and proper capitalization)
 */
export function normalizeName(raw: string): NormalizedField {
  if (!raw) return { raw: '', formatted: '' };

  const cleaned = raw.trim()
    // Remove common noise
    .replace(/[:\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // If it contains Arabic, keep as-is
  if (/[\u0600-\u06FF]/.test(cleaned)) {
    return { raw, formatted: cleaned };
  }

  // Title case for Latin text
  const formatted = cleaned
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());

  return { raw, formatted };
}

/**
 * Normalize document number (clean up)
 */
export function normalizeDocumentNumber(raw: string): NormalizedField {
  if (!raw) return { raw: '', formatted: '' };

  // Convert Arabic numerals and remove spaces
  const formatted = raw
    .replace(/[٠]/g, '0').replace(/[١]/g, '1').replace(/[٢]/g, '2')
    .replace(/[٣]/g, '3').replace(/[٤]/g, '4').replace(/[٥]/g, '5')
    .replace(/[٦]/g, '6').replace(/[٧]/g, '7').replace(/[٨]/g, '8')
    .replace(/[٩]/g, '9')
    .replace(/\s+/g, '')
    .toUpperCase();

  return { raw, formatted };
}

/**
 * Get country code from country name or nationality
 */
export function getCountryCode(nameOrNationality: string): string {
  if (!nameOrNationality) return '';

  const cleaned = nameOrNationality.trim().toLowerCase();

  // Reverse lookup from country code map
  for (const [code, name] of Object.entries(COUNTRY_CODE_MAP)) {
    if (name.toLowerCase() === cleaned) {
      return code;
    }
  }

  // Check if it's already a code
  const upperCleaned = nameOrNationality.trim().toUpperCase();
  if (COUNTRY_CODE_MAP[upperCleaned]) {
    return upperCleaned;
  }

  return '';
}

/**
 * Normalize all extracted fields at once
 */
export function normalizeExtractedData(
  rawData: Record<string, string | undefined>
): NormalizedExtractedData {
  const normalized: NormalizedExtractedData = {};

  if (rawData.documentNumber) {
    normalized.documentNumber = normalizeDocumentNumber(rawData.documentNumber);
  }

  if (rawData.fullName) {
    normalized.fullName = normalizeName(rawData.fullName);
  }

  if (rawData.fullNameArabic) {
    normalized.fullNameArabic = normalizeName(rawData.fullNameArabic);
  }

  if (rawData.givenNames) {
    normalized.givenNames = normalizeName(rawData.givenNames);
  }

  if (rawData.surname) {
    normalized.surname = normalizeName(rawData.surname);
  }

  if (rawData.fatherName) {
    normalized.fatherName = normalizeName(rawData.fatherName);
  }

  if (rawData.motherName) {
    normalized.motherName = normalizeName(rawData.motherName);
  }

  if (rawData.dateOfBirth) {
    normalized.dateOfBirth = normalizeDate(rawData.dateOfBirth);
  }

  if (rawData.dateOfExpiry) {
    normalized.dateOfExpiry = normalizeDate(rawData.dateOfExpiry);
  }

  if (rawData.dateOfIssue) {
    normalized.dateOfIssue = normalizeDate(rawData.dateOfIssue);
  }

  if (rawData.placeOfBirth) {
    normalized.placeOfBirth = normalizePlaceName(rawData.placeOfBirth);
  }

  if (rawData.nationality) {
    normalized.nationality = normalizeNationality(rawData.nationality);
  }

  if (rawData.gender || rawData.sex) {
    normalized.gender = normalizeGender(rawData.gender || rawData.sex || '');
  }

  if (rawData.issuingCountry) {
    normalized.issuingCountry = normalizePlaceName(rawData.issuingCountry);
  }

  return normalized;
}

// ============================================================================
// Export
// ============================================================================

export default {
  normalizeNationality,
  normalizeGender,
  normalizePlaceName,
  normalizeDate,
  normalizeName,
  normalizeDocumentNumber,
  normalizeExtractedData,
  getCountryCode,
};
