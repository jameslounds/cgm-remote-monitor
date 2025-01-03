"use strict";

const parse_duration = require("parse-duration"); // https://www.npmjs.com/package/parse-duration
const times = require("../times");
const consts = require("../constants");
const Storages = require("js-storage");

/** @typedef {import("../types").PluginEventType} PluginEventType */

class Careportal {
  /**
   * @param {ReturnType<import(".")>} client
   * @param {JQueryStatic} $
   */
  constructor(client, $) {
    this.client = client;
    this.$ = $;

    /** @type {ReturnType<import("../language")>} */
    this.language = client.language;
    /** @type {ReturnType<import("../language")>['translate']} */
    this.translate = this.client.translate;
    this.storage = Storages.localStorage;
    this.units = this.client.settings.units;

    this.eventTime = $("#eventTimeValue");
    this.eventDate = $("#eventDateValue");

    /** @type {Record<string, Omit<PluginEventType, "submitHook" | "val" | "name">>} */
    this.inputMatrix = {};
    /** @type {Record<string, PluginEventType['submitHook']>} */
    this.submitHooks = {};
    /** @type {PluginEventType[]} */
    this.allEventTypes = [];
    /** @type {Pick<PluginEventType, "name" | "val">[]} */
    this.events = [];

    this.#refreshEventTypes();

    /** @type {JQuery<HTMLAnchorElement>} */
    const treatmentDrawerToggleEl = $("a#treatmentDrawerToggle");
    treatmentDrawerToggleEl.on("click", (event) => {
      this.client.browserUtils.toggleDrawer(
        "#treatmentDrawer",
        this.prepare.bind(this)
      );
      this.maybePrevent(event);
    });

    $("#treatmentDrawer").find("button").on("click", this.save.bind(this));

    /** @type {JQuery<HTMLInputElement>} */
    const eventTimeRadioInput = $("#eventTime").find("input:radio");
    eventTimeRadioInput.on("change", this.eventTimeTypeChange.bind(this));

    const updateTime = this.updateTime.bind(this);
    const mergeDateAndTime = this.mergeDateAndTime.bind(this);
    const maybePrevent = this.maybePrevent;
    /** @type {JQuery.TypeEventHandler<HTMLInputElement, undefined, HTMLInputElement, HTMLInputElement, "focus">} */
    this.dateTimeFocus = function (event) {
      $("#othertime").prop("checked", true);
      updateTime($(this), mergeDateAndTime());
      maybePrevent(event);
    };

    /** @type {JQuery<HTMLInputElement>} */
    const eventInputEls = $(".eventinput");
    eventInputEls.on("focus", this.dateTimeFocus); // intentionally unbound
    eventInputEls.on("change", this.dateTimeChange.bind(this));
  }

  /** @param {import("moment").Moment} time */
  #setDateAndTime(time = this.client.ctx.moment()) {
    this.eventTime.val(`${time.hours()}:${time.minutes()}`);
    this.eventDate.val(time.toISOString().split("T")[0]);
  }

  mergeDateAndTime() {
    return this.client.utils.mergeInputTime(
      this.eventTime.val(),
      this.eventDate.val()
    );
  }

  /** @param {JQuery<Element>} el @param {import("moment").Moment} time */
  updateTime(el, time) {
    el.attr("oldminutes", time.minutes());
    el.attr("oldhours", time.hours());
  }

  /** @param {JQuery.Event} [event] */
  maybePrevent(event) {
    if (event) event.preventDefault();
  }

  #refreshEventTypes() {
    this.allEventTypes =
      this.client.plugins.getAllEventTypes(this.client.sbx) ?? [];

    this.events = this.allEventTypes.map((event) => ({
      val: event.val,
      name: event.name,
    }));

    this.inputMatrix = Object.fromEntries(
      this.allEventTypes.map((event) => [
        event.val,
        {
          otp: event.otp,
          remoteCarbs: event.remoteCarbs,
          remoteAbsorption: event.remoteAbsorption,
          remoteBolus: event.remoteBolus,
          bg: event.bg,
          insulin: event.insulin,
          carbs: event.carbs,
          protein: event.protein,
          fat: event.fat,
          prebolus: event.prebolus,
          duration: event.duration,
          percent: event.percent,
          absolute: event.absolute,
          profile: event.profile,
          split: event.split,
          sensor: event.sensor,
          reasons: event.reasons,
          targets: event.targets,
        },
      ]) ?? []
    );

    this.submitHooks = Object.fromEntries(
      this.allEventTypes.map((event) => [event.name, event.submitHook])
    );
  }

  /** @param {JQuery.Event} event */
  filterInputs(event) {
    const $ = this.$;
    const eventType = $("#eventType").val();
    if (typeof eventType !== "string") {
      this.maybePrevent(event);
      return;
    }

    /** @param {boolean} [enabled] */
    function displayType(enabled) {
      return enabled ? "" : "none";
    }

    /** @param {boolean | undefined} visible, @param {string} id */
    function resetIfHidden(visible, id) {
      if (!visible) $(id).val("");
    }

    const pluginEvent = this.inputMatrix[eventType];
    const reasons = pluginEvent["reasons"] ?? [];

    $("#reasonLabel").css("display", displayType(reasons && !!reasons.length));
    $("#targets").css("display", displayType(pluginEvent.targets));

    $("#otpLabel").css("display", displayType(pluginEvent.otp));
    $("#remoteCarbsLabel").css("display", displayType(pluginEvent.remoteCarbs));
    $("#remoteAbsorptionLabel").css(
      "display",
      displayType(pluginEvent.remoteAbsorption)
    );
    $("#remoteBolusLabel").css("display", displayType(pluginEvent.remoteBolus));

    $("#bg").css("display", displayType(pluginEvent.bg));
    $("#insulinGivenLabel").css("display", displayType(pluginEvent.insulin));

    $("#carbsGivenLabel").css("display", displayType(pluginEvent.carbs));
    $("#proteinGivenLabel").css("display", displayType(pluginEvent.protein));
    $("#fatGivenLabel").css("display", displayType(pluginEvent.fat));

    $("#sensorInfo").css("display", displayType(pluginEvent.sensor));

    $("#durationLabel").css("display", displayType(pluginEvent.duration));
    $("#percentLabel").css(
      "display",
      displayType(pluginEvent.percent && $("#absolute").val() === "")
    );
    $("#absoluteLabel").css(
      "display",
      displayType(pluginEvent.absolute && $("#percent").val() === "")
    );
    $("#profileLabel").css("display", displayType(pluginEvent.profile));
    $("#preBolusLabel").css("display", displayType(pluginEvent.prebolus));
    $("#insulinSplitLabel").css("display", displayType(pluginEvent.split));

    $("#reason")
      .empty()
      .append(
        ...reasons.map(
          (r) =>
            `<option value="${r.name}">${this.translate(r.displayName ?? r.name)}</option>`
        )
      );

    this.reasonable();

    resetIfHidden(pluginEvent.otp, "#otp");
    resetIfHidden(pluginEvent.remoteCarbs, "#remoteCarbs");
    resetIfHidden(pluginEvent.remoteAbsorption, "#remoteAbsorption");
    resetIfHidden(pluginEvent.remoteBolus, "#remoteBolus");

    resetIfHidden(pluginEvent.insulin, "#insulinGiven");
    resetIfHidden(pluginEvent.carbs, "#carbsGiven");
    resetIfHidden(pluginEvent.protein, "#proteinGiven");
    resetIfHidden(pluginEvent.fat, "#fatGiven");
    resetIfHidden(pluginEvent.sensor, "#sensorCode");
    resetIfHidden(pluginEvent.sensor, "#transmitterId");
    resetIfHidden(pluginEvent.duration, "#duration");
    resetIfHidden(pluginEvent.absolute, "#absolute");
    resetIfHidden(pluginEvent.percent, "#percent");
    resetIfHidden(pluginEvent.prebolus, "#preBolus");
    resetIfHidden(pluginEvent.split, "#insulinSplitNow");
    resetIfHidden(pluginEvent.split, "#insulinSplitExt");

    this.maybePrevent(event);
  }

  reasonable() {
    const eventType = $("#eventType").val();
    /** @type {Exclude<PluginEventType['reasons'], undefined>} */
    let reasons = [];

    // validate the eventType input before getting the reasons list
    if (eventType === "string" && eventType in this.inputMatrix) {
      reasons = this.inputMatrix[eventType]["reasons"] ?? [];
    }
    const selected = $("#reason").val();

    const reason = reasons.find((r) => r.name === selected);

    if (!reason) return;

    $("#duration").val(reason.duration ?? "");
    $("#targetTop").val(reason.targetTop ?? "");
    $("#targetBottom").val(reason.targetBottom ?? "");
  }

  prepareEvents() {
    const $ = this.$;
    $("#eventType")
      .empty()
      .append(
        ...this.events.map(
          (e) => `<option value="${e.val}">${this.translate(e.name)}</option>`
        )
      );

    /** @param {string} id @returns {JQuery<HTMLInputElement>} */
    function getInputById(id) {
      return $(id);
    }

    getInputById("#eventType").on("change", this.filterInputs.bind(this));
    getInputById("#reason").on("change", this.reasonable.bind(this));
    getInputById("#percent").on("input", this.filterInputs.bind(this));
    getInputById("#absolute").on("input", this.filterInputs.bind(this));

    const that = this;
    getInputById("#insulinSplitNow").on("input", function (event) {
      const nowVal = parseInt($("#insulinSplit").val()?.toString() ?? "0");
      $("#insulinSplitNow").val(nowVal);
      $("#insulinSplitExt").val(100 - nowVal);
      that.maybePrevent(event);
    });
    getInputById("#insulinSplitExt").on("input", function (event) {
      const nowVal = parseInt($("#insulinSplit").val()?.toString() ?? "0");
      $("#insulinSplitNow").val(100 - nowVal);
      $("#insulinSplitExt").val(nowVal);
      that.maybePrevent(event);
    });
  }

  /** @param {PluginEventType['val']} value */
  resolveEventName(value) {
    return this.events.find((e) => e.val === value)?.name;
  }

  prepare() {
    const $ = this.$;
    this.#refreshEventTypes();

    $("#profile")
      .empty()
      .append(
        ...this.client.profilefunctions
          .listBasalProfiles()
          .map(
            /** @param {string} p */ (p) => `<option val="${p}">${p}</option>`
          )
      );

    this.prepareEvents();

    this.$("#eventType").val("<none>");
    this.$("#glucoseValue")
      .val("")
      .attr(
        "placeholder",
        `${this.translate("Value in")} ${this.client.settings.units}`
      );
    $("#meter").prop("checked", true);

    $("#otp").val("");
    $("#remoteCarbs").val("");
    $("#remoteAbsorption").val("");
    $("#remoteBolus").val("");

    $("#carbsGiven").val("");
    $("#proteinGiven").val("");
    $("#fatGiven").val("");
    $("#sensorCode").val("");
    $("#transmitterId").val("");
    $("#insulinGiven").val("");
    $("#duration").val("");
    $("#percent").val("");
    $("#absolute").val("");
    $("#profile").val(this.client.profilefunctions.activeProfileToTime());
    $("#preBolus").val(0);
    $("#notes").val("");
    $("#enteredBy").val(
      this.client.authorized.sub ?? this.storage.get("enteredBy") ?? ""
    );
    $("#nowtime").prop("checked", true);

    this.#setDateAndTime();
  }

  gatherData() {
    const $ = this.$;
    const eventType = $("#eventType").val()?.toString() ?? "";
    const selectedReason = $("#reason").val();

    const duration =
      parse_duration($("#duration").val()?.toString() ?? "") ?? NaN;

    const glucoseType = $("#treatment-form")
      .find("input[name=glucoseType]:checked")
      .val()
      ?.toString();
    /** @satisfies {{[K in keyof PluginEventType]?: string | number} & Record<string, any>}} */
    const data = {
      enteredBy: $("#enteredBy").val()?.toString(),
      eventType: eventType,
      otp: $("#otp").val()?.toString(),
      remoteCarbs: $("#remoteCarbs").val()?.toString(),
      remoteAbsorption: $("#remoteAbsorption").val()?.toString(),
      remoteBolus: $("#remoteBolus").val()?.toString(),
      glucose: $("#glucoseValue").val()?.toString().replace(",", "."),
      reason: selectedReason,
      /** @type {"" | number | undefined} */
      targetTop: parseFloat(
        $("#targetTop").val()?.toString().replace(",", ".") ?? ""
      ),
      /** @type {"" | number | undefined} */
      targetBottom: parseFloat(
        $("#targetBottom").val()?.toString().replace(",", ".") ?? ""
      ),
      /** @type {"Sensor" | "Finger" | undefined} */
      glucoseType:
        ((glucoseType === "Sensor" || glucoseType === "Finger") &&
          glucoseType) ||
        undefined,
      carbs: $("#carbsGiven").val()?.toString(),
      protein: $("#proteinGiven").val()?.toString(),
      fat: $("#fatGiven").val()?.toString(),
      sensorCode: $("#sensorCode").val(),
      transmitterId: $("#transmitterId").val(),
      insulin: parseFloat($("#insulinGiven").val()?.toString() ?? ""),
      /** @type {string | number | undefined} */
      duration:
        times.msecs(duration).mins < 1
          ? $("#duration").val()?.toString()
          : times.msecs(duration).mins,
      percent: $("#percent").val()?.toString(),
      profile: $("#profile").val()?.toString(),
      /** @type {number | undefined} */
      preBolus: parseInt($("#preBolus").val()?.toString() ?? ""),
      notes: $("#notes").val(),
      units: this.client.settings.units,

      /** @type {string | undefined} */
      reasonDisplay: undefined,
      /** @type {number | undefined} */
      absolute: undefined,
      /** @type {Date | undefined} */
      eventTime: undefined,
      /** @type {string | undefined} */
      created_at: undefined,
      /** @type {number | undefined} */
      splitNow: undefined,
      /** @type {number | undefined} */
      splitExt: undefined,
    };

    if (isNaN(data.preBolus)) {
      delete data.preBolus;
    }

    /** @type {Exclude<PluginEventType['reasons'], undefined>} */
    let reasons = [];

    // validate the eventType input before getting the reasons list
    if (eventType in this.inputMatrix) {
      reasons = this.inputMatrix[eventType].reasons ?? [];
    }

    const reason = reasons.find((r) => r.name === selectedReason);
    if (reason) data.reasonDisplay = reason.displayName;

    if (this.units === "mmol") {
      if (data.targetTop) {
        data.targetTop = data.targetTop * consts.MMOL_TO_MGDL;
      }
      if (data.targetBottom) {
        data.targetBottom = data.targetBottom * consts.MMOL_TO_MGDL;
      }
    }

    //special handling for absolute to support temp to 0
    const absolute = $("#absolute").val()?.toString();
    if (!isNaN(absolute)) {
      data.absolute = Number(absolute);
    }

    if ($("#othertime").is(":checked")) {
      data.eventTime = this.mergeDateAndTime().toDate();
    }
    data.created_at = !isNaN(data.eventTime)
      ? data.eventTime.toISOString()
      : new Date().toISOString();

    if (!this.inputMatrix[data.eventType]?.profile) {
      delete data.profile;
    }

    if (data.eventType.indexOf("Temp Basal") > -1) {
      data.eventType = "Temp Basal";
    }

    if (data.eventType.indexOf("Temporary Target Cancel") > -1) {
      data.duration = 0;
      data.eventType = "Temporary Target";
      data.targetBottom = "";
      data.targetTop = "";
    }

    if (data.eventType.indexOf("Combo Bolus") > -1) {
      data.splitNow =
        parseInt($("#insulinSplitNow").val()?.toString() ?? "") || 0;
      data.splitExt =
        parseInt($("#insulinSplitExt").val()?.toString() ?? "") || 0;
    }

    return /** @type {{[K in keyof typeof data]: Exclude<(typeof data)[K], null | "">}} */ (
      Object.fromEntries(
        Object.entries(data).filter(([_, v]) => v !== "" && v !== null)
      )
    );
  }

  /**
   * @param {ReturnType<Careportal['gatherData']>} data
   */
  validateData(data) {
    console.log("Validating careportal entry: ", data.eventType);

    if (data.duration === 0 || data.eventType !== "Temporary Target")
      return { allOk: true, messages: [] };

    if (
      isNaN(data.targetTop) ||
      isNaN(data.targetBottom) ||
      !data.targetBottom ||
      !data.targetTop
    ) {
      console.log("Bottom or Top target missing");
      return {
        allOk: false,
        messages: [
          "Please enter a valid value for both top and bottom target to save a Temporary Target",
        ],
      };
    }

    const targetTop =
      this.units === "mmol"
        ? Math.round((data.targetTop / consts.MMOL_TO_MGDL) * 10) / 10
        : data.targetTop;
    const targetBottom =
      this.units === "mmol"
        ? Math.round((data.targetBottom / consts.MMOL_TO_MGDL) * 10) / 10
        : data.targetBottom;

    const minTarget = this.units === "mmol" ? 4 : 4 * consts.MMOL_TO_MGDL;
    const maxTarget = this.units === "mmol" ? 18 : 18 * consts.MMOL_TO_MGDL;

    let allOk = true;
    const messages = [];

    if (targetTop > maxTarget) {
      allOk = false;
      messages.push("Temporary target high is too high");
    }

    if (targetBottom < minTarget) {
      allOk = false;
      messages.push("Temporary target low is too low");
    }

    if (targetTop < targetBottom || targetBottom > targetTop) {
      allOk = false;
      messages.push(
        "The low target must be lower than the high target and high target must be higher than the low target."
      );
    }

    // TODO: add check for remote (Bolus, Carbs, Absorption)

    return {
      allOk,
      messages,
    };
  }

  /** @param {ReturnType<Careportal['gatherData']>} data */
  buildConfirmText(data) {
    const translate = this.translate;
    const eventName = this.resolveEventName(data.eventType);
    const text = [
      translate("Please verify that the data entered is correct") + ": ",
      translate("Event Type") +
        ": " +
        ((eventName && translate(eventName)) ?? ""),
    ];

    /** @param {boolean} check @param {string} valueText */
    function pushIf(check, valueText) {
      if (check) text.push(valueText);
    }

    if (data.duration === 0 && data.eventType === "Temporary Target") {
      text[text.length - 1] += " " + translate("Cancel");
    }

    pushIf(
      !!data.remoteCarbs,
      translate("Remote Carbs") + ": " + data.remoteCarbs
    );
    pushIf(
      !!data.remoteAbsorption,
      translate("Remote Absorption") + ": " + data.remoteAbsorption
    );
    pushIf(
      !!data.remoteBolus,
      translate("Remote Bolus") + ": " + data.remoteBolus
    );
    pushIf(!!data.otp, translate("One Time Password") + ": " + data.otp);

    pushIf(!!data.glucose, translate("Blood Glucose") + ": " + data.glucose);
    pushIf(
      !!data.glucose,
      translate("Measurement Method") +
        ": " +
        translate(data.glucoseType ?? "None")
    );

    pushIf(!!data.reason, translate("Reason") + ": " + data.reason);

    const targetTop = data.targetTop
      ? this.units === "mmol"
        ? Math.round((data.targetTop / consts.MMOL_TO_MGDL) * 10) / 10
        : data.targetTop
      : NaN;
    const targetBottom = data.targetBottom
      ? this.units === "mmol"
        ? Math.round((data.targetBottom / consts.MMOL_TO_MGDL) * 10) / 10
        : data.targetBottom
      : NaN;

    pushIf(!!data.targetTop, translate("Target Top") + ": " + targetTop);
    pushIf(
      !!data.targetBottom,
      translate("Target Bottom") + ": " + targetBottom
    );

    pushIf(!!data.carbs, translate("Carbs Given") + ": " + data.carbs);
    pushIf(!!data.protein, translate("Protein Given") + ": " + data.protein);
    pushIf(!!data.fat, translate("Fat Given") + ": " + data.fat);
    pushIf(
      !!data.sensorCode,
      translate("Sensor Code") + ": " + data.sensorCode
    );
    pushIf(
      !!data.transmitterId,
      translate("Transmitter ID") + ": " + data.transmitterId
    );
    pushIf(!!data.insulin, translate("Insulin Given") + ": " + data.insulin.toFixed(2));
    pushIf(
      data.eventType === "Combo Bolus",
      translate("Combo Bolus") +
        ": " +
        data.splitNow +
        "% : " +
        data.splitExt +
        "%"
    );
    pushIf(
      !!data.duration,
      translate("Duration") + ": " + data.duration + " " + translate("mins")
    );
    pushIf(!!data.percent, translate("Percent") + ": " + data.percent);
    pushIf("absolute" in data, translate("Basal value") + ": " + data.absolute);
    pushIf(!!data.profile, translate("Profile") + ": " + data.profile);
    pushIf(
      !!data.preBolus,
      translate("Carb Time") + ": " + data.preBolus + " " + translate("mins")
    );
    pushIf(!!data.notes, translate("Notes") + ": " + data.notes);
    pushIf(!!data.enteredBy, translate("Entered By") + ": " + data.enteredBy);

    text.push(
      translate("Event Time") +
        ": " +
        (data.eventTime
          ? data.eventTime.toLocaleString()
          : new Date().toLocaleString())
    );
    return text.join("\n");
  }

  /** @param {ReturnType<Careportal['gatherData']>} data */
  confirmPost(data) {
    const validation = this.validateData(data);

    if (!validation.allOk) {
      const messages = validation.messages.reduce((acc, m) => {
        return acc + m + "\n";
      }, "");

      window.alert(messages);
    } else {
      if (window.confirm(this.buildConfirmText(data))) {
        const submitHook = this.submitHooks[data.eventType];
        if (submitHook) {
          submitHook(this.client, data, (error) => {
            if (error) {
              console.log("submit error = ", error);
              alert(this.translate("Error") + ": " + error);
            } else {
              this.client.browserUtils.closeDrawer("#treatmentDrawer");
            }
          });
        } else {
          this.postTreatment(data);
        }
      }
    }
  }

  /** @param {ReturnType<Careportal['gatherData']> & {insulin?: number; enteredinsulin?: number; relative?: number}} data */
  postTreatment(data) {
    if (data.eventType === "Combo Bolus") {
      data.enteredinsulin = data.insulin;
      data.insulin = (data.enteredinsulin * (data.splitNow ?? NaN)) / 100;
      data.relative =
        ((data.enteredinsulin * (data.splitExt ?? NaN)) /
          100 /
          parseFloat(data.duration?.toString() ?? "")) *
        60;
    }

    $.ajax({
      method: "POST",
      url: "/api/v1/treatments/",
      headers: this.client.headers(),
      data,
    })
      .done((response) => {
        console.info("treatment saved", response);
      })
      .fail((response) => {
        console.info("treatment saved", response);
        alert(
          this.translate("Entering record failed") +
            ". " +
            this.translate("Status") +
            ": " +
            response.status
        );
      });

    this.storage.set("enteredBy", data.enteredBy ?? null);

    this.client.browserUtils.closeDrawer("#treatmentDrawer");
  }

  /** @param {JQuery.Event} event  */
  eventTimeTypeChange(event) {
    if ($("#othertime").is(":checked")) {
      this.eventTime.trigger("focus");
    } else {
      this.#setDateAndTime();
    }
    this.maybePrevent(event);
  }

  /** @param {JQuery.Event} event */
  dateTimeChange(event) {
    $("#othertime").prop("checked", true);

    // body of this function removed in c1de8a5d8

    this.maybePrevent(event);
  }

  /** @param {JQuery.Event} event */
  save(event) {
    const data = this.gatherData();
    this.confirmPost(data);
    this.maybePrevent(event);
  }
}

/** @param {ConstructorParameters<typeof Careportal>} args */
module.exports = (...args) => new Careportal(...args);
