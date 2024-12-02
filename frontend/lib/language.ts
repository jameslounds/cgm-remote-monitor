"use strict";

import _ from "lodash";

import type Localization from "../translations/en/en.json";
export type TranslationKey = keyof typeof Localization;

export default function init() {
  function language() {
    return language;
  }

  language.speechCode = "en-US";
  language.lang = "en";

  language.languages = [
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
    { code: "nl", file: "nl_NL", language: "Nederlands", speechCode: "nl-NL" },
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
    { code: "sk", file: "sk_SK", language: "Slovenčina", speechCode: "sk-SK" },
    { code: "sl", file: "sl_SL", language: "Slovenščina", speechCode: "sl-SL" },
    { code: "sv", file: "sv_SE", language: "Svenska", speechCode: "sv-SE" },
    { code: "tr", file: "tr_TR", language: "Türkçe", speechCode: "tr-TR" },
    { code: "uk", file: "uk_UA", language: "українська", speechCode: "uk-UA" },
    {
      code: "zh_cn",
      file: "zh_CN",
      language: "中文（简体）",
      speechCode: "cmn-Hans-CN",
    },
    //    , { code: 'zh_tw', file: 'zh_TW', language: '中文（繁體）', speechCode: 'cmn-Hant-TW' }
  ] as const;

  let translations = null as typeof Localization | null;

  language.translations = translations;

  language.offerTranslations = function offerTranslations(
    localization: typeof Localization
  ) {
    translations = localization;
    language.translations = translations;
  };

  // case sensitive
  language.translateCS = function translateCaseSensitive(
    text: keyof typeof Localization
  ) {
    if (!translations) return text;
    if (translations[text]) {
      return translations[text];
    }
    // console.log('localization:', text, 'not found');
    return text;
  };

  // case insensitive
  language.translateCI = function translateCaseInsensitive(
    text: keyof typeof Localization
  ) {
    let translated = "";
    var utext = text.toUpperCase();
    _.forEach(translations, function (ts, key) {
      var ukey = key.toUpperCase();
      if (ukey === utext) {
        translated = ts;
      }
    });
    return translated;
  };

  language.translate = function translate(
    text: keyof typeof Localization,
    options?: { ci?: boolean; params?: string[] }
  ) {
    let translated: string;
    if (options && options.ci) {
      translated = language.translateCI(text);
    } else {
      translated = language.translateCS(text);
    }

    var hasCI = false;
    var hasParams = false;

    if (options) {
      hasCI = Object.prototype.hasOwnProperty.call(options, "ci");
      hasParams = Object.prototype.hasOwnProperty.call(options, "params");
    }

    var keys = hasParams ? options?.params : null;

    if (options && !hasCI && !hasParams) {
      keys = [];
      for (var i = 1; i < arguments.length; i++) {
        keys.push(arguments[i]);
      }
    }

    if (options && (hasCI || hasParams) && arguments.length > 2) {
      if (!keys) keys = [];
      for (i = 2; i < arguments.length; i++) {
        keys.push(arguments[i]);
      }
    }

    if (keys) {
      for (i = 0; i < keys.length; i++) {
        /* eslint-disable-next-line no-useless-escape, security/detect-non-literal-regexp */ // validated false positive
        var r = new RegExp("%" + (i + 1), "g");
        translated = translated.replace(r, keys[i]);
      }
    }

    return translated;
  };

  language.DOMtranslate = function DOMtranslate($: JQueryStatic) {
    // do translation of static text on load
    $(".translate").each(function () {
      $(this).text(
        language.translate($(this).text() as keyof typeof Localization)
      );
    });
    $(".titletranslate, .tip").each(function () {
      $(this).attr(
        "title",
        language.translate($(this).attr("title") as keyof typeof Localization)
      );
      $(this).attr(
        "original-title",
        language.translate(
          $(this).attr("original-title") as keyof typeof Localization
        )
      );
      $(this).attr(
        "placeholder",
        language.translate(
          $(this).attr("placeholder") as keyof typeof Localization
        )
      );
    });
  };

  language.getFilename = function getFilename(
    code: (typeof language.languages)[number]["code"] | string
  ) {
    if (code == "en") {
      return "en/en.json";
    }

    let file;
    language.languages.forEach(function (l) {
      if (l.code == code) file = l.file;
    });
    return file + ".json";
  };

  language.set = function set(newlang: string) {
    if (!newlang) return;
    language.lang = newlang;

    language.languages.forEach(function (l) {
      if (l.code === language.lang && l.speechCode)
        language.speechCode = l.speechCode;
    });

    return language();
  };

  language.get = function get(
    lang: (typeof language.languages)[number]["code"]
  ) {
    const found = language.languages.find((l) => l.code === lang);
    if (!found) throw new Error(`Could not load language ${lang} - not found`);
    return found;
  };

  return language();
}
