import { ref, deref, set, alter, io, retry, transactAsync } from "./stm";

function wait() {
  return new Promise((res) => {
    setTimeout(res, 0);
  });
}

function think() {
  return io(wait());
}

function eat() {
  return io(wait());
}

let forksRef = ref([false, false, false, false, false, false]);

function takeFork(n: number) {
  if (deref(forksRef)[n]) {
    console.log("Retrying", n);
    retry();
  }

  alter(forksRef, (forks) => {
    let newForks = forks.slice();
    newForks[n] = true;
    return newForks;
  });
}

function placeFork(n: number) {
  alter(forksRef, (forks) => {
    let newForks = forks.slice();
    newForks[n] = false;
    return newForks;
  });
}

async function philosopher(id: number) {
  console.log(id, "Starting");
  // take left fork first
  console.log(id, "Taking left");
  takeFork(id);

  await think();

  //take right fork
  console.log(id, "Taking right");
  takeFork(id + 1);

  console.log(id, "Eating");
  await eat();

  console.log(id, "Placing left");
  placeFork(id);
  console.log(id, "Placing right");
  placeFork(id + 1);
}

transactAsync(() => philosopher(0)).then(() => console.log(0, "Complete"));
transactAsync(() => philosopher(1)).then(() => console.log(1, "Complete"));
transactAsync(() => philosopher(2)).then(() => console.log(2, "Complete"));
transactAsync(() => philosopher(3)).then(() => console.log(3, "Complete"));
transactAsync(() => philosopher(4)).then(() => console.log(4, "Complete"));
