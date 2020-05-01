import { ITransaction, IRef } from "./interfaces";
import {
  createTx,
  getCurrentTx,
  setCurrentTx,
  clearCurrentTx,
  txCommit,
  retrySignal,
} from "./transaction";

async function txRunAsync(
  tx: ITransaction,
  f: () => Promise<void>
): Promise<void> {
  // schedule later
  await Promise.resolve();
  // console.log(tx.id, "starting");
  setCurrentTx(tx);
  let error;
  try {
    let p = f();
    // clear synchronously
    clearCurrentTx();
    // console.log(tx.id, "clearing");
    await p;
    // console.log(tx.id, "committing");
    txCommit(tx);
  } catch (e) {
    error = e;
  } finally {
    clearCurrentTx();
  }

  if (error === retrySignal) {
    // try again
    // console.log(tx.id, "retrying");
    return txRunAsync(createTx(true), f);
  } else if (error) {
    throw error;
  }
}

export function retry(): void {
  let tx;
  if ((tx = getCurrentTx()) && tx.isAsync) {
    throw retrySignal;
  }
  throw new Error("Cannot use retry outside of async transaction");
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

export function commute<T>(
  ref: IRef<T>,
  f: (v: T, ...args: any[]) => T,
  ...args: any[]
) {}

export function ensure<T>(ref: IRef<T>) {}
