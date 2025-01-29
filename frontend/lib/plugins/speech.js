"use strict";

/** @import {Notify, Plugin} from "../types" */
/** @import {PluginCtx} from "." */
/** @import {ClientInitializedSandbox} from "../sandbox" */

/** @implements {Plugin} */
class SpeechPlugin {
  name = /** @type {const} */ ("speech");
  label = "Speech";
  pluginType = "pill-status";
  pillFlip = true;

  /** @param {PluginCtx} ctx */
  constructor(ctx) {
    this.translate = ctx.language.translate;
    this.speechLangCode = ctx.language.speechCode;
  }

  /** @param {string} sayIt */
  say(sayIt) {
    console.log("saying", sayIt, "using lang code", this.speechLangCode);

    const msg = new SpeechSynthesisUtterance(sayIt);
    if (this.speechLangCode) msg.lang = this.speechLangCode;

    window.speechSynthesis.speak(msg);
  }

  /**
   * @param {ClientInitializedSandbox} _sbx
   * @param {Notify} _alarm
   * @param {any} alarmMessage
   */
  visualizeAlarm(_sbx, _alarm, alarmMessage) {
    console.log("Speech got an Alarm Message:", alarmMessage);
    this.say(alarmMessage);
  }

  /** )@type {number} */
  lastEntryTime = NaN;
  /** )@type {number} */
  lastEntryValue = NaN;
  /** )@type {number} */
  lastMinutes = NaN;

  /** @param {ClientInitializedSandbox} sbx */
  updateVisualisation(sbx) {
    if (sbx.data.inRetroMode) return;

    const timeNow = sbx.time;
    const entry = sbx.lastSGVEntry();

    if (timeNow && entry?.mills) {
      const timeSince = timeNow - entry.mills;
      const timeMinutes = Math.round(timeSince / 60000);

      if (this.lastEntryTime !== entry.mills) {
        const lE = sbx.scaleMgdl(this.lastEntryValue);
        const cE = sbx.scaleMgdl(entry.mgdl);

        const delta =
          (cE - lE) % 1 === 0 ? cE - lE : Math.round((cE - lE) * 10) / 10;

        this.lastEntryValue = entry.mgdl;
        this.lastEntryTime = entry.mills;

        let sayIt = sbx
          .roundBGToDisplayFormat(sbx.scaleMgdl(entry.mgdl))
          .toString();

        if (!isNaN(delta)) {
          sayIt += ", " + this.translate("change") + " " + delta;
        }

        const iobString =
          sbx.properties.iob &&
          sbx.roundInsulinForDisplayFormat(Number(sbx.properties.iob.display));
        if (iobString) {
          sayIt += ", IOB " + iobString;
        }

        this.say(sayIt);
      } else {
        if (
          timeMinutes > 5 &&
          timeMinutes !== this.lastMinutes &&
          timeMinutes % 5 === 0
        ) {
          this.lastMinutes = timeMinutes;

          const lastEntryString = this.translate("Last entry {0} minutes ago");
          const sayIt = lastEntryString.replace("{0}", timeMinutes.toString());
          this.say(sayIt);
        }
      }
    }
  }
}

/** @param {PluginCtx} ctx */
module.exports = (ctx) => new SpeechPlugin(ctx);
