import { ref, deref, set, alter, transact } from "./stm";

let foo = ref(0);

let bar = ref(2);

transact(() => {
  set(foo, 2);
  alter(bar, (bar) => deref(foo) * bar);
});

console.log(deref(foo) === 2, deref(bar) === 4);

try {
  transact(() => {
    // @ts-ignore
    asdf++; // throws
    set(foo, -1);
  });
} catch (e) {
  console.log("caught error:", e.message);
}

console.log(deref(foo) === 2);

let nested = ref(0);

transact(() => {
  alter(nested, (n) => n + 1);
  transact(() => {
    alter(nested, (n) => n - 2);
  });
});

console.log("nested", "sync+sync", deref(nested) === -1);
