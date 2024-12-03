/**
 * @vitest-environment jsdom
 */

import fs from "fs";
import path from "path";
import { ajaxMock, mockState as ajaxMockState } from "../fixtures/ajax";
import enTranslations from "../../translations/en/en.json";
import {
  defaultSocket,
  emitResponsesByRouteByEvent,
  sockerIOClientMock,
} from "../fixtures/socket.io-client";

const statusJsonFixtue = {
  status: "ok",
  name: "nightscout",
  version: "14.2.6",
  serverTime: "2024-12-02T17:33:25.444Z",
  serverTimeEpoch: 1733160805444,
  apiEnabled: true,
  careportalEnabled: true,
  boluscalcEnabled: true,
  settings: {
    units: "mmol",
    timeFormat: 12,
    dayStart: 7,
    dayEnd: 21,
    nightMode: false,
    editMode: true,
    showRawbg: "never",
    customTitle: "Nightscout",
    theme: "default",
    alarmUrgentHigh: true,
    alarmUrgentHighMins: [30, 60, 90, 120],
    alarmHigh: true,
    alarmHighMins: [30, 60, 90, 120],
    alarmLow: true,
    alarmLowMins: [15, 30, 45, 60],
    alarmUrgentLow: true,
    alarmUrgentLowMins: [15, 30, 45],
    alarmUrgentMins: [30, 60, 90, 120],
    alarmWarnMins: [30, 60, 90, 120],
    alarmTimeagoWarn: true,
    alarmTimeagoWarnMins: 15,
    alarmTimeagoUrgent: true,
    alarmTimeagoUrgentMins: 30,
    alarmPumpBatteryLow: false,
    language: "en",
    scaleY: "log",
    showPlugins: "careportal openaps pump iob sage cage delta direction upbat",
    showForecast: "openaps",
    focusHours: 3,
    heartbeat: 60,
    baseURL: "",
    authDefaultRoles: "readable devicestatus-upload",
    thresholds: {
      bgHigh: 144,
      bgTargetTop: 126,
      bgTargetBottom: 70,
      bgLow: 69,
    },
    insecureUseHttp: false,
    secureHstsHeader: true,
    secureHstsHeaderIncludeSubdomains: false,
    secureHstsHeaderPreload: false,
    secureCsp: false,
    deNormalizeDates: false,
    showClockDelta: false,
    showClockLastTime: false,
    frameUrl1: "",
    frameUrl2: "",
    frameUrl3: "",
    frameUrl4: "",
    frameUrl5: "",
    frameUrl6: "",
    frameUrl7: "",
    frameUrl8: "",
    frameName1: "",
    frameName2: "",
    frameName3: "",
    frameName4: "",
    frameName5: "",
    frameName6: "",
    frameName7: "",
    frameName8: "",
    authFailDelay: 5000,
    adminNotifiesEnabled: true,
    DEFAULT_FEATURES: [
      "bgnow",
      "delta",
      "direction",
      "timeago",
      "devicestatus",
      "upbat",
      "errorcodes",
      "profile",
      "bolus",
      "dbsize",
      "runtimestate",
      "basal",
      "careportal",
    ],
    alarmTypes: ["simple"],
    enable: [
      "careportal",
      "boluscalc",
      "food",
      "bwp",
      "cage",
      "sage",
      "iage",
      "iob",
      "cob",
      "basal",
      "ar2",
      "rawbg",
      "pushover",
      "bgi",
      "pump",
      "openaps",
      "cors",
      "treatmentnotify",
      "bgnow",
      "delta",
      "direction",
      "timeago",
      "devicestatus",
      "upbat",
      "errorcodes",
      "profile",
      "bolus",
      "dbsize",
      "runtimestate",
      "simplealarms",
    ],
  },
  extendedSettings: {
    devicestatus: {
      advanced: true,
      days: 1,
    },
  },
  authorized: null,
  runtimeState: "loaded",
};

const adminNotifiesFixture = {
  status: 200,
  message: {
    notifies: [],
    notifyCount: 0,
  },
};

const verifyAuthFixute = {
  status: 200,
  message: {
    canRead: true,
    canWrite: true,
    isAdmin: true,
    message: "OK",
    rolefound: "NOTFOUND",
    permissions: "ROLE",
  },
};

export function removeScriptTags(html: string) {
  const SCRIPT_REGEX = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
  while (SCRIPT_REGEX.test(html)) {
    html = html.replace(SCRIPT_REGEX, "");
  }
  return html;
}

const indexHTML = fs
  .readFileSync(path.resolve("./bundle/index.html"))
  .toString();
export default async function setupBrowser(opts?: {
  statusJson?: any;
  adminNotifies?: any;
  verifyAuth?: any;
  translations?: any;
}) {
  document.documentElement.innerHTML = removeScriptTags(indexHTML);
  (window as any).jQuery = jQuery;
  (window as any).$ = $;
  (window as any).$.ajax = ajaxMock;

  ajaxMockState.set("/api/v1/status.json", {
    data: opts?.statusJson ?? statusJsonFixtue,
  });
  ajaxMockState.set("/api/v1/adminnotifies", {
    data: opts?.adminNotifies ?? adminNotifiesFixture,
  });
  ajaxMockState.set("/api/v1/verifyauth", {
    data: opts?.verifyAuth ?? verifyAuthFixute,
  });
  ajaxMockState.set("/translations/en/en.json", {
    data: opts?.translations ?? enTranslations,
  });

  // emitResponsesByRouteByEvent.default.authorize = vi
  //   .fn()
  //   .mockReturnValue({ read: true });
  (window as any).io = sockerIOClientMock;
  // @ts-ignore dynamic imports are only allowed in modulks, but vitest runs fine with this
  await import("../../bundle/bundle.source");
  // @ts-ignore dynamic imports are only allowed in modulks, but vitest runs fine with this
  await import("../../bundle/client");

  (window as any).Nightscout.client.init();

  defaultSocket.trigger("connect");
}

const profileIndexHTML = fs
  .readFileSync(path.resolve("./bundle/profile/index.html"))
  .toString();
export async function setupProfile(opts?: {
  statusJson?: any;
  adminNotifies?: any;
  verifyAuth?: any;
  translations?: any;
  profileJson?: any;
}) {
  document.documentElement.innerHTML = removeScriptTags(profileIndexHTML);

  const el = document.createElement("div");
  el.id = "chartContainer";
  document.body.append(el);

  (window as any).jQuery = jQuery;
  (window as any).$ = $;
  (window as any).$.ajax = ajaxMock;

  ajaxMockState.set("/api/v1/status.json", {
    data: opts?.statusJson ?? statusJsonFixtue,
  });
  ajaxMockState.set("/api/v1/adminnotifies", {
    data: opts?.adminNotifies ?? adminNotifiesFixture,
  });
  ajaxMockState.set("/api/v1/verifyauth", {
    data: opts?.verifyAuth ?? verifyAuthFixute,
  });
  ajaxMockState.set("/translations/en/en.json", {
    data: opts?.translations ?? enTranslations,
  });
  ajaxMockState.set("/api/v1/profile", {
    data: opts?.profileJson ?? [],
  });

  (window as any).io = sockerIOClientMock;
  emitResponsesByRouteByEvent["default"]["authorize"] = {
    read: true,
  };

  // @ts-ignore dynamic imports are only allowed in modules, but vitest runs fine with this
  await import("../../bundle/bundle.source");

  (window as any).Nightscout.profileclient();

  defaultSocket.trigger("connect");
}
