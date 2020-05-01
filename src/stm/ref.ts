import { IRef, ITransaction } from "./interfaces";

let id = 0;

function gensym() {
  return id++;
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

export function ref<T>(init: T) {
  return new Ref(init);
}
