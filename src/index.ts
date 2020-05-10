type txID = string;

type refVersion = number;

interface IRef<T> {
  unsafeRead(): T;
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
  unsafeRead() {
    return this.current;
  }
  unsafeWrite(v: T) {
    this.current = v;
    this.version++;
    return v;
  }
}

interface IBranchContext {
  id: txID;
  isWriteable: boolean;
  parent: IBranch;
  read<T>(ref: IRef<T>): T;
  write<T>(ref: IRef<T>, v: T): T;
  getRefEntries(): any;
}

let _idSrc = 0;

function nextTxId() {
  return "tx" + _idSrc++;
}

type RefMap<T> = Map<IRef<T>, { value: T; version: refVersion }>;

class BranchContext implements IBranchContext {
  id: txID;
  currentRefValues: RefMap<any>;
  isWriteable: boolean;
  parent: IBranch;
  constructor(parent: IBranch) {
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
      return this.write(ref, ref.unsafeRead());
    }
    return ref.unsafeRead();
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

export interface IBranch {
  // extends Iterable<Function>
  add(thunk: () => any): IBranch;
  doIn<T>(f: () => T): T;
  //  next(): () => any;
  rebase(): IBranch;
  flush(): IBranch;
  flushNext(): IBranch;
  commit(): IBranch;
  isCommitted: boolean;
  isAborted: boolean;
}

let ctx: { current: undefined | IBranchContext } = {
  current: undefined,
};

let rebaseSignal = {};

class Branch implements IBranch {
  private context: IBranchContext;
  private unrealizedThunks: Function[];
  private realizedThunks: Function[];
  isCommitted: boolean;
  isAborted: boolean;
  autoRebase: boolean;
  constructor(autoRebase: boolean, context?: IBranchContext) {
    this.context = context || new BranchContext(this);
    this.unrealizedThunks = [];
    this.realizedThunks = [];
    this.isCommitted = false;
    this.isAborted = false;
    this.autoRebase = autoRebase;
  }

  isParentBranch() {
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

  flushNext(): IBranch {
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
      if (this.isParentBranch()) {
        this.rebase();
      }
      // not sure if we should throw or just continue...
      throw new Error("Tranasction was restarted; rebasing");
    } else if (error) {
      this.isAborted = true;
      throw error;
    }

    return this;
  }

  flush(): IBranch {
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
    this.context = new BranchContext(this);
    this.isAborted = false;
    return this;
  }

  commit(): IBranch {
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
        if (this.isParentBranch()) {
          ref.unsafeWrite(current.value);
        }
      }
    } catch (e) {
      if (e === rebaseSignal) {
        if (this.isParentBranch()) {
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
}

export function branch({ autoRebase } = { autoRebase: false }): IBranch {
  return new Branch(autoRebase, ctx.current);
}

export function ref<T>(v: T): IRef<T> {
  return new Ref(v);
}

export function deref<T>(ref: IRef<T>): T {
  if (ctx.current) {
    return ctx.current.read(ref);
  }
  return ref.unsafeRead();
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

export function ensure<T>(ref: IRef<T>): T {
  return set(ref, deref(ref));
}
