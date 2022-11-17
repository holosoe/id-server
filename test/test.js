import axios from "axios";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { getDateAsInt } from "../src/main/utils/utils.js";
import dotenv from "dotenv";
dotenv.config();

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("getDateAsInt", async () => {
  it("Should throw error if date is in format yyyy-mm", async () => {
    const date = "1900-01";
    expect(() => getDateAsInt(date)).to.throw();
  });

  it("Should throw error if date is in format dd-mm-yyyy", async () => {
    const date = "01-01-1900";
    expect(() => getDateAsInt(date)).to.throw();
  });

  it("Should throw error if date is in format mm-dd-yyyy", async () => {
    const date = "01-01-1900";
    expect(() => getDateAsInt(date)).to.throw();
  });

  it("Should throw error if date is in format yyyy/mm/dd", async () => {
    const date = "01/01/1900";
    expect(() => getDateAsInt(date)).to.throw();
  });

  // BEGIN 1900 tests

  it("Should throw an error, given 1900-01-32", async () => {
    const date = "1900-01-32";
    expect(() => getDateAsInt(date)).to.throw();
  });

  it("Should convert 1900-01-01 to 0", async () => {
    const date = "1900-01-01";
    const dateAsInt = getDateAsInt(date);
    expect(dateAsInt).to.equal(0);
  });

  it("Should convert 1900-01-02 to 86400", async () => {
    const date = "1900-01-02";
    const dateAsInt = getDateAsInt(date);
    expect(dateAsInt).to.equal(86400);
  });

  it("Should convert 1900-01-31 to 2592000", async () => {
    const date = "1900-01-31";
    const dateAsInt = getDateAsInt(date);
    expect(dateAsInt).to.equal(2592000);
  });

  it("Should convert 1900-02-01 to 2678400", async () => {
    const date = "1900-02-01";
    const dateAsInt = getDateAsInt(date);
    expect(dateAsInt).to.equal(2678400);
  });

  // BEGIN 1970 tests

  it("Should throw an error, given 1970-01-32", async () => {
    const date = "1970-01-32";
    expect(() => getDateAsInt(date)).to.throw();
  });

  it("Should convert 1970-01-01 to 2208988800", async () => {
    const date = "1970-01-01";
    const dateAsInt = getDateAsInt(date);
    expect(dateAsInt).to.equal(2208988800);
  });

  it("Should convert 1970-01-02 to 2208988800+86400", async () => {
    const date = "1970-01-02";
    const dateAsInt = getDateAsInt(date);
    expect(dateAsInt).to.equal(2208988800 + 86400);
  });

  it("Should convert 2099-12-31 to 6311347200", async () => {
    const date = "2099-12-31";
    const dateAsInt = getDateAsInt(date);
    expect(dateAsInt).to.equal(6311347200);
  });
});

// describe("/registerVouched/vouchedCredentials", async () => {
//   it("Should return status 200 and an object with the correct attributes", async () => {
//     const resp = await axios.get(
//       "http://localhost:3000/registerVouched/vouchedCredentials?jobID=123"
//     );
//     expect(resp.data.user).to.be.an("object");
//     expect(resp.data.user.countryCode).to.be.a("number");
//     expect(resp.data.user.subdivision).to.be.a("string");
//     expect(resp.data.user.completedAt).to.be.a("string");
//     expect(resp.data.user.birthdate).to.be.a("string");
//     expect(resp.data.user.secret).to.be.a("string");
//     expect(resp.data.user.signature).to.be.a("string");
//   });

//   it("Should return status 400 if no jobID is provided", async () => {
//     try {
//       const resp = await axios.get(
//         "http://localhost:3000/registerVouched/vouchedCredentials"
//       );
//       expect(false).to.equal(true);
//     } catch (err) {
//       expect(err?.response?.status).to.equal(400);
//     }
//   });

//   // TODO: Update mock Vouched server to return different the responses that affect the code's branching
// });
