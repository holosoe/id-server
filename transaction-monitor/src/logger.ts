import logUpdate from "log-update";

export function logAndPersistLogUpdate(...args: any[]) {
  logUpdate.done();
  console.log(...args);
}
