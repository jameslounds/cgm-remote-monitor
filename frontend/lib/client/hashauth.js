"use strict";

const crypto = require("crypto");
const Storages = require("js-storage");

class HashAuth {
  /**
   *
   * @param {import("./index")} client
   * @param {JQueryStatic} $
   */
  constructor(client, $) {
    /** @type {string | null} */
    this.apisecret = "";
    this.storeapisecret = false;
    /** @type {string | null} */
    this.apisecrethash = null;
    this.authenticated = false;
    this.tokenauthenticated = false;
    this.hasReadPermission = false;
    this.isAdmin = false;
    this.hasWritePermission = false;
    this.permissionlevel = "NONE";

    this.client = client;
    this.$ = $;
  }

  /**
   * @param {(success: boolean) => void} next
   */
  verifyAuthentication(next) {
    this.authenticated = false;
    $.ajax({
      method: "GET",
      url: "/api/v1/verifyauth?t=" + Date.now(), //cache buster
      headers: this.client.headers(),
    })
      .done((response) => {
        if (!this.#validateVerifyAuthResponse(response)) {
          console.error("Invalid response from /api/v1/verifyauth", response);
          this.removeAuthentication();
          next(false);
          return;
        }
        const message = response.message;
        if (typeof message === "object") {
          if (message.canRead) this.hasReadPermission = true;
          if (message.canWrite) this.hasWritePermission = true;
          if (message.isAdmin) this.isAdmin = true;
          if (message.permissions) this.permissionlevel = message.permissions;
        }

        if (typeof message === "object" && message.rolefound == "FOUND") {
          this.tokenauthenticated = true;
          console.log("Token Authentication passed.");
          next(true);
          return;
        }

        if (
          response.message === "OK" ||
          (typeof message === "object" && message.message === "OK")
        ) {
          this.authenticated = true;
          console.log("Authentication passed.");
          next(true);
          return;
        }

        console.log("Authentication failed!", response);
        this.removeAuthentication();
        next(false);
        return;
      })
      .fail((err) => {
        console.log("Authentication failure", err);
        this.removeAuthentication();
        next(false);
      });
  }

  /**
   * @typedef AuthResponseMessage
   * @property {boolean} [canRead]
   * @property {boolean} [canWrite]
   * @property {boolean} [isAdmin]
   * @property {string} [permissions]
   * @property {string} rolefound
   * @property {string} message
   */
  /** @param {unknown} res @returns {res is {message: AuthResponseMessage} | {message: string}} */
  #validateVerifyAuthResponse(res) {
    if (typeof res !== "object" || !res) {
      return false;
    }
    if (
      !("message" in res) ||
      typeof res.message !== "object" ||
      !res.message
    ) {
      if ("message" in res && typeof res.message === "string") return true;
      return false;
    }

    const msg = res.message;
    if (!("rolefound" in msg) || typeof msg.rolefound !== "string") {
      return false;
    }
    if (!("message" in msg) || typeof msg.message !== "string") {
      return false;
    }
    if ("permissions" in msg && typeof msg.permissions !== "string") {
      return false;
    }
    if ("canRead" in msg && typeof msg.canRead !== "boolean") {
      return false;
    }
    if ("canWrite" in msg && typeof msg.canWrite !== "boolean") {
      return false;
    }
    if ("isAdmin" in msg && typeof msg.isAdmin !== "boolean") {
      return false;
    }
    return true;
  }

  injectHtml() {
    if (!this.injectedHtml) {
      this.$("#authentication_placeholder").html(this.inlineCode());
      this.injectedHtml = true;
    }
  }

  /** @param {(success: boolean) => void} [next]  */
  initAuthentication(next) {
    this.apisecrethash ??=
      Storages.localStorage.get("apisecrethash")?.toString() ?? null;

    this.verifyAuthentication(() => {
      this.injectHtml();
      if (next) {
        next(this.isAuthenticated());
      }
    });
  }

  /** @param {Event} [event] */
  removeAuthentication(event) {
    Storages.localStorage.remove("apisecrethash");

    if (this.authenticated || this.tokenauthenticated) {
      this.client.browserUtils.reload();
    }

    // clear everything just in case
    this.apisecret = null;
    this.apisecrethash = null;
    this.authenticated = false;

    if (event) {
      event.preventDefault();
    }
    return false;
  }

  /** @param {JQuery.Event | Event | ((success: boolean) => void)} [eventOrNext] */
  requestAuthentication(eventOrNext) {
    const translate = this.client.translate;
    this.injectHtml();

    const clientWidth = Math.min(
      400,
      window.innerWidth ||
        document.documentElement.clientWidth ||
        document.body.clientWidth
    );
    const that = this;
    $("#requestauthenticationdialog").dialog({
      width: clientWidth,
      height: 270,
      closeText: "",
      buttons: [
        {
          id: "requestauthenticationdialog-btn",
          text: translate("Authenticate"),
          click: function () {
            const dialog = this;
            that.processSecret(
              $("#apisecret").val()?.toString(),
              $("#storeapisecret").is(":checked"),
              () => {}
            );

            if (typeof eventOrNext === "function") {
              eventOrNext(true);
            } else {
              that.client.afterAuth(true);
            }

            $(dialog).dialog("close");

            // $("#apisecret").val("").trigger("focus");
          },
        },
      ],
      open: () => {
        $("#apisecret")
          .off("keyup")
          .on("keyup", (e) => {
            if (e.key === "Enter") {
              $("#requestauthenticationdialog-btn").trigger("click");
            }
          });
        $("#apisecret").val("").trigger("focus");
      },
    });

    if (typeof eventOrNext === "object") {
      eventOrNext.preventDefault();
    }
    return false;
  }

  /**
   *
   * @param {string} [apisecret]
   * @param {boolean} [storeapisecret]
   * @param {(close: boolean) => void} [callback]
   */
  processSecret(apisecret, storeapisecret, callback) {
    const translate = this.client.translate;

    this.apisecret = apisecret ?? null;
    this.storeapisecret = !!storeapisecret;
    if (!this.apisecret || this.apisecret.length < 12) {
      window.alert(translate("Too short API secret"));
      if (callback) callback(false);
      return;
    }

    const shasum = crypto.createHash("sha1");
    shasum.update(this.apisecret);
    this.apisecrethash = shasum.digest("hex");

    this.verifyAuthentication((isOk) => {
      if (!isOk) {
        alert(translate("Wrong API secret"));
        if (callback) callback(false);
        return;
      }

      if (this.storeapisecret) {
        Storages.localStorage.set("apisecrethash", this.apisecrethash);
        // TODO show dialog first, then reload
        if (this.tokenauthenticated) this.client.browserUtils.reload();
      }

      $("#authentication_placeholder").html(this.inlineCode());

      if (callback) callback(true);
    });
  }

  inlineCode() {
    const translate = this.client.translate;

    /** @type {string | null} */
    let status = null;

    if (!this.isAdmin) $(".needsadminaccess").hide();
    else $(".needsadminaccess").show();

    if (this.client.updateAdminMenu) this.client.updateAdminMenu();

    if (this.client.authorized || this.tokenauthenticated) {
      status = translate("Authorized by token");
      if (this.client.authorized && this.client.authorized.sub) {
        status +=
          "<br>" + translate("Auth role") + ": " + this.client.authorized.sub;
        if (this.hasReadPermission) {
          status += "<br>" + translate("Data reads enabled");
        }
        if (this.hasWritePermission) {
          status += "<br>" + translate("Data writes enabled");
        }
        if (!this.hasWritePermission) {
          status += "<br>" + translate("Data writes not enabled");
        }
      }
      if (this.apisecrethash) {
        status +=
          '<br> <a href="#" onclick="Nightscout.client.hashauth.removeAuthentication(); return false;">(' +
          translate("Remove stored token") +
          ")</a>";
      } else {
        status +=
          '<br><a href="/">(' + translate("view without token") + ")</a>";
      }
    } else if (this.isAuthenticated()) {
      status =
        translate("Admin authorized") +
        ' <a href="#" onclick="Nightscout.client.hashauth.removeAuthentication(); return false;">(' +
        translate("Remove") +
        ")</a>";
    } else {
      status =
        translate("Unauthorized") +
        "<br>" +
        translate("Reads enabled in default permissions") +
        "<br>" +
        ' <a href="#" onclick="Nightscout.client.hashauth.requestAuthentication(); return false;">(' +
        translate("Authenticate") +
        ")</a>";
    }

    return (
      '<div id="requestauthenticationdialog" style="display:none" title="' +
      translate("Device authentication") +
      '">' +
      '<label for="apisecret">' +
      translate("Your API secret or token") +
      ": </label>" +
      '<input type="password" id="apisecret" size="20" style="width: 100%;"/>' +
      "<br>" +
      '<input type="checkbox" id="storeapisecret" /> <label for="storeapisecret">' +
      translate(
        "Remember this device. (Do not enable this on public computers.)"
      ) +
      "</label>" +
      "</div>" +
      '<div id="authorizationstatus">' +
      status +
      "</div>"
    );
  }

  updateSocketAuth() {
    this.client.socket.emit(
      "authorize",
      {
        client: "web",
        secret:
          this.client.authorized && this.client.authorized.token
            ? null
            : this.client.hashauth.hash(),
        token: this.client.authorized && this.client.authorized.token,
      },
      /** @param {{read?: boolean}} data */
      (data) => {
        if (!data.read && !this.client.authorized) {
          this.requestAuthentication();
        }
      }
    );
  }

  hash() {
    return this.apisecrethash;
  }

  isAuthenticated() {
    return this.authenticated || this.tokenauthenticated;
  }
}

module.exports = HashAuth;
