import { ref, deref, set, alter, branch } from "../src";

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
    let error: Error | undefined;
    try {
      tx.commit();
    } catch (e) {
      error = e;
    }
    expect(error && error.message).toBe("Invalid foo!");

    expect(deref(foo)).toBe(0);
  });

  test("can't commit an aborted branch", () => {
    let error: Error | undefined;
    try {
      tx.commit();
    } catch (e) {
      error = e;
    }
    expect(error && error.message).toBe(
      "Cannot commit branch which has been aborted. Rebase it first"
    );
  });

  test("rebasing", () => {
    branch()
      .add(() => set(foo, 1))
      .commit();
    expect(deref(foo)).toBe(1);

    expect(tx.commit).toThrow;

    tx.rebase().commit();

    expect(deref(foo)).toBe(-1);
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

    txFoo.flushNext();

    expect(deref(foo)).toBe(0);
    expect(deref(bar)).toBe(0);

    txBar.flushNext();

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

    txFooBar.flushNext();

    expect(deref(foo)).toBe(0);
    expect(deref(bar)).toBe(0);

    txBar.flushNext();

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

        txInner.flush();

        txInner.commit();
      });

    txOuter.flush();

    expect(deref(foo)).toBe(0);
    expect(txOuter.doIn(() => deref(foo))).toBe(2);

    txOuter.commit();

    expect(deref(foo)).toBe(2);
  });
});
