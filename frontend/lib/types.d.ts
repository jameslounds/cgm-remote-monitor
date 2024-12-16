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
