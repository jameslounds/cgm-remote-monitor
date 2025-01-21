"use strict";

/** @typedef {ReturnType<CannulaAgePlugin["findLatestTimeChange"]>} CAgeProperties */

/** @typedef {import("../types").Plugin} Plugin */
/** @implements {Plugin} */
class CannulaAgePlugin {
  name = /** @type {const} */ ("cage");
  label = "Cannula Age";
  pluginType = "pill-minor";

  /** @param {import(".").PluginCtx} ctx */
  constructor(ctx) {
    this.moment = ctx.moment;
    this.translate = ctx.language.translate;
    this.levels = ctx.levels;
  }

  /** @param {ReturnType<import("../sandbox")>} sbx */
  getPrefs(sbx) {
    // CAGE_INFO = 44 CAGE_WARN=48 CAGE_URGENT=70
    return {
      info: sbx.extendedSettings.info || 44,
      warn: sbx.extendedSettings.warn || 48,
      urgent: sbx.extendedSettings.urgent || 72,
      display: sbx.extendedSettings.display
        ? sbx.extendedSettings.display
        : "hours",
      enableAlerts: sbx.extendedSettings.enableAlerts || false,
    };
  }

  /** @param {import("../sandbox").ClientInitializedSandbox} sbx */
  setProperties(sbx) {
    sbx.offerProperty("cage", () => this.findLatestTimeChange(sbx));
  }

  /** @param {import("../sandbox").InitializedSandbox} sbx */
  checkNotifications(sbx) {
    const cannulaInfo = sbx.properties.cage;

    if (cannulaInfo?.notification) {
      const notification = {
        ...cannulaInfo.notification,
        plugin: this,
        debug: {
          age: cannulaInfo.age,
        },
      };
      sbx.notifications.requestNotify(notification);
    }
  }

  /** @param {ReturnType<import("../sandbox")>} sbx */
  findLatestTimeChange(sbx) {
    const prefs = this.getPrefs(sbx);

    const cannulaInfo = {
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

    sbx.data.sitechangeTreatments?.forEach((treatment) => {
      const treatmentDate = treatment.mills;
      if (treatmentDate > prevDate && treatmentDate <= sbx.time) {
        prevDate = treatmentDate;
        cannulaInfo.treatmentDate = treatmentDate;

        const a = this.moment(sbx.time);
        const b = this.moment(cannulaInfo.treatmentDate);
        const days = a.diff(b, "days");
        const hours = a.diff(b, "hours") - days * 24;
        const age = a.diff(b, "hours");

        if (!cannulaInfo.found || (age >= 0 && age < cannulaInfo.age)) {
          cannulaInfo.found = true;
          cannulaInfo.age = age;
          cannulaInfo.days = days;
          cannulaInfo.hours = hours;
          cannulaInfo.notes = treatment.notes;
          cannulaInfo.minFractions = a.diff(b, "minutes") - age * 60;
        }
      }
    });

    let sound = "incoming";
    let message = "";
    let sendNotification = false;

    if (cannulaInfo.age >= prefs.urgent) {
      sendNotification = cannulaInfo.age === prefs.urgent;
      message = this.translate("Cannula change overdue!");
      sound = "persistent";
      cannulaInfo.level = this.levels.URGENT;
    } else if (cannulaInfo.age >= prefs.warn) {
      sendNotification = cannulaInfo.age === prefs.warn;
      message = this.translate("Time to change cannula");
      cannulaInfo.level = this.levels.WARN;
    } else if (cannulaInfo.age >= prefs.info) {
      sendNotification = cannulaInfo.age === prefs.info;
      message = "Change cannula soon";
      cannulaInfo.level = this.levels.INFO;
    }

    if (prefs.display === "days" && cannulaInfo.found) {
      cannulaInfo.display = "";
      if (cannulaInfo.age >= 24) {
        cannulaInfo.display += cannulaInfo.days + "d";
      }
      cannulaInfo.display += cannulaInfo.hours + "h";
    } else {
      cannulaInfo.display = cannulaInfo.found ? cannulaInfo.age + "h" : "n/a ";
    }

    //allow for 20 minute period after a full hour during which we'll alert the user
    if (
      prefs.enableAlerts &&
      sendNotification &&
      (cannulaInfo.minFractions ?? 0) <= 20
    ) {
      cannulaInfo.notification = {
        title: this.translate("Cannula age %1 hours", {
          params: [cannulaInfo.age.toString()],
        }),
        message: message,
        pushoverSound: sound,
        level: cannulaInfo.level,
        group: "CAGE",
      };
    }

    return cannulaInfo;
  }

  /** @param {import("../sandbox").ClientInitializedSandbox} sbx */
  updateVisualisation(sbx) {
    const cannulaInfo = sbx.properties.cage;
    if (!cannulaInfo) return;

    const info = [
      {
        label: this.translate("Inserted"),
        value: new Date(cannulaInfo.treatmentDate ?? NaN).toLocaleString(),
      },
    ];

    if (cannulaInfo.notes) {
      info.push({
        label: this.translate("Notes") + ":",
        value: cannulaInfo.notes ?? "",
      });
    }

    const statusClass =
      (cannulaInfo.level === this.levels.URGENT && "urgent") ||
      (cannulaInfo.level === this.levels.WARN && "warn") ||
      undefined;

    sbx.pluginBase.updatePillText(this, {
      value: cannulaInfo.display,
      label: this.translate("CAGE"),
      info: info,
      pillClass: statusClass,
    });
  }
}

/** @param {import(".").PluginCtx} ctx */
module.exports = (ctx) => new CannulaAgePlugin(ctx);
