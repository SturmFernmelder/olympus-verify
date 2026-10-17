/** Compiler surface only, matching the documented Worker run/getStore subset. Runtime/bundle requires genuine qualification. */
declare module 'node:async_hooks' {
  export class AsyncLocalStorage<T> {
    constructor();
    getStore(): T | undefined;
    run<R>(store: T, callback: () => R): R;
  }
}
