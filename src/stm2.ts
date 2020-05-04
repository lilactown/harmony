type txID = string;

type refVersion = number;

interface IRef<T> {
  read(): T;
  version: refVersion;
  incVersion(): refVersion;
  unsafeWrite(v: T): T;
}

class Ref<T> implements IRef<T> {
  private current: T;
  version: refVersion;
  constructor(init: T) {
    this.current = init;
    this.version = 0;
  }
  read() {
    return this.current;
  }
  unsafeWrite(v: T) {
    this.current = v;
    return v;
  }
  incVersion() {
    return ++this.version;
  }
}

interface ITransactionContext {
  id: txID;
  read<T>(ref: IRef<T>): T;
  write<T>(ref: IRef<T>, v: T): T;
  getRefEntries(): any;
}

let nextTxID = 0;

function genTxID() {
  return "tx" + nextTxID++;
}

type RefMap<T> = Map<IRef<T>, T>;

interface ExecutionContext {
  fn: Function;
  dependentRefs: { ref: IRef<any>; version: refVersion }[];
}

class TransactionContext implements ITransactionContext {
  id: txID;
  currentRefValues: RefMap<any>;
  constructor() {
    this.id = genTxID();
    this.currentRefValues = new Map();
  }
  read<T>(ref: IRef<T>): T {
    if (this.currentRefValues.has(ref)) {
      return this.currentRefValues.get(ref);
    }
    // should we add read values to tx??
    return this.write(ref, ref.read());
  }
  write<T>(ref: IRef<T>, v: T): T {
    // TODO add check here for drift
    this.currentRefValues.set(ref, v);
    return v;
  }
  getRefEntries() {
    return this.currentRefValues.entries();
  }
}

interface TransactionReport {
  alteredRefs: RefMap<any>;
}

interface ExecutionReport {}

export interface ITransaction extends Iterable<Function> {
  add(execution: () => any): ITransaction;
  doIn<T>(f: () => T): T;
  retry(): ITransaction;
  commit(): TransactionReport;
  isCommitted: boolean;
  isAborted: boolean;

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
  isCommitted: boolean;
  isAborted: boolean;
  constructor() {
    this.context = new TransactionContext();
    this.unrealizedExecs = [];
    this.realizedExecs = [];
    this.isCommitted = false;
    this.isAborted = false;
  }
  *[Symbol.iterator]() {
    while (!this.isAborted && this.unrealizedExecs.length) {
      let [exec, ...rest] = this.unrealizedExecs;
      this.realizedExecs.push({ fn: exec, dependentRefs: [] });
      this.unrealizedExecs = rest;
      yield () => {
        let error;
        ctx.current = this.context;
        try {
          exec();
        } catch (e) {
          error = e;
        }
        ctx.current = undefined;
        if (error === retrySignal) {
          this.retry();
        } else if (error) {
          this.isAborted = true;
          throw error;
        }
      };
    }
  }
  add(exec: () => any) {
    if (this.isCommitted) {
      throw new Error("Cannot add to transaction which has been committed");
    }
    if (this.isAborted) {
      throw new Error(
        "Cannot add to transaction which has been aborted. Retry it first"
      );
    }

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
    if (this.isCommitted) {
      throw new Error("Cannot retry transaction which has been committed");
    }
    // general strategy atm is to move all exec fns into unrealized state
    // reset context and then exec them at a later time
    this.unrealizedExecs = this.realizedExecs.map(({ fn }) => fn);
    this.realizedExecs = [];
    this.context = new TransactionContext();
    this.isAborted = false;
    return this;
  }
  commit() {
    if (this.isCommitted) {
      throw new Error(
        "Cannot commit transaction which has already been committed"
      );
    }
    if (this.isAborted) {
      throw new Error(
        "Cannot commit transaction which has been aborted. Retry it first"
      );
    }

    // realize any left over execs
    for (let exec of this) {
      exec();
    }

    let alteredRefs = new Map();
    for (let refEntry of this.context.getRefEntries()) {
      let [ref, value] = refEntry;
      alteredRefs.set(ref, value);
      ref.unsafeWrite(value);
    }
    this.isCommitted = true;
    return { alteredRefs };
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

export function ref<T>(v: T): IRef<T> {
  return new Ref(v);
}

export function deref<T>(ref: IRef<T>): T {
  if (ctx.current) {
    return ctx.current.read(ref);
  }
  return ref.read();
}

export function set<T>(ref: IRef<T>, v: T): T {
  if (ctx.current) {
    return ctx.current.write(ref, v);
  }
  throw new Error("Cannot set ref outside of transaction");
}

export function alter<T>(
  ref: IRef<T>,
  f: (current: T, ...args: any[]) => T,
  ...args: any[]
): T {
  return set(ref, f(deref(ref), ...args));
}

export function ensure(ref: IRef<any>): void {
  set(ref, deref(ref));
}

export function commute<T>(
  ref: IRef<any>,
  f: (current: T, ...args: any[]) => T,
  ...args: any[]
) {}

export function defer(f: Function): void {}

export function compensate(f: (...args: any[]) => Function): void {}
