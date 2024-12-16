"use strict";

var constants = require("./constants");

class Levels {
  URGENT = constants.LEVEL_URGENT;
  WARN = constants.LEVEL_WARN;
  INFO = constants.LEVEL_INFO;
  LOW = constants.LEVEL_LOW;
  LOWEST = constants.LEVEL_LOWEST;
  NONE = constants.LEVEL_NONE;
  #translationKeysByLevel = /** @type {const} */ ({
    2: "Urgent",
    1: "Warning",
    0: "Info",
    "-1": "Low",
    "-2": "Lowest",
    "-3": "None",
  });

  constructor() {
    this.language = require("./language")();
    this.translate = this.language.translate;
  }

  isAlarm(level) {
    return level === this.WARN || level === this.URGENT;
  }

  toDisplay(level) {
    if (!(level in this.#translationKeysByLevel)) {
      // `Unknown` isn't a translation key - would `No data available` work instead?
      return this.translate("Unknown");
    }

    return this.translate(this.#translationKeysByLevel[level.toString()]);
  }

  toLowerCase(level) {
    return this.toDisplay(level).toLowerCase();
  }

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
