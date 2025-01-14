"use strict";

const times = require("../times");

/** @typedef {import("../types").Plugin} Plugin */
/** @implements {Plugin} */
class ErrorCodes {
  name = /** @type {const} */ ("errorcodes");
  label = "Dexcom Error Codes";
  pluginType = "notification";

  /** @param {import(".").PluginCtx} ctx */
  constructor(ctx) {
    this.ctx = ctx;
  }

  /** @type {Partial<Record<number, string>>} @protected */
  static code2Display = {
    1: "?SN", //SENSOR_NOT_ACTIVE
    2: "?MD", //MINIMAL_DEVIATION
    3: "?NA", //NO_ANTENNA
    5: "?NC", //SENSOR_NOT_CALIBRATED
    6: "?CD", //COUNTS_DEVIATION
    9: "?AD", //ABSOLUTE_DEVIATION
    10: "???", //POWER_DEVIATION
    12: "?RF", //BAD_RF
  };

  /** @type {Partial<Record<number, string>>} @protected */
  static code2PushoverSound = {
    5: "intermission",
    9: "alien",
    10: "alien",
  };

  /** @param {number} errorCode */
  toDisplay(errorCode) {
    return ErrorCodes.code2Display[errorCode] || errorCode + "??";
  }

  /** @param {import("../sandbox").InitializedSandbox} sbx */
  checkNotifications(sbx) {
    const now = sbx.time;
    const lastSGV = sbx.lastSGVEntry();

    const code2Level = this.buildMappingFromSettings(sbx.extendedSettings);

    if (
      lastSGV &&
      now - lastSGV.mills < times.mins(10).msecs &&
      lastSGV.mgdl < 39
    ) {
      const errorDisplay = this.toDisplay(lastSGV.mgdl);
      const notifyLevel = code2Level[lastSGV.mgdl];

      if (notifyLevel !== undefined) {
        sbx.notifications.requestNotify({
          level: notifyLevel,
          title: "CGM Error Code",
          message: errorDisplay,
          plugin: this,
          pushoverSound: ErrorCodes.code2PushoverSound[lastSGV.mgdl],
          group: "CGM Error Code",
          debug: {
            lastSGV: lastSGV,
          },
        });
      }
    }
  }

  /**
   * Could be made `protected` and subclassed for tests
   *
   * @param {ReturnType<import("../settings")>["extendedSettings"]} extendedSettings
   */
  buildMappingFromSettings(extendedSettings) {
    /** @type {Record<number, import("../types").Level>} */
    const mapping = {};

    /** @param {string | undefined} value @param {import("../types").Level} level */
    function addValuesToMapping(value, level) {
      if (typeof value !== "string") return;

      value
        .split(" ")
        .forEach((num) => !isNaN(num) && (mapping[Number(num)] = level));
    }

    addValuesToMapping(
      extendedSettings.info || "1 2 3 4 5 6 7 8",
      this.ctx.levels.INFO
    );
    addValuesToMapping(extendedSettings.warn || false, this.ctx.levels.WARN);
    addValuesToMapping(
      extendedSettings.urgent || "9 10",
      this.ctx.levels.URGENT
    );

    return mapping;
  }
}

/** @param {import(".").PluginCtx} ctx */
module.exports = (ctx) => new ErrorCodes(ctx);
