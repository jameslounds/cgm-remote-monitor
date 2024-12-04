import fs from "node:fs";
import moment from "moment-timezone";

import languageInit from "../lib/language";
import settingsInit from "../lib/settings";
import levels from "../lib/levels";

export default {
  ctx: {
    language: languageInit(fs),
    settings: settingsInit(),
    levels: levels,
    moment: moment,
  },
};
