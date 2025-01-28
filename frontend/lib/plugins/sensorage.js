"use strict";

/** @import {Notify, Plugin} from "../types" */
/** @import {PluginCtx} from "." */
/** @import {ClientInitializedSandbox, InitializedSandbox, Sbx} from "../sandbox" */

const times = require("../times");

/**
 * @typedef {{ found: false }
 *   | ({
 *       found: true;
 *       treatmentDate: number;
 *       display: string;
 *       displayLong: string;
 *       notes?: string;
 *       transmitterId?: string;
 *       sensorCode?: string;
 *     } & Record<"age" | "days" | "hours" | "minFractions", number>)} SensorInfo
 */
/** @typedef {ReturnType<SensorAgePlugin["findLatestTimeChange"]>} SAgeProperties */

/** @implements {Plugin} */
class SensorAgePlugin {
  name = /** @type {const} */ ("sage");
  label = "Sensor Age";
  pluginType = "pill-minor";

  /** @param {PluginCtx} ctx */
  constructor(ctx) {
    this.moment = ctx.moment;
    this.translate = ctx.language.translate;
    this.levels = ctx.levels;
  }

  /** @param {Sbx} sbx */
  getPrefs(sbx) {
    return {
      info: Number(sbx.extendedSettings.info) || times.days(6).hours,
      warn: Number(sbx.extendedSettings.warn) || times.days(7).hours - 4,
      urgent: Number(sbx.extendedSettings.urgent) || times.days(7).hours - 2,
      enableAlerts: Boolean(sbx.extendedSettings.enableAlerts) || false,
    };
  }

  /** @param {Sbx} sbx */
  setProperties(sbx) {
    sbx.offerProperty("sage", () => this.findLatestTimeChange(sbx));
  }

  /** @param {InitializedSandbox} sbx */
  checkNotifications(sbx) {
    const info = sbx.properties.sage;
    if (!info) return;
    const sensorInfo =
      info.min === "Sensor Start"
        ? info["Sensor Start"]
        : info["Sensor Change"];

    if (!sensorInfo.notification) return;

    const notification = {
      ...sensorInfo.notification,
      plugin: this,
      debug: {
        age: sensorInfo.found ? sensorInfo.age : undefined,
      },
    };

    sbx.notifications.requestNotify(notification);
  }

  /**
   * @param {Record<
   *   "Sensor Start" | "Sensor Change",
   *   { found: false } | { found: true; treatmentDate: number }
   * >} record
   * @protected
   */
  minButValid(record) {
    const { ["Sensor Start"]: start, ["Sensor Change"]: change } = record;

    if (start.found && change.found) {
      if (start.treatmentDate >= change.treatmentDate) {
        return "Sensor Start";
      }
      return "Sensor Change";
    }

    if (change.found) {
      return "Sensor Change";
    }

    return "Sensor Start";
  }

  /** @param {Sbx} sbx @param {SensorInfo} sensorInfo @protected */
  sensorInfoNotification(sbx, sensorInfo) {
    const prefs = this.getPrefs(sbx);
    const { sendNotification, message, sound, level } =
      this.sensorInfoNotificationInfo(prefs, sensorInfo);

    //allow for 20 minute period after a full hour during which we'll alert the user
    if (
      prefs.enableAlerts &&
      sendNotification &&
      sensorInfo.found &&
      sensorInfo.minFractions <= 20
    ) {
      /** @satisfies {Notify} */
      const notification = {
        title: this.translate("Sensor age %1 days %2 hours", {
          params: [sensorInfo.days.toString(), sensorInfo.hours.toString()],
        }),
        message,
        pushoverSound: sound,
        level,
        group: "SAGE",
      };
      return notification;
    }
  }

  /**
   * @param {ReturnType<SensorAgePlugin["getPrefs"]>} prefs
   * @param {SensorInfo} sensorInfo
   * @protected
   */
  sensorInfoNotificationInfo(prefs, sensorInfo) {
    if (sensorInfo.found) {
      if (sensorInfo.age >= prefs.urgent) {
        return {
          sendNotification: sensorInfo.age === prefs.urgent,
          message: this.translate("Sensor change/restart overdue!"),
          sound: "persistent",
          level: this.levels.URGENT,
        };
      }
      if (sensorInfo.age >= prefs.warn) {
        return {
          sendNotification: sensorInfo.age === prefs.warn,
          message: this.translate("Time to change/restart sensor"),
          level: this.levels.WARN,
          sound: "incoming",
        };
      }
      if (sensorInfo.age >= prefs.info) {
        return {
          sendNotification: sensorInfo.age === prefs.info,
          message: this.translate("Change/restart sensor soon"),
          level: this.levels.INFO,
          sound: "incoming",
        };
      }
    }

    return { sound: "incoming", level: this.levels.NONE };
  }

  static eventTypes = /** @type {const} */ (["Sensor Change", "Sensor Start"]);

  /** @param {Sbx} sbx */
  findLatestTimeChange(sbx) {
    /** @type {Record<`Sensor ${"Start" | "Change"}`, SensorInfo>} */
    const sensorInfos = {
      "Sensor Start": {
        found: false,
      },
      "Sensor Change": {
        found: false,
      },
    };

    const prevDate = {
      "Sensor Start": 0,
      "Sensor Change": 0,
    };

    sbx.data.sensorTreatments?.forEach((treatment) => {
      SensorAgePlugin.eventTypes.forEach((event) => {
        const treatmentDate = treatment.mills;
        if (
          treatment.eventType !== event ||
          treatmentDate <= prevDate[event] ||
          treatmentDate > sbx.time
        ) {
          return;
        }

        prevDate[event] = treatmentDate;

        const a = this.moment(sbx.time);
        const b = this.moment(treatmentDate);
        const days = a.diff(b, "days");
        const hours = a.diff(b, "hours") - days * 24;
        const age = a.diff(b, "hours");

        const eventValue = sensorInfos[event];
        if (
          !eventValue.found ||
          (age >= 0 && (!eventValue.age || age < eventValue.age))
        ) {
          const display = (age >= 24 ? `${days}d` : "") + `${hours}h`;

          const displayLong =
            (age >= 24 ? `${days} ${this.translate("days")} ` : "") +
            `${hours} ${this.translate("hours")}`;

          sensorInfos[event] = {
            found: true,
            treatmentDate,
            days,
            age,
            hours,
            notes: treatment.notes,
            minFractions: a.diff(b, "minutes") - age * 60,
            display,
            displayLong,
          };
        }
      });
    });

    if (
      sensorInfos["Sensor Change"].found &&
      sensorInfos["Sensor Start"].found &&
      sensorInfos["Sensor Change"].treatmentDate >=
        sensorInfos["Sensor Start"].treatmentDate
    ) {
      sensorInfos["Sensor Start"] = { found: false };
    }

    const min = this.minButValid(sensorInfos);
    const sensorInfo = sensorInfos[min];

    const notification = this.sensorInfoNotification(sbx, sensorInfo);
    const level = notification?.level ?? this.levels.NONE;

    if (min === "Sensor Change") {
      return {
        /** @type {"Sensor Change"} */
        min: "Sensor Change",
        "Sensor Start": sensorInfos["Sensor Start"],
        "Sensor Change": { ...sensorInfo, notification, level },
      };
    } else {
      return {
        /** @type {"Sensor Start"} */
        min: "Sensor Start",
        "Sensor Start": { ...sensorInfo, notification, level },
        "Sensor Change": sensorInfos["Sensor Change"],
      };
    }
  }

  /** @param {ClientInitializedSandbox} sbx */
  updateVisualisation(sbx) {
    const latest = sbx.properties.sage;
    if (!latest) return;
    const sensorInfo =
      latest.min === "Sensor Start"
        ? latest["Sensor Start"]
        : latest["Sensor Change"];

    /** @type {Record<"label" | "value", string>[]} */
    const info = [];

    SensorAgePlugin.eventTypes.forEach((event) => {
      if (!latest[event].found) return;

      const label = event === "Sensor Change" ? "Sensor Insert" : event;
      info.push({
        label: this.translate(label),
        value: new Date(latest[event].treatmentDate).toLocaleString(),
      });
      info.push({
        label: this.translate("Duration"),
        value: latest[event].displayLong,
      });
      if (!!latest[event].notes) {
        info.push({
          label: this.translate("Notes"),
          value: latest[event].notes,
        });
      }
      if (!!latest[event].transmitterId) {
        info.push({
          label: this.translate("Transmitter ID"),
          value: latest[event].transmitterId,
        });
      }
      if (!!latest[event].sensorCode) {
        info.push({
          label: this.translate("Sensor Code"),
          value: latest[event].sensorCode,
        });
      }
    });

    const statusClass =
      (sensorInfo.found &&
        ((sensorInfo.level === this.levels.URGENT && "urgent") ||
          (sensorInfo.level === this.levels.WARN && "warn"))) ||
      undefined;

    sbx.pluginBase.updatePillText(this, {
      value: sensorInfo.found ? sensorInfo.display : "",
      label: this.translate("SAGE"),
      info: info,
      pillClass: statusClass,
    });
  }
}

/** @param {PluginCtx} ctx */
module.exports = (ctx) => new SensorAgePlugin(ctx);
