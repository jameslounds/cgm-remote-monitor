/**
 * @vitest-environment happy-dom
 */

import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it } from "vitest";

import * as d3 from "d3";
import fs from "fs";
import path from "path";

import initPluginBase from "../lib/plugins/pluginbase";
import { removeScriptTags } from "./setup/dom";

const indexHTML = fs
  .readFileSync(path.resolve("./bundle/index.html"))
  .toString();

describe("pluginbase", () => {
  beforeEach(async (ctx) => {
    document.documentElement.innerHTML = removeScriptTags(indexHTML);
    ctx.tooltip = d3
      .select("body")
      .append("div")
      .attr("class", "tooltip")
      .style("opacity", 0);
    ctx.pluginBase = initPluginBase(
      $(".majorPills"),
      $(".minorPills"),
      $(".statusPills"),
      $(".bgStatus"),
      ctx.tooltip
    );
  });

  it.for([
    { pluginType: "pill-major", selector: ".majorPills" },
    { pluginType: "pill-minor", selector: ".minorPills" },
    { pluginType: "unrecognised", selector: ".minorPills" },
    { pluginType: "pill-status", selector: ".statusPills" },
    { pluginType: "bg-status", selector: ".bgStatus" },
  ])(
    "sets $pluginType pill correctly",
    ({ pluginType, selector }, { pluginBase }) => {
      const el = document.querySelector(selector);
      const initialChildrenLength = el.children.length;

      pluginBase.updatePillText(
        {
          name: "fake",
          label: "Insulin-on-Board",
          pluginType: pluginType,
        },
        {
          value: "123",
          label: "TEST",
          info: [{ label: "Label", value: "Value" }],
        }
      );

      expect(el).toHaveTextContent("TEST123");
      expect(el.children.length).toBe(initialChildrenLength + 1);

      [".minorPills", ".majorPills", ".statusPills"].forEach((s) => {
        if (selector !== s) {
          expect(
            document.querySelector(s).children.length,
            `Expect no pills in ${s}`
          ).toBe(0);
        }
      });
    }
  );

  it("creates the tooltip correctly", ({ pluginBase, tooltip }) => {
    pluginBase.updatePillText(
      {
        name: "fake",
        label: "Insulin-on-Board",
        pluginType: "pill-major",
      },
      {
        value: "123",
        label: "TEST",
        info: [{ label: "Label", value: "Value" }],
      }
    );

    const pillEl = document.querySelector("span.pill.fake");

    pillEl.dispatchEvent(new MouseEvent("mouseover"));

    expect(tooltip.html()).toBe("<strong>Label</strong> Value");
    expect(parseFloat(tooltip.node().style.opacity)).toBeCloseTo(0.9);

    pillEl.dispatchEvent(new MouseEvent("mouseout"));
    expect(parseFloat(tooltip.node().style.opacity)).toBe(0);
  });
});
