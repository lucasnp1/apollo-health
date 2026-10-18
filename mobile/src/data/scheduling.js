// Replaces fake-indexeddb's scheduler (metro.config.js points it here). IndexedDB steps a transaction one request per
// task, and a transaction ends once a task and its promise callbacks are done, so it needs a real next task:
// - setImmediate runs before pending promise callbacks here: transactions ended while Dexie still used them
//   (PrematureCommitError);
// - setTimeout waits for the next screen frame on iOS, so every request cost a frame (a 1000-book launch took 18 s).
// React Native's own task scheduler runs a task, then its promise callbacks, then the next task, with no frame wait.
// Our queue keeps the order: tasks of the same priority aren't promised to run in the order they were added.
const rs = globalThis.nativeRuntimeScheduler
const queue = []
const next = () => void queue.shift()()

exports.queueTask = rs
  ? (fn) => {
      queue.push(fn)
      rs.unstable_scheduleCallback(rs.unstable_NormalPriority, next)
    }
  : (fn) => setTimeout(fn, 0)
