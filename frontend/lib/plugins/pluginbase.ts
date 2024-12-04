"use strict";

import type d3 from "d3";
import type { Plugin } from ".";
import _map from "lodash/map";
import _each from "lodash/each";

var TOOLTIP_WIDTH = 275; //min-width + padding

export type ForecastPoint = {
  color?: string;
  info: { type: string; label: string };
  mgdl: number;
  mills: number;
  type: "forecast";
};

type UpdatePillTextOptions = {
  hide?: boolean;
  pillClass?: string;
  info?: { label: string; value: string }[];
  label?: string;
  directText?: boolean;
  directHTML?: boolean;

  value?: string;
  labelClass?: string;
  valueClass?: string;
};

export interface PluginBase {
  forecastInfos: any[];
  forecastPoints: Record<string, ForecastPoint[]>;
  updatePillText(plugin: Plugin, options: UpdatePillTextOptions): void;
  addForecastPoints(
    points: ForecastPoint[],
    info: { label: string; type: string }
  ): void;
}

export default function init(
  majorPills: JQuery<HTMLElement>,
  minorPills: JQuery<HTMLElement>,
  statusPills: JQuery<HTMLElement>,
  bgStatus: JQuery<HTMLElement>,
  tooltip: d3.Selection<HTMLDivElement, unknown, HTMLElement, any>
): PluginBase {
  var pluginBase: Partial<PluginBase> &
    Pick<PluginBase, "forecastInfos" | "forecastPoints"> = {
    forecastInfos: [],
    forecastPoints: {},
  };

  function findOrCreatePill(plugin: Plugin) {
    var container: JQuery<HTMLElement> | null = null;

    if (plugin.pluginType === "pill-major") {
      container = majorPills;
    } else if (plugin.pluginType === "pill-status") {
      container = statusPills;
    } else if (plugin.pluginType === "bg-status") {
      container = bgStatus;
    } else {
      container = minorPills;
    }

    var pillName = "span.pill." + plugin.name;
    var pill = container.find(pillName);

    var classes = "pill " + plugin.name;

    if (!pill || pill.length === 0) {
      pill = $('<span class="' + classes + '">');
      var pillLabel = $("<label></label>");
      var pillValue = $("<em></em>");
      if (plugin.pillFlip) {
        pill.append(pillValue);
        pill.append(pillLabel);
      } else {
        pill.append(pillLabel);
        pill.append(pillValue);
      }

      container.append(pill);
    } else {
      //reset in case a pill class was added and needs to be removed
      pill.attr("class", classes);
    }

    return pill;
  }

  pluginBase.updatePillText = function updatePillText(plugin, options) {
    var pill = findOrCreatePill(plugin);

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
          .text(options.value);
      }
    }

    if (options.info && options.info.length) {
      var html = _map(options.info, function mapInfo(i) {
        return "<strong>" + i.label + "</strong> " + i.value;
      }).join("<br/>\n");

      pill.mouseover(function pillMouseover(event) {
        tooltip.style("opacity", 0.9);

        const tooltipNode = tooltip.node();
        if (!tooltipNode) return;
        var windowWidth = $(tooltipNode).parent().parent().width() ?? 0;
        var left =
          event.pageX + TOOLTIP_WIDTH < windowWidth
            ? event.pageX
            : windowWidth - TOOLTIP_WIDTH - 10;
        tooltip
          .html(html)
          .style("left", left + "px")
          .style("top", event.pageY + 15 + "px");
      });

      pill.mouseout(function pillMouseout() {
        tooltip.style("opacity", 0);
      });
    } else {
      pill.off("mouseover");
    }
  };

  pluginBase.addForecastPoints = function addForecastPoints(
    points,
    info
  ): void {
    _each(points, function eachPoint(point) {
      point.type = "forecast";
      point.info = info;
      if (point.mgdl < 13) {
        point.color = "transparent";
      }
    });

    pluginBase.forecastInfos.push(info);
    pluginBase.forecastPoints[info.type] = points;
  };

  return pluginBase as PluginBase;
}
