import dotenv from "dotenv";
dotenv.config();

const environment = process.env.ENVIRONMENT;

const config = {
  THIS_URL:
    environment == "dev" ? "http://localhost:3000" : "https://id-server.holonym.io",
  FRONT_END_ORIGIN:
    environment == "dev" ? "http://localhost:3002" : "https://holonym.id",
};

export default config;
