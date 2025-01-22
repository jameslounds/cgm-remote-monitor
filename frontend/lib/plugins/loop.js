"use strict";

const times = require("../times");

/** @typedef {ReturnType<LoopPlugin["analyzeData"]>} LoopProperties */

/** @typedef {import("../types").DeviceStatus["loop"]} LoopStatus */

// var ALL_STATUS_FIELDS = ['status-symbol', 'status-label', 'iob', 'freq', 'rssi']; Unused variable
/** @typedef {import("../types").Plugin} Plugin */
/** @implements {Plugin} */
class LoopPlugin {
  name = /** @type {const} */ ("loop");
  label = "Loop";
  pluginType = "pill-status";

  /** @param {import(".").PluginCtx} ctx */
  constructor(ctx) {
    this.moment = ctx.moment;
    this.utils = require("../utils")(ctx);
    this.translate = ctx.language.translate;
    this.levels = ctx.levels;
  }

  firstPrefs = true;
  /** @param {ReturnType<import("../sandbox")>} sbx */
  getPrefs(sbx) {
    const prefs = {
      warn: sbx.extendedSettings.warn ? sbx.extendedSettings.warn : 30,
      urgent: sbx.extendedSettings.urgent ? sbx.extendedSettings.urgent : 60,
      enableAlerts: sbx.extendedSettings.enableAlerts,
    };

    if (this.firstPrefs) {
      this.firstPrefs = false;
      console.info(" Prefs:", prefs);
    }

    return prefs;
  }

  /** @param {import("../sandbox").ClientInitializedSandbox} sbx */
  setProperties(sbx) {
    sbx.offerProperty("loop", () => this.analyzeData(sbx));
  }

  /**
   * @param {import("../types").DeviceStatus["loop"] | undefined} status
   * @param {import("moment").Moment} recent
   * @protected
   */
  getDisplayForStatus(status, recent) {
    if (
      status?.failureReason ||
      (status?.enacted && !status?.enacted.received)
    ) {
      return /** @type {const} */ ({
        symbol: "x",
        code: "error",
        label: "Error",
      });
    } else if (
      status?.enacted &&
      this.moment(status.timestamp).isAfter(recent)
    ) {
      return /** @type {const} */ ({
        symbol: "⌁",
        code: "enacted",
        label: "Enacted",
      });
    } else if (
      status?.recommendedTempBasal &&
      this.moment(status.recommendedTempBasal.timestamp).isAfter(recent)
    ) {
      return /** @type {const} */ ({
        symbol: "⏀",
        code: "recommendation",
        label: "Recomendation",
      });
    } else if (status?.moment?.isAfter(recent)) {
      return /** @type {const} */ ({
        symbol: "↻",
        code: "looping",
        label: "Looping",
      });
    }

    return /** @type {const} */ ({
      symbol: "⚠",
      code: "warning",
      label: "Warning",
    });
  }

  /** @param {import("../sandbox").ClientInitializedSandbox} sbx */
  analyzeData(sbx) {
    const recentHours = 6;
    const recentMills = sbx.time - times.hours(recentHours).msecs;

    const recentData = sbx.data.devicestatus.filter(
      (status) =>
        "loop" in status &&
        recentMills <= status.mills &&
        status.mills <= sbx.time
    );

    const prefs = this.getPrefs(sbx);
    const recent = this.moment(sbx.time).subtract(prefs.warn / 2, "minutes");

    const recentLoops = recentData
      .filter((d) => !!d.loop)
      .map((d) =>
        Object.assign(d.loop, { moment: this.moment(d.loop.timestamp) })
      );

    /**
     * @typedef {NonNullable<recentLoops[number]["enacted"]> & {
     *   moment: import("moment").Moment;
     * }} LastEnacted
     */
    const lastEnacted = recentLoops
      .filter(
        /** @returns {l is l & {enacted: NonNullable<l["enacted"]>}} } */
        (l) => !!l.enacted
      )
      .map((l) => ({ ...l.enacted, moment: this.moment(l.enacted.timestamp) }))
      .reduce(
        (keep, curr) =>
          !keep || curr.moment.isAfter(keep.moment) ? curr : keep,
        /** @type {LastEnacted | undefined} */ (undefined)
      );

    const lastPredicted = recentLoops
      .filter((l) => l.predicted && l.predicted.startDate)
      .at(-1)?.predicted;

    const lastLoop = recentLoops.reduce(
      (keep, curr) => (!keep || curr.moment.isAfter(keep.moment) ? curr : keep),
      /** @type {recentLoops[number] | undefined} */ (undefined)
    );

    /**
     * @typedef {NonNullable<recentData[number]["override"]> & {
     *   moment: import("moment").Moment;
     * }} LastOverride
     */
    const lastOverride = recentData.reduce((last, curr) => {
      if (curr.override?.timestamp) {
        const moment = this.moment(curr.override.timestamp);
        if (!last || moment.isAfter(last.moment)) {
          return Object.assign(curr.override, { moment });
        }
      }
      return last;
    }, /** @type {LastOverride | undefined} */ (undefined));

    const lastOkMoment = recentLoops.reduce((keep, curr) => {
      if (!keep || (!curr.failureReason && curr.moment.isAfter(keep))) {
        return curr.moment;
      }
      return keep;
    }, /** @type {import("moment").Moment | undefined} */ (undefined));

    const display = this.getDisplayForStatus(lastLoop, recent);

    return {
      lastLoop,
      lastEnacted,
      lastPredicted,
      lastOkMoment,
      ...(lastOverride && { lastOverride }),
      display,
    };
  }

  /** @param {import("../sandbox").InitializedSandbox} sbx */
  checkNotifications(sbx) {
    const prefs = this.getPrefs(sbx);

    if (!prefs.enableAlerts) return;

    const prop = sbx.properties.loop;

    if (!prop?.lastLoop) {
      console.info("Loop hasn't reported a loop yet");
      return;
    }

    const now = this.moment();
    const level = this.statusLevel(prop, prefs, sbx);
    if (level >= this.levels.WARN) {
      sbx.notifications.requestNotify({
        level: level,
        title: "Loop isn't looping",
        message:
          "Last Loop: " +
          (!!prop.lastOkMoment &&
            this.utils.formatAgo(prop.lastOkMoment, now.valueOf())),
        pushoverSound: "echo",
        group: "Loop",
        plugin: this,
        debug: prop,
      });
    }
  }

  /**
   * @param {import("../sandbox").InitializedSandbox} sbx
   * @returns {import("../types").PluginEventType[]}
   */
  getEventTypes(sbx) {
    const units = sbx.settings.units;
    console.log("units", units);

    if (!sbx.data.profile?.data?.length) return [];

    let profile = sbx.data.profile.data[0];

    if (!profile.loopSettings?.overridePresets) return [];

    let presets = profile.loopSettings.overridePresets;

    const reasonconf = presets.map((preset) => ({
      name: preset.name,
      displayName: preset.symbol + " " + preset.name,
      duration: preset.duration / 60,
    }));

    /**
     * @type {NonNullable<
     *   import("../types").PluginEventType["submitHook"]
     * >}
     */
    const postLoopNotification = function (client, data, callback) {
      $.ajax({
        method: "POST",
        headers: client.headers(),
        url: "/api/v2/notifications/loop",
        data: data,
      })
        .done(() => {
          callback();
        })
        .fail((jqXHR) => {
          callback(!!jqXHR.responseText);
        });
    };

    // TODO: add OTP entry

    return [
      {
        val: "Temporary Override",
        name: "Temporary Override",
        bg: false,
        insulin: false,
        carbs: false,
        prebolus: false,
        duration: true,
        percent: false,
        absolute: false,
        profile: false,
        split: false,
        targets: false,
        reasons: reasonconf,
        submitHook: postLoopNotification,
      },
      {
        val: "Temporary Override Cancel",
        name: "Temporary Override Cancel",
        bg: false,
        insulin: false,
        carbs: false,
        prebolus: false,
        duration: false,
        percent: false,
        absolute: false,
        profile: false,
        split: false,
        targets: false,
        submitHook: postLoopNotification,
      },
      {
        val: "Remote Carbs Entry",
        name: "Remote Carbs Entry",
        remoteCarbs: true,
        remoteAbsorption: true,
        otp: true,
        submitHook: postLoopNotification,
      },
      {
        val: "Remote Bolus Entry",
        name: "Remote Bolus Entry",
        remoteBolus: true,
        otp: true,
        submitHook: postLoopNotification,
      },
    ];
  }

  /** @protected @param {import("../sandbox").ClientInitializedSandbox} sbx */
  iobValueParts(sbx) {
    const iob = sbx.properties.loop?.lastLoop?.iob;
    if (!iob) return [];

    return [
      ", IOB: ",
      sbx.roundInsulinForDisplayFormat(iob.iob) + "U",
      iob.basaliob
        ? ", Basal IOB " + sbx.roundInsulinForDisplayFormat(iob.basaliob) + "U"
        : "",
    ];
  }

  /** @protected @param {import("../sandbox").ClientInitializedSandbox} sbx */
  cobValueParts(sbx) {
    const cob = sbx.properties.loop?.lastLoop?.cob;
    if (!cob) return [];

    return [", COB: ", Math.round(cob.cob) + "g"];
  }

  /** @protected @param {import("../sandbox").ClientInitializedSandbox} sbx */
  eventualBgValueParts(sbx) {
    const lastLoop = sbx.properties.loop?.lastLoop;
    if (!lastLoop?.predicted) return [];

    const predictedBGvalues = lastLoop.predicted.values;
    const eventualBG = predictedBGvalues.at(-1);
    const maxBG = Math.max(...predictedBGvalues);
    const minBG = Math.min(...predictedBGvalues);
    const eventualBGscaled =
      sbx.settings.units === "mmol"
        ? sbx.roundBGToDisplayFormat(sbx.scaleMgdl(eventualBG ?? NaN))
        : eventualBG;
    const maxBGscaled =
      sbx.settings.units === "mmol"
        ? sbx.roundBGToDisplayFormat(sbx.scaleMgdl(maxBG))
        : maxBG;
    const minBGscaled =
      sbx.settings.units === "mmol"
        ? sbx.roundBGToDisplayFormat(sbx.scaleMgdl(minBG))
        : minBG;

    return [
      ", Predicted Min-Max BG: ",
      minBGscaled.toString(),
      "-",
      maxBGscaled.toString(),
      ", Eventual BG: ",
      eventualBGscaled?.toString() ?? "",
    ];
  }

  /** @protected @param {import("../sandbox").ClientInitializedSandbox} sbx */
  recommendedBolusValueParts(sbx) {
    const lastLoop = sbx.properties.loop?.lastLoop;
    if (!lastLoop?.recommendedBolus) return [];

    return [", Recommended Bolus: ", `${lastLoop.recommendedBolus}U`];
  }

  /** @protected @param {import("../sandbox").ClientInitializedSandbox} sbx */
  recommendedTempBasalEvents(sbx) {
    const lastLoop = sbx.properties.loop?.lastLoop;
    if (!lastLoop?.recommendedTempBasal) return [];

    const recommendedTempBasal = lastLoop.recommendedTempBasal;

    const valueParts = [
      `Suggested Temp: ${recommendedTempBasal.rate}U/hour for ${recommendedTempBasal.duration}m`,
      ...this.iobValueParts(sbx),
      ...this.cobValueParts(sbx),
      ...this.eventualBgValueParts(sbx),
      ...this.recommendedBolusValueParts(sbx),
    ];

    const events = [
      {
        time: this.moment(recommendedTempBasal.timestamp),
        value: valueParts.join(""),
      },
    ];

    return events;
  }

  /** @protected @param {import("../sandbox").ClientInitializedSandbox} sbx */
  rssiEvents(sbx) {
    const { mostRecent, pumpRSSI, bleRSSI } = sbx.data.devicestatus.reduce(
      (acc, entry) => {
        if (
          entry.radioAdapter &&
          acc.mostRecent?.isBefore(this.moment(entry.created_at))
        ) {
          const { pumpRSSI, RSSI: bleRSSI } = entry.radioAdapter;
          return { ...acc, pumpRSSI, bleRSSI };
        }

        return acc;
      },
      /**
       * @type {Partial<
       *   Record<`${"pump" | "ble"}RSSI`, number> & {
       *     mostRecent: import("moment").Moment;
       *   }
       * >}
       */ ({})
    );

    let reportRSSI = "";
    if (bleRSSI) reportRSSI += `BLE RSSI: ${bleRSSI} `;
    if (pumpRSSI) reportRSSI += `Pump RSSI: ${pumpRSSI}`;

    if (!reportRSSI) return [];

    return [
      {
        time: mostRecent,
        value: reportRSSI.trim(),
      },
    ];
  }

  /** @protected @param {import("../sandbox").ClientInitializedSandbox} sbx */
  lastEnactedEvents(sbx) {
    const lastEnacted = sbx.properties.loop?.lastEnacted;
    if (!lastEnacted) return [];

    const valueParts = [];

    if (lastEnacted.bolusVolume) {
      valueParts.push("<b>Automatic Bolus</b>");
      valueParts.push(` ${lastEnacted.bolusVolume}U`);
      if (lastEnacted.rate === 0 && lastEnacted.duration === 0) {
        valueParts.push(" (Temp Basal Canceled)");
      }
    } else if (lastEnacted.rate === 0 && lastEnacted.duration === 0) {
      valueParts.push("<b>Temp Basal Canceled</b>");
    } else if (!!lastEnacted.rate) {
      valueParts.push("<b>Temp Basal Started</b>");
      valueParts.push(
        ` ${lastEnacted.rate.toFixed(2)}U/hour for ${lastEnacted.duration}m`
      );
    }
    if (lastEnacted.reason) valueParts.push(`, ${lastEnacted.reason}`);

    valueParts.push(
      ...this.iobValueParts(sbx),
      ...this.cobValueParts(sbx),
      ...this.eventualBgValueParts(sbx),
      ...this.recommendedBolusValueParts(sbx)
    );

    return [
      {
        time: lastEnacted.moment,
        value: valueParts.join(""),
      },
    ];
  }

  /** @protected @param {LoopProperties | undefined} prop */
  getForecastPoints(prop) {
    const predicted = prop?.lastPredicted;
    if (!predicted?.values) return [];

    const startTime = this.moment(predicted.startDate);
    return predicted.values.map((value, index) => ({
      mgdl: value,
      color: "#ff00ff",
      mills: startTime.valueOf() + times.mins(5 * index).msecs,
      noFade: true,
    }));
  }

  /** @param {import("../sandbox").ClientInitializedSandbox} sbx */
  updateVisualisation(sbx) {
    const prop = sbx.properties.loop;

    const prefs = this.getPrefs(sbx);

    /** @param {string} prefix @param {string | null | undefined} value */
    function valueString(prefix, value) {
      return value != null ? prefix + value : "";
    }

    /** @type {{ time?: import("moment").Moment; value: string }[]} */
    const events = [];
    if (["enacted", "looping"].includes(prop?.display.code ?? "")) {
      events.push(...this.lastEnactedEvents(sbx));
    } else {
      if ("error" === prop?.display.code) {
        events.push({
          time: prop.lastLoop?.moment,
          value: valueString("Error: ", prop.lastLoop?.failureReason),
        });
      }

      events.push(...this.recommendedTempBasalEvents(sbx));
    }

    events.push(...this.rssiEvents(sbx));

    const sorted = events.sort(
      (a, b) => (b.time?.valueOf() ?? 0) - (a.time?.valueOf() ?? 0)
    );

    const info = sorted.map((event) => ({
      label:
        this.utils.timeAt(null, sbx) + this.utils.timeFormat(event.time, sbx),
      value: event.value,
    }));

    let loopName = prop?.lastLoop?.name ?? "Loop";

    const eventualBG = prop?.lastLoop?.predicted?.values?.at(-1);
    const eventualBGValue = eventualBG
      ? " ↝ " +
        (sbx.settings.units === "mmol"
          ? sbx.roundBGToDisplayFormat(sbx.scaleMgdl(eventualBG))
          : eventualBG)
      : "";

    const label = `${loopName} ${prop?.display.symbol}`;

    const lastLoopValue =
      prop?.lastLoop &&
      this.utils.timeFormat(prop.lastLoop.moment, sbx) + eventualBGValue;

    sbx.pluginBase.updatePillText(this, {
      value: lastLoopValue,
      label: label,
      info: info,
      pillClass: this.statusClass(prop, prefs, sbx),
    });

    const forecastPoints = this.getForecastPoints(prop);
    if (forecastPoints && forecastPoints.length > 0) {
      sbx.pluginBase.addForecastPoints(forecastPoints, {
        type: "loop",
        label: "Loop Forecasts",
      });
    }
  }

  /** @protected @param {Record<"min" | "max" | "sbxTime", number> & {endPrediction: import("moment").Moment}} values */
  virtAsstForecastResponse({ min, max, sbxTime, endPrediction }) {
    if (max === min) {
      return this.translate("virtAsstLoopForecastAround", {
        params: [
          max.toString(),
          this.moment(endPrediction).from(this.moment(sbxTime)),
        ],
      });
    }

    return this.translate("virtAsstLoopForecastBetween", {
      params: [
        min.toString(),
        max.toString(),
        this.moment(endPrediction).from(this.moment(sbxTime)),
      ],
    });
  }

  /** @protected @type {import("../types").VirtAsstIntentHandlerFn} */
  virtAsstForecastHandler(next, _slots, sbx) {
    const predicted = sbx.properties.loop?.lastLoop?.predicted;

    if (!predicted) {
      next(
        this.translate("virtAsstTitleLoopForecast"),
        this.translate("virtAsstUnknown")
      );
      return;
    }

    const forecast = predicted.values;
    const maxForecastIndex = Math.min(6, forecast.length);

    const startPrediction = this.moment(predicted.startDate);
    const endPrediction = startPrediction
      .clone()
      .add(maxForecastIndex * 5, "minutes");

    if (endPrediction.valueOf() < sbx.time) {
      next(
        this.translate("virtAsstTitleLoopForecast"),
        this.translate("virtAsstForecastUnavailable")
      );
      return;
    }

    const { max, min } = forecast.slice(0, maxForecastIndex).reduce(
      (acc, curr) => {
        if (curr > acc.max) acc.max = curr;
        if (curr < acc.min) acc.min = curr;

        return acc;
      },
      { max: forecast[0], min: forecast[0] }
    );

    next(
      this.translate("virtAsstTitleLoopForecast"),
      this.virtAsstForecastResponse({
        min,
        max,
        sbxTime: sbx.time,
        endPrediction,
      })
    );
  }

  /** @protected @type {import("../types").VirtAsstIntentHandlerFn} */
  virtAsstLastLoopHandler(next, _slots, sbx) {
    var lastLoop = sbx.properties.loop?.lastLoop;
    if (!lastLoop) {
      next(
        this.translate("virtAsstTitleLastLoop"),
        this.translate("virtAsstUnknown")
      );
    }

    console.log(JSON.stringify(lastLoop));

    const timeSinceLastLoop = this.moment(
      sbx.properties.loop?.lastOkMoment
    ).from(this.moment(sbx.time));
    next(
      this.translate("virtAsstTitleLastLoop"),
      this.translate("virtAsstLastLoop", {
        params: [timeSinceLastLoop],
      })
    );
  }

  virtAsst = {
    intentHandlers: [
      {
        intent: "MetricNow",
        metrics: ["loop forecast", "forecast"],
        intentHandler: this.virtAsstForecastHandler.bind(this),
      },
      {
        intent: "LastLoop",
        intentHandler: this.virtAsstLastLoopHandler.bind(this),
      },
    ],
  };

  /**
   * @param {LoopProperties | undefined} prop
   * @param {ReturnType<LoopPlugin["getPrefs"]>} prefs
   * @param {ReturnType<import("../sandbox")>} sbx
   * @protected
   */
  statusClass(prop, prefs, sbx) {
    const level = this.statusLevel(prop, prefs, sbx);
    switch (level) {
      case this.levels.WARN:
        return "warn";
      case this.levels.URGENT:
        return "urgent";
      default:
        return "current";
    }
  }

  /**
   * @param {LoopProperties | undefined} prop
   * @param {ReturnType<LoopPlugin["getPrefs"]>} prefs
   * @param {ReturnType<import("../sandbox")>} sbx
   * @protected
   */
  statusLevel(prop, prefs, sbx) {
    const now = this.moment(sbx.time);

    if (!prop?.lastOkMoment) return this.levels.NONE;

    const urgentTime = prop.lastOkMoment.clone().add(prefs.urgent, "minutes");
    if (urgentTime?.isBefore(now)) return this.levels.URGENT;

    const warningTime = prop.lastOkMoment.clone().add(prefs.warn, "minutes");
    if (warningTime?.isBefore(now)) return this.levels.WARN;

    return this.levels.NONE;
  }
}

/** @param {import(".").PluginCtx} ctx */
module.exports = (ctx) => new LoopPlugin(ctx);
