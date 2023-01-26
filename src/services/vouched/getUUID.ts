import { hash } from "../../utils/utils";
import { VouchedJobResponse } from "./types";

export function getUUID(job: VouchedJobResponse["result"]) {
	const uuidConstituents =
		(job.firstName || "") +
		(job.lastName || "") +
		// (job.country || "") +
		(job.idAddress?.postalCode || "") +
		(job.dob || ""); // Date of birth
	const uuid = hash(Buffer.from(uuidConstituents)).toString("hex");
	return uuid;
}
