import { zh } from "./zh";
import { en } from "./en";
import type { Locale } from "../config";

export type MessageKey = keyof typeof zh;

export const messages: Record<Locale, Record<string, string>> = {
  zh,
  en,
};
