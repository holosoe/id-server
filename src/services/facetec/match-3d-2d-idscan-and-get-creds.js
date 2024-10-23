import { strict as assert } from "node:assert";
import axios from "axios";
import { ObjectId } from "mongodb";
import { ethers } from "ethers";
import { poseidon } from "circomlibjs-old";
import {
  Session,
  UserVerifications,
  VerificationCollisionMetadata,
} from "../../init.js";
import {
  getAccessToken as getPayPalAccessToken,
  capturePayPalOrder,
  refundMintFeePayPal
} from "../../utils/paypal.js";
import { createOnfidoSdkToken, createOnfidoCheck } from "../../utils/onfido.js";
import {
  validateTxForSessionCreation,
  refundMintFeeOnChain,
} from "../../utils/transactions.js";
import {
  supportedChainIds,
  sessionStatusEnum,
  payPalApiUrlBase,
  facetecServerBaseURL,
  idvSessionUSDPrice,
} from "../../constants/misc.js";
import { issue as issuev2 } from "holonym-wasm-issuer-v2";
import { getDateAsInt, sha256, govIdUUID, objectIdOneYearAgo } from "../../utils/utils.js";
import { pinoOptions, logger } from "../../utils/logger.js";
import { newDummyUserCreds, countryCodeToPrime, faceTecCountryNameToCode } from "../../utils/constants.js";

// const postSessionsLogger = logger.child({
//   msgPrefix: "[POST /match-3d-2d-idscan-and-get-creds] ",
//   base: {
//     ...pinoOptions.base,
//   },
// });

function validateFaceTecResponse(data) {
  // TODO: facetec: Should we check barcodeStatusEnumInt?
  if (data.didCompleteIDScanWithUnexpectedMedia) {
    return {
      error: `Verification failed. didCompleteIDScanWithUnexpectedMedia is ${data.didCompleteIDScanWithUnexpectedMedia}. Expected false.`,
      log: {
        msg: "Verification failed. didCompleteIDScanWithUnexpectedMedia == true",
      },
    };
  }
  if (data.didCompleteIDScanWithoutMatching) {
    // TODO: facetec: Probably allow a retry in this case? Does the FaceTec SDK in the frontend handle this?
    return {
      error: `Verification failed. didCompleteIDScanWithoutMatching is ${data.didCompleteIDScanWithoutMatching}. Expected false.`,
      log: {
        msg: "Verification failed. didCompleteIDScanWithoutMatching == true",
      },
    };
  }
  if (data.didCompleteIDScanWithoutMatchingOCRTemplate) {
    return {
      error: `Verification failed. didCompleteIDScanWithoutMatchingOCRTemplate is ${data.didCompleteIDScanWithoutMatchingOCRTemplate}. Expected false.`,
      log: {
        msg: "Verification failed. didCompleteIDScanWithoutMatchingOCRTemplate == true",
      },
    };
  }
  if (data.digitalIDSpoofStatusEnumInt != 0) {
    return {
      error: `Verification failed. digitalIDSpoofStatusEnumInt is ${data.digitalIDSpoofStatusEnumInt}. Expected 0.`,
      log: {
        msg: "Verification failed. digitalIDSpoofStatusEnumInt != 0",
      },
    };
  }
  if (data.error) {
    return {
      error: `Verification failed. FaceTec returned an error. ${data.error}`,
      log: {
        msg: "Verification failed. FaceTec returned an error.",
        data: {
          error: data.error,
        },
      },
    };
  }
  if (data.fullIDStatusEnumInt != 0) {
    // TODO: facetec: Probably allow a retry in this case? Does the FaceTec SDK in the frontend handle this?
    return {
      error: `Verification failed. fullIDStatusEnumInt is ${data.fullIDStatusEnumInt}. Expected 0.`,
      log: {
        msg: "Verification failed. fullIDStatusEnumInt != 0",
      },
    };
  }
  if (data.matchLevel < 6) {
    // TODO: facetec: Probably allow a retry in this case? Does the FaceTec SDK in the frontend handle this?
    return {
      error: `Verification failed. matchLevel is ${data.matchLevel}. Expected 6 or greater.`,
      log: {
        msg: "Verification failed. matchLevel < 6",
      },
    };
  }
  // TODO: facetec: maybe: Check mrzStatusEnumInt
  // TODO: facetec: maybe: Check scannedIDPhotoFaceFoundWithMinimumQuality
  if (data.textOnDocumentStatusEnumInt != 1) {
    // TODO: facetec: Probably allow a retry in this case? Does the FaceTec SDK in the frontend handle this?
    return {
      error: `Verification failed. textOnDocumentStatusEnumInt is ${data.textOnDocumentStatusEnumInt}. Expected 0.`,
      log: {
        msg: "Verification failed. textOnDocumentStatusEnumInt != 1",
      },
    };
  }
  if (data.unexpectedMediaEncounteredAtLeastOnce) {
    // TODO: facetec: Probably allow a retry in this case? Does the FaceTec SDK in the frontend handle this?
    return {
      error: `Verification failed. unexpectedMediaEncounteredAtLeastOnce is ${data.unexpectedMediaEncounteredAtLeastOnce}. Expected false.`,
      log: {
        msg: "Verification failed. unexpectedMediaEncounteredAtLeastOnce == true",
      },
    };
  }
  const documentData = JSON.parse(data?.documentData ?? '{}');
  const scannedValues = documentData.scannedValues;
  if (!scannedValues) {
    return {
      error: `Verification failed. documentData.scannedValues is missing.`,
      log: {
        msg: "Verification failed. documentData.scannedValues is missing.",
      },
    };
  }
  const templateInfo = documentData.templateInfo;
  if (!templateInfo) {
    return {
      error: `Verification failed. documentData.templateInfo is missing.`,
      log: {
        msg: "Verification failed. documentData.templateInfo is missing.",
      },
    };
  }
  return { success: true };
}

function flattenScannedValues(scannedValues) {
  const flattened = {};

  for (const group of scannedValues.groups) {
    for (const field of group.fields) {
      flattened[field.fieldKey] = field.value;
    }
  }

  return flattened;
}

function extractCreds(data) {
  // To see all fields that FaceTec can parse, see this page in FaceTec docs: 
  // https://dev.facetec.com/technical-support-facetec-api-components-querying-ocr-barcode-nfc-data-from-documentdata
  const documentData = JSON.parse(data.documentData);
  const flattedScannedValues = flattenScannedValues(
    documentData.scannedValues
  )
  // const address = person.addresses?.[0]?.parsedAddress; // todo
  const countryCode = countryCodeToPrime[
    faceTecCountryNameToCode[
      documentData.templateInfo.documentCountry
    ]
  ]
  assert.ok(countryCode, "Unsupported country");
  const birthdate = flattedScannedValues.dateOfBirth ? new Date(flattedScannedValues.dateOfBirth).toISOString().split('T')[0] : "";
  const birthdateNum = birthdate ? getDateAsInt(birthdate) : 0;
  const firstNameStr = flattedScannedValues.firstName ? flattedScannedValues.firstName : "";
  const firstNameBuffer = firstNameStr ? Buffer.from(firstNameStr) : Buffer.alloc(1);
  // FaceTec doesn't seem to support middle names, but we keep it for backwards compatibility
  // const middleNameStr = person.middleName ? person.middleName : "";
  // const middleNameBuffer = middleNameStr
  //   ? Buffer.from(middleNameStr)
  //   : Buffer.alloc(1);
  const middleNameStr = "";
  const middleNameBuffer = Buffer.alloc(1);
  const lastNameStr = flattedScannedValues.lastName ? flattedScannedValues.lastName : "";
  const lastNameBuffer = lastNameStr ? Buffer.from(lastNameStr) : Buffer.alloc(1);
  const nameArgs = [firstNameBuffer, middleNameBuffer, lastNameBuffer].map((x) =>
    ethers.BigNumber.from(x).toString()
  );
  const nameHash = ethers.BigNumber.from(poseidon(nameArgs)).toString();
  // NOTE: FaceTec's parsing of the address fields (other than zip code) has not been the 
  // best in the few tests that I've done. If we need to be 100% sure these fields are
  // populated and correct, we might want to do additional parsing of the ID image.
  const cityStr = flattedScannedValues?.city ? flattedScannedValues.city : "";
  const cityBuffer = cityStr ? Buffer.from(cityStr) : Buffer.alloc(1);
  const subdivisionStr = flattedScannedValues?.state ? flattedScannedValues.state : "";
  const subdivisionBuffer = subdivisionStr
    ? Buffer.from(subdivisionStr)
    : Buffer.alloc(1);
  // TODO: facetec: Figure out how to get street number, street name, street unit from
  // the data provided in FaceTec's response.
  // const streetNumber = Number(address?.houseNumber ? address.houseNumber : 0); // todo
  const streetNumber = 0;
  // const streetNameStr = address?.street ? address.street : ""; // todo
  const streetNameStr = "";
  const streetNameBuffer = streetNameStr
    ? Buffer.from(streetNameStr)
    : Buffer.alloc(1);
  // const streetUnit = address?.unit?.includes("apt ")
  //   ? Number(address?.unit?.replace("apt ", ""))
  //   : address?.unit != null && typeof Number(address?.unit) == "number"
  //   ? Number(address?.unit)
  //   : 0; // todo
  const streetUnit = 0;
  const addrArgs = [streetNumber, streetNameBuffer, streetUnit].map((x) =>
    ethers.BigNumber.from(x).toString()
  );
  const streetHash = ethers.BigNumber.from(poseidon(addrArgs)).toString();
  // const zipCode = Number(address?.postcode ? address.postcode : 0);
  const zipCode = Number(flattedScannedValues?.zipCode ? flattedScannedValues.zipCode.substring(0, 5) : 0);
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
      zipCode: zipCode,
      streetNumber: streetNumber,
      streetName: streetNameStr,
      streetUnit: streetUnit,
      completedAt: new Date().toISOString().split('T')[0],
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

async function saveCollisionMetadata(uuid, uuidV2, sessionId) {
  try {
    const collisionMetadataDoc = new VerificationCollisionMetadata({
      uuid: uuid,
      uuidV2: uuidV2,
      timestamp: new Date(),
      sessionId: sessionId,
      // uuidConstituents: {
      //   firstName: {
      //     populated: !!session.verification.person.firstName,
      //   },
      //   lastName: {
      //     populated: !!session.verification.person.lastName,
      //   },
      //   postcode: {
      //     populated: !!session.verification.person.addresses?.[0]?.postcode,
      //   },
      //   dateOfBirth: {
      //     populated: !!session.verification.person.dateOfBirth,
      //   },
      // },
    });

    await collisionMetadataDoc.save();
  } catch (err) {
    console.log("Error recording collision metadata", err);
  }
}

async function saveUserToDb(uuidV2, sessionId) {
  const userVerificationsDoc = new UserVerifications({
    govId: {
      uuidV2: uuidV2,
      sessionId: sessionId,
      issuedAt: new Date(),
    },
  });
  try {
    await userVerificationsDoc.save();
  } catch (err) {
    // endpointLogger.error(
    //   { error: err },
    //   "An error occurred while saving userVerificationsDoc to database"
    // );
    console.error(
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

async function updateSessionStatus(metaSession, status, failureReason) {
  metaSession.status = status;
  if (failureReason) metaSession.verificationFailureReason = failureReason;
  await metaSession.save();
}

export async function match3d2dIdScanAndGetCreds(req, res) {
  try {
    const sid = req.body.sid;
    const faceTecParams = req.body.faceTecParams;
    const issuanceNullifier = req.params.nullifier;

    // if (process.env.ENVIRONMENT == "dev") {
    //   const creds = newDummyUserCreds;

    //   const response = JSON.parse(
    //     issuev2(
    //       process.env.HOLONYM_ISSUER_PRIVKEY,
    //       issuanceNullifier,
    //       creds.rawCreds.countryCode.toString(),
    //       creds.derivedCreds.nameDobCitySubdivisionZipStreetExpireHash.value
    //     )
    //   );
    //   response.metadata = newDummyUserCreds;

    //   return res.status(200).json(response);
    // }

    if (!sid) {
      return res.status(400).json({ error: "sid is required" });
    }
    if (!faceTecParams) {
      return res.status(400).json({ error: "faceTecParams is required" });
    }

    // --- Validate id-server session ---
    let objectId = null;
    try {
      objectId = new ObjectId(sid);
    } catch (err) {
      return res.status(400).json({ error: "Invalid sid" });
    }

    const session = await Session.findOne({ _id: objectId }).exec();

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (session.status !== sessionStatusEnum.IN_PROGRESS) {
      return res.status(400).json({ error: "Session is not in progress" });
    }

    // --- Forward request to FaceTec server ---

    // TODO: facetec: Figure out rate limiting. Make sure, if facetec charges for
    // match-3d-2d-idscan requests, that we are not vulnerable to greefing attacks.

    let data = null;
    try {
      console.log('faceTecParams', faceTecParams)
      const resp = await axios.post(
        `${facetecServerBaseURL}/match-3d-2d-idscan`,
        faceTecParams,
        {
          headers: {
            "Content-Type": "application/json",
            'X-Device-Key': req.headers['x-device-key'],
            'X-User-Agent': req.headers['x-user-agent'],
            // TODO: facetec: create FACETEC_API_KEY env var
            // "X-Api-Key": process.env.FACETEC_API_KEY,
          },
        }
      )
      data = resp.data;  
    } catch (err) {
      // TODO: facetec: Look into facetec errors. For some, we
      // might want to fail the user's id-server session. For most,
      // we probably just want to forward the error to the user.

      if (err.request) {
        console.error('err.request')
        console.error(
          { error: err.request.data },
          "Error during facetec match-3d-2d-idscan"
        );

        return res.status(502).json({
          error: "Did not receive a response from the FaceTec server"
        })
      } else if (err.response) {
        console.error('err.response')
        console.error(
          { error: err.response.data },
          "Error during facetec match-3d-2d-idscan"
        );

        // TODO: facetec: We should probably forward the FaceTec server's
        // response verbatim, including status code.
        return res.status(502).json({
          error: "FaceTec server returned an error",
          data: err.response.data
        })
      } else {
        console.error('err')
        console.error({ error: err }, "Error during FaceTec match-3d-2d-idscan");
        return res.status(500).json({ error: "An unknown error occurred" });
      }
    }
    
    // console.log('facetec POST /match-3d-2d-idscan response:', data);

    // TODO: facetec: If match was successful, continue. For some cases, we should
    // probably forward the FaceTec server's response back to the client or set 
    // session status to VERIFICATION_FAILED.

    const validationResult = validateFaceTecResponse(data);
    if (validationResult.error) {
      // endpointLogger.error(validationResult.log.data, validationResult.log.msg);
      await updateSessionStatus(
        session,
        sessionStatusEnum.VERIFICATION_FAILED,
        validationResult.error
      );
      return res.status(400).json({ error: validationResult.error });
    }

    const creds = extractCreds(data);

    // Get UUID
    const uuidConstituents =
      (creds.rawCreds.firstName || "") +
      (creds.rawCreds.lastName || "") +
      (creds.rawCreds.zipCode || "") +
      (creds.rawCreds.birthdate || "");
    const uuidOld = sha256(Buffer.from(uuidConstituents)).toString("hex");

    const uuidNew = govIdUUID(
      creds.rawCreds.firstName,
      creds.rawCreds.lastName,
      creds.rawCreds.birthdate
    )

    // We started using a new UUID generation method on May 24, 2024, but we still
    // want to check the database for the old UUIDs too.

    // Assert user hasn't registered yet
    const user = await UserVerifications.findOne({ 
      $or: [
        { "govId.uuid": uuidOld },
        { "govId.uuidV2": uuidNew } 
      ],
      // Filter out documents older than one year
      _id: { $gt: objectIdOneYearAgo() }
    }).exec();
    if (user) {
      await saveCollisionMetadata(uuidOld, uuidNew, data.additionalSessionData.sessionID);

      // endpointLogger.error({ uuidV2: uuidNew }, "User has already registered.");
      console.error({ uuidV2: uuidNew }, "User has already registered.");
      await updateSessionStatus(
        session,
        sessionStatusEnum.VERIFICATION_FAILED,
        `User has already registered. User ID: ${user._id}`
      );
      return res
        .status(400)
        .json({ error: `User has already registered. User ID: ${user._id}` });
    }

    // Store UUID for Sybil resistance
    const dbResponse = await saveUserToDb(uuidNew, data.additionalSessionData.sessionID);
    if (dbResponse.error) return res.status(400).json(dbResponse);

    const response = JSON.parse(
      issuev2(
        process.env.HOLONYM_ISSUER_PRIVKEY,
        issuanceNullifier,
        creds.rawCreds.countryCode.toString(),
        creds.derivedCreds.nameDobCitySubdivisionZipStreetExpireHash.value
      )
    );
    response.metadata = creds;

    // TODO: facetec: FaceTec doesn't expose any DELETE endpoints. We should
    // add delete endpoints to the custom FaceTec server that we run.
    // await deleteFaceTecSession(data.additionalSessionData.sessionID);

    // endpointLogger.info(
    //   { uuidV2: uuidNew, sessionId: req.query.sessionId },
    //   "Issuing credentials"
    // );
    console.log(
      { uuidV2: uuidNew, sessionId: req.query.sessionId },
      "Issuing credentials"
    );

    await updateSessionStatus(session, sessionStatusEnum.ISSUED);

    return res.status(200).json(response);

    // --
    // --- Forward response from FaceTec server ---


    // if (data) return res.status(200).json(data);
    // else return res.status(500).json({ error: "An unknown error occurred" });
  } catch (err) {
    console.log("POST /match-3d-2d-idscan-and-get-creds: Error encountered", err.message);
    return res.status(500).json({ error: "An unknown error occurred" });
  }
}
