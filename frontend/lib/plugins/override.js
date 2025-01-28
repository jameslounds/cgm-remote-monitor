"use strict";

/** @import {Moment} from "moment" */
/** @import {Plugin} from "../types" */
/** @import {ClientInitializedSandbox, Sbx} from "../sandbox" */
/** @import {LoopProperties} from "./loop" */

/** @implements {Plugin} */
class OverridePlugin {
  name = /** @type {const} */ ("override");
  label = "Override";
  pluginType = "pill-status";

  /** @typedef {LoopProperties["lastOverride"] & { endMoment?: Moment }} LastOverride */

  /**
   * @param {Sbx} sbx
   * @param {LastOverride} [overrideStatus]
   * @returns {overrideStatus is {active: true}}
   */
  isActive(sbx, overrideStatus) {
    if (!overrideStatus) return false;

    const endMoment = overrideStatus.duration
      ? overrideStatus.moment.clone().add(overrideStatus.duration, "seconds")
      : undefined;

    overrideStatus.endMoment = endMoment;

    return (
      !!overrideStatus.active && (!endMoment || endMoment.isAfter(sbx.time))
    );
  }

  /** @protected @param {Sbx} sbx @param {number} val */
  scale(sbx, val) {
    return sbx.settings.units === "mmol"
      ? sbx.roundBGToDisplayFormat(sbx.scaleMgdl(val))
      : val;
  }

  /** @param {ClientInitializedSandbox} sbx */
  updateVisualisation(sbx) {
    /** @type {undefined | LastOverride} */
    const lastOverride = sbx.properties.loop?.lastOverride;

    let label = "";

    const isActive = this.isActive(sbx, lastOverride);

    if (isActive) {
      const correctionRange = lastOverride.currentCorrectionRange;
      if (correctionRange) {
        const max = this.scale(sbx, correctionRange.maxValue);
        const min = this.scale(sbx, correctionRange.minValue);

        if (min === max) {
          label += `BG Target: ${min}`;
        } else {
          label += `BG Targets: ${min}:${max}`;
        }
      }

      const { multiplier } = lastOverride;
      if ((multiplier || multiplier === 0) && multiplier !== 1) {
        const percentMultiplier = (multiplier * 100).toFixed(0);
        label += ` | O: ${percentMultiplier}%`;
      }
    }

    const endOverrideValue = lastOverride?.endMoment
      ? `⇥ ${lastOverride.endMoment.format("LT")}`
      : !!lastOverride
        ? "∞"
        : "";

    sbx.pluginBase.updatePillText(this, {
      value: endOverrideValue,
      label: label,
      hide: !isActive,
    });
  }
}

module.exports = () => new OverridePlugin();
