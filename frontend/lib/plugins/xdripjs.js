"use strict";

/** @import {Moment} from "moment" */

/** @import {DeviceStatus, KeysOfType, Level, Plugin, RemovePrefix, VirtAsstIntentHandlerFn} from "../types" */
/** @import {PluginCtx} from "." */
/** @import {ClientInitializedSandbox, InitializedSandbox, Sbx} from "../sandbox" */
/** @import {TranslationKey} from "../language" */

/** @typedef {ReturnType<XDripJsPlugin["analyzeData"]>} SensorStateProperties */

const times = require("../times");

/** @implements {Plugin} */
class XDripJsPlugin {
  name = /** @type {const} */ ("xdripjs");
  label = "CGM Status";
  pluginType = "pill-status";

  /** @param {PluginCtx} ctx */
  constructor(ctx) {
    this.moment = ctx.moment;
    this.levels = ctx.levels;
    this.utils = require("../utils")(ctx);
    this.translate = ctx.language.translate;

    /** @type {null | { timestamp: Moment; state: number }} */
    this.lastStateNotification = null;
    this.firstPrefs = true;
  }

  /** @param {Sbx} sbx */
  getPrefs(sbx) {
    const prefs = {
      enableAlerts: Boolean(sbx.extendedSettings.enableAlerts) || false,
      warnBatV: Number(sbx.extendedSettings.warnBatV) || 300,
      stateNotifyIntrvl: Number(sbx.extendedSettings.stateNotifyIntrvl) || 0.5,
    };

    if (this.firstPrefs) {
      this.firstPrefs = false;
      console.info("xdripjs Prefs:", prefs);
    }

    return prefs;
  }

  /** @param {Sbx} sbx */
  setProperties(sbx) {
    sbx.offerProperty("sensorState", () => this.analyzeData(sbx));
  }

  /** @param {InitializedSandbox} sbx */
  checkNotifications(sbx) {
    const info = sbx.properties.sensorState;

    if (info?.notification) {
      const notification = {
        ...info.notification,
        plugin: this,
        debug: {
          stateString: info.lastStateString,
        },
      };

      sbx.notifications.requestNotify(notification);
    }
  }

  /**
   * @param {ReturnType<XDripJsPlugin["getPrefs"]>} prefs
   * @param {DeviceStatus["xdripjs"] & {}} data
   * @protected
   */
  latestStateNotificationInfo(
    prefs,
    { state, stateString, voltagea, voltageb }
  ) {
    if (voltageb && voltageb < prefs.warnBatV - 10) {
      return {
        message: "CGM Transmitter Battery B Low Voltage: " + voltageb,
        title: "CGM Transmitter Battery Low",
        level: this.levels.WARN,
      };
    }

    if (voltagea && voltagea < prefs.warnBatV) {
      return {
        message: "CGM Transmitter Battery A Low Voltage: " + voltagea,
        title: "CGM Transmitter Battery Low",
        level: this.levels.WARN,
      };
    }

    if (state !== 0x6) {
      // Send warning notification for all states that are not 'OK'
      // but only send state notifications at interval preference
      if (
        !this.lastStateNotification ||
        this.lastStateNotification.state !== state ||
        !prefs.stateNotifyIntrvl ||
        this.moment().diff(this.lastStateNotification.timestamp, "minutes") >
          prefs.stateNotifyIntrvl * 60
      ) {
        this.lastStateNotification = {
          timestamp: this.moment(),
          state,
        };
      }

      return {
        message: "CGM Transmitter state: " + stateString,
        title: "CGM Transmitter state: " + stateString,

        // If it is a calibration request, only use INFO
        level: state === 0x7 ? this.levels.INFO : this.levels.WARN,
      };
    }
  }

  /** @param {Sbx} sbx */
  analyzeData(sbx) {
    const prefs = this.getPrefs(sbx);

    const recentHours = 24;
    const recentMills = sbx.time - times.hours(recentHours).msecs;

    const recentData = sbx.data.devicestatus
      .filter(
        /** @returns {status is DeviceStatus & {xdripjs: {timestamp: {}}}} */
        (status) =>
          "xdripjs" in status &&
          recentMills <= sbx.entryMills(status) &&
          sbx.entryMills(status) <= sbx.time &&
          !!status.xdripjs?.timestamp
      )
      .toSorted((a, b) => a.xdripjs.timestamp - b.xdripjs.timestamp);

    const devices = recentData.reduce(
      (devices, status) => {
        const uri = status.device || "device";
        devices[uri] ??= { name: this.utils.deviceName(uri), uri };
        return devices;
      },
      /** @type {Record<string, Record<"uri" | "name", string>>} */
      ({})
    );

    const sensorInfo = recentData.at(-1);

    if (!sensorInfo) return { seenDevices: devices };

    const notificationInfo = this.latestStateNotificationInfo(
      prefs,
      sensorInfo.xdripjs
    );

    const level = notificationInfo?.level ?? this.levels.NONE;

    const notification =
      notificationInfo && prefs.enableAlerts
        ? { ...notificationInfo, pushoverSound: "incoming", group: "xDrip-js" }
        : undefined;

    const lastStateTime = this.moment(sensorInfo.xdripjs.timestamp);

    return {
      seenDevices: devices,
      notification,
      level,
      lastStateTime,
      lastState: sensorInfo.xdripjs.state,
      lastStateString: sensorInfo.xdripjs.stateString,
      lastStateStringShort: sensorInfo.xdripjs.stateStringShort,
      lastSessionStart: sensorInfo.xdripjs.sessionStart,
      lastTxId: sensorInfo.xdripjs.txId,
      lastTxStatus: sensorInfo.xdripjs.txStatus,
      lastTxStatusString: sensorInfo.xdripjs.txStatusString,
      lastTxStatusStringShort: sensorInfo.xdripjs.txStatusStringShort,
      lastTxActivation: sensorInfo.xdripjs.txActivation,
      lastMode: sensorInfo.xdripjs.mode,
      lastRssi: sensorInfo.xdripjs.rssi,
      lastUnfiltered: sensorInfo.xdripjs.unfiltered,
      lastFiltered: sensorInfo.xdripjs.filtered,
      lastNoise: sensorInfo.xdripjs.noise,
      lastNoiseString: sensorInfo.xdripjs.noiseString,
      lastSlope: Math.round(sensorInfo.xdripjs.slope * 100) / 100.0,
      lastIntercept: Math.round(sensorInfo.xdripjs.intercept * 100) / 100.0,
      lastCalType: sensorInfo.xdripjs.calType,
      lastCalibrationDate: sensorInfo.xdripjs.lastCalibrationDate,
      lastBatteryTimestamp: sensorInfo.xdripjs.batteryTimestamp,
      lastVoltageA: sensorInfo.xdripjs.voltagea,
      lastVoltageB: sensorInfo.xdripjs.voltageb,
      lastTemperature: sensorInfo.xdripjs.temperature,
      lastResistance: sensorInfo.xdripjs.resistance,
    };
  }

  /** @param {ClientInitializedSandbox} sbx */
  updateVisualisation(sbx) {
    const sensor = sbx.properties.sensorState;
    /** @type {{ label: string; value: string }[]} */
    const info = [];

    info.push(
      ...Object.values(sensor?.seenDevices ?? {}).map(({ name }) => ({
        label: "Seen: ",
        value: name,
      }))
    );

    info.push({
      label: "State Time: ",
      value:
        (sensor?.lastStateTime &&
          this.moment().diff(sensor.lastStateTime, "minutes") +
            " minutes ago") ||
        "Unknown",
    });
    info.push({
      label: "Mode: ",
      value: sensor?.lastMode || "Unknown",
    });
    info.push({
      label: "Status: ",
      value: sensor?.lastStateString || "Unknown",
    });

    // session start is only valid if in a session
    if (sensor?.lastSessionStart && sensor.lastState !== 0x1) {
      const diffTime = this.moment().diff(this.moment(sensor.lastSessionStart));
      const duration = this.moment.duration(diffTime);

      const sessionDuration = `${duration.days()} days ${duration.hours()} hours`;

      info.push({ label: "Session Age: ", value: sessionDuration });
    }

    info.push({
      label: "Tx ID: ",
      value: sensor?.lastTxId || "Unknown",
    });
    info.push({
      label: "Tx Status: ",
      value: sensor?.lastTxStatusString || "Unknown",
    });

    if (sensor) {
      if (sensor.lastTxActivation) {
        info.push({
          label: "Tx Age: ",
          value:
            this.moment().diff(this.moment(sensor.lastTxActivation), "days") +
            " days",
        });
      }

      if (sensor.lastRssi) {
        info.push({ label: "RSSI: ", value: sensor.lastRssi.toString() });
      }

      if (sensor.lastUnfiltered) {
        info.push({
          label: "Unfiltered: ",
          value: sensor.lastUnfiltered.toString(),
        });
      }

      if (sensor.lastFiltered) {
        info.push({
          label: "Filtered: ",
          value: sensor.lastFiltered.toString(),
        });
      }

      if (sensor.lastNoiseString) {
        info.push({
          label: "Noise: ",
          value: sensor.lastNoiseString.toString(),
        });
      }

      if (sensor.lastSlope) {
        info.push({ label: "Slope: ", value: sensor.lastSlope.toString() });
      }

      if (sensor.lastIntercept) {
        info.push({
          label: "Intercept: ",
          value: sensor.lastIntercept.toString(),
        });
      }

      if (sensor.lastCalType) {
        info.push({ label: "CalType: ", value: sensor.lastCalType });
      }

      if (sensor.lastCalibrationDate) {
        info.push({
          label: "Calibration: ",
          value:
            this.moment().diff(
              this.moment(sensor.lastCalibrationDate),
              "hours"
            ) + " hours ago",
        });
      }

      if (sensor.lastBatteryTimestamp) {
        info.push({
          label: "Battery: ",
          value:
            this.moment().diff(
              this.moment(sensor.lastBatteryTimestamp),
              "minutes"
            ) + " minutes ago",
        });
      }

      if (sensor.lastVoltageA) {
        info.push({
          label: "VoltageA: ",
          value: sensor.lastVoltageA.toString(),
        });
      }

      if (sensor.lastVoltageB) {
        info.push({
          label: "VoltageB: ",
          value: sensor.lastVoltageB.toString(),
        });
      }

      if (sensor.lastTemperature) {
        info.push({
          label: "Temperature: ",
          value: sensor.lastTemperature.toString(),
        });
      }

      if (sensor.lastResistance) {
        info.push({
          label: "Resistance: ",
          value: sensor.lastResistance.toString(),
        });
      }

      const statusClass =
        // Still highlight even the 'INFO' events for now
        sensor.level === this.levels.WARN || sensor.level === this.levels.INFO
          ? "warn"
          : undefined;

      sbx.pluginBase.updatePillText(this, {
        value:
          sensor?.lastStateStringShort || sensor?.lastStateString || "Unknown",
        label: "CGM",
        info: info,
        pillClass: statusClass,
      });
    }
  }

  /**
   * @param {RemovePrefix<
   *   "virtAsstCGM",
   *   Extract<TranslationKey, `virtAsstCGM${string}`>
   * > &
   *   RemovePrefix<
   *     "virtAsstTitleCGM",
   *     Extract<TranslationKey, `virtAsstTitleCGM${string}`>
   *   >} translateItem
   * @param {(
   *   | KeysOfType<string | number, SensorStateProperties>
   *   | KeysOfType<Level, SensorStateProperties>
   * ) & {}} field
   * @returns {VirtAsstIntentHandlerFn}
   * @protected
   */
  makeVirtAsstGenericCGMHandler(translateItem, field) {
    return (next, _slots, sbx) => {
      let response;
      const state = sbx.properties.sensorState?.[field];

      if (state) {
        response = this.translate(`virtAsstCGM${translateItem}`, {
          params: [
            state.toString(),
            this.moment(sbx.properties.sensorState?.lastStateTime).from(
              this.moment(sbx.time)
            ),
          ],
        });
      } else {
        response = this.translate("virtAsstUnknown");
      }

      next(this.translate(`virtAsstTitleCGM${translateItem}`), response);
    };
  }

  /** @satisfies {Plugin["virtAsst"]} */
  virtAsst = {
    intentHandlers: [
      {
        intent: "MetricNow",
        metrics: ["cgm mode"],
        intentHandler: this.makeVirtAsstGenericCGMHandler("Mode", "lastMode"),
      },
      {
        intent: "MetricNow",
        metrics: ["cgm status"],
        intentHandler: this.makeVirtAsstGenericCGMHandler(
          "Status",
          "lastStateString"
        ),
      },
      {
        intent: "MetricNow",
        metrics: ["cgm session age"],
        intentHandler: (next, _slots, sbx) => {
          const lastSessionStart = sbx.properties.sensorState?.lastSessionStart;

          let response;

          // session start is only valid if in a session
          if (lastSessionStart) {
            if (sbx.properties.sensorState?.lastState !== 0x1) {
              const duration = this.moment.duration(
                this.moment().diff(this.moment(lastSessionStart))
              );
              response = this.translate("virtAsstCGMSessAge", {
                params: [
                  duration.days().toString(),
                  duration.hours().toString(),
                ],
              });
            } else {
              response = this.translate("virtAsstCGMSessNotStarted");
            }
          } else {
            response = this.translate("virtAsstUnknown");
          }

          // `virtAsstTitleCGMSessAge` is not a translation key,
          // but `virtAsstTitleCGMSessionAge` and `virtAsstCGMSessAge` both are
          next(this.translate("virtAsstTitleCGMSessAge"), response);
        },
      },
      {
        intent: "MetricNow",
        metrics: ["cgm tx status"],
        intentHandler: this.makeVirtAsstGenericCGMHandler(
          "TxStatus",
          "lastTxStatusString"
        ),
      },
      {
        intent: "MetricNow",
        metrics: ["cgm tx age"],
        intentHandler: (next, _slots, sbx) => {
          const lastTxActivation = sbx.properties.sensorState?.lastTxActivation;

          next(
            this.translate("virtAsstTitleCGMTxAge"),
            lastTxActivation
              ? this.translate("virtAsstCGMTxAge", {
                  params: [
                    this.moment()
                      .diff(this.moment(lastTxActivation), "days")
                      .toString(),
                  ],
                })
              : this.translate("virtAsstUnknown")
          );
        },
      },
      {
        intent: "MetricNow",
        metrics: ["cgm noise"],
        intentHandler: this.makeVirtAsstGenericCGMHandler(
          "Noise",
          "lastNoiseString"
        ),
      },
      {
        intent: "MetricNow",
        metrics: ["cgm battery"],
        intentHandler: (next, _slots, sbx) => {
          const lastVoltageA = sbx.properties.sensorState?.lastVoltageA;
          const lastVoltageB = sbx.properties.sensorState?.lastVoltageB;
          const lastBatteryTimestamp =
            sbx.properties.sensorState?.lastBatteryTimestamp;

          let response;

          if (lastVoltageA || lastVoltageB) {
            if (lastVoltageA && lastVoltageB) {
              response = this.translate("virtAsstCGMBattTwo", {
                params: [
                  (lastVoltageA / 100).toString(),
                  (lastVoltageB / 100).toString(),
                  this.moment(lastBatteryTimestamp).from(this.moment(sbx.time)),
                ],
              });
            } else {
              // TODO types: typescript isn't smart enough to figure out this is definitely defined
              const finalValue = lastVoltageA ? lastVoltageA : lastVoltageB;
              response = this.translate("virtAsstCGMBattOne", {
                params: [
                  ((finalValue ?? NaN) / 100).toString(),
                  this.moment(lastBatteryTimestamp).from(this.moment(sbx.time)),
                ],
              });
            }
          } else {
            response = this.translate("virtAsstUnknown");
          }

          next(this.translate("virtAsstTitleCGMBatt"), response);
        },
      },
    ],
  };
}

/** @param {PluginCtx} ctx */
module.exports = (ctx) => new XDripJsPlugin(ctx);
