"use strict";

/** @typedef {ReturnType<InsulinAgePlugin["findLatestTimeChange"]>} IAgeProperties */

/** @typedef {import("../types").Plugin} Plugin */
/** @implements {Plugin} */
class InsulinAgePlugin {
  name = /** @type {const} */ ("iage");
  label = "Insulin Age";
  pluginType = "pill-minor";

  /** @param {import(".").PluginCtx} ctx */
  constructor(ctx) {
    this.moment = ctx.moment;
    this.translate = ctx.language.translate;
    this.levels = ctx.levels;
  }

  /** @param {ReturnType<import("../sandbox")>} sbx */
  getPrefs(sbx) {
    // IAGE_INFO=44 IAGE_WARN=48 IAGE_URGENT=70
    return {
      info: sbx.extendedSettings.info || 44,
      warn: sbx.extendedSettings.warn || 48,
      urgent: sbx.extendedSettings.urgent || 72,
      enableAlerts: sbx.extendedSettings.enableAlerts || false,
    };
  }

  /** @param {import("../sandbox").ClientInitializedSandbox} sbx */
  setProperties(sbx) {
    sbx.offerProperty("iage", () => this.findLatestTimeChange(sbx));
  }

  /** @param {import("../sandbox").InitializedSandbox} sbx */
  checkNotifications(sbx) {
    const insulinInfo = sbx.properties.iage;

    if (insulinInfo?.notification) {
      const notification = {
        ...insulinInfo.notification,
        plugin: this,
        debug: {
          age: insulinInfo.age,
        },
      };
      sbx.notifications.requestNotify(notification);
    }
  }

  /** @param {ReturnType<import("../sandbox")>} sbx */
  findLatestTimeChange(sbx) {
    const prefs = this.getPrefs(sbx);

    const insulinInfo = {
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
      display: undefined
    };

    let prevDate = 0;

    sbx.data.insulinchangeTreatments?.forEach((treatment) => {
      const treatmentDate = treatment.mills;
      if (treatmentDate > prevDate && treatmentDate <= sbx.time) {
        prevDate = treatmentDate;
        insulinInfo.treatmentDate = treatmentDate;

        const a = this.moment(sbx.time);
        const b = this.moment(insulinInfo.treatmentDate);
        const days = a.diff(b, "days");
        const hours = a.diff(b, "hours") - days * 24;
        const age = a.diff(b, "hours");

        if (!insulinInfo.found || (age >= 0 && age < insulinInfo.age)) {
          insulinInfo.found = true;
          insulinInfo.age = age;
          insulinInfo.days = days;
          insulinInfo.hours = hours;
          insulinInfo.notes = treatment.notes;
          insulinInfo.minFractions = a.diff(b, "minutes") - age * 60;

          insulinInfo.display = "";
          if (insulinInfo.age >= 24) {
            insulinInfo.display += insulinInfo.days + "d";
          }
          insulinInfo.display += insulinInfo.hours + "h";
        }
      }
    });

    let sound = "incoming";
    let message = "";
    let sendNotification = false;

    if (insulinInfo.age >= prefs.urgent) {
      sendNotification = insulinInfo.age === prefs.urgent;
      message = this.translate("Insulin reservoir change overdue!");
      sound = "persistent";
      insulinInfo.level = this.levels.URGENT;
    } else if (insulinInfo.age >= prefs.warn) {
      sendNotification = insulinInfo.age === prefs.warn;
      message = this.translate("Time to change insulin reservoir");
      insulinInfo.level = this.levels.WARN;
    } else if (insulinInfo.age >= prefs.info) {
      sendNotification = insulinInfo.age === prefs.info;
      message = "Change insulin reservoir soon";
      insulinInfo.level = this.levels.INFO;
    }

    //allow for 20 minute period after a full hour during which we'll alert the user
    if (
      prefs.enableAlerts &&
      sendNotification &&
      (insulinInfo.minFractions ?? 0) <= 20
    ) {
      insulinInfo.notification = {
        title: this.translate("Insulin reservoir age %1 hours", {
          params: [insulinInfo.age.toString()],
        }),
        message: message,
        pushoverSound: sound,
        level: insulinInfo.level,
        group: "IAGE",
      };
    }

    return insulinInfo;
  }

  /** @param {import("../sandbox").ClientInitializedSandbox} sbx */
  updateVisualisation(sbx) {
    const insulinInfo = sbx.properties.iage;
    if (!insulinInfo) return;

    const info = [
      {
        label: this.translate("Inserted"),
        value: new Date(insulinInfo.treatmentDate ?? NaN).toLocaleString(),
      },
    ];

    if (insulinInfo.notes) {
      info.push({
        label: this.translate("Notes") + ":",
        value: insulinInfo.notes,
      });
    }

    const statusClass =
      (insulinInfo.level === this.levels.URGENT && "urgent") ||
      (insulinInfo.level === this.levels.WARN && "warn") ||
      undefined;

    sbx.pluginBase.updatePillText(this, {
      value: insulinInfo.display,
      label: this.translate("CAGE"),
      info: info,
      pillClass: statusClass,
    });
  }
}

/** @param {import(".").PluginCtx} ctx */
module.exports = (ctx) => new InsulinAgePlugin(ctx);