import { describe, it, vi } from "vitest";

import { Stream } from "stream";
import helper from "./inithelper";

import initDdata from "../lib/data/ddata";
import initLanguage from "../lib/language";
import initSandbox from "../lib/sandbox";
import initNotifications from "../lib/notifications";
import initBolusWizardPreview from "../lib/plugins/boluswizardpreview";
import initAr2 from "../lib/plugins/ar2";
import initIob from "../lib/plugins/iob";
import initBgnow from "../lib/plugins/bgnow";
import initProfileFunctions from "../lib/profilefunctions";
import baseEnv from "./fixtures/baseEnv";

describe("boluswizardpreview", function () {
  const { ctx } = helper;

  ctx.ddata = initDdata();
  ctx.notifications = initNotifications(baseEnv, ctx);

  const boluswizardpreview = initBolusWizardPreview(ctx);
  const ar2 = initAr2(ctx);
  const iob = initIob(ctx);
  const bgnow = initBgnow(ctx);

  function prepareSandbox() {
    const sbx = initSandbox().serverInit(baseEnv, ctx);
    bgnow.setProperties(sbx);
    ar2.setProperties(sbx);
    iob.setProperties(sbx);
    boluswizardpreview.setProperties(sbx);
    sbx.offerProperty("direction", function setFakeDirection() {
      return { value: "FortyFiveUp", label: "↗", entity: "&#8599;" };
    });

    return sbx;
  }

  const now = Date.now();
  const before = now - 5 * 60 * 1000;

  const profile = {
    dia: 3,
    sens: 90,
    target_high: 120,
    target_low: 100,
  };

  it("calculates IOB results correctly with 0 IOB", function ({ expect }) {
    ctx.notifications.initRequests();
    ctx.ddata.sgvs = [
      { mills: before, mgdl: 100 },
      { mills: now, mgdl: 100 },
    ];
    ctx.ddata.treatments = [];
    ctx.ddata.profiles = [profile];

    const sbx = prepareSandbox();
    const results = boluswizardpreview.calc(sbx);

    expect(results).toMatchObject({
      effect: 0,
      effectDisplay: 0,
      outcome: 100,
      outcome: 100,
      outcomeDisplay: 100,
      bolusEstimate: 0,
      displayLine: "BWP: 0U",
    });
  });

  it("calculates IOB results correctly with 1.0 U IOB", function ({ expect }) {
    ctx.notifications.initRequests();
    ctx.ddata.sgvs = [
      { mills: before, mgdl: 100 },
      { mills: now, mgdl: 100 },
    ];
    ctx.ddata.treatments = [{ mills: now, insulin: "1.0" }];
    ctx.ddata.profiles = [
      {
        dia: 3,
        sens: 50,
        target_high: 100,
        target_low: 50,
      },
    ];

    const sbx = prepareSandbox();
    const results = boluswizardpreview.calc(sbx);

    expect(results).toMatchObject({
      effect: 50,
      effectDisplay: 50,
      outcome: 50,
      outcomeDisplay: 50,
      bolusEstimate: 0,
      displayLine: "BWP: 0U",
    });
  });

  it("calculates IOB results correctly with 1.0 U IOB resulting in going low", function ({
    expect,
  }) {
    ctx.notifications.initRequests();
    ctx.ddata.sgvs = [
      { mills: before, mgdl: 100 },
      { mills: now, mgdl: 100 },
    ];
    ctx.ddata.treatments = [{ mills: now, insulin: "1.0" }];

    ctx.ddata.profiles = [
      {
        dia: 3,
        sens: 50,
        target_high: 200,
        target_low: 100,
        basal: 1,
      },
    ];

    const sbx = prepareSandbox();
    const results = boluswizardpreview.calc(sbx);

    expect(results).toMatchObject({
      effect: 50,
      effectDisplay: 50,
      outcome: 50,
      outcomeDisplay: 50,
      bolusEstimate: -1,
      displayLine: "BWP: -1.00U",
      tempBasalAdjustment: { thirtymin: -100, onehour: 0 },
    });
  });

  it("calculates IOB results correctly with 1.0 U IOB resulting in going low in MMOL", function ({
    expect,
  }) {
    // boilerplate for client sandbox running in mmol

    const profileData = {
      units: "mmol",
      dia: 3,
      sens: 10,
      target_high: 10,
      target_low: 5.6,
      basal: 1,
    };

    const sandbox = initSandbox();
    const ctx = {
      settings: {
        units: "mmol",
      },
      pluginBase: {},
      moment: helper.ctx.moment,
      language: initLanguage(),
    };

    const data = {
      sgvs: [
        { mills: before, mgdl: 100 },
        { mills: now, mgdl: 100 },
      ],
      treatments: [{ mills: now, insulin: "1.0" }],
      devicestatus: [],
      profile: initProfileFunctions([profileData], ctx),
    };
    const sbx = sandbox.clientInit(ctx, Date.now(), data);
    sbx.properties.iob = iob.calcTotal(
      data.treatments,
      data.devicestatus,
      data.profile,
      now
    );

    const results = boluswizardpreview.calc(sbx);

    expect(results).toMatchObject({
      effect: 10,
      outcome: -4.4,
      bolusEstimate: -1,
      displayLine: "BWP: -1.00U",
      tempBasalAdjustment: { thirtymin: -100, onehour: 0 },
    });
  });

  it("calculates IOB results correctly with 0.45 U IOB resulting in going low in MMOL", function ({
    expect,
  }) {
    // boilerplate for client sandbox running in mmol

    const profileData = {
      units: "mmol",
      dia: 3,
      sens: 9,
      target_high: 6,
      target_low: 5,
      basal: 0.125,
    };

    const sandbox = initSandbox();
    const ctx = {
      settings: {
        units: "mmol",
      },
      pluginBase: {},
      moment: helper.ctx.moment,
    };

    ctx.language = initLanguage();

    const data = {
      sgvs: [
        { mills: before, mgdl: 175 },
        { mills: now, mgdl: 153 },
      ],
      treatments: [{ mills: now, insulin: "0.45" }],
      devicestatus: [],
      profile: initProfileFunctions([profileData], ctx),
    };
    const sbx = sandbox.clientInit(ctx, Date.now(), data);
    sbx.properties.iob = iob.calcTotal(
      data.treatments,
      data.devicestatus,
      data.profile,
      now
    );

    const results = boluswizardpreview.calc(sbx);

    expect(results).toMatchObject({
      effect: 4.05,
      outcome: 4.45,
      tempBasalAdjustment: { thirtymin: 2, onehour: 51 },
    });
    expect(Math.round(results.bolusEstimate * 100)).toBe(-6);
  });

  it("doesn't trigger an alarm when in range", function ({ expect }) {
    ctx.notifications.initRequests();
    ctx.ddata.sgvs = [
      { mills: before, mgdl: 95 },
      { mills: now, mgdl: 100 },
    ];
    ctx.ddata.treatments = [];
    ctx.ddata.profiles = [profile];

    const sbx = prepareSandbox();
    boluswizardpreview.checkNotifications(sbx);

    expect(ctx.notifications.findHighestAlarm()).toBeUndefined();
  });

  it("triggers a warning when going out of range", function ({ expect }) {
    ctx.notifications.initRequests();
    ctx.ddata.sgvs = [
      { mills: before, mgdl: 175 },
      { mills: now, mgdl: 180 },
    ];
    ctx.ddata.treatments = [];
    ctx.ddata.profiles = [profile];

    const sbx = prepareSandbox();
    boluswizardpreview.checkNotifications(sbx);
    const highest = ctx.notifications.findHighestAlarm();

    expect(highest).toMatchObject({
      level: ctx.levels.WARN,
      title: "Warning, Check BG, time to bolus?",
      message: "BG Now: 180 +5 ↗ mg/dl\nBG 15m: 187 mg/dl\nBWP: 0.66U",
    });
  });

  it("triggers an urgent alarms when going too high", function ({ expect }) {
    ctx.notifications.initRequests();
    ctx.ddata.sgvs = [
      { mills: before, mgdl: 295 },
      { mills: now, mgdl: 300 },
    ];
    ctx.ddata.treatments = [];
    ctx.ddata.profiles = [profile];

    const sbx = prepareSandbox();
    boluswizardpreview.checkNotifications(sbx);
    const highestAlarm = ctx.notifications.findHighestAlarm();

    expect(highestAlarm.level).toBe(ctx.levels.URGENT);
  });

  it("requests a snooze when there is enough IOB", function ({ expect }) {
    ctx.notifications.resetStateForTests();
    ctx.notifications.initRequests();
    ctx.ddata.sgvs = [
      { mills: before, mgdl: 295 },
      { mills: now, mgdl: 300 },
    ];
    ctx.ddata.treatments = [{ mills: before, insulin: "5.0" }];
    ctx.ddata.profiles = [profile];

    const sbx = prepareSandbox();

    //start fresh to we don't pick up other notifications
    ctx.bus = new Stream();

    const notificationCallback = vi.fn();
    ctx.bus.on("notification", notificationCallback);

    ar2.checkNotifications(sbx);
    boluswizardpreview.checkNotifications(sbx);
    ctx.notifications.process();

    expect(notificationCallback).toHaveBeenCalledOnce();
    expect(notificationCallback.mock.lastCall[0]).toMatchObject({
      clear: true,
    });
  });

  it("sets a pill with the correct info", function ({ expect }) {
    const ctx = {
      settings: {},
      pluginBase: {
        updatePillText: vi.fn(),
      },
      moment: helper.ctx.moment,
    };

    ctx.language = initLanguage();
    const loadedProfile = initProfileFunctions(null, ctx);
    loadedProfile.loadData([profile]);

    const data = {
      sgvs: [
        { mills: before, mgdl: 295 },
        { mills: now, mgdl: 300 },
      ],
      treatments: [{ mills: before, insulin: "1.5" }],
      devicestatus: [],
      profile: loadedProfile,
    };

    const sbx = initSandbox().clientInit(ctx, Date.now(), data);

    iob.setProperties(sbx);
    boluswizardpreview.setProperties(sbx);
    boluswizardpreview.updateVisualisation(sbx);

    expect(ctx.pluginBase.updatePillText).toHaveBeenCalledOnce();
    expect(ctx.pluginBase.updatePillText.mock.lastCall[1]).toMatchObject({
      label: "BWP",
      value: "0.50U",
    });
  });
});
