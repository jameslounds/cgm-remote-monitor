"use strict";

import _ from "lodash";
import unitsInit from "./units";
const units = unitsInit();
import times from "./times";

import type { DData } from "./data/ddata";
import type { Plugin } from "./plugins";
import type { PluginBase } from "./plugins/pluginbase";
import type { BolusWizardPreviewProperties } from "./plugins/boluswizardpreview";
import type { Moment } from "moment-timezone";
import type { Settings } from "./settings";
import type { Levels } from "./levels";

export interface Notify extends Record<string, any> {
  state?: number;
  timestamp?: Moment;
}
export interface Entry extends Record<string, any> {
  mgdl: number;
  mills: number;
}

type ClientInitContext = {
  settings: Settings;
  pluginBase: PluginBase;
  language: Sandbox["language"];
  levels: Sandbox["levels"];
  notifications: Sandbox["notifications"];
};

interface Properties extends Record<string, any> {
  bwp?: BolusWizardPreviewProperties;
}

type ExtendedSettings = Record<string, any> & { enableAlerts?: boolean };

export interface Sandbox {
  properties: Properties;
  extendedSettings: ExtendedSettings;
  unitsLabel: "mmol/L" | "mg/dl";
  data: DData; //TODO is this *just* ddata? Are extra things added?
  serverInit: any; // TODO probably remove
  runtimeEnvironment: string;
  runtimeState: string;
  time: number;
  settings: Record<string, any>;
  levels: Levels;
  language: ReturnType<(typeof import("./language"))["default"]>;
  translate: Sandbox["language"]["translate"];
  notifications: {
    requestNotify: (notify: Notify) => void;
    requestSnooze: (notify: Notify) => void;
    requestClear: (notify: Notify) => void;
  };
  withExtendedSettings(plugin: Plugin): Sandbox;
  showPlugins: string;
  pluginBase: PluginBase;
  clientInit(ctx: ClientInitContext, time: number, data: DData): Sandbox;
  offerProperty<T extends keyof Sandbox["properties"]>(
    name: T,
    setter: () => Sandbox["properties"][T]
  ): void;
  isCurrent(entry: Entry): boolean;
  lastEntry(entries: Entry[]): Entry | undefined;
  lastNEntries(entries: Entry[], n: number): Entry[];
  prevEntry(entries: Entry[]): Entry | undefined;
  prevSGVEntry(): Entry | undefined;
  lastSGVEntry(): Entry | undefined;
  lastSGVMgdl(): number | undefined;
  lastSGVMills(): number | undefined;
  entryMills(entry: Entry): number;
  lastScaledSGV(): number | undefined;
  lastDisplaySVG(): number | "LOW" | "HIGH" | undefined;
  buildBGNowLine(): string;
  propertyLine<T extends keyof Sandbox["properties"]>(
    propertyName: T
  ): Sandbox["properties"][T]["displayLine"];
  appendPropertyLine(propertyName: string, lines: string[]): string[];
  prepareDefaultLines(): string[];
  buildDefaultMessage(): string;
  displayBg(entry: Entry): number | "LOW" | "HIGH" | undefined;
  scaleEntry(entry: Entry): number | undefined;
  scaleMgdl(mgdl: number): number;
  roundInsulinForDisplayFormat(insulin: number): string;
  roundBGToDisplayFormat(bg: number): number;
}

export default function init() {
  var sbx = {} as Sandbox;

  function reset() {
    sbx.properties = {};
  }

  function extend() {
    sbx.unitsLabel = unitsLabel();
    sbx.data = sbx.data || ({} as DData);
    //default to prevent adding checks everywhere
    sbx.extendedSettings = { empty: true };
  }

  function withExtendedSettings(
    plugin: Plugin,
    allExtendedSettings: Record<string, any>,
    sbx: Sandbox
  ) {
    var sbx2 = _.extend({}, sbx);
    sbx2.extendedSettings =
      (allExtendedSettings && allExtendedSettings[plugin.name]) || {};
    return sbx2;
  }

  /**
   * A view into the safe notification functions for plugins
   *
   * @param ctx
   * @returns  {{notification}}
   */
  function safeNotifications(ctx: { notifications: Sandbox["notifications"] }) {
    return _.pick(ctx.notifications, [
      "requestNotify",
      "requestSnooze",
      "requestClear",
    ]);
  }

  /**
   * Initialize the sandbox using server state
   *
   * @param env - .js
   * @param ctx - created from bootevent
   * @returns {{sbx}}
   */
  sbx.serverInit = function serverInit(env: any, ctx: any) {
    reset();

    sbx.runtimeEnvironment = "server";
    sbx.runtimeState = ctx.runtimeState;
    sbx.time = Date.now();
    sbx.settings = env.settings;
    sbx.data = ctx.ddata.clone();
    sbx.notifications = safeNotifications(ctx);

    sbx.levels = ctx.levels;
    sbx.language = ctx.language;
    sbx.translate = ctx.language.translate;

    var profile = require("./profilefunctions")(null, ctx);
    //Plugins will expect the right profile based on time
    profile.loadData(_.cloneDeep(ctx.ddata.profiles));
    profile.updateTreatments(
      ctx.ddata.profileTreatments,
      ctx.ddata.tempbasalTreatments,
      ctx.ddata.combobolusTreatments
    );
    sbx.data.profile = profile;
    // @ts-ignore
    delete sbx.data.profiles;

    sbx.properties = {};

    sbx.withExtendedSettings = function getPluginExtendedSettingsOnly(plugin) {
      return withExtendedSettings(plugin, env.extendedSettings, sbx);
    };

    extend();

    return sbx;
  };

  /**
   * Initialize the sandbox using client state
   *
   * @param settings - specific settings from the client, starting with the defaults
   * @param time - could be a retro time
   * @param pluginBase - used by visualization plugins to update the UI
   * @param data - svgs, treatments, profile, etc
   * @returns {{sbx}}
   */

  sbx.clientInit = function clientInit(
    ctx: ClientInitContext,
    time: number,
    data: DData
  ): Sandbox {
    reset();

    sbx.runtimeEnvironment = "client";
    sbx.settings = ctx.settings;
    sbx.showPlugins = ctx.settings.showPlugins;
    sbx.time = time;
    sbx.data = data;
    sbx.pluginBase = ctx.pluginBase;
    sbx.notifications = safeNotifications(ctx);

    sbx.levels = ctx.levels;
    sbx.language = ctx.language;
    sbx.translate = ctx.language.translate;

    if (sbx.pluginBase) {
      sbx.pluginBase.forecastInfos = [];
      sbx.pluginBase.forecastPoints = {};
    }

    sbx.extendedSettings = { empty: true };
    sbx.withExtendedSettings = function getPluginExtendedSettingsOnly(plugin) {
      return withExtendedSettings(plugin, sbx.settings.extendedSettings, sbx);
    };

    extend();

    return sbx;
  };

  /**
   * Properties are immutable, first plugin to set it wins, plugins should be in the correct order
   *
   * @param name
   * @param setter
   */
  sbx.offerProperty = function offerProperty<
    T extends keyof Sandbox["properties"],
  >(name: T, setter: () => Sandbox["properties"][T]) {
    if (!Object.keys(sbx.properties).includes(name as string)) {
      var value = setter();
      if (value) {
        sbx.properties[name] = value;
      }
    }
  };

  sbx.isCurrent = function isCurrent(entry) {
    return entry && sbx.time - entry.mills <= times.mins(15).msecs;
  };

  sbx.lastEntry = function lastEntry(entries) {
    return _.findLast(entries, function notInTheFuture(entry) {
      return sbx.entryMills(entry) <= sbx.time;
    });
  };

  sbx.lastNEntries = function lastNEntries(entries, n) {
    var lastN: Entry[] = [];

    _.takeRightWhile(entries, function (entry) {
      if (sbx.entryMills(entry) <= sbx.time) {
        lastN.push(entry);
      }
      return lastN.length < n;
    });

    lastN.reverse();

    return lastN;
  };

  sbx.prevEntry = function prevEntry(entries) {
    var last2 = sbx.lastNEntries(entries, 2);
    return _.first(last2);
  };

  sbx.prevSGVEntry = function prevSGVEntry() {
    return sbx.prevEntry(sbx.data.sgvs);
  };

  sbx.lastSGVEntry = function lastSGVEntry() {
    return sbx.lastEntry(sbx.data.sgvs);
  };

  sbx.lastSGVMgdl = function lastSGVMgdl() {
    var last = sbx.lastSGVEntry();
    return last && last.mgdl;
  };

  sbx.lastSGVMills = function lastSGVMills() {
    var last = sbx.lastSGVEntry();
    return last && sbx.entryMills(last);
  };

  sbx.entryMills = function entryMills(entry) {
    return entry && entry.mills;
  };

  sbx.lastScaledSGV = function lastScaledSVG() {
    var last = sbx.lastSGVEntry();
    return last && sbx.scaleEntry(last);
  };

  sbx.lastDisplaySVG = function lastDisplaySVG() {
    var last = sbx.lastSGVEntry();
    return last && sbx.displayBg(last);
  };

  sbx.buildBGNowLine = function buildBGNowLine() {
    var line = "BG Now: " + sbx.lastDisplaySVG();

    var delta = sbx.properties.delta && sbx.properties.delta.display;
    if (delta) {
      line += " " + delta;
    }

    var direction = sbx.properties.direction && sbx.properties.direction.label;
    if (direction) {
      line += " " + direction;
    }

    line += " " + sbx.unitsLabel;

    return line;
  };

  sbx.propertyLine = function propertyLine<
    T extends keyof Sandbox["properties"],
  >(propertyName: T): Sandbox["properties"][T]["displayLine"] | false {
    return (
      sbx.properties[propertyName] && sbx.properties[propertyName].displayLine
    );
  };

  sbx.appendPropertyLine = function appendPropertyLine(
    propertyName: string,
    lines: string[]
  ) {
    lines = lines || [];

    var displayLine = sbx.propertyLine(propertyName);
    if (displayLine) {
      lines.push(displayLine);
    }

    return lines;
  };

  sbx.prepareDefaultLines = function prepareDefaultLines() {
    var lines = [sbx.buildBGNowLine()];
    sbx.appendPropertyLine("rawbg", lines);
    sbx.appendPropertyLine("ar2", lines);
    sbx.appendPropertyLine("bwp", lines);
    sbx.appendPropertyLine("iob", lines);
    sbx.appendPropertyLine("cob", lines);

    return lines;
  };

  sbx.buildDefaultMessage = function buildDefaultMessage() {
    return sbx.prepareDefaultLines().join("\n");
  };

  sbx.displayBg = function displayBg(entry) {
    if (Number(entry.mgdl) === 39) {
      return "LOW";
    } else if (Number(entry.mgdl) === 401) {
      return "HIGH";
    } else {
      return sbx.scaleEntry(entry);
    }
  };

  sbx.scaleEntry = function scaleEntry(entry) {
    if (entry && entry.scaled === undefined) {
      if (sbx.settings.units === "mmol") {
        entry.scaled = entry.mmol || units.mgdlToMMOL(entry.mgdl);
      } else {
        entry.scaled = entry.mgdl || units.mmolToMgdl(entry.mmol);
      }
    }

    return entry && Number(entry.scaled);
  };

  sbx.scaleMgdl = function scaleMgdl(mgdl) {
    if (sbx.settings.units === "mmol" && mgdl) {
      return Number(units.mgdlToMMOL(mgdl));
    } else {
      return Number(mgdl);
    }
  };

  sbx.roundInsulinForDisplayFormat = function roundInsulinForDisplayFormat(
    insulin
  ) {
    if (insulin === 0) {
      return "0";
    }

    if (sbx.properties.roundingStyle === "medtronic") {
      var denominator = 0.1;
      var digits = 1;
      if (insulin <= 0.5) {
        denominator = 0.05;
        digits = 2;
      }
      return (Math.floor(insulin / denominator) * denominator).toFixed(digits);
    }

    return (Math.floor(insulin / 0.01) * 0.01).toFixed(2);
  };

  function unitsLabel() {
    return sbx.settings.units === "mmol" ? "mmol/L" : "mg/dl";
  }

  sbx.roundBGToDisplayFormat = function roundBGToDisplayFormat(bg) {
    return sbx.settings.units === "mmol"
      ? Math.round(bg * 10) / 10
      : Math.round(bg);
  };

  return sbx;
}
