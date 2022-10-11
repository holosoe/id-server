import axios from "axios";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { getDateAsBytes } from "../src/main/utils/utils.js";
import dotenv from "dotenv";
dotenv.config();

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("getDateAsBytes", async () => {
  it("Should throw error if date is in format yyyy-mm", async () => {
    const date = "1900-01";
    expect(() => getDateAsBytes(date)).to.throw();
  });

  it("Should throw error if date is in format dd-mm-yyyy", async () => {
    const date = "01-01-1900";
    expect(() => getDateAsBytes(date)).to.throw();
  });

  it("Should throw error if date is in format mm-dd-yyyy", async () => {
    const date = "01-01-1900";
    expect(() => getDateAsBytes(date)).to.throw();
  });

  it("Should throw error if date is in format yyyy/mm/dd", async () => {
    const date = "01/01/1900";
    expect(() => getDateAsBytes(date)).to.throw();
  });

  // BEGIN 1900 tests

  it("Should throw an error, given 1900-01-32", async () => {
    const date = "1900-01-32";
    expect(() => getDateAsBytes(date)).to.throw();
  });

  it("Should convert 1900-01-01 to 0x000001", async () => {
    const date = "1900-01-01";
    const dateAsBytes = getDateAsBytes(date);
    expect(dateAsBytes).to.deep.equal(Buffer.from([0x00, 0x00, 0x01]));
  });

  it("Should convert 1900-01-02 to 0x000002", async () => {
    const date = "1900-01-02";
    const dateAsBytes = getDateAsBytes(date);
    expect(dateAsBytes).to.deep.equal(Buffer.from([0x00, 0x00, 0x02]));
  });

  it("Should convert 1900-01-31 to 0x00001f", async () => {
    const date = "1900-01-31";
    const dateAsBytes = getDateAsBytes(date);
    expect(dateAsBytes).to.deep.equal(Buffer.from([0x00, 0x00, 0x1f]));
  });

  it("Should convert 1900-02-01 to 0x000020", async () => {
    const date = "1900-02-01";
    const dateAsBytes = getDateAsBytes(date);
    expect(dateAsBytes).to.deep.equal(Buffer.from([0x00, 0x00, 0x20]));
  });

  it("Should convert 1900-02-28 to 0x00003b", async () => {
    const date = "1900-02-28";
    const dateAsBytes = getDateAsBytes(date);
    expect(dateAsBytes).to.deep.equal(Buffer.from([0x00, 0x00, 0x3b]));
  });

  it("Should convert 1900-10-01 to 0x000112", async () => {
    const date = "1900-10-01";
    const dateAsBytes = getDateAsBytes(date);
    expect(dateAsBytes).to.deep.equal(Buffer.from([0x00, 0x01, 0x12]));
  });

  // BEGIN 1970 tests

  it("Should throw an error, given 1970-01-32", async () => {
    const date = "1970-01-32";
    expect(() => getDateAsBytes(date)).to.throw();
  });

  it("Should convert 1970-01-01 to 0x460001", async () => {
    const date = "1970-01-01";
    const dateAsBytes = getDateAsBytes(date);
    expect(dateAsBytes).to.deep.equal(Buffer.from([0x46, 0x00, 0x01]));
  });

  it("Should convert 1970-01-02 to 0x460002", async () => {
    const date = "1970-01-02";
    const dateAsBytes = getDateAsBytes(date);
    expect(dateAsBytes).to.deep.equal(Buffer.from([0x46, 0x00, 0x02]));
  });

  it("Should convert 1970-01-31 to 0x46001f", async () => {
    const date = "1970-01-31";
    const dateAsBytes = getDateAsBytes(date);
    expect(dateAsBytes).to.deep.equal(Buffer.from([0x46, 0x00, 0x1f]));
  });

  it("Should convert 1970-02-01 to 0x460020", async () => {
    const date = "1970-02-01";
    const dateAsBytes = getDateAsBytes(date);
    expect(dateAsBytes).to.deep.equal(Buffer.from([0x46, 0x00, 0x20]));
  });

  it("Should convert 1970-02-28 to 0x46003b", async () => {
    const date = "1970-02-28";
    const dateAsBytes = getDateAsBytes(date);
    expect(dateAsBytes).to.deep.equal(Buffer.from([0x46, 0x00, 0x3b]));
  });

  it("Should convert 1970-10-01 to 0x460112", async () => {
    const date = "1970-10-01";
    const dateAsBytes = getDateAsBytes(date);
    expect(dateAsBytes).to.deep.equal(Buffer.from([0x46, 0x01, 0x12]));
  });

  // BEGIN 2000 tests

  it("Should throw an error, given 2000-01-32", async () => {
    const date = "2000-01-32";
    expect(() => getDateAsBytes(date)).to.throw();
  });

  it("Should convert 2000-01-01 to 0x640001", async () => {
    const date = "2000-01-01";
    const dateAsBytes = getDateAsBytes(date);
    expect(dateAsBytes).to.deep.equal(Buffer.from([0x64, 0x00, 0x01]));
  });

  it("Should convert 2000-01-01 to 0x640001", async () => {
    const date = "2000-01-01";
    const dateAsBytes = getDateAsBytes(date);
    expect(dateAsBytes).to.deep.equal(Buffer.from([0x64, 0x00, 0x01]));
  });

  it("Should convert 2000-01-02 to 0x640002", async () => {
    const date = "2000-01-02";
    const dateAsBytes = getDateAsBytes(date);
    expect(dateAsBytes).to.deep.equal(Buffer.from([0x64, 0x00, 0x02]));
  });

  it("Should convert 2000-01-31 to 0x64001f", async () => {
    const date = "2000-01-31";
    const dateAsBytes = getDateAsBytes(date);
    expect(dateAsBytes).to.deep.equal(Buffer.from([0x64, 0x00, 0x1f]));
  });

  it("Should convert 2000-02-01 to 0x640020", async () => {
    const date = "2000-02-01";
    const dateAsBytes = getDateAsBytes(date);
    expect(dateAsBytes).to.deep.equal(Buffer.from([0x64, 0x00, 0x20]));
  });

  it("Should convert 2000-02-28 to 0x64003b", async () => {
    const date = "2000-02-28";
    const dateAsBytes = getDateAsBytes(date);
    expect(dateAsBytes).to.deep.equal(Buffer.from([0x64, 0x00, 0x3b]));
  });

  it("Should convert 2000-02-29 to 0x64003c", async () => {
    const date = "2000-02-29";
    const dateAsBytes = getDateAsBytes(date);
    expect(dateAsBytes).to.deep.equal(Buffer.from([0x64, 0x00, 0x3c]));
  });

  it("Should convert 2000-10-01 to 0x640113", async () => {
    const date = "2000-10-01";
    const dateAsBytes = getDateAsBytes(date);
    expect(dateAsBytes).to.deep.equal(Buffer.from([0x64, 0x01, 0x13]));
  });
});

describe("/registerVouched/vouchedCredentials", async () => {
  it("Should return status 200 and an object with the correct attributes", async () => {
    const resp = await axios.get(
      "http://localhost:3000/registerVouched/vouchedCredentials?jobID=123"
    );
    expect(resp.data.user).to.be.an("object");
    expect(resp.data.user.countryCode).to.be.a("number");
    expect(resp.data.user.subdivision).to.be.a("string");
    expect(resp.data.user.completedAt).to.be.a("string");
    expect(resp.data.user.birthdate).to.be.a("string");
    expect(resp.data.user.secret).to.be.a("string");
    expect(resp.data.user.signature).to.be.a("string");
  });

  it("Should return status 400 if no jobID is provided", async () => {
    try {
      const resp = await axios.get(
        "http://localhost:3000/registerVouched/vouchedCredentials"
      );
      expect(false).to.equal(true);
    } catch (err) {
      expect(err?.response?.status).to.equal(400);
    }
  });

  // TODO: Update mock Vouched server to return different the responses that affect the code's branching
});
