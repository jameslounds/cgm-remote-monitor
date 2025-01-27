"use strict";

const times = require("../times");
const consts = require("../constants");

/** @import {Plugin, PluginEventType, DeviceStatus, OpenApsIob, OpenApsPredBGs, VirtAsstIntentHandlerFn} from "../types" */
/** @import {Sbx, InitializedSandbox, ClientInitializedSandbox} from "../sandbox" */
/** @import {PluginCtx} from "." */
/** @import {Moment} from "moment" */

/** @typedef {ReturnType<OpenApsPlugin["analyzeData"]>} OpenApsProperties */

/**
 * @typedef {Partial<Pick<DeviceStatus, "mmtune">> & {
 *   name: string;
 *   uri: string;
 *   status: ReturnType<OpenApsPlugin["momentsToLoopStatus"]> & {
 *     when: Moment;
 *   };
 * }} OpenApsDevice
 */

// var ALL_STATUS_FIELDS = ['status-symbol', 'status-label', 'iob', 'meal-assist', 'freq', 'rssi']; Unused variable
/** @implements {Plugin} */
class OpenApsPlugin {
  name = /** @type {const} */ ("openaps");
  label = "OpenAPS";
  pluginType = "pill-status";

  /** @param {PluginCtx} ctx */
  constructor(ctx) {
    this.moment = ctx.moment;
    this.utils = require("../utils")(ctx);
    this.translate = ctx.language.translate;
    this.levels = ctx.levels;
  }

  /** @type {NonNullable<Plugin["getClientPrefs"]>} */
  getClientPrefs() {
    return [
      {
        label: "Color prediction lines",
        id: "colorPredictionLines",
        type: "boolean",
      },
    ];
  }

  firstPrefs = true;
  /** @param {Sbx} sbx */
  getPrefs(sbx) {
    /** @param {string | undefined} value */
    function cleanList(value) {
      if (!value) return;
      const cleaned = decodeURIComponent(value).toLowerCase().split(" ");
      if (!cleaned.length || !cleaned[0]) return;
      return cleaned;
    }

    const settings = sbx.extendedSettings || {};

    const fields = cleanList(settings.fields) ?? [
      "status-symbol",
      "status-label",
      "iob",
      "meal-assist",
      "rssi",
    ];

    const retroFields = cleanList(settings.retroFields) ?? [
      "status-symbol",
      "status-label",
      "iob",
      "meal-assist",
      "rssi",
    ];

    if (typeof settings.colorPredictionLines === "undefined") {
      settings.colorPredictionLines = true;
    }

    return {
      fields: fields,
      retroFields: retroFields,
      warn: Number(settings.warn) || 30,
      urgent: Number(settings.urgent) || 60,
      enableAlerts: settings.enableAlerts,
      predIOBColor: String(settings.predIobColor) ?? "#1e88e5",
      predCOBColor: String(settings.predCobColor) ?? "#FB8C00",
      predACOBColor: String(settings.predAcobColor) ?? "#FB8C00",
      predZTColor: String(settings.predZtColor) ?? "#00d2d2",
      predUAMColor: String(settings.predUamColor) ?? "#c9bd60",
      colorPredictionLines: settings.colorPredictionLines,
    };
  }

  /** @param {ClientInitializedSandbox} sbx */
  setProperties(sbx) {
    sbx.offerProperty("openaps", () => this.analyzeData(sbx));
  }

  /**
   * @param {DeviceStatus} status
   * @param {Partial<
   *   Record<
   *     string,
   *     Omit<OpenApsDevice, "status"> & { status?: OpenApsDevice["status"] }
   *   >
   * >} seenDevices
   * @protected
   */
  getDevice(status, seenDevices) {
    const uri = status.device || "device";
    let device = seenDevices[uri];
    if (device) return device;

    device = {
      name: this.utils.deviceName(uri),
      uri,
    };
    seenDevices[uri] = device;
    return device;
  }

  /**
   * @param {DeviceStatus} status
   * @protected
   */
  toEnactedMoment(status) {
    if (
      status.openaps?.enacted?.timestamp &&
      (status.openaps.enacted.recieved || status.openaps.enacted.received)
    ) {
      return {
        enacted: this.moment(
          status.openaps.enacted.mills || status.openaps.enacted.timestamp
        ),
      };
    }
    if (
      status.openaps?.enacted?.timestamp &&
      !(status.openaps.enacted.recieved || status.openaps.enacted.received)
    ) {
      return {
        notEnacted: this.moment(
          status.openaps.enacted.mills || status.openaps.enacted.timestamp
        ),
      };
    }
  }

  /**
   * @param {DeviceStatus & {
   *   openaps?: { iob?: OpenApsIob };
   * }} status
   * @protected
   */
  toMoments(status) {
    const { openaps } = status;

    const enacted =
      !!openaps?.enacted?.timestamp &&
      !!(openaps.enacted.recieved || openaps.enacted.received) &&
      this.moment(openaps.enacted.mills || openaps.enacted.timestamp);
    const notEnacted =
      !!openaps?.enacted?.timestamp &&
      !(openaps.enacted.recieved || openaps.enacted.received) &&
      this.moment(openaps.enacted.mills || openaps.enacted.timestamp);

    const suggested =
      openaps?.suggested &&
      this.moment(openaps.suggested.mills || openaps.suggested.timestamp);

    const iob =
      openaps?.iob && this.moment(openaps.iob.mills || openaps.iob.timestamp);

    return {
      when: this.moment(status.mills),
      enacted: enacted || undefined,
      notEnacted: notEnacted || undefined,
      suggested,
      iob,
    };
  }

  /**
   * @param {Partial<ReturnType<OpenApsPlugin["toMoments"]>>} moments
   * @param {Moment} recent
   * @param {boolean} [noWarning]
   * @protected
   */
  momentsToLoopStatus(moments, recent, noWarning) {
    if (
      moments.notEnacted &&
      ((moments.enacted && moments.notEnacted.isAfter(moments.enacted)) ||
        (!moments.enacted && moments.notEnacted.isAfter(recent)))
    ) {
      return /** @type {const} */ ({
        symbol: "x",
        code: "notenacted",
        label: "Not Enacted",
      });
    } else if (moments.enacted && moments.enacted.isAfter(recent)) {
      return /** @type {const} */ ({
        symbol: "⌁",
        code: "enacted",
        label: "Enacted",
      });
    } else if (moments.suggested && moments.suggested.isAfter(recent)) {
      return /** @type {const} */ ({
        symbol: "↻",
        code: "looping",
        label: "Looping",
      });
    } else if (moments.when && (noWarning || moments.when.isAfter(recent))) {
      return /** @type {const} */ ({
        symbol: "◉",
        code: "waiting",
        label: "Waiting",
      });
    }

    return /** @type {const} */ ({
      symbol: "⚠",
      code: "warning",
      label: "Warning",
    });
  }

  /** @param {ClientInitializedSandbox} sbx */
  analyzeData(sbx) {
    const recentHours = 6; //TODO dia*2
    const recentMills = sbx.time - times.hours(recentHours).msecs;

    const recentData = sbx.data.devicestatus
      .filter(
        /**
         * @returns {status is DeviceStatus & {
         *  openaps: NonNullable<DeviceStatus['openaps']>
         * }}
         */
        (status) =>
          "openaps" in status &&
          status.mills <= sbx.time &&
          status.mills >= recentMills
      )
      .map((status) => {
        if (Array.isArray(status.openaps.iob)) {
          if (status.openaps.iob.length === 0) {
            return Object.assign(status, {
              openaps: Object.assign(status.openaps, { iob: undefined }),
            });
          }

          const iob = status.openaps.iob[0];
          if (iob.time) iob.timestamp = iob.time;

          return Object.assign(status, {
            openaps: Object.assign(status.openaps, {
              iob: iob,
            }),
          });
        }

        return Object.assign(status, {
          openaps: Object.assign(status.openaps, { iob: status.openaps.iob }),
        });
      });

    const prefs = this.getPrefs(sbx);
    const recent = this.moment(sbx.time).subtract(prefs.warn / 2, "minutes");

    /**
     * @template {keyof NonNullable<DeviceStatus["openaps"]>} T
     * @typedef {NonNullable<NonNullable<DeviceStatus["openaps"]>[T]> & {
     *   moment: Moment;
     * }} PropWithMoment
     */
    const result = {
      /** @type {Partial<Record<string, OpenApsDevice>>} */
      seenDevices: {},
      /** @type {null | PropWithMoment<"enacted">} */
      lastEnacted: null,
      /** @type {null | PropWithMoment<"enacted">} */
      lastNotEnacted: null,
      /** @type {null | PropWithMoment<"suggested">} */
      lastSuggested: null,
      /** @type {null | (OpenApsIob & { moment: Moment })} */
      lastIOB: null,
      /** @type {null | PropWithMoment<"mmtune">} */
      lastMMTune: null,
      /** @type {null | (OpenApsPredBGs & { moment: Moment })} */
      lastPredBGs: null,
      /** @type {undefined | Moment} */
      lastLoopMoment: undefined,
      /**
       * @type {undefined
       *   | NonNullable<
       *       NonNullable<DeviceStatus["openaps"]>["enacted"]
       *     >["eventualBG"]}
       */
      lastEventualBG: undefined,
    };

    recentData.forEach((status) => {
      const device = this.getDevice(status, result.seenDevices);

      const moments = this.toMoments(status);
      const loopStatus = this.momentsToLoopStatus(moments, recent, true);

      if (!device.status || moments.when.isAfter(device.status.when)) {
        device.status = { ...loopStatus, when: moments.when };
      }

      const enacted = status.openaps.enacted;
      if (
        enacted &&
        moments.enacted &&
        (!result.lastEnacted ||
          moments.enacted.isAfter(result.lastEnacted.moment))
      ) {
        const enactedMoment = this.moment(enacted.mills ?? enacted.timestamp);
        result.lastEnacted = Object.assign(enacted, { moment: enactedMoment });

        if (
          enacted.predBGs &&
          (!result.lastPredBGs ||
            enactedMoment.isAfter(result.lastPredBGs.moment))
        ) {
          result.lastPredBGs = {
            ...(Array.isArray(enacted.predBGs)
              ? { values: enacted.predBGs }
              : enacted.predBGs),
            moment: enactedMoment,
          };
        }
      }

      if (
        enacted &&
        moments.notEnacted &&
        (!result.lastNotEnacted ||
          moments.notEnacted.isAfter(result.lastNotEnacted.moment))
      ) {
        result.lastNotEnacted = Object.assign(enacted, {
          moment: this.moment(enacted.mills ?? enacted.timestamp),
        });
      }

      const suggested = status.openaps.suggested;
      if (
        suggested &&
        moments.suggested &&
        (!result.lastSuggested ||
          moments.suggested.isAfter(result.lastSuggested.moment))
      ) {
        const suggestedMoment = this.moment(
          suggested.mills ?? suggested.timestamp
        );
        result.lastSuggested = Object.assign(suggested, {
          moment: suggestedMoment,
        });
        if (
          suggested.predBGs &&
          (!result.lastPredBGs ||
            suggestedMoment.isAfter(result.lastPredBGs.moment))
        ) {
          result.lastPredBGs = {
            ...(Array.isArray(suggested.predBGs)
              ? { values: suggested.predBGs }
              : suggested.predBGs),
            moment: suggestedMoment,
          };
        }
      }

      const iob = status.openaps.iob;
      if (
        iob &&
        moments.iob &&
        (!result.lastIOB ||
          this.moment(iob.timestamp).isAfter(result.lastIOB.moment))
      ) {
        result.lastIOB = Object.assign(iob, { moment: moments.iob });
      }

      if (status.mmtune && status.mmtune.timestamp) {
        status.mmtune.moment = this.moment(status.mmtune.timestamp);
        if (!device.mmtune || moments.when.isAfter(device.mmtune.moment)) {
          device.mmtune = status.mmtune;
        }
      }
    });

    if (result.lastEnacted && result.lastSuggested) {
      if (result.lastEnacted.moment.isAfter(result.lastSuggested.moment)) {
        result.lastLoopMoment = result.lastEnacted.moment;
        result.lastEventualBG = result.lastEnacted.eventualBG;
      } else {
        result.lastLoopMoment = result.lastSuggested.moment;
        result.lastEventualBG = result.lastSuggested.eventualBG;
      }
    } else if (result.lastEnacted?.moment) {
      result.lastLoopMoment = result.lastEnacted.moment;
      result.lastEventualBG = result.lastEnacted.eventualBG;
    } else if (result.lastSuggested?.moment) {
      result.lastLoopMoment = result.lastSuggested.moment;
      result.lastEventualBG = result.lastSuggested.eventualBG;
    }

    const status = this.momentsToLoopStatus(
      {
        enacted: result.lastEnacted?.moment,
        notEnacted: result.lastNotEnacted?.moment,
        suggested: result.lastSuggested?.moment,
      },
      recent,
      false
    );

    return { ...result, status };
  }

  /** @param {InitializedSandbox} sbx @returns {PluginEventType[]} */
  getEventTypes(sbx) {
    const units = sbx.settings.units;
    console.log("units", units);

    /** @type {NonNullable<PluginEventType["reasons"]>} */
    const reasonconf = [
      {
        name: "Eating Soon",
        targetTop: units === "mmol" ? 4.5 : 80,
        targetBottom: units === "mmol" ? 4.5 : 80,
        duration: 60,
      },
      {
        name: "Activity",
        targetTop: units === "mmol" ? 8 : 140,
        targetBottom: units === "mmol" ? 6.5 : 120,
        duration: 120,
      },
      { name: "Manual" },
    ];

    return [
      {
        val: "Temporary Target",
        name: "Temporary Target",
        bg: false,
        insulin: false,
        carbs: false,
        prebolus: false,
        duration: true,
        percent: false,
        absolute: false,
        profile: false,
        split: false,
        targets: true,
        reasons: reasonconf,
      },
      {
        val: "Temporary Target Cancel",
        name: "Temporary Target Cancel",
        bg: false,
        insulin: false,
        carbs: false,
        prebolus: false,
        duration: false,
        percent: false,
        absolute: false,
        profile: false,
        split: false,
      },
      {
        val: "OpenAPS Offline",
        name: "OpenAPS Offline",
        bg: false,
        insulin: false,
        carbs: false,
        prebolus: false,
        duration: true,
        percent: false,
        absolute: false,
        profile: false,
        split: false,
      },
    ];
  }

  /** @param {InitializedSandbox} sbx */
  checkNotifications(sbx) {
    const prefs = this.getPrefs(sbx);

    if (!prefs.enableAlerts) return;

    const prop = sbx.properties.openaps;

    if (!prop?.lastLoopMoment) {
      console.info("OpenAPS hasn't reported a loop yet");
      return;
    }

    const now = this.moment();
    const level = this.statusLevel(prop, prefs, sbx);
    if (level >= this.levels.WARN) {
      sbx.notifications.requestNotify({
        level: level,
        title: "OpenAPS isn't looping",
        message:
          "Last Loop: " +
          this.utils.formatAgo(prop.lastLoopMoment, now.valueOf()),
        pushoverSound: "echo",
        group: "OpenAPS",
        plugin: this,
        debug: prop,
      });
    }
  }

  /** @param {Sbx} sbx */
  findOfflineMarker(sbx) {
    return sbx.data.treatments?.findLast((treatment) => {
      const eventTime = treatment.mills;
      const eventEnd = eventTime + times.mins(treatment.duration ?? 0).msecs;
      return (
        eventTime <= sbx.time &&
        sbx.time <= eventEnd &&
        treatment.eventType === "OpenAPS Offline"
      );
    });
  }

  /**
   * @param {string} prefix
   * @param {string | number} [value]
   * @protected
   */
  valueString(prefix, value) {
    return value ? prefix + value : "";
  }

  /**
   * @param {ClientInitializedSandbox} sbx
   * @param {string[]} selectedFields
   * @param {ReturnType<OpenApsPlugin["analyzeData"]>} [prop]
   * @protected
   */
  suggestionEvents(sbx, selectedFields, prop) {
    if (!prop?.lastSuggested) return [];

    const units = sbx.settings.units;
    const bg =
      units === "mmol"
        ? Math.round((prop.lastSuggested.bg / consts.MMOL_TO_MGDL) * 10) / 10
        : prop.lastSuggested.bg;

    const valueParts = [
      this.valueString("BG: ", bg),
      this.valueString(", ", prop.lastSuggested.reason),
      prop.lastSuggested.sensitivityRatio
        ? ", <b>Sensitivity Ratio:</b> " + prop.lastSuggested.sensitivityRatio
        : "",
      ...(selectedFields.includes("iob") ? this.iobValueParts(sbx, prop) : []),
    ];

    return [
      {
        time: prop.lastSuggested.moment,
        value: valueParts.join(""),
      },
    ];
  }

  /**
   * @param {ClientInitializedSandbox} sbx
   * @param {ReturnType<OpenApsPlugin["analyzeData"]>} [prop]
   * @protected
   */
  iobValueParts(sbx, prop) {
    if (!prop?.lastIOB) return [];

    return [
      ", IOB: ",
      sbx.roundInsulinForDisplayFormat(prop.lastIOB.iob) + "U",
      prop.lastIOB.basaliob
        ? ", Basal IOB " +
          sbx.roundInsulinForDisplayFormat(prop.lastIOB.basaliob) +
          "U"
        : "",
      prop.lastIOB.bolusiob
        ? ", Bolus IOB " +
          sbx.roundInsulinForDisplayFormat(prop.lastIOB.bolusiob) +
          "U"
        : "",
    ];
  }

  /**
   * @param {ReturnType<OpenApsPlugin["getPrefs"]>} prefs
   * @param {ReturnType<OpenApsPlugin["analyzeData"]>} [prop]
   * @protected
   */
  getForecastPoints(prefs, prop) {
    if (!prop?.lastPredBGs) return [];
    const lastPredBGs = prop.lastPredBGs;

    const colors = {
      Values: "#ff00ff",
      IOB: prefs.predIOBColor,
      "Zero-Temp": prefs.predZTColor,
      COB: prefs.predCOBColor,
      "Accel-COB": prefs.predACOBColor,
      UAM: prefs.predUAMColor,
    };

    /**
     * @param {number} offset
     * @param {keyof colors} forecastType
     */
    function toPoints(offset, forecastType) {
      /** @param {number} value @param {number} index */
      return function toPoint(value, index) {
        return {
          mgdl: value,
          color: prefs.colorPredictionLines ? colors[forecastType] : "#ff00ff",
          mills:
            lastPredBGs.moment.valueOf() + times.mins(5 * index).msecs + offset,
          noFade: true,
          forecastType: forecastType,
        };
      };
    }

    return [
      ...(lastPredBGs.values ?? []).map(toPoints(0, "Values")),
      ...(lastPredBGs.IOB ?? []).map(toPoints(3333, "IOB")),
      ...(lastPredBGs.ZT ?? []).map(toPoints(4444, "Zero-Temp")),
      ...(lastPredBGs.aCOB ?? []).map(toPoints(5555, "Accel-COB")),
      ...(lastPredBGs.COB ?? []).map(toPoints(7777, "COB")),
      ...(lastPredBGs.UAM ?? []).map(toPoints(9999, "UAM")),
    ];
  }

  /**
   * @param {ClientInitializedSandbox} sbx
   * @param {string[]} selectedFields
   * @param {ReturnType<OpenApsPlugin["analyzeData"]>} [prop]
   * @protected
   */
  enactedEvents(sbx, selectedFields, prop) {
    if (!prop?.lastEnacted) return [];

    const canceled =
      prop.lastEnacted.rate === 0 && prop.lastEnacted.duration === 0;
    const units = sbx.settings.units;
    const bg =
      units === "mmol"
        ? Math.round((prop.lastEnacted.bg / consts.MMOL_TO_MGDL) * 10) / 10
        : prop.lastEnacted.bg;

    const valueParts = [
      this.valueString("BG: ", bg),
      `, <b>Temp Basal${canceled ? " Canceled" : " Started"}</b>`,
      canceled
        ? ""
        : ` ${prop.lastEnacted.rate.toFixed(2)} for ${prop.lastEnacted.duration}m`,
      this.valueString(", ", prop.lastEnacted.reason),
      prop.lastEnacted.mealAssist && selectedFields.includes("meal-assist")
        ? ` <b>Meal Assist:</b> ${prop.lastEnacted.mealAssist}`
        : "",
    ];

    /** @type {{ time: Moment; value: string }[]} */
    const events = [];

    if (prop.lastSuggested?.moment.isAfter(prop.lastEnacted.moment)) {
      events.push(...this.suggestionEvents(sbx, selectedFields, prop));
    } else {
      valueParts.push(...this.iobValueParts(sbx, prop));
    }

    events.push({
      time: prop.lastEnacted.moment,
      value: valueParts.join(""),
    });
    return events;
  }

  /**
   * @param {string[]} selectedFields
   * @param {ReturnType<OpenApsPlugin["analyzeData"]>} [prop]
   * @protected
   */
  deviceInfoEvents(selectedFields, prop) {
    return Object.values(prop?.seenDevices ?? {})
      .map((device) => {
        if (!device) return;
        const deviceInfo = [device.name];

        if (selectedFields.includes("status-symbol")) {
          deviceInfo.push(device.status.symbol);
        }
        if (selectedFields.includes("status-label")) {
          deviceInfo.push(device.status.label);
        }

        if (device.mmtune) {
          /** Will be `-Infinity` if no valid `mmtune.scanDetails` are found */
          const best = Math.max(
            ...(device.mmtune.scanDetails ?? [])
              .map((d) => d.at(2))
              .filter((el) => el !== undefined)
          );

          if (selectedFields.includes("freq")) {
            deviceInfo.push(device.mmtune.setFreq + "MHz");
          }
          if (best !== -Infinity && selectedFields.includes("rssi")) {
            deviceInfo.push(`@ ${best}dB`);
          }
        }

        return {
          time: device.status.when,
          value: deviceInfo.join(" "),
        };
      })
      .filter((e) => !!e);
  }

  /** @param {ClientInitializedSandbox} sbx */
  updateVisualisation(sbx) {
    const prop = sbx.properties.openaps;

    const prefs = this.getPrefs(sbx);

    const selectedFields = sbx.data.inRetroMode
      ? prefs.retroFields
      : prefs.fields;

    const events = [
      ...("enacted" === prop?.status.code
        ? this.enactedEvents(sbx, selectedFields, prop)
        : this.suggestionEvents(sbx, selectedFields, prop)),

      ...this.deviceInfoEvents(selectedFields, prop),
    ];

    const sorted = events.toSorted((a, b) => +b.time - +a.time);

    const info = sorted.map((event) => ({
      label:
        this.utils.timeAt(undefined, sbx) +
        this.utils.timeFormat(event.time, sbx),
      value: event.value,
    }));

    const label = selectedFields.includes("status-symbol")
      ? `OpenAPS ${prop?.status.symbol}`
      : "OpenAPS";

    sbx.pluginBase.updatePillText(this, {
      value: this.utils.timeFormat(prop?.lastLoopMoment, sbx),
      label: label,
      info: info,
      pillClass: this.statusClass(prop, prefs, sbx),
    });

    const forecastPoints = this.getForecastPoints(prefs, prop);
    if (forecastPoints.length > 0) {
      sbx.pluginBase.addForecastPoints(forecastPoints, {
        type: "openaps",
        label: "OpenAPS Forecasts",
      });
    }
  }

  /** @type {VirtAsstIntentHandlerFn} */
  virtAsstForecastHandler(next, _slots, sbx) {
    const lastEventualBG = sbx.properties.openaps?.lastEventualBG;
    if (lastEventualBG) {
      const response = this.translate("virtAsstOpenAPSForecast", {
        params: [lastEventualBG.toString()],
      });
      next(this.translate("virtAsstTitleOpenAPSForecast"), response);
    } else {
      next(
        this.translate("virtAsstTitleOpenAPSForecast"),
        this.translate("virtAsstUnknown")
      );
    }
  }

  /** @type {VirtAsstIntentHandlerFn} */
  virtAsstLastLoopHandler(next, _slots, sbx) {
    const lastLoopMoment = sbx.properties.openaps?.lastLoopMoment;
    if (lastLoopMoment) {
      const response = this.translate("virtAsstLastLoop", {
        params: [this.moment(lastLoopMoment).from(this.moment(sbx.time))],
      });
      next(this.translate("virtAsstTitleLastLoop"), response);
    } else {
      next(
        this.translate("virtAsstTitleLastLoop"),
        this.translate("virtAsstUnknown")
      );
    }
  }

  virtAsst = {
    intentHandlers: [
      {
        intent: "MetricNow",
        metrics: ["openaps forecast", "forecast"],
        intentHandler: this.virtAsstForecastHandler.bind(this),
      },
      {
        intent: "LastLoop",
        intentHandler: this.virtAsstLastLoopHandler.bind(this),
      },
    ],
  };

  /**
   * @param {OpenApsProperties | undefined} prop
   * @param {ReturnType<OpenApsPlugin["getPrefs"]>} prefs
   * @param {Sbx} sbx
   * @protected
   */
  statusClass(prop, prefs, sbx) {
    const level = this.statusLevel(prop, prefs, sbx);
    return this.levels.toStatusClass(level);
  }

  /**
   * @param {OpenApsProperties | undefined} prop
   * @param {ReturnType<OpenApsPlugin["getPrefs"]>} prefs
   * @param {Sbx} sbx
   * @protected
   */
  statusLevel(prop, prefs, sbx) {
    const now = this.moment(sbx.time);

    if (this.findOfflineMarker(sbx)) {
      console.info("OpenAPS known offline, not checking for alerts");
      return this.levels.NONE;
    }
    if (!prop?.lastLoopMoment) return this.levels.NONE;

    const urgentTime = prop.lastLoopMoment.clone().add(prefs.urgent, "minutes");
    const warningTime = prop.lastLoopMoment.clone().add(prefs.warn, "minutes");

    if (urgentTime.isBefore(now)) {
      return this.levels.URGENT;
    } else if (warningTime.isBefore(now)) {
      return this.levels.WARN;
    }

    return this.levels.NONE;
  }
}

/** @param {PluginCtx} ctx */
module.exports = (ctx) => new OpenApsPlugin(ctx);
