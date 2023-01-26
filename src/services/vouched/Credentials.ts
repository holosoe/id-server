// @ts-ignore
import { poseidon } from "circomlibjs-old";
import { countryCodeToPrime } from "@/utils/constants";
import { getDateAsInt, logWithTimestamp } from "@/utils/utils";
import assert from "assert/strict";
import { BigNumber } from "ethers";
import { VouchedJobResponse } from "./types";

export function extractCreds(response: VouchedJobResponse) {
	const { result: job } = response;
	assert.ok(
		job.country && job.country in countryCodeToPrime,
		"Unsupported country",
	);
	let birthdate: string;
	if (job?.dob?.split("/")?.length === 3) {
		const split = job?.dob?.split("/");
		assert.equal(split[2].length, 4, "Birthdate year is not 4 characters"); // Ensures we are placing year in correct location in formatted birthdate
		birthdate = [split[2], split[0], split[1]].join("-") as string;
	} else {
		logWithTimestamp(
			`registerVouched/vouchedCredentials: birthdate == ${job?.dob?.split}. Setting birthdate to ""`,
		);
		birthdate = "";
	}
	const birthdateNum = birthdate ? getDateAsInt(birthdate) : 0;
	const firstNameStr = job?.firstName ? job.firstName : "";
	const firstNameBuffer = firstNameStr
		? Buffer.from(firstNameStr)
		: Buffer.alloc(1);
	const middleNameStr = job?.middleName ? job.middleName : "";
	const middleNameBuffer = middleNameStr
		? Buffer.from(middleNameStr)
		: Buffer.alloc(1);
	const lastNameStr = job?.lastName ? job.lastName : "";
	const lastNameBuffer = lastNameStr
		? Buffer.from(lastNameStr)
		: Buffer.alloc(1);
	const nameArgs = [firstNameBuffer, middleNameBuffer, lastNameBuffer].map(
		(x) => BigNumber.from(x).toString(),
	);
	const nameHash = BigNumber.from(poseidon(nameArgs)).toString();
	const cityStr = job?.idAddress?.city ? job.idAddress.city : "";
	const cityBuffer = cityStr ? Buffer.from(cityStr) : Buffer.alloc(1);
	const subdivisionStr = job?.state ? job.state : "";
	const subdivisionBuffer = subdivisionStr
		? Buffer.from(subdivisionStr)
		: Buffer.alloc(1);
	const streetNumber = Number(
		job?.idAddress?.streetNumber ? job?.idAddress?.streetNumber : 0,
	);
	const streetNameStr = job?.idAddress?.street ? job?.idAddress?.street : "";
	const streetNameBuffer = streetNameStr
		? Buffer.from(streetNameStr)
		: Buffer.alloc(1);
	const streetUnit = Number(job?.idAddress?.unit ? job?.idAddress?.unit : 0);
	const addrArgs = [streetNumber, streetNameBuffer, streetUnit].map((x) =>
		BigNumber.from(x).toString(),
	);
	const streetHash = BigNumber.from(poseidon(addrArgs)).toString();
	const zipCode = Number(
		job?.idAddress?.postalCode ? job.idAddress.postalCode : 0,
	);
	const addressArgs = [cityBuffer, subdivisionBuffer, zipCode, streetHash].map(
		(x) => BigNumber.from(x),
	);
	const addressHash = BigNumber.from(poseidon(addressArgs)).toString();
	let expireDateSr = job?.expireDate ? job.expireDate : "";
	if (expireDateSr?.length === 3) {
		// @ts-ignore
		expireDateSr = job?.expireDate?.split("/");
		assert.equal(
			expireDateSr[2].length,
			4,
			"expireDate year is not 4 characters",
		); // Ensures we are placing year in correct location in formatted date
		expireDateSr = [expireDateSr[2], expireDateSr[0], expireDateSr[1]].join(
			"-",
		);
	} else {
		logWithTimestamp(
			`registerVouched/vouchedCredentials: expireDateSr == ${expireDateSr}. Setting expireDateSr to ""`,
		);
		expireDateSr = "";
	}
	const expireDateNum = expireDateSr ? getDateAsInt(expireDateSr) : 0;
	const nameDobAddrExpireArgs = [
		nameHash,
		birthdateNum,
		addressHash,
		expireDateNum,
	].map((x) => BigNumber.from(x).toString());
	const nameDobAddrExpire = BigNumber.from(
		poseidon(nameDobAddrExpireArgs),
	).toString();
	return {
		rawCreds: {
			countryCode:
				countryCodeToPrime[job.country as keyof typeof countryCodeToPrime],
			firstName: firstNameStr,
			middleName: middleNameStr,
			lastName: lastNameStr,
			city: cityStr,
			subdivision: subdivisionStr,
			zipCode: job?.idAddress?.postalCode ? job.idAddress.postalCode : 0,
			streetNumber: streetNumber,
			streetName: streetNameStr,
			streetUnit: streetUnit,
			completedAt: response.updatedAt ? response.updatedAt.split("T")[0] : "",
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
