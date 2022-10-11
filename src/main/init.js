import { Sequelize, DataTypes } from "sequelize";
import config from "../../config.js";
import dotenv from "dotenv";
dotenv.config();

// TODO: Remove these logs
console.log("config.MYSQL_DB_NAME...");
console.log(config.MYSQL_DB_NAME);
console.log("process.env.MYSQL_USERNAME...");
console.log(process.env.MYSQL_USERNAME);
console.log("process.env.MYSQL_PASSWORD...");
console.log(process.env.MYSQL_PASSWORD);
console.log("process.env.MYSQL_HOST...");
console.log(process.env.MYSQL_HOST);
// Setup sequelize
async function initializeSequelize() {
  const sequelize = new Sequelize(
    config.MYSQL_DB_NAME,
    process.env.MYSQL_USERNAME,
    process.env.MYSQL_PASSWORD,
    {
      host: process.env.MYSQL_HOST,
      dialect: "mysql",
    }
  );
  try {
    for (let i = 0; i < 10; i++) {
      console.log("sequelize...");
      console.log(sequelize);
      await sequelize.authenticate();
      break;
    }
    console.log(`Connected to MySQL server at ${process.env.MYSQL_HOST}.`);
  } catch (err) {
    console.error("Unable to connect to MySQL server:", err);
  }
  // Model name == "User". Table name == "Users"
  const User = sequelize.define(
    "User",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      uuid: {
        type: DataTypes.BLOB,
        allowNull: false,
      },
      // For Vouched
      jobID: {
        type: DataTypes.STRING,
      },
    },
    {
      createdAt: false,
      updatedAt: false,
    }
  );
  sequelize.sync({ force: true });
  return sequelize;
}
let sequelize;
initializeSequelize().then((result) => {
  sequelize = result;
});

export { sequelize };
