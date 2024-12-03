import { vi } from "vitest";

export const mockState: Map<
  RegExp | string,
  { data: any; error?: never } | { error: any; data?: never }
> = new Map();
export const ajaxMock = vi.fn() as ReturnType<typeof vi.fn> & {
  mockState: typeof mockState;
};

type ValueOfMap<T> = T extends Map<any, infer G> ? G : never;

function mockImplementation(
  opts: JQuery.AjaxSettings & { url: string }
): JQuery.jqXHR;
function mockImplementation(
  maybeOpts: string,
  opts?: JQuery.AjaxSettings
): JQuery.jqXHR;
function mockImplementation(
  maybeOpts: (JQuery.AjaxSettings & { url: string }) | string,
  opts?: JQuery.AjaxSettings
): JQuery.jqXHR {
  const url = typeof maybeOpts === "string" ? maybeOpts : maybeOpts.url;
  console.log("mocking url", url);
  opts = typeof maybeOpts === "string" ? opts : maybeOpts;

  const data = [...mockState.entries()].find(([matcher, data]) =>
    url.match(matcher)
  )?.[1];

  if (!data) throw Error(`[mockAjax] route ${url} not handled`);
  class AjaxReturnMock implements JQuery.jqXHR {
    constructor(private data: ValueOfMap<typeof mockState>) {}

    state() {
      return "resolved" as "resolved";
    }
    done(callback: (d: any) => void) {
      if (this.data.data) {
        callback(opts?.success ? undefined : this.data.data);
      }
      return this;
    }
    fail(callback: (d: any) => void) {
      if (this.data.error) {
        callback(this.data.error);
      }
      return this;
    }
    statusCode() {
      return this.data.error ? 500 : 200;
    }
    get responseText() {
      return this.data.error ? "error" : "OK";
    }
    abort() {}
    always(callback: (d: any) => void) {
      callback(this.data.data || this.data.error);
      return this;
    }
    progress() {
      return this;
    }
    promise() {
      return this;
    }
    pipe() {
      return this;
    }
    then() {
      return this;
    }
    catch() {
      return this;
    }
    getAllResponseHeaders() {
      return "";
    }
    getResponseHeader() {
      return "";
    }
    overrideMimeType() {
      return "";
    }
    get readyState() {
      return 1;
    }
    setRequestHeader() {
      return this;
    }
    get status() {
      return this.data.error ? 500 : 200;
    }
    get statusText() {
      return this.data.error ? "error" : "OK";
    }
  }
  const mock = new AjaxReturnMock(data);
  if (opts?.success && data.data) {
    if (!Array.isArray(opts.success)) {
      opts.success(data.data, "success", mock);
    }
  }
  return mock;
}
ajaxMock.mockImplementation(mockImplementation);
ajaxMock.mockState = mockState;
