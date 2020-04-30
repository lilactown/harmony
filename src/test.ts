import { ref, deref, set, alter, transactSync, io, transactAsync } from "./stm";

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
    await io(sleep(100));
    alter(baz, (baz) => baz - 5);
  }).then(() => console.log("a", deref(baz))),

  transactAsync(async () => {
    alter(baz, (baz) => baz - 2);
  }).then(() => console.log("b", deref(baz))),

  transactAsync(async () => {
    alter(baz, (baz) => baz - 3);
  }).then(() => console.log("c", deref(baz))),
]).then(() => console.log(deref(baz) === 1));

transactSync(() => {
  set(baz, 1);
});
