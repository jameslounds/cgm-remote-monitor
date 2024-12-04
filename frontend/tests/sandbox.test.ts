import { beforeEach, describe, expect, it } from "vitest";

import initSandbox, { type Sandbox } from "../lib/sandbox";
import initLanguage from "../lib/language";
import levels from "../lib/levels";
import initDdata, { type DData } from "../lib/data/ddata";
import initNotifications from "../lib/notifications";
import baseEnv from "./fixtures/baseEnv";

type TestContext = {
  sandbox: Sandbox;
};

describe("sandbox", function () {
  beforeEach<TestContext>((ctx) => {
    ctx.sandbox = initSandbox();
  });

  const now = Date.now();

  it<TestContext>("does clientInit successfully", function ({ sandbox }) {
    const ctx = {
      settings: {
        units: "mg/dl",
        thresholds: {
          bgHigh: 260,
          bgTargetTop: 180,
          bgTargetBottom: 80,
          bgLow: 55,
        },
      },
      pluginBase: {
        [Symbol("uniqueKey")]: "uniqueKey",
      } as unknown,
      language: initLanguage(),
      levels,
      notifications: {},
    } as Parameters<Sandbox["clientInit"]>[0];

    const data = { sgvs: [{ mgdl: 100, mills: now }] } as DData;

    const sbx = sandbox.clientInit(ctx, Date.now(), data);

    expect(sbx.pluginBase).toMatchObject(ctx.pluginBase);
    expect(sbx.data).toMatchObject(data);
    expect(sbx.lastSGVMgdl()).toBe(100);
  });

  function createServerSandbox(sandbox: Sandbox) {
    const ctx = {
      ddata: initDdata(),
      language: initLanguage(),
      notifications: null as unknown as ReturnType<typeof initNotifications>,
    };
    ctx.notifications = initNotifications(baseEnv, ctx);

    return sandbox.serverInit(baseEnv, ctx);
  }

  it<TestContext>("does serverInit successfully", function ({ sandbox }) {
    const sbx = createServerSandbox(sandbox);
    sbx.data.sgvs = [{ mgdl: 100, mills: now }];

    expect(sbx.notifications.requestNotify).toBeDefined();
    expect(sbx.notifications.process).not.toBeDefined();
    expect(sbx.notifications.ack).not.toBeDefined();
    expect(sbx.lastSGVMgdl()).toBe(100);
  });

  it<TestContext>("displays 39 as LOW and 401 as HIGH", function ({ sandbox }) {
    const sbx = createServerSandbox(sandbox);

    expect(sbx.displayBg({ mgdl: 39 })).toBe("LOW");
    expect(sbx.displayBg({ mgdl: "39" })).toBe("LOW");
    expect(sbx.displayBg({ mgdl: 401 })).toBe("HIGH");
    expect(sbx.displayBg({ mgdl: "401" })).toBe("HIGH");
  });

  it<TestContext>("builds BG Now line using properties", function ({
    sandbox,
  }) {
    const sbx = createServerSandbox(sandbox);
    sbx.data.sgvs = [{ mgdl: 99, mills: now }];
    sbx.properties = {
      delta: { display: "+5" },
      direction: { value: "FortyFiveUp", label: "↗", entity: "&#8599;" },
    };

    expect(sbx.buildBGNowLine()).toBe("BG Now: 99 +5 ↗ mg/dl");
  });

  it<TestContext>("builds default message using properties", function ({
    sandbox,
  }) {
    const sbx = createServerSandbox(sandbox);
    sbx.data.sgvs = [{ mgdl: 99, mills: now }];
    sbx.properties = {
      delta: { display: "+5" },
      direction: { value: "FortyFiveUp", label: "↗", entity: "&#8599;" },
      rawbg: { displayLine: "Raw BG: 100 mg/dl" },
      iob: { displayLine: "IOB: 1.25U" },
      cob: { displayLine: "COB: 15g" },
    };

    expect(sbx.buildDefaultMessage()).toBe(
      "BG Now: 99 +5 ↗ mg/dl\nRaw BG: 100 mg/dl\nIOB: 1.25U\nCOB: 15g"
    );
  });
});
