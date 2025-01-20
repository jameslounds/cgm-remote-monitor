"use strict";

const times = require("../times");
const consts = require("../constants");

/**
 * @typedef {{
 *   display: string;
 *   current: ReturnType<
 *     ReturnType<import("../profilefunctions")>["getTempBasal"]
 *   >;
 * }} BasalProperties
 */

/** @typedef {import("../types").Plugin} Plugin */
/** @implements {Plugin} */
class BasalProfile {
  name = /** @type {const} */ ("basal");
  label = "Basal Profile";
  pluginType = "pill-minor";

  /** @param {import(".").PluginCtx} ctx */
  constructor(ctx) {
    this.moment = ctx.moment;
    this.translate = ctx.language.translate;
  }

  /** @param {import("../sandbox").ClientInitializedSandbox} sbx */
  setProperties(sbx) {
    if (!this.hasRequiredInfo(sbx)) return;

    const profile = sbx.data.profile;
    const current = profile.getTempBasal(sbx.time);

    let tempMark = "";
    tempMark += current.treatment ? "T" : "";
    tempMark += current.combobolustreatment ? "C" : "";
    tempMark += tempMark ? ": " : "";

    sbx.offerProperty("basal", function setBasal() {
      return {
        display: tempMark + current.totalbasal.toFixed(3) + "U",
        current: current,
      };
    });
  }

  /**
   * @param {import("../sandbox").ClientInitializedSandbox} sbx
   * @returns {sbx is
   *   import("../sandbox").ClientInitializedSandbox & { data: {profile:
   *   ReturnType<import("../profilefunctions")>}}}
   */
  hasRequiredInfo(sbx) {
    if (!sbx.data.profile) {
      return false;
    }

    if (!sbx.data.profile.hasData()) {
      console.warn(
        "For the Basal plugin to function you need a treatment profile"
      );
      return false;
    }

    if (!sbx.data.profile.getBasal()) {
      console.warn("For the Basal plugin to function you need a basal profile");
      return false;
    }

    return true;
  }

  /** @param {import("../sandbox").ClientInitializedSandbox} sbx */
  updateVisualisation(sbx) {
    if (!this.hasRequiredInfo(sbx)) return;

    const profile = sbx.data.profile;
    const prop = sbx.properties.basal;
    const basalValue = prop && prop.current;

    const tzMessage = profile.getTimezone() ?? "Timezone not set in profile";

    let sensitivity = profile.getSensitivity(sbx.time) ?? NaN;
    const units = profile.getUnits();

    if (sbx.settings.units != units) {
      sensitivity *=
        sbx.settings.units === "mmol"
          ? 1 / consts.MMOL_TO_MGDL
          : consts.MMOL_TO_MGDL;
      const decimals = sbx.settings.units === "mmol" ? 10 : 1;

      sensitivity = Math.round(sensitivity * decimals) / decimals;
    }

    const info = [
      {
        label: this.translate("Current basal"),
        value: prop?.display,
      },
      {
        label: this.translate("Sensitivity"),
        value: sensitivity + " " + sbx.settings.units + " / U",
      },
      {
        label: this.translate("Current Carb Ratio"),
        value: "1 U / " + profile.getCarbRatio(sbx.time) + "g",
      },
      {
        label: this.translate("Basal timezone"),
        value: tzMessage,
      },
      {
        label: "------------",
        value: "",
      },
      {
        label: this.translate("Active profile"),
        value: profile.activeProfileToTime(sbx.time),
      },
    ];

    /** @type {string} */
    let tempText;
    /** @type {number} */
    let remaining;
    if (basalValue?.treatment) {
      tempText = basalValue.treatment.percent
        ? (basalValue.treatment.percent > 0 ? "+" : "") +
          basalValue.treatment.percent +
          "%"
        : !isNaN(basalValue.treatment.absolute)
          ? basalValue.treatment.absolute + "U/h"
          : "";
      remaining = parseInt(
        (basalValue.treatment.duration ?? NaN) -
          times.msecs(sbx.time - basalValue.treatment.mills).mins
      );
      info.push({
        label: "------------",
        value: "",
      });
      info.push({
        label: this.translate("Active temp basal"),
        value: tempText,
      });
      info.push({
        label: this.translate("Active temp basal start"),
        value: new Date(basalValue.treatment.mills).toLocaleString(),
      });
      info.push({
        label: this.translate("Active temp basal duration"),
        value:
          parseInt(basalValue.treatment.duration ?? NaN) +
          " " +
          this.translate("mins"),
      });
      info.push({
        label: this.translate("Active temp basal remaining"),
        value: remaining + " " + this.translate("mins"),
      });
      info.push({
        label: this.translate("Basal profile value"),
        value: basalValue.basal.toFixed(3) + " U",
      });
    }

    if (basalValue?.combobolustreatment) {
      tempText = basalValue.combobolustreatment.relative
        ? "+" + basalValue.combobolustreatment.relative + "U/h"
        : "";
      remaining = parseInt(
        (basalValue.combobolustreatment.duration ?? NaN) -
          times.msecs(sbx.time - basalValue.combobolustreatment.mills).mins
      );
      info.push({ label: "------------", value: "" });
      info.push({
        label: this.translate("Active combo bolus"),
        value: tempText,
      });
      info.push({
        label: this.translate("Active combo bolus start"),
        value: new Date(basalValue.combobolustreatment.mills).toLocaleString(),
      });
      info.push({
        label: this.translate("Active combo bolus duration"),
        value:
          parseInt(basalValue.combobolustreatment.duration ?? NaN) +
          " " +
          this.translate("mins"),
      });
      info.push({
        label: this.translate("Active combo bolus remaining"),
        value: remaining + " " + this.translate("mins"),
      });
    }

    sbx.pluginBase.updatePillText(this, {
      value: prop?.display,
      label: this.translate("BASAL"),
      info: info,
    });
  }

  /**
   * @param {{ pwd?: { value?: { toString: () => string } } } | undefined} slots
   * @param {import("../sandbox").ClientInitializedSandbox} sbx
   * @protected
   */
  basalMessage(slots, sbx) {
    if (!sbx.data.profile) return;

    const basalValue = sbx.data.profile.getTempBasal(sbx.time);
    const pwd = slots?.pwd?.value;
    const preamble = pwd
      ? this.translate("virtAsstPreamble3person", {
          params: [pwd.toString()],
        })
      : this.translate("virtAsstPreamble");

    if (basalValue.treatment) {
      const minutesLeft = this.moment(basalValue.treatment.endmills).from(
        this.moment(sbx.time)
      );
      return this.translate("virtAsstBasalTemp", {
        params: [preamble, basalValue.totalbasal.toString(), minutesLeft],
      });
    } else {
      return this.translate("virtAsstBasal", {
        params: [preamble, basalValue.totalbasal.toString()],
      });
    }
  }

  /**
   * @type {import("../types").VirtAsstRollupHandlerFn}
   * @protected
   */
  virtAsstRollupCurrentBasalHandler(slots, sbx, callback) {
    callback(null, { results: this.basalMessage(slots, sbx), priority: 1 });
  }
  /**
   * @type {import("../types").VirtAsstIntentHandlerFn}
   * @protected
   */
  virtAsstCurrentBasalhandler(next, slots, sbx) {
    next(
      this.translate("virtAsstTitleCurrentBasal"),
      this.basalMessage(slots, sbx) ?? ""
    );
  }

  virtAsst = {
    rollupHandlers: [
      {
        rollupGroup: "Status",
        rollupName: "current basal",
        rollupHandler: this.virtAsstRollupCurrentBasalHandler.bind(this),
      },
    ],
    intentHandlers: [
      {
        intent: "MetricNow",
        metrics: ["basal", "current basal"],
        intentHandler: this.virtAsstCurrentBasalhandler.bind(this),
      },
    ],
  };
}

/** @param {import(".").PluginCtx} ctx */
module.exports = (ctx) => new BasalProfile(ctx);
