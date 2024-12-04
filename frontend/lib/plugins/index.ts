"use strict";

import _find from "lodash/find";
import _each from "lodash/each";
import _filter from "lodash/filter";
import _get from "lodash/get";
import _isArray from "lodash/isArray";
import _map from "lodash/map";

import pluginBase from "./pluginbase";

import pluginbgnow from "./bgnow";
import pluginrawbg from "./rawbg";
import plugindirection from "./direction";
import plugintimeago from "./timeago";
import pluginupbat from "./upbat";
import pluginar2 from "./ar2";
import pluginerrorcodes from "./errorcodes";
import pluginiob from "./iob";
import plugincob from "./cob";
import plugincareportal from "./careportal";
import pluginpump from "./pump";
import pluginopenaps from "./openaps";
import pluginxdripjs from "./xdripjs";
import pluginloop from "./loop";
import pluginoverride from "./override";
import pluginboluswizardpreview from "./boluswizardpreview";
import plugincannulaage from "./cannulaage";
import pluginsensorage from "./sensorage";
import plugininsulinage from "./insulinage";
import pluginbatteryage from "./batteryage";
import pluginbasalprofile from "./basalprofile";
import pluginbolus from "./bolus";
import pluginboluscalc from "./boluscalc";
import pluginprofile from "./profile";
import pluginspeech from "./speech";
import plugindbsize from "./dbsize";
import pluginsimplealarms from "./simplealarms";
import plugintreatmentnotify from "./treatmentnotify";

import type * as Moment from "moment-timezone";
import type { Level, Levels } from "../levels";
import type { Sandbox } from "../sandbox";
import type { Settings } from "../settings";

export type PluginInfo = {
  found: boolean;
  age: number;
  treatmentDate: number;
  checkForAlert?: boolean;
  days: number;
  hours: number;
  notes?: string | string[]; //TODO tighten
  minFractions?: number;
  level: Level;
  urgent?: number;
  display: string;
  displayLong?: string;
  notification: {
    title: string;
    message: string;
    pushoverSound: string;
    level: Level;
    group: string;
  };
};

export interface Plugin /* extends Record<string, any> */ {
  name: string;
  label: string;
  pluginType: string;
  pillFlip?: boolean;
  enabled?: boolean;
  getEventTypes?: (settings: Sandbox) => any;
  // getClientPrefs?: () => { id: string; type: string; label: string }[];
  setProperties?: (sbx: Sandbox) => void;
  checkNotifications?: (sbx: Sandbox) => void;
  updateVisualisation?: (sbx: Sandbox) => void;
  // findLatestTimeChange?: (sbx: Sandbox) => PluginInfo;
  visualizeAlarm?: (sbx: Sandbox, alarm: any, alarmMessage: string) => any; //TODO type
}

export type PluginCtx = {
  settings: Settings;
  extendedSettings: Settings["extendedSettings"];
  language: ReturnType<(typeof import("../language"))["default"]>;
  levels: Levels;
  moment: (typeof Moment)["default"];
};

export default function init(ctx: PluginCtx) {
  const allPlugins: Plugin[] = [];
  let enabledPlugins: Plugin[] = [];

  function plugins(name: string): Plugin | undefined;
  function plugins(): typeof plugins;
  function plugins(name?: string) {
    if (name) {
      return _find(allPlugins, {
        name: name,
      });
    } else {
      return plugins;
    }
  }

  plugins.base = pluginBase;

  var clientDefaultPlugins = [
    pluginbgnow(ctx),
    pluginrawbg(ctx),
    plugindirection(),
    plugintimeago(ctx),
    pluginupbat(ctx),
    pluginar2(ctx),
    pluginerrorcodes(ctx),
    pluginiob(ctx),
    plugincob(ctx),
    plugincareportal(),
    pluginpump(ctx),
    pluginopenaps(ctx),
    pluginxdripjs(ctx),
    pluginloop(ctx),
    pluginoverride(),
    pluginboluswizardpreview(ctx),
    plugincannulaage(ctx),
    pluginsensorage(ctx),
    plugininsulinage(ctx),
    pluginbatteryage(ctx),
    pluginbasalprofile(ctx),
    pluginbolus(), // fake plugin to hold extended settings
    pluginboluscalc(), // fake plugin to show/hide
    pluginprofile(), // fake plugin to hold extended settings
    pluginspeech(ctx),
    plugindbsize(ctx),
  ] satisfies Plugin[];

  var serverDefaultPlugins: Plugin[] = [
    pluginbgnow(ctx),
    pluginrawbg(ctx),
    plugindirection(),
    pluginupbat(ctx),
    pluginar2(ctx),
    pluginsimplealarms(ctx),
    pluginerrorcodes(ctx),
    pluginiob(ctx),
    plugincob(ctx),
    pluginpump(ctx),
    pluginopenaps(ctx),
    pluginxdripjs(ctx),
    pluginloop(ctx),
    pluginboluswizardpreview(ctx),
    plugincannulaage(ctx),
    pluginsensorage(ctx),
    plugininsulinage(ctx),
    pluginbatteryage(ctx),
    plugintreatmentnotify(ctx),
    plugintimeago(ctx),
    pluginbasalprofile(ctx),
    plugindbsize(ctx),
  ] as Plugin[];

  plugins.registerServerDefaults = function registerServerDefaults() {
    plugins.register(serverDefaultPlugins);
    return plugins;
  };

  plugins.registerClientDefaults = function registerClientDefaults() {
    plugins.register(clientDefaultPlugins);
    return plugins;
  };

  plugins.register = function register(all: Plugin[]) {
    _each(all, function eachPlugin(plugin) {
      allPlugins.push(plugin);
    });

    enabledPlugins = [];

    var enable = _get(ctx, "settings.enable");

    function isEnabled(plugin: Plugin) {
      //TODO: unify client/server env/app
      return !!enable && enable.indexOf(plugin.name) > -1;
    }

    _each(allPlugins, function eachPlugin(plugin) {
      plugin.enabled = isEnabled(plugin);
      if (plugin.enabled) {
        enabledPlugins.push(plugin);
      }
    });
  };

  // jameslounds: I don't think this function is every used, but I'm not convinced this works: pluginName is being passed as `fromIndex` to lodash's `find`
  plugins.isPluginEnabled = function isPluginEnabled(pluginName: number) {
    var p = _find(enabledPlugins, "name", pluginName);
    return p !== null;
  };

  // jameslounds: again, not convinced this is used
  plugins.getPlugin = function getPlugin(pluginName: number) {
    return _find(enabledPlugins, "name", pluginName);
  };

  plugins.eachPlugin = function eachPlugin(f: (p: Plugin) => any) {
    _each(allPlugins, f);
  };

  plugins.eachEnabledPlugin = function eachEnabledPlugin(
    f: (p: Plugin) => any
  ) {
    _each(enabledPlugins, f);
  };

  //these plugins are either always on or have custom settings
  plugins.specialPlugins =
    "ar2 bgnow delta direction timeago upbat rawbg errorcodes profile bolus";

  plugins.shownPlugins = function (sbx: Sandbox) {
    return _filter(enabledPlugins, function filterPlugins(plugin) {
      return !!(
        plugins.specialPlugins.indexOf(plugin.name) > -1 ||
        (sbx && sbx.showPlugins && sbx.showPlugins.indexOf(plugin.name) > -1)
      );
    });
  };

  plugins.eachShownPlugins = function eachShownPlugins(
    sbx: Sandbox,
    f: (p: Plugin) => any
  ) {
    _each(plugins.shownPlugins(sbx), f);
  };

  plugins.hasShownType = function hasShownType(
    pluginType: string,
    sbx: Sandbox
  ) {
    return (
      _find(plugins.shownPlugins(sbx), function findWithType(plugin) {
        return plugin.pluginType === pluginType;
      }) !== undefined
    );
  };

  plugins.setProperties = function setProperties(sbx: Sandbox) {
    plugins.eachEnabledPlugin(function eachPlugin(plugin) {
      if (plugin.setProperties) {
        try {
          plugin.setProperties(sbx.withExtendedSettings(plugin));
        } catch (error) {
          console.error(
            "Plugin error on setProperties(): ",
            plugin.name,
            error
          );
        }
      }
    });
  };

  plugins.checkNotifications = function checkNotifications(sbx: Sandbox) {
    plugins.eachEnabledPlugin(function eachPlugin(plugin) {
      if (plugin.checkNotifications) {
        try {
          plugin.checkNotifications(sbx.withExtendedSettings(plugin));
        } catch (error) {
          console.error(
            "Plugin error on checkNotifications(): ",
            plugin.name,
            error
          );
        }
      }
    });
  };

  // TODO type properly, i think this os from socket.io
  plugins.visualizeAlarm = function visualizeAlarm(
    sbx: Sandbox,
    alarm: any,
    alarmMessage: string
  ) {
    plugins.eachShownPlugins(sbx, function eachPlugin(plugin) {
      if (plugin.visualizeAlarm) {
        try {
          plugin.visualizeAlarm(
            sbx.withExtendedSettings(plugin),
            alarm,
            alarmMessage
          );
        } catch (error) {
          console.error(
            "Plugin error on visualizeAlarm(): ",
            plugin.name,
            error
          );
        }
      }
    });
  };

  plugins.updateVisualisations = function updateVisualisations(sbx: Sandbox) {
    plugins.eachShownPlugins(sbx, function eachPlugin(plugin) {
      if (plugin.updateVisualisation) {
        try {
          plugin.updateVisualisation(sbx.withExtendedSettings(plugin));
        } catch (error) {
          console.error(
            "Plugin error on visualizeAlarm(): ",
            plugin.name,
            error
          );
        }
      }
    });
  };

  plugins.getAllEventTypes = function getAllEventTypes(sbx: Sandbox) {
    // TODO remove any
    var all: any[] = [];
    plugins.eachEnabledPlugin(function eachPlugin(plugin) {
      if (plugin.getEventTypes) {
        var eventTypes = plugin.getEventTypes(sbx.withExtendedSettings(plugin));
        if (_isArray(eventTypes)) {
          all = all.concat(eventTypes);
        }
      }
    });

    return all;
  };

  plugins.enabledPluginNames = function enabledPluginNames() {
    return _map(enabledPlugins, function mapped(plugin) {
      return plugin.name;
    }).join(" ");
  };

  plugins.extendedClientSettings = function extendedClientSettings(
    allExtendedSettings: Settings["extendedSettings"]
  ) {
    var clientSettings: Settings["extendedSettings"] = {};
    _each(clientDefaultPlugins, function eachClientPlugin(plugin) {
      clientSettings[plugin.name] = allExtendedSettings[plugin.name];
    });

    //HACK:  include devicestatus
    clientSettings.devicestatus = allExtendedSettings.devicestatus;

    return clientSettings;
  };

  return plugins();
}
