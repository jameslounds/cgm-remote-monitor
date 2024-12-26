"use strict";

const units = require("./units.js")();
const times = require("./times");
/**
 * @typedef {Sandbox & {
 *   notifications: ReturnType<ReturnType<import("./sandbox")>['safeNotifications']>;
 *   settings: ReturnType<import("./settings.js")>
 * }} InitializedSandbox
 */

class Sandbox {
  constructor() {
    this.time = Date.now();
    /** @type {Record<string, any>} */
    this.properties = {};
    /** @type {Record<string, any>} */
    this.extendedSettings = {};
    this.settings = /** @type {ReturnType<import("./settings")>} */ ({});
    this.data = /** @type {ReturnType<import("./data/ddata")>} */ ({});
  }

  reset() {
    this.properties = {};
  }

  extend() {
    this.unitsLabel = this.#unitsLabel();
    this.data =
      this.data || /** @type {ReturnType<import("./data/ddata")>} */ ({});

    //default to prevent adding checks everywhere
    this.extendedSettings = { empty: true };
  }

  /**
   *
   * @param {{name: string}} plugin
   * @param {Record<string, any>} allExtendedSettings
   * @param {this} sbx
   * @returns
   */
  withExtendedSettings(plugin, allExtendedSettings, sbx) {
    try {
      const cloned = Object.assign(
        Object.create(Object.getPrototypeOf(sbx)),
        sbx
      );

      cloned.extendedSettings =
        (allExtendedSettings && allExtendedSettings[plugin.name]) || {};

      return cloned;
    } catch (err) {
      console.log(err);
    }
  }

  /**
   * A view into the safe notification functions for plugins
   *
   * @param {{notifications: ReturnType<import("./notifications.js")>}} ctx
   * @returns {Pick<ReturnType<import("./notifications.js")>, "requestNotify" | "requestSnooze">}
   */
  safeNotifications(ctx) {
    if (!ctx.notifications) {
      // some of the tests don't pass `notifications` to `sbx.{client,server}Init`
      // Previously, this was `_.pick(ctx.notifications, [ ... ])`, which would return {} here
      return { requestNotify: () => null, requestSnooze: () => null };
    }
    return {
      // requestNotify: ctx.notifications.requestNotify.bind(ctx.notifications),
      requestNotify: ctx.notifications.requestNotify,
      // requestSnooze: ctx.notifications.requestSnooze.bind(ctx.notifications),
      requestSnooze: ctx.notifications.requestSnooze,
    };
  }

  /**
   * @typedef ServerEnv
   * @prop {ReturnType<import("./settings")>} settings
   * @prop {Record<string, any>} extendedSettings
   */
  /**
   * @typedef ServerCtx
   * @prop {import("./levels")} levels
   * @prop {ReturnType<import("./language")>} language
   * @prop {ReturnType<import("./data/ddata")>} ddata
   * @prop {string} runtimeState
   * @prop {ReturnType<import("./notifications")>} notifications
   * @prop {import("moment-timezone")} moment
   */
  /**
   * @param {ServerEnv} env
   * @param {ServerCtx} ctx
   * @returns {InitializedSandbox}
   */
  serverInit(env, ctx) {
    this.reset();

    this.runtimeEnvironment = "server";
    this.runtimeState = ctx.runtimeState;
    this.time = Date.now();
    this.settings = env.settings;
    this.data = ctx.ddata.clone();
    this.notifications = this.safeNotifications(ctx);

    this.levels = ctx.levels;
    this.language = ctx.language;
    this.translate = ctx.language.translate;

    const profile = require("./profilefunctions")(null, ctx);
    //Plugins will expect the right profile based on time
    profile.loadData(structuredClone(ctx.ddata.profiles));
    profile.updateTreatments(
      ctx.ddata.profileTreatments,
      ctx.ddata.tempbasalTreatments,
      ctx.ddata.combobolusTreatments
    );
    this.data.profile = profile;
    /** @ts-ignore */
    delete this.data.profiles;

    this.properties = {};

    const withExtendedSettings = this.withExtendedSettings.bind(this);
    /** @param {import("./types").Plugin} plugin */
    this.withExtendedSettings = (plugin) => {
      return withExtendedSettings(plugin, env.extendedSettings, this);
    };

    this.extend();

    return /** @type {InitializedSandbox} */ (this);
  }

  /**
   * @typedef ClientInitCtx
   * @prop {ReturnType<import("./settings")>} settings
   * @prop {ReturnType<import("./plugins/pluginbase")>} pluginBase
   * @prop {ReturnType<import("./notifications")>} notifications
   * @prop {import("./levels")} levels
   * @prop {ReturnType<import("./language")>} language
   */
  /**
   * Initialize the sandbox using client state
   *
   * @param {ClientInitCtx} ctx - specific settings from the client, starting with the defaults
   * @param {number} time - could be a retro time
   * @param {ReturnType<import("./data/ddata")>} data - svgs, treatments, profile, etc
   * @returns {InitializedSandbox}
   */
  clientInit(ctx, time, data) {
    this.reset();

    this.runtimeEnvironment = "client";
    this.settings = ctx.settings;
    this.showPlugins = ctx.settings.showPlugins;
    this.time = time;
    this.data = data;
    this.pluginBase = ctx.pluginBase;
    this.notifications = this.safeNotifications(ctx);

    this.levels = ctx.levels;
    this.language = ctx.language;
    this.translate = ctx.language.translate;

    if (this.pluginBase) {
      this.pluginBase.forecastInfos = [];
      this.pluginBase.forecastPoints = {};
    }

    this.extendedSettings = { empty: true };
    const withExtendedSettings = this.withExtendedSettings.bind(this);
    /** @param {import("./types").Plugin} plugin */
    this.withExtendedSettings = (plugin) => {
      return withExtendedSettings(plugin, this.settings.extendedSettings, this);
    };

    this.extend();

    return /** @type {InitializedSandbox} */ (this);
  }

  /**
   * Properties are immutable, first plugin to set it wins, plugins should be in the correct order
   *
   * @template {keyof Sandbox["properties"]} T
   * @param {T} name
   * @param {() => Sandbox["properties"][T]} setter
   */
  offerProperty(name, setter) {
    if (!Object.keys(this.properties).includes(name)) {
      const value = setter();
      if (value) {
        this.properties[name] = value;
      }
    }
  }

  /** @param {import("./types.js").Entry} [entry] */
  isCurrent(entry) {
    return entry && this.time - entry.mills <= times.mins(15).msecs;
  }

  /** @template {import("./types").Entry} T @param {T[]} [entries] */
  lastEntry(entries) {
    return entries
      ?.slice()
      .reverse()
      .find((entry) => this.entryMills(entry) <= this.time);
  }

  /**
   * @template {import("./types").Entry} T 
   * @param {T[]} entries
   * @param {number} n
   */
  lastNEntries(entries, n) {
    return entries
      .filter((entry) => this.entryMills(entry) <= this.time)
      .slice(-n)
      .reverse();
  }

  /** @template {import("./types").Entry} T  @param {T[]} entries */
  prevEntry(entries) {
    const last2 = this.lastNEntries(entries, 2);
    return last2.at(0);
  }

  prevSGVEntry() {
    return this.lastEntry(this.data.sgvs);
  }

  lastSGVEntry() {
    return this.lastEntry(this.data.sgvs);
  }

  lastSGVMgdl() {
    const last = this.lastSGVEntry();
    return last && last.mgdl;
  }

  lastSGVMills() {
    return this.entryMills(this.lastSGVEntry());
  }

  /** @param {import("./types.js").Entry} [entry] */
  entryMills(entry) {
    // JHL: NaN is falsy, but counts as a `number`, so this narrows the return type.
    // Before, it would return undefined, which when used for comparison behaves the same as NaN
    return entry?.mills ?? NaN;
  }

  lastScaledSGV() {
    const lastEntry = this.lastSGVEntry();
    // JHL: NaN
    if (!lastEntry) return NaN;
    return this.scaleEntry(lastEntry);
  }

  lastDisplaySVG() {
    const lastEntry = this.lastSGVEntry();
    // JHL: NaN
    if (!lastEntry) return NaN;
    return this.displayBg(lastEntry);
  }

  buildBGNowLine() {
    let line = "BG Now: " + this.lastDisplaySVG();

    const delta = this.properties.delta && this.properties.delta.display;
    if (delta) line += " " + delta;

    const direction = this.properties.direction?.label;
    if (direction) line += " " + direction;

    line += " " + this.unitsLabel;

    return line;
  }

  /**
   * @template {keyof Sandbox["properties"]} T
   * @param {T} propertyName
   * @returns {Sandbox["properties"][T]["displayLine"]}
   */
  propertyLine(propertyName) {
    return (
      this.properties[propertyName] && this.properties[propertyName].displayLine
    );
  }

  /**
   * @template {keyof Sandbox["properties"]} T
   * @param {T} propertyName
   * @param {Array<string | Sandbox["properties"][T]['displayLine']>} lines
   */
  appendPropertyLine(propertyName, lines) {
    lines = lines || [];

    const displayLine = this.propertyLine(propertyName);
    if (displayLine) {
      lines.push(displayLine);
    }

    return lines;
  }

  prepareDefaultLines() {
    return [
      this.buildBGNowLine(),
      this.propertyLine("rawbg"),
      this.propertyLine("ar2"),
      this.propertyLine("bwp"),
      this.propertyLine("iob"),
      this.propertyLine("cob"),
    ].filter(Boolean);
  }

  buildDefaultMessage() {
    return this.prepareDefaultLines().join("\n");
  }

  /** @param {import("./types.js").Entry} entry */
  displayBg(entry) {
    if (Number(entry.mgdl) === 39) {
      return "LOW";
    } else if (Number(entry.mgdl) === 401) {
      return "HIGH";
    } else {
      return this.scaleEntry(entry);
    }
  }

  /** @param {import("./types.js").Entry} [entry] */
  scaleEntry(entry) {
    if (entry && entry.scaled === undefined) {
      if (this.settings.units === "mmol") {
        entry.scaled = entry.mmol || units.mgdlToMMOL(entry.mgdl ?? NaN);
      } else {
        entry.scaled = entry.mgdl || units.mmolToMgdl(entry.mmol ?? NaN);
      }
    }

    // JHL: NaN
    return (entry && Number(entry.scaled)) ?? NaN;
  }

  /** @param {number | string} mgdl */
  scaleMgdl(mgdl) {
    if (this.settings.units === "mmol" && mgdl) {
      return Number(units.mgdlToMMOL(Number(mgdl)));
    } else {
      return Number(mgdl);
    }
  }

  /** @param {number} insulin */
  roundInsulinForDisplayFormat(insulin) {
    if (insulin === 0) {
      return "0";
    }

    if (this.properties.roundingStyle === "medtronic") {
      const denominator = insulin <= 0.5 ? 0.05 : 0.1;
      const digits = insulin <= 0.5 ? 2 : 1;

      return (Math.floor(insulin / denominator) * denominator).toFixed(digits);
    }

    return (Math.floor(insulin / 0.01) * 0.01).toFixed(2);
  }

  #unitsLabel() {
    return this.settings.units === "mmol" ? "mmol/L" : "mg/dl";
  }

  /** @param {number} bg */
  roundBGToDisplayFormat(bg) {
    return this.settings.units === "mmol"
      ? Math.round(bg * 10) / 10
      : Math.round(bg);
  }
}

module.exports = () => new Sandbox();
