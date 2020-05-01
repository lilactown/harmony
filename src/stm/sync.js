"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const transaction_1 = require("./transaction");
let currentId = 0;
function gensym() {
    return currentId++;
}
class Ref {
    constructor(v) {
        this.id = gensym();
        this.history = [{ txID: -1, value: v }, ...new Array(4)];
    }
    get current() {
        return this.history[0].value;
    }
    setCurrent(tx, v) {
        // console.log("set", tx.id, v);
        let butLast = this.history.slice(0, this.history.length - 1);
        this.history = [{ txID: tx.id, value: v }, ...butLast];
    }
}
function transact(f) {
    if (transaction_1.getCurrentTx() === undefined) {
        return transaction_1.txRun(transaction_1.createTx(), f);
    }
    return f();
}
exports.transact = transact;
function ref(init) {
    return new Ref(init);
}
exports.ref = ref;
function set(ref, v) {
    let tx;
    if ((tx = transaction_1.getCurrentTx())) {
        return transaction_1.txWrite(tx, ref, v);
    }
    throw new Error("Cannot set ref value outside of a transaction");
}
exports.set = set;
function deref(ref) {
    let tx;
    if ((tx = transaction_1.getCurrentTx())) {
        return transaction_1.txRead(tx, ref);
    }
    return ref.current;
}
exports.deref = deref;
function alter(ref, f, ...args) {
    let old = deref(ref);
    return set(ref, f(old, ...args));
}
exports.alter = alter;
function commute(ref, f, ...args) { }
exports.commute = commute;
function ensure(ref) { }
exports.ensure = ensure;
function io(x) {
    if (transaction_1.getCurrentTx()) {
        throw new Error("io called inside of transaction");
    }
    return x;
}
function pause(p) {
    return __awaiter(this, void 0, void 0, function* () {
        let tx;
        if ((tx = transaction_1.getCurrentTx()) && tx.isAsync) {
            // console.log("pause", tx);
            return p.then((result) => {
                transaction_1.setCurrentTx(tx);
                // console.log("pause back");
                return result;
            });
        }
        throw new Error("Cannot use pause outside of async transaction");
    });
}
exports.pause = pause;
function retry() {
    let tx;
    if ((tx = transaction_1.getCurrentTx()) && tx.isAsync) {
        throw transaction_1.retrySignal;
    }
    throw new Error("Cannot use retry outside of async transaction");
}
exports.retry = retry;
function defer(f) { }
exports.defer = defer;
function compensate(f) { }
exports.compensate = compensate;
