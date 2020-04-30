let currentId = 0;

function gensym() {
  return currentId++;
}

interface IRef<T> {
  current: T;
  set: (v: T) => T;
  deref: () => T;
  setCurrent: (tx: ITransaction, v: T) => void;
  history: { txID: number; value: T }[];
}

interface IAlteration<T> {
  value: T;
  prevTxID: number;
}

interface ITransaction {
  id: number;
  refAlters: Map<IRef<any>, IAlteration<any>>;
  alteredRefs: Set<IRef<any>>;
  isAsync: boolean;
}

let currentTx: { current: ITransaction | undefined } = { current: undefined };

let abortSignal = {};

function createTx(isAsync = false): ITransaction {
  return {
    id: gensym(),
    refAlters: new Map<IRef<any>, any>(),
    alteredRefs: new Set<IRef<any>>(),
    isAsync,
  };
}

function getCurrentTx() {
  return currentTx.current;
}

function setCurrentTx(tx: ITransaction) {
  currentTx.current = tx;
  return tx;
}

function clearCurrentTx() {
  currentTx.current = undefined;
  return currentTx;
}

function txRead<T>(tx: ITransaction, ref: IRef<T>): T {
  if (tx.refAlters.has(ref)) {
    let alteration = tx.refAlters.get(ref);

    // ref has changed since last read or alteration, abort early
    if (alteration?.prevTxID !== ref.history[0].txID) {
      throw abortSignal;
    }
    return alteration?.value;
  }
  tx.refAlters.set(ref, { value: ref.current, prevTxID: ref.history[0].txID });
  return ref.current;
}

function txWrite<T>(tx: ITransaction, ref: IRef<T>, v: T): T {
  // ref has changed since last read or alteration, abort early
  if (
    tx.refAlters.has(ref) &&
    tx.refAlters.get(ref)?.prevTxID !== ref.history[0].txID
  ) {
    throw abortSignal;
  }
  tx.refAlters.set(ref, { value: v, prevTxID: ref.history[0].txID });
  tx.alteredRefs.add(ref);
  return v;
}

function txCommit(tx: ITransaction) {
  if (tx.alteredRefs.size !== 0) {
    // console.log("txCommit", tx.id);

    for (let ref of tx.alteredRefs) {
      // a transaction has occured between when the ref was altered and committing
      if (ref.history[0].txID !== tx.refAlters.get(ref)?.prevTxID) {
        throw abortSignal;
      }
      ref.setCurrent(tx, tx.refAlters.get(ref)?.value);
    }
  }
}

function txRun(tx: ITransaction, f: () => void): void {
  setCurrentTx(tx);
  let error;
  try {
    f(); // side-effecting
    txCommit(tx);
  } catch (e) {
    error = e;
  } finally {
    clearCurrentTx();
  }

  if (error) {
    // re-throw error
    throw error;
  }
}

async function txRunAsync(
  tx: ITransaction,
  f: () => Promise<void>
): Promise<void> {
  await Promise.resolve();
  // console.log("starting", tx.id);
  setCurrentTx(tx);
  let error;
  try {
    let p = f();
    // clear synchronously
    clearCurrentTx();
    // console.log("clearing");
    await p;
    // console.log("committing");
    txCommit(tx);
  } catch (e) {
    error = e;
  } finally {
    clearCurrentTx();
  }

  if (error === abortSignal) {
    // try again
    // console.log("retrying", tx.id);
    return txRunAsync(createTx(true), f);
  } else if (error) {
    throw error;
  }
}

class Ref<T> implements IRef<T> {
  id: number;
  history: { txID: number; value: T }[];
  constructor(v: T) {
    this.id = gensym();
    this.history = [{ txID: -1, value: v }];
  }

  get current(): T {
    return this.history[0].value;
  }

  setCurrent(tx: ITransaction, v: T) {
    // console.log("set", tx.id, v);
    this.history = [{ txID: tx.id, value: v }, ...this.history];
  }

  deref(): T {
    let tx;
    if ((tx = getCurrentTx())) {
      return txRead(tx, this);
    }
    return this.current;
  }

  set(v: T): T {
    let tx;
    if ((tx = getCurrentTx())) {
      return txWrite(tx, this, v);
    }
    throw new Error("Cannot set ref value outside of a transaction");
  }
}

export function transactSync(f: () => void) {
  if (getCurrentTx() === undefined) {
    return txRun(createTx(), f);
  }
  return f();
}

export function transactAsync(f: () => Promise<void>) {
  if (getCurrentTx() === undefined) {
    return txRunAsync(createTx(true), f);
  }
  return f();
}

export function ref<T>(init: T) {
  return new Ref(init);
}

export function set<T>(ref: IRef<T>, v: T) {
  return ref.set(v);
}

export function deref<T>(ref: IRef<T>): T {
  return ref.deref();
}

export function alter<T>(
  ref: IRef<T>,
  f: (v: T, ...args: any[]) => T,
  ...args: any[]
): T {
  let old = ref.deref();
  return ref.set(f(old, ...args));
}

export function io<T>(p: Promise<T>): Promise<T> {
  let tx: ITransaction | undefined;
  if ((tx = getCurrentTx()) && tx.isAsync) {
    // console.log("io", tx);
    return p.then((result) => {
      setCurrentTx(tx as ITransaction);
      // console.log("io back");
      return result;
    });
  }
  throw new Error("Cannot use io outside of async transaction");
}

export function retry() {
  let tx;
  if ((tx = getCurrentTx()) && tx.isAsync) {
    throw abortSignal;
  }
  throw new Error("Cannot use retry outside of async transaction");
}
