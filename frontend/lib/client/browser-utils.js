"use strict";

const SMALL_SCREEN = 500;

class BrowserUtils {
  /** @param {JQueryStatic} $ */
  constructor($) {
    this.$ = $;

    /** @type {string | null} */
    this.lastOpenedDrawer = null;

    this.#initTooltips();
    this.#addClickListeners();
  }

  #initTooltips() {
    // Tooltips can remain in the way on touch screens.
    if (!this.#isTouch()) {
      this.$(".tip").tooltip();
    } else {
      // Drawer info tips should be displayed on touchscreens.
      this.$("#drawer").find(".tip").tooltip();
    }

    // @ts-expect-error npm module `jquery.tooltips` does not have any types
    this.$.fn.tooltip.defaults = {
      fade: true,
      gravity: "n",
      opacity: 0.75,
    };
  }

  #isTouch() {
    try {
      document.createEvent("TouchEvent");
      return true;
    } catch {
      return false;
    }
  }

  #addClickListeners() {
    this.$("#drawerToggle").on("click", (event) => {
      this.toggleDrawer("#drawer");
      event.preventDefault();
    });

    $("#notification").on("click", (event) => {
      this.closeNotification();
      event.preventDefault();
    });

    $(".navigation a").on("click", () => {
      this.closeDrawer("#drawer");
    });
  }

  reload() {
    // strip '#' so form submission does not fail
    window.location.href = window.location.href.replace(/#$/, "");
  }

  queryParams() {
    if (typeof location === undefined || !location.search) return {};

    return Object.fromEntries(
      location.search
        .substring(1)
        .split("&")
        .map((kvpair) => {
          const [k, v] = kvpair.split("=");
          return [k, v.replace(/[_\^]/g, " ")];
        })
    );
  }

  /**
   * @param {string} selector
   * @param {() => void} [openPrepare] - a function to be called after closing any
   * already opened drawers and before opening the drawer matching `selector`.
   * Typically used to add placeholder/default value for content in the drawer
   */
  toggleDrawer(selector, openPrepare) {
    if (this.lastOpenedDrawer === selector) {
      this.closeDrawer(selector);
    } else {
      this.openDrawer(selector, openPrepare);
    }
  }

  /**
   * @param {string} selector
   * @param {() => void} [prepare] - a function to be called after closing any
   * already opened drawers and before opening the drawer matching `selector`.
   * Typically used to add placeholder/default value for content in the drawer
   */
  openDrawer(selector, prepare) {
    this.closeLastOpenedDrawer();

    this.lastOpenedDrawer = selector;
    if (prepare) prepare();

    const windowWidth = this.$(window).width() ?? NaN;
    const windowHeight = this.$(window).height() ?? NaN;

    const isSmallScreen =
      windowWidth < SMALL_SCREEN ||
      (windowHeight < SMALL_SCREEN && windowWidth < 800);

    this.$(selector).css({
      display: "block",
      right: "0",
      top: "0px",
      height: `${isSmallScreen ? windowHeight : windowHeight - 45}px`,
      width: `${isSmallScreen ? windowWidth : 250}px`,
    });
  }

  /** @param {string} selector */
  closeDrawer(selector) {
    this.lastOpenedDrawer = null;

    $("html, body").css({ scrollTop: 0 });
    $(selector).css({ display: "none", right: "-300px" });
  }

  closeLastOpenedDrawer() {
    if (this.lastOpenedDrawer) {
      this.closeDrawer(this.lastOpenedDrawer);
    }
  }

  closeNotification() {
    this.$("#notification").hide().find("span").html("");
  }

  /** @param {string} note @param {string} type */
  showNotifications(note, type) {
    const notify = this.$("#notification");

    const windowWidth = this.$(window).width() ?? NaN;
    const notifyWidth = notify.width() ?? NaN;

    const left = (windowWidth - notifyWidth) / 2;

    notify.hide();

    // Notification types: 'info', 'warn', 'success', 'urgent'.
    // - default: 'urgent'
    notify
      .removeClass(["info", "warn", "urgent"])
      .addClass(type ? type : "urgent");
    notify.css({ left: `${left}px` });
    notify.find("span").html(note);

    notify.show();
  }

  getLastOpenedDrawer() {
    return this.lastOpenedDrawer;
  }
}

/** @param {ConstructorParameters<typeof BrowserUtils>} args */
module.exports = (...args) => new BrowserUtils(...args);
