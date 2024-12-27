import type { TranslationKey } from "./language";

type NotifyBase = {
  level: Level;
  title: TranslationKey;
  message: TranslationKey;
  group: string;
  lastRecorded: number;
  count: number;

  persistent?: boolean;
};
export type Notify = NotifyBase & {
  clear?: boolean;
  eventName?: string;
  /** maybe nto actully a string */
  plugin?: {
    name: string;
  };
  debug?: any;
  isAnnouncement?: boolean;

  pushoverSound?: string;
};
export type Snooze = NotifyBase & { lengthMills: number };

export type Level =
  (typeof import("./constants"))[`LEVEL_${"URGENT" | "WARN" | "INFO" | "LOW" | "LOWEST" | "NONE"}`];

export type Profile = {
  defaultProfile?: string;
  startDate?: string;
  id?: string;
  _id?: string;
  convertedOnTheFly?: boolean;
  mills?: number;
  time?: string;
  timeAsSeconds?: number;
  units?: "mmol" | "mgdl";
  sens?: number;
  carbratio?: number;
  basal: number;
  timezone?: string;
  dia?: number;
  target_low?: number;
  target_high?: number;
  carbs_hr?: number;
  store?: {
    [K in string]: Omit<Profile, "store">;
  };
};

interface Plugin {
  name: TranslationKey;
  pluginType: string;
  label: TranslationKey;
  pillFlip?: boolean;
  getClientPrefs?: () => PluginClientPrefs[];
}

type PluginClientPrefs = {
  label: TranslationKey;
  id: string;
  type: string;
};

export type Treatment = {
  mills: number;
  endmills: number;
  eventType: string;
  duration?: number;
  profile: string;
  profileJson?: string;

  relative?: number;
  absolute?: number;
  percent?: number;

  cuttedby?: Treatment["profile"];
  cutting?: Treatment["profile"];
};

export type DeviceStatus = {
  _id: string;
  mills: number;
  uploader: any;
  pump: any;
  openaps: any;
  loop: any;
  xdripjs: any;
  device: any;
};

export interface EntryBase {
  mills: number;
  mgdl: number;
  mmol?: number;
  scaled?: number | string;
}

export interface Sgv extends EntryBase, Record<string, any> {
  type: "sgv";
}
export interface Mbg extends EntryBase, Record<string, any> {
  type: "mbg";
}
export interface Cal extends EntryBase, Record<string, any> {
  type: "cal";
}
export interface Food extends EntryBase, Record<string, any> {
  type: "food";
  category?: string;
  subcategory?: string;
}
export interface QuickPick extends EntryBase, Record<string, any> {
  type: "quickpick";
}
export interface Activity extends EntryBase, Record<string, any> {
  type: "activity";
}
export interface DBStats extends Record<string, any> {
  datasize?: number;
  indexsize?: number;
  dataSize?: number;
}

export type Entry = Sgv | Mbg | Cal | Food | QuickPick | Activity;

export type RemoveKeys<T, K extends string> = {
  [P in keyof T as P extends K ? never : P]: T[P] extends object
    ? RemoveKeys<T[P], K>
    : T[P];
};

export type PluginEventType = {
  val: string;
  name: TranslationKey;
  bg?: boolean;
  insulin?: boolean;
  carbs?: boolean;
  protein?: boolean;
  fat?: boolean;
  prebolus?: boolean;
  duration?: boolean;
  percent?: boolean;
  absolute?: boolean;
  profile?: boolean;
  split?: boolean;
  sensor?: boolean;
  targets?: boolean;
  otp?: boolean;
  remoteCarbs?: boolean;
  remoteBolus?: boolean;
  remoteAbsorption?: boolean;
  reasons?: {
    name: TranslationKey;
    displayName?: TranslationKey;
    duration?: number;
    targetTop?: number;
    targetBottom?: number;
  }[];

  submitHook?: (
    client: import("./client"),
    data: ReturnType<ReturnType<import("./client/careportal")>["gatherData"]>,
    callback: (error?: boolean) => void
  ) => void;
};

/** Removes methods from a class */
export type ClassAsObj<T> = {
  [K in keyof T as T[K] extends Function ? never : K]: T[K];
};
