export const callbacksByRouteByEvent = {
  default: {} as Record<string, (...args: any) => void>,
  "/alarm": {} as Record<string, (...args: any) => void>,
};
export const emitResponsesByRouteByEvent = {
  default: {} as Record<string, any>,
  "/alarm": {} as Record<string, any>,
};
export const sockerIOClientMock = {
  connect: (
    routeOrOpts: keyof typeof callbacksByRouteByEvent | Record<string, any>,
    opts?: Record<string, any>
  ) => {
    const route =
      typeof routeOrOpts === "undefined" || typeof routeOrOpts === "object"
        ? "default"
        : routeOrOpts;
    switch (route) {
      case "default":
        return defaultSocket;
      case "/alarm":
        return alarmSocket;
    }
  },
};

const makeSocket = (route: keyof typeof callbacksByRouteByEvent) => ({
  on(event: string, callback: (...args: any) => void) {
    callbacksByRouteByEvent[route][event] = callback;
  },
  emit(event: string, data: any, callback: (...args: any[]) => void) {
    callback(emitResponsesByRouteByEvent[route][event]);
  },

  trigger(event: string, ...args: any[]) {
    const callback = callbacksByRouteByEvent[route][event];
    if (callback) callback(...args);
  },
});

export const defaultSocket = makeSocket("default");
export const alarmSocket = makeSocket("/alarm");
