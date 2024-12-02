"use strict";

import consts from "./constants.json";

function mgdlToMMOL(mgdl: number) {
  return (Math.round((mgdl / consts.MMOL_TO_MGDL) * 10) / 10).toFixed(1);
}

function mmolToMgdl(mgdl: number) {
  return Math.round(mgdl * consts.MMOL_TO_MGDL);
}

function configure() {
  return {
    mgdlToMMOL: mgdlToMMOL,
    mmolToMgdl: mmolToMgdl,
  };
}

export default configure;
