"use strict";

var units = require("./units")();

class Utils {
  /** @param {{moment: import("moment-timezone"); settings: any; language: ReturnType<import("./language")>; levels: import("./levels")}} ctx */
  constructor(ctx) {
    this.moment = ctx.moment;
    this.settings = ctx.settings;
    this.translate = ctx.language.translate;
    this.timeago = require("./plugins/timeago")(ctx);
  }

  /** @param {number} mgdl */
  scaleMgdl(mgdl) {
    if (this.settings.units === "mmol" && mgdl) {
      return Number(units.mgdlToMMOL(mgdl));
    } else {
      return Number(mgdl);
    }
  }

  /** @param {number} bg - blood glucose */
  roundBGForDisplay(bg) {
    return this.settings.units === "mmol"
      ? Math.round(bg * 10) / 10
      : Math.round(bg);
  }

  /** @param {number} value */
  toFixed(value) {
    if (!value) {
      return "0";
    } else {
      var fixed = value.toFixed(2);
      return fixed === "-0.00" ? "0.00" : fixed;
    }
  }

  /**
   * Round the number to maxDigits places, return a string
   * that truncates trailing zeros
   * @param {number} value
   * @param {number} maxDigits
   */
  toRoundedStr(value, maxDigits) {
    if (!value) {
      return "0";
    }
    const mult = Math.pow(10, maxDigits);
    const fixed =
      (Math.sign(value) * Math.round(Math.abs(value) * mult)) / mult;
    if (isNaN(fixed)) return "0";
    return String(fixed);
  }

  /** @param {string} timestring @param {string} datestring */
  mergeInputTime(timestring, datestring) {
    return this.moment(datestring + " " + timestring, "YYYY-MM-D HH:mm");
  }

  /** @param {string} device */
  deviceName(device) {
    const last = device ? device.split("://").at(1) : "unknown";
    return last?.split("/")?.at(0);
  }

  /**
   * @param {import("moment-timezone").Moment} m
   * @param {ReturnType<import("./sandbox")>} sbx
   * */
  timeFormat(m, sbx) {
    var when;
    if (m && sbx.data.inRetroMode) {
      when = m.format("LT");
    } else if (m) {
      when = this.formatAgo(m, sbx.time);
    } else {
      when = "unknown";
    }

    return when;
  }

  /**
   * @param {import("moment-timezone").Moment} m
   * @param {number} nowMills
   * Assuming the time between `m` and `nowMills` is neither negative, nor more than a week,
   * this will return a translated string of `n{d|m|h} ago`.
   * However, if the time difference *is* negative, or more than a week,
   * then it will return just `"future"` or `"ago"`.
   * This is because before the class migration, `formatAgo` just returned
   * ```js
   *  translate(`%1${ago.shortLabel} ago`,
   *    { params: [ago.value ? ago.value : ''] }
   *   )
   * ```
   * Since `ago.value` is undefined when `shortLabel` is `"future"` or `"ago"`
   * (@see {@link https://github.com/nightscout/cgm-remote-monitor/blob/46069a/lib/plugins/timeago.js#L115-L181 Original `timeago.js#calcDisplay`}),
   * this is equivalent to `translate(ago.shortLabel)`.
   * However, since `timeago.js` actually (sometimes) pre-translated these `shortLabel`s before the class migration,
   * this would have mostly been fine for users. Since the class migration, the `shortLabel` is always untranslated 
   * (only this function and `pump`'s reimplementation of this function actually use `shortLabel`).
   * This function seems to only be called by the `loop` and `openaps` plugins, who want to
   * display the time since the last update from their respective services.
   * @see {@link https://github.com/nightscout/cgm-remote-monitor/blob/46069a/lib/utils.js#L76 Original `utils.js#formatAgo`}
   */
  formatAgo(m, nowMills) {
    const ago = this.timeago.calcDisplay({ mills: m.valueOf() }, nowMills);
    switch (ago.shortLabel) {
      case "d":
      case "m":
      case "h":
        return this.translate(`%1${ago.shortLabel} ago`, {
          params: [ago.value?.toString() ?? ""],
        });
      case "future":
      case "ago":
        return this.translate(ago.shortLabel);
    }
  }

  /**
   * @param {string | undefined} prefix
   * @param {ReturnType<import("./sandbox")>} sbx
   */
  timeAt(prefix, sbx) {
    return sbx.data.inRetroMode
      ? (prefix ? " " : "") + "@ "
      : prefix
        ? ", "
        : "";
  }
}

/** @param {ConstructorParameters<typeof Utils>} args */
module.exports = (...args) => new Utils(...args);
