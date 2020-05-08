import { ref, deref, set, alter, branch } from "./stm2";

test("create two refs, change them, commit them", () => {
  let foo = ref(0);
  let bar = ref(2);
  let tx = branch();

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
  let tx = branch();

  expect(() =>
    tx.doIn(() => {
      set(foo, 1);
    })
  ).toThrow;
});

describe("abort and rebase", () => {
  let foo = ref(0);
  let tx = branch();

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
      "Cannot commit transaction which has been aborted. Restart it first"
    );
  });

  test("rebaseing", () => {
    branch()
      .add(() => set(foo, 1))
      .commit();
    expect(deref(foo)).toBe(1);

    tx.restart().commit();

    expect(deref(foo)).toBe(-1);
  });
});

describe("iterable", () => {
  test("for of", () => {
    let foo = ref(0);
    let calls = 0;
    let tx = branch()
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

    let tx = branch()
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

    let txFoo = branch().add(() => {
      set(foo, 1);
    });

    let txBar = branch().add(() => {
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

    let txFooBar = branch({ autoRebase: true }).add(() => {
      set(foo, 1);
      set(bar, 2);
    });

    let txBar = branch({ autoRebase: true }).add(() => {
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

  test("nested", () => {
    let foo = ref(0);

    let txOuter = branch()
      .add(() => {
        branch()
          .add(() => {
            set(foo, 1);
          })
          .commit();
      })
      .add(() => {
        let txInner = branch().add(() => {
          alter(foo, (x) => x + 1);
        });

        let [thunk] = txInner;
        thunk();

        txInner.commit();
      });

    for (let thunk of txOuter) {
      thunk();
    }

    expect(deref(foo)).toBe(0);
    expect(txOuter.doIn(() => deref(foo))).toBe(2);

    txOuter.commit();

    expect(deref(foo)).toBe(2);
  });
});
