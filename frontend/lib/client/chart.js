"use strict";

const times = require("../times");
const d3locales = require("./d3locales");

const PADDING_BOTTOM = 30;
const OPEN_TOP_HEIGHT = 8;
const CONTEXT_MAX = 420;
const CONTEXT_MIN = 36;
const FOCUS_MAX = 510;
const FOCUS_MIN = 30;

const loadTime = Date.now();

class Chart {
  #scrolling = false;
  #scrollNow = 0;
  /** @type {null | ReturnType<Chart['createBrushedRange']>} */
  #scrollBrushExtent = null;
  /** @type {null | ReturnType<Chart['createAdjustedRange']>} */
  #scrollRange = null;
  /**
   *
   * @param {import("./index")} client
   * @param {import("d3")} d3
   * @param {JQueryStatic} $
   */
  constructor(client, d3, $) {
    this.client = client;
    this.d3 = d3;
    this.$ = $;

    /** @type {ReturnType<import("../utils")>} */
    this.utils = client.utils;
    this.renderer = client.renderer;

    this.defs = d3.select("body").append("svg").append("defs");
    this.dashWidth = 5;
    this.#makeDefs();

    this.localeFormatter = d3.timeFormatLocale(
      d3locales.locale(client.settings.language)
    );

    this.extent = client.dataExtent();

    this.yScaleType =
      client.settings.scaleY === "linear" ? d3.scaleLinear : d3.scaleLog;

    /** @type {[number, number]} */
    this.focusYDomain = [
      this.utils.scaleMgdl(FOCUS_MIN),
      this.utils.scaleMgdl(FOCUS_MAX),
    ];
    /** @type {[number, number]} */
    this.contextYDomain = [
      this.utils.scaleMgdl(CONTEXT_MIN),
      this.utils.scaleMgdl(CONTEXT_MAX),
    ];

    this.xScale = d3.scaleTime().domain(this.extent);

    this.focusYDomain = this.#dynamicDomainOrElse(this.focusYDomain);
    this.yScale = this.yScaleType().domain(this.focusYDomain);

    this.xScale2 = d3.scaleTime().domain(this.extent);

    this.contextYDomain = this.#dynamicDomainOrElse(this.contextYDomain);

    this.yScale2 = this.yScaleType().domain(this.contextYDomain);

    this.xScaleBasals = d3.scaleTime().domain(this.extent);
    this.yScaleBasals = this.d3.scaleTime().domain([0, 5]);

    this.formatMillisecond = this.localeFormatter.format(".%L");
    this.formatSecond = this.localeFormatter.format(":%S");
    this.formatMinute =
      client.settings.timeFormat === 24
        ? this.localeFormatter.format("%H:%M")
        : this.localeFormatter.format("%-I:%M");
    this.formatHour =
      client.settings.timeFormat === 24
        ? this.localeFormatter.format("%H:%M")
        : this.localeFormatter.format("%-I %p");
    this.formatDay = this.localeFormatter.format("%a %d");
    this.formatWeek = this.localeFormatter.format("%b %d");
    this.formatMonth = this.localeFormatter.format("%B");
    this.formatYear = this.localeFormatter.format("%Y");

    const tickValues = this.client.ticks(this.client);
    this.xAxis = this.d3
      .axisBottom(this.xScale)
      .tickFormat(this.#tickFormat.bind(this))
      .ticks(6);
    this.yAxis = this.d3
      .axisLeft(this.yScale)
      .tickFormat(this.d3.format("d"))
      .tickValues(tickValues);
    this.xAxis2 = this.d3
      .axisBottom(this.xScale2)
      .tickFormat(this.#tickFormat.bind(this))
      .ticks(6);
    this.yAxis2 = this.d3
      .axisRight(this.yScale2)
      .tickFormat(this.d3.format("d"))
      .tickValues(tickValues);

    this.d3.select("tick").style("z-index", "10000");

    this.brush = this.d3
      .brushX()
      .on("start", this.#brushStarted.bind(this))
      .on("brush", () => {
        if (Date.now() - loadTime > 2000) this.client.loadRetroIfNeeded();
        this.client.brushed();
      })
      .on("end", this.#brushEnded.bind(this));

    this.theBrush = null;

    // create svg and g to contain the chart contents
    this.charts = d3
      .select("#chartContainer")
      .append("svg")
      .append("g")
      .attr("class", "chartContainer");

    this.basals = this.charts.append("g").attr("class", "chart-basals");

    this.focus = this.charts.append("g").attr("class", "chart-focus");
    this.drag = this.focus.append("g").attr("class", "drag-area");

    // create the x axis container
    this.focus.append("g").attr("class", "x axis").style("font-size", "16px");

    // create the y axis container
    this.focus.append("g").attr("class", "y axis").style("font-size", "16px");

    this.context = this.charts.append("g").attr("class", "chart-context");

    // create the x axis container
    this.context.append("g").attr("class", "x axis").style("font-size", "16px");

    // create the y axis container
    this.context.append("g").attr("class", "y axis").style("font-size", "16px");

    this.context = this.charts.append("g").attr("class", "chart-context");

    this.theBrush = this.context
      .append("g")
      .attr("class", "x brush")
      .call(this.brush)
      .call((g) =>
        g
          .select(".overlay")
          .datum({ type: "selection" })
          .on("mousedown touchstart", this.#beforeBrushStarted.bind(this))
      );
  }

  #makeDefs() {
    this.defs
      .append("pattern")
      .attr("id", "hash")
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 6)
      .attr("height", 6)
      .attr("x", 0)
      .attr("y", 0)
      .append("g")
      .style("fill", "none")
      .style("stroke", "#0099ff")
      .style("stroke-width", 2)
      .append("path")
      .attr("d", "M0,0 l" + this.dashWidth + "," + this.dashWidth)
      .append("path")
      .attr(
        "d",
        "M" + this.dashWidth + ",0 l-" + this.dashWidth + "," + this.dashWidth
      );

    // arrow head
    this.defs
      .append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 5)
      .attr("refY", 0)
      .attr("markerWidth", 8)
      .attr("markerHeight", 8)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("class", "arrowHead");
  }

  /** @param {MouseEvent | PointerEvent | Touch} event */
  #beforeBrushStarted(event) {
    // go ahead and move the brush because
    // a single click will not execute the brush event
    const now = new Date();
    const dx =
      this.xScale2(now) -
      this.xScale2(new Date(now.getTime() - this.client.focusRangeMS));

    const cx = this.d3.pointer(event)[0];
    const x0 = cx - dx / 2;
    const x1 = cx + dx / 2;

    const range = this.xScale2.range();
    const X0 = range[0];
    const X1 = range[1];

    if (x0 < X0) this.theBrush.call(this.brush.move, [X0, X0 + dx]);
    else if (x1 > X1) this.theBrush.call(this.brush.move, [X1 - dx, X1]);
    else this.theBrush.call(this.brush.move, [x0, x1]);
  }

  #brushStarted() {
    // update the opacity of the context data points to brush extent
    this.context
      .selectAll("circle")
      .data(this.client.entries)
      .style("opacity", 1);
  }

  #brushEnded() {
    // update the opacity of the context data points to brush extent
    const selectedRange = this.createAdjustedRange();
    const from = selectedRange[0].getTime();
    const to = selectedRange[1].getTime();

    this.context
      .selectAll("circle")
      .data(this.client.entries)
      .style("opacity", (d) => {
        return this.renderer.highlightBrushPoints(d, from, to);
      });
  }

  /** @returns {[number, number]} */
  #dynamicDomain() {
    // allow y-axis to extend all the way to the top of the basal area, but leave room to display highest value
    const mult = 1.15;
    const targetTop = this.client.settings.thresholds.bgTargetTop;
    // filter to only use actual SGV's (not rawbg's) to set the view window.
    // can switch to Logarithmic (non-dynamic) to see anything that doesn't fit in the dynamicDomain
    /** @type {import("../types").Entry[]} */
    const entries = this.client.entries;
    const mgdlMax = Math.max(
      ...entries.filter((d) => d.type === "sgv").map((d) => d.mgdl)
    );

    // use the 99th percentile instead of max to avoid rescaling for 1 flukey data point
    // need to sort this.client.entries by mgdl first
    //, mgdlMax = d3.quantile(this.client.entries, 0.99, (d) => d.mgdl);

    return [
      this.utils.scaleMgdl(FOCUS_MIN),
      Math.max(
        this.utils.scaleMgdl(mgdlMax * mult),
        this.utils.scaleMgdl(targetTop * mult)
      ),
    ];
  }

  /** @param {[number, number]} defaultDomain */
  #dynamicDomainOrElse(defaultDomain) {
    if (
      this.client.entries &&
      this.client.entries.length &&
      (this.client.settings.scaleY === "linear" ||
        this.client.settings.scaleY === "log-dynamic")
    ) {
      return this.#dynamicDomain();
    } else {
      return defaultDomain;
    }
  }

  /** @param {Date | import("d3").NumberValue} dateOrNumber */
  #tickFormat(dateOrNumber) {
    const date = new Date(dateOrNumber.valueOf());
    // if(typeof dateOrNumber === "object")  date = date.valueOf();

    if (this.d3.timeSecond(date) < date) return this.formatMillisecond(date);
    if (this.d3.timeMinute(date) < date) return this.formatSecond(date);
    if (this.d3.timeHour(date) < date) return this.formatMinute(date);
    if (this.d3.timeDay(date) < date) return this.formatHour(date);
    if (this.d3.timeMonth(date) < date) {
      if (this.d3.timeWeek(date) < date) return this.formatDay(date);
      else return this.formatWeek(date);
    }
    if (this.d3.timeYear(date) < date) return this.formatMonth(date);

    return this.formatYear(date);
  }

  /** @param {number} delta */
  futureOpacity(delta) {
    if (delta < 0) return null;
    const scale = this.d3
      .scaleLinear()
      .domain([times.mins(25).msecs, times.mins(60).msecs])
      .range([0.8, 0.1]);

    return scale(delta);
  }

  /** @returns {[Date, Date]} */
  createBrushedRange() {
    const brushNode = this.theBrush.node();

    const brushedRange = /** @type {[number, number] | null} */ (
      brushNode && this.d3.brushSelection(brushNode)
    );
    const dataExtent = this.client.dataExtent();
    const range = brushedRange?.map(this.xScale2.invert) ?? [
      new Date(dataExtent[1].getTime() - this.client.focusRangeMS),
      dataExtent[1],
    ];

    const end = this.inRetroMode()
      ? range[1].getTime()
      : this.client.now > dataExtent[1].getTime()
        ? this.client.now
        : dataExtent[1].getTime();

    return [new Date(end - this.client.focusRangeMS), new Date(end)];
  }

  createAdjustedRange() {
    const brushedRange = this.createBrushedRange();
    return [
      brushedRange[0],
      new Date(Math.max(brushedRange[1].getTime(), this.client.forecastTime)),
    ];
  }

  inRetroMode() {
    const brushNode = this.theBrush.node();
    const brushedRange = brushNode && this.d3.brushSelection(brushNode);

    if (!brushedRange || Array.isArray(brushedRange[1]) || !this.xScale2)
      return false;

    const maxTime = this.xScale2.domain()[1].getTime();
    const brushTime = this.xScale2.invert(brushedRange[1]).getTime();

    return brushTime < maxTime;
  }

  /** @param {boolean} [init] */
  update(init) {
    if (this.client.documentHidden && !init) {
      console.info("Document Hidden, not updating - " + new Date());
      return;
    }

    this.setForecastTime();

    const chartContainer = this.$("#chartContainer");
    if (!chartContainer.length) {
      console.error("chartContainer not found");
      return;
    }

    // get current data range
    const dataRange = this.client.dataExtent();
    const chartContainerRect = chartContainer[0].getBoundingClientRect();
    const chartWidth = chartContainerRect.width;
    const chartHeight = chartContainerRect.height - PADDING_BOTTOM;

    // get the height of each chart based on its container size ratio
    const focusHeight = (this.focusHeight = chartHeight * 0.7);
    const contextHeight = (this.contextHeight = chartHeight * 0.3);
    this.basalsHeight = focusHeight / 4;

    // get current brush extent
    const currentBrushExtent = this.createBrushedRange();

    // only redraw if the chart size has changed
    if (
      this.prevChartWidth !== chartWidth ||
      this.prevChartHeight !== chartHeight
    ) {
      // if rotated
      if (this.prevChartWidth !== chartWidth) {
        this.client.browserUtils.closeLastOpenedDrawer();
      }

      /** @type {number | undefined} */
      this.prevChartWidth = chartWidth;
      /** @type {number | undefined} */
      this.prevChartHeight = chartHeight;

      this.#drawChart({
        chartWidth,
        chartHeight,
        focusHeight,
        contextHeight,
        currentBrushExtent,
        init,
      });
    }

    this.updateContext(dataRange);
    this.xScaleBasals.domain(dataRange);
    this.theBrush.call(this.brush.move, currentBrushExtent.map(this.xScale2));
  }

  /**
   * @param {object} opts
   * @param {number} opts.chartWidth
   * @param {number} opts.chartHeight
   * @param {number} opts.focusHeight
   * @param {number} opts.contextHeight
   * @param {[Date, Date]} opts.currentBrushExtent
   * @param {boolean} [opts.init]
   */
  #drawChart({
    chartWidth,
    chartHeight,
    focusHeight,
    contextHeight,
    currentBrushExtent,
    init,
  }) {
    //set the width and height of the SVG element
    this.charts
      .attr("width", chartWidth)
      .attr("height", chartHeight + PADDING_BOTTOM);

    // ranges are based on the width and height available so reset
    this.xScale.range([0, chartWidth]);
    this.xScale2.range([0, chartWidth]);
    this.xScaleBasals.range([0, chartWidth]);
    this.yScale.range([focusHeight, 0]);
    this.yScale2.range([contextHeight, 0]);
    this.yScaleBasals.range([0, focusHeight / 4]);

    if (init) this.#initChart({ chartWidth, focusHeight, contextHeight });
    else
      this.#redrawChart({
        chartWidth,
        focusHeight,
        contextHeight,
        currentBrushExtent,
      });
  }

  /**
   * @param {object} opts
   * @param {number} opts.chartWidth
   * @param {number} opts.focusHeight
   * @param {number} opts.contextHeight
   */
  #initChart({ chartWidth, focusHeight, contextHeight }) {
    // if first run then just display axis with no transition
    this.focus
      .select("g.x")
      .attr("transform", "translate(0," + focusHeight + ")")
      .call(this.xAxis);

    this.focus
      .select("g.y")
      .attr("transform", "translate(" + chartWidth + ",0)")
      .call(this.yAxis);

    // if first run then just display axis with no transition
    this.context.attr("transform", "translate(0," + focusHeight + ")");

    this.context
      .select("g.x")
      .attr("transform", "translate(0," + contextHeight + ")")
      .call(this.xAxis2);

    this.theBrush = this.context
      .append("g")
      .attr("class", "x brush")
      .call(this.brush)
      .call((g) =>
        g
          .select(".overlay")
          .datum({ type: "selection" })
          .on("mousedown touchstart", this.#beforeBrushStarted.bind(this))
      );

    this.theBrush
      .selectAll("rect")
      .attr("y", 0)
      .attr("height", contextHeight)
      .attr("width", "100%");

    // disable resizing of brush
    this.context.select(".x.brush").select(".overlay").style("cursor", "move");
    this.context
      .select(".x.brush")
      .selectAll(".handle")
      .style("cursor", "move");

    this.context
      .select(".x.brush")
      .select(".selection")
      .style("visibility", "hidden");

    // add a line that marks the current time
    this.focus
      .append("line")
      .attr("class", "now-line")
      .attr("x1", this.xScale(new Date(this.client.now)))
      .attr("y1", this.yScale(this.focusYDomain[0]))
      .attr("x2", this.xScale(new Date(this.client.now)))
      .attr("y2", this.yScale(this.focusYDomain[1]))
      .style("stroke-dasharray", "3, 3")
      .attr("stroke", "grey");

    // add a y-axis line that shows the high bg threshold
    this.focus
      .append("line")
      .attr("class", "high-line")
      .attr("x1", this.xScale.range()[0])
      .attr(
        "y1",
        this.yScale(
          this.utils.scaleMgdl(this.client.settings.thresholds.bgHigh)
        )
      )
      .attr("x2", this.xScale.range()[1])
      .attr(
        "y2",
        this.yScale(
          this.utils.scaleMgdl(this.client.settings.thresholds.bgHigh)
        )
      )
      .style("stroke-dasharray", "1, 6")
      .attr("stroke", "#777");

    // add a y-axis line that shows the high bg threshold
    this.focus
      .append("line")
      .attr("class", "target-top-line")
      .attr("x1", this.xScale.range()[0])
      .attr(
        "y1",
        this.yScale(
          this.utils.scaleMgdl(this.client.settings.thresholds.bgTargetTop)
        )
      )
      .attr("x2", this.xScale.range()[1])
      .attr(
        "y2",
        this.yScale(
          this.utils.scaleMgdl(this.client.settings.thresholds.bgTargetTop)
        )
      )
      .style("stroke-dasharray", "3, 3")
      .attr("stroke", "grey");

    // add a y-axis line that shows the low bg threshold
    this.focus
      .append("line")
      .attr("class", "target-bottom-line")
      .attr("x1", this.xScale.range()[0])
      .attr(
        "y1",
        this.yScale(
          this.utils.scaleMgdl(this.client.settings.thresholds.bgTargetBottom)
        )
      )
      .attr("x2", this.xScale.range()[1])
      .attr(
        "y2",
        this.yScale(
          this.utils.scaleMgdl(this.client.settings.thresholds.bgTargetBottom)
        )
      )
      .style("stroke-dasharray", "3, 3")
      .attr("stroke", "grey");

    // add a y-axis line that shows the low bg threshold
    this.focus
      .append("line")
      .attr("class", "low-line")
      .attr("x1", this.xScale.range()[0])
      .attr(
        "y1",
        this.yScale(this.utils.scaleMgdl(this.client.settings.thresholds.bgLow))
      )
      .attr("x2", this.xScale.range()[1])
      .attr(
        "y2",
        this.yScale(this.utils.scaleMgdl(this.client.settings.thresholds.bgLow))
      )
      .style("stroke-dasharray", "1, 6")
      .attr("stroke", "#777");

    // add a y-axis line that opens up the brush extent from the context to the focus
    this.context
      .append("line")
      .attr("class", "open-top")
      .attr("stroke", "#111")
      .attr("stroke-width", OPEN_TOP_HEIGHT);

    // add a x-axis line that closes the the brush container on left side
    this.context
      .append("line")
      .attr("class", "open-left")
      .attr("stroke", "white");

    // add a x-axis line that closes the the brush container on right side
    this.context
      .append("line")
      .attr("class", "open-right")
      .attr("stroke", "white");

    // add a line that marks the current time
    this.context
      .append("line")
      .attr("class", "now-line")
      .attr("x1", this.xScale(new Date(this.client.now)))
      .attr("y1", this.yScale2(this.contextYDomain[0]))
      .attr("x2", this.xScale(new Date(this.client.now)))
      .attr("y2", this.yScale2(this.contextYDomain[1]))
      .style("stroke-dasharray", "3, 3")
      .attr("stroke", "grey");

    const dataRange = this.client.dataExtent();
    // add a y-axis line that shows the high bg threshold
    this.context
      .append("line")
      .attr("class", "high-line")
      .attr("x1", this.xScale(dataRange[0]))
      .attr(
        "y1",
        this.yScale2(
          this.utils.scaleMgdl(this.client.settings.thresholds.bgTargetTop)
        )
      )
      .attr("x2", this.xScale(dataRange[1]))
      .attr(
        "y2",
        this.yScale2(
          this.utils.scaleMgdl(this.client.settings.thresholds.bgTargetTop)
        )
      )
      .style("stroke-dasharray", "3, 3")
      .attr("stroke", "grey");

    // add a y-axis line that shows the low bg threshold
    this.context
      .append("line")
      .attr("class", "low-line")
      .attr("x1", this.xScale(dataRange[0]))
      .attr(
        "y1",
        this.yScale2(
          this.utils.scaleMgdl(this.client.settings.thresholds.bgTargetBottom)
        )
      )
      .attr("x2", this.xScale(dataRange[1]))
      .attr(
        "y2",
        this.yScale2(
          this.utils.scaleMgdl(this.client.settings.thresholds.bgTargetBottom)
        )
      )
      .style("stroke-dasharray", "3, 3")
      .attr("stroke", "grey");
  }

  /**
   * for non-initial updates, use a transition to animate the axes to the new position
   * @param {object} opts
   * @param {number} opts.chartWidth
   * @param {number} opts.focusHeight
   * @param {number} opts.contextHeight
   * @param {[Date, Date]} opts.currentBrushExtent
   */
  #redrawChart({ chartWidth, focusHeight, contextHeight, currentBrushExtent }) {
    this.focus
      .select("g.x")
      .attr("transform", "translate(0," + focusHeight + ")")
      .call(this.xAxis);

    this.focus
      .select("g.y")
      .attr("transform", "translate(" + chartWidth + ", 0)")
      .call(this.yAxis);

    this.context.attr("transform", "translate(0," + focusHeight + ")");

    this.context
      .select("g.x")
      .attr("transform", "translate(0," + contextHeight + ")")
      .call(this.xAxis2);

    this.basals;

    // reset brush location
    this.theBrush.selectAll("rect").attr("y", 0).attr("height", contextHeight);

    // console.log('this.update(): Redrawing old brush with new dimensions: ', currentBrushExtent);

    // redraw old brush with new dimensions
    this.theBrush.call(this.brush.move, currentBrushExtent.map(this.xScale2));

    // transition lines to correct location
    this.focus
      .select(".high-line")
      .attr("x1", this.xScale.range()[0])
      .attr(
        "y1",
        this.yScale(
          this.utils.scaleMgdl(this.client.settings.thresholds.bgHigh)
        )
      )
      .attr("x2", this.xScale.range()[1])
      .attr(
        "y2",
        this.yScale(
          this.utils.scaleMgdl(this.client.settings.thresholds.bgHigh)
        )
      );

    this.focus
      .select(".target-top-line")
      .attr("x1", this.xScale.range()[0])
      .attr(
        "y1",
        this.yScale(
          this.utils.scaleMgdl(this.client.settings.thresholds.bgTargetTop)
        )
      )
      .attr("x2", this.xScale.range()[1])
      .attr(
        "y2",
        this.yScale(
          this.utils.scaleMgdl(this.client.settings.thresholds.bgTargetTop)
        )
      );

    this.focus
      .select(".target-bottom-line")
      .attr("x1", this.xScale.range()[0])
      .attr(
        "y1",
        this.yScale(
          this.utils.scaleMgdl(this.client.settings.thresholds.bgTargetBottom)
        )
      )
      .attr("x2", this.xScale.range()[1])
      .attr(
        "y2",
        this.yScale(
          this.utils.scaleMgdl(this.client.settings.thresholds.bgTargetBottom)
        )
      );

    this.focus
      .select(".low-line")
      .attr("x1", this.xScale.range()[0])
      .attr(
        "y1",
        this.yScale(this.utils.scaleMgdl(this.client.settings.thresholds.bgLow))
      )
      .attr("x2", this.xScale.range()[1])
      .attr(
        "y2",
        this.yScale(this.utils.scaleMgdl(this.client.settings.thresholds.bgLow))
      );

    const currentRange = this.createAdjustedRange();
    // transition open-top line to correct location
    this.context
      .select(".open-top")
      .attr("x1", this.xScale2(currentRange[0]))
      .attr(
        "y1",
        this.yScale2(this.utils.scaleMgdl(CONTEXT_MAX)) +
          Math.floor(OPEN_TOP_HEIGHT / 2.0) -
          1
      )
      .attr("x2", this.xScale2(currentRange[1]))
      .attr(
        "y2",
        this.yScale2(this.utils.scaleMgdl(CONTEXT_MAX)) +
          Math.floor(OPEN_TOP_HEIGHT / 2.0) -
          1
      );

    // transition open-left line to correct location
    this.context
      .select(".open-left")
      .attr("x1", this.xScale2(currentRange[0]))
      .attr("y1", this.yScale2(this.contextYDomain[0]))
      .attr("x2", this.xScale2(currentRange[0]))
      .attr("y2", this.yScale2(this.contextYDomain[1]));

    // transition open-right line to correct location
    this.context
      .select(".open-right")
      .attr("x1", this.xScale2(currentRange[1]))
      .attr("y1", this.yScale2(this.contextYDomain[0]))
      .attr("x2", this.xScale2(currentRange[1]))
      .attr("y2", this.yScale2(this.contextYDomain[1]));

    const dataRange = this.client.dataExtent();
    // transition high line to correct location
    this.context
      .select(".high-line")
      .attr("x1", this.xScale2(dataRange[0]))
      .attr(
        "y1",
        this.yScale2(
          this.utils.scaleMgdl(this.client.settings.thresholds.bgTargetTop)
        )
      )
      .attr("x2", this.xScale2(dataRange[1]))
      .attr(
        "y2",
        this.yScale2(
          this.utils.scaleMgdl(this.client.settings.thresholds.bgTargetTop)
        )
      );

    // transition low line to correct location
    this.context
      .select(".low-line")
      .attr("x1", this.xScale2(dataRange[0]))
      .attr(
        "y1",
        this.yScale2(
          this.utils.scaleMgdl(this.client.settings.thresholds.bgTargetBottom)
        )
      )
      .attr("x2", this.xScale2(dataRange[1]))
      .attr(
        "y2",
        this.yScale2(
          this.utils.scaleMgdl(this.client.settings.thresholds.bgTargetBottom)
        )
      );
  }

  /** @param {ReturnType<import("./index")['dataExtent']>} dataRange */
  updateContext(dataRange = this.client.dateExtent()) {
    if (this.client.documentHidden) {
      console.info("Document Hidden, not updating - " + new Date());
      return;
    }

    this.xScale2.domain(dataRange);
    this.renderer.addContextCircles();
    this.context.select("g.x").call(this.xAxis2);
  }

  #scrollUpdate() {
    const nowDate = this.#scrollNow;

    const currentBrushExtent =
      this.#scrollBrushExtent ?? this.createBrushedRange();
    const currentRange = this.#scrollRange ?? this.createAdjustedRange();

    this.setForecastTime();

    this.xScale.domain(currentRange);

    this.focusYDomain = this.#dynamicDomainOrElse(this.focusYDomain);

    this.yScale.domain(this.focusYDomain);
    this.xScaleBasals.domain(currentRange);

    // remove all insulin/carb treatment bubbles so that they can be redrawn to correct location
    this.d3.selectAll(".path").remove();

    // transition open-top line to correct locatoin
    const openTopYCoord =
      this.yScale2(this.contextYDomain[1]) +
      Math.floor(OPEN_TOP_HEIGHT / 2) -
      1;
    this.context
      .select(".open-top")
      .attr("x1", this.xScale2(currentRange[0]))
      .attr("y1", openTopYCoord)
      .attr("x2", this.xScale2(currentRange[1]))
      .attr("y2", openTopYCoord);

    // transition open-left line to correct location
    this.context
      .select(".open-left")
      .attr("x1", this.xScale2(currentRange[0]))
      .attr("y1", this.yScale2(this.contextYDomain[0]))
      .attr("x2", this.xScale2(currentRange[0]))
      .attr("y2", this.yScale2(this.contextYDomain[1]));

    // transition open-right line to correct location
    this.context
      .select(".open-right")
      .attr("x1", this.xScale2(currentRange[1]))
      .attr("y1", this.yScale2(this.contextYDomain[0]))
      .attr("x2", this.xScale2(currentRange[1]))
      .attr("y2", this.yScale2(this.contextYDomain[1]));

    this.focus
      .select(".now-line")
      .attr("x1", this.xScale(nowDate))
      .attr("y1", this.yScale(this.focusYDomain[0]))
      .attr("x2", this.xScale(nowDate))
      .attr("y2", this.yScale(this.focusYDomain[1]));

    this.context
      .select(".now-line")
      .attr("x1", this.xScale2(currentBrushExtent[1]))
      .attr("y1", this.yScale2(this.contextYDomain[0]))
      .attr("x2", this.xScale2(currentBrushExtent[1]))
      .attr("y2", this.yScale2(this.contextYDomain[1]));

    // update x,y axis
    this.focus.select("g.x.axis").call(this.xAxis);
    this.focus.select("g.y.axis").call(this.yAxis);

    this.renderer.addBasals(this.client);

    this.renderer.addFocusCircles();
    this.renderer.addTreatmentCircles(nowDate);
    this.renderer.addTreatmentProfiles(this.client);
    this.renderer.drawTreatments(this.client);

    this.theBrush.call(this.brush.move, currentBrushExtent.map(this.xScale2));

    this.#scrolling = false;
  }

  /** @param {number} nowDate */
  scroll(nowDate) {
    this.#scrollNow = nowDate;
    this.#scrollBrushExtent = this.createBrushedRange();
    this.#scrollRange = this.createAdjustedRange();

    if (!this.#scrolling) requestAnimationFrame(this.#scrollUpdate.bind(this));

    this.#scrolling = true;
  }

  getMaxForecastMills() {
    //limt lookahead to the same as lookback
    const [_, to] = this.createBrushedRange();
    return to.getTime() + this.client.focusRangeMS;
  }

  getForecastData() {
    const maxForecastAge = this.getMaxForecastMills();
    /** @type {string[]} */
    const pointTypes = this.client.settings.showForecast?.split(" ") ?? [];

    /** @type {import("../plugins/pluginbase").ForecastPoint[]}*/
    const points = pointTypes.reduce(
      /** @param {import("../plugins/pluginbase").ForecastPoint[]} points @param {string} type */
      (points, type) => {
        return [
          ...points,
          ...(this.client.sbx.pluginBase.forecastPoints[type] ?? []),
        ];
      },
      []
    );

    return points.filter((point) => point.mills < maxForecastAge);
  }

  setForecastTime() {
    if (!this.client.sbx.pluginBase.forecastPoints) return;

    const shownForecastPoints = this.getForecastData();

    // Get maximum time we will allow projected forward in time
    // based on the number of hours the user has selected to show.
    const maxForecastMills = this.getMaxForecastMills();

    const selectedRange = this.createBrushedRange();
    const to = selectedRange[1].getTime();

    // Default min forecast projection times to the default amount of time to forecast
    const minForecastMills = to + this.client.defaultForecastTime;
    let availForecastMills = 0;

    // Determine what the maximum forecast time is that is available in the forecast data
    if (shownForecastPoints.length) {
      availForecastMills = Math.max(
        ...shownForecastPoints.map((point) => point.mills)
      );
    }

    // Limit the amount shown to the maximum time allowed to be projected forward based
    // on the number of hours the user has selected to show
    const forecastMills = Math.min(availForecastMills, maxForecastMills);

    // Don't allow the forecast time to go below the minimum forecast time
    this.client.forecastTime = Math.max(forecastMills, minForecastMills);
  }
}

/** @param {ConstructorParameters<typeof Chart>} args */
module.exports = (...args) => new Chart(...args);
