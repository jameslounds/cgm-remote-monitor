"use strict";
/** Server only ? */

/** @import {Plugin} from "../types" */
/** @import {Sbx} from "../sandbox" */

/** @typedef {{ state: string | undefined }} RuntimeStateProperties */

/** @implements {Plugin} */
class RuntimeStatePlugin {
  name = /** @type {const} */ ("runtimestate");
  label = "Runtime state";
  pluginType = "fake";

  /** @param {Sbx} sbx */
  setProperties(sbx) {
    sbx.offerProperty("runtimestate", () => ({ state: sbx.runtimeState }));
  }
}

module.exports = () => new RuntimeStatePlugin();
