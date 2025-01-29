"use strict";

/** Server only? */

/** @import {Mbg, Plugin, Treatment} from "../types" */
/** @import {PluginCtx} from "." */
/** @import {InitializedSandbox, Sbx} from "../sandbox" */

const times = require("../times");
const crypto = require("crypto");

const MANUAL_TREATMENTS = [
  "BG Check",
  "Meal Bolus",
  "Carb Correction",
  "Correction Bolus",
];

/** @implements {Plugin} */
class TreatmentNotifyPlugin {
  name = /** @type {const} */ ("treatmentnotify");
  label = "Treatment Notifications";
  pluginType = "notification";

  /** @param {PluginCtx} ctx */
  constructor(ctx) {
    this.simplealarms = require("./simplealarms")(ctx);
    this.translate = ctx.language.translate;
  }

  /**
   * Filter out automated treatments from OpenAPS and Loop - we shouldn't
   * trigger notifications or snooze alarms for these
   *
   * @param {Sbx} sbx
   * @protected
   */
  filterTreatments(sbx) {
    const includeBolusesOver = sbx.extendedSettings.includeBolusesOver || 0;

    return sbx.data.treatments.filter((treatment) => {
      const enteredBy = treatment.enteredBy;
      if (
        (enteredBy?.startsWith("openaps://") ||
          enteredBy?.startsWith("loop://")) &&
        !MANUAL_TREATMENTS.includes(treatment.eventType)
      )
        return false;

      if (
        typeof treatment.insulin === "number" &&
        ["Meal Bolus", "Correction Bolus"].includes(treatment.eventType) &&
        treatment.insulin < includeBolusesOver
      )
        return false;

      return true;
    });
  }

  /** @param {InitializedSandbox} sbx */
  checkNotifications(sbx) {
    const treatments = this.filterTreatments(sbx);
    const lastMBG = sbx.lastEntry(sbx.data.mbgs);
    const lastTreatment = sbx.lastEntry(treatments);

    const mbgCurrent = isCurrent(lastMBG);
    const treatmentCurrent = isCurrent(lastTreatment);

    if (mbgCurrent || treatmentCurrent) {
      const mbgMessage = mbgCurrent
        ? `${this.translate("Meter BG")} ${sbx.scaleEntry(lastMBG)} ${sbx.unitsLabel}`
        : "";
      const treatmentMessage = treatmentCurrent
        ? `${this.translate("Treatment")}: ${lastTreatment.eventType}`
        : "";

      this.autoSnoozeAlarms(mbgMessage, treatmentMessage, lastTreatment, sbx);

      //and add some info notifications
      //the notification providers (push, websockets, etc) are responsible to not sending the same notifications repeatedly
      if (mbgCurrent) {
        this.requestMBGNotify(lastMBG, sbx);
      }
      if (treatmentCurrent) {
        this.requestTreatmentNotify(lastTreatment, sbx);
      }
    }
  }

  /**
   * @param {string} mbgMessage
   * @param {string} treatmentMessage
   * @param {Treatment | undefined} lastTreatment
   * @param {InitializedSandbox} sbx
   * @protected
   */
  autoSnoozeAlarms(mbgMessage, treatmentMessage, lastTreatment, sbx) {
    //announcements don't snooze alarms
    if (!lastTreatment || lastTreatment.isAnnouncement) return;

    const snoozeLength = times.mins(
      sbx.extendedSettings.snoozeMins || 10
    ).msecs;

    sbx.notifications.requestSnooze({
      level: sbx.levels.URGENT,
      title: "Snoozing alarms since there was a recent treatment",
      message: [mbgMessage, treatmentMessage].join("\n").trim(),
      lengthMills: snoozeLength,
    });
  }

  /**
   * @param {Mbg} lastMBG
   * @param {InitializedSandbox} sbx
   * @protected
   */
  requestMBGNotify(lastMBG, sbx) {
    console.info("requestMBGNotify for", lastMBG);

    sbx.notifications.requestNotify({
      level: sbx.levels.INFO,
      title: "Calibration", //assume all MGBs are calibrations for now
      message: `${this.translate("Meter BG")}: ${sbx.scaleEntry(lastMBG)} ${sbx.unitsLabel}`,
      plugin: this,
      pushoverSound: "magic",
    });
  }

  /**
   * @param {Treatment} lastTreatment
   * @param {InitializedSandbox} sbx
   * @protected
   */
  requestAnnouncementNotify(lastTreatment, sbx) {
    const result = this.simplealarms.compareBGToTresholds(
      sbx.scaleMgdl(lastTreatment.mgdl),
      sbx
    );

    sbx.notifications.requestNotify({
      level: result.level,
      title:
        result.level === sbx.levels.URGENT
          ? `${sbx.levels.toDisplay(sbx.levels.URGENT)} ${lastTreatment.eventType}`
          : lastTreatment.eventType,
      message: lastTreatment.notes || ".", //some message is required
      plugin: this,
      group: "Announcement",
      pushoverSound: sbx.levels.isAlarm(result.level)
        ? result.pushoverSound
        : undefined,
      isAnnouncement: true,
    });
  }

  /**
   * @param {Treatment} lastTreatment
   * @param {InitializedSandbox} sbx
   * @protected
   */
  requestTreatmentNotify(lastTreatment, sbx) {
    if (lastTreatment.isAnnouncement) {
      this.requestAnnouncementNotify(lastTreatment, sbx);
      return;
    }

    let message = this.buildTreatmentMessage(lastTreatment, sbx) ?? "...";

    let eventType = lastTreatment.eventType;
    if (lastTreatment.duration === 0 && eventType === "Temporary Target") {
      eventType += " Cancel";
      message = this.translate("Canceled");
    }

    const { timestamp, carbs, insulin } = lastTreatment;

    if (!eventType && carbs && insulin) eventType = "Meal Bolus";
    else if (carbs) eventType = "Carb Correction";
    else if (insulin) eventType = "Correction Bolus";
    else eventType = "Note";

    const hash = crypto.createHash("sha1");
    const info = JSON.stringify({ eventType, timestamp });
    hash.update(info);
    const notifyhash = hash.digest("hex");

    sbx.notifications.requestNotify({
      level: sbx.levels.INFO,
      title: this.translate(eventType),
      message,
      timestamp,
      plugin: this,
      notifyhash,
    });
  }

  /**
   * @param {Treatment} lastTreatment
   * @param {InitializedSandbox} sbx
   * @protected
   */
  buildTreatmentMessage(lastTreatment, sbx) {
    const translate = this.translate;

    return [
      lastTreatment.glucose &&
        `${translate("BG")}: ${lastTreatment.glucose} (${lastTreatment.glucoseType})`,

      lastTreatment.reason && `${translate("Reason")}: ${lastTreatment.reason}`,

      lastTreatment.targetTop &&
        `${translate("Target Top")}: ${lastTreatment.targetTop}`,

      lastTreatment.targetBottom &&
        `${translate("Target Bottom")}: ${lastTreatment.targetBottom}`,

      lastTreatment.carbs && `${translate("Carbs")}: ${lastTreatment.carbs}g`,

      lastTreatment.insulin &&
        `${translate("Insulin")}: ${sbx.roundInsulinForDisplayFormat(lastTreatment.insulin)}U`,

      lastTreatment.duration &&
        `${translate("Duration")}: ${lastTreatment.duration} min`,

      lastTreatment.percent &&
        `${translate("Percent")}: ${lastTreatment.percent > 0 ? "+" : ""}${lastTreatment.percent}%`,

      !isNaN(lastTreatment.absolute) &&
        `${translate("Value")}: ${lastTreatment.absolute}U`,

      lastTreatment.enteredBy &&
        `${translate("Entered By")}: ${lastTreatment.enteredBy}`,

      lastTreatment.notes && `${translate("Notes")}: ${lastTreatment.notes}`,
    ]
      .filter((el) => el !== undefined && el !== 0)
      .join("\n");
  }
}

/**
 * @template {{ mills: number }} T
 * @param {T | undefined} last
 * @returns {last is T & {}}
 */
function isCurrent(last) {
  if (!last) {
    return false;
  }

  const now = Date.now();
  if (now < last.mills) return false;

  const ago = now - last.mills;
  return ago < times.mins(10).msecs;
}

/** @param {PluginCtx} ctx */
module.exports = (ctx) => new TreatmentNotifyPlugin(ctx);
