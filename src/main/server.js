import { app } from "./index.js";
import { sqlDb, redisClient } from "./init.js";

const PORT = 3000;
const server = app.listen(PORT, (err) => {
  if (err) throw err;
  console.log(`Server running in http://127.0.0.1:${PORT}`);
});

process.on("SIGTERM", async () => {
  sqlDb.close();
  console.log(`\nClosed sqlite database`);
  await redisClient.quit();
  console.log(`Disconnected from redis database`);
  server.close(() => {
    console.log(`Closed server`);
    process.exit(0);
  });
});
process.on("SIGINT", async () => {
  sqlDb.close();
  console.log(`\nClosed sqlite database`);
  await redisClient.quit();
  console.log(`Disconnected from redis database`);
  server.close(() => {
    console.log(`Closed server`);
    process.exit(0);
  });
});
