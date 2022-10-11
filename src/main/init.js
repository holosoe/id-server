import { Sequelize, DataTypes } from "sequelize";
import config from "../../config.js";
import { mockSequelize } from "./utils/utils";
import dotenv from "dotenv";
dotenv.config();

// Setup sequelize
async function initializeSequelize() {
  // TODO: Connect to an actual MySQL server within testing environment (e.g., GitHub Actions)
  if (process.env.TESTING == "true") return mockSequelize;

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
    await sequelize.authenticate();
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
