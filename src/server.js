const { createApp } = require("./app");
const { config } = require("./config");

const { app } = createApp({
  databasePath: config.dbPath,
  seedDemoData: config.seedDemoData,
});

app.listen(config.port, config.host, () => {
  console.log(
    `coparentes backend listening on http://${config.host}:${config.port} (${config.nodeEnv})`,
  );
  console.log(`database path: ${config.dbPath}`);
  console.log(`seed demo data: ${config.seedDemoData ? "enabled" : "disabled"}`);
});
