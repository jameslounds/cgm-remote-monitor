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
  debug?: boolean;
  isAnnouncement?: boolean;
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

type Entry = {
  mills: number;
  mgdl?: number;
  mmol?: number;
  scaled?: number | string;
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

export type Sgv = Record<string, any>;
export type Mbg = Record<string, any>;
export type Cal = Record<string, any>;
export type Food = Record<string, any>;
export type Activity = Record<string, any>;
export type DBStats = Record<string, any>;

export type RemoveKeys<T, K extends string> = {
  [P in keyof T as P extends K ? never : P]: T[P] extends object
    ? RemoveKeys<T[P], K>
    : T[P];
}