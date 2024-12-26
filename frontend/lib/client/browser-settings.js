"use strict";

// VERSION 1 - 0.9.0 - 2015-Nov-07 - initial version
const STORAGE_VERSION = 1;
const Storages = require("js-storage");

const Settings = require("../settings");

class BrowserSettings {
  /**
   * @typedef ServerSettings
   * @prop {ReturnType<import("../settings")>} settings
   * @prop {ReturnType<import("../settings")>['extendedSettings']} extendedSettings
   */
  /**
   * @param {import(".")} client
   * @param {ServerSettings} serverSettings
   * @param {JQueryStatic} $
   */
  constructor(client, serverSettings, $) {
    this.client = client;
    /** @type {ServerSettings} */
    this.serverSettings =
      serverSettings ??
      /** @type {ServerSettings} */ ({
        settings: {},
        extendedSettings: {},
      });

    this.$ = $;

    this.storage = Storages.localStorage;

    this.settings = Settings();
    this.#populateSettings();
  }

  loadAndWireForm() {
    this.#loadForm();
    this.#wireForm();
  }

  /** @param {import(".")} client */
  loadPluginSettings(client) {
    client.plugins.eachEnabledPlugin(
      /** @param {import("../types").Plugin} plugin */
      (plugin) => {
        if (!plugin.getClientPrefs) return;

        const settingsBase = this.settings.extendedSettings[plugin.name] ?? {};

        plugin.getClientPrefs().forEach((p) => {
          const id = `${plugin.name}-${p.id}`;
          const stored = this.storage.get(id);

          if (stored !== null) settingsBase[p.id] = stored;
        });
      }
    );
  }

  #populateSettings() {
    this.settings.extendedSettings = this.serverSettings.extendedSettings;

    try {
      this.settings.eachSetting((name) => {
        // ignore the `name`s from `settings.thresholds`
        if (name.startsWith("bg")) return;

        const stored = this.storage.get(name);
        return stored !== undefined && stored !== null
          ? stored
          : this.serverSettings.settings[name];
      });

      if (this.serverSettings.settings.thresholds) {
        this.settings.thresholds = this.serverSettings.settings.thresholds;
      }

      if (this.serverSettings.settings.enable) {
        this.settings.enable = this.serverSettings.settings.enable;
      }

      if (!this.settings.enable.includes("ar2")) {
        this.settings.enable.push("ar2");
      }
      this.#handleStorageVersions();
      if (!this.settings.extendedSettings.basal) {
        this.settings.extendedSettings.basal = {};
      }

      const basalStored = this.storage.get("basalrender");
      this.settings.extendedSettings.basal.render =
        basalStored !== null
          ? basalStored
          : this.settings.extendedSettings.basal.render;

      if (!this.settings.extendedSettings.bolus) {
        this.settings.extendedSettings.bolus = {
          renderOver: 0,
          renderFormat: "default",
          renderFormatSmall: "default",
        };
      }

      const bolusStored = this.storage.get("bolus");
      if (!this.#isBolusSettings(bolusStored)) {
        throw new Error(
          "Bolus settings from localStorage invalid - please clear your localStorage"
        );
      }
      this.settings.extendedSettings.bolus.renderOver =
        bolusStored !== null
          ? Number(bolusStored.renderOver)
          : this.settings.extendedSettings.bolus.renderOver;
      this.settings.extendedSettings.bolus.renderFormat =
        bolusStored !== null
          ? bolusStored.renderFormat
          : this.settings.extendedSettings.bolus.renderFormat;
      this.settings.extendedSettings.bolus.renderFormatSmall =
        bolusStored !== null
          ? bolusStored.renderFormatSmall
          : this.settings.extendedSettings.bolus.renderFormatSmall;
    } catch (err) {
      console.error(err);
      this.#showLocalstorageError();
    }
  }

  /** @param {unknown} data @returns {data is null | Record<`render${"Over" | "Format" | "FormatSmall"}`, any>} */
  #isBolusSettings(data) {
    if (data === null) return true;
    if (typeof data !== "object") return false;

    if (!("renderOver" in data)) return false;
    if (!("renderFormet" in data)) return false;
    if (!("renderFormatSmall" in data)) return false;

    return true;
  }

  #updateBolusRender() {
    const $ = this.$;
    const bolusSettings = this.client.settings.extendedSettings.bolus || {};

    const allRenderOverOptions = new Set([5, 1, 0.5, 0.1]);
    const renderOver = Number(bolusSettings.renderOver);
    if (
      typeof renderOver === "number" &&
      renderOver > 0 &&
      renderOver < Number.MAX_SAFE_INTEGER
    ) {
      allRenderOverOptions.add(renderOver);
    }
    const sortedRenderOverOptions = Array.from(allRenderOverOptions).toSorted(
      (a, b) => b - a // sort largest to smallest
    );

    sortedRenderOverOptions.forEach((optionValue) => {
      $("#bolusRenderOver").append(
        $("<option></option>")
          .attr("value", optionValue)
          .text(
            this.client.translate("%1 U and Over", { params: [optionValue] })
          )
      );
    });

    $("#bolusRenderOver").val(String(bolusSettings.renderOver || 0.5));
    $("#bolusRenderFormat").val(bolusSettings.renderFormat ?? "default");
    $("#bolusRenderFormatSmall").val(
      bolusSettings.renderFormatSmall ?? "default"
    );
  }

  #loadForm() {
    const $ = this.$;
    const utils = this.client.utils;
    /** @type {ReturnType<import("../language")>} */
    const language = this.client.language;
    const translate = language.translate;

    const that = this;
    /** @param {number} threshold */
    function appendThresholdValue(threshold) {
      return that.settings.alarmTypes?.includes("simple")
        ? ""
        : " (" + utils.scaleMgdl(threshold) + ")";
    }

    if (this.settings.units === "mmol") {
      $("#mmol-browser").prop("checked", true);
    } else {
      $("#mgdl-browser").prop("checked", true);
    }
    $("#alarm-urgenthigh-browser")
      .prop("checked", this.settings.alarmUrgentHigh)
      .next()
      .text(
        translate("Urgent High Alarm") +
          appendThresholdValue(this.settings.thresholds.bgHigh)
      );
    $("#alarm-high-browser")
      .prop("checked", this.settings.alarmHigh)
      .next()
      .text(
        translate("High Alarm") +
          appendThresholdValue(this.settings.thresholds.bgTargetTop)
      );
    $("#alarm-low-browser")
      .prop("checked", this.settings.alarmLow)
      .next()
      .text(
        translate("Low Alarm") +
          appendThresholdValue(this.settings.thresholds.bgTargetBottom)
      );
    $("#alarm-urgentlow-browser")
      .prop("checked", this.settings.alarmUrgentLow)
      .next()
      .text(
        translate("Urgent Low Alarm") +
          appendThresholdValue(this.settings.thresholds.bgLow)
      );
    $("#alarm-timeagowarn-browser").prop(
      "checked",
      this.settings.alarmTimeagoWarn
    );
    $("#alarm-timeagowarnmins-browser").val(this.settings.alarmTimeagoWarnMins);
    $("#alarm-timeagourgent-browser").prop(
      "checked",
      this.settings.alarmTimeagoUrgent
    );
    $("#alarm-timeagourgentmins-browser").val(
      this.settings.alarmTimeagoUrgentMins
    );
    $("#alarm-pumpbatterylow-browser").prop(
      "checked",
      this.settings.alarmPumpBatteryLow
    );

    $("#nightmode-browser").prop("checked", this.settings.nightMode);
    $("#editmode-browser").prop("checked", this.settings.editMode);

    if (this.settings.isEnabled("rawbg")) {
      $("#show-rawbg-option").show();
      $("#show-rawbg-" + this.settings.showRawbg).prop("checked", true);
    } else {
      $("#show-rawbg-option").hide();
    }

    $("h1.customTitle").text(this.settings.customTitle);
    $("input#customTitle").prop("value", this.settings.customTitle);

    if (this.settings.theme === "colors") {
      $("#theme-colors-browser").prop("checked", true);
    } else if (this.settings.theme === "colorblindfriendly") {
      $("#theme-colorblindfriendly-browser").prop("checked", true);
    } else {
      $("#theme-default-browser").prop("checked", true);
    }

    const langSelect = $("#language");

    language.languages.forEach((lang) => {
      langSelect.append(
        `<option value="${lang.code}">${lang.language}</option>`
      );
    });

    langSelect.val(this.settings.language);

    $("#scaleY").val(this.settings.scaleY);

    $("#basalrender").val(
      this.settings.extendedSettings.basal
        ? this.settings.extendedSettings.basal.render
        : "none"
    );

    this.#updateBolusRender();

    if (this.settings.timeFormat === 24) {
      $("#24-browser").prop("checked", true);
    } else {
      $("#12-browser").prop("checked", true);
    }

    const showPluginsSettings = $("#show-plugins");
    let hasPluginsToShow = false;

    /** @type {{plugin: import("../types").Plugin, prefs: import("../types").PluginClientPrefs[]}[]} */
    const pluginPrefs = [];

    this.client.plugins.eachEnabledPlugin(
      /** @param {import("../types").Plugin} plugin */
      (plugin) => {
        if (this.client.plugins.specialPlugins.includes(plugin.name)) {
          //ignore these, they are always on for now
        } else {
          const id = "plugin-" + plugin.name;
          const dd = $(
            `<dd>
            <input type="checkbox" id="${id}" value="${plugin.name}" />
            <label for="${id}">${translate(plugin.label || plugin.name)}</label>
          </dd>`
          );
          showPluginsSettings.append(dd);
          dd.find("input").prop(
            "checked",
            this.settings.showPlugins.includes(plugin.name)
          );
          hasPluginsToShow = true;
        }

        if (plugin.getClientPrefs) {
          const prefs = plugin.getClientPrefs();
          pluginPrefs.push({
            plugin,
            prefs,
          });
        }
      }
    );

    showPluginsSettings.toggle(hasPluginsToShow);

    const bs = $("#browserSettings");
    /** @type {string[]} */
    const toggleCheckboxes = [];

    pluginPrefs.forEach(({ plugin, prefs }) => {
      // Only show settings if plugin is visible
      if (this.settings.showPlugins.includes(plugin.name)) {
        const label = plugin.label;
        const dl = $("<dl>");
        dl.append(`<dt>` + translate(label) + `</dt>`);
        prefs.forEach((p) => {
          const id = plugin.name + "-" + p.id;
          const label = p.label;
          if (p.type === "boolean") {
            const html = $(
              `<dd><input type="checkbox" id="${id}" value="true" /><label for="${id}">` +
                translate(label) +
                `</label></dd>`
            );
            dl.append(html);
            const settingsBase = this.settings.extendedSettings[plugin.name];
            if (settingsBase[p.id] === true) {
              toggleCheckboxes.push(id);
            }
          }
        });
        bs.append(dl);
      }
    });

    toggleCheckboxes.forEach((id) => $("#" + id).prop("checked", true));

    $("#editprofilelink").toggle(
      this.settings.isEnabled("iob") ||
        this.settings.isEnabled("cob") ||
        this.settings.isEnabled("bwp") ||
        this.settings.isEnabled("basal")
    );

    //fetches token from url
    const parts = (location.search || "?").substring(1).split("&");
    const tokenParam = parts.find((val) => val.startsWith("token="));

    //if there is a token, append it to each of the links in the hamburger menu
    if (tokenParam) {
      $("#reportlink").attr("href", `report?${tokenParam}`);
      $("#editprofilelink").attr("href", `profile?${tokenParam}`);
      $("#admintoolslink").attr("href", `admin?${tokenParam}`);
      $("#editfoodlink").attr("href", `food?${tokenParam}`);
    }
  }

  #wireForm() {
    const $ = this.$;
    $("#useDefaults").on("click", (event) => {
      this.settings.eachSetting((name) => this.storage.remove(name));
      this.storage.remove("basalrender");
      this.storage.remove("bolus");
      event.preventDefault();
      this.client.browserUtils.reload();
    });

    $("#save").on("click", (event) => {
      function checkedPluginNames() {
        return $("#show-plugins input:checked")
          .map((_, checkbox) => $(checkbox).val())
          .toArray()
          .join(" ");
      }

      this.client.plugins.eachEnabledPlugin(
        /** @param {import("../types").Plugin} plugin*/ (plugin) => {
          if (plugin.getClientPrefs) {
            const prefs = plugin.getClientPrefs();

            prefs.forEach((p) => {
              const id = plugin.name + "-" + p.id;
              if (p.type == "boolean") {
                const val = $("#" + id).prop("checked");
                this.storage.set(id, val);
              }
            });
          }
        }
      );

      /** @param {Record<string, any>} data */
      const storeInBrowser = (data) => {
        Object.keys(data).forEach((k) => {
          if (typeof k !== "string") return;
          this.storage.set(k, data[k]);
        });
      };

      storeInBrowser({
        units: $("input:radio[name=units-browser]:checked").val(),
        alarmUrgentHigh: $("#alarm-urgenthigh-browser").prop("checked"),
        alarmHigh: $("#alarm-high-browser").prop("checked"),
        alarmLow: $("#alarm-low-browser").prop("checked"),
        alarmUrgentLow: $("#alarm-urgentlow-browser").prop("checked"),
        alarmTimeagoWarn: $("#alarm-timeagowarn-browser").prop("checked"),
        alarmTimeagoWarnMins: parseInt(
          $("#alarm-timeagowarnmins-browser").val()?.toString() ?? "15"
        ),
        alarmTimeagoUrgent: $("#alarm-timeagourgent-browser").prop("checked"),
        alarmTimeagoUrgentMins: parseInt(
          $("#alarm-timeagourgentmins-browser").val()?.toString() ?? "30"
        ),
        nightMode: $("#nightmode-browser").prop("checked"),
        editMode: $("#editmode-browser").prop("checked"),
        showRawbg: $("input:radio[name=show-rawbg]:checked").val(),
        customTitle: $("input#customTitle").prop("value"),
        theme: $("input:radio[name=theme-browser]:checked").val(),
        timeFormat: $("input:radio[name=timeformat-browser]:checked").val(),

        language: $("#language").val(),
        scaleY: $("#scaleY").val(),
        basalrender: $("#basalrender").val(),
        bolus: {
          renderOver: $("#bolusRenderOver").val(),
          renderFormat: $("#bolusRenderFormat").val(),
          renderFormatSmall: $("#bolusRenderFormatSmall").val(),
        },
        showPlugins: checkedPluginNames(),
        storageVersion: STORAGE_VERSION,
      });

      event.preventDefault();
      this.client.browserUtils.reload();
    });
  }

  #showLocalstorageError() {
    const html = `
    <legend>Settings</legend>
    <b>Settings are disabled.</b>
    <br /><br />
    Please enable cookies so you may customize your Nightscout site.`;

    $(".browserSettings").html(html);
    $("#save").hide();
  }

  #handleStorageVersions() {
    const previousVersion = parseInt(
      this.storage.get("storageVersion")?.toString() ?? ""
    );

    //un-versioned settings
    if (isNaN(previousVersion)) {
      //special showPlugins handling for careportal
      //prevent careportal from being hidden by old stored settings
      if (this.settings.isEnabled("careportal")) {
        const storedShowPlugins = this.storage.get("showPlugins");
        if (storedShowPlugins && !storedShowPlugins.includes("careportal")) {
          this.settings.showPlugins += " careportal";
        }
      }
    }
  }
}

module.exports = BrowserSettings;
