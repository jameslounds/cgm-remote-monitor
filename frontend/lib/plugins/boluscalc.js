"use strict";

// this is just a fake plugin to enable hiding from settings drawer

function init() {
  var boluscalc = {
    name: /** @type {const} */ ("boluscalc"),
    label: "Bolus Wizard",
    pluginType: "drawer",
  };

  return boluscalc;
}

module.exports = init;
