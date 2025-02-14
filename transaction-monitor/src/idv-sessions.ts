import axios from 'axios'
import { v4 as uuidV4 } from "uuid";

// -------------------- Onfido --------------------

async function createOnfidoApplicant() {
  try {
    const reqBody = {
      // From Onfido docs:
      // "For Document reports, first_name and last_name must be provided but can be
      // dummy values if you don't know an applicant's name."
      first_name: "Alice",
      last_name: "Smith",
      // NOTE: `location` is required for facial similarity reports.
      // NOTE: `consent` is required for US applicants. From Onfido docs: "If the location of
      // the applicant is the US, you must also provide consent information confirming that
      // the end user has viewed and accepted Onfido’s privacy notices and terms of service."
    };
    const config = {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token token=${process.env.ONFIDO_API_TOKEN}`,
      },
    };
    const resp = await axios.post(
      "https://api.us.onfido.com/v3.6/applicants",
      reqBody,
      config
    );
    return resp.data;
  } catch (err) {
    console.log("Error creating Onfido applicant", (err as any).message, (err as any).response?.data);
  }
}

/**
 * @param {string} [referrer] The match pattern URL. Defaults to Holonym frontend URL.
 */
async function createOnfidoSdkToken(applicant_id: string, referrer?: string) {
  try {
    if (!referrer) {
      referrer =
        process.env.NODE_ENV === "development"
          ? "http://localhost:3002/*"
          : "https://app.holonym.id/*";
    }
    // Create an SDK token for the applicant
    const body = `applicant_id=${applicant_id}&referrer=${referrer}`;
    const config = {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Token token=${process.env.ONFIDO_API_TOKEN}`,
      },
    };
    const resp = await axios.post(
      "https://api.us.onfido.com/v3.6/sdk_token",
      body,
      config
    );
    return resp.data;
  } catch (err) {
    console.log("Error creating Onfido SDK token", (err as any).message, (err as any).response?.data);
  }
}

// -------------------- Veriff --------------------

async function createVeriffSession() {
  try {
    const frontendUrl =
      process.env.NODE_ENV === "development"
        ? "http://localhost:3002"
        : "https://holonym.id";
    const reqBody = {
      verification: {
        // TODO: Is callback necessary if we handle "FINISHED" event in frontend?
        callback: `${frontendUrl}/mint`,
        // document: {
        //   type: "DRIVERS_LICENSE",
        // },
        vendorData: uuidV4(),
        timestamp: new Date().toISOString(),
      },
    };
    const config = {
      headers: {
        "Content-Type": "application/json",
        "X-AUTH-CLIENT": process.env.VERIFF_PUBLIC_API_KEY,
      },
    };
    const resp = await axios.post(
      "https://api.veriff.me/v1/sessions",
      reqBody,
      config
    );
    return resp.data;
  } catch (err) {
    console.log("Error creating veriff session:", (err as any).message, (err as any).response?.data);
  }
}

// -------------------- Create session --------------------

// TODO: Add session type. Don't use "any"
export async function handleIdvSessionCreation(session: any) {
  console.log('entered handleIdvSessionCreation')
  if (session.idvProvider === "veriff") {
    console.log('handleIdvSessionCreation: veriff')
    const veriffSession = await createVeriffSession();
    console.log('handleIdvSessionCreation: created veriff session')
    if (!veriffSession) { 
      return
    }

    console.log('handleIdvSessionCreation: saving')

    session.sessionId = veriffSession.verification.id;
    session.veriffUrl = veriffSession.verification.url;
    await session.save();

    console.log(
      { sessionId: veriffSession.verification.id, idvProvider: "veriff" },
      "Created Veriff session"
    );
  } else if (session.idvProvider === "onfido") {
    console.log('handleIdvSessionCreation: onfido')
    const applicant = await createOnfidoApplicant();
    if (!applicant) {
      return
    }

    console.log('handleIdvSessionCreation: created onfido applicant')

    session.applicant_id = applicant.id;

    console.log(
      { applicantId: applicant.id, idvProvider: "onfido" },
      "Created Onfido applicant"
    );

    const sdkTokenData = await createOnfidoSdkToken(applicant.id);
    if (!sdkTokenData) {
      return
    }

    console.log('handleIdvSessionCreation: created sdk token')

    session.onfido_sdk_token = sdkTokenData.token;
    await session.save();

    console.log(
      { sdkToken: sdkTokenData.token, idvProvider: "onfido" },
      "Created Onfido SDK token"
    )
  } else {
    console.log("Invalid idvProvider", session.idvProvider);
  }
}
