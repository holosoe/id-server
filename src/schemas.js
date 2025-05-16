import mongoose from "mongoose";
import dotenv from "dotenv";
import { OrderSchema } from "./schemas/orders.js";
dotenv.config();

const { Schema } = mongoose;
if (process.env.ENVIRONMENT == "dev") mongoose.set("debug", true);

const userVerificationsSchema = new Schema({
  govId: {
    type: {
      // uuid is a hash of data from the user's ID document. We stopped
      // using it on May 24, 2024 in favor of uuidV2 because we were
      // calculating uuid differently depending on which IDV provider was used.
      uuid: {
        type: String,
        required: false,
      },
      // We include a separate uuidV2 field, which should be calculated the
      // same way regardless of which IDV provider is used.
      uuidV2: String,
      sessionId: String,
      issuedAt: Date,
    },
    required: false,
  },
  aml: {
    type: {
      uuid: String,
      issuedAt: Date,
    },
    required: false,
  }
});
// By keeping track of a user's sessions, we can let them start verification
// and finish issuance in separate browsing sessions, which is useful for
// handling the delay between when a user submits their documents to the
// IDV provider and when the provider finishes verifying the documents,
// which can be up to 20 minutes for iDenfy, for example.
const idvSessionsSchema = new Schema({
  sigDigest: String,
  // For "verification status" display in frontend, make it conditional on:
  // - Whether the user has govId creds
  // - Status of the *latest* IDV session
  // if (hasGovIdCreds) displayCreds
  // else if (hasIdvSession && successfulSessionExists) display "check email" or link to "finish verification"
  // else if (hasIdvSession) for each idv provider: if user has idv session with provider:
  //                         display status of most recent verification
  // else display nothing
  veriff: {
    type: {
      sessions: [
        {
          sessionId: String,
          createdAt: Date,
        },
      ],
    },
    required: false,
  },
  idenfy: {
    type: {
      sessions: [
        {
          scanRef: String,
          createdAt: Date,
        },
      ],
    },
    required: false,
  },
  onfido: {
    type: {
      checks: [
        {
          check_id: String,
          createdAt: Date,
        },
      ],
    },
    required: false,
  },
});

// Note that IDVSessions is distinct from Session.
const sessionSchema = new Schema({
  sigDigest: String,
  idvProvider: String,
  // status here is distinct from the status of the IDV session (as
  // provided by the IDV provider). The possible values of status are:
  // 'NEEDS_PAYMENT' | 'IN_PROGRESS' | 'ISSUED' | 'VERIFICATION_FAILED' | 'REFUNDED'
  status: String,
  // frontendDomain allows mods to change their suggestions based on whether the domain
  // is old Holonym or Holonym-within-Silk.
  frontendDomain: {
    type: String, // "app.holonym.id" | "silksecure.net"
    required: false,
  },
  // silkDiffWallet indicates whether the user is on silksecure.net/holonym/silk or
  // silksecure.net/holonym/diff-wallet
  silkDiffWallet: {
    type: String,
    required: false,
  },
  deletedFromIDVProvider: {
    type: Boolean,
    required: false,
  },
  // PayPal payment details
  payPal: {
    type: {
      orders: {
        type: [
          {
            id: String,
            createdAt: Date,
          },
        ],
        required: false,
      },
    },
    required: false,
  },
  txHash: {
    type: String,
    required: false,
  },
  chainId: {
    type: Number,
    required: false,
  },
  // Transaction hash of the refund transaction
  refundTxHash: {
    type: String,
    required: false,
  },
  // Veriff sessionId
  sessionId: {
    type: String,
    required: false,
  },
  veriffUrl: {
    type: String,
    required: false,
  },
  // iDenfy scanRef
  scanRef: {
    type: String,
    required: false,
  },
  idenfyAuthToken: {
    type: String,
    required: false,
  },
  // Onfido applicant_id
  applicant_id: {
    type: String,
    required: false,
  },
  // Onfido check_id
  check_id: {
    type: String,
    required: false,
  },
  onfido_sdk_token: {
    type: String,
    required: false,
  },
  num_facetec_liveness_checks: {
    type: Number,
    required: false,
  },
  verificationFailureReason: {
    type: String,
    required: false,
  },
  // ipCountry should be an ISO 3166-1 alpha-2 or alpha-3 country code
  ipCountry: {
    type: String,
    required: false,
  },
  // externalDatabaseRefID is use in FaceTec
  externalDatabaseRefID: {
    type: String,
    required: false,
  },
});

const amlChecksSessionSchema = new Schema({
  sigDigest: String,
  // Right now a session for AML checks only uses Veriff, so there
  // is no reason to store idvProvider.
  // idvProvider: String,
  // status here is distinct from the status of the session with, e.g., Veriff.
  // The possible values of status are the same as for the sessions above
  status: String,
  // silkDiffWallet indicates whether the user is on silksecure.net/holonym/silk or
  // silksecure.net/holonym/diff-wallet
  silkDiffWallet: {
    type: String,
    required: false,
  },
  deletedFromIDVProvider: {
    type: Boolean,
    required: false,
  },
  // PayPal payment details
  payPal: {
    type: {
      orders: {
        type: [
          {
            id: String,
            createdAt: Date,
          },
        ],
        required: false,
      },
    },
    required: false,
  },
  txHash: {
    type: String,
    required: false,
  },
  chainId: {
    type: Number,
    required: false,
  },
  // Transaction hash of the refund transaction
  refundTxHash: {
    type: String,
    required: false,
  },
  veriffSessionId: {
    type: String,
    required: false,
  },
  verificationFailureReason: {
    type: String,
    required: false,
  },
});

// TODO: Do not use MongoDB for mutex purposes. Use something like Redis instead.
const sessionRefundMutexSchema = new Schema({
  // sessionId is NOT a Veriff sessionId. It is the _id of the associated Session.
  sessionId: String,
});

const userCredentialsSchema = new Schema({
  sigDigest: String,
  proofDigest: {
    type: String,
    required: false,
  },
  // NOTE: encryptedCredentials is stored as base64 string. Use LitJsSdk.base64StringToBlob() to convert back to blob
  // For backwards compatibility (for the version that uses Lit). TODO: Remove after some time
  encryptedCredentials: {
    type: String,
    required: false,
  },
  // For backwards compatibility (for the version that uses Lit). TODO: Remove after some time
  encryptedSymmetricKey: {
    type: String,
    required: false,
  },
  encryptedCredentialsAES: {
    type: String,
    required: false,
  },
});

const userCredentialsV2Schema = new Schema({
  holoUserId: String,
  encryptedPhoneCreds: {
    type: {
      ciphertext: String,
      iv: String,
    },
    required: false,
  },
  encryptedGovIdCreds: {
    type: {
      ciphertext: String,
      iv: String,
    },
    required: false,
  },
  encryptedCleanHandsCreds: {
    type: {
      ciphertext: String,
      iv: String,
    },
    required: false,
  },
});

const userProofMetadataSchema = new Schema({
  sigDigest: String,
  encryptedProofMetadata: {
    type: String,
    required: false,
  },
  encryptedSymmetricKey: {
    type: String,
    required: false,
  },
  encryptedProofMetadataAES: {
    type: String,
    required: false,
  },
});

// A collection to associate an issuance nullifier to
// an IDV session ID so that the user can lookup their
// credentials using their nullifier.
const NullifierAndCredsSchema = new Schema({
  holoUserId: String,
  issuanceNullifier: String,
  idvSessionIds: {
    type: {
      veriff: {
        type: {
          sessionId: String,
        },
        required: false,
      },
      onfido: {
        type: {
          check_id: String,
        },
        required: false,
      },
    },
    required: false
  },
  uuidV2: {
    type: String,
    required: false,
  }
});

// A collection to associate an issuance nullifier to the
// user's Clean Hands creds so that the user can lookup their
// credentials using their nullifier.
const CleanHandsNullifierAndCredsSchema = new Schema({
  holoUserId: String,
  issuanceNullifier: String,
  govIdCreds: {
    type: {
      firstName: String,
      lastName: String,
      dateOfBirth: String,
      expiry: Date
    },
    required: false
  },
  uuid: {
    type: String,
    required: false,
  }
});

// To allow the user to persist a nullifier so that they can request their
// signed credentials in more than one browser session.
const EncryptedNullifiersSchema = new Schema({
  holoUserId: String,
  govId: {
    type: {
      encryptedNullifier: {
        type: {
          ciphertext: String,
          iv: String,
        },
      },
      // The date the nullifier was created. When the user's credentials
      // expire and the user needs to reverify, they will need to replace
      // their old encryptedNullifier with a new one and update the createdAt value.
      createdAt: Date,
    },
    required: false,
  },
  phone: {
    type: {
      encryptedNullifier: {
        type: {
          ciphertext: String,
          iv: String,
        },
      },
      createdAt: Date,
    },
    required: false,
  },
  cleanHands: {
    type: {
      encryptedNullifier: {
        type: {
          ciphertext: String,
          iv: String,
        },
      },
      createdAt: Date,
    },
    required: false,
  }
});

const DailyVerificationCountSchema = new Schema({
  date: {
    type: String, // use: new Date().toISOString().slice(0, 10)
    required: true,
  },
  veriff: {
    type: {
      // Veriff charges per _decision_. We are tracking sessions since each session
      // can have a decision, and we want to pre-emptively stop serving requests
      // for new sessions in case all current sessions end up with a decision.
      sessionCount: Number,
    },
    required: false,
  },
  idenfy: {
    type: {
      sessionCount: Number,
    },
    required: false,
  },
  onfido: {
    type: {
      applicantCount: {
        type: Number,
        required: false,
      },
      checkCount: {
        type: Number,
        required: false,
      },
    },
    required: false,
  },
});

const DailyVerificationDeletionsSchema = new Schema({
  date: {
    type: String, // use: new Date().toISOString().slice(0, 10)
    required: true,
  },
  deletionCount: Number,
});

const VerificationCollisionMetadataSchema = new Schema({
  uuid: String,
  uuidV2: {
    type: String,
    required: false,
  },
  timestamp: Date,
  sessionId: {
    type: String,
    required: false,
  },
  scanRef: {
    type: String,
    required: false,
  },
  check_id: {
    type: String,
    required: false,
  },
  uuidConstituents: {
    required: false,
    type: {
      firstName: {
        populated: {
          type: Boolean,
          required: false,
        },
      },
      lastName: {
        populated: {
          type: Boolean,
          required: false,
        }
      },
      postcode: {
        populated: {
          type: Boolean,
          required: false,
        },
      },
      address: {
        populated: {
          type: Boolean,
          required: false,
        },
      },
      dateOfBirth: {
        populated: {
          type: Boolean,
          required: false,
        }
      },
    }
  },
});

const GalxeCampaignZeroUserSchema = new Schema({
  generatedLink: String,
  peanutLink: String,
  email: String,
});

const SilkPeanutCampaignsMetadataSchema = new Schema({
  generatedLink: String,
  peanutLink: String,
  email: String,
  campaignId: String,
});

export {
  userVerificationsSchema,
  idvSessionsSchema,
  sessionSchema,
  sessionRefundMutexSchema,
  userCredentialsSchema,
  userCredentialsV2Schema,
  userProofMetadataSchema,
  EncryptedNullifiersSchema,
  NullifierAndCredsSchema,
  CleanHandsNullifierAndCredsSchema,
  DailyVerificationCountSchema,
  DailyVerificationDeletionsSchema,
  VerificationCollisionMetadataSchema,
  amlChecksSessionSchema,
  GalxeCampaignZeroUserSchema,
  SilkPeanutCampaignsMetadataSchema,
  OrderSchema,
};
