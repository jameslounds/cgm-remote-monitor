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

  pushoverSound?: string
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
  name: string;
  pluginType: string;
  pillFlip?: boolean;
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
  mills: number;
  mgdl?: number;
  mmol?: number;
  scaled?: number | string;
};

export interface Sgv extends Entry, Record<string, any> {};
export interface Mbg extends Entry, Record<string, any> {};
export interface Cal extends Entry, Record<string, any> {};
export interface Food extends Entry, Record<string, any> {};
export interface Activity extends Entry, Record<string, any> {};
export interface DBStats extends Entry, Record<string, any> {};

export type RemoveKeys<T, K extends string> = {
  [P in keyof T as P extends K ? never : P]: T[P] extends object
    ? RemoveKeys<T[P], K>
    : T[P];
}