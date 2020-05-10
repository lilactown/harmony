# pine: multiversion concurrency control for JS

pine is an experiment. It is my attempt at taking the idea of [Software
Transactional Memory](https://en.wikipedia.org/wiki/Software_transactional_memory)
and porting similar concepts to a single threaded context like JavaScript.

The goal is to provide a way to build up a collection of operations (a
"transaction"), schedule each of them to be run, and then atomically commit all
operations in a single tick.

By splitting up transactions into multiple "thunks" of operations, it allows us
to do CPU intensive work in transactions while periodically yielding the main
thread to allow other work to occur. The exact strategy of how to split up work
and schedule it to be run is left as an exercise to the reader. 😁

In order to do this, we borrow the idea of keeping track of the "in-transaction"
value of a "ref" that we want to change separate from the shared, global value.
This way, a transaction can build up its result over time, and then when it has
run to completion, commit the final result as the new global value of a ref.

Transactions and refs have the following properties:

- Anything can "read" a ref value at any time.
- Refs can only be changed (or "written") in a transaction.
- Transactions and operations can read and write to multiple refs
- Many transactions can be started concurrently. Each transaction tracks the
current value of each ref used inside the transaction.
- Committing the transaction will atomically update all its refs at once.
- If a transaction reads/writes to a ref, and the ref changes before the transaction
is committed, the transaction will roll back and can then re-execute all of its
operations with the latest value. This is called "rebasing."
- Transactions can be nested; only a single transaction context exists at once,
though.
- Throwing an error inside of a transaction will cause it to abort. It can be
rebased and then committed again to retry.
- Transactions should not do any I/O. Transactions are lazy and might fail,
retry, or abort. Reading or changing anything other than refs is highly
discouraged.

There are downsides to this approach. If your system is highly contentious
(i.e. many transactions operating on the same refs concurrently) then you
will end up needing to rebase and re-do often, which will increase the overall
work that your application does. The worst-case performance of this is far
greater then executing everything serially.

This worst-case has be weighed against the ability to pause and resume that
work later while maintaining coherence. If your system doesn't need those
properties, then pine is not what you're looking for.

## Should I use this for my app?

Probably not! pine is very low level and full of foot-guns. It is meant as an
experiment using these concepts and a base to build higher level abstractions.
In order to be useful, it probably needs two other tools to work with it:

- A strategy for splitting up work into discrete thunks that should be
atomically applied.
- A scheduler that can prioritize, run transactions and rebase/retry.

You could do this by hand, but it's liable to be quite tedious!

## How does it look?

Here's an example. Further examples can be seen in the [tests](./tests/test.ts).


```javascript
// create a new `ref` that can be atomically written to
let counter = ref(0);

// read the value using `deref`
deref(counter); // => 0

// writing outside of a transaction isn't allowed
set(counter, 1); // => Error! Cannot set ref outside of branch

// to create transactions, we use the `branch` function
let branchA = branch();
let branchB = branch();

// let's add some operations
branchA.add(() => {
  // set the value locally
  set(counter, 1);
  // apply a function to its value locally
  alter(counter, count => count + 1);
}).add(() => {
  /* there's no real reason to split this into another thunk, other than
     to demonstrate that we can run more operations inside of another thunk
     and it will always see the latest transaction-local value. */
  
  // read the local value
  console.log(deref(counter));
});

// Add some things to our other transaction
branchB.add(() => {
  alter(counter, count => count - 5);
}).add(() => [
  console.log(deref(counter));
]);

/* so far, none of these operations have actually been executed. We get
   fine-grained control over when each thunk gets executed to allow the main
   thread to be prioritized. */

// execute one thunk
branchA.flushNext();

// look at the current state of counter inside the transaction w/o effecting it
branchA.doIn(() => deref(counter)) ;; => 2

// nothing has changed globally, though
deref(counter); // => 0

/* at this point we could pause here and yield the main thread to some other
   work, or we could execute an async operation like I/O. As long as we keep
   the reference to the branches we've created, we can always resume them later
   and pick up where we left off. Neat! */

// let's execute all of `branchB` now
branchB.flush(); // => console.log: "-5"

/* what we've done is introduce "contention" into our system. We now have two
   transactions that have started with the view that the value of counter is 0;
   as soon as we commit one of them, that will be invalidate the other one, and
   the transaction will rebase its operations. */

// we could also use `.flush` here; we just want to finish what we're doing
branchA.flushNext(); // => console.log: "2"

// commit the transaction
branchA.commit();

// global value has been updated
deref(counter); // => 2

// try and commit other transaction
branchB.commit(); // => Error: Drift has occurred. Transaction rebased


/* our branchB has now been set back into it's un-executed state. We need to
   flush it again in order for it to re-do its work. */

branchB.flush(); // console.log: "-3"

branchB.commit();

deref(counter); // => -3


/* our system has settled and all operations have been applied atomically!
   Hooray! */
```

## Developing it

The project is currently written using TypeScript. I am working on figuring out
exactly how to package it for consumption; I would like to be able to easily use
it in my ClojureScript projects, hence the use of [tsickle](https://github.com/angular/tsickle/) for compiler to Closure JS.

### Building

`make` or `make build`

### Testing

`make test`

### Deploying

???


## License

Copyright © 2020 Will Acton

Distributed under the EPL 2.0
