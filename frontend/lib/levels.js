"use strict";

var constants = require("./constants");

class Levels {
  URGENT = constants.LEVEL_URGENT;
  WARN = constants.LEVEL_WARN;
  INFO = constants.LEVEL_INFO;
  LOW = constants.LEVEL_LOW;
  LOWEST = constants.LEVEL_LOWEST;
  NONE = constants.LEVEL_NONE;

  constructor() {
    this.language = require("./language")();
    this.translate = this.language.translate;
  }

  /** @param {import("./types").Level} level */
  isAlarm(level) {
    return level === this.WARN || level === this.URGENT;
  }

  /** @param {import("./types").Level} level */
  toDisplay(level) {
    if (
      (level !== 0 && !level) ||
      typeof level !== "number" ||
      level < this.NONE ||
      level > this.URGENT
    ) {
      // @ts-expect-error `Unknown` isn't a translation key - would `No data available` work instead?
      return this.translate("Unknown");
    }

    switch (level) {
      case this.URGENT:
        return this.translate("Urgent");
      case this.WARN:
        return this.translate("Warning");
      case this.INFO:
        return this.translate("Info");
      case this.LOW:
        return this.translate("Low");
      case this.LOWEST:
        return this.translate("Lowest");
      case this.NONE:
        return this.translate("None");
    }
  }

  /** @param {import("./types").Level} level */
  toLowerCase(level) {
    return this.toDisplay(level).toLowerCase();
  }

  /** @param {import("./types").Level} level */
  toStatusClass(level) {
    if (level === this.WARN) {
      return "warn";
    } else if (level === this.URGENT) {
      return "urgent";
    } else {
      return "current";
    }
  }
}

module.exports = new Levels();
