/**
 * A file for errors logged by the endpoints in this directory
 */

export function upgradeV3Logger(logger) {
  logger.failedToGetCheck = (check_id) => {
    logger.error(
      { check_id },
      "Failed to get onfido check."
    );
  }

  logger.failedToGetReports = (check_id, report_ids) => {
    logger.error(
      {
        check_id,
        report_ids: report_ids ?? "unknown",
        tags: ["action:getReports", "error:noReportsFound"],
      },
      "Failed to get onfido reports"
    );
  }

  logger.noReportsFound = (check_id, report_ids) => {
    logger.error(
      {
        check_id,
        report_ids: report_ids ?? "unknown",
        tags: ["action:getReports", "error:noReportsFound"],
      },
      "No reports found"
    );
  }

  logger.noDocumentReport = (reports) => {
    logger.error(
      { reports },
      "No documentReport"
    );
  }

  logger.alreadyRegistered = (uuidNew) => {
    logger.error(
      {
        uuidV2: uuidNew,
        tags: [
          "action:registeredUserCheck",
          "error:userAlreadyRegistered",
          "stage:registration",
        ],
      },
      "User has already registered"
    );
  }

  logger.verificationPreviouslyFailed = (check_id, session) => {
    logger.error(
      {
        check_id,
        session_status: session.status,
        failure_reason: session.verificationFailureReason,
        tags: ["action:validateSession", "error:verificationFailed"],
      },
      "Session verification previously failed"
    );
  }

  logger.checkValidationFailed = (validationResult) => {
    logger.error(
      validationResult.log.data,
      validationResult.log.msg,
      {
        tags: ["action:validateSession", "error:verificationFailed"],
      }
    ); 
  }

  logger.verificationFailed = (check_id, reportsValidation) => {
    logger.error(
      {
        check_id,
        detailed_reasons: reportsValidation.reasons,
        tags: ["action:validateVerification", "error:verificationFailed"],
      },
      "Verification failed"
    );
  }

  logger.unexpected = (err) => {
    logger.error(
      {
        error: err.message ?? err.toString(),
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
