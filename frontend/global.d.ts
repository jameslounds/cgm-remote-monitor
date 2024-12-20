declare global {
  interface ObjectConstructor {
    keys<T>(obj: T): (keyof T)[];
    values<T>(obj: T): T[keyof T][];
    entries<T>(obj: T): {
      [K in keyof T]: [
        K,
        T[K] extends undefined ? undefined : Exclude<T[K], undefined>,
      ];
    }[keyof T][];
  }
  function isNaN(value?: string | number): boolean;
}

export {};
