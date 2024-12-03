/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";


describe("pluginbase", () => {
  it("updates major pill text correctly", async () => {
    await setupBrowser();

    const bgStatusBefore = document.querySelector(".bgStatus");
    const minorPillsBefore = document.querySelector(".minorPills");

    window.Nightscout.client.ctx.pluginBase.updatePillText(
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

    expect(document.querySelector(".majorPills")).toHaveTextContent("TEST123");

    expect(document.querySelector(".minorPills")).toBe(minorPillsBefore);
    expect(document.querySelector(".bgStatus")).toBe(bgStatusBefore);
  });
});
