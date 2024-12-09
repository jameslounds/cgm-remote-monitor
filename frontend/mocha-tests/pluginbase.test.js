"use strict";

require("should");

let window, document;
describe("pluginbase", function () {
  this.timeout(50000); // TODO: see why this test takes longer on Travis to complete

  var headless = require("./fixtures/headless")(this);

  before(function (done) {
    done();
  });

  after(function (done) {
    done();
  });

  beforeEach(function (done) {
    ({ window, document } = headless.setup({}, () => done()));
  });

  afterEach(function (done) {
    headless.teardown();
    done();
  });

  it("does stuff", function () {
    function div(clazz) {
      return $('<div class="' + clazz + '"></div>');
    }

    var container = div("container"),
      bgStatus = div("bgStatus").appendTo(container),
      majorPills = div("majorPills").appendTo(bgStatus),
      minorPills = div("minorPills").appendTo(bgStatus),
      statusPills = div("statusPills").appendTo(bgStatus),
      tooltip = div("tooltip").appendTo(container);
    var fake = {
      name: "fake",
      label: "Insulin-on-Board",
      pluginType: "pill-major",
    };

    var pluginbase = require("../lib/plugins/pluginbase")(
      majorPills,
      minorPills,
      statusPills,
      bgStatus,
      tooltip
    );

    pluginbase.updatePillText(fake, {
      value: "123",
      label: "TEST",
      info: [{ label: "Label", value: "Value" }],
    });

    majorPills.length.should.equal(1);
  });
});
