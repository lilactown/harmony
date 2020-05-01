"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
let currentId = 0;
function gensym() {
    return currentId++;
}
let currentTx = { current: undefined };
exports.retrySignal = {};
function createTx(isAsync = false) {
    return {
        id: gensym(),
        refSets: new Map(),
        alteredRefs: new Set(),
        isAsync,
    };
}
exports.createTx = createTx;
function getCurrentTx() {
    return currentTx.current;
}
exports.getCurrentTx = getCurrentTx;
function setCurrentTx(tx) {
    currentTx.current = tx;
    return tx;
}
exports.setCurrentTx = setCurrentTx;
function clearCurrentTx() {
    currentTx.current = undefined;
    return currentTx;
}
exports.clearCurrentTx = clearCurrentTx;
function txRead(tx, ref) {
    if (tx.refSets.has(ref)) {
        let alteration = tx.refSets.get(ref);
        // ref has changed since last read or alteration, abort early
        if ((alteration === null || alteration === void 0 ? void 0 : alteration.prevTxID) !== ref.history[0].txID) {
            throw exports.retrySignal;
        }
        return alteration === null || alteration === void 0 ? void 0 : alteration.value;
    }
    tx.refSets.set(ref, { value: ref.current, prevTxID: ref.history[0].txID });
    return ref.current;
}
exports.txRead = txRead;
function txWrite(tx, ref, v) {
    var _a;
    // ref has changed since last read or alteration, abort early
    if (tx.refSets.has(ref) &&
        ((_a = tx.refSets.get(ref)) === null || _a === void 0 ? void 0 : _a.prevTxID) !== ref.history[0].txID) {
        throw exports.retrySignal;
    }
    tx.refSets.set(ref, { value: v, prevTxID: ref.history[0].txID });
    tx.alteredRefs.add(ref);
    return v;
}
exports.txWrite = txWrite;
function txCommit(tx) {
    var _a, _b;
    if (tx.alteredRefs.size !== 0) {
        // console.log("txCommit", tx.id);
        for (let ref of tx.alteredRefs) {
            // a transaction has occured between when the ref was altered and committing
            if (ref.history[0].txID !== ((_a = tx.refSets.get(ref)) === null || _a === void 0 ? void 0 : _a.prevTxID)) {
                throw exports.retrySignal;
            }
            ref.setCurrent(tx, (_b = tx.refSets.get(ref)) === null || _b === void 0 ? void 0 : _b.value);
        }
    }
}
exports.txCommit = txCommit;
function txRun(tx, f) {
    setCurrentTx(tx);
    let error;
    try {
        f(); // side-effecting
        txCommit(tx);
    }
    catch (e) {
        error = e;
    }
    finally {
        clearCurrentTx();
    }
    if (error) {
        // re-throw error
        throw error;
    }
}
exports.txRun = txRun;
