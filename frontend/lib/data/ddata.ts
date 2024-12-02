"use strict";

import _ from "lodash";
import times from "../times";
import consts from "../constants.json";

import type { components } from "../../types";

var DEVICE_TYPE_FIELDS = ["uploader", "pump", "openaps", "loop", "xdripjs"];

type SGV = {
  mills: number;
  date?: Date;
  mgdl: number;
  color?: string;
  type: string;
};
export type Treatment = components["schemas"]["Treatment"] & {
  duration?: number;
  mills: number;
  profile?: string;
  cuttedby?: string;
  cutting?: string;
  targetTop?: number;
  targetBottom?: number;
  eventType: string;
};

export interface DData extends Record<string, any> {
  sgvs: SGV[];
  treatments: Array<Treatment>;
  mbgs: any[];
  cals: any[];
  profiles: any[];
  devicestatus: Array<
    components["schemas"]["Devicestatus"] & {
      mills: number;
      mgdl: number;
    }
  >;
  food: any[];
  activity: any[];
  dbstats: Record<string, any>;
  lastUpdated: number;
  processRawDataForRuntime<T extends Record<string, any>>(data: T): T;
  idMergePreferNew<T extends { _id: string }>(old: T[], nwe: T[]): T[];
  clone(): DData;
  dataWithRecentStatuses(): Pick<
    DData,
    | "sgvs"
    | "cals"
    | "profiles"
    | "mbgs"
    | "food"
    | "treatments"
    | "dbstats"
    | "devicestatus"
  >;
  recentDeviceStatus(time: number): DData["devicestatus"];
  processDurations(
    treatments: Treatment[],
    keepzeroduration: boolean
  ): Treatment[];
  processTreatments(preserveOrignalTreatments: boolean): void;
  sitechangeTreatments: Treatment[];
  insulinchangeTreatments: Treatment[];
  batteryTreatments: Treatment[];
  sensorTreatments: Treatment[];
  profileTreatments: Treatment[];
  combobolusTreatments: Treatment[];
  tempbasalTreatments: Treatment[];
  tempTargetTreatments: Treatment[];
}

export default function init() {
  var ddata: DData = {
    sgvs: [],
    treatments: [],
    mbgs: [],
    cals: [],
    profiles: [],
    devicestatus: [],
    food: [],
    activity: [],
    dbstats: {},
    lastUpdated: 0,
  } as unknown as DData;

  /**
   * Convert Mongo ids to strings and ensure all objects have the mills property for
   * significantly faster processing than constant date parsing, plus simplified
   * logic
   */
  ddata.processRawDataForRuntime = <T extends Record<string, any>>(data: T) => {
    let obj = _.cloneDeep(data);

    Object.keys(obj).forEach((key) => {
      if (typeof obj[key] === "object" && obj[key]) {
        if (Object.prototype.hasOwnProperty.call(obj[key], "_id")) {
          obj[key]._id = obj[key]._id.toString();
        }
        if (
          Object.prototype.hasOwnProperty.call(obj[key], "created_at") &&
          !Object.prototype.hasOwnProperty.call(obj[key], "mills")
        ) {
          obj[key].mills = new Date(obj[key].created_at).getTime();
        }
        if (
          Object.prototype.hasOwnProperty.call(obj[key], "sysTime") &&
          !Object.prototype.hasOwnProperty.call(obj[key], "mills")
        ) {
          obj[key].mills = new Date(obj[key].sysTime).getTime();
        }
      }
    });

    return obj;
  };

  /**
   * Merge two arrays based on _id string, preferring new objects when a collision is found
   * @param {array} oldData
   * @param {array} newData
   */
  ddata.idMergePreferNew = <T extends { _id: string }>(
    oldData: Array<T>,
    newData: Array<T>
  ) => {
    if (!newData && oldData) return oldData;
    if (!oldData && newData) return newData;

    const merged = _.cloneDeep(newData);

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
  };

  // BUGIX before this passed a function as the second argument. This did nothing, so has been removed.
  ddata.clone = () => _.clone(ddata);

  ddata.dataWithRecentStatuses = function dataWithRecentStatuses() {
    var profiles = _.cloneDeep(ddata.profiles);
    if (profiles && profiles[0] && profiles[0].store) {
      Object.keys(profiles[0].store).forEach((k) => {
        if (k.indexOf("@@@@@") > 0) {
          delete profiles[0].store[k];
        }
      });
    }
    return {
      devicestatus: ddata.recentDeviceStatus(Date.now()),
      sgvs: ddata.sgvs,
      cals: ddata.cals,
      profiles: profiles,
      mbgs: ddata.mbgs,
      food: ddata.food,
      treatments: ddata.treatments,
      dbstats: ddata.dbstats,
    };
  };

  ddata.recentDeviceStatus = function recentDeviceStatus(time: number) {
    var deviceAndTypes = _.chain(ddata.devicestatus)
      .map(function eachStatus(status) {
        return _.chain(status)
          .keys()
          .filter(function isExcluded(key) {
            return _.includes(DEVICE_TYPE_FIELDS, key);
          })
          .map(function toDeviceTypeKey(key) {
            return {
              device: status.device,
              type: key,
            };
          })
          .value();
      })
      .flatten()
      .uniqWith(_.isEqual)
      .value();

    //console.info('>>>deviceAndTypes', deviceAndTypes);

    var rv = _.chain(deviceAndTypes)
      .map(function findMostRecent(deviceAndType) {
        return _.chain(ddata.devicestatus)
          .filter(function isSameDeviceType(status) {
            return (
              status.device === deviceAndType.device &&
              _.has(status, deviceAndType.type)
            );
          })
          .filter(function notInTheFuture(status) {
            return status.mills <= time;
          })
          .sortBy("mills")
          .takeRight(10)
          .value();
      })
      .value();

    var merged = ([] as DData["devicestatus"]).concat.apply([], rv);

    // BUGFIX this used to call `uniq("_id")` after `filter(_.isObject)`, but `uniq` does not take a string as an argument,
    // and will not make the objects in the list have unique ids
    return _.chain(merged).filter(_.isObject).sortBy("mills").value();
  };

  ddata.processDurations = function processDurations(
    treatments: DData["treatments"],
    keepzeroduration: boolean
  ) {
    treatments = _.uniqBy(treatments, "mills");

    // cut temp basals by end events
    // better to do it only on data update
    var endevents = treatments.filter(function filterEnd(t) {
      return !t.duration;
    });

    function cutIfInInterval(
      base: DData["treatments"][number] & { duration: number },
      end: DData["treatments"][number]
    ) {
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

    function hasDuration(
      t: DData["treatments"][number]
    ): t is DData["treatments"][number] & { duration: number } {
      return !!t.duration;
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
      return treatments.filter(function filterEnd(t) {
        return t.duration;
      });
    }
  };

  ddata.processTreatments = function processTreatments(
    preserveOrignalTreatments: boolean
  ) {
    // filter & prepare 'Site Change' events
    ddata.sitechangeTreatments = ddata.treatments
      .filter(function filterSensor(t) {
        return t.eventType.indexOf("Site Change") > -1;
      })
      .sort(function (a, b) {
        return a.mills - b.mills;
      });

    // filter & prepare 'Insulin Change' events
    ddata.insulinchangeTreatments = ddata.treatments
      .filter(function filterInsulin(t) {
        return t.eventType.indexOf("Insulin Change") > -1;
      })
      .sort(function (a, b) {
        return a.mills - b.mills;
      });

    // filter & prepare 'Pump Battery Change' events
    ddata.batteryTreatments = ddata.treatments
      .filter(function filterSensor(t) {
        return t.eventType.indexOf("Pump Battery Change") > -1;
      })
      .sort(function (a, b) {
        return a.mills - b.mills;
      });

    // filter & prepare 'Sensor' events
    ddata.sensorTreatments = ddata.treatments
      .filter(function filterSensor(t) {
        return t.eventType.indexOf("Sensor") > -1;
      })
      .sort(function (a, b) {
        return a.mills - b.mills;
      });

    // filter & prepare 'Profile Switch' events
    var profileTreatments = ddata.treatments
      .filter(function filterProfiles(t) {
        return t.eventType === "Profile Switch";
      })
      .sort(function (a, b) {
        return a.mills - b.mills;
      });
    if (preserveOrignalTreatments)
      profileTreatments = _.cloneDeep(profileTreatments);
    ddata.profileTreatments = ddata.processDurations(profileTreatments, true);

    // filter & prepare 'Combo Bolus' events
    ddata.combobolusTreatments = ddata.treatments
      .filter(function filterComboBoluses(t) {
        return t.eventType === "Combo Bolus";
      })
      .sort(function (a, b) {
        return a.mills - b.mills;
      });

    // filter & prepare temp basals
    var tempbasalTreatments = ddata.treatments.filter(function filterBasals(t) {
      return t.eventType && t.eventType.indexOf("Temp Basal") > -1;
    });
    if (preserveOrignalTreatments)
      tempbasalTreatments = _.cloneDeep(tempbasalTreatments);
    ddata.tempbasalTreatments = ddata.processDurations(
      tempbasalTreatments,
      false
    );

    // filter temp target
    var tempTargetTreatments = ddata.treatments.filter(
      function filterTargets(t) {
        return t.eventType && t.eventType.indexOf("Temporary Target") > -1;
      }
    );
    function convertTempTargetTreatmentUnites(_treatments: Treatment[]) {
      let treatments = _.cloneDeep(_treatments);

      for (let i = 0; i < treatments.length; i++) {
        let t = treatments[i];
        let converted = false;

        // if treatment is in mmol, convert to mg/dl
        if (
          Object.prototype.hasOwnProperty.call(t, "units") &&
          t.targetTop &&
          t.targetBottom
        ) {
          if (t.units == "mmol") {
            //convert to mgdl
            t.targetTop = t.targetTop * consts.MMOL_TO_MGDL;
            t.targetBottom = t.targetBottom * consts.MMOL_TO_MGDL;
            t.units = "mg/dl";
            converted = true;
          }
        }

        //if we have a temp target thats below 20, assume its mmol and convert to mgdl for safety.
        if (
          !converted &&
          !!t.targetTop &&
          !!t.targetBottom &&
          (t.targetTop < 20 || t.targetBottom < 20)
        ) {
          t.targetTop = t.targetTop * consts.MMOL_TO_MGDL;
          t.targetBottom = t.targetBottom * consts.MMOL_TO_MGDL;
          t.units = "mg/dl";
        }
      }
      return treatments;
    }

    if (preserveOrignalTreatments)
      tempTargetTreatments = _.cloneDeep(tempTargetTreatments);
    tempTargetTreatments =
      convertTempTargetTreatmentUnites(tempTargetTreatments);
    ddata.tempTargetTreatments = ddata.processDurations(
      tempTargetTreatments,
      false
    );
  };

  return ddata;
}
