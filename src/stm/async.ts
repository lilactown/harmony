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
