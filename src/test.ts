import {
  ref,
  deref,
  set,
  alter,
  transactSync,
  pause,
  transactAsync,
} from "./stm";

function sleep(ms: number) {
  return new Promise((res) => {
    setTimeout(res, ms);
  });
}

let foo = ref(0);

let bar = ref(2);

transactSync(() => {
  set(foo, 2);
  alter(bar, (bar) => deref(foo) * bar);
});

console.log(deref(foo) === 2, deref(bar) === 4);

try {
  transactSync(() => {
    // @ts-ignore
    asdf++; // throws
    set(foo, -1);
  });
} catch (e) {
  console.log("caught error:", e.message);
}

console.log(deref(foo) === 2);

let baz = ref(0);

Promise.all([
  transactAsync(async () => {
    alter(baz, (baz) => baz + 10);
    await pause(sleep(100));
    alter(baz, (baz) => baz - 5);
  }).then(() => console.log("a", deref(baz))),

  transactAsync(async () => {
    alter(baz, (baz) => baz - 2);
  }).then(() => console.log("b", deref(baz))),

  transactAsync(async () => {
    alter(baz, (baz) => baz - 3);
  }).then(() => console.log("c", deref(baz))),
]).then(() => console.log("baz", deref(baz) === 0));

let nested = ref(0);

transactSync(() => {
  alter(nested, (n) => n + 1);
  transactSync(() => {
    alter(nested, (n) => n - 2);
  });
});

console.log("nested", "sync+sync", deref(nested) === -1);

transactAsync(async () => {
  alter(nested, (n) => n + 1);
  transactSync(() => {
    alter(nested, (n) => n - 2);
  });
}).then(() => console.log("nested", "sync+sync", deref(nested) === -2));

transactAsync(async () => {
  alter(nested, (n) => n + 1);
  transactSync(() => {
    alter(nested, (n) => n - 2);
  });
  await pause(sleep(100));
  console.log("nested", "async+sync", "inner", deref(nested));
}).then(() => console.log("nested", "async+sync", deref(nested) === -3));

transactAsync(async () => {
  alter(nested, (n) => n + 1);
  await transactAsync(async () => {
    alter(nested, (n) => n - 2);
  });
  set(nested, 10);
})
  // .then(() => console.log("nested", "async+async", deref(nested) === 10))
  .catch(() => console.log("nested", "async+async", deref(nested) === -2));
