import pino from 'pino';

export const logAccumulator = [];

const baseLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`
});

export const logger = {
  info(event, details = {}) {
    const logObj = { level: 'info', event, ...details, timestamp: new Date().toISOString() };
    logAccumulator.push(logObj);
    baseLogger.info(details, event);
  },
  warn(event, details = {}) {
    const logObj = { level: 'warn', event, ...details, timestamp: new Date().toISOString() };
    logAccumulator.push(logObj);
    baseLogger.warn(details, event);
  },
  error(event, details = {}) {
    const logObj = { level: 'error', event, ...details, timestamp: new Date().toISOString() };
    logAccumulator.push(logObj);
    baseLogger.error(details, event);
  },
  debug(event, details = {}) {
    const logObj = { level: 'debug', event, ...details, timestamp: new Date().toISOString() };
    logAccumulator.push(logObj);
    baseLogger.debug(details, event);
  },
  child(bindings) {
    return {
      info: (event, details = {}) => logger.info(event, { ...bindings, ...details }),
      warn: (event, details = {}) => logger.warn(event, { ...bindings, ...details }),
      error: (event, details = {}) => logger.error(event, { ...bindings, ...details }),
      debug: (event, details = {}) => logger.debug(event, { ...bindings, ...details }),
    };
  }
};
