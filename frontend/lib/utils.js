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
   */
  formatAgo(m, nowMills) {
    const ago = this.timeago.calcDisplay({ mills: m.valueOf() }, nowMills);
    if(ago.shortLabel !== "d" && ago.shortLabel !== "h" && ago.shortLabel !== "m") return
    return this.translate(
      `%1${ago.shortLabel} ago`,
      { params: [ago.value?.toString() ?? ""] }
    );
  }

  /**
   * @param {string | undefined} prefix
   * @param {*} sbx
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
