"use strict";

const times = require("../times");

/** @typedef {ReturnType<IobPlugin["calcTotal"]>} IobProperties */

/** @typedef {import("../types").Plugin} Plugin */
/** @implements {Plugin} */
class IobPlugin {
  name = /** @type {const} */ ("iob");
  label = "Insulin-on-Board";
  pluginType = "pill-major";

  static RECENCY_THRESHOLD = times.mins(30).msecs;

  /** @param {import(".").PluginCtx} ctx */
  constructor(ctx) {
    this.moment = ctx.moment;
    this.translate = ctx.language.translate;
    this.utils = require("../utils")(ctx);
  }

  /** @param {import("../sandbox").ClientInitializedSandbox} sbx */
  setProperties(sbx) {
    sbx.offerProperty("iob", () =>
      this.calcTotal(
        sbx.data.treatments,
        sbx.data.devicestatus,
        sbx.data.profile,
        sbx.time
      )
    );
  }

  /**
   * @param {import("../types").Treatment[]} treatments
   * @param {import("../types").DeviceStatus[]} devicestatus
   * @param {ReturnType<import("../profilefunctions")>} [profile]
   * @param {number} time
   * @param {string} [spec_profile]
   */
  calcTotal(
    treatments,
    devicestatus,
    profile,
    time = Date.now(),
    spec_profile
  ) {
    /**
     * @type {(NonNullable<
     *       | ReturnType<IobPlugin["lastIOBDeviceStatus"]>
     *       | ReturnType<IobPlugin["fromTreatments"]>
     *     > & { treatmentIob?: number })
     *   | undefined}
     */
    let result = this.lastIOBDeviceStatus(devicestatus, time);

    const treatmentResult =
      treatments !== undefined && treatments.length
        ? this.fromTreatments(treatments, profile, time, spec_profile)
        : undefined;

    if (!result) {
      result = treatmentResult;
    } else if (result && treatmentResult?.iob) {
      result.treatmentIob = +(
        Math.round(Number(treatmentResult.iob + "e+3")) + "e-3"
      );
    }

    if (result?.iob)
      result.iob = +(Math.round(Number(result.iob + "e+3")) + "e-3");

    const ret = this.addDisplay(result);
    return ret ?? /** @type {NonNullable<typeof ret>} */ ({});
  }

  /** @protected @template {{iob?:number}} T @param {T} [iob] */
  addDisplay(iob) {
    if (
      typeof iob !== "object" ||
      Object.keys(iob).length === 0 ||
      iob.iob === undefined
    ) {
      return;
    }
    const display = this.utils.toFixed(iob.iob);
    return {
      ...iob,
      display,
      displayLine: `IOB: ${display}U`,
    };
  }

  /** @param {import("../types").DeviceStatus[]} devicestatus */
  isDeviceStatusAvailable(devicestatus) {
    return (
      devicestatus.map((d) => this.fromDeviceStatus(d)).filter((o) => !!o)
        .length > 0
    );
  }

  /**
   * @param {import("../types").DeviceStatus[]} devicestatus
   * @param {Date | number} time
   */
  lastIOBDeviceStatus(devicestatus, time) {
    if (!devicestatus || !Array.isArray(devicestatus)) return;
    if (time && typeof time !== "number" && "getTime" in time) {
      time = time.getTime();
    }
    const futureMills = time + times.mins(5).msecs; //allow for clocks to be a little off
    const recentMills = time - IobPlugin.RECENCY_THRESHOLD;

    // All IOBs
    const iobs = devicestatus
      .filter(
        (iobStatus) =>
          iobStatus.mills <= futureMills && iobStatus.mills >= recentMills
      )
      .map((s) => this.fromDeviceStatus(s))
      .filter((o) => !!o)
      .sort((a, b) => a.mills - b.mills);

    // Loop IOBs
    const loopIOBs = iobs.filter(({ source }) => source === "Loop");

    // Loop uploads both Loop IOB and pump-reported IOB, prioritize Loop IOB if available
    return loopIOBs.at(-1) ?? iobs.at(-1);
  }

  /**
   * @param {import("../types").DeviceStatus[]} devicestatus
   * @param {number} from
   * @param {number} to
   */
  IOBDeviceStatusesInTimeRange(devicestatus, from, to) {
    return devicestatus
      .filter(({ mills }) => mills > from && mills < to)
      .map((s) => this.fromDeviceStatus(s))
      .filter((o) => !!o)
      .sort((a, b) => a.mills - b.mills);
  }

  /** @param {import("../types").DeviceStatus} devicestatusEntry */
  fromDeviceStatus(devicestatusEntry) {
    let iobOpenAPS = devicestatusEntry?.openaps?.iob;
    const iobLoop = devicestatusEntry?.loop?.iob;
    const iobPump = devicestatusEntry?.pump?.iob;

    if (!!iobOpenAPS) {
      //hacks to support AMA iob array with time fields instead of timestamp fields
      iobOpenAPS = Array.isArray(iobOpenAPS) ? iobOpenAPS[0] : iobOpenAPS;

      // array could still be empty, handle as null
      if (!Object.keys(iobOpenAPS).length) return;

      if (iobOpenAPS.time) {
        iobOpenAPS.timestamp = iobOpenAPS.time;
      }

      return {
        iob: iobOpenAPS.iob,
        basaliob: iobOpenAPS.basaliob,
        activity: iobOpenAPS.activity,
        source: /** @type {const} */ ("OpenAPS"),
        device: devicestatusEntry.device,
        mills: this.moment(iobOpenAPS.timestamp).valueOf(),
      };
    }

    if (!!iobLoop) {
      return {
        iob: iobLoop.iob,
        source: /** @type {const} */ ("Loop"),
        device: devicestatusEntry.device,
        mills: this.moment(iobLoop.timestamp).valueOf(),
      };
    }

    if (!!iobPump) {
      return {
        iob: iobPump.iob || iobPump.bolusiob,
        source:
          devicestatusEntry.connect !== undefined
            ? /** @type {const} */ ("MM Connect")
            : undefined,
        device: devicestatusEntry.device,
        mills: devicestatusEntry.mills,
      };
    }
  }

  /**
   * @param {import("../types").Treatment[]} treatments
   * @param {ReturnType<import("../profilefunctions")> | undefined} profile
   * @param {number} time
   * @param {string} [spec_profile]
   */
  fromTreatments(treatments, profile, time, spec_profile) {
    const { totalIOB, totalActivity, lastBolus } = treatments.reduce(
      (acc, treatment) => {
        if (treatment.mills > time) return acc;

        const tIOB = this.calcTreatment(treatment, profile, time, spec_profile);
        if (!tIOB) return acc;

        if (tIOB.iobContrib > 0) acc.lastBolus = treatment;
        if (tIOB.iobContrib) acc.totalIOB += tIOB.iobContrib;
        // units: BG (mg/dL or mmol/L)
        if (tIOB.activityContrib) acc.totalActivity += tIOB.activityContrib;

        return acc;
      },
      {
        totalIOB: 0,
        totalActivity: 0,
        /** @type {null | import("../types").Treatment} */
        lastBolus: null,
      }
    );

    return {
      iob: +(Math.round(Number(totalIOB + "e+3")) + "e-3"),
      activity: totalActivity,
      lastBolus: lastBolus,
      source: this.translate("Care Portal"),
    };
  }

  /**
   * @param {import("../types").Treatment} treatment
   * @param {ReturnType<import("../profilefunctions")> | undefined} profile
   * @param {number} time
   * @param {string} [spec_profile]
   */
  calcTreatment(treatment, profile, time, spec_profile) {
    if (!treatment.insulin) {
      return {
        iobContrib: 0,
        activityContrib: 0,
      };
    }

    const dia = profile?.getDIA(time, spec_profile) ?? 3;
    const sens = profile?.getSensitivity(time, spec_profile) ?? 0;

    const scaleFactor = 3.0 / dia;
    const peak = 75;

    const bolusTime = treatment.mills;
    const minAgo = (scaleFactor * (time - bolusTime)) / 1000 / 60;

    if (minAgo < peak) {
      const x1 = minAgo / 5 + 1;
      return {
        iobContrib:
          treatment.insulin * (1 - 0.001852 * x1 * x1 + 0.001852 * x1),
        // units: BG (mg/dL)  = (BG/U) *    U insulin     * scalar
        activityContrib:
          sens * treatment.insulin * (2 / dia / 60 / peak) * minAgo,
      };
    }
    if (minAgo < 180) {
      const x2 = (minAgo - 75) / 5;
      return {
        iobContrib:
          treatment.insulin * (0.001323 * x2 * x2 - 0.054233 * x2 + 0.55556),
        activityContrib:
          sens *
          treatment.insulin *
          (2 / dia / 60 - ((minAgo - peak) * 2) / dia / 60 / (60 * 3 - peak)),
      };
    }

    return {
      iobContrib: 0,
      activityContrib: 0,
    };
  }

  /** @param {import("../sandbox").ClientInitializedSandbox} sbx */
  updateVisualisation(sbx) {
    const info = [];

    const prop = sbx.properties.iob;

    if (prop && "lastBolus" in prop && prop.lastBolus) {
      const when = new Date(prop.lastBolus.mills).toLocaleTimeString();
      const amount =
        sbx.roundInsulinForDisplayFormat(Number(prop.lastBolus.insulin)) + "U";
      info.push({
        label: this.translate("Last Bolus"),
        value: amount + " @ " + when,
      });
    }

    if (prop && "basaliob" in prop && prop.basaliob !== undefined) {
      info.push({
        label: this.translate("Basal IOB"),
        value: prop.basaliob.toFixed(2),
      });
    }

    if (prop && "source" in prop && prop.source !== undefined) {
      info.push({ label: this.translate("Source"), value: prop.source });
    }

    if (prop && "device" in prop && prop.device !== undefined) {
      info.push({ label: this.translate("Device"), value: prop.device });
    }

    if (prop && "treatmentIob" in prop && prop.treatmentIob !== undefined) {
      info.push({ label: "------------", value: "" });
      info.push({
        label: this.translate("Careportal IOB"),
        value: prop.treatmentIob.toFixed(2),
      });
    }

    const value =
      (prop?.display !== undefined
        ? sbx.roundInsulinForDisplayFormat(+prop.display)
        : "---") + "U";

    sbx.pluginBase.updatePillText(this, {
      value: value,
      label: this.translate("IOB"),
      info: info,
    });
  }

  /** @protected @type {import("../types").VirtAsstIntentHandlerFn} */
  virtAsstIOBIntentHandler(callback, _slots, sbx) {
    const message = this.translate("virtAsstIobIntent", {
      params: [this.getIob(sbx)],
    });
    callback(this.translate("virtAsstTitleCurrentIOB"), message);
  }

  /** @protected @type {import("../types").VirtAsstRollupHandlerFn} */
  virtAsstIOBRollupHandler(_slots, sbx, callback) {
    const iob = this.getIob(sbx);
    const message = this.translate("virtAsstIob", {
      params: [iob],
    });
    callback(null, { results: message, priority: 2 });
  }

  /** @protected @param {import("../sandbox").ClientInitializedSandbox} sbx */
  getIob(sbx) {
    const iob = sbx.properties.iob?.iob;
    if (iob) {
      return this.translate("virtAsstIobUnits", {
        params: [this.utils.toFixed(iob)],
      });
    }
    return this.translate("virtAsstNoInsulin");
  }

  virtAsst = {
    rollupHandlers: [
      {
        rollupGroup: "Status",
        rollupName: "current iob",
        rollupHandler: this.virtAsstIOBRollupHandler.bind(this),
      },
    ],
    intentHandlers: [
      {
        intent: "MetricNow",
        metrics: ["iob", "insulin on board"],
        intentHandler: this.virtAsstIOBIntentHandler.bind(this),
      },
    ],
  };
}

/** @param {import(".").PluginCtx} ctx */
module.exports = (ctx) => new IobPlugin(ctx);
