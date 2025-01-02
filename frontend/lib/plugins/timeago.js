"use strict";

const times = require("../times");
let lastChecked = new Date();
let lastRecoveryTimeFromSuspend = new Date("1900-01-01");

/** @typedef {{time: number; entry: {mills: number}; timeSince?: number}} ResolverOpts */
/** @typedef {(opts: ResolverOpts) => undefined | {value?: number; label: import("../language").TranslationKey; shortLabel?: string}} Resolver */
/** @typedef {import("../types").Plugin} Plugin */
/** @implements {Plugin} */
class TimeAgo {
  name = /** @type {import("../language").TranslationKey} */ ("timeago");
  label = /** @type {import("../language").TranslationKey} */ ("Timeago");
  pluginType = "pill-status";
  pillFlip = true;

  /** @param {{language: ReturnType<import("../language")>; levels: import("../levels")}} ctx */
  constructor(ctx) {
    this.translate = ctx.language.translate;
    this.levels = ctx.levels;

    this.resolvers = [
      this.#isMissing,
      this.#inTheFuture,
      this.#almostInTheFuture,
      this.#isLessThan(times.mins(2).msecs, times.min().msecs, "min ago", "m"),
      this.#isLessThan(times.hour().msecs, times.min().msecs, "mins ago", "m"),
      this.#isLessThan(
        times.hours(2).msecs,
        times.hour().msecs,
        "hour ago",
        "h"
      ),
      this.#isLessThan(times.day().msecs, times.hour().msecs, "hours ago", "h"),
      this.#isLessThan(times.days(2).msecs, times.day().msecs, "day ago", "d"),
      this.#isLessThan(times.week().msecs, times.day().msecs, "days ago", "d"),
      /** @satisfies {Resolver} */
      function () {
        return {
          value: undefined,
          label: /** @type {const} */ ("long ago"),
          shortLabel: /** @type {const} */ ("ago"),
        };
      },
    ].map((resolver) => resolver.bind(this));
  }

  /** @param {import("../sandbox").InitializedSandbox} sbx */
  checkNotifications(sbx) {
    if (!sbx.extendedSettings.enableAlerts) return;

    const lastSGVEntry = sbx.lastSGVEntry();
    if (!lastSGVEntry || lastSGVEntry.mills >= sbx.time) return;

    const status = this.checkStatus(sbx);
    if (status === "current") return;

    this.#sendAlarm(sbx, lastSGVEntry, {
      level: { urgent: this.levels.URGENT, warn: this.levels.WARN }[status],
      pushoverSound: "echo",
    });
  }

  /**
   * @param {import("../sandbox").InitializedSandbox} sbx
   * @param {{value?: number | null; label:string}} agoDisplay
   */
  #buildMessage(sbx, agoDisplay) {
    return [
      `${this.translate("Last received:")} ${agoDisplay.value} ${agoDisplay.label}`,
      ...sbx.prepareDefaultLines(),
    ].join("\n");
  }

  /**
   * @param {import("../sandbox").InitializedSandbox} sbx
   * @param {import("../types").Entry} lastSGVEntry
   * @param {{level: import("../types").Level; pushoverSound: string}} opts
   */
  #sendAlarm(sbx, lastSGVEntry, opts) {
    const agoDisplay = this.calcDisplay(lastSGVEntry, sbx.time);
    if (!agoDisplay) return;

    sbx.notifications.requestNotify({
      level: opts.level,
      title: this.translate("Stale data, check rig?"),
      message: this.#buildMessage(sbx, agoDisplay),
      eventName: this.name,
      plugin: this,
      group: "Time Ago",
      pushoverSound: opts.pushoverSound,
      debug: agoDisplay,
    });
  }

  /** @param {import("../sandbox").InitializedSandbox} sbx */
  checkStatus(sbx) {
    // Check if the app has been suspended; if yes, snooze data missing alarmn for 15 seconds
    const now = new Date();
    const delta = now.getTime() - lastChecked.getTime();
    lastChecked = now;

    if (this.#isHibernationDetected(sbx, delta, now)) {
      console.log("Hibernation detected, suspending timeago alarm");
      return "current";
    }

    const lastSGVEntry = sbx.lastSGVEntry();
    if (!lastSGVEntry) return "current";

    /** @param {import("../types").Entry} lastSGVEntry @param {number} mins */
    function isStale(lastSGVEntry, mins) {
      return sbx.time - lastSGVEntry.mills > times.mins(mins).msecs;
    }

    if (
      sbx.settings.alarmTimeagoUrgent &&
      isStale(lastSGVEntry, sbx.settings.alarmTimeagoUrgentMins || 15)
    ) {
      return "urgent";
    } else if (
      sbx.settings.alarmTimeagoWarn &&
      isStale(lastSGVEntry, sbx.settings.alarmTimeagoWarnMins || 30)
    ) {
      return "warn";
    }

    return "current";
  }

  /**
   * @param {import("../sandbox").InitializedSandbox} sbx
   * @param {number} delta
   * @param {Date} now
   */
  #isHibernationDetected(sbx, delta, now) {
    // Assume server never hibernates, or if it does, it's alarm-worthy
    if (sbx.runtimeEnvironment !== "client") return false;

    if (delta > 20 * 1000) {
      // Looks like we've been hibernating
      lastRecoveryTimeFromSuspend = now;
    }
    const timeSinceLastRecovered =
      now.getTime() - lastRecoveryTimeFromSuspend.getTime();
    return timeSinceLastRecovered < 10 * 1000;
  }

  /** @satisfies {Resolver} @param {ResolverOpts} opts */
  #isMissing(opts) {
    if (
      !opts ||
      !opts.entry ||
      isNaN(opts.entry.mills) ||
      isNaN(opts.time) ||
      isNaN(opts.timeSince ?? NaN)
    ) {
      return {
        value: undefined,
        label: /** @type {const} */ ("time ago"),
        shortLabel: /** @type {"ago"} */ (this.translate("ago")),
      };
    }
  }

  /** @satisfies {Resolver} @param {ResolverOpts} opts */
  #inTheFuture(opts) {
    if (opts.entry.mills - times.mins(5).msecs > opts.time) {
      return {
        value: undefined,
        label: /** @type {const} */ ("in the future"),
        shortLabel: /** @type {"future"} */ (this.translate("future")),
      };
    }
  }

  /** @satisfies {Resolver} @param {ResolverOpts} opts */
  #almostInTheFuture(opts) {
    if (opts.entry.mills > opts.time) {
      return {
        value: 1,
        label: /** @type {const} */ ("min ago"),
        shortLabel: /** @type {const} */ ("m"),
      };
    }
  }

  /**
   * @template {import("../language").TranslationKey} TLabel
   * @param {number} limit
   * @param {number} divisor
   * @param {TLabel} label
   * @param {"d" | "m" | "h"} shortLabel
   */
  #isLessThan(limit, divisor, label, shortLabel) {
    /** @satisfies {Resolver} @param {ResolverOpts} opts */
    return function checkIsLessThan(opts) {
      if (opts.timeSince !== undefined && opts.timeSince < limit) {
        return {
          value: Math.max(1, Math.round(opts.timeSince / divisor)),
          label: label,
          shortLabel: shortLabel,
        };
      }
    };
  }

  /** @param {{mills: number}} entry @param {number} time */
  calcDisplay(entry, time) {
    /** @type {ResolverOpts} */
    const opts = {
      time: time,
      entry: entry,
    };

    if (time && entry && entry.mills) {
      opts.timeSince = time - entry.mills;
    }

    for (const resolver of this.resolvers) {
      const value = resolver(opts);
      if (value) {
        return value;
      }
    }
    throw Error(`No resolvers resolved for entry ${JSON.stringify(entry)}`);
  }

  /** @param {import("../sandbox").InitializedSandbox} sbx  */
  updateVisualisation(sbx) {
    const lastSGVEntry = sbx.lastSGVEntry();
    if (!lastSGVEntry) return;
    const agoDisplay = this.calcDisplay(lastSGVEntry, sbx.time);
    if (!agoDisplay) return;
    const inRetroMode = sbx.data.inRetroMode;
    if (!sbx.pluginBase) return;
    sbx.pluginBase.updatePillText(this, {
      value: inRetroMode ? null : agoDisplay.value,
      label: inRetroMode
        ? this.translate("RETRO")
        : this.translate(agoDisplay.label),
      //no warning/urgent class when in retro mode
      pillClass: inRetroMode ? "current" : this.checkStatus(sbx),
      labelClass: "",
      valueClass: "",
    });
  }
}

/** @param {ConstructorParameters<typeof TimeAgo>[0]} ctx */
module.exports = (ctx) => new TimeAgo(ctx);
