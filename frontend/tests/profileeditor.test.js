/**
 * @vitest-environment happy-dom
 */

"use strict";

import { beforeEach, describe, expect, it, vi } from "vitest";
import initDdata from "../lib/data/ddata";
import { setupProfile } from "./setup/dom";
const exampleProfile = {
  defaultProfile: "Default",
  startDate: new Date(),
  store: {
    Default: {
      //General values
      dia: 3,

      // Simple style values, 'from' are in minutes from midnight
      carbratio: [
        {
          time: "00:00",
          value: 30,
        },
      ],
      carbs_hr: 30,
      delay: 20,
      sens: [
        {
          time: "00:00",
          value: 100,
        },
        {
          time: "08:00",
          value: 80,
        },
      ],
      startDate: new Date(),
      timezone: "UTC",

      //perGIvalues style values
      perGIvalues: false,
      carbs_hr_high: 30,
      carbs_hr_medium: 30,
      carbs_hr_low: 30,
      delay_high: 15,
      delay_medium: 20,
      delay_low: 20,

      basal: [
        {
          time: "00:00",
          value: 0.1,
        },
      ],
      target_low: [
        {
          time: "00:00",
          value: 100,
        },
      ],
      target_high: [
        {
          time: "00:00",
          value: 120,
        },
      ],
    },
  },
};

describe("Profile editor", function () {
  const nowData = initDdata();
  nowData.sgvs.push({
    mgdl: 100,
    mills: Date.now(),
    direction: "Flat",
    type: "sgv",
  });

  beforeEach(async () => {
    await setupProfile({ profileJson: [exampleProfile] });
  });

  it("produces some html", function () {
    window.alert = vi.fn();
    window.confirm = vi.fn();

    window.Nightscout.client.isInitialData = true;
    window.Nightscout.client.dataUpdate(nowData);

    expect($("#pe_databaserecords option").length).toBe(1);

    $("#pe_records_add").click();
    expect($("#pe_databaserecords option").length).toBe(2);

    window.confirm.mockReturnValueOnce(true);
    $("#pe_records_remove").click();
    expect($("#pe_databaserecords option").length).toBe(1);

    $("#pe_records_clone").click();
    expect($("#pe_databaserecords option").length).toBe(2);

    $("#pe_databaserecords option").val(0);
    expect($("#pe_profiles option").length).toBe(1);

    $("#pe_profile_add").click();
    expect($("#pe_profiles option").length).toBe(2);

    $("#pe_profile_name").val("Test");
    $("#pe_profiles option").val("Default");
    $("#pe_profiles option").val("Test");
    $("#pe_profile_remove").click();
    expect($("#pe_profiles option").length).toBe(1);

    $("#pe_profile_clone").click();
    expect($("#pe_profiles option").length).toBe(2);

    $("#pe_profiles option").val("Default");

    // I:C range
    expect($("#pe_ic_val_0").val()).toBe("30");

    $("#pe_ic_placeholder").find("img.addsingle").click();
    expect($("#pe_ic_val_0").val()).toBe("0");
    expect($("#pe_ic_val_1").val()).toBe("30");

    $("#pe_ic_placeholder").find("img.delsingle").click();
    expect($("#pe_ic_val_0").val()).toBe("30");

    // traget bg range
    expect($("#pe_targetbg_low_0").val()).toBe("100");

    $("#pe_targetbg_placeholder").find("img.addtargetbg").click();
    expect($("#pe_targetbg_low_0").val()).toBe("0");
    expect($("#pe_targetbg_low_1").val()).toBe("100");

    $("#pe_targetbg_placeholder").find("img.deltargetbg").click();
    expect($("#pe_targetbg_low_0").val()).toBe("100");
  });
});
