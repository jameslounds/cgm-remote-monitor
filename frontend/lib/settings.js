"use strict";

const _ = require("lodash");
const constants = require("./constants");

class Settings {
  /** @satisfies {(keyof Settings)[]} */
  static secureSettings = [
    "apnsKey",
    "apnsKeyId",
    "developerTeamId",
    "userName",
    "password",
    "obscured",
    "obscureDeviceProvenance",
  ];

  static valueMappers = {
    nightMode: Settings.mapTruthy,
    alarmUrgentHigh: Settings.mapTruthy,
    alarmUrgentHighMins: Settings.mapNumberArray,
    alarmHigh: Settings.mapTruthy,
    alarmHighMins: Settings.mapNumberArray,
    alarmLow: Settings.mapTruthy,
    alarmLowMins: Settings.mapNumberArray,
    alarmUrgentLow: Settings.mapTruthy,
    alarmUrgentLowMins: Settings.mapNumberArray,
    alarmUrgentMins: Settings.mapNumberArray,
    alarmTimeagoWarn: Settings.mapTruthy,
    alarmTimeagoUrgent: Settings.mapTruthy,
    alarmWarnMins: Settings.mapNumberArray,
    timeFormat: Settings.mapNumber,
    insecureUseHttp: Settings.mapTruthy,
    secureHstsHeader: Settings.mapTruthy,
    secureCsp: Settings.mapTruthy,
    deNormalizeDates: Settings.mapTruthy,
    showClockDelta: Settings.mapTruthy,
    showClockLastTime: Settings.mapTruthy,
    bgHigh: Settings.mapNumber,
    bgLow: Settings.mapNumber,
    bgTargetTop: Settings.mapNumber,
    bgTargetBottom: Settings.mapNumber,
    authFailDelay: Settings.mapNumber,
    adminNotifiesEnabled: Settings.mapTruthy,
    authenticationPromptOnLoad: Settings.mapTruthy,
  };

  static DEFAULT_FEATURES = [
    "bgnow",
    "delta",
    "direction",
    "timeago",
    "devicestatus",
    "upbat",
    "errorcodes",
    "profile",
    "bolus",
    "dbsize",
    "runtimestate",
    "basal",
    "careportal",
  ];

  constructor() {
    // some code which uses the static members of this class predates this being a class
    // so these bits of code expect the static members as instance members
    this.DEFAULT_FEATURES = Settings.DEFAULT_FEATURES;

    /** @type {Record<string, any>} */
    this.extendedSettings = {};
    /** @type {"mg/dl" | "mmol"} */
    this.units = "mg/dl";
    /** @type {12 | 24} */
    this.timeFormat = 12;
    /** @type {number} */
    this.dayStart = 7.0;
    /** @type {number} */
    this.dayEnd = 21.0;
    /** @type {boolean} */
    this.nightMode = false;
    /** @type {boolean} */
    this.editMode = true;
    // TODO: narrow
    /** @type {"never" | string} */
    this.showRawbg = "never";
    /** @type {string} */
    this.customTitle = "Nightscout";
    /** @type {string} */
    this.theme = "default";
    /** @type {boolean} */
    this.alarmUrgentHigh = true;
    /** @type {number[]} */
    this.alarmUrgentHighMins = [30, 60, 90, 120];
    /** @type {boolean} */
    this.alarmHigh = true;
    /** @type {number[]} */
    this.alarmHighMins = [30, 60, 90, 120];
    /** @type {boolean} */
    this.alarmLow = true;
    /** @type {number[]} */
    this.alarmLowMins = [15, 30, 45, 60];
    /** @type {boolean} */
    this.alarmUrgentLow = true;
    /** @type {number[]} */
    this.alarmUrgentLowMins = [15, 30, 45];
    /** @type {number[]} */
    this.alarmUrgentMins = [30, 60, 90, 120];
    /** @type {number[]} */
    this.alarmWarnMins = [30, 60, 90, 120];
    /** @type {boolean} */
    this.alarmTimeagoWarn = true;
    /** @type {number} */
    this.alarmTimeagoWarnMins = 15;
    /** @type {boolean} */
    this.alarmTimeagoUrgent = true;
    /** @type {number} */
    this.alarmTimeagoUrgentMins = 30;
    /** @type {boolean} */
    this.alarmPumpBatteryLow = false;
    /** @type { "bg" | "cs" | "de" | "en" | "es" | "fi" | "fr" | "he" | "it" | "pl" | "pt" | "ro" | "ru"} */
    this.language = "en";
    /** @type {string} */
    this.scaleY = "log";
    /** @type {string} */
    this.showPlugins = "dbsize";
    /** @type {string} */
    this.showForecast = "ar2";
    /** @type {number} */
    this.focusHours = 3;
    /** @type {number} */
    this.heartbeat = 60;
    /** @type {string} */
    this.baseURL = "";
    /** @type {string} */
    this.authDefaultRoles = "readable";
    /**
     * @type {Record<
     *   "bgHigh" | "bgTargetTop" | "bgTargetBottom" | "bgLow",
     *   number
     * >}
     */
    this.thresholds = {
      bgHigh: 260,
      bgTargetTop: 180,
      bgTargetBottom: 80,
      bgLow: 55,
    };
    /** @type {boolean} */
    this.insecureUseHttp = false;
    /** @type {boolean} */
    this.secureHstsHeader = true;
    /** @type {boolean} */
    this.secureHstsHeaderIncludeSubdomains = false;
    /** @type {boolean} */
    this.secureHstsHeaderPreload = false;
    /** @type {boolean} */
    this.secureCsp = false;
    /** @type {boolean} */
    this.deNormalizeDates = false;
    /** @type {boolean} */
    this.showClockDelta = false;
    /** @type {boolean} */
    this.showClockLastTime = false;
    /** @type {string} */
    this.frameUrl1 = "";
    /** @type {string} */
    this.frameUrl2 = "";
    /** @type {string} */
    this.frameUrl3 = "";
    /** @type {string} */
    this.frameUrl4 = "";
    /** @type {string} */
    this.frameUrl5 = "";
    /** @type {string} */
    this.frameUrl6 = "";
    /** @type {string} */
    this.frameUrl7 = "";
    /** @type {string} */
    this.frameUrl8 = "";
    /** @type {string} */
    this.frameName1 = "";
    /** @type {string} */
    this.frameName2 = "";
    /** @type {string} */
    this.frameName3 = "";
    /** @type {string} */
    this.frameName4 = "";
    /** @type {string} */
    this.frameName5 = "";
    /** @type {string} */
    this.frameName6 = "";
    /** @type {string} */
    this.frameName7 = "";
    /** @type {string} */
    this.frameName8 = "";
    /** @type {number} */
    this.authFailDelay = 5000;
    /** @type {boolean} */
    this.adminNotifiesEnabled = true;
    /** @type {string | string[]} */
    this.obscured = "";
    /** @type {string} */
    this.obscureDeviceProvenance = "";
    /** @type {boolean} */
    this.authenticationPromptOnLoad = false;
    /** @type {string | undefined} */
    this.apnsKey = undefined;
    /** @type {string | undefined} */
    this.apnsKeyId = undefined;
    /** @type {string | undefined} */
    this.developerTeamId = undefined;
    /** @type {string | undefined} */
    this.userName = undefined;
    /** @type {string | undefined} */
    this.password = undefined;
    /** @type {string[]} */
    this.enable = [];
    /** @type {string[]} */
    this.disable = [];
    /** @type {string[]} the Names of properties we've mapped with `valueMappers` */
    this.wasSet = [];
    /** @type {string | undefined} */
    this.pushoverApiToken = undefined;
    /** @type {boolean | undefined} */
    this.testMode = undefined;
  }

  /**
   * @template {Record<string, any>} T
   * @template {keyof T} TKey
   * @param {T} obj
   * @param {TKey[]} secureKeys
   * @returns {import("./types").RemoveKeys<T, TKey>}
   */
  static filterObj(obj, secureKeys) {
    if (!obj || typeof obj !== "object") return obj;
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([key]) => secureKeys.includes(/** @type {TKey} */ (key)))
        .map(([key, value]) => {
          if (typeof value === "object") {
            return [
              key,
              Settings.filterObj(
                value,
                /** @type {(keyof value)[]} */ (secureKeys)
              ),
            ];
          }
          return [key, value];
        })
    );
  }

  /** @param {Settings} settings */
  filteredSettings(settings) {
    /** @type {Settings} */
    const cloned = Object.assign(
      Object.create(Object.getPrototypeOf(settings)),
      settings
    );
    if (cloned.obscured) {
      const enable = new Set(cloned.enable);
      const obscured = new Set(cloned.obscured);
      const difference = enable.difference(obscured);
      cloned.enable = [...difference];
    }
    return Settings.filterObj(cloned, Settings.secureSettings);
  }

  /** @param {string | boolean} value */
  static mapTruthy(value) {
    if (
      typeof value === "string" &&
      (value.toLowerCase() === "on" || value.toLowerCase() === "true")
    ) {
      value = true;
    }
    if (
      typeof value === "string" &&
      (value.toLowerCase() === "off" || value.toLowerCase() === "false")
    ) {
      value = false;
    }
    return /** @type {boolean} */ (value);
  }

  /** @param {number[] | string} value */
  static mapNumberArray(value) {
    if (!value || Array.isArray(value)) {
      return /** @type {number[]} */ (value);
    }

    if (isNaN(value)) {
      const rawValues = (value && value.split(" ")) || [];
      return rawValues.map((num) => (isNaN(num) ? null : Number(num)));
    } else {
      return [Number(value)];
    }
  }

  /** @param {string | number} value */
  static mapNumber(value) {
    if (!value) {
      return value;
    }

    if (typeof value === "string" && isNaN(value)) {
      const decommaed = value.replace(",", ".");
      if (!isNaN(decommaed)) {
        value = decommaed;
      }
    }

    if (isNaN(value)) {
      return value;
    } else {
      return Number(value);
    }
  }

  /**
   * @param {unknown} value @returns {value is any[] | string | number | boolean
   *   | Symbol | bigint | undefined}
   */
  #isSimple(value) {
    return (
      Array.isArray(value) ||
      (typeof value !== "function" && typeof value !== "object")
    );
  }

  /**
   * @typedef {"snoozeFirstMinsForAlarmEvent"
   *   | "snoozeMinsForAlarmEvent"
   *   | "eachSetting"
   *   | "eachSettingAsEnv"
   *   | "filteredSettings"
   *   | "isAlarmEventEnabled"
   *   | "isEnabled"} MethodNames
   */

  /**
   * @typedef {Exclude<keyof Settings, MethodNames>
   *   | keyof Settings["thresholds"]} AccessorArg
   */
  /** @typedef {(k: AccessorArg) => any} Accessor */
  /** @typedef {(k: string) => any} EnvAccessor */

  /** @param {Accessor} accessor */
  eachSetting(accessor) {
    const valueMappers = Settings.valueMappers;

    /**
     * @param {Accessor} accessor @param {Partial<Record<AccessorArg, any>>}
     *   keys
     */
    const mapKeys = (accessor, keys) => {
      Object.keys(keys).forEach(
        /** @template {AccessorArg} TKey @param {TKey} key */ (key) => {
          const value = keys[key];
          if (this.#isSimple(value)) {
            const newVal = accessor(key);

            if (newVal !== undefined) {
              const mapper = _.has(valueMappers, key) && valueMappers[key];
              this.wasSet.push(key);
              keys[key] =
                typeof mapper === "function" ? mapper(newVal) : newVal;
            }
          }
        }
      );
    };

    mapKeys(accessor, this);
    mapKeys(accessor, this.thresholds);
    this.#enableAndDisableFeatures(accessor);
  }
  /** @param {EnvAccessor} accessor */
  eachSettingAsEnv(accessor) {
    const valueMappers = Settings.valueMappers;

    /** @param {EnvAccessor} accessor @param {Record<string, any>} keys */
    const mapKeys = (accessor, keys) => {
      Object.keys(keys).forEach((key) => {
        const value = keys[key];
        if (this.#isSimple(value)) {
          const newVal = accessor(_.snakeCase(key).toUpperCase());

          if (newVal !== undefined) {
            const mapper = _.has(valueMappers, key) && valueMappers[key];
            this.wasSet.push(key);
            keys[key] = typeof mapper === "function" ? mapper(newVal) : newVal;
          }
        }
      });
    };

    mapKeys(accessor, this);
    mapKeys(accessor, this.thresholds);
    this.#enableAndDisableFeatures((a) =>
      accessor(_.snakeCase(a).toUpperCase())
    );
  }

  /** @param {Accessor} accessor */
  #enableAndDisableFeatures(accessor) {
    /** @type {string[]} */
    /** @param {AccessorArg} key */
    const getAndPrepare = (key) => {
      const raw = accessor(key) || "";
      const cleaned = decodeURIComponent(raw).toLowerCase()?.split(" ") ?? [];
      return cleaned.filter((e) => !!e);
    };
    let enable = getAndPrepare("enable");
    let disable = getAndPrepare("disable");
    let obscured = getAndPrepare("obscured");

    /** @param {string} feature @param {boolean} condition */
    function enableIf(feature, condition) {
      if (condition) enable.push(feature);
    }

    /** @param {string[]} features */
    function anyEnabled(features) {
      return !!features.find((feature) => enable.includes(feature));
    }

    const prepareAlarmTypes = () => {
      const alarmTypes = getAndPrepare("alarmTypes").filter((type) =>
        ["predict", "simple"].includes(type)
      );
      if (alarmTypes.length) return alarmTypes;

      const thresholdWasSet = this.wasSet.some((name) => name.startsWith("bg"));
      return thresholdWasSet ? ["simple"] : ["predict"];
    };

    this.alarmTypes = prepareAlarmTypes();

    //don't require pushover to be enabled to preserve backwards compatibility if there are extendedSettings for it
    enableIf("pushover", accessor("pushoverApiToken"));

    enableIf(
      "treatmentnotify",
      anyEnabled(["careportal", "pushover", "maker"])
    );

    Settings.DEFAULT_FEATURES.forEach((feature) => {
      enableIf(feature, !enable.includes(feature));
    });

    //TODO: maybe get rid of ALARM_TYPES and only use enable?
    enableIf("simplealarms", this.alarmTypes.includes("simple"));
    enableIf("ar2", this.alarmTypes.includes("predict"));

    if (disable.length > 0) {
      console.info("disabling", disable);
    }

    //all enabled feature, without any that have been disabled
    this.enable = [...new Set(enable).difference(new Set(disable))];
    this.obscured = obscured;

    const thresholds = this.thresholds;

    thresholds.bgHigh = Number(thresholds.bgHigh);
    thresholds.bgTargetTop = Number(thresholds.bgTargetTop);
    thresholds.bgTargetBottom = Number(thresholds.bgTargetBottom);
    thresholds.bgLow = Number(thresholds.bgLow);

    // Do not convert for old installs that have these set in mg/dl
    if (this.units.toLowerCase().includes("mmol") && thresholds.bgHigh < 50) {
      thresholds.bgHigh = Math.round(
        thresholds.bgHigh * constants.MMOL_TO_MGDL
      );
      thresholds.bgTargetTop = Math.round(
        thresholds.bgTargetTop * constants.MMOL_TO_MGDL
      );
      thresholds.bgTargetBottom = Math.round(
        thresholds.bgTargetBottom * constants.MMOL_TO_MGDL
      );
      thresholds.bgLow = Math.round(thresholds.bgLow * constants.MMOL_TO_MGDL);
    }

    this.#verifyThresholds();
    this.#adjustShownPlugins();
  }

  #verifyThresholds() {
    const thresholds = this.thresholds;

    if (thresholds.bgTargetBottom >= thresholds.bgTargetTop) {
      console.warn(
        `BG_TARGET_BOTTOM(${thresholds.bgTargetBottom}) was >= BG_TARGET_TOP(${thresholds.bgTargetTop})`
      );
      thresholds.bgTargetBottom = thresholds.bgTargetTop - 1;
      console.warn(`BG_TARGET_BOTTOM is now ${thresholds.bgTargetBottom}`);
    }
    if (thresholds.bgTargetTop <= thresholds.bgTargetBottom) {
      console.warn(
        `BG_TARGET_TOP(${thresholds.bgTargetTop}) was <= BG_TARGET_BOTTOM(${thresholds.bgTargetBottom})`
      );
      thresholds.bgTargetTop = thresholds.bgTargetBottom + 1;
      console.warn(`BG_TARGET_TOP is now ${thresholds.bgTargetTop}`);
    }
    if (thresholds.bgLow >= thresholds.bgTargetBottom) {
      console.warn(
        `BG_LOW(${thresholds.bgLow}) was >= BG_TARGET_BOTTOM(${thresholds.bgTargetBottom})`
      );
      thresholds.bgLow = thresholds.bgTargetBottom - 1;
      console.warn(`BG_LOW is now ${thresholds.bgLow}`);
    }
    if (thresholds.bgHigh <= thresholds.bgTargetTop) {
      console.warn(
        `BG_HIGH(${thresholds.bgHigh}) was <= BG_TARGET_TOP(${thresholds.bgTargetTop})`
      );
      thresholds.bgHigh = thresholds.bgTargetTop + 1;
      console.warn(`BG_HIGH is now ${thresholds.bgHigh}`);
    }
  }

  #adjustShownPlugins() {
    const showPluginsUnset = this.showPlugins && 0 === this.showPlugins.length;

    this.showPlugins += " delta direction upbat";
    if (this.showRawbg === "always" || this.showRawbg === "noise") {
      this.showPlugins += " rawbg";
    }

    if (showPluginsUnset) {
      //assume all enabled features are plugins and they should be shown for now
      //it would be better to use the registered plugins, but it's not loaded yet...
      this.enable.forEach((feature) => {
        if (this.isEnabled(feature)) {
          this.showPlugins += " " + feature;
        }
      });
    }
  }

  /** @param {string | string[]} feature */
  isEnabled(feature) {
    if (!this.enable) return false;

    if (Array.isArray(feature)) {
      return feature.some((f) => this.enable.includes(f));
    }

    return this.enable.includes(feature);
  }

  /** @param {import("./types").Notify} notify */
  #isUrgentHighAlarmEnabled(notify) {
    return (
      notify.eventName === "high" &&
      notify.level === constants.LEVEL_URGENT &&
      this.alarmUrgentHigh
    );
  }

  /** @param {import("./types").Notify} notify */
  #isHighAlarmEnabled(notify) {
    return notify.eventName === "high" && this.alarmHigh;
  }

  /** @param {import("./types").Notify} notify */
  #isUrgentLowAlarmEnabled(notify) {
    return (
      notify.eventName === "low" &&
      notify.level === constants.LEVEL_URGENT &&
      this.alarmUrgentLow
    );
  }

  /** @param {import("./types").Notify} notify */
  #isLowAlarmEnabled(notify) {
    return notify.eventName === "low" && this.alarmLow;
  }

  /** @param {import("./types").Notify} notify */
  isAlarmEventEnabled(notify) {
    return (
      ("high" !== notify.eventName && "low" !== notify.eventName) ||
      this.#isUrgentHighAlarmEnabled(notify) ||
      this.#isHighAlarmEnabled(notify) ||
      this.#isUrgentLowAlarmEnabled(notify) ||
      this.#isLowAlarmEnabled(notify)
    );
  }

  /** @param {import("./types").Notify} notify */
  snoozeMinsForAlarmEvent(notify) {
    if (this.#isUrgentHighAlarmEnabled(notify)) {
      return this.alarmUrgentHighMins;
    } else if (this.#isHighAlarmEnabled(notify)) {
      return this.alarmHighMins;
    } else if (this.#isUrgentLowAlarmEnabled(notify)) {
      return this.alarmUrgentLowMins;
    } else if (this.#isLowAlarmEnabled(notify)) {
      return this.alarmLowMins;
    } else if (notify.level === constants.LEVEL_URGENT) {
      return this.alarmUrgentMins;
    } else {
      return this.alarmWarnMins;
    }
  }

  /** @param {import("./types").Notify} notify */
  snoozeFirstMinsForAlarmEvent(notify) {
    return this.snoozeMinsForAlarmEvent(notify).at(0) ?? NaN;
  }
}

module.exports = () => new Settings();
