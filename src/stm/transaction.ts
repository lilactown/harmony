import { IRef, ITransaction } from "./interfaces";

let currentId = 0;

function gensym() {
  return currentId++;
}

let currentTx: { current: ITransaction | undefined } = { current: undefined };

export let retrySignal = {};

export function createTx(isAsync = false): ITransaction {
  return {
    id: gensym(),
    refSets: new Map<IRef<any>, any>(),
    alteredRefs: new Set<IRef<any>>(),
    isAsync,
  };
}

export function getCurrentTx() {
  return currentTx.current;
}

export function setCurrentTx(tx: ITransaction) {
  currentTx.current = tx;
  return tx;
}

export function clearCurrentTx() {
  currentTx.current = undefined;
  return currentTx;
}

export function txRead<T>(tx: ITransaction, ref: IRef<T>): T {
  if (tx.refSets.has(ref)) {
    let alteration = tx.refSets.get(ref);

    // ref has changed since last read or alteration, abort early
    if (alteration?.prevTxID !== ref.history[0].txID) {
      throw retrySignal;
    }
    return alteration?.value;
  }
  tx.refSets.set(ref, { value: ref.current, prevTxID: ref.history[0].txID });
  return ref.current;
}

export function txWrite<T>(tx: ITransaction, ref: IRef<T>, v: T): T {
  // ref has changed since last read or alteration, abort early
  if (
    tx.refSets.has(ref) &&
    tx.refSets.get(ref)?.prevTxID !== ref.history[0].txID
  ) {
    throw retrySignal;
  }
  tx.refSets.set(ref, { value: v, prevTxID: ref.history[0].txID });
  tx.alteredRefs.add(ref);
  return v;
}

export function txCommit(tx: ITransaction) {
  if (tx.alteredRefs.size !== 0) {
    // console.log("txCommit", tx.id);

    for (let ref of tx.alteredRefs) {
      // a transaction has occured between when the ref was altered and committing
      if (ref.history[0].txID !== tx.refSets.get(ref)?.prevTxID) {
        throw retrySignal;
      }
      ref.setCurrent(tx, tx.refSets.get(ref)?.value);
    }
  }
}

export function txRun(tx: ITransaction, f: () => void): void {
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
