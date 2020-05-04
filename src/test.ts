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

    let tx = transaction();
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
