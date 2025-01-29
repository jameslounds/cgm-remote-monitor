"use strict";

/** @import {Plugin} from "../types" */
/** @import {PluginCtx} from "." */
/** @import {InitializedSandbox} from "../sandbox" */

const times = require("../times");

/**
 * Server only?
 *
 * @implements {Plugin}
 */
class SimpleAlarmsPlugin {
  name = /** @type {const} */ ("simplealarms");
  label = "Simple Alarms";
  pluginType = "notification";

  /** @param {PluginCtx} ctx */
  constructor(ctx) {
    this.levels = ctx.levels;
  }

  /** @param {InitializedSandbox} sbx */
  checkNotifications(sbx) {
    const lastSGVEntry = sbx.lastSGVEntry();
    const scaledSGV = sbx.scaleEntry(lastSGVEntry);

    if (!scaledSGV || !lastSGVEntry) return;
    if (
      lastSGVEntry.mgdl <= 39 ||
      sbx.time - lastSGVEntry.mills >= times.mins(10).msecs
    ) {
      return;
    }

    const result = this.compareBGToTresholds(scaledSGV, sbx);
    if (
      result.level === this.levels.WARN ||
      result.level === this.levels.URGENT
    ) {
      sbx.notifications.requestNotify({
        level: result.level,
        title: result.title,
        message: sbx.buildDefaultMessage(),
        eventName: result.eventName,
        plugin: this,
        pushoverSound: result.pushoverSound,
        debug: {
          lastSGV: scaledSGV,
          thresholds: sbx.settings.thresholds,
        },
      });
    }
  }

  /**
   * @param {number} scaledSGV
   * @param {InitializedSandbox} sbx
   * @returns
   */
  compareBGToTresholds(scaledSGV, sbx) {
    if (
      sbx.settings.alarmUrgentLow &&
      scaledSGV < sbx.scaleMgdl(sbx.settings.thresholds.bgLow)
    ) {
      return /** @type {const} */ ({
        level: this.levels.URGENT,
        title: this.levels.toDisplay(this.levels.URGENT) + " LOW",
        pushoverSound: "persistent",
        eventName: "low",
      });
    } else if (
      sbx.settings.alarmLow &&
      scaledSGV < sbx.scaleMgdl(sbx.settings.thresholds.bgTargetBottom)
    ) {
      return /** @type {const} */ ({
        level: this.levels.WARN,
        title: this.levels.toDisplay(this.levels.WARN) + " LOW",
        pushoverSound: "falling",
        eventName: "low",
      });
    }

    if (
      sbx.settings.alarmUrgentHigh &&
      scaledSGV > sbx.scaleMgdl(sbx.settings.thresholds.bgHigh)
    ) {
      return /** @type {const} */ ({
        level: this.levels.URGENT,
        title: this.levels.toDisplay(this.levels.URGENT) + " HIGH",
        pushoverSound: "persistent",
        eventName: "high",
      });
    } else if (
      sbx.settings.alarmHigh &&
      scaledSGV > sbx.scaleMgdl(sbx.settings.thresholds.bgTargetTop)
    ) {
      return /** @type {const} */ ({
        level: this.levels.WARN,
        title: this.levels.toDisplay(this.levels.WARN) + " HIGH",
        pushoverSound: "climb",
        eventName: "high",
      });
    }

    return /** @type {const} */ ({ level: this.levels.INFO });
  }
}

/** @param {PluginCtx} ctx */
module.exports = (ctx) => new SimpleAlarmsPlugin(ctx);
