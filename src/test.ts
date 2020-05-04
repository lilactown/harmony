import { ref, deref, set, alter, transaction } from "./stm2";

test("create two refs, change them, commit them", () => {
  let foo = ref(0);

  let bar = ref(2);

  let tx0 = transaction();

  tx0.add(() => {
    set(foo, 2);
    alter(bar, (bar) => deref(foo) * bar);
  });

  expect(deref(foo)).toBe(0);
  expect(deref(bar)).toBe(2);

  tx0.commit();

  expect(deref(foo)).toBe(2);
  expect(deref(bar)).toBe(4);
});

test("abort and retry", () => {
  let foo = ref(0);
  let tx1 = transaction();

  tx1.add(() => {
    if (deref(foo) === 0) {
      throw new Error("Invalid foo!");
    }
    set(foo, -1);
  });

  expect(deref(foo)).toBe(0);

  let error;
  try {
    tx1.commit();
  } catch (e) {
    error = e;
  }
  expect(error.message).toBe("Invalid foo!");

  expect(deref(foo)).toBe(0);

  try {
    tx1.commit();
  } catch (e) {
    error = e;
  }
  expect(error.message).toBe(
    "Cannot commit transaction which has been aborted. Retry it first"
  );

  transaction()
    .add(() => set(foo, 1))
    .commit();
  expect(deref(foo)).toBe(1);

  tx1.retry().commit();

  expect(deref(foo)).toBe(-1);
});

test("manual exec", () => {
  let foo = ref(0);
  let calls = 0;
  let tx2 = transaction()
    .add(() => {
      calls++;
      set(foo, 10);
    })
    .add(() => {
      calls++;
      alter(foo, (x) => x - 13);
    });

  for (let exec of tx2) {
    exec();
  }

  tx2.commit();

  expect(deref(foo)).toBe(-3);
  expect(calls).toBe(2);
});

// // // let nested = ref(0);

// // // transact(() => {
// // //   alter(nested, (n) => n + 1);
// // //   transact(() => {
// // //     alter(nested, (n) => n - 2);
// // //   });
// // // });

// // // console.log("nested", "sync+sync", deref(nested) === -1);
