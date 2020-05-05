import { ref, deref, set, alter, transaction } from "./stm2";

test("create two refs, change them, commit them", () => {
  let foo = ref(0);
  let bar = ref(2);
  let tx = transaction();

  tx.add(() => {
    set(foo, 2);
    alter(bar, (bar) => deref(foo) * bar);
  });

  expect(deref(foo)).toBe(0);
  expect(deref(bar)).toBe(2);

  tx.commit();

  expect(deref(foo)).toBe(2);
  expect(deref(bar)).toBe(4);
});

test("can't write in doIn", () => {
  let foo = ref(0);
  let tx = transaction();

  expect(() =>
    tx.doIn(() => {
      set(foo, 1);
    })
  ).toThrow;
});

describe("abort and retry", () => {
  let foo = ref(0);
  let tx = transaction();

  test("throwing inside add does nothing (not executed yet)", () => {
    tx.add(() => {
      if (deref(foo) === 0) {
        throw new Error("Invalid foo!");
      }
      set(foo, -1);
    });

    expect(deref(foo)).toBe(0);
  });

  test("throwing inside commit doesn't mutate ref", () => {
    let error;
    try {
      tx.commit();
    } catch (e) {
      error = e;
    }
    expect(error.message).toBe("Invalid foo!");

    expect(deref(foo)).toBe(0);
  });

  test("can't commit an aborted transaction", () => {
    let error;
    try {
      tx.commit();
    } catch (e) {
      error = e;
    }
    expect(error.message).toBe(
      "Cannot commit transaction which has been aborted. Retry it first"
    );
  });

  test("retrying", () => {
    transaction()
      .add(() => set(foo, 1))
      .commit();
    expect(deref(foo)).toBe(1);

    tx.retry().commit();

    expect(deref(foo)).toBe(-1);
  });
});

describe("iterable", () => {
  test("for of", () => {
    let foo = ref(0);
    let calls = 0;
    let tx = transaction()
      .add(() => {
        calls++;
        set(foo, 10);
      })
      .add(() => {
        calls++;
        alter(foo, (x) => x - 13);
      });

    for (let exec of tx) {
      exec();
    }

    tx.commit();

    expect(deref(foo)).toBe(-3);
    expect(calls).toBe(2);
  });

  test("destructuring", () => {
    let foo = ref(0);

    let tx = transaction()
      .add(() => {
        set(foo, 2);
      })
      .add(() => {
        alter(foo, (foo) => foo * 2);
      });

    let [t1, t2, t3] = tx;
    expect(t3).toBe(undefined);

    t1();
    expect(tx.doIn(() => deref(foo))).toBe(2);
    expect(deref(foo)).toBe(0);

    t2();

    expect(tx.doIn(() => deref(foo))).toBe(4);
    expect(deref(foo)).toBe(0);

    tx.commit();
    expect(deref(foo)).toBe(4);
  });
});

describe("concurrent txs", () => {
  test("disjoint refs", () => {
    let foo = ref(0);
    let bar = ref(0);

    let txFoo = transaction().add(() => {
      set(foo, 1);
    });

    let txBar = transaction().add(() => {
      set(bar, 2);
    });

    expect(deref(foo)).toBe(0);
    expect(deref(bar)).toBe(0);

    let [t1] = txFoo;
    let [t2] = txBar;
    t1();

    expect(deref(foo)).toBe(0);
    expect(deref(bar)).toBe(0);

    t2();

    expect(deref(foo)).toBe(0);
    expect(deref(bar)).toBe(0);

    txFoo.commit();

    expect(deref(foo)).toBe(1);
    expect(deref(bar)).toBe(0);

    txBar.commit();

    expect(deref(foo)).toBe(1);
    expect(deref(bar)).toBe(2);
  });

  test("related refs", () => {
    let foo = ref(0);
    let bar = ref(0);

    let txFooBar = transaction().add(() => {
      set(foo, 1);
      set(bar, 2);
    });

    let txBar = transaction().add(() => {
      alter(bar, (x) => x + 1);
    });

    expect(deref(foo)).toBe(0);
    expect(deref(bar)).toBe(0);

    let [t1] = txFooBar;
    let [t2] = txBar;
    t1();

    expect(deref(foo)).toBe(0);
    expect(deref(bar)).toBe(0);

    t2();

    expect(deref(foo)).toBe(0);
    expect(txFooBar.doIn(() => deref(foo))).toBe(1);
    expect(txFooBar.doIn(() => deref(bar))).toBe(2);
    expect(deref(bar)).toBe(0);
    expect(txBar.doIn(() => deref(bar))).toBe(1);

    txFooBar.commit();

    expect(deref(foo)).toBe(1);
    expect(deref(bar)).toBe(2);

    txBar.commit();

    expect(deref(foo)).toBe(1);
    expect(deref(bar)).toBe(3);
  });
});

// // // let nested = ref(0);

// // // transact(() => {
// // //   alter(nested, (n) => n + 1);
// // //   transact(() => {
// // //     alter(nested, (n) => n - 2);
// // //   });
// // // });

// // // console.log("nested", "sync+sync", deref(nested) === -1);
