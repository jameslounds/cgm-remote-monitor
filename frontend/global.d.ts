declare global {
  interface ObjectConstructor {
    keys<T>(obj: T): (keyof T)[];
  }
}

export {};
