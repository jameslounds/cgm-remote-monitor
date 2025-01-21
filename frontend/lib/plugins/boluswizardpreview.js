"use strict";

const times = require("../times");

/** @typedef {ReturnType<BolusWizardPreviewPlugin["calc"]>} BWPProperties */

/** @typedef {import("../types").Plugin} Plugin */
/** @implements {Plugin} */
class BolusWizardPreviewPlugin {
  name = /** @type {const} */ ("bwp");
  label = "Bolus Wizard Preview";
  pluginType = "pill-minor";

  /** @param {import(".").PluginCtx} ctx */
  constructor(ctx) {
    this.translate = ctx.language.translate;
    this.levels = ctx.levels;
  }

  /** @param {ReturnType<import("../sandbox")>} sbx @protected */
  checkMissingInfo(sbx) {
    /** @type {string[]} */
    const errors = [];

    if (!sbx.data.profile || !sbx.data.profile.hasData()) {
      errors.push("Missing need a treatment profile");
    } else if (this.profileFieldsMissing(sbx)) {
      errors.push(
        "Missing sens, target_high, or target_low treatment profile fields"
      );
    }

    if (!sbx.properties.iob) errors.push("Missing IOB property");

    if (!this.isSGVOk(sbx)) errors.push("Data isn't current");

    return errors;
  }

  /** @param {import("../sandbox").ClientInitializedSandbox} sbx */
  setProperties(sbx) {
    sbx.offerProperty("bwp", () => this.calc(sbx));
  }

  /** @param {import("../sandbox").InitializedSandbox} sbx */
  checkNotifications(sbx) {
    const prop = sbx.properties.bwp;
    if (prop === undefined) return;

    const settings = this.prepareSettings(sbx);

    if (this.highSnoozedByIOB(prop, settings, sbx)) {
      sbx.notifications.requestSnooze({
        level: this.levels.URGENT,
        title: this.translate("Snoozing high alarm since there is enough IOB"),
        message: [sbx.propertyLine("bwp"), sbx.propertyLine("iob")].join("\n"),
        lengthMills: settings.snoozeLength,
        debug: prop,
      });
    } else if (
      prop.scaledSGV &&
      prop.scaledSGV > (sbx.data.profile?.getHighBGTarget(sbx.time) ?? NaN) &&
      prop.bolusEstimate &&
      prop.bolusEstimate > settings.warnBWP
    ) {
      const level =
        prop.bolusEstimate > settings.urgentBWP
          ? this.levels.URGENT
          : this.levels.WARN;
      const levelLabel = this.levels.toDisplay(level);
      const sound = level === this.levels.URGENT ? "updown" : "bike";

      sbx.notifications.requestNotify({
        level: level,
        title: levelLabel + ", " + this.translate("Check BG, time to bolus?"),
        message: sbx.buildDefaultMessage(),
        eventName: "bwp",
        pushoverSound: sound,
        plugin: this,
        debug: prop,
      });
    }
  }

  /**
   * @param {BWPProperties} prop
   * @param {ReturnType<BolusWizardPreviewPlugin["prepareSettings"]>} settings
   * @param {import("../sandbox").InitializedSandbox} sbx
   */
  highSnoozedByIOB(prop, settings, sbx) {
    // @ts-expect-error This should definitely be eventType - [JL] my rules prevent me from changing logic
    const ar2EventType = sbx.properties.ar2 && sbx.properties.ar2.eventType;
    const high =
      ar2EventType === "high" ||
      (prop.scaledSGV ?? NaN) >=
        sbx.scaleMgdl(sbx.settings.thresholds.bgTargetTop);

    return high && (prop.bolusEstimate ?? NaN) < settings.snoozeBWP;
  }

  /** @param {import("../sandbox").ClientInitializedSandbox} sbx */
  updateVisualisation(sbx) {
    const prop = sbx.properties.bwp;
    if (!prop) return;

    const info = [
      ...this.bolusInfo(prop, sbx),
      ...this.tempBasalAdjustmentsInfo(prop, sbx),
    ];
    const bolusEstimateRounded = parseFloat(
      prop?.bolusEstimateDisplay ?? "NaN"
    );
    const value =
      (bolusEstimateRounded >= 0 && prop?.bolusEstimateDisplay + "U") ||
      (bolusEstimateRounded < 0 && "< 0U") ||
      undefined;

    sbx.pluginBase.updatePillText(this, {
      value,
      label: this.translate("BWP"),
      info,
    });
  }

  /** @param {ReturnType<import("../sandbox")>} sbx */
  calc(sbx) {
    const scaled = sbx.lastScaledSGV();

    const errors = this.checkMissingInfo(sbx);
    if (errors?.length) {
      return { effect: 0, outcome: 0, bolusEstimate: 0.0, errors };
    }

    const profile = sbx.data.profile;
    const iob = sbx.properties.iob?.iob || 0;

    const effect = iob * (profile?.getSensitivity(sbx.time) ?? NaN);
    const outcome = scaled - effect;

    const recentCarbs = sbx.data.treatments
      .filter(
        (t) =>
          t.mills <= sbx.time &&
          sbx.time - t.mills < times.mins(60).msecs &&
          (t.carbs ?? NaN) > 0 // TODO types?
      )
      .at(-1);

    const target_high = profile?.getHighBGTarget(sbx.time) ?? NaN;
    const target_low = profile?.getLowBGTarget(sbx.time) ?? NaN;
    const sens = profile?.getSensitivity(sbx.time) ?? NaN;

    // prettier-ignore
    const { bolusEstimate, aimTarget, aimTargetString } = 
      (outcome < target_low && {
        bolusEstimate: (Math.abs(outcome - target_low) / sens) * -1,
        aimTarget: target_low,
        /** @type {"below low"} */
        aimTargetString: "below low",
      }) ||
      (outcome > target_high && {
        bolusEstimate: (outcome - target_high) / sens,
        aimTarget: target_high,
        /** @type {"above high"} */
        aimTargetString: "above high",
      }) || {
        bolusEstimate: 0,
      };

    const belowLowTarget = scaled < target_low;

    const basal = profile?.getBasal(sbx.time);
    const tempBasalAdjustment =
      !!bolusEstimate && !!basal
        ? {
            thirtymin: Math.round(
              ((basal / 2 + bolusEstimate) / (basal / 2)) * 100
            ),
            onehour: Math.round(((basal + bolusEstimate) / basal) * 100),
          }
        : undefined;

    const bolusEstimateDisplay = sbx.roundInsulinForDisplayFormat(
      bolusEstimate ?? NaN
    );

    return {
      scaledSGV: scaled,
      iob,
      effect,
      outcome,
      recentCarbs,
      bolusEstimate,
      aimTarget,
      aimTargetString,
      belowLowTarget,
      tempBasalAdjustment,
      bolusEstimateDisplay,
      outcomeDisplay: sbx.roundBGToDisplayFormat(outcome),
      displayIOB: sbx.roundInsulinForDisplayFormat(iob),
      effectDisplay: sbx.roundBGToDisplayFormat(effect),
      displayLine: `${this.translate("BWP")}: ${bolusEstimateDisplay}U`,
    };
  }

  /** @protected @param {ReturnType<import("../sandbox")>} sbx */
  prepareSettings(sbx) {
    return {
      snoozeBWP: Number(sbx.extendedSettings.snooze) || 0.1,
      warnBWP: Number(sbx.extendedSettings.warn) || 0.5,
      urgentBWP: Number(sbx.extendedSettings.urgent) || 1.0,
      snoozeLength:
        (!!sbx.extendedSettings.snoozeMins &&
          Number(sbx.extendedSettings.snoozeMins) * 60 * 1000) ||
        times.mins(10).msecs,
    };
  }

  /** @protected @param {ReturnType<import("../sandbox")>} sbx */
  isSGVOk(sbx) {
    const lastSGVEntry = sbx.lastSGVEntry();
    return (
      lastSGVEntry && lastSGVEntry.mgdl >= 39 && sbx.isCurrent(lastSGVEntry)
    );
  }

  /** @protected @param {ReturnType<import("../sandbox")>} sbx */
  profileFieldsMissing(sbx) {
    return (
      !sbx.data.profile ||
      !sbx.data.profile.getSensitivity(sbx.time) ||
      !sbx.data.profile.getHighBGTarget(sbx.time) ||
      !sbx.data.profile.getLowBGTarget(sbx.time)
    );
  }

  /** @protected @param {BWPProperties} prop @param {ReturnType<import("../sandbox")>} sbx */
  bolusInfo(prop, sbx) {
    const translate = this.translate;

    /** @type {{ label: string; value: string }[]} */
    const info = [];

    if (!prop) {
      return [
        {
          label: translate("Notice"),
          value: translate("required info missing"),
        },
      ];
    }

    if (prop.errors) {
      info.push({
        label: translate("Notice"),
        value: translate("required info missing"),
      });
      info.push(
        ...prop.errors.map((error) => ({ label: "  • ", value: error }))
      );
    }

    const profile = sbx.data.profile;

    info.push({
      label: translate("Insulin on Board"),
      value: prop.displayIOB + "U",
    });
    info.push({
      label: translate("Current target"),
      value:
        `${translate("Low")}: ${profile?.getLowBGTarget(sbx.time)} ` +
        `${translate("High")}: ${profile?.getHighBGTarget(sbx.time)}`,
    });
    info.push({
      label: translate("Sensitivity"),
      value: `-${profile?.getSensitivity(sbx.time)} ${sbx.settings.units}/U`,
    });
    info.push({
      label: translate("Expected effect"),
      value:
        `${prop.displayIOB} x -${profile?.getSensitivity(sbx.time)} = ` +
        `-${prop.effectDisplay} ${sbx.settings.units}`,
    });
    info.push({
      label: translate("Expected outcome"),
      value:
        `${sbx.lastScaledSGV()} -${prop.effectDisplay} = ` +
        `${prop.outcomeDisplay} ${sbx.settings.units}`,
    });
    // @ts-expect-error comparing string with number - [JL] my rules prevent me from changing logic
    if (prop.bolusEstimateDisplay < 0) {
      info.unshift({ label: "---------", value: "" });
      const carbEquivalent = Math.ceil(
        // @ts-expect-error multiplying string with number - [JL] my rules prevent me from changing logic
        Math.abs((profile?.getCarbRatio() ?? NaN) * prop.bolusEstimateDisplay)
      );
      info.unshift({
        label: translate("Carb Equivalent"),
        value:
          `${prop.bolusEstimateDisplay}U * ${profile?.getCarbRatio()} = ` +
          `${carbEquivalent}g`,
      });
      info.unshift({
        label: translate("Current Carb Ratio"),
        value: `1U / ${profile?.getCarbRatio()} g`,
      });

      if (prop.recentCarbs) {
        const formattedTime = new Date(
          prop.recentCarbs.mills
        ).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        info.unshift({
          label: translate("Last Carbs"),
          value: `${prop.recentCarbs.carbs}g @ ${formattedTime}`,
        });
      }

      if (!prop.belowLowTarget && prop.bolusEstimateDisplay) {
        info.unshift({
          label: "-" + translate("BWP"),
          value: translate(
            "Excess insulin equivalent %1U more than needed to reach low target, not accounting for carbs",
            { params: [prop.bolusEstimateDisplay] }
          ),
        });
      }

      if (prop.belowLowTarget) {
        if (prop.iob > 0) {
          info.unshift({
            label: "-" + translate("BWP"),
            value: translate(
              "Excess insulin equivalent %1U more than needed to reach low target, MAKE SURE IOB IS COVERED BY CARBS",
              { params: [prop.bolusEstimateDisplay] }
            ),
          });
        } else {
          info.unshift({
            label: "-" + translate("BWP"),
            value: translate(
              "%1U reduction needed in active insulin to reach low target, too much basal?",
              { params: [prop.bolusEstimateDisplay] }
            ),
          });
        }
      }
    }

    return info;
  }

  /** @protected @param {BWPProperties} prop @param {ReturnType<import("../sandbox")>} sbx */
  tempBasalAdjustmentsInfo(prop, sbx) {
    if (!prop || !prop.tempBasalAdjustment) return [];

    const translate = this.translate;

    /** @type {{ label: string; value: string }[]} */
    const info = [];

    const { carbsOrBolusMessage, sign } =
      prop.tempBasalAdjustment.thirtymin > 100
        ? {
            carbsOrBolusMessage: translate(
              "basal adjustment out of range, give bolus?"
            ),
            sign: "+",
          }
        : {
            carbsOrBolusMessage: translate(
              "basal adjustment out of range, give carbs?"
            ),
            sign: "",
          };

    info.push({ label: "---------", value: "" });
    if (prop.aimTarget && prop.aimTargetString) {
      info.push({
        label: translate("Projected BG %1 target", {
          params: [translate(prop.aimTargetString)],
        }),
        value: `${translate("aiming at")} ${prop.aimTarget} ${sbx.settings.units}`,
      });
    }

    if (prop.bolusEstimate && prop.bolusEstimate > 0) {
      info.push({
        label: translate("Bolus %1 units", {
          params: [prop.bolusEstimateDisplay],
        }),
        value: translate("or adjust basal"),
      });
      info.push({
        label: translate("Check BG using glucometer before correcting!"),
        value: "",
      });
      info.push({ label: "---------", value: "" });
    } else {
      info.push({
        label: translate("Basal reduction to account %1 units:", {
          params: [prop.bolusEstimateDisplay],
        }),
        value: "",
      });
    }

    info.push({
      label: translate("Current basal"),
      value: sbx.data.profile?.getBasal(sbx.time)?.toString() ?? "",
    });

    if (
      prop.tempBasalAdjustment.thirtymin >= 0 &&
      prop.tempBasalAdjustment.thirtymin <= 200
    ) {
      info.push({
        label: translate("30m temp basal"),
        value: `${prop.tempBasalAdjustment.thirtymin}% (${sign}${prop.tempBasalAdjustment.thirtymin - 100}%)`,
      });
    } else {
      info.push({
        label: translate("30m temp basal"),
        value: carbsOrBolusMessage,
      });
    }
    if (
      prop.tempBasalAdjustment.onehour >= 0 &&
      prop.tempBasalAdjustment.onehour <= 200
    ) {
      info.push({
        label: translate("1h temp basal"),
        value: `${prop.tempBasalAdjustment.onehour}% (${sign}${prop.tempBasalAdjustment.onehour - 100}%)`,
      });
    } else {
      info.push({
        label: translate("1h temp basal"),
        value: carbsOrBolusMessage,
      });
    }

    return info;
  }
}

/** @param {import(".").PluginCtx} ctx */
module.exports = (ctx) => new BolusWizardPreviewPlugin(ctx);
