type txID = string;

type refVersion = number;

interface IRef<T> {
  read(): T;
  version: refVersion;
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
    this.version++;
    return v;
  }
}

interface ITransactionContext {
  id: txID;
  isWriteable: boolean;
  read<T>(ref: IRef<T>): T;
  write<T>(ref: IRef<T>, v: T): T;
  getRefEntries(): any;
}

let nextTxID = 0;

function genTxID() {
  return "tx" + nextTxID++;
}

type RefMap<T> = Map<IRef<T>, { value: T; version: refVersion }>;

interface ThunkContext {
  fn: Function;
  dependentRefs: { ref: IRef<any>; version: refVersion }[];
}

class TransactionContext implements ITransactionContext {
  id: txID;
  currentRefValues: RefMap<any>;
  isWriteable: boolean;
  constructor() {
    this.id = genTxID();
    this.currentRefValues = new Map();
    this.isWriteable = true;
  }
  read<T>(ref: IRef<T>): T {
    if (this.currentRefValues.has(ref)) {
      return this.currentRefValues.get(ref)?.value;
    }
    // should we add read values to tx??
    if (this.isWriteable) {
      return this.write(ref, ref.read());
    }
    return ref.read();
  }
  write<T>(ref: IRef<T>, v: T): T {
    if (!this.isWriteable) {
      throw new Error("Cannot change ref inside of doIn");
    }
    // TODO add check here for drift
    this.currentRefValues.set(ref, { value: v, version: ref.version });
    return v;
  }
  getRefEntries() {
    return this.currentRefValues.entries();
  }
}

interface TransactionReport {
  alteredRefs: RefMap<any>;
}

interface ThunkReport {}

export interface ITransaction extends Iterable<Function> {
  add(thunk: () => any): ITransaction;
  doIn<T>(f: () => T): T;
  retry(): ITransaction;
  commit(): TransactionReport;
  isCommitted: boolean;
  isAborted: boolean;

  onExecute(f: (report: ThunkReport) => void): () => void;
  onRetry(f: () => void): () => void;
  onCommit(f: (tx: TransactionReport) => void): () => void;
}

let ctx: { current: undefined | ITransactionContext } = {
  current: undefined,
};

let retrySignal = {};

class Transaction implements ITransaction {
  private context: ITransactionContext;
  private unrealizedThunks: Function[];
  private realizedThunks: ThunkContext[];
  isCommitted: boolean;
  isAborted: boolean;
  constructor() {
    this.context = new TransactionContext();
    this.unrealizedThunks = [];
    this.realizedThunks = [];
    this.isCommitted = false;
    this.isAborted = false;
  }
  *[Symbol.iterator]() {
    while (!this.isAborted && this.unrealizedThunks.length) {
      let [thunk, ...rest] = this.unrealizedThunks;
      this.realizedThunks.push({ fn: thunk, dependentRefs: [] });
      this.unrealizedThunks = rest;
      yield () => {
        let error;
        ctx.current = this.context;
        try {
          thunk();
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
  add(thunk: () => any) {
    if (this.isCommitted) {
      throw new Error("Cannot add to transaction which has been committed");
    }
    if (this.isAborted) {
      throw new Error(
        "Cannot add to transaction which has been aborted. Retry it first"
      );
    }

    this.unrealizedThunks.push(thunk);

    return this;
  }
  doIn<T>(f: () => T): T {
    let v;
    this.context.isWriteable = false;
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
    this.context.isWriteable = true;

    return v;
  }
  retry() {
    if (this.isCommitted) {
      throw new Error("Cannot retry transaction which has been committed");
    }
    // general strategy atm is to move all thunks into unrealized state
    // reset context and then exec them at a later time
    this.unrealizedThunks = this.realizedThunks.map(({ fn }) => fn);
    this.realizedThunks = [];
    this.context = new TransactionContext();
    this.isAborted = false;
    return this;
  }
  commit(): TransactionReport {
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

    // realize any left over thunks
    for (let thunk of this) {
      thunk();
    }

    let alteredRefs = new Map();
    try {
      for (let refEntry of this.context.getRefEntries()) {
        let [ref, current] = refEntry;
        if (ref.version !== current.version) {
          // drift occurred, retry
          throw retrySignal;
        }
        alteredRefs.set(ref, current.value);
        ref.unsafeWrite(current.value);
      }
    } catch (e) {
      if (e === retrySignal) {
        this.retry();
        return this.commit();
      }
    }
    this.isCommitted = true;
    return { alteredRefs };
  }

  onExecute(f: (e: ThunkReport) => void) {
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
