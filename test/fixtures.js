import axios from "axios";
import express from "express";
import { app } from "../src/index.js";
import { UserVerifications } from "../src/init.js";
import dotenv from "dotenv";
dotenv.config();

function runIdServer() {
  const PORT = 3000;
  return app.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`ID server running, exposed at http://127.0.0.1:${PORT}`);
  });
}

function runMockVouchedServer() {
  const vouchedApp = express();

  vouchedApp.use(express.json());
  vouchedApp.use(express.urlencoded({ extended: true }));

  // mockCredsResp contains a small selection of the fields returned by Vouched
  const mockCredsResp = {
    items: [
      {
        status: "completed",
        updatedAt: "2022-11-01T03:34:10+00:00",
        result: {
          success: true,
          firstName: "ALICE",
          middleName: "BOB",
          lastName: "CHARLIE",
          dob: "01/01/1980",
          expireDate: "01/01/2025",
          issueDate: "01/01/2020",
          birthDate: "01/01/1980",
          address: "123 MAIN ST APT 999 NEW YORK NY 10001",
          unverifiedIdAddress: ["123 MAIN ST APT 999", "NEW YORK , NY 10001"],
          idAddress: {
            unit: "999",
            streetNumber: "123",
            street: "Main St",
            city: "New York",
            state: "NY",
            country: "US",
            postalCode: "10001",
            postalCodeSuffix: "0002",
          },
          type: "identification",
          state: "NY",
          country: "US",
        },
      },
    ],
  };

  const mockErrorResp = {
    errors: [
      {
        type: "InvalidRequestError",
        message: "string",
        warning: true,
        suggestion: "John Smith",
      },
    ],
  };

  // Mock endpoint for GET https://verify.vouched.id/api/jobs?id=${jobID}
  vouchedApp.get("/vouched/api/jobs", (req, res) => {
    console.log(`${new Date().toISOString()} GET /vouched/api/jobs`);
    if (!req.query.id) {
      return res.status(400).json(mockErrorResp);
    }
    return res.status(200).json(mockCredsResp);
  });

  // Mock endpoint for DELETE https://verify.vouched.id/api/jobs/${jobID}
  vouchedApp.delete("/vouched/api/jobs/:id", (req, res) => {
    console.log(`${new Date().toISOString()} DELETE /vouched/api/jobs`);
    if (!req.params.id) {
      return res.status(400).json(mockErrorResp);
    }
    return res.status(200).json(mockCredsResp);
  });

  const PORT = 3005;
  const server = vouchedApp.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`Vouched mock server running, exposed at http://127.0.0.1:${PORT}`);
  });

  // function terminate() {
  //   console.log(`Closing server`);
  //   server.close(() => {
  //     console.log(`Closed server`);
  //     process.exit(0);
  //   });
  // }
  // process.on("SIGTERM", terminate);
  // process.on("SIGINT", terminate);
  return server;
}

// export async function mochaGlobalSetup() {
//   this.vouchedServer = runMockVouchedServer();
//   this.idServer = runIdServer();
//   console.log();
//   await new Promise((resolve) => setTimeout(resolve, 1000)); // wait for database to connection
// }

// export async function mochaGlobalTeardown() {
//   console.log(`Closing Vouched server`);
//   this.vouchedServer.close(() => {
//     console.log(`Closed Vouched server`);
//     process.exit(0);
//   });

//   console.log(`Closing ID server`);
//   this.idServer.close(() => {
//     console.log(`Closed ID server`);
//     process.exit(0);
//   });
// }
