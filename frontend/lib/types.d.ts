import type { TranslationKey } from "./language";
import { PluginCtx } from "./plugins";
import { ClientInitializedSandbox, InitializedSandbox } from "./sandbox";
import newBolusCalc from "./client/boluscalc";
import newCareportal from "./client/careportal";
import Client from "./client";
import { DurationInputArg1, Moment, MomentInput } from "moment";

type NotifyBase = {
  level: Level;
  title: string;
  message: string;
  group: string;
  lastRecorded?: number;
  timestamp?: number;
  count?: number;

  persistent?: boolean;
  debug?: any;
};
export type Notify = NotifyBase & {
  clear?: boolean;
  eventName?: string;
  plugin?: Plugin;
  isAnnouncement?: boolean;

  notifyhash?: string;

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
  timezone: string;
  dia?: number;
  target_low?: number;
  target_high?: number;
  carbs_hr?: number;
  store?: {
    [K in string]: Omit<Profile, "store">;
  };
  loopSettings?: {
    overridePresets?: {
      name: TranslationKey;
      symbol: string;
      duration: number;
    }[];
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
    alarm: Notify,
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
  _id: string;
  created_at: string;
  timestamp?: number;

  // are these real?
  mgdl: number;
  mmol?: number;

  endmills: number;
  eventType: TranslationKey;

  duration?: number;
  durationType?: string;

  glucose?: number;
  glucoseType?: TranslationKey;

  isAnnouncement?: boolean;

  profile: string;
  profileJson?: string;
  endprofile?: string;

  insulin?: number;
  insulinNeedsScaleFactor?: number;
  absorptionTime?: number;
  enteredinsulin?: number;
  splitNow?: number;
  splitExt?: number;

  carbs?: number;
  protein?: number;
  fat?: number;
  foodType?: string;

  status?: TranslationKey;

  boluscalc?: ReturnType<typeof newBolusCalc>["record"];

  relative?: number;
  absolute?: number;
  percent?: number;

  cuttedby?: Treatment["profile"];
  cutting?: Treatment["profile"];

  notes?: string;
  reason?: TranslationKey;
  enteredBy?: string;

  targetTop: number;
  targetBottom: number;

  correctionRange?: [min: number, max: number];

  transmitterId?: unknown;
  sensorCode?: unknown;

  CR?: number;

  NSCLIENT_ID?: unknown;

  first?: boolean;
  end?: boolean;
};

export type OpenApsIob = {
  iob: number;
  /** Maybe undefined? */
  basaliob: number;
  bolusiob?: number;
  activity: number;
  time?: number;
  timestamp: number;
  mills?: number;
};
export type OpenApsPredBGs = {
  values?: number[];
  IOB?: number[];
  ZT?: number[];
  aCOB?: number[];
  COB?: number[];
  UAM?: number[];
};

export type LoopIob = {
  iob: number;
  timestamp: number;
  basaliob?: number;
};
export type LoopCob = {
  cob: number;
  timestamp: number;
};

export type PumpIob = { iob?: number; bolusiob: number };

export type DeviceStatus = {
  _id: string;
  mills: number;
  created_at: MomentInput;
  uploader: any;
  pump?: {
    iob?: PumpIob;
    clock?: number;
    reservoir?: number;
    reservoir_display_override?: string;
    reservoir_level_override?: Level;
    manufacturer?: string;
    model?: string;
    extended?: Record<string, string>;
    battery?:
      | { percent: number; voltage?: number }
      | { percent?: number; voltage: number };
    status?: {
      status?: string;
      bolusing?: boolean;
      suspended?: boolean;
    };
    warnOnSuspend?: boolean;
  };
  openaps?: {
    iob?: OpenApsIob | OpenApsIob[];
    suggested?: {
      timestamp: number;
      mills?: number;
      COB: number;
      eventualBG: unknown;
      predBGs?: { values: number[] } | number[];
      bg: number;
      reason: string;
      sensitivityRatio?: number;
    };
    enacted?: {
      /** @deprecated */
      recieved?: number;
      received?: number;
      timestamp: number;
      mills?: number;
      COB: number;
      eventualBG: unknown;
      predBGs?: OpenApsPredBGs | number[];
      rate: number;
      duration: number;
      bg: number;
      reason?: string;
      mealAssist?: unknown;
    };
  };
  loop: {
    name?: string;
    iob?: LoopIob;
    cob?: LoopCob;
    failureReason?: string;
    enacted?: {
      received?: unknown;
      timestamp: number;
      rate?: number;
      duration?: number;
      bolusVolume?: number;
      reason?: string;
    };
    timestamp: number;
    moment?: Moment;
    recommendedBolus?: number;
    recommendedTempBasal?: {
      timestamp: number;
      rate: number;
      duration: number;
    };
    predicted?: {
      startDate?: number; // | Date ?
      values: number[];
    };
  };
  radioAdapter?: {
    pumpRSSI?: number;
    RSSI?: number;
  };
  connect?: any;
  xdripjs: any;
  device: string;
  moment: Moment;
  mmtune?: {
    timestamp?: number;
    moment?: Moment;
    scanDetails?: number[][];
    setFreq: string;
  };
  override?: {
    timestamp?: number;
    duration?: DurationInputArg1;
    active?: boolean;
    multiplier?: number;
    currentCorrectionRange?: { maxValue: number; minValue: number };
  };
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
  portion: number;
  portions: number;
  /** Unit of portion */
  unit: string;
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

export interface ForecastPoint extends EntryBase {
  type: "forecast";
  info: { type: string; label: string; value?: string };
  mgdl: number;
  color: string;
  mills: number;

  forecastType?: unknown; // definitely stringifiable
}

export type Entry =
  | Sgv
  | Mbg
  | Rawbg
  | Cal
  | Food
  | QuickPick
  | Activity
  | ForecastPoint;

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
    client: Client,
    data: ReturnType<ReturnType<typeof newCareportal>["gatherData"]>,
    callback: (error?: boolean) => void
  ) => void;
};

type VirtAsstIntentHandlerFn = (
  next: (title: string, message: string) => void,
  slots: { pwd?: { value?: { toString: () => string } } },
  sbx: ClientInitializedSandbox
) => void;
type VirtAsstIntentHandler = {
  intent: string;
  metrics?: string[];
  intentHandler: VirtAsstIntentHandlerFn;
};

type VirtAsstRollupHandlerFn = (
  slots: { pwd?: { value?: { toString: () => string } } },
  sbx: ClientInitializedSandbox,
  callback: (
    a: string | null,
    b: { results?: string; priority: number }
  ) => void
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
