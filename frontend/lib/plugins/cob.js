"use strict";

const times = require("../times");

/** @typedef {ReturnType<CobPlugin["cobTotal"]>} CobProperties */

/** @typedef {import("../types").Plugin} Plugin */
/** @implements {Plugin} */
class CobPlugin {
  name = /** @type {const} */ ("cob");
  label = "Carbs-on-Board";
  pluginType = "pill-minor";

  static RECENCY_THRESHOLD = times.mins(30).msecs;

  /** @param {import(".").PluginCtx} ctx */
  constructor(ctx) {
    this.moment = ctx.moment;
    this.translate = ctx.language.translate;
    this.iob = require("./iob")(ctx);
  }

  /** @param {import("../sandbox").ClientInitializedSandbox} sbx */
  setProperties(sbx) {
    sbx.offerProperty("cob", () =>
      this.cobTotal(
        sbx.data.treatments,
        sbx.data.devicestatus,
        sbx.data.profile,
        sbx.time
      )
    );
  }

  /**
   * @param {import("../types").Treatment[] | undefined} treatments
   * @param {import("../types").DeviceStatus[]} devicestatus
   * @param {ReturnType<import("../profilefunctions")> | undefined} profile
   * @param {number | Date} [time]
   * @param {string} [spec_profile]
   * @returns {Partial<
   *   ReturnType<CobPlugin["lastCOBDeviceStatus" | "fromTreatments"]>
   * > & { treatmentCOB?: Partial<ReturnType<CobPlugin["fromTreatments"]>> }}
   */
  cobTotal(treatments, devicestatus, profile, time, spec_profile) {
    if (!profile || !profile.hasData()) {
      console.warn(
        "For the COB plugin to function you need a treatment profile"
      );
      return {};
    }

    if (
      !profile.getSensitivity(time, spec_profile) ||
      !profile.getCarbRatio(time, spec_profile)
    ) {
      console.warn(
        "For the COB plugin to function your treatment profile must have both sens and carbratio fields"
      );
      return {};
    }

    if (typeof time === "undefined") {
      time = Date.now();
    } else if (time && typeof time === "object" && "getTime" in time) {
      time = time.getTime();
    }

    const devicestatusCOB = this.lastCOBDeviceStatus(devicestatus, time);
    if (
      devicestatusCOB &&
      typeof devicestatusCOB?.cob == "number" &&
      Date.now() - devicestatusCOB.mills <= times.mins(10).msecs
    ) {
      return this.addDisplay(devicestatusCOB);
    } else {
      /** @type {Partial<ReturnType<CobPlugin["fromTreatments"]>>} */
      const treatmentCOB =
        treatments !== undefined && treatments.length
          ? this.fromTreatments(
              treatments,
              devicestatus,
              profile,
              time,
              spec_profile
            )
          : {};
      return {
        ...structuredClone(treatmentCOB),
        source: "Care Portal",
        treatmentCOB: structuredClone(treatmentCOB),
      };
    }
  }

  /** @protected @param {ReturnType<CobPlugin['lastCOBDeviceStatus']>} cob */
  addDisplay(cob) {
    if (!cob || cob.cob === undefined) {
      return {};
    }

    const display = Math.round(cob.cob * 10) / 10;
    return {
      ...cob,
      display: display,
      displayLine: "COB: " + display + "g",
    };
  }

  /** @param {import("../types").DeviceStatus[]} devicestatus */
  isDeviceStatusAvailable(devicestatus) {
    return (
      devicestatus.map((s) => this.fromDeviceStatus(s)).filter((o) => !!o)
        .length > 0
    );
  }

  /**
   * @param {import("../types").DeviceStatus[]} devicestatus
   * @param {number} time
   */
  lastCOBDeviceStatus(devicestatus = [], time) {
    const futureMills = time + times.mins(5).msecs; //allow for clocks to be a little off
    const recentMills = time - CobPlugin.RECENCY_THRESHOLD;

    return devicestatus
      .filter(({ mills }) => recentMills <= mills && mills <= futureMills)
      .map((s) => this.fromDeviceStatus(s))
      .filter((o) => !!o)
      .sort((a, b) => a.mills - b.mills)
      .at(-1);
  }

  /**
   * @param {import("../types").DeviceStatus[]} devicestatus
   * @param {number} from
   * @param {number} to
   */
  COBDeviceStatusesInTimeRange(devicestatus, from, to) {
    return devicestatus
      .filter(({ mills }) => from <= mills && mills < to)
      .map((s) => this.fromDeviceStatus(s))
      .filter((o) => !!o)
      .sort((a, b) => a.mills - b.mills);
  }

  /**
   * @param {Pick<
   *   import("../types").DeviceStatus["openaps"],
   *   "enacted" | "suggested"
   * >} arg
   * @protected
   */
  latCobFromOpenAps({ suggested, enacted }) {
    if (suggested && enacted) {
      const suggestedMoment = this.moment(suggested.timestamp);
      const enactedMoment = this.moment(enacted.timestamp);
      if (enactedMoment.isAfter(suggestedMoment)) {
        return {
          lastCOB: enacted.COB,
          lastMoment: enactedMoment,
        };
      } else {
        return {
          lastCOB: suggested.COB,
          lastMoment: suggestedMoment,
        };
      }
    } else if (enacted) {
      return {
        lastCOB: enacted.COB,
        lastMoment: this.moment(enacted.timestamp),
      };
    } else if (suggested) {
      return {
        lastCOB: suggested.COB,
        lastMoment: this.moment(suggested.timestamp),
      };
    }
  }

  /** @param {import("../types").DeviceStatus} devicestatusEntry */
  fromDeviceStatus(devicestatusEntry) {
    if (devicestatusEntry.openaps) {
      const suggested = devicestatusEntry.openaps.suggested;
      const enacted = devicestatusEntry.openaps.enacted;

      const { lastCOB, lastMoment } =
        this.latCobFromOpenAps({
          suggested,
          enacted,
        }) ?? {};

      if ((!lastCOB && lastCOB !== 0) || !lastMoment) return;

      return {
        cob: lastCOB,
        source: "OpenAPS",
        device: devicestatusEntry.device,
        mills: lastMoment.valueOf(),
      };
    } else if (devicestatusEntry.loop?.cob) {
      return {
        cob: devicestatusEntry.loop.cob.cob,
        source: "Loop",
        device: devicestatusEntry.device,
        mills: this.moment(devicestatusEntry.loop.cob.timestamp).valueOf(),
      };
    }
  }

  /**
   * @param {import("../types").Treatment[]} treatments
   * @param {import("../types").DeviceStatus[]} devicestatus
   * @param {ReturnType<import("../profilefunctions")>} profile
   * @param {number} time
   * @param {string} [spec_profile]
   * @returns
   */
  fromTreatments(treatments, devicestatus, profile, time, spec_profile) {
    // TODO: figure out the liverSensRatio that gives the most accurate purple line predictions
    var liverSensRatio = 8;
    var totalCOB = 0;
    /** @type {import("../types").Treatment | null} */
    var lastCarbs = null;

    var isDecaying = 0;
    var lastDecayedBy = 0;

    treatments.forEach((treatment) => {
      const carbAbsoprtionRate =
        profile.getCarbAbsorptionRate(treatment.mills, spec_profile) ?? NaN;

      if (treatment.carbs && treatment.mills < time) {
        lastCarbs = treatment;
        const cCalc = this.cobCalc(
          treatment,
          profile,
          lastDecayedBy,
          time,
          spec_profile
        );
        if (!cCalc) return;
        var decaysin_hr = (+cCalc.decayedBy - time) / 1000 / 60 / 60;
        if (decaysin_hr > -10) {
          // units: BG
          const actStart =
            this.iob.calcTotal(
              treatments,
              devicestatus,
              profile,
              lastDecayedBy,
              spec_profile
            ).activity ?? NaN;
          const actEnd =
            this.iob.calcTotal(
              treatments,
              devicestatus,
              profile,
              +cCalc.decayedBy,
              spec_profile
            ).activity ?? NaN;
          const avgActivity = (actStart + actEnd) / 2;

          // units:  g     =       BG      *      scalar     /          BG / U                           *     g / U
          const sens =
            profile.getSensitivity(treatment.mills, spec_profile) ?? NaN;
          const carbRatio =
            profile.getCarbRatio(treatment.mills, spec_profile) ?? NaN;

          const delayedCarbs =
            carbRatio * ((avgActivity * liverSensRatio) / sens);
          const delayMinutes = Math.round(
            (delayedCarbs / carbAbsoprtionRate) * 60
          );
          if (delayMinutes > 0) {
            cCalc.decayedBy.setMinutes(
              cCalc.decayedBy.getMinutes() + delayMinutes
            );
            decaysin_hr = (+cCalc.decayedBy - time) / 1000 / 60 / 60;
          }
        }

        if (cCalc) {
          lastDecayedBy = +cCalc.decayedBy;
        }

        if (decaysin_hr > 0) {
          //console.info('Adding ' + delayMinutes + ' minutes to decay of ' + treatment.carbs + 'g bolus at ' + treatment.mills);
          totalCOB += Math.min(
            Number(treatment.carbs),
            decaysin_hr * carbAbsoprtionRate
          );
          //console.log('cob:', Math.min(cCalc.initialCarbs, decaysin_hr * profile.getCarbAbsorptionRate(treatment.mills)),cCalc.initialCarbs,decaysin_hr,profile.getCarbAbsorptionRate(treatment.mills));
          isDecaying = cCalc.isDecaying;
        } else {
          totalCOB = 0;
        }
      }
    });

    const sens = profile.getSensitivity(time, spec_profile) ?? NaN;
    const carbRatio = profile.getCarbRatio(time, spec_profile) ?? NaN;
    const carbAbsoprtionRate =
      profile.getCarbAbsorptionRate(time, spec_profile) ?? NaN;

    const rawCarbImpact =
      (((isDecaying * sens) / carbRatio) * carbAbsoprtionRate) / 60;

    return {
      decayedBy: lastDecayedBy,
      isDecaying: isDecaying,
      carbs_hr: profile.getCarbAbsorptionRate(time, spec_profile),
      rawCarbImpact: rawCarbImpact,
      cob: totalCOB,
      /** @type {import("../types").Treatment | null} */
      lastCarbs: lastCarbs,
    };
  }

  /**
   * @param {number} rawCarbImpact
   * @param {number} insulinImpact
   */
  carbImpact(rawCarbImpact, insulinImpact) {
    const liverSensRatio = 1.0;
    const liverCarbImpactMax = 0.7;
    const liverCarbImpact = Math.min(
      liverCarbImpactMax,
      liverSensRatio * insulinImpact
    );

    const netCarbImpact = Math.max(0, rawCarbImpact - liverCarbImpact);
    const totalImpact = netCarbImpact - insulinImpact;
    return {
      netCarbImpact,
      totalImpact,
    };
  }

  /**
   * @param {import("../types").Treatment} treatment
   * @param {ReturnType<import("../profilefunctions")>} profile
   * @param {number} lastDecayedBy
   * @param {number} time
   * @param {string} [spec_profile]
   */
  cobCalc(treatment, profile, lastDecayedBy, time, spec_profile) {
    if (!treatment.carbs) return "";

    const delay = 20;

    const carbTime = new Date(treatment.mills);

    const carbs_hr =
      profile.getCarbAbsorptionRate(treatment.mills, spec_profile) ?? NaN;
    const carbs_min = carbs_hr / 60;

    const decayedBy = new Date(carbTime);
    const minutesleft = (lastDecayedBy - +carbTime) / 1000 / 60;
    decayedBy.setMinutes(
      decayedBy.getMinutes() +
        Math.max(delay, minutesleft) +
        treatment.carbs / carbs_min
    );

    const initialCarbs =
      delay > minutesleft
        ? parseInt(treatment.carbs?.toString())
        : parseInt(treatment.carbs?.toString()) + minutesleft * carbs_min;

    const startDecay = new Date(carbTime);
    startDecay.setMinutes(carbTime.getMinutes() + delay);
    const isDecaying = time < lastDecayedBy || time > +startDecay ? 1 : 0;

    return {
      initialCarbs: initialCarbs,
      decayedBy: decayedBy,
      isDecaying: isDecaying,
      carbTime: carbTime,
    };
  }

  /** @param {import("../sandbox").ClientInitializedSandbox} sbx */
  updateVisualisation(sbx) {
    const prop = sbx.properties.cob;

    if (prop === undefined || prop.cob === undefined) {
      return;
    }

    const displayCob = Math.round(prop.cob * 10) / 10;

    const info = [];
    if ("treatmentCOB" in prop && prop.treatmentCOB && prop.treatmentCOB.cob) {
      info.push({
        label: this.translate("Careportal COB"),
        value: Math.round(prop.treatmentCOB.cob * 10) / 10,
      });
    }

    const lastCarbs =
      ("lastCarbs" in prop && prop.lastCarbs) ||
      (prop.treatmentCOB && prop.treatmentCOB.lastCarbs);
    if (lastCarbs) {
      const when = new Date(lastCarbs.mills).toLocaleString();
      const amount = lastCarbs.carbs + "g";
      info.push({
        label: this.translate("Last Carbs"),
        value: amount + " @ " + when,
      });
    }

    // TODO why does this pass `sbx`, not `this` - this should not work?
    sbx.pluginBase.updatePillText(sbx, {
      value: displayCob + "g",
      label: this.translate("COB"),
      info: info,
    });
  }

  /** @type {import("../types").VirtAsstIntentHandlerFn} */
  virtAsstCOBHandler(next, slots, sbx) {
    const cob = sbx.properties.cob?.cob;
    const pwd = /** @type {undefined | { pwd?: { value?: string } }} */ (slots)
      ?.pwd?.value;
    const value = cob ? cob.toString() : "0";

    const response = pwd
      ? this.translate("virtAsstCob3person", {
          params: [pwd.replace("'s", ""), value],
        })
      : this.translate("virtAsstCob", {
          params: [value],
        });

    next(this.translate("virtAsstTitleCurrentCOB"), response);
  }

  virtAsst = {
    intentHandlers: [
      {
        intent: "MetricNow",
        metrics: ["cob", "carbs on board", "carbohydrates on board"],
        intentHandler: this.virtAsstCOBHandler.bind(this),
      },
    ],
  };
}

/** @param {import(".").PluginCtx} ctx */
module.exports = (ctx) => new CobPlugin(ctx);
