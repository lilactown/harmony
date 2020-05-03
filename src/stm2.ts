type txID = string;

type refVersion = number;

interface Ref<T> {
  read(): T;
  version(): refVersion;
  unsafeWrite(v: T): T;
}

interface ITransactionContext {
  id: txID;
  read<T>(ref: Ref<T>): T;
  write<T>(ref: Ref<T>, v: T): T;
}

let nextTxID = 0;

function genTxID() {
  return "tx" + nextTxID++;
}

type RefMap<T> = Map<Ref<T>, T>;

interface ExecutionContext {
  fn: Function;
  dependentRefs: { ref: Ref<any>; version: refVersion }[];
}

class TransactionContext implements ITransactionContext {
  id: txID;
  currentRefValues: RefMap<any>;
  constructor() {
    this.id = genTxID();
    this.currentRefValues = new Map();
  }
  read<T>(ref: Ref<T>): T {
    if (this.currentRefValues.has(ref)) {
      return this.currentRefValues.get(ref);
    }
    // should we add read values to tx??
    return this.write(ref, ref.read());
  }
  write<T>(ref: Ref<T>, v: T): T {
    this.currentRefValues.set(ref, v);
    return v;
  }
}

interface TransactionReport {
  alteredRefs: RefMap<any>;
}

interface ExecutionReport {}

export interface ITransaction {
  add(execution: () => any): ITransaction;
  addLazy(execution: () => any): ITransaction;
  doIn<T>(f: () => T): T;
  retry(): ITransaction;
  commit(): TransactionReport;

  onExecute(f: (exec: ExecutionReport) => void): () => void;
  onRetry(f: () => void): () => void;
  onCommit(f: (tx: TransactionReport) => void): () => void;
}

let ctx: { current: undefined | ITransactionContext } = {
  current: undefined,
};

let retrySignal = {};

class Transaction implements ITransaction {
  private context: ITransactionContext;
  private unrealizedExecs: Function[];
  private realizedExecs: ExecutionContext[];
  constructor() {
    this.context = new TransactionContext();
    this.unrealizedExecs = [];
    this.realizedExecs = [];
  }
  add(exec: () => any) {
    let error;
    ctx.current = this.context;
    try {
      // this will block until all lazyExecs are finished; perhaps we should
      // have this be a separate `realize` method?
      if (this.unrealizedExecs.length) {
        // important to capture execCount outside the loop, before modifying it
        let execCount = this.unrealizedExecs.length;
        for (let i = 0; i < execCount; i++) {
          let [exec, ...rest] = this.unrealizedExecs;
          exec();
          this.unrealizedExecs = rest;
        }
      }
      exec();
      // TODO add dependentRefs
      this.realizedExecs.push({ fn: exec, dependentRefs: [] });
    } catch (e) {
      error = e;
    }
    ctx.current = undefined;
    if (error === retrySignal) {
      return this.retry();
    } else if (error) {
      throw error;
    }
    return this;
  }
  addLazy(exec: () => any) {
    this.unrealizedExecs.push(exec);
    return this;
  }
  doIn<T>(f: () => T): T {
    let v;
    ctx.current = this.context;
    // TODO find some way to disable writing in doIn
    try {
      v = f();
    } catch (e) {
      if (e === retrySignal) {
        throw new Error("Executions in doIn cannot retry.");
      } else throw e;
    }
    ctx.current = undefined;
    return v;
  }
  retry() {
    // general strategy atm is to move all exec fns into unrealized state
    // reset context and then exec them at a later time
    this.unrealizedExecs = this.realizedExecs.map(({ fn }) => fn);
    this.realizedExecs = [];
    this.context = new TransactionContext();
    return this;
  }
  commit() {
    return { alteredRefs: new Map() };
  }

  onExecute(f: (e: ExecutionReport) => void) {
    return () => void 0;
  }
  onRetry(f: () => void) {
    return () => void 0;
  }
  onCommit(f: (e: TransactionReport) => void) {
    return () => void 0;
  }
}

export function transaction(): ITransaction {
  return new Transaction();
}

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
