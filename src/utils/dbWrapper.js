// const sqlite3 = require("sqlite3").verbose();
// import sqlite3 from "sqlite3";
import { db } from "../init.js";

/**
 * Select from users table where column=value.
 * @returns Row in user table if user exists, null otherwise. Returns first item that matches query.
 */
export function selectUser(column, value) {
  return new Promise((resolve, reject) => {
    const statement = `SELECT * FROM Users WHERE ${column}=?`;
    db.get(statement, value, (err, row) => {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

export async function getUserByAddress(address) {
  return await selectUser("address", address);
}

export async function getUserByUuid(uuid) {
  return await selectUser("uuid", uuid);
}

export async function getUserByTempSecret(tempSecret) {
  return await selectUser("tempSecret", tempSecret);
}

/**
 * Run the given SQL command with the given parameters.
 * Helpful for UPDATEs and INSERTs.
 */
export function runSql(sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) {
        console.log(err);
        reject(err);
      }
      resolve();
    });
  });
}
