declare global {
  interface ObjectConstructor {
    keys<T>(obj: T): (keyof T)[];
    values<T>(obj: T): T[keyof T][];
  }
}

export {};
