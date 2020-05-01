import { IRef, ITransaction } from "./interfaces";
import {
  createTx,
  getCurrentTx,
  setCurrentTx,
  txRead,
  txWrite,
  txRun,
  retrySignal,
} from "./transaction";

let currentId = 0;

function gensym() {
  return currentId++;
}

class Ref<T> implements IRef<T> {
  id: number;
  history: { txID: number; value: T }[];
  constructor(v: T) {
    this.id = gensym();
    this.history = [{ txID: -1, value: v }, ...new Array(4)];
  }

  get current(): T {
    return this.history[0].value;
  }

  setCurrent(tx: ITransaction, v: T) {
    // console.log("set", tx.id, v);
    let butLast = this.history.slice(0, this.history.length - 1);
    this.history = [{ txID: tx.id, value: v }, ...butLast];
  }
}

export function transact(f: () => void) {
  if (getCurrentTx() === undefined) {
    return txRun(createTx(), f);
  }
  return f();
}

export function ref<T>(init: T) {
  return new Ref(init);
}

export function set<T>(ref: IRef<T>, v: T) {
  let tx;
  if ((tx = getCurrentTx())) {
    return txWrite(tx, ref, v);
  }
  throw new Error("Cannot set ref value outside of a transaction");
}

export function deref<T>(ref: IRef<T>): T {
  let tx;
  if ((tx = getCurrentTx())) {
    return txRead(tx, ref);
  }
  return ref.current;
}

export function alter<T>(
  ref: IRef<T>,
  f: (v: T, ...args: any[]) => T,
  ...args: any[]
): T {
  let old = deref(ref);
  return set(ref, f(old, ...args));
}

export function commute<T>(
  ref: IRef<T>,
  f: (v: T, ...args: any[]) => T,
  ...args: any[]
) {}

export function ensure<T>(ref: IRef<T>) {}

function io<T>(x: T): T {
  if (getCurrentTx()) {
    throw new Error("io called inside of transaction");
  }
  return x;
}

export async function pause<T>(p: Promise<T>): Promise<T> {
  let tx: ITransaction | undefined;
  if ((tx = getCurrentTx()) && tx.isAsync) {
    // console.log("pause", tx);
    return p.then((result) => {
      setCurrentTx(tx as ITransaction);
      // console.log("pause back");
      return result;
    });
  }
  throw new Error("Cannot use pause outside of async transaction");
}

export function retry(): void {
  let tx;
  if ((tx = getCurrentTx()) && tx.isAsync) {
    throw retrySignal;
  }
  throw new Error("Cannot use retry outside of async transaction");
}

export function defer(f: Function): void {}

export function compensate(f: (...args: any[]) => Function): void {}
