import { fileURLToPath } from "url";
import { dirname } from "path";
import dotenv from "dotenv";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const environment = process.env.ENVIRONMENT;

const config = {
  THIS_URL: environment == "dev" ? "http://localhost:3000" : "https://zk.sciverse.id",
  FRONT_END_ORIGIN:
    environment == "dev" ? "http://localhost:3002" : "https://holonym.io",
  MYSQL_DB_NAME: "db",
  ZOK_DIR: `${__dirname}/src/zok`,
  ZOK_PATH_TO_CREATE_LEAF: `${__dirname}/src/zok/createLeaf.zok`,
};

export default config;
