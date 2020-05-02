type txID = string;

type refVersion = number;

interface Ref<T> {
  read(): T;
  version: refVersion;
  write(v: T): T;
}

interface TransientRef<T> {
  transient<T>(): T;
  persist<T>(t: T): TransientRef<T>;
}

// type RefMap<T> = Map<Ref<T>, T>;

// interface ExecutionContext {
//   fn: Function;
//   dependentRefs: { ref: Ref<any>; version: refVersion }[];
// }

interface TransactionContext {
  id: txID;
  // currentRefValues: RefMap<any>;
  // executionBlocks: ExecutionContext[];
  read<T>(ref: Ref<T>): T;
  write<T>(ref: Ref<T>, v: T): T;
}

interface TransactionReport {}

interface ExecutionReport {}

export interface Transaction {
  add(executionBlock: () => any): Transaction;
  addLazy(executionBlock: () => any): Transaction;
  doIn<T>(f: () => T): T;
  retry(): void;
  commit(): TransactionReport;

  onExecute(f: (exec: ExecutionReport) => void): void;
  onRetry(f: () => void): void;
  onCommit(f: (tx: TransactionReport) => void): void;
}

let ctx: { current: undefined | TransactionContext } = {
  current: undefined,
};

export function deref<T>(ref: Ref<T>): T {
  if (ctx.current) {
    return ctx.current.read(ref);
  }
  return ref.read();
}

export function set<T>(ref: Ref<T>, v: T): T {
  if (ctx.current) {
    return ctx.current.write(ref, v);
  }

  throw new Error("Cannot set ref outside of transaction");
}

export function alter<T>(
  ref: Ref<T>,
  f: (current: T, ...args: any[]) => T,
  ...args: any[]
): T {
  return set(ref, f(deref(ref), ...args));
}

export function ensure(ref: Ref<any>): void {
  set(ref, deref(ref));
}

export function commute<T>(
  ref: Ref<any>,
  f: (current: T, ...args: any[]) => T,
  ...args: any[]
) {}

export function defer(f: Function): void {}

export function compensate(f: (...args: any[]) => Function): void {}
