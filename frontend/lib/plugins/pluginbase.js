"use strict";

const TOOLTIP_WIDTH = 275; //min-width + padding

/**
 * @typedef ForecastPoint
 * @property {string} type
 * @property {ForecastInfo} info
 * @property {number} mgdl
 * @property {string} color
 * @property {number} mills
 */
/** @typedef {{ label: string; value?: string; type: string }} ForecastInfo */

class PluginBase {
  /**
   * @param {JQuery<HTMLElement>} majorPills
   * @param {JQuery<HTMLElement>} minorPills
   * @param {JQuery<HTMLElement>} statusPills
   * @param {JQuery<HTMLElement>} bgStatus
   * @param {import("d3").Selection<HTMLElement, any, HTMLElement, any>} tooltip
   */
  constructor(majorPills, minorPills, statusPills, bgStatus, tooltip) {
    this.majorPills = majorPills;
    this.minorPills = minorPills;
    this.statusPills = statusPills;
    this.bgStatus = bgStatus;
    this.tooltip = tooltip;

    /** @type {ForecastInfo[]} */
    this.forecastInfos = [];
    /** @type {Record<string, ForecastPoint[]>} */
    this.forecastPoints = {};
  }
  /** @param {import("../types").Plugin} plugin */
  #getContainerForPlugin(plugin) {
    switch (plugin.pluginType) {
      case "pill-major":
        return this.majorPills;
      case "pill-status":
        return this.statusPills;
      case "bg-status":
        return this.bgStatus;
      default:
        return this.minorPills;
    }
  }

  /** @param {JQuery<HTMLElement>} container @param {{pillFlip?: boolean}} [pots] */
  #createPill(container, { pillFlip } = { pillFlip: false }) {
    const pill = $("<span></span>");
    const pillLabel = $("<label></label>");
    const pillValue = $("<em></em>");
    if (pillFlip) {
      pill.append(pillValue);
      pill.append(pillLabel);
    } else {
      pill.append(pillLabel);
      pill.append(pillValue);
    }

    container.append(pill);
  }

  /** @param {import("../types").Plugin} plugin */
  findOrCreatePill(plugin) {
    const container = this.#getContainerForPlugin(plugin);

    const pill =
      container.find(`span.pill.${plugin.name}`) ??
      this.#createPill(container, plugin);

    const classes = "pill " + plugin.name;
    pill.attr("class", classes);

    return pill;
  }

  /**
   * @typedef UpdatePillTextOptionsBase
   * @property {boolean} [hide]
   * @property {string} [pillClass]
   * @property {{ label: string; value: string }[]} [info]
   */
  /**
   * @typedef {UpdatePillTextOptionsBase & {
   *   labelClass: string;
   *   valueClass: string;
   *   directHTML?: never;
   *   directText?: never;
   *   label: string;
   *   value: string;
   * }} UpdatePillTextOptionsNoDirect
   */
  /**
   * @typedef {UpdatePillTextOptionsBase & {
   *   directHTML: true;
   *   directText?: never;
   *   label: string;
   * }} UpdatePillTextOptionsDirectHTML
   */
  /**
   * @typedef {UpdatePillTextOptionsBase & {
   *   directHTML?: never;
   *   directText: true;
   *   label: string;
   * }} UpdatePillTextOptionsDirectText
   */
  /**
   * @typedef {UpdatePillTextOptionsNoDirect
   *   | UpdatePillTextOptionsDirectHTML
   *   | UpdatePillTextOptionsDirectText
   *   | (UpdatePillTextOptionsBase & {
   *       label?: never;
   *     })} UpdatePillTextOptions
   */
  /**
   * @param {import("../types").Plugin} plugin @param {UpdatePillTextOptions}
   *   options
   */
  updatePillText(plugin, options) {
    const pill = this.findOrCreatePill(plugin);

    if (options.hide) {
      pill.addClass("hidden");
    } else {
      pill.removeClass("hidden");
    }

    pill.addClass(options.pillClass);

    if (options.directHTML) {
      pill.html(options.label);
    } else {
      if (options.directText) {
        pill.text(options.label);
      } else {
        pill
          .find("label")
          .attr("class", options.labelClass)
          .text(options.label);
        pill
          .find("em")
          .attr("class", options.valueClass)
          .toggle(options.value != null)
          .text(options.value?.toString());
      }
    }

    if (options.info && options.info.length) {
      const html = options.info
        .map((i) => `<strong>${i.label}</strong>${i.value}`)
        .join("<br/>\n");

      pill.on("mouseover", (event) => {
        this.tooltip.style("opacity", 0.9);
        const tooltipNode = this.tooltip.node();
        if (!tooltipNode) return;
        const windowWidth = $(tooltipNode).parent().parent().width() ?? 0;
        const left =
          event.pageX + TOOLTIP_WIDTH < windowWidth
            ? event.pageX
            : windowWidth - TOOLTIP_WIDTH - 10;
        this.tooltip
          .html(html)
          .style("left", left + "px")
          .style("top", event.pageY + 15 + "px");
      });

      pill.on("mouseout", () => {
        this.tooltip.style("opacity", 0);
      });
    } else {
      pill.off("mouseover");
    }
  }

  /**
   * @param {(Omit<ForecastPoint, 'type' | 'info'> & Partial<ForecastPoint>)[]} points
   * @param {ForecastInfo} info
   */
  addForecastPoints(points, info) {
    this.forecastInfos.push(info);

    this.forecastPoints[info.type] = points.map((p) => ({
      ...p,
      type: "forecast",
      info,
      ...(p.mgdl < 13 && { color: "transparent" }),
    }));
  }
}

/** @param {ConstructorParameters<typeof PluginBase>} args */
module.exports = (...args) => new PluginBase(...args);
