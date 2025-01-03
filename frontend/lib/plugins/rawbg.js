"use strict";

/** @typedef {import("../types").Plugin} Plugin */
/** @implements {Plugin} */
class RawBg {
  name = "rawbg";
  label = "Raw BG";
  pluginType = "bg-status";
  pillFlip = true;

  /** @param {import(".").PluginCtx} ctx */
  constructor(ctx) {
    this.translate = ctx.language.translate;
  }

  /** @param {ReturnType<import("../sandbox")>} sbx */
  getPrefs(sbx) {
    return {
      display:
        sbx && sbx.extendedSettings.display
          ? sbx.extendedSettings.display
          : "unsmoothed",
    };
  }

  /** @param {import("../sandbox").InitializedSandbox} sbx */
  setProperties(sbx) {
    sbx.offerProperty("rawbg", () => {
      const currentSGV = sbx.lastSGVEntry();

      //TODO:OnlyOneCal - currently we only load the last cal, so we can't ignore future data
      const currentCal = sbx.data.cals.at(-1);

      const staleAndInRetroMode =
        sbx.data.inRetroMode && !sbx.isCurrent(currentSGV);

      if (staleAndInRetroMode || !currentSGV || !currentCal) return {};

      const mgdl = this.calc(currentSGV, currentCal, sbx);
      const noiseLabel = this.noiseCodeToDisplay(
        currentSGV.mgdl,
        currentSGV.noise
      );

      return {
        mgdl,
        noiseLabel,
        sgv: currentSGV,
        cal: currentCal,
        displayLine: `Raw BG: ${sbx.scaleMgdl(mgdl)} ${sbx.unitsLabel} ${noiseLabel}`,
      };
    });
  }

  /** @param {import("../sandbox").ClientInitializedSandbox} sbx */
  updateVisualisation(sbx) {
    const prop = sbx.properties.rawbg;

    const options =
      prop &&
      prop.sgv &&
      this.showRawBGs(prop.sgv.mgdl, prop.sgv.noise, prop.cal, sbx)
        ? {
            hide: !prop || !prop.mgdl,
            value: sbx.scaleMgdl(prop.mgdl),
            label: prop.noiseLabel,
          }
        : {
            hide: true,
          };

    sbx.pluginBase.updatePillText(this, options);
  }

  /**
   * @param {import("../types").Sgv} sgv
   * @param {import("../types").Cal | undefined} cal
   * @param {ReturnType<import("../sandbox")>} sbx
   */
  calc(sgv, cal, sbx) {
    const cleaned = this.cleanValues(sgv, cal);

    const prefs = this.getPrefs(sbx);

    if (
      cleaned.slope === 0 ||
      cleaned.unfiltered === 0 ||
      cleaned.scale === 0
    ) {
      return 0;
    }

    if (
      cleaned.filtered === 0 ||
      sgv.mgdl < 40 ||
      prefs.display === "unfiltered"
    ) {
      return Math.round(
        (cleaned.scale * (cleaned.unfiltered - cleaned.intercept)) /
          cleaned.slope
      );
    }

    if (prefs.display === "filtered") {
      return Math.round(
        (cleaned.scale * (cleaned.filtered - cleaned.intercept)) / cleaned.slope
      );
    }

    const ratio =
      (cleaned.scale * (cleaned.filtered - cleaned.intercept)) /
      cleaned.slope /
      sgv.mgdl;
    return Math.round(
      (cleaned.scale * (cleaned.unfiltered - cleaned.intercept)) /
        cleaned.slope /
        ratio
    );
  }

  /** @param {ReturnType<import("../sandbox")>} sbx */
  isEnabled(sbx) {
    return sbx.settings.isEnabled("rawbg");
  }

  /**
   * @param {number} mgdl
   * @param {number} noise
   * @param {import("../types").Cal | undefined} cal
   * @param {ReturnType<import("../sandbox")>} sbx
   */
  showRawBGs(mgdl, noise, cal, sbx) {
    return (
      cal &&
      this.isEnabled(sbx) &&
      (sbx.settings.showRawbg === "always" ||
        (sbx.settings.showRawbg === "noise" && (noise >= 2 || mgdl < 40)))
    );
  }

  /** @param {number} mgdl @param {number} noise */
  noiseCodeToDisplay(mgdl, noise) {
    switch (Math.floor(noise)) {
      case 0:
        return "---";
      case 1:
        return this.translate("Clean");
      case 2:
        return this.translate("Light");
      case 3:
        return this.translate("Medium");
      case 4:
        return this.translate("Heavy");
    }
    if (mgdl < 40) return this.translate("Heavy");
    return "~~~";
  }

  /**
   * @param {(a: string, response: string) => void} next
   * @param {unknown} _slots
   * @param {ReturnType<import("../sandbox")>} sbx
   * @protected
   */
  virtAsstRawBGHandler(next, _slots, sbx) {
    /** @type {number} @see {@link RawBg#setProperties} */
    const rawBg = sbx.properties.rawbg?.mgdl;
    if (rawBg) {
      next(
        this.translate("virtAsstTitleRawBG"),
        this.translate("virtAsstRawBG", {
          params: [rawBg.toString()],
        })
      );
    } else {
      next(
        this.translate("virtAsstTitleRawBG"),
        this.translate("virtAsstUnknown")
      );
    }
  }

  virtAsst = /** @type {const} */ ({
    intentHandlers: [
      {
        intent: "MetricNow",
        metrics: ["raw bg", "raw blood glucose"],
        intentHandler: this.virtAsstRawBGHandler.bind(this),
      },
    ],
  });

  /** @protected @param {import("../types").Sgv} sgv @param {import("../types").Cal | undefined} cal */
  cleanValues(sgv, cal) {
    return {
      unfiltered: parseInt(sgv.unfiltered) || 0,
      filtered: parseInt(sgv.filtered) || 0,
      scale: parseFloat(cal?.scale) || 0,
      intercept: parseFloat(cal?.intercept) || 0,
      slope: parseFloat(cal?.slope) || 0,
    };
  }
}

/** @param {import(".").PluginCtx} ctx */
module.exports = (ctx) => new RawBg(ctx);
