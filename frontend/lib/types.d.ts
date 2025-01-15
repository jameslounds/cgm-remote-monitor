import type { TranslationKey } from "./language";
import { PluginCtx } from "./plugins";
import { ClientInitializedSandbox, InitializedSandbox } from "./sandbox";

type NotifyBase = {
  level: Level;
  title: string;
  message: string;
  group: string;
  lastRecorded?: number;
  timestamp?: number;
  count?: number;

  persistent?: boolean;
};
export type Notify = NotifyBase & {
  clear?: boolean;
  eventName?: string;
  plugin?: Plugin;
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
  name: string;
  pluginType: string;
  label: string;
  pillFlip?: boolean;
  getClientPrefs?: () => PluginClientPrefs[];
  setProperties?: (sbx: ClientInitializedSandbox) => void;
  checkNotifications?: (sbx: InitializedSandbox) => void;
  visualizeAlarm?: (
    sbx: ClientInitializedSandbox,
    alarm: import("./notifications").CAlarm,
    alarmMessage: string
  ) => void;
  updateVisualisation?: (sbx: ClientInitializedSandbox) => void;
  getEventTypes?: (sbx: InitializedSandbox) => PluginEventType[];

  virtAsst?: {
    rollupHandlers?: VirtAsstRollupHandler[];
    intentHandlers?: VirtAsstIntentHandler[];
  };
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

  insulin?: number;
  carbs?: number;

  relative?: number;
  absolute?: number;
  percent?: number;

  cuttedby?: Treatment["profile"];
  cutting?: Treatment["profile"];
};

export type OpenApsIob = {
  iob: number;
  basaliob: number;
  activity: number;
  time?: number;
  timestamp: number;
};

export type LoopIob = {
  iob: number;
  timestamp: number;
};
export type LoopCob = {
  cob: number;
  timestamp: number;
}

export type PumpIob = { iob?: number; bolusiob: number };

export type DeviceStatus = {
  _id: string;
  mills: number;
  uploader: any;
  pump: { iob?: PumpIob };
  openaps: {
    iob?: OpenApsIob | OpenApsIob[];
    suggested?: { timestamp: number; COB: number };
    enacted?: { timestamp: number; COB: number };
  };
  loop: { iob?: LoopIob; cob?: LoopCob };
  connect?: any;
  xdripjs: any;
  device: any;
};

export interface EntryBase {
  mills: number;
  date?: Date;
  mgdl: number;
  mmol?: number;
  scaled?: number | string;
}

type SGVDirection =
  | "NONE"
  | "TripleUp"
  | "DoubleUp"
  | "SingleUp"
  | "FortyFiveUp"
  | "Flat"
  | "FortyFiveDown"
  | "SingleDown"
  | "DoubleDown"
  | "TripleDown"
  | "NOT COMPUTABLE"
  | "RATE OUT OF RANGE"
  | "CGM ERROR";

export interface Sgv extends EntryBase, Record<string, any> {
  type: "sgv";
  direction?: SGVDirection;
}
export interface Mbg extends EntryBase, Record<string, any> {
  type: "mbg";
}
export interface Rawbg extends EntryBase, Record<string, any> {
  color: string;
  type: "rawbg";
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

export type Entry = Sgv | Mbg | Rawbg | Cal | Food | QuickPick | Activity;

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

type VirtAsstIntentHandlerFn = (
  next: (title: string, message: string) => void,
  slots: unknown,
  sbx: ClientInitializedSandbox
) => void;
type VirtAsstIntentHandler = {
  intent: string;
  metrics: string[];
  intentHandler: VirtAsstIntentHandlerFn;
};

type VirtAsstRollupHandlerFn = (
  slots: unknown,
  sbx: ClientInitializedSandbox,
  callback: (a: string | null, b: { results: string; priority: number }) => void
) => void;
type VirtAsstRollupHandler = {
  rollupGroup: string;
  rollupName: string;
  rollupHandler: VirtAsstRollupHandlerFn;
};

/** Removes methods from a class. */
export type ClassAsObj<T> = {
  [K in keyof T as T[K] extends Function ? never : K]: T[K];
};

type PluginNames<Plugins extends Plugin[]> = {
  [K in keyof Plugins]: Plugins[K]["name"];
}[keyof Plugins];

export type FilterPluginsByName<
  Plugins extends Plugin[],
  T extends PluginNames<Plugins>,
> = {
  [K in keyof Plugins as Plugins[K] extends { name: T }
    ? K
    : never]: Plugins[K];
};

export type PluginByName<
  Plugins extends Plugin[],
  T extends PluginNames<Plugins>,
> = FilterPluginsByName<Plugins, T>[keyof FilterPluginsByName<Plugins, T>];
