import { LocalizedStrings } from '../types';
import { defaultStrings } from '../utils/defaultStrings';

export class LocalizationManager {
  private static instance: LocalizationManager;
  private strings: LocalizedStrings = defaultStrings;

  private constructor() {}

  static getInstance(): LocalizationManager {
    if (!LocalizationManager.instance) {
      LocalizationManager.instance = new LocalizationManager();
    }
    return LocalizationManager.instance;
  }

  setStrings(customStrings: Partial<LocalizedStrings>): void {
    this.strings = { ...defaultStrings, ...customStrings };
  }

  getStrings(): LocalizedStrings {
    return this.strings;
  }

  getString(key: keyof LocalizedStrings): string {
    return this.strings[key] || key;
  }

  static mergeStrings(customStrings?: Partial<LocalizedStrings>): LocalizedStrings {
    return { ...defaultStrings, ...customStrings };
  }
}

export const localizationManager = LocalizationManager.getInstance();

export const createLocalizedStrings = (customStrings?: Partial<LocalizedStrings>): LocalizedStrings => {
  return LocalizationManager.mergeStrings(customStrings);
};