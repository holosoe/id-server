import { strict as assert } from "node:assert";
import ethersPkg from "ethers";
const { ethers } = ethersPkg;
import { poseidon } from "circomlibjs-old";
import {
  Session,
  UserVerifications,
  VerificationCollisionMetadata,
} from "../../init.js";
import { issue } from "holonym-wasm-issuer";
import { issue as issuev2 } from "holonym-wasm-issuer-v2";
import { getDateAsInt, sha256 } from "../../utils/utils.js";
import { pinoOptions, logger } from "../../utils/logger.js";
import { newDummyUserCreds, countryCodeToPrime } from "../../utils/constants.js";
import { sessionStatusEnum } from "../../constants/misc.js";
import { getVeriffSessionDecision, deleteVeriffSession } from "../../utils/veriff.js";

const endpointLogger = logger.child({
  msgPrefix: "[GET /veriff/credentials] ",
  base: {
    ...pinoOptions.base,
    idvProvider: "veriff",
  },
});

function validateSession(session, metaSession) {
  if (session.status !== "success") {
    return {
      error: `Verification failed. Status is '${session.status}'. Expected 'success'.`,
      log: {
        msg: "Verification failed. status !== 'success'",
        data: {
          status: session.status,
        },
      },
    };
  }
  if (session.verification?.code !== 9001) {
    return {
      error: `Verification failed. Verification code is ${session.verification?.code}. Expected 9001.`,
      log: {
        msg: "Verification failed. Verification code !== 9001",
        data: {
          code: session.verification?.code,
        },
      },
    };
  }
  if (session.verification.status !== "approved") {
    return {
      error: `Verification failed. Verification status is ${session.verification.status}. Expected 'approved'.`,
      log: {
        msg: "Verification failed. Verification status !== 'approved'",
        data: {
          status: session.verification.status,
        },
      },
    };
  }
  const necessaryPersonFields = ["firstName", "lastName", "dateOfBirth"];
  const person = session.verification.person;
  for (const field of necessaryPersonFields) {
    if (!(field in person)) {
      return {
        error: `Verification missing necessary field: ${field}.`,
        log: {
          msg: `Verification missing necessary field: ${field}.`,
        },
      };
    }
  }
  // NOTE: Veriff does not include addresses in test sessions
  // BIG NOTE: We are removing address temporarily since Veriff only supports
  // it for their enterprise clients.
  // const address = person.addresses?.[0]?.parsedAddress;
  // if (!address) {
  //   return {
  //     error: "Verification missing necessary field: address.",
  //     log: `Verification missing necessary field: address. Exiting.`,
  //   };
  // }
  // if (!("postcode" in address)) {
  //   return {
  //     error: "Verification missing necessary field: postcode.",
  //     log: `Verification missing necessary field: postcode. Exiting.`,
  //   };
  // }
  const doc = session.verification.document;
  if (!doc) {
    return {
      error: "Verification missing necessary field: document.",
      log: {
        msg: "Verification missing necessary field: document.",
      },
    };
  }
  if (!("country" in doc)) {
    return {
      error: "Verification missing necessary field: country.",
      log: {
        msg: "Verification missing necessary field: country.",
      },
    };
  }
  const countryCode = countryCodeToPrime[session?.verification?.document?.country];
  if (!countryCode) {
    return {
      error: `Unsupported country: ${session?.verification?.document?.country}.`,
      log: {
        msg: `Unsupported country`,
        data: {
          country: session?.verification?.document?.country,
        },
      },
    };
  }
  // if !metaSession.ipCountry, then the session was created before we added
  // the ipCountry attribute. Because this is only ~3k sessions and to reduce tickets,
  // we can ignore this check for such sessions.
  // NOTE: May 14, 2024: We are disablign the ipCountry check because it seems to be
  // turning down honest users while being game-able by sybils.
  // if (metaSession.ipCountry && (countryCode != countryCodeToPrime[metaSession.ipCountry])) {
  //   return {
  //     error: `Country code mismatch. Session country is '${metaSession.ipCountry}', but document country is '${session?.verification?.document?.country}'.`,
  //     log: {
  //       msg: "Country code mismatch",
  //       data: { expected: countryCodeToPrime[metaSession.ipCountry], got: countryCode },
  //     },
  //   };
  // }
  return { success: true };
}

function extractCreds(session) {
  const person = session.verification.person;
  const address = person.addresses?.[0]?.parsedAddress;
  const countryCode = countryCodeToPrime[session.verification.document.country];
  assert.ok(countryCode, "Unsupported country");
  const birthdate = person.dateOfBirth ? person.dateOfBirth : "";
  const birthdateNum = birthdate ? getDateAsInt(birthdate) : 0;
  const firstNameStr = person.firstName ? person.firstName : "";
  const firstNameBuffer = firstNameStr ? Buffer.from(firstNameStr) : Buffer.alloc(1);
  // Veriff doesn't support middle names, but we keep it for backwards compatibility
  // const middleNameStr = person.middleName ? person.middleName : "";
  // const middleNameBuffer = middleNameStr
  //   ? Buffer.from(middleNameStr)
  //   : Buffer.alloc(1);
  const middleNameStr = "";
  const middleNameBuffer = Buffer.alloc(1);
  const lastNameStr = person.lastName ? person.lastName : "";
  const lastNameBuffer = lastNameStr ? Buffer.from(lastNameStr) : Buffer.alloc(1);
  const nameArgs = [firstNameBuffer, middleNameBuffer, lastNameBuffer].map((x) =>
    ethers.BigNumber.from(x).toString()
  );
  const nameHash = ethers.BigNumber.from(poseidon(nameArgs)).toString();
  // BIG NOTE: We assume all address fields are empty since Veriff only supports
  // parsedAddress field for their enterprise clients. If you are reading this
  // and we have become an enterprise client with the parsedAddress option, this
  // note is obsolete.
  const cityStr = address?.city ? address.city : "";
  const cityBuffer = cityStr ? Buffer.from(cityStr) : Buffer.alloc(1);
  const subdivisionStr = address?.state ? address.state : "";
  const subdivisionBuffer = subdivisionStr
    ? Buffer.from(subdivisionStr)
    : Buffer.alloc(1);
  const streetNumber = Number(address?.houseNumber ? address.houseNumber : 0);
  const streetNameStr = address?.street ? address.street : "";
  const streetNameBuffer = streetNameStr
    ? Buffer.from(streetNameStr)
    : Buffer.alloc(1);
  const streetUnit = address?.unit?.includes("apt ")
    ? Number(address?.unit?.replace("apt ", ""))
    : address?.unit != null && typeof Number(address?.unit) == "number"
    ? Number(address?.unit)
    : 0;
  const addrArgs = [streetNumber, streetNameBuffer, streetUnit].map((x) =>
    ethers.BigNumber.from(x).toString()
  );
  const streetHash = ethers.BigNumber.from(poseidon(addrArgs)).toString();
  const zipCode = Number(address?.postcode ? address.postcode : 0);
  const addressArgs = [cityBuffer, subdivisionBuffer, zipCode, streetHash].map((x) =>
    ethers.BigNumber.from(x)
  );
  const addressHash = ethers.BigNumber.from(poseidon(addressArgs)).toString();
  // BIG NOTE: We are not including expiration date in issued credentials, but
  // we might in the future.
  // const expireDateSr = session.verification.document?.validUntil ?? "";
  const expireDateSr = "";
  const expireDateNum = expireDateSr ? getDateAsInt(expireDateSr) : 0;
  const nameDobAddrExpireArgs = [
    nameHash,
    birthdateNum,
    addressHash,
    expireDateNum,
  ].map((x) => ethers.BigNumber.from(x).toString());
  const nameDobAddrExpire = ethers.BigNumber.from(
    poseidon(nameDobAddrExpireArgs)
  ).toString();
  return {
    rawCreds: {
      countryCode: countryCode,
      firstName: firstNameStr,
      middleName: middleNameStr,
      lastName: lastNameStr,
      city: cityStr,
      subdivision: subdivisionStr,
      zipCode: address?.postcode ? address.postcode : 0,
      streetNumber: streetNumber,
      streetName: streetNameStr,
      streetUnit: streetUnit,
      completedAt: session.verification.decisionTime
        ? session.verification.decisionTime.split("T")[0]
        : "",
      birthdate: birthdate,
      expirationDate: expireDateSr,
    },
    derivedCreds: {
      nameDobCitySubdivisionZipStreetExpireHash: {
        value: nameDobAddrExpire,
        derivationFunction: "poseidon",
        inputFields: [
          "derivedCreds.nameHash.value",
          "rawCreds.birthdate",
          "derivedCreds.addressHash.value",
          "rawCreds.expirationDate",
        ],
      },
      streetHash: {
        value: streetHash,
        derivationFunction: "poseidon",
        inputFields: [
          "rawCreds.streetNumber",
          "rawCreds.streetName",
          "rawCreds.streetUnit",
        ],
      },
      addressHash: {
        value: addressHash,
        derivationFunction: "poseidon",
        inputFields: [
          "rawCreds.city",
          "rawCreds.subdivision",
          "rawCreds.zipCode",
          "derivedCreds.streetHash.value",
        ],
      },
      nameHash: {
        value: nameHash,
        derivationFunction: "poseidon",
        inputFields: [
          "rawCreds.firstName",
          "rawCreds.middleName",
          "rawCreds.lastName",
        ],
      },
    },
    fieldsInLeaf: [
      "issuer",
      "secret",
      "rawCreds.countryCode",
      "derivedCreds.nameDobCitySubdivisionZipStreetExpireHash.value",
      "rawCreds.completedAt",
      "scope",
    ],
  };
}

async function saveCollisionMetadata(uuid, sessionId, session) {
  try {
    const collisionMetadataDoc = new VerificationCollisionMetadata({
      uuid: uuid,
      timestamp: new Date(),
      sessionId: sessionId,
      uuidConstituents: {
        firstName: {
          populated: !!session.verification.person.firstName,
        },
        lastName: {
          populated: !!session.verification.person.lastName,
        },
        postcode: {
          populated: !!session.verification.person.addresses?.[0]?.postcode,
        },
        dateOfBirth: {
          populated: !!session.verification.person.dateOfBirth,
        },
      },
    });

    await collisionMetadataDoc.save();
  } catch (err) {
    console.log("Error recording collision metadata", err);
  }
}

async function saveUserToDb(uuid, sessionId) {
  const userVerificationsDoc = new UserVerifications({
    govId: {
      uuid: uuid,
      sessionId: sessionId,
      issuedAt: new Date(),
    },
  });
  try {
    await userVerificationsDoc.save();
  } catch (err) {
    endpointLogger.error(
      { error: err },
      "An error occurred while saving userVerificationsDoc to database"
    );
    return {
      error:
        "An error occurred while trying to save object to database. Please try again.",
    };
  }
  return { success: true };
}

async function getSession(sessionId) {
  const metaSession = await Session.findOne({ sessionId }).exec();

  if (!metaSession) {
    throw new Error("Session not found");
  }

  return metaSession;
}

async function updateSessionStatus(sessionId, status, failureReason) {
  try {
    // TODO: Once pay-first frontend is pushed, remove the try-catch. We want
    // this endpoint to fail if we can't update the session.
    const metaSession = await Session.findOne({ sessionId }).exec();
    metaSession.status = status;
    if (failureReason) metaSession.verificationFailureReason = failureReason;
    await metaSession.save();
  } catch (err) {
    console.log("onfido/credentials: Error updating session status", err);
  }
}

/**
 * ENDPOINT
 *
 * Allows user to retrieve their signed verification info
 */
async function getCredentials(req, res) {
  try {
    if (process.env.ENVIRONMENT == "dev") {
      const creds = newDummyUserCreds;

      const response = issue(
        process.env.HOLONYM_ISSUER_PRIVKEY,
        creds.rawCreds.countryCode.toString(),
        creds.derivedCreds.nameDobCitySubdivisionZipStreetExpireHash.value
      );
      response.metadata = newDummyUserCreds;

      return res.status(200).json(response);
    }

    if (!req?.query?.sessionId) {
      return res.status(400).json({ error: "No sessionId specified" });
    }

    const metaSession = await getSession(req.query.sessionId);
    if (metaSession.status !== sessionStatusEnum.IN_PROGRESS) {
      if (metaSession.status === sessionStatusEnum.VERIFICATION_FAILED) {
        return res.status(400).json({
          error: `Verification failed. Reason(s): ${metaSession.verificationFailureReason}`,
        });
      }
      return res.status(400).json({
        error: `Session status is '${metaSession.status}'. Expected '${sessionStatusEnum.IN_PROGRESS}'`,
      });
    }

    const session = await getVeriffSessionDecision(req.query.sessionId);

    if (!session) {
      endpointLogger.error(
        { sessionId: req.query.sessionId },
        "Failed to retrieve Verrif session."
      );
      return res.status(400).json({ error: "Failed to retrieve Verrif session." });
    }

    const validationResult = validateSession(session, metaSession);
    if (validationResult.error) {
      endpointLogger.error(validationResult.log.data, validationResult.log.msg);
      await updateSessionStatus(
        req.query.sessionId,
        sessionStatusEnum.VERIFICATION_FAILED,
        validationResult.error
      );
      return res.status(400).json({ error: validationResult.error });
    }

    // Get UUID
    const uuidConstituents =
      (session.verification.person.firstName || "") +
      (session.verification.person.lastName || "") +
      (session.verification.person.addresses?.[0]?.postcode || "") +
      (session.verification.person.dateOfBirth || "");
    const uuid = sha256(Buffer.from(uuidConstituents)).toString("hex");

    // Assert user hasn't registered yet
    const user = await UserVerifications.findOne({ "govId.uuid": uuid }).exec();
    if (user) {
      await saveCollisionMetadata(uuid, req.query.sessionId, session);

      endpointLogger.error({ uuid }, "User has already registered.");
      await updateSessionStatus(
        req.query.sessionId,
        sessionStatusEnum.VERIFICATION_FAILED,
        `User has already registered. User ID: ${user._id}`
      );
      return res
        .status(400)
        .json({ error: `User has already registered. User ID: ${user._id}` });
    }

    // Store UUID for Sybil resistance
    const dbResponse = await saveUserToDb(uuid, req.query.sessionId);
    if (dbResponse.error) return res.status(400).json(dbResponse);

    const creds = extractCreds(session);

    const response = issue(
      process.env.HOLONYM_ISSUER_PRIVKEY,
      creds.rawCreds.countryCode.toString(),
      creds.derivedCreds.nameDobCitySubdivisionZipStreetExpireHash.value
    );
    response.metadata = creds;

    await deleteVeriffSession(req.query.sessionId);

    // TODO: MAYBE: Update IDVSessions. Set the status to "credentials-issued" and add the UUID.
    // This will help us ensure that we never display a "completed - click here to retrieve your
    // credentials" message to the user if their verification is complete but their creds haven't
    // been signed by Holonym (and returned) yet. It's not necessary to set status to
    // "credentials-issued" since the frontend can check for the presence of gov ID creds; however,
    // if there's a bug between the end of this function and credential storage logic in the
    // frontend, then the user might see "completed - click, etc." even after their creds have
    // been issued.

    endpointLogger.info(
      { uuid, sessionId: req.query.sessionId },
      "Issuing credentials"
    );

    await updateSessionStatus(req.query.sessionId, sessionStatusEnum.ISSUED);

    return res.status(200).json(response);
  } catch (err) {
    console.error(err);
    return res.status(500).send();
  }
}

/**
 * ENDPOINT
 *
 * Allows user to retrieve their signed verification info.
 *
 * This endpoint is for the V3 Holonym architecture. (The version numbers for
 * the endpoints do not necessarily correspond to the version numbers for the
 * protocol as a whole.)
 */
async function getCredentialsV2(req, res) {
  try {
    const issuanceNullifier = req.params.nullifier;

    if (process.env.ENVIRONMENT == "dev") {
      const creds = newDummyUserCreds;

      const response = JSON.parse(
        issuev2(
          process.env.HOLONYM_ISSUER_PRIVKEY,
          issuanceNullifier,
          creds.rawCreds.countryCode.toString(),
          creds.derivedCreds.nameDobCitySubdivisionZipStreetExpireHash.value
        )
      );
      response.metadata = newDummyUserCreds;

      return res.status(200).json(response);
    }

    if (!req?.query?.sessionId) {
      return res.status(400).json({ error: "No sessionId specified" });
    }

    const metaSession = await getSession(req.query.sessionId);
    if (metaSession.status !== sessionStatusEnum.IN_PROGRESS) {
      if (metaSession.status === sessionStatusEnum.VERIFICATION_FAILED) {
        return res.status(400).json({
          error: `Verification failed. Reason(s): ${metaSession.verificationFailureReason}`,
        });
      }
      return res.status(400).json({
        error: `Session status is '${metaSession.status}'. Expected '${sessionStatusEnum.IN_PROGRESS}'`,
      });
    }

    const session = await getVeriffSessionDecision(req.query.sessionId);

    if (!session) {
      endpointLogger.error(
        { sessionId: req.query.sessionId },
        "Failed to retrieve Verrif session."
      );
      return res.status(400).json({ error: "Failed to retrieve Verrif session." });
    }

    const validationResult = validateSession(session, metaSession);
    if (validationResult.error) {
      endpointLogger.error(validationResult.log.data, validationResult.log.msg);
      await updateSessionStatus(
        req.query.sessionId,
        sessionStatusEnum.VERIFICATION_FAILED,
        validationResult.error
      );
      return res.status(400).json({ error: validationResult.error });
    }

    // Get UUID
    const uuidConstituents =
      (session.verification.person.firstName || "") +
      (session.verification.person.lastName || "") +
      (session.verification.person.addresses?.[0]?.postcode || "") +
      (session.verification.person.dateOfBirth || "");
    const uuid = sha256(Buffer.from(uuidConstituents)).toString("hex");

    // Assert user hasn't registered yet
    const user = await UserVerifications.findOne({ "govId.uuid": uuid }).exec();
    if (user) {
      await saveCollisionMetadata(uuid, req.query.sessionId, session);

      endpointLogger.error({ uuid }, "User has already registered.");
      await updateSessionStatus(
        req.query.sessionId,
        sessionStatusEnum.VERIFICATION_FAILED,
        `User has already registered. User ID: ${user._id}`
      );
      return res
        .status(400)
        .json({ error: `User has already registered. User ID: ${user._id}` });
    }

    // Store UUID for Sybil resistance
    const dbResponse = await saveUserToDb(uuid, req.query.sessionId);
    if (dbResponse.error) return res.status(400).json(dbResponse);

    const creds = extractCreds(session);

    const response = JSON.parse(
      issuev2(
        process.env.HOLONYM_ISSUER_PRIVKEY,
        issuanceNullifier,
        creds.rawCreds.countryCode.toString(),
        creds.derivedCreds.nameDobCitySubdivisionZipStreetExpireHash.value
      )
    );
    response.metadata = creds;

    await deleteVeriffSession(req.query.sessionId);

    // TODO: MAYBE: Update IDVSessions. Set the status to "credentials-issued" and add the UUID.
    // This will help us ensure that we never display a "completed - click here to retrieve your
    // credentials" message to the user if their verification is complete but their creds haven't
    // been signed by Holonym (and returned) yet. It's not necessary to set status to
    // "credentials-issued" since the frontend can check for the presence of gov ID creds; however,
    // if there's a bug between the end of this function and credential storage logic in the
    // frontend, then the user might see "completed - click, etc." even after their creds have
    // been issued.

    endpointLogger.info(
      { uuid, sessionId: req.query.sessionId },
      "Issuing credentials"
    );

    await updateSessionStatus(req.query.sessionId, sessionStatusEnum.ISSUED);

    return res.status(200).json(response);
  } catch (err) {
    console.error(err);
    return res.status(500).send();
  }
}

export { getCredentials, getCredentialsV2 };
