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
          basal: /** @type {number} */ (/** @type {unknown} */ (undefined)),
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
   * @param {keyof Omit<Profile, "store">} valueType
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
      ? this.moment(minuteTime).tz(this.getTimezone(spec_profile) ?? "")
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
      returnValue = parseFloat(returnValue?.toString());
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
   * @returns {Omit<Profile, "store">}
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
        : /** @type {Omit<Profile, "store">} */ ({});

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

  /** @template {keyof Omit<Profile, "store">} T @param {T} valueType */
  #makeValueTypeGetter(valueType) {
    /**
     * @param {string | number} time
     * @param {string} spec_profile
     * @returns {Profile[T]}
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
   * @returns {(
   *  Record<"basal" | "combobolusbasal" | "tempbasal" | "totalbasal", number>
   * & Record<"treatment" | "combobolustreatment", import("./types").Treatment | undefined>)}
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
      treatment: treatment ?? undefined,
      combobolustreatment,
      combobolusbasal,
      tempbasal,
      totalbasal: tempbasal + combobolusbasal,
    };

    this.cache.put(cacheKey, returnValue, cacheTTL);
    return returnValue;
  }

  listBasalProfiles() {
    /** @type {string[]} */
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

/** @param {ConstructorParameters<typeof ProfileFunctions>} args */
module.exports = (...args) => new ProfileFunctions(...args);
