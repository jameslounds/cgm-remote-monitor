"use strict";

import constants from "./constants.json";
import initLanguage, { TranslationKey } from "./language";

const language = initLanguage();
const translate = language.translate;

export type Level = (typeof constants)[`LEVEL_${
  | "URGENT"
  | "WARN"
  | "INFO"
  | "LOW"
  | "LOWEST"
  | "NONE"}`];
export type Levels = typeof levels;

const levels = {
  URGENT: constants.LEVEL_URGENT,
  WARN: constants.LEVEL_WARN,
  INFO: constants.LEVEL_INFO,
  LOW: constants.LEVEL_LOW,
  LOWEST: constants.LEVEL_LOWEST,
  NONE: constants.LEVEL_NONE,
  isAlarm,
  toDisplay,
  toLowerCase,
  toStatusClass,
  language,
  translate,
};

export default levels;

const level2Display: Record<Level, string> = {
  2: "Urgent",
  1: "Warning",
  0: "Info",
  [-1]: "Low",
  [-2]: "Lowest",
  [-3]: "None",
};

function isAlarm(level: Level) {
  return level === levels.WARN || level === levels.URGENT;
}

function toDisplay(level: Level) {
  const value = level2Display[level];
  return value
    ? translate(value as TranslationKey)
    : translate("Unknown" as TranslationKey);
}

function toLowerCase(level: Level) {
  return toDisplay(level).toLowerCase();
}

function toStatusClass(level: Level) {
  if (level === levels.WARN) {
    return "warn";
  } else if (level === levels.URGENT) {
    return "urgent";
  }

  return "current";
}
