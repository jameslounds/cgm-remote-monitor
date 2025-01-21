"use strict";

/** @typedef {import("../types").Plugin} Plugin */
/** @implements {Plugin} */
class CareportalPlugin {
  name = /** @type {const} */ ("careportal");
  label = "Care Portal";
  pluginType = "drawer";

  getEventTypes() {
    return this.eventTypes;
  }

  /** @type {import("../types").PluginEventType[]} */
  eventTypes = [
    {
      val: "<none>",
      name: "<none>",
      ...this.fieldsToObj(["bg", "insulin", "carbs"]),
    },
    {
      val: "BG Check",
      name: "BG Check",
      ...this.fieldsToObj(["bg"]),
    },
    {
      val: "Snack Bolus",
      name: "Snack Bolus",
      ...this.fieldsToObj([
        "bg",
        "insulin",
        "carbs",
        "protein",
        "fat",
        "prebolus",
      ]),
    },
    {
      val: "Meal Bolus",
      name: "Meal Bolus",
      ...this.fieldsToObj([
        "bg",
        "insulin",
        "carbs",
        "protein",
        "fat",
        "prebolus",
      ]),
    },
    {
      val: "Correction Bolus",
      name: "Correction Bolus",
      ...this.fieldsToObj(["bg", "insulin"]),
    },
    {
      val: "Carb Correction",
      name: "Carb Correction",
      ...this.fieldsToObj(["bg", "carbs", "protein", "fat"]),
    },
    {
      val: "Combo Bolus",
      name: "Combo Bolus",
      ...this.fieldsToObj([
        "bg",
        "insulin",
        "carbs",
        "protein",
        "fat",
        "prebolus",
        "duration",
        "split",
      ]),
    },
    {
      val: "Announcement",
      name: "Announcement",
      ...this.fieldsToObj(["bg"]),
    },
    {
      val: "Note",
      name: "Note",
      ...this.fieldsToObj(["bg", "duration"]),
    },
    {
      val: "Question",
      name: "Question",
      ...this.fieldsToObj(["bg"]),
    },
    {
      val: "Site Change",
      name: "Pump Site Change",
      ...this.fieldsToObj(["bg", "insulin"]),
    },
    {
      val: "Sensor Start",
      name: "CGM Sensor Start",
      ...this.fieldsToObj(["bg", "sensor"]),
    },
    {
      val: "Sensor Change",
      name: "CGM Sensor Insert",
      ...this.fieldsToObj(["bg", "sensor"]),
    },
    {
      val: "Sensor Stop",
      name: "CGM Sensor Stop",
      ...this.fieldsToObj(["bg"]),
    },
    {
      val: "Pump Battery Change",
      name: "Pump Battery Change",
      ...this.fieldsToObj(["bg"]),
    },
    {
      val: "Insulin Change",
      name: "Insulin Cartridge Change",
      ...this.fieldsToObj(["bg"]),
    },
    {
      val: "Temp Basal Start",
      name: "Temp Basal Start",
      ...this.fieldsToObj(["bg", "duration", "percent", "absolute"]),
    },
    {
      val: "Temp Basal End",
      name: "Temp Basal End",
      ...this.fieldsToObj(["bg", "duration"]),
    },
    {
      val: "Profile Switch",
      name: "Profile Switch",
      ...this.fieldsToObj(["bg", "duration", "profile"]),
    },
    {
      val: "D.A.D. Alert",
      name: "D.A.D. Alert",
      ...this.fieldsToObj(["bg"]),
    },
  ];

  /** @protected @param {("bg" |"insulin" |"carbs" |"protein" |"fat" |"prebolus" |"duration" |"percent" |"absolute" |"profile" |"split" |"sensor")[]} a */
  fieldsToObj(a) {
    return {
      bg: a.includes("bg"),
      insulin: a.includes("insulin"),
      carbs: a.includes("carbs"),
      protein: a.includes("protein"),
      fat: a.includes("fat"),
      prebolus: a.includes("prebolus"),
      duration: a.includes("duration"),
      percent: a.includes("percent"),
      absolute: a.includes("absolute"),
      profile: a.includes("profile"),
      split: a.includes("split"),
      sensor: a.includes("sensor"),
    };
  }
}

module.exports = () => new CareportalPlugin();
