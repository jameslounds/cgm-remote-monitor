type NotifyBase = {
  level: Level;
  title: string;
  message: string;
  group: string;
};
export type Notify = NotifyBase & {
  clear?: boolean;
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
  duration?: number;
  profile: string;
  profileJson?: string;

  relative?: number;
  absolute?: number;
  percent?: number;
};

type Entry = {
  mills: number;
  mgdl?: number;
  mmol?: number;
  scaled?: number | string;
};