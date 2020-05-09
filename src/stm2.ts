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
  parent: ITransaction;
  read<T>(ref: IRef<T>): T;
  write<T>(ref: IRef<T>, v: T): T;
  getRefEntries(): any;
}

let _idSrc = 0;

function nextTxId() {
  return "tx" + _idSrc++;
}

type RefMap<T> = Map<IRef<T>, { value: T; version: refVersion }>;

class TransactionContext implements ITransactionContext {
  id: txID;
  currentRefValues: RefMap<any>;
  isWriteable: boolean;
  parent: ITransaction;
  constructor(parent: ITransaction) {
    this.id = nextTxId();
    this.currentRefValues = new Map();
    this.isWriteable = true;
    this.parent = parent;
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

export interface ITransaction {
  // extends Iterable<Function>
  add(thunk: () => any): ITransaction;
  doIn<T>(f: () => T): T;
  //  next(): () => any;
  rebase(): ITransaction;
  flush(): ITransaction;
  flushNext(): ITransaction;
  commit(): ITransaction;
  isCommitted: boolean;
  isAborted: boolean;

  onExecute(f: () => void): () => void;
  onRebase(f: () => void): () => void;
  onCommit(f: () => void): () => void;
}

let ctx: { current: undefined | ITransactionContext } = {
  current: undefined,
};

let rebaseSignal = {};

class Transaction implements ITransaction {
  private context: ITransactionContext;
  private unrealizedThunks: Function[];
  private realizedThunks: Function[];
  isCommitted: boolean;
  isAborted: boolean;
  autoRebase: boolean;
  constructor(autoRebase: boolean, context?: ITransactionContext) {
    this.context = context || new TransactionContext(this);
    this.unrealizedThunks = [];
    this.realizedThunks = [];
    this.isCommitted = false;
    this.isAborted = false;
    this.autoRebase = autoRebase;
  }

  isParentTransaction() {
    return this.context.parent === this;
  }

  add(thunk: () => any) {
    if (this.isCommitted) {
      throw new Error("Cannot add to transaction which has been committed");
    }
    if (this.isAborted) {
      throw new Error(
        "Cannot add to transaction which has been aborted. Rebase it first"
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
      if (e === rebaseSignal) {
        throw new Error("Executions in doIn cannot cause a rebase.");
      } else throw e;
    }
    ctx.current = undefined;
    this.context.isWriteable = true;

    return v;
  }

  flushNext(): ITransaction {
    let [thunk, ...rest] = this.unrealizedThunks;
    this.realizedThunks.push(thunk);
    this.unrealizedThunks = rest;

    let error;
    ctx.current = this.context;
    try {
      thunk();
    } catch (e) {
      error = e;
    }
    ctx.current = undefined;
    if (error === rebaseSignal) {
      if (this.isParentTransaction()) {
        this.rebase();
      }
      // not sure if we should throw or just continue...
      throw new Error("Transaction was restarted; rebasing");
    } else if (error) {
      this.isAborted = true;
      throw error;
    }

    return this;
  }

  flush(): ITransaction {
    while (!this.isAborted && this.unrealizedThunks.length) {
      this.flushNext();
    }

    return this;
  }

  rebase() {
    if (this.isCommitted) {
      throw new Error("Cannot rebase transaction which has been committed");
    }
    // general strategy atm is to move all thunks into unrealized state
    // reset context and then exec them at a later time
    this.unrealizedThunks = this.realizedThunks.map((fn) => fn);

    // this should never be reached by a nested tx
    if (this.context.parent !== this) {
      throw new Error("Invariant: Nested transaction should never be rebased");
    }
    this.context = new TransactionContext(this);
    this.isAborted = false;
    return this;
  }

  commit(): ITransaction {
    if (this.isCommitted) {
      throw new Error(
        "Cannot commit transaction which has already been committed"
      );
    }
    if (this.isAborted) {
      throw new Error(
        "Cannot commit transaction which has been aborted. Rebase it first"
      );
    }
    // realize any left over thunks
    this.flush();

    try {
      for (let refEntry of this.context.getRefEntries()) {
        let [ref, current] = refEntry;
        if (ref.version !== current.version) {
          // drift occurred, rebase
          throw rebaseSignal;
        }
        if (this.isParentTransaction()) {
          ref.unsafeWrite(current.value);
        }
      }
    } catch (e) {
      if (e === rebaseSignal) {
        if (this.isParentTransaction()) {
          this.rebase();
          if (this.autoRebase) {
            return this.commit();
          }
          throw new Error("Transaction rebased");
        } else {
          // bubble up rebase
          throw e;
        }
      }
    }
    this.isCommitted = true;
    return this;
  }

  onExecute(f: () => void) {
    return () => void 0;
  }

  onRebase(f: () => void) {
    return () => void 0;
  }

  onCommit(f: () => void) {
    return () => void 0;
  }
}

export function branch({ autoRebase } = { autoRebase: false }): ITransaction {
  return new Transaction(autoRebase, ctx.current);
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
