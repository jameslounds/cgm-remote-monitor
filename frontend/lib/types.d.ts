import type { TranslationKey } from "./language";

type NotifyBase = {
  level: Level;
  title: string;
  message: string;
  group: string;
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

export interface Entry {
  type: "sgv" | "mbg" | "cal" | "food" | "activity";
  mills: number;
  mgdl: number;
  mmol?: number;
  scaled?: number | string;
}

export interface Sgv extends Entry, Record<string, any> {}
export interface Mbg extends Entry, Record<string, any> {}
export interface Cal extends Entry, Record<string, any> {}
export interface Food extends Entry, Record<string, any> {}
export interface Activity extends Entry, Record<string, any> {}
export interface DBStats extends Record<string, any> {
  datasize?: number;
  indexsize?: number;
  dataSize?: number;
}

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
