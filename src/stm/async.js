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
function txRunAsync(tx, f) {
    return __awaiter(this, void 0, void 0, function* () {
        // schedule later
        yield Promise.resolve();
        // console.log(tx.id, "starting");
        setCurrentTx(tx);
        let error;
        try {
            let p = f();
            // clear synchronously
            clearCurrentTx();
            // console.log(tx.id, "clearing");
            yield p;
            // console.log(tx.id, "committing");
            txCommit(tx);
        }
        catch (e) {
            error = e;
        }
        finally {
            clearCurrentTx();
        }
        if (error === retrySignal) {
            // try again
            // console.log(tx.id, "retrying");
            return txRunAsync(createTx(true), f);
        }
        else if (error) {
            throw error;
        }
    });
}
