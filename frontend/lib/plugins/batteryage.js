"use strict";

var _ = require("lodash");

/** @typedef {ReturnType<BatteryAgePlugin["findLatestTimeChange"]>} BageProperties */

/** @typedef {import("../types").Plugin} Plugin */
/** @implements {Plugin} */
class BatteryAgePlugin {
  name = /** @type {const} */ ("bage");
  label = "Pump Battery Age";
  pluginType = "pill-minor";

  /** @param {import(".").PluginCtx} ctx */
  constructor(ctx) {
    this.moment = ctx.moment;
    this.translate = ctx.language.translate;
    this.levels = ctx.levels;
  }

  /** @param {ReturnType<import("../sandbox")>} sbx */
  getPrefs(sbx) {
    return {
      info: sbx.extendedSettings.info || 312,
      warn: sbx.extendedSettings.warn || 336,
      urgent: sbx.extendedSettings.urgent || 360,
      display: sbx.extendedSettings.display || "days",
      enableAlerts: sbx.extendedSettings.enableAlerts || false,
    };
  }

  /** @param {import("../sandbox").ClientInitializedSandbox} sbx */
  setProperties(sbx) {
    sbx.offerProperty("bage", () => this.findLatestTimeChange(sbx));
  }

  /** @param {import("../sandbox").InitializedSandbox} sbx */
  checkNotifications(sbx) {
    const batteryInfo = sbx.properties.bage;

    if (batteryInfo?.notification) {
      const notification = {
        ...batteryInfo.notification,
        plugin: this,
        debug: {
          age: batteryInfo.age,
        },
      };
      sbx.notifications.requestNotify(notification);
    }
  }

  /** @param {ReturnType<import("../sandbox")>} sbx */
  findLatestTimeChange(sbx) {
    const prefs = this.getPrefs(sbx);

    const batteryInfo = {
      found: false,
      age: 0,
      /** @type {number | null} */
      treatmentDate: null,
      checkForAlert: false,
      /** @type {number | undefined} */
      days: undefined,
      /** @type {number | undefined} */
      hours: undefined,
      /** @type {string | undefined} */
      notes: undefined,
      /** @type {number | undefined} */
      minFractions: undefined,
      /** @type {import("../types").Level} */
      level: this.levels.NONE,
      /** @type {import("../types").Notify | undefined} */
      notification: undefined,
      /** @type {string | undefined} */
      display: undefined,
    };

    let prevDate = 0;

    sbx.data.batteryTreatments?.forEach((treatment) => {
      const treatmentDate = treatment.mills;
      if (prevDate < treatmentDate && treatmentDate <= sbx.time) {
        prevDate = treatmentDate;
        batteryInfo.treatmentDate = treatmentDate;

        const a = this.moment(sbx.time);
        const b = this.moment(batteryInfo.treatmentDate);
        const days = a.diff(b, "days");
        const hours = a.diff(b, "hours") - days * 24;
        const age = a.diff(b, "hours");

        if (!batteryInfo.found || (age >= 0 && age < batteryInfo.age)) {
          batteryInfo.found = true;
          batteryInfo.age = age;
          batteryInfo.days = days;
          batteryInfo.hours = hours;
          batteryInfo.notes = treatment.notes;
          batteryInfo.minFractions = a.diff(b, "minutes") - age * 60;
        }
      }
    });

    let sound = "incoming";
    let message = "";
    let sendNotification = false;

    if (batteryInfo.age >= prefs.urgent) {
      sendNotification = batteryInfo.age === prefs.urgent;
      message = this.translate("Pump Battery change overdue!");
      sound = "persistent";
      batteryInfo.level = this.levels.URGENT;
    } else if (batteryInfo.age >= prefs.warn) {
      sendNotification = batteryInfo.age === prefs.warn;
      message = this.translate("Time to change pump battery");
      batteryInfo.level = this.levels.WARN;
    } else if (batteryInfo.age >= prefs.info) {
      sendNotification = batteryInfo.age === prefs.info;
      message = "Change pump battery soon";
      batteryInfo.level = this.levels.INFO;
    }

    if (prefs.display === "days" && batteryInfo.found) {
      batteryInfo.display = "";
      if (batteryInfo.age >= 24) {
        batteryInfo.display += batteryInfo.days + "d";
      }
      batteryInfo.display += batteryInfo.hours + "h";
    } else {
      batteryInfo.display = batteryInfo.found ? batteryInfo.age + "h" : "n/a ";
    }

    //allow for 20 minute period after a full hour during which we'll alert the user
    if (
      prefs.enableAlerts &&
      sendNotification &&
      (batteryInfo.minFractions ?? 0) <= 20
    ) {
      batteryInfo.notification = {
        title: this.translate("Pump battery age %1 hours", {
          params: [batteryInfo.age],
        }),
        message: message,
        pushoverSound: sound,
        level: batteryInfo.level,
        group: "BAGE",
      };
    }

    return batteryInfo;
  }

  /** @param {import("../sandbox").ClientInitializedSandbox} sbx */
  updateVisualisation(sbx) {
    const batteryInfo = sbx.properties.bage;
    if (!batteryInfo) return;

    const info = [
      {
        label: this.translate("Inserted"),
        value: new Date(batteryInfo.treatmentDate ?? NaN).toLocaleString(),
      },
    ];

    if (!_.isEmpty(batteryInfo.notes)) {
      info.push({
        label: this.translate("Notes") + ":",
        value: batteryInfo.notes ?? "",
      });
    }

    const statusClass =
      (batteryInfo.level === this.levels.URGENT && "urgent") ||
      (batteryInfo.level === this.levels.WARN && "warn") ||
      undefined;

    sbx.pluginBase.updatePillText(this, {
      value: batteryInfo.display,
      label: this.translate("BAGE"),
      info: info,
      pillClass: statusClass,
    });
  }
}

/** @param {import(".").PluginCtx} ctx */
module.exports = (ctx) => new BatteryAgePlugin(ctx);
