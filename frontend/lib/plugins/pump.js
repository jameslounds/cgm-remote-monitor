"use strict";

/** @import {Moment} from "moment" */
/** @import {Plugin, DeviceStatus, VirtAsstIntentHandlerFn, Level} from "../types" */
/** @import {PluginCtx} from "." */
/** @import {ClientInitializedSandbox, InitializedSandbox, Sbx} from "../sandbox" */

/** @typedef {ReturnType<PumpPlugin["pumpStatus"]>} PumpProperties */

const times = require("../times");

const ALL_STATUS_FIELDS = /** @type {const} */ ([
  "reservoir",
  "battery",
  "clock",
  "status",
  "device",
]);

/** @implements {Plugin} */
class PumpPlugin {
  name = /** @type {const} */ ("pump");
  label = "Pump";
  pluginType = "pill-status";

  /** @param {PluginCtx} ctx */
  constructor(ctx) {
    this.moment = ctx.moment;
    this.translate = ctx.language.translate;
    this.timeago = require("./timeago")(ctx);
    this.openaps = require("./openaps")(ctx);
    this.utils = require("../utils")(ctx);
    this.levels = ctx.levels;
  }

  /** @param {Sbx} sbx */
  getPrefs(sbx) {
    /** @param {string | undefined} value */
    function cleanList(value) {
      if (!value) return;
      const cleaned = decodeURIComponent(value).toLowerCase().split(" ");
      if (!cleaned.length || !cleaned[0]) return;
      return cleaned;
    }

    const fields = cleanList(sbx.extendedSettings.fields) ?? ["reservoir"];

    const retroFields = cleanList(sbx.extendedSettings.retroFields) ?? [
      "reservoir",
      "battery",
    ];

    const profile = sbx.data.profile;
    let warnBattQuietNight = sbx.extendedSettings.warnBattQuietNight;
    if (
      warnBattQuietNight &&
      (!profile || !profile.hasData() || !profile.getTimezone())
    ) {
      console.warn(
        "PUMP_WARN_BATT_QUIET_NIGHT requires a treatment profile with time zone set to obtain user time zone"
      );
      warnBattQuietNight = false;
    }

    return {
      fields: fields,
      retroFields: retroFields,
      warnClock: Number(sbx.extendedSettings.warnClock) || 30,
      urgentClock: Number(sbx.extendedSettings.urgentClock) || 60,
      warnRes: Number(sbx.extendedSettings.warnRes) || 10,
      urgentRes: Number(sbx.extendedSettings.urgentRes) || 5,
      warnBattV: Number(sbx.extendedSettings.warnBattV) || 1.35,
      urgentBattV: Number(sbx.extendedSettings.urgentBattV) || 1.3,
      warnBattP: Number(sbx.extendedSettings.warnBattP) || 30,
      urgentBattP: Number(sbx.extendedSettings.urgentBattP) || 20,
      warnOnSuspend: Boolean(sbx.extendedSettings.warnOnSuspend) || false,
      enableAlerts: Boolean(sbx.extendedSettings.enableAlerts) || false,
      warnBattQuietNight: Boolean(warnBattQuietNight) || false,
      dayStart: sbx.settings.dayStart,
      dayEnd: sbx.settings.dayEnd,
    };
  }

  /**
   * @param {Sbx} sbx
   * @protected
   */
  pumpStatus(sbx) {
    const prefs = this.getPrefs(sbx);
    const recentMills = sbx.time - times.mins(prefs.urgentClock * 2).msecs;

    const filtered = sbx.data.devicestatus?.filter(
      (status) =>
        "pump" in status &&
        recentMills <= status.mills &&
        status.mills <= sbx.time
    );

    const pumpStatus = filtered
      ?.map((s) =>
        Object.assign(s, {
          clockMills: s.pump?.clock
            ? this.moment(s.pump.clock).valueOf()
            : s.mills,
        })
      )
      .reduce(
        (best, curr) =>
          !best || curr.clockMills > best.clockMills ? curr : best,
        /** @type {(DeviceStatus & { clockMills: number }) | undefined} */ (
          undefined
        )
      );

    return Object.assign(
      // TODO types
      /** @type {Partial<NonNullable<typeof pumpStatus>>} */ (pumpStatus ?? {}),
      {
        data: this.prepareData(pumpStatus ?? {}, prefs, sbx),
      }
    );
  }

  /** @param {Sbx} sbx */
  setProperties(sbx) {
    sbx.offerProperty("pump", () => this.pumpStatus(sbx));
  }

  /** @param {InitializedSandbox} sbx */
  checkNotifications(sbx) {
    const prefs = this.getPrefs(sbx);

    if (!prefs.enableAlerts) return;

    this.warnOnSuspend = prefs.warnOnSuspend;

    const data = this.prepareData(sbx.properties.pump ?? {}, prefs, sbx);

    if (data.level >= this.levels.WARN) {
      sbx.notifications.requestNotify({
        level: data.level,
        title: data.title ?? "",
        message: data.message,
        pushoverSound: "echo",
        group: "Pump",
        plugin: this,
      });
    }
  }

  /** @param {ClientInitializedSandbox} sbx */
  updateVisualisation(sbx) {
    const prop = sbx.properties.pump;

    const prefs = this.getPrefs(sbx);
    const result = this.prepareData(prop ?? {}, prefs, sbx);

    /** @type {string[]} */
    const values = [];
    /** @type {{ label: string; value: string }[]} */
    const info = [];

    const selectedFields = sbx.data.inRetroMode
      ? prefs.retroFields
      : prefs.fields;

    ALL_STATUS_FIELDS.forEach((fieldName) => {
      const field = result[fieldName];
      if (!field) return;

      const selected = selectedFields.includes(fieldName);
      if (selected) {
        values.push(field.display ?? "");
      } else {
        info.push({ label: field.label ?? "", value: field.display ?? "" });
      }
    });

    if (result.extended) {
      info.push({ label: "------------", value: "" });
      info.push(
        ...Object.entries(result.extended).map(([label, value]) => ({
          label,
          value,
        }))
      );
    }

    sbx.pluginBase.updatePillText(this, {
      value: values.join(" "),
      info: info,
      label: this.translate("Pump"),
      pillClass: this.statusClass(result.level),
    });
  }

  /** @type {VirtAsstIntentHandlerFn} */
  virtAsstReservoirHandler(next, _slots, sbx) {
    const reservoir = sbx.properties.pump?.pump?.reservoir;
    if (reservoir || reservoir === 0) {
      const response = this.translate("virtAsstReservoir", {
        params: [reservoir.toString()],
      });
      next(this.translate("virtAsstTitlePumpReservoir"), response);
    } else {
      next(
        this.translate("virtAsstTitlePumpReservoir"),
        this.translate("virtAsstUnknown")
      );
    }
  }

  /** @type {VirtAsstIntentHandlerFn} */
  virtAsstBatteryHandler(next, _slots, sbx) {
    const battery = sbx.properties.pump?.data.battery;
    if (battery) {
      const response = this.translate("virtAsstPumpBattery", {
        params: [battery.value.toString(), battery.unit],
      });
      next(this.translate("virtAsstTitlePumpBattery"), response);
    } else {
      next(
        this.translate("virtAsstTitlePumpBattery"),
        this.translate("virtAsstUnknown")
      );
    }
  }

  virtAsst = {
    intentHandlers: [
      {
        // backwards compatibility
        intent: "InsulinRemaining",
        intentHandler: this.virtAsstReservoirHandler.bind(this),
      },
      {
        // backwards compatibility
        intent: "PumpBattery",
        intentHandler: this.virtAsstBatteryHandler.bind(this),
      },
      {
        intent: "MetricNow",
        metrics: ["pump reservoir"],
        intentHandler: this.virtAsstReservoirHandler.bind(this),
      },
      {
        intent: "MetricNow",
        metrics: ["pump battery"],
        intentHandler: this.virtAsstBatteryHandler.bind(this),
      },
    ],
  };

  /** @protected @param {Level} level */
  statusClass(level) {
    switch (level) {
      case this.levels.WARN:
        return "warn";
      case this.levels.URGENT:
        return "urgent";
      default:
        return "current";
    }
  }

  /**
   * @param {ReturnType<PumpPlugin["getPrefs"]>} prefs
   * @param {Sbx} sbx
   * @param {Moment} clockMoment
   * @protected
   */
  clockInfo(prefs, sbx, clockMoment) {
    const label = "Last Clock";
    const display = this.utils.timeFormat(clockMoment, sbx);

    const urgent = this.moment(sbx.time).subtract(prefs.urgentClock, "minutes");
    const warn = this.moment(sbx.time).subtract(prefs.warnClock, "minutes");

    const level =
      (urgent.isAfter(clockMoment) && this.levels.URGENT) ||
      (warn.isAfter(clockMoment) && this.levels.WARN) ||
      this.levels.NONE;

    const message =
      (urgent.isAfter(clockMoment) && "URGENT: Pump data stale") ||
      (warn.isAfter(clockMoment) && "Warning, Pump data stale") ||
      undefined;

    return { value: clockMoment, label, display, level, message };
  }

  /**
   * @param {ReturnType<PumpPlugin["getPrefs"]>} prefs
   * @param {number} value
   * @protected
   */
  reservoirInfo(prefs, value) {
    return {
      value,
      label: "Reservoir",
      display: `${value.toPrecision(3)}U`,
      level:
        (value < prefs.urgentRes && this.levels.URGENT) ||
        (value < prefs.warnRes && this.levels.WARN) ||
        this.levels.NONE,
      message:
        (value < prefs.urgentRes && "URGENT: Pump Reservoir Low") ||
        (value < prefs.warnRes && "Warning, Pump Reservoir Low") ||
        undefined,
    };
  }

  /**
   * @param {ReturnType<PumpPlugin["reservoirInfo"]> | null} reservoir
   * @param {object} overrides
   * @param {Level} [overrides.reservoir_level_override]
   * @param {string} [overrides.reservoir_display_override]
   * @protected
   */
  overrideReservoir(reservoir, overrides) {
    return {
      ...reservoir,
      ...(overrides.reservoir_display_override
        ? { display: overrides.reservoir_display_override }
        : {}),
      ...(overrides.reservoir_level_override
        ? { level: overrides.reservoir_level_override }
        : {}),
    };
  }

  /**
   * @param {ReturnType<PumpPlugin["getPrefs"]>} prefs
   * @param {object} data
   * @param {"v" | "%"} data.type
   * @param {number} data.value
   * @param {boolean} data.batteryWarn
   * @protected
   */
  batteryInfo(prefs, { type, value, batteryWarn }) {
    const urgent = type === "v" ? prefs.urgentBattV : prefs.urgentBattP;
    const warn = type === "v" ? prefs.warnBattV : prefs.warnBattP;

    const level =
      (batteryWarn &&
        ((value < urgent && this.levels.URGENT) ||
          (value < warn && this.levels.WARN))) ||
      this.levels.NONE;
    const message =
      (batteryWarn &&
        ((value < urgent && "URGENT: Pump Battery Low") ||
          (value < warn && "Warning, Pump Battery Low"))) ||
      undefined;
    const unit = type === "v" ? "volts" : "percent";

    return {
      value,
      label: "Battery",
      display: value + type,
      unit,
      level,
      message,
    };
  }

  /**
   * @param {NonNullable<NonNullable<DeviceStatus["pump"]>["status"]>} status
   * @protected
   */
  statusInfo(status) {
    const display =
      (status.suspended && "suspended") ||
      (status.bolusing && "bolusing") ||
      status.status ||
      "normal";

    return {
      value: display,
      display: display,
      label: this.translate("Status"),
    };
  }

  /**
   * @param {Partial<DeviceStatus>} prop
   * @param {ReturnType<PumpPlugin["getPrefs"]>} prefs
   * @param {Sbx} sbx
   */
  prepareData(prop, prefs, sbx) {
    const pump = prop?.pump ?? {};

    const time = sbx.data.profile?.getTimezone()
      ? this.moment(sbx.time).tz(sbx.data.profile.getTimezone())
      : this.moment(sbx.time);
    const now = time.hours() + time.minutes() / 60.0 + time.seconds() / 3600.0;

    const batteryWarn = !(
      prefs.warnBattQuietNight &&
      (now < prefs.dayStart || now > prefs.dayEnd)
    );

    // If there's no value for `pump.reservoir` and `pump.manufacturer == "Insulet"`, use this
    const insuletReservoir =
      /** @type {ReturnType<PumpPlugin["reservoirInfo"]>} */ ({
        label: "Reservoir",
        display: "50+ U",
      });

    const result = {
      title: "Pump Status",
      /** @type {Level} */
      level: this.levels.NONE,
      clock: pump.clock
        ? this.clockInfo(prefs, sbx, this.moment(pump.clock))
        : null,
      reservoir: this.overrideReservoir(
        typeof pump.reservoir === "number"
          ? this.reservoirInfo(prefs, pump.reservoir)
          : pump.manufacturer === "Insulet"
            ? insuletReservoir
            : null,
        pump
      ),
      reservoir_display_override: pump.reservoir_display_override || null,
      reservoir_level_override: pump.reservoir_level_override || null,
      manufacturer: pump.manufacturer,
      model: pump.model,
      extended: pump.extended || null,

      device: { label: this.translate("Device"), display: prop.device },

      ...(pump.battery?.percent || pump.battery?.voltage
        ? {
            battery: this.batteryInfo(prefs, {
              type: pump.battery.percent ? "%" : "v",
              // @ts-expect-error TS thinks this coulb be undefined, but it's fine, we check it's truthy above
              value: pump.battery.percent || pump.battery.voltage,
              batteryWarn,
            }),
          }
        : {}),

      ...(pump.status ? { status: this.statusInfo(pump.status) } : {}),
    };

    //TODO: A new Pump Offline marker?  Something generic?  Use something new instead of a treatment?
    if (this.openaps.findOfflineMarker(sbx)) {
      console.info("OpenAPS known offline, not checking for alerts");
    } else {
      ALL_STATUS_FIELDS.forEach((fieldName) => {
        const field = result[fieldName];
        if (
          field &&
          "level" in field &&
          typeof field.level === "number" &&
          field.level > result.level
        ) {
          result.level = field.level;
          if (field.message) result.title = field.message;
        }
      });
    }

    /** @type {string[]} */
    const messageParts = [];
    if (result.battery)
      messageParts.push(`Pump Battery: ${result.battery.display}`);
    if (result.reservoir)
      messageParts.push(`Pump Reservoir: ${result.reservoir.display}`);

    return { ...result, message: messageParts.join("\n") };
  }
}

/** @param {PluginCtx} ctx */
module.exports = (ctx) => new PumpPlugin(ctx);
