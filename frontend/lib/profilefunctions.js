"use strict";

const { Cache } = require("memory-cache");
const times = require("./times");

/** @typedef {import("./types").Profile} Profile */
/** @typedef {Profile[]} ProfileData */

const cacheTTL = 5000;
/** @type {import("./types").Treatment | null} */
let prevBasalTreatment = null;

class ProfileFunctions {
  /**
   *
   * @param {ProfileData | null} profileData
   * @param {{moment: import("moment-timezone")}} ctx
   */
  constructor(profileData, ctx) {
    this.moment = ctx.moment;
    this.cache = new Cache();
    /** @type {null | Profile[]} */
    this.data = null;

    this.clear();

    if (profileData) {
      this.loadData(profileData);
    }
    // init treatments array
    this.updateTreatments([], []);
  }

  clear() {
    this.cache.clear();
    this.data = null;
    prevBasalTreatment = null;
  }

  /** @param {Profile[]} profileData */
  loadData(profileData) {
    if (profileData && profileData.length) {
      this.data = this.convertToProfileStore(profileData);
      this.data.forEach((record) => {
        if (record.store) {
          const store = record.store;
          Object.keys(record.store).forEach((k) =>
            this.preprocessProfileOnLoad(store[k])
          );
        }
        record.mills = (
          record.startDate ? new Date(record.startDate) : new Date()
        ).getTime();
      });
    }
  }

  /**
   * @param {Profile[]} dataArray
   * @returns {Profile[]}
   */
  convertToProfileStore(dataArray) {
    return dataArray.map((profile) => {
      if (!profile.defaultProfile) {
        const newObject = {
          defaultProfile: "Default",
          startDate: profile.startDate || "1980-01-01",
          _id: profile.id,
          convertedOnTheFly: true,
          store: {
            Default: {
              startDate: undefined,
              _id: undefined,
              created_at: undefined,
              ...profile,
            },
          },
        };
        console.log("Profile not updated yet. Converted profile:", newObject);
        return newObject;
      } else {
        return { convertedOnTheFly: undefined, ...profile };
      }
    });
  }

  /** @param {string} time */
  timeStringToSeconds(time) {
    const [hours, mins] = time.split(":");
    return parseInt(hours) * 3600 + parseInt(mins) * 60;
  }

  /**
   * Preprocess the timestamps to seconds for a couple orders of magnitude faster operation
   * @param {Record<string, Profile | Profile[]> | Profile[] | Omit<Profile, "store">} container
   */
  preprocessProfileOnLoad(container) {
    const values = Array.isArray(container)
      ? container
      : Object.values(container);
    values.forEach((value) => {
      if (!value) return;

      if (Array.isArray(value)) return this.preprocessProfileOnLoad(value);

      if (typeof value === "object" && value.time) {
        const seconds = this.timeStringToSeconds(value.time);
        if (!isNaN(seconds)) {
          value.timeAsSeconds = seconds;
        }
      }
    });
  }

  /**
   * @param {number | undefined} time
   * @param {string} valueType
   * @param {string} spec_profile
   */
  getValueByTime(time, valueType, spec_profile) {
    if (!time) time = Date.now();

    // round to the minute for better caching
    const minuteTime = Math.round(time / 60_000) * 60_000;
    const cacheKey = minuteTime + valueType + spec_profile;
    const cachedValue = this.cache.get(cacheKey);

    if (cachedValue) return cachedValue;

    // CircadianPercentageProfile support
    const activeTreatment = this.activeProfileTreatmentToTime(time);
    const isCcpProfile =
      !spec_profile &&
      activeTreatment &&
      activeTreatment.CircadianPercentageProfile;
    const timeshift = isCcpProfile ? activeTreatment.percentage : 0;
    const percentage = isCcpProfile ? activeTreatment.timeshift : 100;

    const offset = timeshift % 24;
    time = time + offset * times.hours(offset).msecs;

    const valueContainer = this.getCurrentProfile(time, spec_profile)[
      valueType
    ];

    // Assumes the timestamps are in UTC
    // Use local time zone if profile doesn't contain a time zone
    // This WILL break on the server; added warnings elsewhere that this is missing
    // TODO: Better warnings to user for missing configuration

    const t = this.getTimezone(spec_profile)
      ? this.moment(minuteTime).tz(this.getTimezone(spec_profile))
      : this.moment(minuteTime);

    // Convert to seconds from midnight
    const mmtMidnight = t.clone().startOf("day");
    const timeAsSecondsFromMidnight = t.clone().diff(mmtMidnight, "seconds");

    // If the container is an Array, assume it's a valid timestamped value container

    let returnValue = valueContainer;

    if (Array.isArray(valueContainer)) {
      valueContainer.forEach((value) => {
        if (timeAsSecondsFromMidnight >= value.timeAsSeconds) {
          returnValue = value.value;
        }
      });
    }

    if (returnValue) {
      returnValue = parseFloat(returnValue);
      if (isCcpProfile) {
        switch (valueType) {
          case "sens":
          case "carbratio":
            returnValue = (returnValue * 100) / percentage;
            break;
          case "basal":
            returnValue = (returnValue * percentage) / 100;
            break;
        }
      }
    }

    this.cache.put(cacheKey, returnValue, cacheTTL);

    return returnValue;
  }

  /**
   *
   * @param {number | undefined | null} time
   * @param {string} spec_profile
   * @returns
   */
  getCurrentProfile(time, spec_profile) {
    time = time || Date.now();
    const minuteTime = Math.round(time / 60000) * 60000;
    const cacheKey = "profile" + minuteTime + spec_profile;
    const cachedProfile = this.cache.get(cacheKey);

    if (cachedProfile) return cachedProfile;

    const pdataActive = this.profileFromTime(time);
    const data = this.hasData() ? pdataActive : null;
    const timeprofile = this.activeProfileToTime(time);
    const currProfile =
      data && data.store && data.store[timeprofile]
        ? data.store[timeprofile]
        : {};

    this.cache.put(cacheKey, currProfile, cacheTTL);
    return currProfile;
  }

  /** @param {string} spec_profile */
  getUnits(spec_profile) {
    var pu = this.getCurrentProfile(null, spec_profile)["units"] + " ";
    if (pu.toLowerCase().includes("mmol")) return "mmol";
    return "mg/dl";
  }

  /** @param {string} spec_profile */
  getTimezone(spec_profile) {
    const rVal = this.getCurrentProfile(null, spec_profile)["timezone"];
    // Work around Loop uploading non-ISO compliant time zone string
    if (rVal) rVal.replace("ETC", "Etc");
    return rVal;
  }

  /** @returns {this is typeof this & {data: import("./types").Profile[]}} */
  hasData() {
    return !!this.data;
  }

  /** @param {string} valueType */
  #makeValueTypeGetter(valueType) {
    /**
     * @param {string | number} time
     * @param {string} spec_profile
     */
    return (time, spec_profile) => {
      return this.getValueByTime(Number(time), valueType, spec_profile);
    };
  }

  getDIA = this.#makeValueTypeGetter("dia");
  getSensitivity = this.#makeValueTypeGetter("sens");
  getCarbRatio = this.#makeValueTypeGetter("carbratio");
  getCarbAbsorptionRate = this.#makeValueTypeGetter("carbs_hr");
  getLowBGTarget = this.#makeValueTypeGetter("target_low");
  getHighBGTarget = this.#makeValueTypeGetter("target_high");
  getBasal = this.#makeValueTypeGetter("basal");

  /**
   *
   * @param {import("./types").Treatment[]} [profiletreatments]
   * @param {import("./types").Treatment[]} [tempbasaltreatments]
   * @param {import("./types").Treatment[]} [combobolustreatments]
   */
  updateTreatments(
    profiletreatments,
    tempbasaltreatments,
    combobolustreatments
  ) {
    this.profiletreatments = profiletreatments || [];
    this.combobolustreatments = combobolustreatments || [];

    const seenTempBasalMills = new Set();
    this.tempbasaltreatments = (tempbasaltreatments || [])
      .filter(({ mills }) => {
        // dedupe temp basal events
        const seen = seenTempBasalMills.has(mills);
        seenTempBasalMills.add(seen);
        return seen;
      })
      .map((t) => ({
        ...t,
        endmills: t.mills + times.mins(t.duration || 0).msecs,
      }))
      .sort((a, b) => a.mills - b.mills);

    this.cache.clear();
  }

  /** @param {number | string} [time] */
  activeProfileToTime(time) {
    if (this.hasData()) {
      time = Number(time) || new Date().getTime();

      const pdataActive = this.profileFromTime(time);
      const timeprofile = pdataActive?.defaultProfile;
      const treatment = this.activeProfileTreatmentToTime(time);

      if (
        treatment &&
        pdataActive?.store &&
        pdataActive.store[treatment.profile]
      ) {
        return treatment.profile;
      }
      return timeprofile;
    }
    return null;
  }

  /** @param {number} time */
  activeProfileTreatmentToTime(time) {
    const minuteTime = Math.round(time / 60000) * 60000;
    const cacheKey = "profileCache" + minuteTime;
    const cachedValue = this.cache.get(cacheKey);

    if (cachedValue) return cachedValue;

    let treatment = null;
    if (this.hasData()) {
      const pdataActive = this.profileFromTime(time);
      if (!pdataActive || !pdataActive.mills || !pdataActive.store) return;
      (this.profiletreatments || []).forEach((t) => {
        if (time >= t.mills && t.mills >= (pdataActive.mills || 0)) {
          const duration = times.mins(t.duration || 0).msecs;
          if (duration != 0 && time < t.mills + duration) {
            treatment = t;
            // if profile switch contains json of profile inject it in to store to be findable by profile name
            if (
              treatment.profileJson &&
              pdataActive.store &&
              !pdataActive.store[treatment.profile]
            ) {
              if (treatment.profile.indexOf("@@@@@") < 0)
                treatment.profile += "@@@@@" + treatment.mills;
              const json = JSON.parse(treatment.profileJson);
              pdataActive.store[treatment.profile] = json;
            }
          }
          if (duration == 0) {
            treatment = t;
            // if profile switch contains json of profile inject it in to store to be findable by profile name
            if (
              treatment.profileJson &&
              pdataActive.store &&
              !pdataActive.store[treatment.profile]
            ) {
              if (treatment.profile.indexOf("@@@@@") < 0)
                treatment.profile += "@@@@@" + treatment.mills;
              const json = JSON.parse(treatment.profileJson);
              pdataActive.store[treatment.profile] = json;
            }
          }
        }
      });
    }

    this.cache.put(cacheKey, treatment, cacheTTL);
    return treatment;
  }

  /** @param {string} name */
  profileSwitchName(name) {
    var index = name.indexOf("@@@@@");
    if (index < 0) return name;
    else return name.substring(0, index);
  }

  /** @param {number | string} time */
  profileFromTime(time) {
    if (!this.hasData()) {
      return null;
    }

    return (
      this.data.find(({ mills }) => Number(time) >= Number(mills)) ||
      this.data[0]
    );
  }
  /** @param {number} time */
  tempBasalTreatment(time) {
    // Most queries for the data in reporting will match the latest found value, caching that hugely improves performance
    if (
      prevBasalTreatment &&
      time >= prevBasalTreatment.mills &&
      time <= prevBasalTreatment.endmills
    ) {
      return prevBasalTreatment;
    }

    if (!this.tempbasaltreatments) return null;

    // Binary search for events for O(log n) performance
    let first = 0;
    let last = this.tempbasaltreatments.length - 1;

    while (first <= last) {
      const i = first + Math.floor((last - first) / 2);
      const t = this.tempbasaltreatments[i];
      if (time >= t.mills && time <= t.endmills) {
        prevBasalTreatment = t;
        return t;
      }
      if (time < t.mills) {
        last = i - 1;
      } else {
        first = i + 1;
      }
    }

    return null;
  }

  /** @param {number} time */
  comboBolusTreatment(time) {
    return (this.combobolustreatments ?? []).find((t) => {
      const duration = times.mins(t.duration || 0).msecs;
      return time < t.mills + duration && time > t.mills;
    });
  }

  /**
   *
   * @param {number} time
   * @param {string} spec_profile
   * @returns
   */
  getTempBasal(time, spec_profile) {
    const minuteTime = Math.round(time / 60000) * 60000;
    const cacheKey = "basalCache" + minuteTime + spec_profile;
    const cachedValue = this.cache.get(cacheKey);

    if (cachedValue) return cachedValue;

    const basal = this.getBasal(time, spec_profile);
    const treatment = this.tempBasalTreatment(time);
    const combobolustreatment = this.comboBolusTreatment(time);
    const combobolusbasal = combobolustreatment?.relative ?? 0;

    //special handling for absolute to support temp to 0
    let tempbasal = basal;
    if (
      treatment &&
      treatment.absolute &&
      !isNaN(treatment.absolute) &&
      treatment.duration &&
      treatment.duration > 0
    ) {
      tempbasal = Number(treatment.absolute);
    } else if (treatment && treatment.percent) {
      tempbasal = (basal * (100 + treatment.percent)) / 100;
    }

    const returnValue = {
      basal,
      treatment,
      combobolustreatment,
      combobolusbasal,
      tempbasal,
      totalbasal: tempbasal + combobolusbasal,
    };

    this.cache.put(cacheKey, returnValue, cacheTTL);
    return returnValue;
  }

  listBasalProfiles() {
    const profiles = [];
    if (this.hasData()) {
      const current = this.activeProfileToTime();
      profiles.push(current);
      if (!this.data || !this.data[0] || !this.data[0].store) return;
      Object.keys(this.data[0].store).forEach((key) => {
        if (key !== current && key.indexOf("@@@@@") < 0) profiles.push(key);
      });
    }
    return profiles;
  }
}

// function init(profileData, ctx) {
//   var moment = ctx.moment;

//   var cache = new c.Cache();
//   var profile = {};

//   profile.clear = function clear() {
//     cache.clear();
//     profile.data = null;
//     prevBasalTreatment = null;
//   };

//   profile.clear();

//   profile.loadData = function loadData(profileData) {
//     if (profileData && profileData.length) {
//       profile.data = profile.convertToProfileStore(profileData);
//       _.each(profile.data, function eachProfileRecord(record) {
//         _.each(record.store, profile.preprocessProfileOnLoad);
//         record.mills = new Date(record.startDate).getTime();
//       });
//     }
//   };

//   profile.convertToProfileStore = function convertToProfileStore(dataArray) {
//     var convertedProfiles = [];
//     _.each(dataArray, function (profile) {
//       if (!profile.defaultProfile) {
//         var newObject = {};
//         newObject.defaultProfile = "Default";
//         newObject.store = {};
//         newObject.startDate = profile.startDate
//           ? profile.startDate
//           : "1980-01-01";
//         newObject._id = profile._id;
//         newObject.convertedOnTheFly = true;
//         delete profile.startDate;
//         delete profile._id;
//         delete profile.created_at;
//         newObject.store["Default"] = profile;
//         convertedProfiles.push(newObject);
//         console.log("Profile not updated yet. Converted profile:", newObject);
//       } else {
//         delete profile.convertedOnTheFly;
//         convertedProfiles.push(profile);
//       }
//     });
//     return convertedProfiles;
//   };

//   profile.timeStringToSeconds = function timeStringToSeconds(time) {
//     var split = time.split(":");
//     return parseInt(split[0]) * 3600 + parseInt(split[1]) * 60;
//   };

//   // preprocess the timestamps to seconds for a couple orders of magnitude faster operation
//   profile.preprocessProfileOnLoad = function preprocessProfileOnLoad(
//     container
//   ) {
//     _.each(container, function eachValue(value) {
//       if (value === null) return;

//       if (Object.prototype.toString.call(value) === "[object Array]") {
//         profile.preprocessProfileOnLoad(value);
//       }

//       if (value.time) {
//         var sec = profile.timeStringToSeconds(value.time);
//         if (!isNaN(sec)) {
//           value.timeAsSeconds = sec;
//         }
//       }
//     });
//   };

//   profile.getValueByTime = function getValueByTime(
//     time,
//     valueType,
//     spec_profile
//   ) {
//     if (!time) {
//       time = Date.now();
//     }

//     //round to the minute for better caching
//     var minuteTime = Math.round(time / 60000) * 60000;
//     var cacheKey = minuteTime + valueType + spec_profile;
//     var returnValue = cache.get(cacheKey);

//     if (returnValue) {
//       return returnValue;
//     }

//     // CircadianPercentageProfile support
//     var timeshift = 0;
//     var percentage = 100;
//     var activeTreatment = profile.activeProfileTreatmentToTime(time);
//     var isCcpProfile =
//       !spec_profile &&
//       activeTreatment &&
//       activeTreatment.CircadianPercentageProfile;
//     if (isCcpProfile) {
//       percentage = activeTreatment.percentage;
//       timeshift = activeTreatment.timeshift; // in hours
//     }
//     var offset = timeshift % 24;
//     time = time + offset * times.hours(offset).msecs;

//     var valueContainer = profile.getCurrentProfile(time, spec_profile)[
//       valueType
//     ];

//     // Assumes the timestamps are in UTC
//     // Use local time zone if profile doesn't contain a time zone
//     // This WILL break on the server; added warnings elsewhere that this is missing
//     // TODO: Better warnings to user for missing configuration

//     var t = profile.getTimezone(spec_profile)
//       ? moment(minuteTime).tz(profile.getTimezone(spec_profile))
//       : moment(minuteTime);

//     // Convert to seconds from midnight
//     var mmtMidnight = t.clone().startOf("day");
//     var timeAsSecondsFromMidnight = t.clone().diff(mmtMidnight, "seconds");

//     // If the container is an Array, assume it's a valid timestamped value container

//     returnValue = valueContainer;

//     if (Object.prototype.toString.call(valueContainer) === "[object Array]") {
//       _.each(valueContainer, function eachValue(value) {
//         if (timeAsSecondsFromMidnight >= value.timeAsSeconds) {
//           returnValue = value.value;
//         }
//       });
//     }

//     if (returnValue) {
//       returnValue = parseFloat(returnValue);
//       if (isCcpProfile) {
//         switch (valueType) {
//           case "sens":
//           case "carbratio":
//             returnValue = (returnValue * 100) / percentage;
//             break;
//           case "basal":
//             returnValue = (returnValue * percentage) / 100;
//             break;
//         }
//       }
//     }

//     cache.put(cacheKey, returnValue, cacheTTL);

//     return returnValue;
//   };

//   profile.getCurrentProfile = function getCurrentProfile(time, spec_profile) {
//     time = time || Date.now();
//     var minuteTime = Math.round(time / 60000) * 60000;
//     var cacheKey = "profile" + minuteTime + spec_profile;
//     var returnValue = cache.get(cacheKey);

//     if (returnValue) {
//       return returnValue;
//     }

//     var pdataActive = profile.profileFromTime(time);
//     var data = profile.hasData() ? pdataActive : null;
//     var timeprofile = profile.activeProfileToTime(time);
//     returnValue =
//       data && data.store[timeprofile] ? data.store[timeprofile] : {};

//     cache.put(cacheKey, returnValue, cacheTTL);
//     return returnValue;
//   };

//   profile.getUnits = function getUnits(spec_profile) {
//     var pu = profile.getCurrentProfile(null, spec_profile)["units"] + " ";
//     if (pu.toLowerCase().includes("mmol")) return "mmol";
//     return "mg/dl";
//   };

//   profile.getTimezone = function getTimezone(spec_profile) {
//     let rVal = profile.getCurrentProfile(null, spec_profile)["timezone"];
//     // Work around Loop uploading non-ISO compliant time zone string
//     if (rVal) rVal.replace("ETC", "Etc");
//     return rVal;
//   };

//   profile.hasData = function hasData() {
//     return profile.data ? true : false;
//   };

//   profile.getDIA = function getDIA(time, spec_profile) {
//     return profile.getValueByTime(Number(time), "dia", spec_profile);
//   };

//   profile.getSensitivity = function getSensitivity(time, spec_profile) {
//     return profile.getValueByTime(Number(time), "sens", spec_profile);
//   };

//   profile.getCarbRatio = function getCarbRatio(time, spec_profile) {
//     return profile.getValueByTime(Number(time), "carbratio", spec_profile);
//   };

//   profile.getCarbAbsorptionRate = function getCarbAbsorptionRate(
//     time,
//     spec_profile
//   ) {
//     return profile.getValueByTime(Number(time), "carbs_hr", spec_profile);
//   };

//   profile.getLowBGTarget = function getLowBGTarget(time, spec_profile) {
//     return profile.getValueByTime(Number(time), "target_low", spec_profile);
//   };

//   profile.getHighBGTarget = function getHighBGTarget(time, spec_profile) {
//     return profile.getValueByTime(Number(time), "target_high", spec_profile);
//   };

//   profile.getBasal = function getBasal(time, spec_profile) {
//     return profile.getValueByTime(Number(time), "basal", spec_profile);
//   };

//   profile.updateTreatments = function updateTreatments(
//     profiletreatments,
//     tempbasaltreatments,
//     combobolustreatments
//   ) {
//     profile.profiletreatments = profiletreatments || [];
//     profile.tempbasaltreatments = tempbasaltreatments || [];

//     // dedupe temp basal events
//     profile.tempbasaltreatments = _.uniqBy(
//       profile.tempbasaltreatments,
//       "mills"
//     );

//     _.each(profile.tempbasaltreatments, function addDuration(t) {
//       t.endmills = t.mills + times.mins(t.duration || 0).msecs;
//     });

//     profile.tempbasaltreatments.sort(function compareTreatmentMills(a, b) {
//       return a.mills - b.mills;
//     });

//     profile.combobolustreatments = combobolustreatments || [];

//     cache.clear();
//   };

//   profile.activeProfileToTime = function activeProfileToTime(time) {
//     if (profile.hasData()) {
//       time = Number(time) || new Date().getTime();

//       var pdataActive = profile.profileFromTime(time);
//       var timeprofile = pdataActive.defaultProfile;
//       var treatment = profile.activeProfileTreatmentToTime(time);

//       if (
//         treatment &&
//         pdataActive.store &&
//         pdataActive.store[treatment.profile]
//       ) {
//         timeprofile = treatment.profile;
//       }
//       return timeprofile;
//     }
//     return null;
//   };

//   profile.activeProfileTreatmentToTime = function activeProfileTreatmentToTime(
//     time
//   ) {
//     var minuteTime = Math.round(time / 60000) * 60000;
//     var cacheKey = "profileCache" + minuteTime;
//     var returnValue = cache.get(cacheKey);

//     if (returnValue) {
//       return returnValue;
//     }

//     var treatment = null;
//     if (profile.hasData()) {
//       var pdataActive = profile.profileFromTime(time);
//       profile.profiletreatments.forEach(function eachTreatment(t) {
//         if (time >= t.mills && t.mills >= pdataActive.mills) {
//           var duration = times.mins(t.duration || 0).msecs;
//           if (duration != 0 && time < t.mills + duration) {
//             treatment = t;
//             // if profile switch contains json of profile inject it in to store to be findable by profile name
//             if (
//               treatment.profileJson &&
//               !pdataActive.store[treatment.profile]
//             ) {
//               if (treatment.profile.indexOf("@@@@@") < 0)
//                 treatment.profile += "@@@@@" + treatment.mills;
//               let json = JSON.parse(treatment.profileJson);
//               pdataActive.store[treatment.profile] = json;
//             }
//           }
//           if (duration == 0) {
//             treatment = t;
//             // if profile switch contains json of profile inject it in to store to be findable by profile name
//             if (
//               treatment.profileJson &&
//               !pdataActive.store[treatment.profile]
//             ) {
//               if (treatment.profile.indexOf("@@@@@") < 0)
//                 treatment.profile += "@@@@@" + treatment.mills;
//               let json = JSON.parse(treatment.profileJson);
//               pdataActive.store[treatment.profile] = json;
//             }
//           }
//         }
//       });
//     }

//     returnValue = treatment;
//     cache.put(cacheKey, returnValue, cacheTTL);
//     return returnValue;
//   };

//   profile.profileSwitchName = function profileSwitchName(name) {
//     var index = name.indexOf("@@@@@");
//     if (index < 0) return name;
//     else return name.substring(0, index);
//   };

//   profile.profileFromTime = function profileFromTime(time) {
//     var profileData = null;

//     if (profile.hasData()) {
//       profileData = profile.data[0];
//       for (var i = 0; i < profile.data.length; i++) {
//         if (Number(time) >= Number(profile.data[i].mills)) {
//           profileData = profile.data[i];
//           break;
//         }
//       }
//     }

//     return profileData;
//   };

//   profile.tempBasalTreatment = function tempBasalTreatment(time) {
//     // Most queries for the data in reporting will match the latest found value, caching that hugely improves performance
//     if (
//       prevBasalTreatment &&
//       time >= prevBasalTreatment.mills &&
//       time <= prevBasalTreatment.endmills
//     ) {
//       return prevBasalTreatment;
//     }

//     // Binary search for events for O(log n) performance
//     var first = 0,
//       last = profile.tempbasaltreatments.length - 1;

//     while (first <= last) {
//       var i = first + Math.floor((last - first) / 2);
//       var t = profile.tempbasaltreatments[i];
//       if (time >= t.mills && time <= t.endmills) {
//         prevBasalTreatment = t;
//         return t;
//       }
//       if (time < t.mills) {
//         last = i - 1;
//       } else {
//         first = i + 1;
//       }
//     }

//     return null;
//   };

//   profile.comboBolusTreatment = function comboBolusTreatment(time) {
//     var treatment = null;
//     profile.combobolustreatments.forEach(function eachTreatment(t) {
//       var duration = times.mins(t.duration || 0).msecs;
//       if (time < t.mills + duration && time > t.mills) {
//         treatment = t;
//       }
//     });
//     return treatment;
//   };

//   profile.getTempBasal = function getTempBasal(time, spec_profile) {
//     var minuteTime = Math.round(time / 60000) * 60000;
//     var cacheKey = "basalCache" + minuteTime + spec_profile;
//     var returnValue = cache.get(cacheKey);

//     if (returnValue) {
//       return returnValue;
//     }

//     var basal = profile.getBasal(time, spec_profile);
//     var tempbasal = basal;
//     var combobolusbasal = 0;
//     var treatment = profile.tempBasalTreatment(time);
//     var combobolustreatment = profile.comboBolusTreatment(time);

//     //special handling for absolute to support temp to 0
//     if (treatment && !isNaN(treatment.absolute) && treatment.duration > 0) {
//       tempbasal = Number(treatment.absolute);
//     } else if (treatment && treatment.percent) {
//       tempbasal = (basal * (100 + treatment.percent)) / 100;
//     }
//     if (combobolustreatment && combobolustreatment.relative) {
//       combobolusbasal = combobolustreatment.relative;
//     }
//     returnValue = {
//       basal: basal,
//       treatment: treatment,
//       combobolustreatment: combobolustreatment,
//       tempbasal: tempbasal,
//       combobolusbasal: combobolusbasal,
//       totalbasal: tempbasal + combobolusbasal,
//     };
//     cache.put(cacheKey, returnValue, cacheTTL);
//     return returnValue;
//   };

//   profile.listBasalProfiles = function listBasalProfiles() {
//     var profiles = [];
//     if (profile.hasData()) {
//       var current = profile.activeProfileToTime();
//       profiles.push(current);

//       Object.keys(profile.data[0].store).forEach((key) => {
//         if (key !== current && key.indexOf("@@@@@") < 0) profiles.push(key);
//       });
//     }
//     return profiles;
//   };

//   if (profileData) {
//     profile.loadData(profileData);
//   }
//   // init treatments array
//   profile.updateTreatments([], []);

//   return profile;
// }

/** @param {ConstructorParameters<typeof ProfileFunctions>} args */
module.exports = (...args) => new ProfileFunctions(...args);
