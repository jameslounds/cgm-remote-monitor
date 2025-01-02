"use strict";

const TWO_DAYS = 172_800_000;

/**
 * @template {{mills: number}} DData
 * @param {boolean | undefined} isDelta
 * @param {DData[]} cachedDataArray
 * @param {DData[]} receivedDataArray
 * @param {number} [maxAge]
 */
function mergeDataUpdate(isDelta, cachedDataArray, receivedDataArray, maxAge) {
  /** @template {{mills: number}} DData @param {DData[]} oldArray @param {DData[]} newArray */
  function nsArrayDiff(oldArray, newArray) {
    /** @type {number[]} */
    const knownMills = [];

    oldArray.filter((d) => !!d).forEach((d) => knownMills.push(d.mills));

    const result = {
      /** @type {DData[]} */
      updates: [],
      /** @type {DData[]} */
      new: [],
    };

    newArray.forEach((item) => {
      const seen = knownMills.includes(item.mills);

      if (seen) result.updates.push(item);
      else result.new.push(item);
    });

    return result;
  }

  // If there was no delta data, just return the original data
  if (!receivedDataArray) return cachedDataArray || [];

  // If this is not a delta update, replace all data
  if (!isDelta) return receivedDataArray || [];

  // purge old data from cache before updating
  const mAge = !maxAge || isNaN(maxAge) ? TWO_DAYS : maxAge;
  const twoDaysAgo = new Date().getTime() - mAge;

  const recentCachedDataArray = cachedDataArray.filter(
    (e) => !!e && e.mills > twoDaysAgo
  );

  // If this is delta, calculate the difference, merge and sort
  const diff = nsArrayDiff(recentCachedDataArray, receivedDataArray);

  // if there's updated elements, replace those in place
  const mergedDataArray = recentCachedDataArray.map((e) => {
    const foundUpdate = diff.updates.find((u) => u.mills === e.mills);
    if (!!foundUpdate) return foundUpdate;
    return e;
  });
  return mergedDataArray.concat(diff.new).sort((a, b) => a.mills - b.mills);
}

/**
 * @template {{_id?: string; mills: number; action?: string;}} DData
 * @param {boolean | undefined} isDelta
 * @param {DData[]} cachedDataArray
 * @param {DData[]} receivedDataArray
 */
function mergeTreatmentUpdate(isDelta, cachedDataArray, receivedDataArray) {
  // If there was no delta data, just return the original data
  if (!receivedDataArray) return cachedDataArray || [];

  // If this is not a delta update, replace all data
  if (!isDelta) return receivedDataArray || [];

  receivedDataArray.forEach((no) => {
    if (!no.action) {
      cachedDataArray.push(no);
    } else {
      const index = cachedDataArray.findIndex(
        (cached) => cached._id === no._id
      );
      if (index !== -1) {
        if (no.action === "remove") {
          cachedDataArray.splice(index, 1);
        } else if (no.action === "update") {
          delete no.action;
          cachedDataArray.splice(index, 1, no);
        }
      }
    }
  });

  return cachedDataArray.sort((a, b) => {
    return a.mills - b.mills;
  });
}

/**
 * @typedef Received
 * @property {boolean} delta
 * @property {import("../types").Sgv[]} sgvs
 * @property {import("../types").Mbg[]} mbgs
 * @property {import("../types").Treatment[]} treatments
 * @property {import("../types").Food[]} food
 * @property {import("../types").Cal[]} cals
 * @property {import("../types").DeviceStatus[]} devicestatus
 * @property {import("../types").DBStats} dbstats
 * @property {import("../profilefunctions").Profile[]} profiles
 */
/**
 * @param {Received} received
 * @param {ReturnType<import("../data/ddata")>} ddata
 * @param {ReturnType<import("../settings")>} settings
 * @returns
 */
function receiveDData(received, ddata, settings) {
  if (!received) {
    return;
  }

  // Calculate the diff to existing data and replace as needed
  ddata.sgvs = mergeDataUpdate(received.delta, ddata.sgvs, received.sgvs);
  ddata.mbgs = mergeDataUpdate(received.delta, ddata.mbgs, received.mbgs);
  ddata.treatments = mergeTreatmentUpdate(
    received.delta,
    ddata.treatments,
    received.treatments
  );
  ddata.food = mergeTreatmentUpdate(received.delta, ddata.food, received.food);

  ddata.processTreatments(false);

  // Do some reporting on the console
  // console.log('Total SGV data size', ddata.sgvs.length);
  // console.log('Total treatment data size', ddata.treatments.length);

  if (received.cals) {
    ddata.cals = received.cals;
    ddata.cal = ddata.cals.at(-1);
  }

  if (received.devicestatus) {
    if (
      settings.extendedSettings.devicestatus &&
      settings.extendedSettings.devicestatus.advanced
    ) {
      //only use extra memory in advanced mode
      ddata.devicestatus = mergeDataUpdate(
        received.delta,
        ddata.devicestatus,
        received.devicestatus
      );
    } else {
      ddata.devicestatus = received.devicestatus;
    }
  }

  if (received.dbstats && received.dbstats.dataSize) {
    ddata.dbstats = received.dbstats;
  }
}

module.exports = receiveDData;
