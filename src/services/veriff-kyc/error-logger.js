/**
 * A file for errors logged by the endpoints in this directory
 */

export function upgradeV3Logger(logger) {
  logger.verificationPreviouslyFailed = (veriffSessionId, session) => {
    logger.error(
      {
        sessionId: veriffSessionId,
        session_status: session.status,
        failure_reason: session.verificationFailureReason,
        tags: ["action:validateSession", "error:verificationFailed"],
      },
      "Session verification previously failed"
    );
  }

  logger.veriffSessionTemporarilyUnavailable = (veriffSessionId) => {
    logger.error(
      {
        sessionId: veriffSessionId,
        tags: [
          "action:getVeriffSessionDecision",
          "error:temporaryFailure",
          "stage:getVeriffSessionDecision",
        ],
      },
      "Temporary error retrieving Veriff session."
    );
  }

  logger.veriffSessionNotFound = (veriffSessionId) => {
    logger.error(
      {
        sessionId: veriffSessionId,
        tags: [
          "action:getVeriffSessionDecision",
          "error:sessionNotFound",
          "stage:getVeriffSessionDecision",
        ],
      },
      "Failed to retrieve Verrif session."
    );
  }

  logger.veriffSessionValidationFailed = (
    veriffSessionId,
    veriffSession,
    validationResult
  ) => {
    logger.error(
      {
        sessionId: veriffSessionId,
        reason: validationResult.error,
        details: {
          status: veriffSession.status,
          verification: {
            code: veriffSession.verification?.code,
            status: veriffSession.verification?.status,
          },
        },
        tags: ["action:validateSession", "error:validationFailed"],
      },
      "Verification failed"
    );
  }

  logger.alreadyRegistered = (uuidNew) => {
    logger.error(
      {
        uuidV2: uuidNew,
        tags: [
          "action:RegisterUser",
          "error:UserAlreadyRegistered",
          "stage:RegisterUser",
        ],
      },
      "User has already registered."
    );
  }

  logger.unexpected = (err) => {
    logger.error(
      {
        error: err,
        tags: [
          "action:getCredentialsV3",
          "error:unexpectedError",
          "stage:unknown",
        ],
      },
      "Unexpected error occurred"
    );
  }

  return logger
}
