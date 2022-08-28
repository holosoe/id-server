// const sqlite3 = require("sqlite3").verbose();
import fs from "fs";
import { initialize } from "zokrates-js";
import dotenv from "dotenv";
dotenv.config();

const createLeafPath = process.env.ZOK_PATH_TO_CREATE_LEAF;

const zokGlobals = {};
if (process.env.DISABLE_ZOKRATES != "true") {
  initialize().then((zokratesProvider) => {
    zokGlobals.zokratesProvider = zokratesProvider;
    zokGlobals.leafgen = zokratesProvider.compile(
      `${fs.readFileSync(createLeafPath)}`
    );
  });
}

export { zokGlobals };
