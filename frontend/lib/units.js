"use strict";

var consts = require("./constants");

/** @param {number} mgdl */
function mgdlToMMOL(mgdl) {
  return (Math.round((mgdl / consts.MMOL_TO_MGDL) * 10) / 10).toFixed(1);
}

/** @param {number} mmol */
function mmolToMgdl(mmol) {
  return Math.round(mmol * consts.MMOL_TO_MGDL);
}

function configure() {
  return {
    mgdlToMMOL: mgdlToMMOL,
    mmolToMgdl: mmolToMgdl,
  };
}

module.exports = configure;
