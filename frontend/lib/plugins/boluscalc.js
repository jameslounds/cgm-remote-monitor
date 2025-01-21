"use strict";

/** @typedef {import("../types").Plugin} Plugin */
/**
 * @implements {Plugin}
 * this is just a fake plugin to enable hiding from settings drawer
 */
class BolusCalcPlugin {
  name = /** @type {const} */ ("boluscalc");
  label = "Bolus Wizard";
  pluginType = "drawer";
}

module.exports = () => new BolusCalcPlugin();
