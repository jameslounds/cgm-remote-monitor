"use strict";

const times = require("../times");
const Storages = require("js-storage");

/**
 * @typedef Client
 * @prop {ReturnType<import("../language")>['translate']} translate
 * @prop {ReturnType<import("../plugins")>} plugins
 * @prop {ReturnType<import("../settings")>} settings
 * @prop {ReturnType<import("../utils")>} utils
 * @prop {ReturnType<import("../profilefunctions")>} profilefunctions
 * @prop {ReturnType<import("../sandbox")>} sbx
 * @prop {ReturnType<import("./browser-utils")>} browserUtils
 * @prop {() => Record<string, string>} headers
 * @prop {import("../types").Entry[]} entries
 */

class BolusCalc {
  static icon_remove =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAACrElEQVQ4T42Ty2sTQRzHv5tmk2yyjRNtpfZhL8V6s2KoUNC2XqwgaCsVQcGiFqpHi0c9iRdR/ANE9KR40FIQX4cueKoPaKFoLdSYNtE0abKT1+5s9iW7aUMiHtzTzO7v85md+c6PA4DrHbsPCKIgOWO1pA7dT6YXnXH949SE/F63pqwZtRrO+SCKgjQ5NUV+azpmHj2krMwaJC4c8Erj+/eRyloMMwWFKgbn1nC3ervlK1evkXBLGBZT8SOewotnTylTNLdgeg/pDgZDC2cPHSR8bB22DVC9hFe0SG/H0xFXcHlykjRHRDBWgJcZSCY38Xx2lhqMnRYE34Px/sN9vlQWeoHBAx2yXsRruVAVuFsIBaSJ8+eJGPaBqQV4NROJjTzez89jLBoFn6FgybQL54wS3uTyVDFQ3cL2IYpBv3RhdJSIIQ80tQyv7gEqJvS8AmUlBs7UXPhtjtZgh3UFNYngk86NHCfNAg9dMwHVBPu+CpsVkTXKeJeVG+AGgTOZ3tt6MSKKjy+NjEBjFrR4ElZmA4pdxstMFsyyJu6tZZ7Ux9vwB6EAL50ZGiRECEPPUOixVTRxHlicgSVWxEdZpuZWfNuS2hk48NjwMIkIYZglBnV5Cbqtws/5IaAJmsfCglrEl2y2QeKmEBJ80tixKmxrFpSVr0gV0viQoxho2YUuPohmeFD22PiklLC4ma5JuBvdrfLJI0dJd0s7bM0ES8aR/BXDXGaTskqlL+D3Lwy0tZEePoAd4EA5YF4tYymdonfjmQh3s6dTPjU4SHYGwjAKecSXFyGlM1TdytntE56T+ts7SC/vhw3gm6njc2Kd3vm5Ub1IwQAvnYhGiZpYw1wiWYPrIw7wnBTt7CLOOwdmut14kQQvqt24tfK/utGR6LaF+iRqMf4N/O/8D28HiiCRYqzAAAAAAElFTkSuQmCC";
  /**
   *
   * @param {Client} client
   * @param {JQueryStatic} $
   */
  constructor(client, $) {
    this.client = client;
    this.$ = $;

    /** @type {ReturnType<import("../language")>['translate']} */
    this.translate = this.client.translate;
    this.storage = Storages.localStorage;

    this.iob = this.client.plugins("iob");
    this.cob = this.client.plugins("cob");

    this.eventTime = this.$("#bc_eventTimeValue");
    this.eventDate = this.$("#bc_eventDateValue");

    /** @type {import("../types").QuickPick[]} */
    this.quickpicks = [];
    /** @type {import("../types").Food[]} */
    this.foods = [];

    /** @type {ReturnType<BolusCalc["gatherBoluscalcData"]>} */
    this.record;

    /** @type {Partial<Record<string, Record<string, boolean>>>} */
    this.categories = {};
    /** @type {import("../types").Food[]} */
    this.foodlist = [];
    this.databaseloaded = false;
    this.filter = {
      category: "",
      subcategory: "",
      name: "",
    };

    if (this.#isTouch()) {
      // Make it faster on mobile devices
      this.$(".insulincalculationpart").on("change", (ev) =>
        this.calculateInsulin(ev)
      );
    } else {
      this.$(".insulincalculationpart").on("input", (ev) =>
        this.calculateInsulin(ev)
      );
      this.$("input:checkbox.insulincalculationpart").on("change", (ev) =>
        this.calculateInsulin(ev)
      );
    }

    this.$("#bc_bgfrommeter").on("change", (ev) => this.calculateInsulin(ev));
    this.$("#bc_addfromdatabase").on("click", (ev) =>
      this.#addFoodFromDatabase(ev)
    );
    this.$("#bc_bgfromsensor").on("change", (event) => {
      this.updateVisualisations(this.client.sbx);
      this.calculateInsulin();
      this.#maybePrevent(event);
    });

    this.$("#boluscalcDrawerToggle").on("click", (ev) => this.toggleDrawer(ev));
    this.$("#boluscalcDrawer")
      .find("button")
      .on("click", (ev) => this.submit(ev));
    this.$("#bc_eventTime input:radio").on("change", (ev) =>
      this.eventTimeTypeChange(ev)
    );

    $(".bc_eventtimeinput")
      .on("focus", (ev) => this.dateTimeFocus(ev))
      .on("change", (ev) => this.dateTimeChange(ev));

    this.loadFoodQuickpicks();
    this.#setDateAndTime();
  }

  /** @param {number | undefined} x @param {number} step */
  #roundTo(x, step) {
    if (x) return Math.round(x / step) * step;
    return 0;
  }

  /** @param {JQuery.Event | Event} [event] */
  #maybePrevent(event) {
    if (event) event.preventDefault();
  }

  /** @param {string[]} profiles */
  #isProfileEnabled(profiles) {
    return (
      this.client.settings.enable.includes("profile") &&
      this.client.settings.extendedSettings.profile?.multiple &&
      profiles.length > 1
    );
  }

  #isTouch() {
    try {
      document.createEvent("TouchEvent");
      return true;
    } catch {
      return false;
    }
  }

  /** @param {Date} time */
  #setDateAndTime(time = new Date()) {
    this.eventTime.val(`${time.getHours()}:${time.getMinutes()}`);
    this.eventDate.val(time.toISOString().split("T")[0]);
  }

  #mergeDateAndTime() {
    return this.client.utils.mergeInputTime(
      this.eventTime.val()?.toString() ?? "",
      this.eventDate.val()?.toString() ?? ""
    );
  }

  /** @param {JQuery<HTMLElement>} el @param {import("moment").Moment} time */
  #updateTime(el, time) {
    el.attr("oldminutes", time.minutes());
    el.attr("oldhours", time.hours());
  }

  /** @param {import("../types").Sgv} sgv @param {Date} selectedTime */
  #getBG(sgv, selectedTime) {
    if (selectedTime.getTime() - sgv.mills > 10 * 60_000) {
      this.oldbg = true; // Do not use if record is older than 10 min
      return 0;
    }

    if (sgv.mgdl < 39) return 0;
    else return this.client.utils.scaleMgdl(sgv.mgdl);
  }

  /** @param {import("../types").Sgv | null | undefined} sgv @param {Date} selectedTime */
  #setBG(sgv, selectedTime) {
    this.oldbg = false;

    if (this.$("#bc_bgfromsensor").is(":checked")) {
      this.$("#bc_bg").val(sgv ? this.#getBG(sgv, selectedTime) : "");
    }
  }

  /** @param {ReturnType<import("../sandbox")>} sbx */
  updateVisualisations(sbx) {
    // update BG in GUI
    this.#setBG(sbx.lastSGVEntry(), this.#mergeDateAndTime().toDate());

    if (this.client.browserUtils.lastOpenedDrawer !== "#boluscalcDrawer") {
      return;
    }
    if (this.$("#bc_nowtime").is(":checked")) {
      // Update time
      this.#setDateAndTime();

      this.calculateInsulin();
    }
  }

  /** @param {JQuery.FocusEvent} event */
  dateTimeFocus(event) {
    $("#bc_othertime").prop("checked", true);
    this.#updateTime($(event.currentTarget), this.#mergeDateAndTime());
    this.#maybePrevent(event);
  }

  /** @param {JQuery.ChangeEvent} event */
  dateTimeChange(event) {
    $("#bc_othertime").prop("checked", true);
    //    client.utils.setYAxisOffset(50); //50% of extend
    const el = $(event.currentTarget);
    const merged = this.#mergeDateAndTime();

    if (el.attr("oldminutes") === "59" && merged.minutes() === 0) {
      merged.add(1, "hours");
    }
    if (el.attr("oldminutes") === "0" && merged.minutes() === 59) {
      merged.add(-1, "hours");
    }

    this.#setDateAndTime(merged.toDate());
    this.#updateTime(el, merged);
    this.eventTimeTypeChange();

    // update BG from sgv to this time
    this.#setBG(
      this.#findClosestSGVToPastTime(merged.toDate()),
      merged.toDate()
    );

    this.calculateInsulin();
    this.#maybePrevent(event);
  }

  /** @param {JQuery.Event} [event] */
  eventTimeTypeChange(event) {
    if (this.$("#bc_othertime").is(":checked")) {
      this.$("#bc_eventTimeValue").trigger("focus");
      $("#bc_retro").css("display", "");

      if (this.#mergeDateAndTime().valueOf() < Date.now()) {
        $("#bc_retro")
          .css("background-color", "red")
          .text(this.translate("RETRO MODE"));
      } else if (this.#mergeDateAndTime().valueOf() > Date.now()) {
        $("#bc_retro")
          .css("background-color", "blue")
          .text(this.translate("IN THE FUTURE"));
      } else {
        $("#bc_retro").css("display", "none");
      }
    } else {
      $("#bc_retro").css("display", "none");

      this.#setDateAndTime();
      this.updateVisualisations(this.client.sbx);

      if (event) {
        this.calculateInsulin();
      }
      //        Nightscout.utils.setYAxisOffset(50); //50% of extend
      //        Nightscout.utils.updateBrushToTime(Nightscout.utils.mergeInputTime($('#bc_eventTimeValue').val(), $('#bc_eventDateValue').val()).toDate());
    }

    this.#maybePrevent(event);
  }

  /** @param {JQuery.Event} [event] */
  toggleDrawer(event) {
    this.prepare();
    this.client.browserUtils.toggleDrawer("#boluscalcDrawer");
    this.#maybePrevent(event);
  }

  prepare() {
    this.foods = [];

    $("#bc_profile").empty();
    const profiles = this.client.profilefunctions.listBasalProfiles() ?? [];
    profiles.forEach((p) => {
      $("#bc_profile").append(`<option val="${p}">${p}</option>`);
    });
    $("#bc_profileLabel").toggle(this.#isProfileEnabled(profiles));

    $("#bc_usebg").prop("checked", "checked");
    $("#bc_usecarbs").prop("checked", "checked");
    $("#bc_usecob").prop("checked", "");
    $("#bc_useiob").prop("checked", "checked");
    $("#bc_bgfromsensor").prop("checked", "checked");
    $("#bc_carbs").val("");
    $("#bc_quickpick").val(-1);
    $("#bc_preBolus").val(0);
    $("#bc_notes").val("");
    $("#bc_enteredBy").val(this.storage.get("enteredBy")?.toString() ?? "");
    $("#bc_nowtime").prop("checked", true);
    $("#bc_othercorrection").val(0);
    $("#bc_profile").val(this.client.profilefunctions.activeProfileToTime());

    this.#setDateAndTime();
    this.eventTimeTypeChange();
    this.updateVisualisations(this.client.sbx);
    this.calculateInsulin();
  }

  /** @param {JQuery.Event} [event] */
  calculateInsulin(event) {
    this.#maybePrevent(event);
    this.gatherBoluscalcData();
    this.updateGui(this.record);
    return this.record;
  }

  updateGui(record = this.record) {
    if (!record || record.eventTime === undefined) return;

    const $ = this.$;

    const targetBGLow = record.targetBGLow;
    const targetBGHigh = record.targetBGHigh;
    const isf = record.isf;
    const ic = record.ic;

    // Clear results before calculation
    $("#bc_insulintotal").text("0.00");
    $("#bc_carbsneeded").text("0.00");
    $("#bc_inzulinbg").text("0.00");
    $("#bc_inzulincarbs").text("0.00");

    // Show IOB
    if ($("#bc_useiob").is(":checked")) {
      $("#bc_iob").text((record.iob > 0 ? "-" : "") + record.iob.toFixed(2));
    } else {
      $("#bc_iob").text("");
    }

    // Show COB
    if ($("#bc_usecob").is(":checked")) {
      $("#bc_cob").text(record.cob.toFixed(2));
      $("#bc_cobu").text(record.insulincob.toFixed(2));
    } else {
      $("#bc_cob").text("");
      $("#bc_cobu").text("");
    }

    // Show BG
    if ($("#bc_usebg").is(":checked")) {
      if (
        record.bg === 0 ||
        (this.oldbg && $("#bc_bgfromsensor").is(":checked"))
      ) {
        $("#bc_bg").css("background-color", "red");
      } else {
        $("#bc_bg").css("background-color", "");
      }
      $("#bc_inzulinbg").text(record.insulinbg.toFixed(2));
      $("#bc_inzulinbg").attr(
        "title",
        `Target BG range: ${targetBGLow} - ${targetBGHigh}
        ISF: ${isf}
        BG diff: ${record.bgdiff.toFixed(1)}`
      );
    } else {
      $("#bc_inzulinbgtd").css("background-color", "");
      $("#bc_bg").css("background-color", "");
      $("#bc_inzulinbg").text("");
      $("#bc_inzulinbg").attr("title", "");
    }

    // Show foods
    if (record.foods.length) {
      var html = '<table style="float:right;margin-right:20px;font-size:12px">';
      var carbs = 0;
      record.foods.forEach((f, index) => {
        carbs += f.carbs * f.portions;

        html += "<tr>";

        html += "<td>";
        if (Number($("#bc_quickpick").val()) < 0) {
          // do not allow deleting while quickpick active
          html += `
          <img
            style="cursor:pointer"
            title="Delete record"
            src="${BolusCalc.icon_remove}"
            href="#"
            class="deleteFoodRecord"
            index="${index}"
          />`;
        }
        html += "</td>";
        html += "<td>" + f.name + "</td>";
        html += `<td>${(f.portion * f.portions).toFixed(1)} ${this.translate(f.unit)}</td>`;
        html += `<td>(${(f.carbs * f.portions).toFixed(1)} g)</td>`;

        html += "</tr>";
      });

      html += "</table>";

      $("#bc_food").html(html);
      $(".deleteFoodRecord").on("click", (ev) => this.#deleteFoodRecord(ev));
      $("#bc_carbs").val(carbs.toFixed(0));
      $("#bc_carbs").attr("disabled", "true");
      $("#bc_gi").css("display", "none");
      $("#bc_gicalculated").css("display", "");
      $("#bc_gicalculated").text(record.gi?.toString());
    } else {
      $("#bc_food").html("");
      $("#bc_carbs").attr("disabled", false);
      $("#bc_gi").css("display", "");
      $("#bc_gicalculated").css("display", "none");
      $("#bc_gicalculated").text("");
    }

    // Show Carbs
    if ($("#bc_usecarbs").is(":checked")) {
      if ($("#bc_carbs").val() === "") {
        $("#bc_carbs").css("background-color", "");
      } else if (
        isNaN($("#bc_carbs").val()?.toString()?.replace(",", ".") ?? "")
      ) {
        $("#bc_carbs").css("background-color", "red");
      } else {
        $("#bc_carbs").css("background-color", "");
      }
      $("#bc_inzulincarbs").text(record.insulincarbs.toFixed(2));
      $("#bc_inzulincarbs").attr("title", "IC: " + ic);
    } else {
      $("#bc_carbs").css("background-color", "");
      $("#bc_inzulincarbs").text("");
      $("#bc_inzulincarbs").attr("title", "");
      $("#bc_carbs").text("");
    }

    // Show Total
    $("#bc_rouding").text(record.roundingcorrection.toFixed(2));
    $("#bc_insulintotal").text(record.insulin.toFixed(2));

    // Carbs needed if too much iob or in range message when nothing entered and in range
    var outcome = record.bg - record.iob * isf;
    if (
      record.othercorrection === 0 &&
      record.carbs === 0 &&
      record.cob === 0 &&
      record.bg > 0 &&
      outcome > targetBGLow &&
      outcome < targetBGHigh
    ) {
      $("#bc_carbsneeded").text("");
      $("#bc_insulinover").text("");
      $("#bc_carbsneededtr").css("display", "none");
      $("#bc_insulinneededtr").css("display", "none");
      $("#bc_calculationintarget").css("display", "");
    } else if (record.insulin < 0) {
      $("#bc_carbsneeded").text(record.carbsneeded + " g");
      $("#bc_insulinover").text(record.insulin.toFixed(2));
      $("#bc_carbsneededtr").css("display", "");
      $("#bc_insulinneededtr").css("display", "none");
      $("#bc_calculationintarget").css("display", "none");
    } else {
      $("#bc_carbsneeded").text("");
      $("#bc_insulinover").text("");
      $("#bc_carbsneededtr").css("display", "none");
      $("#bc_insulinneededtr").css("display", "");
      $("#bc_calculationintarget").css("display", "none");
    }

    // Show basal rate
    const basal = this.client.sbx.data.profile?.getTempBasal(
      record.eventTime.valueOf(),
      ""
    );
    if (basal) {
      let tempMark = "";
      tempMark += basal.treatment ? "T" : "";
      tempMark += basal.combobolustreatment ? "C" : "";
      tempMark += tempMark ? ": " : "";
      $("#bc_basal").text(tempMark + basal.totalbasal.toFixed(3));
    }
  }

  gatherBoluscalcData() {
    const $ = this.$;
    this.record = undefined;

    if (!this.client.sbx) {
      console.log("No sandbox data yet. Exiting gatherBoluscalcData()");
      return;
    }

    const profile = $("#bc_profile").val()?.toString();
    if (!profile || !this.client.sbx.data.profile) {
      console.log("No profile data. Exiting gatherBoluscalcData()");
      return;
    }

    // Calculate event time from date & time
    const eventTime = $("#bc_othertime").is(":checked")
      ? this.#mergeDateAndTime().toDate()
      : new Date();
    const eventMills = eventTime.valueOf();

    // Load profile
    const targetBGLow =
      this.client.sbx.data.profile.getLowBGTarget(eventMills, profile) ?? 0;
    const targetBGHigh =
      this.client.sbx.data.profile.getHighBGTarget(eventMills, profile) ?? 0;
    const isf =
      this.client.sbx.data.profile.getSensitivity(eventMills, profile) ?? 0;
    const ic =
      this.client.sbx.data.profile.getCarbRatio(eventMills, profile) ?? 0;

    if (targetBGLow === 0 || targetBGHigh === 0 || isf === 0 || ic === 0) {
      $("#bc_inzulinbgtd").css("background-color", "red");
      return;
    }
    $("#bc_inzulinbgtd").css("background-color", "");
    $("#bc_inzulincarbstd").css("background-color", "");

    // Load IOB
    const iob = $("#bc_useiob").is(":checked")
      ? this.#roundTo(
          this.iob.calcTotal(
            this.client.sbx.data.treatments,
            this.client.sbx.data.devicestatus,
            this.client.sbx.data.profile,
            eventTime,
            profile
          ).iob,
          0.01
        )
      : 0;

    // Load COB
    const cob = $("#bc_usecob").is(":checked")
      ? this.#roundTo(
          this.cob.cobTotal(
            this.client.sbx.data.treatments,
            this.client.sbx.data.devicestatus,
            this.client.sbx.data.profile,
            eventTime,
            profile
          ).cob,
          0.01
        )
      : 0;
    const insulincob = $("#bc_usecob").is(":checked")
      ? this.#roundTo(cob / ic, 0.01)
      : 0;

    // Load BG
    const bg = $("#bc_usebg").is(":checked")
      ? parseFloat($("#bc_bg").val()?.toString().replace(",", ".") ?? "") || 0
      : 0;

    const bgdiff = this.#roundTo(
      bg <= targetBGLow
        ? bg - targetBGLow
        : bg >= targetBGHigh
          ? bg - targetBGHigh
          : 0,
      0.1
    );
    const insulinbg = this.#roundTo(bgdiff / isf, 0.01);

    // Load foods
    const foods = structuredClone(this.foods);
    let { carbs, gisum } = foods.reduce(
      (acc, food) => ({
        carbs: acc.carbs + food.carbs * food.portions,
        gisum: acc.gisum + food.carbs * food.portions * food.gi,
      }),
      { gisum: 0, carbs: 0 }
    );
    const gi = foods.length ? (gisum / carbs).toFixed(2) : $("#bc_gi").val();

    // Load Carbs
    if ($("#bc_usecarbs").is(":checked")) {
      if (carbs === 0) {
        // not set from foods
        carbs =
          parseInt($("#bc_carbs").val()?.toString().replace(",", ".") ?? "") ||
          0;
      }
    }
    const insulincarbs = $("#bc_usecarbs").is(":checked")
      ? this.#roundTo(carbs / ic, 0.01)
      : 0;

    // Corrections
    const othercorrection = parseFloat(
      $("#bc_othercorrection").val()?.toString() ?? ""
    );

    // Total & rounding
    const total = $("#bc_usecarbs").is(":checked")
      ? insulinbg + insulincarbs + insulincob - iob + othercorrection
      : 0;

    const insulin = this.#roundTo(total, 0.05);
    const roundingcorrection = insulin - total;

    // Carbs needed if too much iob
    const carbsneeded = insulin < 0 ? Math.ceil(-total * ic) : 0;

    const record = {
      profile,
      eventTime,
      targetBGLow,
      targetBGHigh,
      isf,
      ic,
      iob,
      cob,
      insulincob,
      bg,
      insulinbg,
      bgdiff,
      carbs,
      foods,
      gi,
      insulincarbs,
      othercorrection,
      insulin,
      roundingcorrection,
      carbsneeded,
    };
    console.log("Insulin calculation result: ", record);
    this.record = record;
    return record;
  }

  /** @protected */
  gatherData() {
    const boluscalc = this.calculateInsulin();
    if (!boluscalc) {
      alert("Calculation not completed!");
      return null;
    }

    const $ = this.$;

    return {
      boluscalc: { ...boluscalc, eventTime: boluscalc.eventTime.toISOString() },
      enteredBy: $("#bc_enteredBy").val(),
      eventType: /** @type {const} */ ("Bolus Wizard"),
      ...($("#bc_bg").val() !== 0 && {
        glucose: $("#bc_bg").val()?.toString().replace(",", "."),
        glucoseType: /** @type {"Sensor" | "Finger" | "Manual"} */ (
          $("#boluscalc-form").find("input[name=bc_bginput]:checked").val()
        ),
        units: this.client.settings.units,
      }),
      carbs: $("#bc_carbs").val()?.toString().replace(",", "."),
      insulin: Number($("#bc_insulintotal").text()),
      preBolus: parseInt($("#bc_preBolus").val()?.toString() ?? ""),
      notes: $("#bc_notes").val(),
      ...($("#bc_othertime").is(":checked") && {
        eventTime: this.#mergeDateAndTime().toDate(),
      }),
    };
  }

  /** @param {JQuery.ClickEvent} event */
  submit(event) {
    const data = this.gatherData();
    if (data) {
      this.#confirmPost(data);
    }
    this.#maybePrevent(event);
    return false;
  }

  /** @param {Exclude<ReturnType<BolusCalc["gatherData"]>, null>} data */
  #buildConfirmText(data) {
    const text = [
      this.translate("Please verify that the data entered is correct") + ": ",
      this.translate("Event Type") + ": " + this.translate(data.eventType),
    ];

    /** @param {boolean} check, @param {string} valueText */
    function pushIf(check, valueText) {
      if (check) text.push(valueText);
    }

    pushIf(
      !!data.glucose,
      `${this.translate("Blood Glucose")}: ${data.glucose}`
    );
    pushIf(
      !!data.glucoseType,
      `${this.translate("Measurement Method")}: ${this.translate(data.glucoseType ?? "(none)")}`
    );
    pushIf(!!data.carbs, `${this.translate("Carbs Given")}: ${data.carbs}`);
    pushIf(
      !!data.insulin,
      `${this.translate("Insulin Given")}: ${data.insulin}`
    );
    pushIf(
      !!data.boluscalc.othercorrection,
      `${this.translate("Other correction")}: ${data.boluscalc.othercorrection}`
    );
    pushIf(
      !!data.preBolus,
      `${this.translate("Carb Time")}: ${data.preBolus} ${this.translate("mins")}`
    );
    pushIf(!!data.notes, `${this.translate("Notes")}: ${data.notes}`);
    pushIf(
      !!data.enteredBy,
      `${this.translate("Entered By")}: ${data.enteredBy}`
    );

    text.push(
      `${this.translate("Event Time")}: ${(data.eventTime ?? new Date()).toLocaleString()}`
    );

    return text.join("\n");
  }

  /** @param {Exclude<ReturnType<BolusCalc["gatherData"]>, null>} data */
  #confirmPost(data) {
    if (!window.confirm(this.#buildConfirmText(data))) return;

    this.$.ajax({
      method: "POST",
      url: "/api/v1/treatments/",
      headers: this.client.headers(),
      data: data,
    })
      .done((response) => {
        console.info("treatment saved", response);
      })
      .fail((response) => {
        console.info("treatment saved", response);
        alert(
          `${this.translate("Entering record failed")}.
          ${this.translate("Status")}: ${response.status}`
        );
      });

    if (data.enteredBy)
      this.storage.set("enteredBy", data.enteredBy.toString());

    this.#quickpickHideFood();
    this.client.browserUtils.closeDrawer("#boluscalcDrawer");
  }

  /** @param {JQuery.ClickEvent} event */
  #deleteFoodRecord(event) {
    const index = parseInt($(event.currentTarget).attr("index") ?? "0");
    this.foods.splice(index, 1);
    $("#bc_carbs").val("");
    this.calculateInsulin();
    this.#maybePrevent(event);
    return false;
  }

  /** @param {JQuery.ChangeEvent} event */
  #quickpickChange(event) {
    const qpiselected = $("#bc_quickpick").val()?.toString() ?? "";

    if (qpiselected === null || qpiselected === "-1") {
      // (none)
      this.$("#bc_carbs").val(0);
      this.foods = [];
      this.$("#bc_addfoodarea").css("display", "");
    } else {
      const qp = this.quickpicks[parseInt(qpiselected)];
      this.foods = structuredClone(qp.foods);
      this.$("#bc_addfoodarea").css("display", "none");
    }

    this.calculateInsulin();
    this.#maybePrevent(event);
  }

  #quickpickHideFood() {
    const qpiselected = parseInt($("#bc_quickpick").val()?.toString() ?? "");

    if (qpiselected >= 0) {
      const qp = this.quickpicks[qpiselected];
      if (qp.hideafteruse) {
        qp.hidden = true;

        this.$.ajax({
          method: "PUT",
          url: "/api/v1/food/",
          headers: this.client.headers(),
          data: qp,
        })
          .done((response) => {
            console.info("quick pick saved", response);
          })
          .fail((response) => {
            console.info("quick pick failed to save", response);
          });
      }
    }

    this.calculateInsulin();
  }

  /** @param {JQuery.Event | Event} [event] @param {() => any} [callback] */
  loadFoodDatabase(event, callback) {
    this.categories = {};
    this.foodlist = [];
    const records = this.client.sbx.data.food || [];
    records.forEach((r) => {
      if (r.type === "food") {
        this.foodlist.push(r);
        if (r.category && !this.categories[r.category]) {
          this.categories[r.category] = {};
        }
        if (r.category && r.subcategory) {
          // @ts-expect-error `this.categories[r.category]` *is* defined, typescipt thinks it might not be
          this.categories[r.category][r.subcategory] = true;
        }
      }
    });

    this.databaseloaded = true;
    console.log("Food database loaded");

    this.#fillForm();

    this.#maybePrevent(event);
    if (callback) callback();
  }

  loadFoodQuickpicks() {
    // Load quickpicks
    const records = this.client.sbx.data.food || [];
    this.quickpicks = records.filter(
      /** @returns {r is import("../types").QuickPick}*/ (r) =>
        r.type === "quickpick"
    );

    this.$("#bc_quickpick")
      .empty()
      .append(`<option value="-1">${this.translate("(none)")}</option>`);

    records.forEach((r, i) => {
      this.$("#bc_quickpick").append(
        `<option value="${i}">${r.name} (${r.carbs} g)</option>`
      );
    });

    $("#bc_quickpick").val(-1);
    $("#bc_quickpick").on("change", (ev) => this.#quickpickChange(ev));
  }

  /** @param {JQuery.Event | Event} [event] */
  #fillForm(event) {
    this.$("#bc_filter_category")
      .empty()
      .append(`<option value="">${this.translate("(none)")}</option>`);
    Object.keys(this.categories).forEach((s) => {
      $("#bc_filter_category").append(`<option value="${s}">${s}</option>`);
    });
    this.filter.category = "";
    this.#fillSubcategories();

    $("#bc_filter_category").on("change", (ev) => this.#fillSubcategories(ev));
    $("#bc_filter_subcategory").on("change", (ev) => this.#doFilter(ev));
    $("#bc_filter_name").on("input", (ev) => this.#doFilter(ev));

    this.#maybePrevent(event);
    return false;
  }

  /** @param {JQuery.Event | Event} [event] */
  #fillSubcategories(event) {
    this.#maybePrevent(event);

    this.filter.category = $("#bc_filter_category").val()?.toString() ?? "";
    this.filter.subcategory = "";

    $("#bc_filter_subcategory")
      .empty()
      .append(`<option value="">${this.translate("(none)")}</option>`);

    if (this.filter.category !== "") {
      Object.keys(this.categories[this.filter.category]).forEach((s) => {
        $("#bc_filter_subcategory").append(
          `<option value="${s}">${s}</option>`
        );
      });
    }
    this.#doFilter();
  }

  /** @param {JQuery.Event | Event} [event] */
  #doFilter(event) {
    if (event) {
      this.filter = {
        category: $("#bc_filter_category").val()?.toString() ?? "",
        subcategory: $("#bc_filter_subcategory").val()?.toString() ?? "",
        name: $("#bc_filter_name").val()?.toString() ?? "",
      };
    }

    $("#bc_data").empty();
    this.foodlist.forEach((food, i) => {
      if (
        (this.filter.category !== "" &&
          food.category !== this.filter.category) ||
        (this.filter.subcategory !== "" &&
          food.subcategory !== this.filter.subcategory) ||
        (this.filter.name !== "" &&
          food.name.toLowerCase().includes(this.filter.name.toLowerCase()))
      ) {
        return;
      }

      this.$("#bc_data").append(`
        <option value="${i}">
          Portion: ${food.portion} |
          Unit: ${food.unit} |
          Carbs: ${food.carbs} g
        </option>
      `);
    });

    $("#bc_addportions").val("1");

    this.#maybePrevent(event);
  }

  /** @param {JQuery.Event | Event} [event] */
  #addFoodFromDatabase(event) {
    if (!this.databaseloaded) {
      this.loadFoodDatabase(event, this.#addFoodFromDatabase);
      return;
    }

    $("#bc_addportions").val("1");
    $("#bc_addfooddialog").dialog({
      width: 640,
      height: 400,
      buttons: [
        {
          text: this.translate("Add"),
          click: (event) => {
            const index = parseInt($("#bc_data").val()?.toString() ?? "");
            const portions = parseFloat(
              $("#bc_addportions").val()?.toString().replace(",", ".") ?? ""
            );
            if (!isNaN(index) && !isNaN(portions) && portions > 0) {
              this.foodlist[index].portions = portions;
              this.foods.push(structuredClone(this.foodlist[index]));

              $(event.currentTarget).dialog("close");
              this.calculateInsulin();
            }
          },
        },
        {
          text: this.translate("Reload database"),
          class: "leftButton",
          click: (ev) => this.loadFoodDatabase(ev),
        },
      ],
      open: (event) => {
        $(event.currentTarget)
          .parent()
          .css("box-shadow", "20px 20px 20px 0px black");
        $(event.currentTarget)
          .parent()
          .find(".ui-dialog-buttonset")
          .css({ width: "100%", "text-align": "right" });
        $(event.currentTarget)
          .parent()
          .find('button:contains("' + this.translate("Add") + '")')
          .css({ float: "left" });

        $("#bc_filter_name").trigger("focus");
      },
    });
    this.#maybePrevent(event);
    return false;
  }

  /** @param {Date} time */
  #findClosestSGVToPastTime(time) {
    const nowData = this.client.entries.filter(
      /** @returns {d is import("../types").Sgv} */
      (d) => d.type === "sgv" && d.mills <= time.getTime()
    );
    const focusPoint = nowData.at(-1);

    if (
      !focusPoint ||
      focusPoint.mills + times.mins(10).msecs < time.getTime()
    ) {
      return null;
    }

    return focusPoint;
  }
}

/** @param {ConstructorParameters<typeof BolusCalc>} args */
module.exports = (...args) => new BolusCalc(...args);
