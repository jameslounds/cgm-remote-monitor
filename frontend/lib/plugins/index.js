"use strict";

var _find = require("lodash/find");
var _each = require("lodash/each");
var _filter = require("lodash/filter");
var _get = require("lodash/get");
var _isArray = require("lodash/isArray");
var _map = require("lodash/map");

/**
 * @typedef {{
 *   settings: ReturnType<import("../settings")>;
 *   extendedSettings: ReturnType<import("../settings")>["extendedSettings"];
 *   language: ReturnType<import("../language")>;
 *   levels: import("../levels");
 *   moment: import("moment");
 * }} PluginCtx
 */

class Plugins {
  /**
   * @template {import("../types").PluginNames<Plugins["allPlugins"]>} T
   * @param {T} name
   * @returns {Extract<Plugins["allPlugins"][number], { name: T }>}
   */
  byName(name) {
    // Typecasting here is unfortunate, but it's the only way to get sane types
    // and maintain backwards compatability
    return /** @type {Extract<Plugins["allPlugins"][number], { name: T }>} */ (
      this.allPlugins.find(
        /** @returns {plugin is plugin & Extract<Plugins["allPlugins"][number], { name: T }>} */ (
          plugin
        ) => plugin.name === name
      )
    );
  }

  /** @param {PluginCtx} ctx */
  constructor(ctx) {
    this.ctx = ctx;

    /** @type {Plugins[`${"client" | "server"}DefaultPlugins`][number][]} */
    this.allPlugins = [];
    /** @type {import("../types").Plugin[]} */
    this.enabledPlugins = [];
    this.base = require("./pluginbase");

    /** @satisfies {import("../types").Plugin[]} */
    this.clientDefaultPlugins = [
      require("./bgnow")(ctx),
      require("./rawbg")(ctx),
      require("./direction")(ctx),
      require("./timeago")(ctx),
      require("./upbat")(ctx),
      require("./ar2")(ctx),
      require("./errorcodes")(ctx),
      require("./iob")(ctx),
      require("./cob")(ctx),
      require("./careportal")(),
      require("./pump")(ctx),
      require("./openaps")(ctx),
      require("./xdripjs")(ctx),
      require("./loop")(ctx),
      require("./override")(),
      require("./boluswizardpreview")(ctx),
      require("./cannulaage")(ctx),
      require("./sensorage")(ctx),
      require("./insulinage")(ctx),
      require("./batteryage")(ctx),
      require("./basalprofile")(ctx),
      require("./bolus")(), // fake plugin to hold extended settings
      require("./boluscalc")(), // fake plugin to show/hide
      require("./profile")(), // fake plugin to hold extended settings
      require("./speech")(ctx),
      require("./dbsize")(ctx),
    ];

    /** @satisfies {import("../types").Plugin[]} */
    this.serverDefaultPlugins = [
      require("./bgnow")(ctx),
      require("./rawbg")(ctx),
      require("./direction")(ctx),
      require("./upbat")(ctx),
      require("./ar2")(ctx),
      require("./simplealarms")(ctx),
      require("./errorcodes")(ctx),
      require("./iob")(ctx),
      require("./cob")(ctx),
      require("./pump")(ctx),
      require("./openaps")(ctx),
      require("./xdripjs")(ctx),
      require("./loop")(ctx),
      require("./boluswizardpreview")(ctx),
      require("./cannulaage")(ctx),
      require("./sensorage")(ctx),
      require("./insulinage")(ctx),
      require("./batteryage")(ctx),
      require("./treatmentnotify")(ctx),
      require("./timeago")(ctx),
      require("./basalprofile")(ctx),
      require("./dbsize")(ctx),
      require("./runtimestate")(),
    ];
  }

  registerServerDefaults() {
    this.serverDefaultPlugins;
    this.register(this.serverDefaultPlugins);
    return this;
  }

  registerClientDefaults() {
    this.register(this.clientDefaultPlugins);
    return this;
  }

  /** @param {Plugins[`${"client" | "server"}DefaultPlugins`][number][]} all */
  register(all) {
    this.allPlugins.push(...all);

    this.enabledPlugins = this.allPlugins.filter((p) =>
      this.ctx.settings.enable?.includes(p.name)
    );
  }

  /** @param {string} pluginName */
  isPluginEnabled(pluginName) {
    return this.enabledPlugins.some((p) => p.name === pluginName);
  }

  /** @param {string} pluginName */
  getPlugin(pluginName) {
    return this.enabledPlugins.find((p) => p.name === pluginName);
  }

  /** @param {(plugin: import("../types").Plugin) => void} f */
  eachPlugin(f) {
    this.allPlugins.forEach(f);
  }

  /** @param {(plugin: import("../types").Plugin) => void} f */
  eachEnabledPlugin(f) {
    this.enabledPlugins.forEach(f);
  }

  specialPlugins =
    "ar2 bgnow delta direction timeago upbat rawbg errorcodes profile bolus";

  /** @param {{ showPlugins?: string | string[] }} sbx */
  shownPlugins(sbx) {
    return this.enabledPlugins.filter(
      (plugin) =>
        this.specialPlugins.includes(plugin.name) ||
        sbx.showPlugins?.includes(plugin.name)
    );
  }

  /**
   * @param  {{showPlugins?: string | string[]}} sbx
   * @param {(plugin: import("../types").Plugin) => void} f
   */
  eachShownPlugins(sbx, f) {
    this.shownPlugins(sbx).forEach(f);
  }

  /** @param {string} pluginType @param {{showPlugins?: string | string[]}} sbx */
  hasShownType(pluginType, sbx) {
    return this.shownPlugins(sbx).some(
      (plugin) => plugin.pluginType === pluginType
    );
  }

  /** @param {ReturnType<import("../sandbox")>} sbx */
  setProperties(sbx) {
    this.eachEnabledPlugin((plugin) => {
      if (plugin.setProperties) {
        try {
          // @ts-expect-error it was like this when i found it, idk how this works
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
  }

  /** @param {ReturnType<import("../sandbox")>} sbx */
  checkNotifications(sbx) {
    this.eachEnabledPlugin((plugin) => {
      if (plugin.checkNotifications) {
        try {
          // @ts-expect-error it was like this when i found it, idk how this works
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
  }

  /**
   * @param {ReturnType<import("../sandbox")>} sbx
   * @param {import("../types").Notify} alarm
   * @param {string} alarmMessage
   */
  visualizeAlarm(sbx, alarm, alarmMessage) {
    this.eachShownPlugins(sbx, (plugin) => {
      if (plugin.visualizeAlarm) {
        try {
          plugin.visualizeAlarm(
            // @ts-expect-error it was like this when i found it, idk how this works
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
  }

  /** @param {ReturnType<import("../sandbox")>} sbx */
  updateVisualisations(sbx) {
    this.eachShownPlugins(sbx, (plugin) => {
      if (plugin.updateVisualisation) {
        try {
          // @ts-expect-error it was like this when i found it, idk how this works
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
  }

  /** @param {ReturnType<import("../sandbox")>} sbx */
  getAllEventTypes(sbx) {
    return this.enabledPlugins.flatMap((plugin) => {
      if (plugin.getEventTypes) {
        const eventTypes = plugin.getEventTypes(
          // @ts-expect-error it was like this when i found it, idk how this works
          sbx.withExtendedSettings(plugin)
        );
        if (Array.isArray(eventTypes)) {
          return eventTypes;
        }
      }
      return [];
    });
  }

  enabledPluginNames() {
    return this.enabledPlugins.map((plugin) => plugin.name).join(" ");
  }

  /** @param {ReturnType<import("../settings")>["extendedSettings"]} allExtendedSettings */
  extendedClientSettings(allExtendedSettings) {
    return {
      ...Object.fromEntries(
        this.clientDefaultPlugins.map((plugin) => [
          plugin.name,
          allExtendedSettings[plugin.name],
        ])
      ),
      devicestatus: allExtendedSettings.devicestatus,
    };
  }
}

// function init(ctx) {
//   var allPlugins = [],
//     enabledPlugins = [];

//   function plugins(name) {
//     if (name) {
//       return _find(allPlugins, {
//         name: name,
//       });
//     } else {
//       return plugins;
//     }
//   }

//   plugins.base = require("./pluginbase");

//   var clientDefaultPlugins = [
//     require("./bgnow")(ctx),
//     require("./rawbg")(ctx),
//     require("./direction")(ctx),
//     require("./timeago")(ctx),
//     require("./upbat")(ctx),
//     require("./ar2")(ctx),
//     require("./errorcodes")(ctx),
//     require("./iob")(ctx),
//     require("./cob")(ctx),
//     require("./careportal")(ctx),
//     require("./pump")(ctx),
//     require("./openaps")(ctx),
//     require("./xdripjs")(ctx),
//     require("./loop")(ctx),
//     require("./override")(ctx),
//     require("./boluswizardpreview")(ctx),
//     require("./cannulaage")(ctx),
//     require("./sensorage")(ctx),
//     require("./insulinage")(ctx),
//     require("./batteryage")(ctx),
//     require("./basalprofile")(ctx),
//     require("./bolus")(ctx), // fake plugin to hold extended settings
//     require("./boluscalc")(ctx), // fake plugin to show/hide
//     require("./profile")(ctx), // fake plugin to hold extended settings
//     require("./speech")(ctx),
//     require("./dbsize")(ctx),
//   ];

//   var serverDefaultPlugins = [
//     require("./bgnow")(ctx),
//     require("./rawbg")(ctx),
//     require("./direction")(ctx),
//     require("./upbat")(ctx),
//     require("./ar2")(ctx),
//     require("./simplealarms")(ctx),
//     require("./errorcodes")(ctx),
//     require("./iob")(ctx),
//     require("./cob")(ctx),
//     require("./pump")(ctx),
//     require("./openaps")(ctx),
//     require("./xdripjs")(ctx),
//     require("./loop")(ctx),
//     require("./boluswizardpreview")(ctx),
//     require("./cannulaage")(ctx),
//     require("./sensorage")(ctx),
//     require("./insulinage")(ctx),
//     require("./batteryage")(ctx),
//     require("./treatmentnotify")(ctx),
//     require("./timeago")(ctx),
//     require("./basalprofile")(ctx),
//     require("./dbsize")(ctx),
//     require("./runtimestate")(ctx),
//   ];

//   plugins.registerServerDefaults = function registerServerDefaults() {
//     plugins.register(serverDefaultPlugins);
//     return plugins;
//   };

//   plugins.registerClientDefaults = function registerClientDefaults() {
//     plugins.register(clientDefaultPlugins);
//     return plugins;
//   };

//   plugins.register = function register(all) {
//     _each(all, function eachPlugin(plugin) {
//       allPlugins.push(plugin);
//     });

//     enabledPlugins = [];

//     var enable = _get(ctx, "settings.enable");

//     function isEnabled(plugin) {
//       //TODO: unify client/server env/app
//       return enable && enable.indexOf(plugin.name) > -1;
//     }

//     _each(allPlugins, function eachPlugin(plugin) {
//       plugin.enabled = isEnabled(plugin);
//       if (plugin.enabled) {
//         enabledPlugins.push(plugin);
//       }
//     });
//   };

//   plugins.isPluginEnabled = function isPluginEnabled(pluginName) {
//     var p = _find(enabledPlugins, "name", pluginName);
//     return p !== null;
//   };

//   plugins.getPlugin = function getPlugin(pluginName) {
//     return _find(enabledPlugins, "name", pluginName);
//   };

//   plugins.eachPlugin = function eachPlugin(f) {
//     _each(allPlugins, f);
//   };

//   plugins.eachEnabledPlugin = function eachEnabledPlugin(f) {
//     _each(enabledPlugins, f);
//   };

//   //these plugins are either always on or have custom settings
//   plugins.specialPlugins =
//     "ar2 bgnow delta direction timeago upbat rawbg errorcodes profile bolus";

//   plugins.shownPlugins = function (sbx) {
//     return _filter(enabledPlugins, function filterPlugins(plugin) {
//       return (
//         plugins.specialPlugins.indexOf(plugin.name) > -1 ||
//         (sbx && sbx.showPlugins && sbx.showPlugins.indexOf(plugin.name) > -1)
//       );
//     });
//   };

//   plugins.eachShownPlugins = function eachShownPlugins(sbx, f) {
//     _each(plugins.shownPlugins(sbx), f);
//   };

//   plugins.hasShownType = function hasShownType(pluginType, sbx) {
//     return (
//       _find(plugins.shownPlugins(sbx), function findWithType(plugin) {
//         return plugin.pluginType === pluginType;
//       }) !== undefined
//     );
//   };

//   plugins.setProperties = function setProperties(sbx) {
//     plugins.eachEnabledPlugin(function eachPlugin(plugin) {
//       if (plugin.setProperties) {
//         try {
//           plugin.setProperties(sbx.withExtendedSettings(plugin));
//         } catch (error) {
//           console.error(
//             "Plugin error on setProperties(): ",
//             plugin.name,
//             error
//           );
//         }
//       }
//     });
//   };

//   plugins.checkNotifications = function checkNotifications(sbx) {
//     plugins.eachEnabledPlugin(function eachPlugin(plugin) {
//       if (plugin.checkNotifications) {
//         try {
//           plugin.checkNotifications(sbx.withExtendedSettings(plugin));
//         } catch (error) {
//           console.error(
//             "Plugin error on checkNotifications(): ",
//             plugin.name,
//             error
//           );
//         }
//       }
//     });
//   };

//   plugins.visualizeAlarm = function visualizeAlarm(sbx, alarm, alarmMessage) {
//     plugins.eachShownPlugins(sbx, function eachPlugin(plugin) {
//       if (plugin.visualizeAlarm) {
//         try {
//           plugin.visualizeAlarm(
//             sbx.withExtendedSettings(plugin),
//             alarm,
//             alarmMessage
//           );
//         } catch (error) {
//           console.error(
//             "Plugin error on visualizeAlarm(): ",
//             plugin.name,
//             error
//           );
//         }
//       }
//     });
//   };

//   plugins.updateVisualisations = function updateVisualisations(sbx) {
//     plugins.eachShownPlugins(sbx, function eachPlugin(plugin) {
//       if (plugin.updateVisualisation) {
//         try {
//           plugin.updateVisualisation(sbx.withExtendedSettings(plugin));
//         } catch (error) {
//           console.error(
//             "Plugin error on visualizeAlarm(): ",
//             plugin.name,
//             error
//           );
//         }
//       }
//     });
//   };

//   plugins.getAllEventTypes = function getAllEventTypes(sbx) {
//     var all = [];
//     plugins.eachEnabledPlugin(function eachPlugin(plugin) {
//       if (plugin.getEventTypes) {
//         var eventTypes = plugin.getEventTypes(sbx.withExtendedSettings(plugin));
//         if (_isArray(eventTypes)) {
//           all = all.concat(eventTypes);
//         }
//       }
//     });

//     return all;
//   };

//   plugins.enabledPluginNames = function enabledPluginNames() {
//     return _map(enabledPlugins, function mapped(plugin) {
//       return plugin.name;
//     }).join(" ");
//   };

//   plugins.extendedClientSettings = function extendedClientSettings(
//     allExtendedSettings
//   ) {
//     var clientSettings = {};
//     _each(clientDefaultPlugins, function eachClientPlugin(plugin) {
//       clientSettings[plugin.name] = allExtendedSettings[plugin.name];
//     });

//     //HACK:  include devicestatus
//     clientSettings.devicestatus = allExtendedSettings.devicestatus;

//     return clientSettings;
//   };

//   return plugins();
// }

// module.exports = init;

/** @param {PluginCtx} ctx */
module.exports = (ctx) => new Plugins(ctx);
