"use strict";
/** server only ? */
function init() {
  var runtime = {
    name: /** @type {const} */ ("runtimestate"),
    label: "Runtime state",
    pluginType: "fake",
  };

  runtime.setProperties = function setProperties(sbx) {
    sbx.offerProperty("runtimestate", function setProp() {
      return {
        state: sbx.runtimeState,
      };
    });
  };

  return runtime;
}

module.exports = init;
