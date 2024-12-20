"use strict";

/**
 * @param {import("./index")} client
 * @param {{scaleY?: string; high?: number; targetTop?: number; targetBottom?: number; low?: number}} [maybeOpts]
 */
function prepare(client, maybeOpts) {
  const opts = checkOptions(client, maybeOpts);

  if (opts.scaleY === "linear") {
    return prepareLinear(client);
  } else {
    return prepareLog(client, opts);
  }
}

/**
 * @param {import("./index")} client
 * @param {{scaleY?: string; high?: number; targetTop?: number; targetBottom?: number; low?: number}} [opts]
 */
function checkOptions(client, opts) {
  /** @param {number} n */
  const scale = (n) => Math.round(client.utils.scaleMgdl(n));
  return {
    /** @type {string})*/
    scaleY: opts?.scaleY || client.settings.scaleY,
    high: opts?.high || scale(client.settings.thresholds.bgHigh),
    targetTop: opts?.targetTop || scale(client.settings.thresholds.bgTargetTop),
    targetBottom:
      opts?.targetBottom || scale(client.settings.thresholds.bgTargetBottom),
    low: opts?.low || scale(client.settings.thresholds.bgLow),
  };
}

/**
 * @param {import("./index")} client
 * @param {{scaleY: string; high: number; targetTop: number; targetBottom: number; low: number}} opts
 */
function prepareLog(client, opts) {
  if (client.settings.units === "mmol") {
    return [
      2.0,
      Math.round(client.utils.scaleMgdl(client.settings.thresholds.bgLow)),
      opts.targetBottom,
      6.0,
      opts.targetTop,
      opts.high,
      22.0,
    ];
  } else {
    return [
      40,
      opts.low,
      opts.targetBottom,
      120,
      opts.targetTop,
      opts.high,
      400,
    ];
  }
}

/** @param {import("./index")} client  */
function prepareLinear(client) {
  if (client.settings.units === "mmol") {
    return [2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 14.0, 16.0, 18.0, 20.0, 22.0];
  } else {
    return [40, 80, 120, 160, 200, 240, 280, 320, 360, 400];
  }
}

module.exports = prepare;
