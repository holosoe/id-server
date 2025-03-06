import { mongoose } from "./init.js";
import { app } from "./index.js";
import logger from "./utils/logger.js";

const PORT = process.env.ENVIRONMENT == "dev" ? 3031 : 3000;
const server = app.listen(PORT, (err) => {
  if (err) throw err;
  logger.info(`Server running, exposed at http://127.0.0.1:${PORT}`);
});

async function terminate() {
  try {
    await mongoose.connection.close();
    logger.info("Closed MongoDB database connection");
  } catch (err) {
    logger.error(
      { error: err },
      "An error occurred while attempting to close the MongoDB connection"
    );
  }
  logger.info("Closing server");
  server.close(() => {
    logger.info("Closed server");
    process.exit(0);
  });
}

process.on("SIGTERM", terminate);
process.on("SIGINT", terminate);
