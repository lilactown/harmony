import { IRef, ITransaction } from "./interfaces";
import {
  createTx,
  getCurrentTx,
  setCurrentTx,
  clearCurrentTx,
  txWrite,
  txCommit,
} from "./transaction";
import { deref } from "./ref";

function txRun(tx: ITransaction, f: () => void): ITransaction {
  setCurrentTx(tx);
  let error;
  let report;
  try {
    f(); // side-effecting
    txCommit(tx);
  } catch (e) {
    error = e;
  } finally {
    report = getCurrentTx() as ITransaction;
    clearCurrentTx();
  }

  if (error) {
    // re-throw error
    throw error;
  }
  return report;
}

export function transact(f: () => void) {
  if (getCurrentTx() === undefined) {
    return txRun(createTx(), f);
  }
  return f();
}

export function set<T>(ref: IRef<T>, v: T) {
  let tx;
  if ((tx = getCurrentTx())) {
    return txWrite(tx, ref, v);
  }
  throw new Error("Cannot set ref value outside of a transaction");
}

export function alter<T>(
  ref: IRef<T>,
  f: (v: T, ...args: any[]) => T,
  ...args: any[]
): T {
  let old = deref(ref);
  return set(ref, f(old, ...args));
}

export function io<T>(x: T): T {
  if (getCurrentTx()) {
    throw new Error("io called inside of transaction");
  }
  return x;
}

export function defer(f: Function): void {}

export function compensate(f: (...args: any[]) => Function): void {}
