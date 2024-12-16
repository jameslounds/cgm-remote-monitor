"use strict";

/** @typedef {keyof import("../translations/en/en.json")} TranslationKey */

class Language {
  static languages = [
    {
      code: "ar",
      file: "ar_SA",
      language: "اللغة العربية",
      speechCode: "ar-SA",
    },
    { code: "bg", file: "bg_BG", language: "Български", speechCode: "bg-BG" },
    { code: "cs", file: "cs_CZ", language: "Čeština", speechCode: "cs-CZ" },
    { code: "de", file: "de_DE", language: "Deutsch", speechCode: "de-DE" },
    { code: "dk", file: "da_DK", language: "Dansk", speechCode: "dk-DK" },
    { code: "el", file: "el_GR", language: "Ελληνικά", speechCode: "el-GR" },
    { code: "en", file: "en_US", language: "English", speechCode: "en-US" },
    { code: "es", file: "es_ES", language: "Español", speechCode: "es-ES" },
    { code: "fi", file: "fi_FI", language: "Suomi", speechCode: "fi-FI" },
    { code: "fr", file: "fr_FR", language: "Français", speechCode: "fr-FR" },
    { code: "he", file: "he_IL", language: "עברית", speechCode: "he-IL" },
    { code: "hr", file: "hr_HR", language: "Hrvatski", speechCode: "hr-HR" },
    { code: "hu", file: "hu_HU", language: "Magyar", speechCode: "hu-HU" },
    { code: "it", file: "it_IT", language: "Italiano", speechCode: "it-IT" },
    { code: "ja", file: "ja_JP", language: "日本語", speechCode: "ja-JP" },
    { code: "ko", file: "ko_KR", language: "한국어", speechCode: "ko-KR" },
    {
      code: "nb",
      file: "nb_NO",
      language: "Norsk (Bokmål)",
      speechCode: "no-NO",
    },
    {
      code: "nl",
      file: "nl_NL",
      language: "Nederlands",
      speechCode: "nl-NL",
    },
    { code: "pl", file: "pl_PL", language: "Polski", speechCode: "pl-PL" },
    { code: "pt", file: "pt_PT", language: "Português", speechCode: "pt-PT" },
    {
      code: "br",
      file: "pt_BR",
      language: "Português (Brasil)",
      speechCode: "pt-BR",
    },
    { code: "ro", file: "ro_RO", language: "Română", speechCode: "ro-RO" },
    { code: "ru", file: "ru_RU", language: "Русский", speechCode: "ru-RU" },
    {
      code: "sk",
      file: "sk_SK",
      language: "Slovenčina",
      speechCode: "sk-SK",
    },
    {
      code: "sl",
      file: "sl_SL",
      language: "Slovenščina",
      speechCode: "sl-SL",
    },
    { code: "sv", file: "sv_SE", language: "Svenska", speechCode: "sv-SE" },
    { code: "tr", file: "tr_TR", language: "Türkçe", speechCode: "tr-TR" },
    {
      code: "uk",
      file: "uk_UA",
      language: "українська",
      speechCode: "uk-UA",
    },
    {
      code: "zh_cn",
      file: "zh_CN",
      language: "中文（简体）",
      speechCode: "cmn-Hans-CN",
    },
    //    , { code: 'zh_tw', file: 'zh_TW', language: '中文（繁體）', speechCode: 'cmn-Hant-TW' }
  ];

  /**
   * @param {import('fs')} [fs] should be provided only on the server
   */
  constructor(fs) {
    this.speechCode = "en-US";
    this.lang = "en";

    this.translations =
      /** @type {import("../translations/en/en.json")} */ ({});

    if (fs) {
      this.loadLocalization(fs);
    }

    // When consumers of this class move `translate` into its own variable like:
    // const translate = language.translate;
    // The `this` context that `translate` will be called with gets lost and becomes `undefined`
    // By binding `this` to `translate` here, we can ensure that `translate` always has the correct `this` context
    this.translate = this.translate.bind(this);
  }

  /** @param {import("../translations/en/en.json")} localization*/
  offerTranslations(localization) {
    this.translations = localization;
  }

  /**
   * Case sensitive
   * @param {keyof import("../translations/en/en.json")} text
   */
  translateCS(text) {
    if (this.translations[text]) {
      return this.translations[text];
    }
    return text;
  }

  /**
   * Case insensitive
   * @param {keyof import("../translations/en/en.json")} text
   */
  translateCI(text) {
    const utext = text.toUpperCase();
    const foundKey = Object.keys(this.translations).find(
      (key) => key.toUpperCase() === utext
    );
    if (!foundKey) {
      return text;
    }
    return this.translations[foundKey];
  }

  /**
   *
   * @param {keyof import('../translations/en/en.json')} text
   * @param {{ci?: boolean, params?: string[]}} [options]
   * @returns {string}
   */
  translate(text, options) {
    if (!options) return this.translateCS(text);

    let translated = options.ci
      ? this.translateCI(text)
      : this.translateCS(text);

    const hasCI = options.hasOwnProperty("ci");
    const hasParams = options.hasOwnProperty("params");

    let keys = [];

    if (hasParams && options.params) keys = options.params;
    if (!hasCI && !hasParams) keys = Object.values(arguments).slice(1);
    if ((hasCI || hasParams) && arguments.length > 2)
      keys = Object.values(arguments).slice(2);

    if (keys.length) {
      keys.forEach((key, i) => {
        /* eslint-disable-next-line no-useless-escape, security/detect-non-literal-regexp */ // validated false positive
        translated = translated.replace(new RegExp(`%${i + 1}`, "g"), key);
      });
    }

    return translated;
  }

  /**
   * Looks for elements wit the class `translate`, `titletranslate`, `tip` and translates them
   *
   * @param {import('jquery')} $
   */
  DOMtranslate($) {
    $(".translate").each((_, el) => {
      // @ts-expect-error Invalid Translation Key
      $(el).text(this.translate($(el).text()));
    });
    $(".titletranslate, .tip").each((_, el) => {
      // @ts-expect-error Invalid Translation Key
      $(el).attr("title", this.translate($(el).attr("title")));
    });
  }

  /** @param {typeof Language['languages'][number]['code']} code */
  getFilename(code) {
    if (code == "en") return "en/en.json";

    const file = Language.languages.find((l) => l.code === code)?.file;

    // Yes, this can just return `.json` when it can't find the filename
    // I'm not changing it in order to maintain compatibility with the old code
    return `${file}.json`;
  }

  /**
   * this is a server only method, do not call it on the client, it needs `fs`
   * @param {import('fs')} fs - The filesystem module
   * @param {import('path')} [path] - The path module
   */
  loadLocalization(fs, path) {
    let filename = "./translations/" + this.getFilename(this.lang);
    if (path) filename = path.resolve(__dirname, filename);

    /* eslint-disable-next-line security/detect-non-literal-fs-filename */ // verified false positive; well defined set of values
    const l = fs.readFileSync(filename).toString();
    this.offerTranslations(JSON.parse(l));
  }

  /** @param {typeof Language['languages'][number]['code']} newlang */
  set(newlang) {
    if (!newlang) return;
    this.lang = newlang;

    Language.languages.forEach((language) => {
      if (language.code === newlang && language.speechCode) {
        this.speechCode = language.speechCode;
      }
    });

    return this;
  }

  /** @param {typeof Language['languages'][number]['code']} lang */
  get(lang) {
    return Language.languages.find((l) => l.code === lang);
  }
}

/** @param {import("fs")} [fs] */
module.exports = (fs) => new Language(fs);
