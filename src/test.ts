import { ref, deref, set, alter, transaction } from "./stm2";

let foo = ref(0);

let bar = ref(2);

let tx0 = transaction();

tx0
  .add(() => {
    set(foo, 2);
    alter(bar, (bar) => deref(foo) * bar);
  })
  .commit();

console.log(
  "committed values work",
  deref(foo) === 2 || deref(foo),
  deref(bar) === 4 || deref(bar)
);

let tx1 = transaction();

try {
  tx1.add(() => {
    if (deref(foo) === 2) {
      throw new Error("Invalid foo!");
    }
    set(foo, -1);
  });
} catch (e) {
  console.log("caught error:", e.message);
}

console.log("nothing committed yet", deref(foo) === 2 || deref(foo));

try {
  tx1.commit();
} catch (e) {
  console.log("caught commit error:", e.message);
}

console.log("Aborted commit doesn't effect", deref(foo) === 2 || deref(foo));

transaction()
  .add(() => set(foo, 0))
  .commit();

tx1.retry().commit();

console.log("Retrying works", deref(foo) === -1 || deref(foo));

let tx2 = transaction()
  .add(() => {
    console.log(1);
    set(foo, 10);
  })
  .add(() => {
    console.log(2);
    alter(foo, (x) => x - 13);
  });

for (let exec of tx2) {
  exec();
}

tx2.commit();

console.log(deref(foo));

// // let nested = ref(0);

// // transact(() => {
// //   alter(nested, (n) => n + 1);
// //   transact(() => {
// //     alter(nested, (n) => n - 2);
// //   });
// // });

// // console.log("nested", "sync+sync", deref(nested) === -1);
