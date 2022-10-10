import { app } from "./index.js";
import { sequelize } from "./init.js";

const PORT = 3000;
const server = app.listen(PORT, (err) => {
  if (err) throw err;
  console.log(`Server running in http://127.0.0.1:${PORT}`);
});

process.on("SIGTERM", async () => {
  await sequelize.close();
  console.log(`\nClosed SQL database`);
  console.log(`Closing server`);
  server.close(() => {
    console.log(`Closed server`);
    process.exit(0);
  });
});
process.on("SIGINT", async () => {
  await sequelize.close();
  console.log(`\nClosed SQL database`);
  console.log(`Closing server`);
  server.close(() => {
    console.log(`Closed server`);
    process.exit(0);
  });
});
