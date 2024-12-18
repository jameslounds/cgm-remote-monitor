"use strict";

const times = require("../times");
const consts = require("../constants");

const DEVICE_TYPE_FIELDS =
  /** @type {(keyof import("../types").DeviceStatus)[]} */ ([
    "uploader",
    "pump",
    "openaps",
    "loop",
    "xdripjs",
  ]);

class DData {
  constructor() {
    /** @type {import("../types").Sgv[]} */
    this.sgvs = [];
    /** @type {import("../types").Treatment[]} */
    this.treatments = [];
    /** @type {import("../types").Mbg[]} */
    this.mbgs = [];
    /** @type {import("../types").Cal[]} */
    this.cals = [];
    /** @type {import("../types").Profile[]} */
    this.profiles = [];
    /** @type {import("../types").DeviceStatus[]} */
    this.devicestatus = [];
    /** @type {import("../types").Food[]} */
    this.food = [];
    /** @type {import("../types").Activity[]} */
    this.activity = [];
    /** @type {import("../types").DBStats[]} */
    this.dbstats = [];
    /** @type {number} */
    this.lastUpdated = 0;
  }

  /**
   * Convert Mongo ids to strings and ensure all objects have the mills property for
   * significantly faster processing than constant date parsing, plus simplified
   * logic
   * @template {Record<string, {_id?: string; mills?: number; created_at?: string | number; sysTime?: string | number}>} T
   * @param {T} data;
   */
  processRawDataForRuntime(data) {
    let obj = structuredClone(data);

    Object.keys(obj).forEach((key) => {
      if (typeof obj[key] === "object" && obj[key]) {
        if (obj[key]._id) {
          obj[key]._id = obj[key]._id.toString();
        }
        if (obj[key].created_at && !("mills" in obj[key])) {
          obj[key].mills = new Date(obj[key].created_at).getTime();
        }
        if (obj[key].sysTime && !("mills" in obj[key])) {
          obj[key].mills = new Date(obj[key].sysTime).getTime();
        }
      }
    });

    return obj;
  }

  /**
   * Merge two arrays based on _id string, preferring new objects when a collision is found
   * @template {{_id: string}} T
   * @param {T[]} oldData
   * @param {T[]} newData
   */
  idMergePreferNew(oldData, newData) {
    if (!newData && oldData) return oldData;
    if (!oldData && newData) return newData;

    const merged = structuredClone(newData);

    for (let i = 0; i < oldData.length; i++) {
      const oldElement = oldData[i];
      let found = false;
      for (let j = 0; j < newData.length; j++) {
        if (oldElement._id == newData[j]._id) {
          found = true;
          break;
        }
      }
      if (!found) merged.push(oldElement); // Merge old object in, if it wasn't found in the new data
    }

    return merged;
  }

  clone() {
    const cloned = new DData();

    /** @satisfies {(keyof DData)[]} */
    const propertiesToClone = [
      "activity",
      "batteryTreatments",
      "cals",
      "combobolusTreatments",
      "dbstats",
      "devicestatus",
      "food",
      "insulinchangeTreatments",
      "lastUpdated",
      "mbgs",
      "profileTreatments",
      "profiles",
      "sensorTreatments",
      "sgvs",
      "sitechangeTreatments",
      "tempTargetTreatments",
      "tempbasalTreatments",
      "treatments",
    ];

    propertiesToClone.forEach(
      /** @template {keyof DData} T @param {T} propertyName */
      (propertyName) => {
        cloned[propertyName] = structuredClone(this[propertyName]);
      }
    );

    return cloned;
  }

  dataWithRecentStatuses() {
    const profiles = structuredClone(this.profiles);
    if (profiles && profiles[0] && profiles[0].store) {
      const store = profiles[0].store;
      Object.keys(store).forEach((k) => {
        if (k.indexOf("@@@@@") > 0) {
          delete store[k];
        }
      });
    }

    return {
      devicestatus: this.recentDeviceStatus(Date.now()),
      sgvs: this.sgvs,
      cals: this.cals,
      profiles: profiles,
      mbgs: this.mbgs,
      food: this.food,
      treatments: this.treatments,
      dbstats: this.dbstats,
    };
  }

  /**
   * @param {number} time
   */
  recentDeviceStatus(time) {
    const deviceAndTypes = this.devicestatus
      .map((status) =>
        Object.keys(status)
          .filter((key) => DEVICE_TYPE_FIELDS.includes(key))
          .map((key) => ({
            device: status.device,
            type: key,
          }))
      )
      .flat()
      .filter(
        (value, index, self) =>
          index ===
          self.findIndex(
            (item) => item.device === value.device && item.type === value.type
          )
      );

    //console.info('>>>deviceAndTypes', deviceAndTypes);

    const recents = deviceAndTypes
      .map((deviceAndType) =>
        this.devicestatus
          .filter(
            (status) =>
              status.device === deviceAndType.device &&
              deviceAndType.type in status
          )
          .filter((status) => status.mills <= time)
          .sort((a, b) => a.mills - b.mills)
          .slice(-10)
      )
      .flat();

    const seenIds = new Set();
    const dedupedRecents = recents.filter((status) => {
      if (seenIds.has(status._id)) return false;
      seenIds.add(status._id);
      return true;
    });

    return dedupedRecents.sort((a, b) => a.mills - b.mills);
  }

  /**
   * @overload
   * @param {import("../types").Treatment[]} treatments
   * @param {true} keepzeroduration
   * @returns {import("../types").Treatment[]}
   */
  /**
   * @overload
   * @param {import("../types").Treatment[]} treatments
   * @param {false} [keepzeroduratiot]
   * @returns {(import("../types").Treatment & {duration: number})[]}
   */
  /**
   * @param {import("../types").Treatment[]} treatments
   * @param {boolean} [keepzeroduration]
   * @returns {(import("../types").Treatment)[] | (import("../types").Treatment & {duration: number})[]}
   */
  processDurations(treatments, keepzeroduration) {
    const seenMills = new Set();
    treatments = treatments.filter((t) => {
      if (seenMills.has(t.mills)) return false;
      seenMills.add(t.mills);
      return true;
    });

    // cut temp basals by end events
    // better to do it only on data update
    const endevents = treatments.filter(function filterEnd(t) {
      return !t.duration;
    });

    /**
     *
     * @param {import("../types").Treatment & {duration: number}} base
     * @param {import("../types").Treatment} end
     */
    function cutIfInInterval(base, end) {
      if (
        base.mills < end.mills &&
        base.mills + times.mins(base.duration).msecs > end.mills
      ) {
        base.duration = times.msecs(end.mills - base.mills).mins;
        if (end.profile) {
          base.cuttedby = end.profile;
          end.cutting = base.profile;
        }
      }
    }

    /**
     * @param {import("../types").Treatment} t
     * @returns {t is import("../types").Treatment & {duration: number}}
     */
    function hasDuration(t) {
      return !!t.duration && typeof t.duration === "number";
    }

    // cut by end events
    treatments.forEach(function allTreatments(t) {
      if (hasDuration(t)) {
        endevents.forEach(function allEndevents(e) {
          cutIfInInterval(t, e);
        });
      }
    });

    // cut by overlaping events
    treatments.forEach(function allTreatments(t) {
      if (hasDuration(t)) {
        treatments.forEach(function allEndevents(e) {
          cutIfInInterval(t, e);
        });
      }
    });

    if (keepzeroduration) {
      return treatments;
    } else {
      return treatments.filter(hasDuration);
    }
  }

  /** @param {boolean} [preserveOrignalTreatments] */
  processTreatments(preserveOrignalTreatments) {
    /** @param {string} searchString @param {{exact?: boolean}} [opts] */
    const sortAndFilterEventType = (searchString, opts = {}) => {
      return this.treatments
        .filter(
          (t) =>
            t.eventType &&
            (opts.exact
              ? t.eventType === searchString
              : t.eventType.includes(searchString))
        )
        .sort((a, b) => a.mills - b.mills);
    };

    this.sitechangeTreatments = sortAndFilterEventType("Site Change");
    this.insulinchangeTreatments = sortAndFilterEventType("Insulin Change");
    this.batteryTreatments = sortAndFilterEventType("Pump Battery Change");
    this.sensorTreatments = sortAndFilterEventType("Sensor");

    this.combobolusTreatments = sortAndFilterEventType("Combo Bolus", {
      exact: true,
    });

    let profileTreatments = sortAndFilterEventType("Profile Switch", {
      exact: true,
    });
    if (preserveOrignalTreatments) {
      profileTreatments = structuredClone(profileTreatments);
    }
    this.profileTreatments = this.processDurations(profileTreatments, true);

    let tempbasalTreatments = this.treatments.filter((t) => {
      return t.eventType && t.eventType.includes("Temp Basal");
    });
    if (preserveOrignalTreatments) {
      tempbasalTreatments = structuredClone(tempbasalTreatments);
    }
    this.tempbasalTreatments = this.processDurations(
      tempbasalTreatments,
      false
    );

    let tempTargetTreatments = this.treatments.filter((t) => {
      return t.eventType && t.eventType.includes("Temporary Target");
    });

    if (preserveOrignalTreatments) {
      tempTargetTreatments = structuredClone(tempTargetTreatments);
    }
    tempTargetTreatments = this.#convertTempTargetUnits(tempTargetTreatments);
    this.tempTargetTreatments = this.processDurations(
      tempTargetTreatments,
      false
    );
  }

  /** @param {(import("../types").Treatment | (import("../types").Treatment & {units: "mmol" | "mg/dl"; targetTop: number; targetBottom: number;}))[]} treatments */
  #convertTempTargetUnits(treatments) {
    return structuredClone(treatments).map((t) => {
      if ("units" in t && t.units === "mmol") {
        t.targetTop = t.targetTop * consts.MMOL_TO_MGDL;
        t.targetBottom = t.targetBottom * consts.MMOL_TO_MGDL;
        t.units = "mg/dl";
      } else if (
        ("targetTop" in t && t.targetTop < 20) ||
        ("targetBottom" in t && t.targetBottom < 20)
      ) {
        //if we have a temp target thats below 20, assume its mmol and convert to mgdl for safety.
        t.targetTop = t.targetTop * consts.MMOL_TO_MGDL;
        t.targetBottom = t.targetBottom * consts.MMOL_TO_MGDL;
        t.units = "mg/dl";
      }

      return t;
    });
  }
}

module.exports = () => new DData();
