module "js-storage" {
  export namespace JSStorage {
    export type Value = string | Record<string, any> | null;
    interface Storage {
      get(key: string): Value;
      /** Say `Storage.get("foo") = { bar: {baz: 1, buzz: 2}}`, then `Storage.get("foo", "bar", "baz") = 1` */
      get(...keys: string[]): Value;
      get<TLeafKeys extends string>(
        keys: TLeafKeys[]
      ): { [K in TLeafKeys]: Value };
      get<TLeafKeys extends string>(
        ...key: string[],
        leafKeys: TLeafKeys[]
      ): { [K in TLeafKeys]: Value };

      set(key: string, value: Value): string;
      set(key: string[], value: Value): string;
      set(...key: string[], value: Value): string;
      set(keyValueMap: Record<string, Value>): string;

      keys(): string[];
      keys(key: string): string[];
      keys(...key: string[]): string[];

      isEmpty(key: string): boolean;
      isEmpty(...key: string[]): boolean;
      /** NB: This is only true when *all* `leafKeys` are empty
       * @example
       * set("one", {bar: "present"})
       * isEmpty("one", ["bar", "baz"]) // false, because `bar` was not empty
       * set("two", {other: "present"})
       * isEmpty("two", ["bar"]) // true
       */
      isEmpty(...key: string[], leafKeys: string[]): boolean;

      isSet(key: string): boolean;
      isSet(...key: string[]): boolean;
      /** NB this is only true when *all* `leafKeys` are set
       * @example
       * set("one", {bar: "present"})
       * isSet("one", ["bar", "baz"]) // false, because `baz` was not set
       * set("two", {bar: "present"})
       * isSet("two", ["bar"]) // true
       */
      isSet(...key: string[], leafKeys: string[]): boolean;

      remove(key: string): boolean;
      remove(...key: string[]): boolean;
      remove(...key: string[], leafKeys: string[]): boolean;

      /** @param onlyGlobal if true, reinitialize previously initialized namespaces after removal */
      removeAll(onlyGlobal?: boolean): void;
    }

    interface CookieStorage extends Storage {
      setExpires(days: number): Storage;
      setPath(path: string): Storage;
      setDomain(domain: string): Storage;
      setSecure(secure: boolean): Storage;
      /** NB: this function cannot set `secure` to false, it can only set it to `true` */
      setConf(conf: {
        /** days */
        expiry?: number;
        path?: string;
        domain?: string;
        secure?: boolean;
      }): Storage;
      setDefaultConf(): Storage;
    }
    type NSStorage = {
      localStorage: Storage;
      sessionStorage: Storage;
    };
  }
  const storage: {
    localStorage: JSStorage.Storage;
    namespaceStorages: Record<string, JSStorage.NSStorage>;
    initNamespaceStorage: (ns: string) => JSStorage.NSStorage;
    alwaysUseJsonInStorage: (alwaysUseJSON: boolean) => void;
    /** @see {@link JSStorage.Storage.removeAll} */
    removeAllStorages: (onlyGlobal: boolean) => void;
  };
  export = storage;
}
