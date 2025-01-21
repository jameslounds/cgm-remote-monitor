"use strict";

/** @typedef {import("../types").Plugin} Plugin */
/** @implements {Plugin} */
class BolusPlugin {
  name= /** @type {const} */ ("bolus")
  label= "Bolus"
  pluginType= "fake"

  /** @param {ReturnType<import("../sandbox")>} sbx */
  getPrefs(sbx) {
    return {
      renderFormat: sbx.extendedSettings.renderFormat
        ? sbx.extendedSettings.renderFormat
        : "default",
      renderOver: sbx.extendedSettings.renderOver
        ? sbx.extendedSettings.renderOver
        : 0,
      notifyOver: sbx.extendedSettings.notifyOver
        ? sbx.extendedSettings.notifyOver
        : 0,
    };
  }
}

module.exports = () => new BolusPlugin();
