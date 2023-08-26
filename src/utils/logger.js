import pino from "pino";

const pinoOptions = {
  base: undefined,
};

if (process.env.NODE_ENV === "development") {
  pinoOptions.transport = {
    target: "pino-pretty",
    options: {
      colorize: true,
    },
  };
}

const logger = pino(pinoOptions);

export default logger;
