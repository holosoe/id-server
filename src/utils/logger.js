import pino from "pino";

const pinoOptions = {
  base: undefined,
};

if (process.env.NODE_ENV === "development") {
  // Pretty print to console
  pinoOptions.transport = { target: "pino-pretty", options: { colorize: true } };
} else {
  // Send logs to Datadog
  pinoOptions.transport = {
    target: "pino-datadog-transport",
    options: {
      ddClientConf: {
        authMethods: {
          apiKeyAuth: process.env.DATADOG_API_KEY,
        },
      },
      ddServerConf: {
        site: "us5.datadoghq.com",
      },
    },
  };
}

const logger = pino(pinoOptions);

export default logger;
