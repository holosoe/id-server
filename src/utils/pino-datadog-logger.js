import pinoDataDog from "pino-datadog-transport";

// https://github.com/pinojs/pino-pretty#handling-non-serializable-options
// Functions as options on the pino transport config are not serializable as they
// are workers, so we create this worker file which includes our callbacks

const pinoDataDogTransport = (opts) => {
  return pinoDataDog({
    ...opts,
    onError: (data, logItems) => {
      console.log("Encountered an error while trying to log to DataDog:", data);
      console.log("logItems", logItems);
    },
  });
};

export default pinoDataDogTransport;
