"use strict";

class AdminNotifiesClient {
  /**
   * @param {import(".")} client
   * @param {JQueryStatic} $
   */
  constructor(client, $) {
    /** @protected */
    this.client = client;
    /** @protected */
    this.$ = $;

    /** @protected @type {(import("../types").Notify & {[K in "count" | "lastRecorded"]: NonNullable<import("../types").Notify>})[]} */
    this.notifies = [];
    /** @protected @type {number | undefined} */
    this.notifyCount = undefined;
    /** @protected */
    this.drawer = $("#adminNotifiesDrawer");
    /** @protected */
    this.button = $("#adminnotifies");

    this.updateAdminNotifies();

    this.button.on("click", (event) => {
      this.client.browserUtils.toggleDrawer("#adminNotifiesDrawer", () => {
        this.prepare();
        event.preventDefault();
      });
    });
    this.button.css("color", "red");
  }

  updateAdminNotifies() {
    this.$.ajax({
      method: "GET",
      url: `/api/v1/adminnotifies?t=${new Date().getTime()}`,
      headers: this.client.headers(),
    })
      .done((results) => {
        if (results.message) {
          const message = results.message;

          this.notifies = message.notifies;
          this.notifyCount = message.notifyCount;

          if (message.notifyCount > 0) this.button.show();
        }

        window.setTimeout(() => this.updateAdminNotifies(), 1000 * 60);
      })
      .fail(() => {
        console.error("Failed to load notifies");

        window.setTimeout(() => this.updateAdminNotifies(), 1000 * 60);
      });
  }

  /**
   * @param {object} opts
   * @param {string} opts.title
   * @param {string} opts.message
   * @param {number} [opts.count]
   * @param {number} [opts.ago]
   * @param {boolean} [opts.persistent]
   */
  #wrapmessage({ title, message, count, ago, persistent }) {
    const translate = this.client.translate;
    return `<hr />
    <p><b>${title}</b></p>
    <p class="adminNotifyMessage">${message}</p>
    <p class="adminNotifyMessageAdditionalInfo">
      ${count && count > 1 ? translate("Event repeated %1 times.", { params: [count.toString()] }) : ""}
      ${
        !persistent
          ? translate("Last recorded %1 %2 ago.", {
              params: [
                (!!ago && ago > 60
                  ? Math.round((ago / 60 + Number.EPSILON) * 10) / 10
                  : ago || translate("less than 1")
                ).toString(),
                translate(!!ago && ago > 60 ? "hours" : "minutes"),
              ],
            })
          : ""
      }
    </p>`;
  }

  #drawerHtml() {
    /** @type {ReturnType<import("../language")>["translate"]} */
    const translate = this.client.translate;

    if (!this.notifies) {
      if (this.notifyCount) {
        return this.#wrapmessage({
          title: translate("Admin messages in queue"),
          message: translate(
            "Please sign in using the API_SECRET to see your administration messages"
          ),
        });
      } else {
        return this.#wrapmessage({
          title: translate("Queue empty"),
          message: translate("There are no admin messages in queue"),
        });
      }
    }

    return `
    <div id="adminNotifyContent">
      <p><b>${translate("You have administration messages")}</b></p>
      ${this.notifies.map((m) =>
        this.#wrapmessage({
          title: this.client.language.isTranslationKey(m.title)
            ? translate(m.title)
            : m.title,
          message: this.client.language.isTranslationKey(m.message)
            ? translate(m.message)
            : m.message,
          count: m.count,
          ago: Math.round((Date.now() - m.lastRecorded) / 60000),
          persistent: m.persistent,
        })
      )}
      <br />
    </div>
    `;
  }

  prepare() {
    this.drawer.html(this.#drawerHtml());
  }
}

module.exports = AdminNotifiesClient;
