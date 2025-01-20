"use strict";

const isEqual = require("lodash/isEqual");
const times = require("../times");
const consts = require("../constants");

const DEFAULT_FOCUS = times.hours(3).msecs;
const WIDTH_SMALL_DOTS = 420;
const WIDTH_BIG_DOTS = 800;
const TOOLTIP_WIDTH = 150; //min-width + padding
const zeroDate = new Date(0);

/**
 * @typedef {{ treatments: number; scale: number; showLabels: boolean }
 *   | { showLabels: false }} DrawTreatmentOpts
 */

class Renderer {
  /**
   * @param {import(".")} client
   * @param {import("d3")} d3
   */
  constructor(client, d3) {
    this.client = client;
    this.d3 = d3;

    this.utils = client.utils;
    this.translate = client.translate;
  }

  /** @protected @param {{date?: Date; mills: number}} entry */
  getOrAddDate(entry) {
    if (entry.date) return entry.date;
    entry.date = new Date(entry.mills);
    return entry.date;
  }

  /** @protected */
  focusRangeAdjustment() {
    return this.client.focusRangeMS === DEFAULT_FOCUS
      ? 1
      : 1 + (this.client.focusRangeMS - DEFAULT_FOCUS) / DEFAULT_FOCUS / 8;
  }

  /** @protected @param {import("../types").Entry["type"]} type */
  dotRadius(type) {
    let radius =
      (this.client.chart?.prevChartWidth ?? NaN) > WIDTH_BIG_DOTS
        ? 4
        : (this.client.chart?.prevChartWidth ?? NaN) < WIDTH_SMALL_DOTS
          ? 2
          : 3;
    if (type === "mbg") {
      radius *= 2;
    } else if (type === "forecast") {
      radius = Math.min(3, radius - 1);
    } else if (type === "rawbg") {
      radius = Math.min(2, radius - 1);
    }

    return radius / this.focusRangeAdjustment();
  }

  /** @param {JQuery.MouseOverEvent} event */
  tooltipLeft(event) {
    const tooltipNode = this.client.tooltip.node();
    if (!tooltipNode) return NaN + "px";

    const windowWidth = $(tooltipNode).parent().parent().width() ?? NaN;
    const left =
      event.pageX + TOOLTIP_WIDTH < windowWidth
        ? event.pageX
        : windowWidth - TOOLTIP_WIDTH - 10;
    return left + "px";
  }

  hideTooltip() {
    this.client.tooltip.style("opacity", 0);
  }

  /**
   * Get the desired opacity for context chart based on the brush extent
   *
   * @param {{ mills: number }} data
   * @param {number} from
   * @param {number} to
   */
  highlightBrushPoints(data, from, to) {
    if (
      this.client.chart &&
      this.client.latestSGV &&
      data.mills >= from &&
      data.mills <= to
    ) {
      return this.client.chart.futureOpacity(
        data.mills - this.client.latestSGV.mills
      );
    } else {
      return 0.5;
    }
  }

  /**
   * A higher bubbleScale will produce smaller bubbles (it's not a radius like
   * focusDotRadius)
   */
  bubbleScale() {
    const prevChartWidth = this.client.chart?.prevChartWidth ?? NaN;
    return (
      (prevChartWidth < WIDTH_SMALL_DOTS
        ? 4
        : prevChartWidth < WIDTH_BIG_DOTS
          ? 3
          : 2) * this.focusRangeAdjustment()
    );
  }

  /** @protected @param {import("d3").Selection<any, import("../types").Entry, SVGGElement, any>} sel */
  updateFocusCircles(sel) {
    if (!this.client.chart) return sel;
    const chart = this.client.chart;

    /** @type {import("../types").Entry[]} */
    const badData = [];
    sel
      .attr("cx", (d) => {
        if (!d) {
          console.error("Bad data", d);
          return chart.xScale(zeroDate);
        } else if (!d.mills) {
          console.error("Bad data, no mills", d);
          return chart.xScale(zeroDate);
        } else {
          return chart.xScale(this.getOrAddDate(d));
        }
      })
      .attr("cy", (d) => {
        const scaled = this.client.sbx.scaleEntry(d);
        if (isNaN(scaled)) {
          badData.push(d);
          return chart.yScale(this.utils.scaleMgdl(450));
        } else {
          return chart.yScale(scaled);
        }
      })
      .attr("opacity", (d) => {
        if ("noFade" in d && d.noFade) {
          return null;
        } else {
          return !this.client.latestSGV
            ? 1
            : chart.futureOpacity(d.mills - this.client.latestSGV.mills);
        }
      })
      .attr("r", (d) => this.dotRadius(d.type));

    if (badData.length > 0) {
      console.warn("Bad Data: isNaN(sgv)", badData);
    }

    return sel;
  }

  /**
   * @param {import("d3").Selection<
   *   any,
   *   import("../types").Entry,
   *   SVGGElement,
   *   any
   * >} sel
   * @protected
   */
  prepareFocusCircles(sel) {
    this.updateFocusCircles(sel)
      .attr("fill", (d) => (d.type === "forecast" ? "none" : d.color))
      .attr("stroke-width", (d) =>
        d.type === "mbg" ? 2 : d.type === "forecast" ? 2 : 0
      )
      .attr("stroke", (d) => (d.type === "mbg" ? "white" : d.color));

    return sel;
  }

  /** @protected @param {import("../types").Entry} d */
  getRawbgInfo(d) {
    /** @type {{ noise?: string; value?: number }} */
    const info = {};
    // @ts-expect-error no idea if or how this works
    const sbx = this.client.sbx.withExtendedSettings(this.client.rawbg);

    if (d.type === "sgv") {
      info.noise = this.client.rawbg.noiseCodeToDisplay(d.mgdl, d.noise);
      if (
        this.client.rawbg.showRawBGs(
          d.mgdl,
          d.noise,
          this.client.ddata.cal,
          sbx
        )
      ) {
        info.value = this.utils.scaleMgdl(
          this.client.rawbg.calc(d, this.client.ddata.cal, sbx)
        );
      }
    }
    return info;
  }

  /**
   * @param {JQuery.MouseOverEvent} event
   * @param {import("../types").Entry} d
   * @protected
   */
  focusCircleTooltip(event, d) {
    if (d.type !== "sgv" && d.type !== "mbg" && d.type !== "forecast") {
      return;
    }

    const rawbgInfo = this.getRawbgInfo(d);

    this.client.tooltip.style("opacity", 0.9);
    this.client.tooltip
      .html(
        "<strong>" +
          this.translate("BG") +
          ":</strong> " +
          this.client.sbx.scaleEntry(d) +
          (d.type === "mbg"
            ? "<br/><strong>" +
              this.translate("Device") +
              ": </strong>" +
              d.device
            : "") +
          (d.type === "forecast" && d.forecastType
            ? "<br/><strong>" +
              this.translate("Forecast Type") +
              ": </strong>" +
              d.forecastType
            : "") +
          (rawbgInfo.value
            ? "<br/><strong>" +
              this.translate("Raw BG") +
              ":</strong> " +
              rawbgInfo.value
            : "") +
          (rawbgInfo.noise
            ? "<br/><strong>" +
              this.translate("Noise") +
              ":</strong> " +
              rawbgInfo.noise
            : "") +
          "<br/><strong>" +
          this.translate("Time") +
          ":</strong> " +
          this.client.formatTime(this.getOrAddDate(d))
      )
      .style("left", this.tooltipLeft(event))
      .style("top", event.pageY + 15 + "px");
  }

  addFocusCircles() {
    if (!this.client.chart) return;

    // CGM data

    const focusData = this.client.entries;

    // bind up the focus chart data to an array of circles
    // selects all our data into data and uses date function to get current max date
    const focusCircles = this.client.chart.focus
      .selectAll("circle.entry-dot")
      .data(focusData, (d) => "cgmreading." + d.mills);

    // if already existing then transition each circle to its new position
    this.updateFocusCircles(focusCircles);

    // if new circle then just display
    this.prepareFocusCircles(focusCircles.enter().append("circle"))
      .attr("class", "entry-dot")
      .on("mouseover", this.focusCircleTooltip.bind(this))
      .on("mouseout", this.hideTooltip.bind(this));

    focusCircles.exit().remove();

    // Forecasts

    const shownForecastPoints = this.client.chart.getForecastData();

    // bind up the focus chart data to an array of circles
    // selects all our data into data and uses date function to get current max date

    const forecastCircles = this.client.chart.focus
      .selectAll("circle.forecast-dot")
      .data(
        /** @type {import("../types").Entry[]} */ (shownForecastPoints),
        (d) => d.forecastType + d.mills
      );

    forecastCircles.exit().remove();

    this.prepareFocusCircles(forecastCircles.enter().append("circle"))
      .attr("class", "forecast-dot")
      .on("mouseover", this.focusCircleTooltip.bind(this))
      .on("mouseout", this.hideTooltip.bind(this));

    this.updateFocusCircles(forecastCircles);
  }

  /** @param {import("../types").Treatment} d */
  treatmentCirclesTooltip(d) {
    const translate = this.translate;

    let targetBottom = d.targetBottom;
    let targetTop = d.targetTop;

    if (this.client.settings.units === "mmol") {
      targetBottom = Math.round((targetBottom / consts.MMOL_TO_MGDL) * 10) / 10;
      targetTop = Math.round((targetTop / consts.MMOL_TO_MGDL) * 10) / 10;
    }

    let correctionRangeText = "";
    if (d.correctionRange) {
      let min = d.correctionRange[0];
      let max = d.correctionRange[1];

      if (this.client.settings.units === "mmol") {
        max = this.client.sbx.roundBGToDisplayFormat(
          this.client.sbx.scaleMgdl(max)
        );
        min = this.client.sbx.roundBGToDisplayFormat(
          this.client.sbx.scaleMgdl(min)
        );
      }

      if (d.correctionRange[0] === d.correctionRange[1]) {
        correctionRangeText = "" + min;
      } else {
        correctionRangeText = "" + min + " - " + max;
      }
    }

    let durationText = "";
    if (d.durationType === "indefinite") {
      durationText = translate("Indefinite");
    } else if (d.duration) {
      const durationMinutes = Math.round(d.duration);
      if (durationMinutes > 0 && durationMinutes % 60 == 0) {
        const durationHours = durationMinutes / 60;
        if (durationHours > 1) {
          durationText = durationHours + " hours";
        } else {
          durationText = durationHours + " hour";
        }
      } else {
        durationText = durationMinutes + " min";
      }
    }

    return (
      "<strong>" +
      translate("Time") +
      ":</strong> " +
      this.client.formatTime(this.getOrAddDate(d)) +
      "<br/>" +
      (d.eventType
        ? "<strong>" +
          translate("Treatment type") +
          ":</strong> " +
          translate(
            this.client.careportal.resolveEventName(d.eventType) ?? "(none)"
          ) +
          "<br/>"
        : "") +
      (d.reason
        ? "<strong>" +
          translate("Reason") +
          ":</strong> " +
          translate(d.reason) +
          "<br/>"
        : "") +
      (d.glucose
        ? "<strong>" +
          translate("BG") +
          ":</strong> " +
          d.glucose +
          (d.glucoseType ? " (" + translate(d.glucoseType) + ")" : "") +
          "<br/>"
        : "") +
      (d.enteredBy
        ? "<strong>" +
          translate("Entered By") +
          ":</strong> " +
          d.enteredBy +
          "<br/>"
        : "") +
      (d.targetTop
        ? "<strong>" +
          translate("Target Top") +
          ":</strong> " +
          targetTop +
          "<br/>"
        : "") +
      (d.targetBottom
        ? "<strong>" +
          translate("Target Bottom") +
          ":</strong> " +
          targetBottom +
          "<br/>"
        : "") +
      (durationText
        ? "<strong>" +
          translate("Duration") +
          ":</strong> " +
          durationText +
          "<br/>"
        : "") +
      (d.insulinNeedsScaleFactor
        ? "<strong>" +
          translate("Insulin Scale Factor") +
          ":</strong> " +
          d.insulinNeedsScaleFactor * 100 +
          "%<br/>"
        : "") +
      (correctionRangeText
        ? "<strong>" +
          translate("Correction Range") +
          ":</strong> " +
          correctionRangeText +
          "<br/>"
        : "") +
      (d.transmitterId
        ? "<strong>" +
          translate("Transmitter ID") +
          ":</strong> " +
          d.transmitterId +
          "<br/>"
        : "") +
      (d.sensorCode
        ? "<strong>" +
          translate("Sensor Code") +
          ":</strong> " +
          d.sensorCode +
          "<br/>"
        : "") +
      (d.notes ? "<strong>" + translate("Notes") + ":</strong> " + d.notes : "")
    );
  }

  /** @protected @param {import("../types").Treatment} d */
  announcementTooltip(d) {
    return (
      "<strong>" +
      this.translate("Time") +
      ":</strong> " +
      this.client.formatTime(this.getOrAddDate(d)) +
      "<br/>" +
      (d.eventType
        ? "<strong>" + this.translate("Announcement") + "</strong><br/>"
        : "") +
      (d.notes && d.notes.length > 1
        ? "<strong>" +
          this.translate("Message") +
          ":</strong> " +
          d.notes +
          "<br/>"
        : "") +
      (d.enteredBy
        ? "<strong>" +
          this.translate("Entered By") +
          ":</strong> " +
          d.enteredBy +
          "<br/>"
        : "")
    );
  }

  /**
   * @param {import("d3").Selection<
   *   import("d3").BaseType,
   *   import("../types").Treatment,
   *   SVGGElement,
   *   any
   * >} sel
   */
  updateTreatCircles(sel) {
    if (!this.client.chart) return sel;
    const chart = this.client.chart;

    sel
      .attr("cx", (d) => chart.xScale(this.getOrAddDate(d)))
      .attr("cy", (d) => chart.yScale(this.client.sbx.scaleEntry(d)))
      .attr("r", () => this.dotRadius("mbg"));

    return sel;
  }

  /**
   * @param {import("d3").Selection<
   *   any,
   *   import("../types").Treatment,
   *   SVGGElement,
   *   any
   * >} sel
   */
  prepareTreatCircles(sel) {
    return this.updateTreatCircles(sel)
      .attr("stroke-width", 2)
      .attr(
        "stroke",
        (d) =>
          (d.isAnnouncement && "orange") || (d.glucose && "grey") || "white"
      )
      .attr(
        "fill",
        (d) => (d.isAnnouncement && "orange") || (d.glucose && "red") || "grey"
      );
  }

  /** @param {number | import("moment").Moment | Date} nowDate */
  addTreatmentCircles(nowDate) {
    if (!this.client.chart) return;

    //TODO: filter in oref0 instead of here and after most people upgrade take this out
    const openAPSSpam = ["BasalProfileStart", "ResultDailyTotal", "BGReceived"];

    //NOTE: treatments with insulin or carbs are drawn by drawTreatment()
    // bind up the focus chart data to an array of circles
    const treatCircles = this.client.chart.focus
      .selectAll(".treatment-dot")
      .data(
        this.client.ddata.treatments.filter((treatment) => {
          const notCarbsOrInsulin = !treatment.carbs && !treatment.insulin;
          const notTempOrProfile = ![
            "Temp Basal",
            "Profile Switch",
            "Combo Bolus",
            "Temporary Target",
          ].includes(treatment.eventType);

          const notes = treatment.notes || "";
          const enteredBy = treatment.enteredBy || "";

          const notOpenAPSSpam =
            !enteredBy.includes("openaps://") ||
            openAPSSpam.some((spam) => notes.startsWith(spam));

          return (
            notCarbsOrInsulin &&
            !treatment.duration &&
            treatment.durationType !== "indefinite" &&
            notTempOrProfile &&
            notOpenAPSSpam
          );
        }),
        function key(d) {
          return d._id;
        }
      );

    // if already existing then transition each circle to its new position
    this.updateTreatCircles(treatCircles);

    // if new circle then just display
    this.prepareTreatCircles(treatCircles.enter().append("circle"))
      .attr("class", "treatment-dot")
      .on("mouseover", (e, d) => {
        this.client.tooltip.style("opacity", 0.9);
        this.client.tooltip
          .html(
            d.isAnnouncement
              ? this.announcementTooltip(d)
              : this.treatmentCirclesTooltip(d)
          )
          .style("left", this.tooltipLeft(e))
          .style("top", e.pageY + 15 + "px");
      })
      .on("mouseout", this.hideTooltip.bind(this));

    treatCircles.exit().remove();

    const durationTreatments = this.client.ddata.treatments
      .filter(
        (treatment) =>
          !treatment.carbs &&
          !treatment.insulin &&
          treatment.durationType !== undefined &&
          ![
            "Temp Basal",
            "Profile Switch",
            "Combo Bolus",
            "Temporary Target",
          ].includes(treatment.eventType)
      )
      .concat(this.client.ddata.tempTargetTreatments ?? []);

    // treatments with duration
    const treatRects = this.client.chart.focus
      .selectAll(".g-duration")
      .data(durationTreatments);

    const that = this;
    const chart = this.client.chart;

    /** @param {import("../types").Treatment} d */
    function fillColor(d) {
      if (d.eventType === "Exercise") return "Violet";
      if (d.eventType === "Note") return "Salmon";
      if (d.eventType === "Temporary Target") return "lightgray";
      return "grey";
    }

    /** @param {import("../types").Treatment} d */
    function rectHeight(d) {
      if (
        !d.targetTop ||
        d.targetTop <= 0 ||
        !d.targetBottom ||
        d.targetBottom <= 0
      ) {
        return 20;
      }

      return Math.max(5, d.targetTop - d.targetBottom);
    }

    /** @param {import("../types").Treatment} d */
    function rectTranslate(d) {
      const top =
        d.eventType === "Temporary Target"
          ? d.targetTop && d.targetTop === d.targetBottom
            ? d.targetTop + rectHeight(d)
            : (d.targetTop ?? NaN)
          : 50;

      return (
        "translate(" +
        chart.xScale(that.getOrAddDate(d)) +
        "," +
        chart.yScale(that.utils.scaleMgdl(top)) +
        ")"
      );
    }

    /** @param {import("../types").Treatment} d */
    function treatmentRectWidth(d) {
      if (d.durationType === "indefinite") {
        return (
          chart.xScale(chart.xScale.domain()[1].getTime()) -
          chart.xScale(that.getOrAddDate(d))
        );
      } else {
        return (
          // TODO types
          chart.xScale(
            new Date(d.mills + times.mins(d.duration ?? NaN).msecs)
          ) - chart.xScale(that.getOrAddDate(d))
        );
      }
    }

    /** @param {import("../types").Treatment} d */
    function treatmentTextTransform(d) {
      if (d.durationType === "indefinite") {
        let offset = 0;
        if (
          chart.xScale(that.getOrAddDate(d)) <
          chart.xScale(chart.xScale.domain()[0].getTime())
        ) {
          offset = chart.xScale(nowDate) - chart.xScale(that.getOrAddDate(d));
        }
        return "translate(" + offset + "," + 10 + ")";
      } else {
        return (
          "translate(" +
          (chart.xScale(
            new Date(d.mills + times.mins(d.duration ?? NaN).msecs)
          ) -
            chart.xScale(that.getOrAddDate(d))) /
            2 +
          "," +
          10 +
          ")"
        );
      }
    }

    /** @param {import("../types").Treatment} d */
    function treatmentText(d) {
      if (d.eventType === "Temporary Target") {
        return "";
      }
      return d.notes || d.reason || d.eventType;
    }

    /** @param {import("../types").Treatment} d */
    function treatmentTextAnchor(d) {
      return d.durationType === "indefinite" ? "left" : "middle";
    }

    // if transitioning, update rect text, position, and width
    const rectUpdates = treatRects;
    rectUpdates.attr("transform", rectTranslate);

    rectUpdates
      .select("text")
      .text(treatmentText)
      .attr("text-anchor", treatmentTextAnchor)
      .attr("transform", treatmentTextTransform);

    rectUpdates.select("rect").attr("width", treatmentRectWidth);

    // if new rect then create new elements
    const newRects = treatRects
      .enter()
      .append("g")
      .attr("class", "g-duration")
      .attr("transform", rectTranslate)
      .on("mouseover", (e, t) => {
        this.client.tooltip.style("opacity", 0.9);
        this.client.tooltip
          .html(
            e.isAnnouncement
              ? this.announcementTooltip(t)
              : this.treatmentCirclesTooltip(t)
          )
          .style("left", this.tooltipLeft(e))
          .style("top", e.pageY + 15 + "px");
      })
      .on("mouseout", this.hideTooltip.bind(this));

    newRects
      .append("rect")
      .attr("class", "g-duration-rect")
      .attr("width", treatmentRectWidth)
      .attr("height", rectHeight)
      .attr("rx", 5)
      .attr("ry", 5)
      .attr("opacity", 0.2)
      .attr("fill", fillColor);

    newRects
      .append("text")
      .attr("class", "g-duration-text")
      .style("font-size", 15)
      .attr("fill", "white")
      .attr("text-anchor", treatmentTextAnchor)
      .attr("dy", ".35em")
      .attr("transform", treatmentTextTransform)
      .text(treatmentText);

    // Remove any rects no longer needed
    treatRects.exit().remove();
  }

  /** @protected @param {import("d3").Selection<any, import("../types").Entry, any, any>} sel */
  prepareContextCircles(sel) {
    if (!this.client.chart) return sel;
    const chart = this.client.chart;

    /** @type {import("../types").Entry[]} */
    const badData = [];
    sel
      .attr("cx", (d) => chart.xScale2(this.getOrAddDate(d)))
      .attr("cy", (d) => {
        const scaled = this.client.sbx.scaleEntry(d);
        if (isNaN(scaled)) {
          badData.push(d);
          return chart.yScale2(this.utils.scaleMgdl(450));
        } else {
          return chart.yScale2(scaled);
        }
      })
      .attr("fill", (d) => d.color)
      //.style('opacity', function(d) { return renderer.highlightBrushPoints(d) })
      .attr("stroke-width", (d) => (d.type === "mbg" ? 2 : 0))
      .attr("stroke", () => "white")
      .attr("r", (d) => (d.type === "mbg" ? 4 : 2));

    if (badData.length > 0) {
      console.warn("Bad Data: isNaN(sgv)", badData);
    }

    return sel;
  }

  addContextCircles() {
    if (!this.client.chart) return;
    // bind up the context chart data to an array of circles
    const contextCircles = this.client.chart.context
      .selectAll("circle")
      .data(this.client.entries);

    // if already existing then transition each circle to its new position
    this.prepareContextCircles(contextCircles);

    // if new circle then just display
    this.prepareContextCircles(contextCircles.enter().append("circle"));

    contextCircles.exit().remove();
  }

  /**
   * @param {import("../types").Treatment} treatment
   * @param {{ scale: number }} opts
   * @param {number} carbratio
   * @protected
   */
  calcTreatmentRadius(treatment, opts, carbratio) {
    const CR = treatment.CR || carbratio || 20;
    const carbsOrInsulin =
      treatment.carbs || (treatment.insulin ?? NaN) * CR || CR;

    // R1 determines the size of the treatment dot
    const R1 = Math.sqrt(carbsOrInsulin) / opts.scale;
    const R2 = R1;
    // R3/R4 determine how far from the treatment dot the labels are placed
    const R3 = R1 + 8 / opts.scale;
    const R4 = R1 + 25 / opts.scale;

    return {
      R1: R1,
      R2: R2,
      R3: R3,
      R4: R4,
      isNaN: isNaN(R1) || isNaN(R3) || isNaN(R3),
    };
  }

  /**
   * @param {import("../types").Treatment} treatment
   * @param {ReturnType<Renderer["calcTreatmentRadius"]>} radius
   * @param {{
   *   renderOver: number;
   *   renderFormat: string;
   *   renderFormatSmall: string;
   * }} bolusSettings
   * @returns
   */
  prepareArc(treatment, radius, bolusSettings) {
    const arc_data = [
        // white carb half-circle on top
        {
          element: "",
          color: "white",
          start: -1.5708,
          end: 1.5708,
          inner: 0,
          outer: radius.R1,
          outlineOnly: !treatment.carbs,
        },
        {
          element: "",
          color: "transparent",
          start: -1.5708,
          end: 1.5708,
          inner: radius.R2,
          outer: radius.R3,
        },
        // blue insulin half-circle on bottom
        {
          element: "",
          color: "#0099ff",
          start: 1.5708,
          end: 4.7124,
          inner: 0,
          outer: radius.R1,
        },
        // these form a very short transparent arc along the bottom of an insulin treatment to position the label
        // these used to be semicircles from 1.5708 to 4.7124, but that made the tooltip target too big
        {
          element: "",
          color: "transparent",
          start: 3.14,
          end: 3.1432,
          inner: radius.R2,
          outer: radius.R3,
          outlineOnly: !treatment.insulin,
        },
        {
          element: "",
          color: "transparent",
          start: 3.14,
          end: 3.1432,
          inner: radius.R2,
          outer: radius.R4,
        },
      ],
      arc_data_1_elements = [];

    if (treatment.carbs && treatment.carbs > 0) {
      arc_data_1_elements.push(Math.round(treatment.carbs) + " g");
    }

    if (treatment.protein && treatment.protein > 0) {
      arc_data_1_elements.push(Math.round(treatment.protein) + " g");
    }

    if (treatment.fat && treatment.fat > 0) {
      arc_data_1_elements.push(Math.round(treatment.fat) + " g");
    }

    arc_data[1].element = arc_data_1_elements.join(" / ");

    if (treatment.foodType) {
      arc_data[1].element = arc_data[1].element + " " + treatment.foodType;
    }

    if (treatment.insulin && treatment.insulin > 0) {
      let dosage_units = "" + Math.round(treatment.insulin * 100) / 100;

      const format =
        treatment.insulin < bolusSettings.renderOver
          ? bolusSettings.renderFormatSmall
          : bolusSettings.renderFormat;

      if (["concise", "minimal"].includes(format)) {
        dosage_units = (dosage_units + "").replace(/^0/, "");
      }

      const unit_of_measurement = format === "minimal" ? "" : " U"; // One international unit of insulin (1 IU) is shown as '1 U'

      arc_data[3].element = dosage_units + unit_of_measurement;
    }

    if (treatment.status) {
      arc_data[4].element = this.translate(treatment.status);
    }

    const arc = this.d3
      .arc()
      .innerRadius((d) => 5 * d.innerRadius)
      .outerRadius((d) => 5 * d.outerRadius)
      .endAngle((d) => d.startAngle)
      .startAngle((d) => d.endAngle);

    return {
      data: arc_data,
      svg: arc,
    };
  }

  /** @protected @param {number} x @param {number} y @param {Record<"x" | "y"| "width" | "height", number>} rect */
  isInRect(x, y, rect) {
    return !(
      x < rect.x ||
      x > rect.x + rect.width ||
      y < rect.y ||
      y > rect.y + rect.height
    );
  }

  /**
   * @param {import("../types").Treatment} treatment
   * @protected
   */
  boluscalcTooltip(treatment) {
    if (!treatment.boluscalc) {
      return "";
    }

    return `
      <br>
      ${
        treatment.boluscalc.othercorrection
          ? `
            <strong>${this.translate("Other correction")}</strong>
            ${parseFloat(treatment.boluscalc.othercorrection.toString()).toFixed(2)}U
            <br />`
          : ""
      }
      ${
        treatment.boluscalc.profile
          ? `
            <strong>${this.translate("Profile used")}</strong>
            ${treatment.boluscalc.profile}
            <br />`
          : ""
      }
      ${
        treatment.boluscalc.foods.length
          ? `<table>
              <tr>
                <td>
                  <strong>${this.translate("Food")}</strong>
                </td>
              </tr>`
          : ""
      }
      ${treatment.boluscalc.foods.map(
        (f) => `
              <tr>
                <td>${f.name}</td>
                <td>${(f.portion * f.portions).toFixed(1)} ${f.unit}</td>
                <td>${(f.carbs * f.portions).toFixed(1)} g</td>
              </tr>
        `
      )}
      ${treatment.boluscalc.foods.length ? `</table>` : ""}

    `;
  }

  /** @param {import("../types").Treatment} treatment */
  treatmentTooltip(treatment) {
    const translate = this.translate;

    let glucose = treatment.glucose ?? NaN;
    if (this.client.settings.units !== this.client.ddata.profile?.getUnits()) {
      glucose *=
        this.client.settings.units === "mmol"
          ? 1 / consts.MMOL_TO_MGDL
          : consts.MMOL_TO_MGDL;
      const decimals = this.client.settings.units === "mmol" ? 10 : 1;

      glucose = Math.round(glucose * decimals) / decimals;
    }

    /** @param {JQuery.MouseOverEvent} event */
    return (event) => {
      this.client.tooltip.style("opacity", 0.9);
      this.client.tooltip
        .html(
          "<strong>" +
            translate("Time") +
            ":</strong> " +
            this.client.formatTime(this.getOrAddDate(treatment)) +
            "<br/>" +
            "<strong>" +
            translate("Treatment type") +
            ":</strong> " +
            translate(
              this.client.careportal.resolveEventName(treatment.eventType)
            ) +
            "<br/>" +
            (treatment.carbs
              ? "<strong>" +
                translate("Carbs") +
                ":</strong> " +
                treatment.carbs +
                "<br/>"
              : "") +
            (treatment.protein
              ? "<strong>" +
                translate("Protein") +
                ":</strong> " +
                treatment.protein +
                "<br/>"
              : "") +
            (treatment.fat
              ? "<strong>" +
                translate("Fat") +
                ":</strong> " +
                treatment.fat +
                "<br/>"
              : "") +
            (treatment.absorptionTime !== undefined &&
            treatment.absorptionTime > 0
              ? "<strong>" +
                translate("Absorption Time") +
                ":</strong> " +
                Math.round((treatment.absorptionTime / 60.0) * 10) / 10 +
                "h" +
                "<br/>"
              : "") +
            (treatment.insulin
              ? "<strong>" +
                translate("Insulin") +
                ":</strong> " +
                this.utils.toRoundedStr(treatment.insulin, 2) +
                "<br/>"
              : "") +
            (treatment.enteredinsulin
              ? "<strong>" +
                translate("Combo Bolus") +
                ":</strong> " +
                treatment.enteredinsulin +
                "U, " +
                treatment.splitNow +
                "% : " +
                treatment.splitExt +
                "%, " +
                translate("Duration") +
                ": " +
                treatment.duration +
                "<br/>"
              : "") +
            (treatment.glucose
              ? "<strong>" +
                translate("BG") +
                ":</strong> " +
                glucose +
                (treatment.glucoseType
                  ? " (" + translate(treatment.glucoseType) + ")"
                  : "") +
                "<br/>"
              : "") +
            (treatment.enteredBy
              ? "<strong>" +
                translate("Entered By") +
                ":</strong> " +
                treatment.enteredBy +
                "<br/>"
              : "") +
            (treatment.notes
              ? "<strong>" +
                translate("Notes") +
                ":</strong> " +
                treatment.notes
              : "") +
            this.boluscalcTooltip(treatment)
        )
        .style("left", this.tooltipLeft.bind(this))
        .style("top", `${event.pageY + 15}px`);
    };
  }

  /**
   * @param {import("../types").Treatment} treatment
   * @param {Record<"svg" | "data", any>} arc
   */
  appendTreatments(treatment, arc) {
    /** @type {Date} */
    let newTime;
    let deleteRect = { x: 0, y: 0, width: 0, height: 0 };
    let insulinRect = { x: 0, y: 0, width: 0, height: 0 };
    let carbsRect = { x: 0, y: 0, width: 0, height: 0 };
    /** @type {`${"Move" | "Remove"}${"" | " insulin" | " carbs"}`} */
    let operation;

    const chart = this.client.chart;
    if (!chart) return;

    this.drag = this.d3
      .drag()
      .on("start", (event) => {
        const tooltipNode = this.client.tooltip.node();
        if (!tooltipNode) return;
        //console.log(treatment);
        const windowWidth = $(tooltipNode).parent().parent().width() ?? NaN;
        const left =
          event.x + TOOLTIP_WIDTH < windowWidth
            ? event.x
            : windowWidth - TOOLTIP_WIDTH - 10;
        this.client.tooltip
          .style("opacity", 0.9)
          .style("left", left + "px")
          .style("top", (event.pageY ? event.pageY + 15 : 40) + "px");

        deleteRect = {
          x: 0,
          y: 0,
          width: 50,
          height: chart.yScale(chart.yScale.domain()[0]),
        };
        chart.drag
          .append("rect")
          .attr("class", "drag-droparea")
          .attr("x", deleteRect.x)
          .attr("y", deleteRect.y)
          .attr("width", deleteRect.width)
          .attr("height", deleteRect.height)
          .attr("fill", "red")
          .attr("opacity", 0.4)
          .attr("rx", 10)
          .attr("ry", 10);
        chart.drag
          .append("text")
          .attr("class", "drag-droparea")
          .attr("x", deleteRect.x + deleteRect.width / 2)
          .attr("y", deleteRect.y + deleteRect.height / 2)
          .attr("font-size", 15)
          .attr("font-weight", "bold")
          .attr("fill", "red")
          .attr("text-anchor", "middle")
          .attr("dy", ".35em")
          .attr(
            "transform",
            "rotate(-90 " +
              (deleteRect.x + deleteRect.width / 2) +
              "," +
              (deleteRect.y + deleteRect.height / 2) +
              ")"
          )
          .text(this.translate("Remove"));

        if (treatment.insulin && treatment.carbs) {
          carbsRect = {
            x: 0,
            y: 0,
            width: Number(chart.charts.attr("width")),
            height: 50,
          };
          insulinRect = {
            x: 0,
            y: chart.yScale(chart.yScale.domain()[0]) - 50,
            width: Number(chart.charts.attr("width")),
            height: 50,
          };
          chart.drag
            .append("rect")
            .attr("class", "drag-droparea")
            .attr("x", carbsRect.x)
            .attr("y", carbsRect.y)
            .attr("width", carbsRect.width)
            .attr("height", carbsRect.height)
            .attr("fill", "white")
            .attr("opacitys", 0.4)
            .attr("rx", 10)
            .attr("ry", 10);
          chart.drag
            .append("text")
            .attr("class", "drag-droparea")
            .attr("x", carbsRect.x + carbsRect.width / 2)
            .attr("y", carbsRect.y + carbsRect.height / 2)
            .attr("font-size", 15)
            .attr("font-weight", "bold")
            .attr("fill", "white")
            .attr("text-anchor", "middle")
            .attr("dy", ".35em")
            .text(this.translate("Move carbs"));
          chart.drag
            .append("rect")
            .attr("class", "drag-droparea")
            .attr("x", insulinRect.x)
            .attr("y", insulinRect.y)
            .attr("width", insulinRect.width)
            .attr("height", insulinRect.height)
            .attr("fill", "#0099ff")
            .attr("opacity", 0.4)
            .attr("rx", 10)
            .attr("ry", 10);
          chart.drag
            .append("text")
            .attr("class", "drag-droparea")
            .attr("x", insulinRect.x + insulinRect.width / 2)
            .attr("y", insulinRect.y + insulinRect.height / 2)
            .attr("font-size", 15)
            .attr("font-weight", "bold")
            .attr("fill", "#0099ff")
            .attr("text-anchor", "middle")
            .attr("dy", ".35em")
            .text(this.translate("Move insulin"));
        }

        chart.basals.attr("display", "none");

        operation = "Move";
      })
      .on("drag", (event) => {
        //console.log(d3.event);
        this.client.tooltip.style("opacity", 0.9);
        const x = Math.min(
          Math.max(0, event.x),
          Number(chart.charts.attr("width"))
        );
        const y = Math.min(Math.max(0, event.y), chart.focusHeight ?? NaN);

        operation = "Move";
        /** @param {Parameters<Renderer["isInRect"]>[2]} rect */
        const inRect = (rect) => this.isInRect(x, y, rect);
        if (inRect(deleteRect) && inRect(insulinRect)) {
          operation = "Remove insulin";
        } else if (inRect(deleteRect) && inRect(carbsRect)) {
          operation = "Remove carbs";
        } else if (inRect(deleteRect)) {
          operation = "Remove";
        } else if (inRect(insulinRect)) {
          operation = "Move insulin";
        } else if (inRect(carbsRect)) {
          operation = "Move carbs";
        }

        newTime = new Date(chart.xScale.invert(x));
        const minDiff = times.msecs(newTime.getTime() - treatment.mills).mins;
        this.client.tooltip.html(
          "<b>" +
            this.translate("Operation") +
            ":</b> " +
            this.translate(operation) +
            "<br>" +
            "<b>" +
            this.translate("New time") +
            ":</b> " +
            newTime.toLocaleTimeString() +
            "<br>" +
            "<b>" +
            this.translate("Difference") +
            ":</b> " +
            (minDiff > 0 ? "+" : "") +
            minDiff.toFixed(0) +
            " " +
            this.translate("mins")
        );

        chart.drag.selectAll(".arrow").remove();
        chart.drag
          .append("line")
          .attr("class", "arrow")
          .attr("marker-end", "url(#arrow)")
          .attr("x1", chart.xScale(this.getOrAddDate(treatment)))
          .attr("y1", chart.yScale(this.client.sbx.scaleEntry(treatment)))
          .attr("x2", x)
          .attr("y2", y)
          .attr("stroke-width", 2)
          .attr("stroke", "white");
      })
      .on("end", () => {
        /** @type {import("../types").Treatment} */
        let newTreatment;
        chart.drag.selectAll(".drag-droparea").remove();
        this.hideTooltip();
        switch (operation) {
          case "Move":
            if (
              window.confirm(
                this.translate("Change treatment time to %1 ?", {
                  params: [newTime.toLocaleTimeString()],
                })
              )
            ) {
              this.client.socket.emit(
                "dbUpdate",
                {
                  collection: "treatments",
                  _id: treatment._id,
                  data: { created_at: newTime.toISOString() },
                },
                /** @param {unknown} result */
                (result) => {
                  console.log(result);
                  chart.drag.selectAll(".arrow").style("opacity", 0).remove();
                }
              );
            } else {
              chart.drag.selectAll(".arrow").remove();
            }
            break;
          case "Remove insulin":
            if (
              window.confirm(this.translate("Remove insulin from treatment ?"))
            ) {
              this.client.socket.emit(
                "dbUpdateUnset",
                {
                  collection: "treatments",
                  _id: treatment._id,
                  data: { insulin: 1 },
                },
                /** @param {unknown} result */
                (result) => {
                  console.log(result);
                  chart.drag.selectAll(".arrow").style("opacity", 0).remove();
                }
              );
            } else {
              chart.drag.selectAll(".arrow").remove();
            }
            break;
          case "Remove carbs":
            if (
              window.confirm(this.translate("Remove carbs from treatment ?"))
            ) {
              this.client.socket.emit(
                "dbUpdateUnset",
                {
                  collection: "treatments",
                  _id: treatment._id,
                  data: { carbs: 1 },
                },
                /** @param {unknown} result */
                (result) => {
                  console.log(result);
                  chart.drag.selectAll(".arrow").style("opacity", 0).remove();
                }
              );
            } else {
              chart.drag.selectAll(".arrow").remove();
            }
            break;
          case "Remove":
            if (window.confirm(this.translate("Remove treatment ?"))) {
              this.client.socket.emit(
                "dbRemove",
                {
                  collection: "treatments",
                  _id: treatment._id,
                },
                /** @param {unknown} result */
                (result) => {
                  console.log(result);
                  chart.drag.selectAll(".arrow").style("opacity", 0).remove();
                }
              );
            } else {
              chart.drag.selectAll(".arrow").remove();
            }
            break;
          case "Move insulin":
            if (
              window.confirm(
                this.translate("Change insulin time to %1 ?", {
                  params: [newTime.toLocaleTimeString()],
                })
              )
            ) {
              this.client.socket.emit("dbUpdateUnset", {
                collection: "treatments",
                _id: treatment._id,
                data: { insulin: 1 },
              });
              newTreatment = structuredClone(treatment);
              // @ts-expect-error removing arequired property _id
              delete newTreatment._id;
              delete newTreatment.NSCLIENT_ID;
              delete newTreatment.carbs;
              newTreatment.created_at = newTime.toISOString();
              this.client.socket.emit(
                "dbAdd",
                {
                  collection: "treatments",
                  data: newTreatment,
                },
                /** @param {unknown} result */
                (result) => {
                  console.log(result);
                  chart.drag.selectAll(".arrow").style("opacity", 0).remove();
                }
              );
            } else {
              chart.drag.selectAll(".arrow").remove();
            }
            break;
          case "Move carbs":
            if (
              window.confirm(
                this.translate("Change carbs time to %1 ?", {
                  params: [newTime.toLocaleTimeString()],
                })
              )
            ) {
              this.client.socket.emit("dbUpdateUnset", {
                collection: "treatments",
                _id: treatment._id,
                data: { carbs: 1 },
              });
              newTreatment = structuredClone(treatment);
              // @ts-expect-error removing required property _id
              delete newTreatment._id;
              delete newTreatment.NSCLIENT_ID;
              delete newTreatment.insulin;
              newTreatment.created_at = newTime.toISOString();
              this.client.socket.emit(
                "dbAdd",
                {
                  collection: "treatments",
                  data: newTreatment,
                },
                /** @param {unknown} result */
                (result) => {
                  console.log(result);
                  chart.drag.selectAll(".arrow").style("opacity", 0).remove();
                }
              );
            } else {
              chart.drag.selectAll(".arrow").remove();
            }
            break;
        }
        chart.basals.attr("display", "");
      });

    const treatmentDots = chart.focus
      .selectAll("treatment-insulincarbs")
      .data(arc.data)
      .enter()
      .append("g")
      .attr("class", "draggable-treatment")
      .attr(
        "transform",
        "translate(" +
          chart.xScale(this.getOrAddDate(treatment)) +
          ", " +
          chart.yScale(this.client.sbx.scaleEntry(treatment)) +
          ")"
      )
      .on("mouseover", this.treatmentTooltip(treatment))
      .on("mouseout", this.hideTooltip.bind(this));
    if (this.client.editMode) {
      treatmentDots.style("cursor", "move").call(this.drag.bind(this));
    }

    treatmentDots
      .append("path")
      .attr("class", "path")
      .attr("fill", (d) => (d.outlineOnly ? "transparent" : d.color))
      .attr("stroke-width", (d) => (d.outlineOnly ? 1 : 0))
      .attr("stroke", (d) => d.color)
      .attr("id", (_, i) => "s" + i)
      .attr("d", arc.svg);

    return treatmentDots;
  }

  /**
   * @param {ReturnType<Renderer["appendTreatments"]>} treatmentDots
   * @param {ReturnType<Renderer["prepareArc"]>} arc
   * @param {DrawTreatmentOpts} opts
   * @protected
   */
  appendLabels(treatmentDots, arc, opts) {
    // labels for carbs and insulin
    if (!opts.showLabels || !treatmentDots) return;

    const label = treatmentDots
      .append("g")
      .attr("class", "path")
      .attr("id", "label")
      .style("fill", "white");

    label
      .append("text")
      .style("font-size", (d) => {
        const fontSize =
          (opts.treatments >= 30
            ? 40
            : 50 - Math.floor(((25 - opts.treatments) / 30) * 10)) / opts.scale;
        const elementValue = parseFloat(d.element);
        if (isNaN(elementValue) || elementValue >= 1) {
          return fontSize;
        }
        return (25 + Math.floor(elementValue * 10)) / opts.scale;
      })
      .style("text-shadow", "0px 0px 10px rgba(0, 0, 0, 1)")
      .attr("text-anchor", "middle")
      .attr("dy", ".35em")
      .attr("transform", (d) => {
        d.outerRadius *= 2.1;
        d.innerRadius *= 2.1;
        return "translate(" + arc.svg.centroid(d) + ")";
      })
      .text((d) => d.element);
  }

  /**
   * Please _don't_ call this with the client specified, the client is already
   * stored as a class member
   */
  drawTreatments(client = this.client) {
    const bolusSettings = client.settings.extendedSettings.bolus || {};

    this.client.chart?.focus.selectAll(".draggable-treatment").remove();

    const treatmentCount = client.ddata.treatments.filter(
      (d) => Number(d.insulin) > 0 || Number(d.carbs) > 0
    ).length;

    // add treatment bubbles
    client.ddata.treatments.forEach((d) => {
      const showLabels = !!(
        (d.carbs || d.insulin) &&
        d.insulin &&
        d.insulin < bolusSettings.renderOver &&
        bolusSettings.renderFormatSmall === "hidden"
      );

      this.drawTreatment(
        d,
        {
          scale: this.bubbleScale(),
          showLabels,
          treatments: treatmentCount,
        },
        client.sbx.data.profile?.getCarbRatio(new Date()) ?? NaN,
        bolusSettings
      );
    });
  }

  /**
   * @param {import("../types").Treatment} treatment
   * @param {DrawTreatmentOpts & {scale: number}} opts
   * @param {number} carbratio
   * @param {any} bolusSettings
   * @returns
   */
  drawTreatment(treatment, opts, carbratio, bolusSettings) {
    if (
      !treatment.carbs &&
      !treatment.protein &&
      !treatment.fat &&
      !treatment.insulin
    ) {
      return;
    }
    if (!this.client.chart) return;

    //when the tests are run window isn't available
    const innerWidth = window.innerWidth ?? -1;
    // don't render the treatment if it's not visible
    if (
      Math.abs(this.client.chart.xScale(this.getOrAddDate(treatment))) >
      innerWidth
    ) {
      return;
    }

    const radius = this.calcTreatmentRadius(treatment, opts, carbratio);
    if (radius.isNaN) {
      console.warn("Bad Data: Found isNaN value in treatment", treatment);
      return;
    }

    const arc = this.prepareArc(treatment, radius, bolusSettings);
    const treatmentDots = this.appendTreatments(treatment, arc);
    this.appendLabels(treatmentDots, arc, opts);
  }

  /**
   * Please _don't_ call this with the client specified, the client is already
   * stored as a class member
   */
  addBasals(client = this.client) {
    if (!client.settings.isEnabled("basal") || !client.chart) {
      return;
    }

    const chart = client.chart;

    const mode = client.settings.extendedSettings.basal.render;
    const profile = client.sbx.data.profile;

    /** @type {Record<"b" | "d", number>[]} */
    const linedata = [];
    /** @type {Record<"b" | "d", number>[]} */
    const notemplinedata = [];
    /** @type {Record<"b" | "d", number>[]} */
    const basalareadata = [];
    /** @type {Record<"b" | "d", number>[]} */
    const tempbasalareadata = [];
    /** @type {Record<"b" | "d", number>[]} */
    const comboareadata = [];
    const selectedRange = chart.createAdjustedRange();
    const from = selectedRange[0].getTime();
    const to = selectedRange[1].getTime();

    let date = from;
    /**
     * @type {ReturnType<
     *   ReturnType<import("../profilefunctions")>["getTempBasal"]
     * > | null}
     */
    let lastbasal = null;

    if (!profile?.activeProfileToTime(from)) {
      window.alert(
        this.translate(
          "Redirecting you to the Profile Editor to create a new profile."
        )
      );
      try {
        window.location.href = "/profile";
      } catch {
        //doesn't work when running tests, so catch and ignore
      }
      return;
    }

    while (date <= to) {
      const basalvalue = profile.getTempBasal(date);
      if (!isEqual(lastbasal, basalvalue)) {
        linedata.push({ d: date, b: basalvalue.totalbasal });
        notemplinedata.push({ d: date, b: basalvalue.basal });
        if (
          basalvalue.combobolustreatment &&
          basalvalue.combobolustreatment.relative
        ) {
          tempbasalareadata.push({ d: date, b: basalvalue.tempbasal });
          basalareadata.push({ d: date, b: 0 });
          comboareadata.push({ d: date, b: basalvalue.totalbasal });
        } else if (basalvalue.treatment) {
          tempbasalareadata.push({ d: date, b: basalvalue.totalbasal });
          basalareadata.push({ d: date, b: 0 });
          comboareadata.push({ d: date, b: 0 });
        } else {
          tempbasalareadata.push({ d: date, b: 0 });
          basalareadata.push({ d: date, b: basalvalue.totalbasal });
          comboareadata.push({ d: date, b: 0 });
        }
      }
      lastbasal = basalvalue;
      date += times.mins(1).msecs;
    }

    const toTempBasal = profile.getTempBasal(to);

    linedata.push({ d: to, b: toTempBasal.totalbasal });
    notemplinedata.push({ d: to, b: toTempBasal.basal });
    basalareadata.push({ d: to, b: toTempBasal.basal });
    tempbasalareadata.push({ d: to, b: toTempBasal.totalbasal });
    comboareadata.push({ d: to, b: toTempBasal.totalbasal });

    const max_linedata = this.d3.max(linedata, (d) => d.b) ?? NaN;
    const max_notemplinedata = this.d3.max(notemplinedata, (d) => d.b) ?? NaN;
    const max =
      Math.max(max_linedata, max_notemplinedata) *
      ("icicle" === mode ? 1 : 1.1);
    chart.maxBasalValue = max;
    chart.yScaleBasals.domain("icicle" === mode ? [0, max] : [max, 0]);

    chart.basals.selectAll("g").remove();
    chart.basals.selectAll(".basalline").remove().data(linedata);
    chart.basals.selectAll(".notempline").remove().data(notemplinedata);
    chart.basals.selectAll(".basalarea").remove().data(basalareadata);
    chart.basals.selectAll(".tempbasalarea").remove().data(tempbasalareadata);
    chart.basals.selectAll(".comboarea").remove().data(comboareadata);

    /** @type {import("d3").Line<Record<"b" | "d", number>>} */
    const valueline = this.d3.line();
    valueline
      .x((d) => chart.xScaleBasals(d.d))
      .y((d) => chart.yScaleBasals(d.b))
      .curve(this.d3.curveStepAfter);

    /** @type {import("d3").Area<Record<"b" | "d", number>>} */
    const area = this.d3.area();
    area
      .x((d) => chart.xScaleBasals(d.d))
      .y0(chart.yScaleBasals(0))
      .y1((d) => chart.yScaleBasals(d.b))
      .curve(this.d3.curveStepAfter);

    const g = chart.basals.append("g");

    g.append("path")
      .attr("class", "line basalline")
      .attr("stroke", "#0099ff")
      .attr("stroke-width", 1)
      .attr("fill", "none")
      .attr("d", valueline(linedata));

    g.append("path")
      .attr("class", "line notempline")
      .attr("stroke", "#0099ff")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3, 3")
      .attr("fill", "none")
      .attr("d", valueline(notemplinedata));

    g.append("path")
      .attr("class", "area basalarea")
      .datum(basalareadata)
      .attr("fill", "#0099ff")
      .attr("fill-opacity", 0.1)
      .attr("stroke-width", 0)
      .attr("d", area);

    g.append("path")
      .attr("class", "area tempbasalarea")
      .datum(tempbasalareadata)
      .attr("fill", "#0099ff")
      .attr("fill-opacity", 0.2)
      .attr("stroke-width", 1)
      .attr("d", area);

    g.append("path")
      .attr("class", "area comboarea")
      .datum(comboareadata)
      .attr("fill", "url(#hash)")
      .attr("fill-opacity", 0.2)
      .attr("stroke-width", 1)
      .attr("d", area);

    client.ddata.tempbasalTreatments?.forEach((t) => {
      // only if basal and focus interval overlap and there is a chance to fit
      if (
        t.duration &&
        t.mills < to &&
        t.mills + times.mins(t.duration).msecs > from
      ) {
        const text = g
          .append("text")
          .attr("class", "tempbasaltext")
          .style("font-size", 15)
          .attr("fill", "#0099ff")
          .attr("text-anchor", "middle")
          .attr("dy", ".35em")
          .attr(
            "x",
            chart.xScaleBasals(
              (Math.max(t.mills, from) +
                Math.min(t.mills + times.mins(t.duration).msecs, to)) /
                2
            )
          )
          .attr("y", 10)
          .text(
            (t.percent ? (t.percent > 0 ? "+" : "") + t.percent + "%" : "") +
              (isNaN(t.absolute) ? "" : Number(t.absolute).toFixed(2) + "U") +
              (t.relative ? "C: +" + t.relative + "U" : "")
          );
        // better hide if not fit
        const textNode = text.node();
        if (
          textNode &&
          textNode.getBBox().width >
            chart.xScaleBasals(t.mills + times.mins(t.duration).msecs) -
              chart.xScaleBasals(t.mills)
        ) {
          text.attr("display", "none");
        }
      }
    });

    client.chart.basals.attr("display", !mode || "none" === mode ? "none" : "");
  }

  /** @protected @param {import("../types").Treatment} d */
  profileTooltip(d) {
    return (
      "<strong>" +
      this.translate("Time") +
      ":</strong> " +
      this.client.formatTime(this.getOrAddDate(d)) +
      "<br/>" +
      (d.eventType
        ? "<strong>" +
          this.translate("Treatment type") +
          ":</strong> " +
          this.translate(this.client.careportal.resolveEventName(d.eventType)) +
          "<br/>"
        : "") +
      (d.endprofile
        ? "<strong>" +
          this.translate("End of profile") +
          ":</strong> " +
          d.endprofile +
          "<br/>"
        : "") +
      (d.profile
        ? "<strong>" +
          this.translate("Profile") +
          ":</strong> " +
          d.profile +
          "<br/>"
        : "") +
      (d.duration
        ? "<strong>" +
          this.translate("Duration") +
          ":</strong> " +
          d.duration +
          this.translate("mins") +
          "<br/>"
        : "") +
      (d.enteredBy
        ? "<strong>" +
          this.translate("Entered By") +
          ":</strong> " +
          d.enteredBy +
          "<br/>"
        : "") +
      (d.notes
        ? "<strong>" + this.translate("Notes") + ":</strong> " + d.notes
        : "")
    );
  }

  /**
   * Please _don't_ call this with the client specified, the client is already
   * stored as a class member
   */
  addTreatmentProfiles(client = this.client) {
    if ((client.profilefunctions.listBasalProfiles()?.length ?? NaN) < 2) {
      return; // do not visualize profiles if there is only one
    }

    if (!client.chart) return;
    const chart = client.chart;

    // calculate position of profile on left side
    const selectedRange = chart.createAdjustedRange();
    let from = selectedRange[0].getTime();
    const to = selectedRange[1].getTime();
    const mult = (to - from) / times.hours(24).msecs;
    from += times.mins(20 * mult).msecs;

    const mode = client.settings.extendedSettings.basal.render;
    const data = client.ddata.profileTreatments?.slice();
    data?.push(
      /** @type {import("../types").Treatment} */
      ({
        //eventType: 'Profile Switch'
        profile: client.profilefunctions.activeProfileToTime(from),
        mills: from,
        first: true,
      })
    );

    client.ddata.profileTreatments?.forEach((d) => {
      if (d.duration && !d.cuttedby) {
        data?.push(
          /** @type {import("../types").Treatment} */
          ({
            cutting: d.profile,
            profile: client.profilefunctions.activeProfileToTime(
              times.mins(d.duration).msecs + d.mills + 1
            ),
            mills: times.mins(d.duration).msecs + d.mills,
            end: true,
          })
        );
      }
    });

    /**
     * @type {import("d3").Selection<
     *   import("d3").BaseType,
     *   import("../types").Treatment,
     *   SVGGElement,
     *   any
     * >}
     */
    const treatProfiles = chart.basals.selectAll(".g-profile");
    if (data) treatProfiles.data(data);

    const topOfText = "icicle" === mode ? chart.maxBasalValue + 0.05 : -0.05;

    /** @param {import("../types").Treatment} t */
    const generateText = (t) => {
      const sign = t.first ? "▲▲▲" : "▬▬▬";

      if (t.cutting) {
        return `${sign}    ${t.cutting}    ►►►    ${t.profile}    ${sign}`;
      } else {
        return `${sign}    ${t.profile}    ${sign}`;
      }
    };

    treatProfiles
      .attr(
        "transform",
        (t) =>
          // Change text of record on left side
          `rotate(-90, ${chart.xScale(t.mills)},${chart.yScaleBasals(topOfText)}) ` +
          `translate(${chart.xScale(t.mills)}, ${chart.yScaleBasals(topOfText)})`
      )
      .text(generateText);

    treatProfiles
      .enter()
      .append("text")
      .attr("class", "g-profile")
      .style("font-size", 15)
      .style("font-weight", "bold")
      .attr("fill", "#0099ff")
      .attr("text-anchor", "end")
      .attr("dy", ".35em")
      .attr(
        "transform",
        (t) =>
          `rotate(-90, ${chart.xScale(t.mills)},${chart.yScaleBasals(topOfText)}) ` +
          `translate(${chart.xScale(t.mills)}, ${chart.yScaleBasals(topOfText)})`
      )
      .text(generateText)
      .on("mouseover", (event, d) => {
        client.tooltip.style("opacity", 0.9);
        client.tooltip
          .html(this.profileTooltip(d))
          .style("left", event.pageX + "px")
          .style("top", event.pageY + 15 + "px");
      })
      .on("mouseout", this.hideTooltip.bind(this));

    treatProfiles.exit().remove();
  }
}

/** @param {ConstructorParameters<typeof Renderer>} args */
module.exports = (...args) => new Renderer(...args);
