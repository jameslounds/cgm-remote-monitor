"use strict";

/** @import {DeviceStatus, Plugin, VirtAsstIntentHandlerFn} from "../types" */
/** @import {PluginCtx} from "." */
/** @import {ClientInitializedSandbox, InitializedSandbox, Sbx} from "../sandbox" */

const times = require("../times");

/** @typedef {ReturnType<UpBatPlugin["analyzeData"]>} UpBatProperties */

/** @implements {Plugin} */
class UpBatPlugin {
  name = /** @type {const} */ ("upbat");
  label = "Uploader Battery";
  pluginType = "pill-status";
  pillFlip = true;

  /** @param {PluginCtx} ctx */
  constructor(ctx) {
    this.translate = ctx.language.translate;
    this.levels = ctx.levels;
  }

  /** @param {Sbx} sbx */
  getPrefs(sbx) {
    return {
      warn: Number(sbx.extendedSettings.warn) || 30,
      urgent: Number(sbx.extendedSettings.urgent) || 20,
      enableAlerts: Boolean(sbx.extendedSettings.enableAlerts),
    };
  }

  /** @param {ClientInitializedSandbox} sbx */
  setProperties(sbx) {
    sbx.offerProperty("upbat", () => this.analyzeData(sbx));
  }

  /**
   * @template {Pick<
   *   DeviceStatus,
   *   "uploader" | "created_at" | "mills" | "_id"
   * > & { uploader: {} }} T
   * @param {(T | undefined)[]} statuses
   * @protected
   */
  minByBattery(statuses) {
    return statuses.reduce(
      (lowest, curr) =>
        !lowest || (curr?.uploader?.battery ?? NaN) < lowest.uploader.battery
          ? curr
          : lowest,
      /** @type {T | undefined} */ (undefined)
    );
  }

  /**
   * @param {DeviceStatus & { uploader: {} }} status
   * @param {ReturnType<UpBatPlugin["getPrefs"]>} prefs
   * @protected
   */
  analyzeStatus(status, prefs) {
    const uploaderStatus = status.uploader;

    const charging = !!status.isCharging;

    const battery = uploaderStatus.battery;

    const voltage = uploaderStatus.batteryVoltage
      ? uploaderStatus.batteryVoltage > 1000
        ? uploaderStatus.batteryVoltage / 1000
        : uploaderStatus.batteryVoltage
      : undefined;

    const voltageDisplay = voltage ? voltage.toFixed(3) + "v" : undefined;

    if (!battery && !voltage) return;

    const value = battery || voltage;

    const display =
      (battery ? battery + "%" : voltageDisplay) + (charging ? "⚡" : "");

    const level =
      (battery >= 95 && 100) ||
      (55 <= battery && battery < 99 && 75) ||
      (30 <= battery && battery < 55 && 50) ||
      25;

    const notification =
      (battery <= prefs.warn && battery > prefs.urgent && this.levels.WARN) ||
      (battery <= prefs.urgent && this.levels.URGENT) ||
      undefined;

    return {
      value,
      battery,
      voltage,
      voltageDisplay,
      display,
      level,
      notification,
    };
  }

  /** @param {ClientInitializedSandbox} sbx */
  analyzeData(sbx) {
    const prefs = this.getPrefs(sbx);

    const recentMins = 30;
    const recentMills = sbx.time - times.mins(recentMins).msecs;

    const recentData = (sbx.data.devicestatus ?? []).filter(
      /** @returns {status is DeviceStatus & { uploader: {} }} */
      (status) =>
        "uploader" in status &&
        status.mills <= sbx.time &&
        status.mills >= recentMills
    );

    const analyzedStatuses = recentData.map((status) => ({
      ...status,
      uploader: { ...status.uploader, ...this.analyzeStatus(status, prefs) },
    }));

    const grouped = Object.groupBy(
      analyzedStatuses,
      (status) => status.device || "uploader"
    );

    const deviceArr = Object.entries(grouped).map(([uri, statuses]) => ({
      uri,
      name: uri.startsWith("openaps://")
        ? uri.substring("openaps://".length)
        : uri,
      statuses: statuses
        .map((status) => ({
          uploader: status.uploader,
          created_at: status.created_at,
          mills: status.mills,
          _id: status._id,
        }))
        .toSorted((a, b) => b.mills - a.mills),
    }));

    const recentLowests = deviceArr.map((device) => {
      // Since we sorted `device.statuses` above, this is the most recent status
      const first = device.statuses.at(0);
      const recent = sbx.entryMills(first) - times.mins(10).msecs;

      const recentLowest = this.minByBattery(
        device.statuses.filter((s) => sbx.entryMills(s) > recent)
      );

      return recentLowest;
    });

    /*
     * Slightly hacky since js has no `zip` like functionality. We know for
     * certain that`recentLowests` and `deviceArr` have the same length, so this
     * _is_ safe, it just doesn't feel like it
     */
    const deviceArrWithMin = recentLowests.map((status, i) => ({
      ...deviceArr[i],
      min: status?.uploader,
    }));

    const devices = Object.fromEntries(deviceArrWithMin.map((d) => [d.uri, d]));

    const min = this.minByBattery(recentLowests);

    if (!min?.uploader) {
      return { devices, display: "?%" };
    }

    return {
      devices,
      level: min.uploader.level,
      display: min.uploader.display,
      status: this.levels.toStatusClass(min.uploader.notification),
      min: min.uploader,
    };
  }

  /** @param {InitializedSandbox} sbx */
  checkNotifications(sbx) {
    const prefs = this.getPrefs(sbx);

    const prop = sbx.properties.upbat;
    if (!prop || !prefs.enableAlerts) return;

    if (!prop.min?.notification || prop.min.notification >= this.levels.WARN) {
      return;
    }

    const message = Object.values(prop.devices)
      .map((device) => {
        const info = [device.name, device.min?.display];

        if (device.min?.battery && device.min.voltageDisplay) {
          info.push("(" + device.min.voltageDisplay + ")");
        }

        return info.join(" ");
      })
      .join("; ");

    sbx.notifications.requestNotify({
      level: prop.min.notification,
      title:
        this.levels.toDisplay(prop.min.notification) +
        " Uploader Battery is Low",
      message: message,
      pushoverSound: "echo",
      group: "Uploader Battery",
      plugin: this,
      debug: prop,
    });
  }

  /** @param {ClientInitializedSandbox} sbx */
  updateVisualisation(sbx) {
    const prop = sbx.properties.upbat;

    const devices = Object.values(prop?.devices ?? {});

    let info;
    if (devices.length > 1) {
      info = devices.map((device) => {
        const info = {
          label: device.name,
          value: device.min?.display ?? "",
        };

        if (device.min && device.min.battery && device.min.voltageDisplay) {
          info.value += " (" + device.min.voltageDisplay + ")";
        }

        if (device.min && device.min.temperature) {
          info.value += " " + device.min.temperature;
        }
        return info;
      });
    } else {
      if (prop?.min?.battery && prop.min.voltageDisplay) {
        info = [{ label: "Voltage", value: prop.min.voltageDisplay }];
        if (prop?.min?.temperature) {
          info.push({ label: "Temp", value: prop.min.temperature.toString() });
        }
      }
    }

    sbx.pluginBase.updatePillText(this, {
      value: prop && prop.display,
      labelClass: prop?.level ? "icon-battery-" + prop.level : undefined,
      pillClass: prop && prop.status,
      info: info,
      hide: !(prop && prop.min && prop.min.value && prop.min.value >= 0),
    });
  }

  /** @type {VirtAsstIntentHandlerFn} */
  virtAsstUploaderBatteryHandler(next, _slots, sbx) {
    const upBat = sbx.properties.upbat?.display;

    if (upBat) {
      const response = this.translate("virtAsstUploaderBattery", {
        params: [upBat],
      });
      next(this.translate("virtAsstTitleUploaderBattery"), response);
    } else {
      next(
        this.translate("virtAsstTitleUploaderBattery"),
        this.translate("virtAsstUnknown")
      );
    }
  }

  virtAsst = {
    intentHandlers: [
      {
        // for backwards compatibility
        intent: "UploaderBattery",
        intentHandler: this.virtAsstUploaderBatteryHandler.bind(this),
      },
      {
        intent: "MetricNow",
        metrics: ["uploader battery"],
        intentHandler: this.virtAsstUploaderBatteryHandler.bind(this),
      },
    ],
  };
}

/** @param {PluginCtx} ctx */
module.exports = (ctx) => new UpBatPlugin(ctx);
