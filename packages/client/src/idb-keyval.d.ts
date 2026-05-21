declare module 'idb-keyval' {
  export function get<T = any>(key: IDBValidKey): Promise<T | undefined>;
  export function set(key: IDBValidKey, value: any): Promise<void>;
  export function del(key: IDBValidKey): Promise<void>;
  export function clear(): Promise<void>;
  export function keys<T = IDBValidKey>(): Promise<T[]>;
}
