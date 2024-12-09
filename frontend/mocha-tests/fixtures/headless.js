const fs = require("fs");
const _ = require("lodash");
const { Window } = require("happy-dom");
const path = require("path");

function headless(binding = {}) {
  const self = binding;

  global.moment = require("moment-timezone");

  function root() {
    return self.window;
  }

  async function init(options, callback) {
    const localStorage = options.localStorage || "./localstorage";
    const t = Date.now();

    console.log("Headless init");

    const htmlFile = options.htmlFile || path.resolve("./bundle/index.html");
    const serverSettings =
      options.serverSettings || require("./default-server-settings");

    if (options.mockAjax === true) options.mockAjax = {};
    let mockAjaxResponses = options.mockAjax || {};

    console.log("Entering setup", Date.now() - t);

    const window = new Window({
      url: "http://localhost",
      width: 1024,
      height: 768,
    });
    global.window = self.window = window;
    global.document = window.document;
    global.location = window.location;

    const indexHtml = fs.readFileSync(htmlFile, "utf8");
    const regex = /<script[^>]*>[\s\S]*?<\/script>/g;
    window.document.body.innerHTML = indexHtml.replace(regex, "");

    console.log("HTML set", Date.now() - t);

    const $ = require("jquery"); // must be done *after* instantiating `new Window`
    $.localStorage = require(localStorage);

    if (options.mockProfileEditor) {
      $.plot = function mockPlot() {};

      $.fn.tooltip = function mockTooltip() {};

      $.fn.dialog = function mockDialog(options) {
        function maybeCall(name, obj) {
          if (obj[name] && obj[name].call) {
            obj[name]();
          }
        }
        maybeCall("open", options);

        _.forEach(options.buttons, function (button) {
          maybeCall("click", button);
        });
      };
    }
    if (options.mockSimpleAjax) {
      mockAjaxResponses = options.mockSimpleAjax;
      $.ajax = function mockAjax(url, options) {
        if (url && url.url) {
          url = url.url;
        }

        var returnVal = mockAjaxResponses[url] || [];
        if (options && typeof options.success === "function") {
          options.success(returnVal);
          return $.Deferred().resolveWith(returnVal);
        } else {
          return {
            done: function mockDone(fn) {
              if (url.indexOf("status.json") > -1) {
                fn(serverSettings);
              } else {
                fn({ message: "OK" });
              }
              return $.ajax();
            },
            fail: function mockFail() {
              return $.ajax();
            },
          };
        }
      };
    }
    if (options.mockAjax) {
      $.ajax = function mockAjax(url, options) {
        if (url && url.url) {
          url = url.url;
        }
        if (
          !!url &&
          !(url in mockAjaxResponses) &&
          !url.includes("status.json")
        ) {
          const maybeNewUrl = Object.keys(mockAjaxResponses).find((key) =>
            url.includes(key)
          );
          if (maybeNewUrl) {
            url = maybeNewUrl;
          }
        }

        //logfile.write(url+'\n');
        //console.log(url,options);
        if (options && options.success && options.success.call) {
          return {
            done: function mockDone(fn) {
              if (mockAjaxResponses[url]) {
                console.log("+++++Data for " + url + " sent");
                options.success(mockAjaxResponses[url]);
              } else {
                console.log("-----Data for " + url + " missing");
                options.success([]);
              }
              fn();
              return $.ajax();
            },
            fail: function mockFail() {
              return $.ajax();
            },
          };
        }
        return {
          done: function mockDone(fn) {
            if (url.indexOf("status.json") > -1) {
              fn(serverSettings);
            } else if (url in mockAjaxResponses) {
              console.log("+++++Data for " + url + " sent");
              fn(mockAjaxResponses[url]);
            } else {
              fn({ message: "OK" });
            }
            return $.ajax();
          },
          fail: function mockFail() {
            return $.ajax();
          },
        };
      };
    }

    // $.fn.tooltip = function mockTooltip() {};
    // $.fn.dialog = function mockDialog(options) {
    //   function maybeCall(name, obj) {
    //     if (obj[name] && obj[name].call) {
    //       obj[name]();
    //     }
    //   }

    //   maybeCall("open", opts);

    //   _.forEach(opts.buttons, function (button) {
    //     maybeCall("click", button);
    //   });
    // };
    const io = {
      connect: function mockConnect() {
        return {
          on: function mockOn(event, cb) {
            if ("connect" === event && cb) {
              cb();
            }
          },
          emit: function mockEmit(event, data, cb) {
            if ("authorize" === event && cb) {
              cb({
                read: true,
              });
            }
          },
        };
      },
    };

    self.$ = global.$ = $;
    self.jQuery = global.jQuery = $;
    self.io = global.io = io;
    // not sure why, but `require`ing d3 doesn't work
    self.d3 = global.d3 = await import("d3");
    // happy dom doesn't set this as global by default, necessary for d3 to work
    global.requestAnimationFrame = window.requestAnimationFrame;
    self.serverSettings = global.serverSettings = serverSettings;
    self.localCookieStorage =
      global.localCookieStorage =
      self.localStorage =
        $.localStorage;

    const ns = (await import("../../bundle/bundle.source.js")).default;
    if (!window.Nightscout) {
      window.Nightscout = ns;
    }
    console.log("loaded bundle ok");
    const extraRequires = options.benvRequires || [];
    await Promise.all(
      extraRequires.map((req) => {
        try {
          import(req);
        } catch (err) {
          console.log("Failed to load", req, err);
        }
      })
    );

    if (options.waitForLoad) {
      console.log("waiting for load event");
      await new Promise((resolve) =>
        document.addEventListener("Nightscout-load", () => {
          console.log("got load event");
          resolve();
        })
      );

      console.log("calling callback");
      callback({ document, window });
    } else {
      console.log("calling callback");
      callback({ document, window });
    }
  }

  function teardown() {
    if (self.window) {
      self.window.happyDOM.close();

      delete global.window;
      delete self.window;
      delete global.document;
      // delete global.$;
      // delete global.jQuery;
      delete global.io;
      delete global.d3;
      delete global.serverSettings;
      delete global.localCookieStorage;
    }
  }

  root.setup = init;
  root.teardown = teardown;

  return root;
}

module.exports = headless;
