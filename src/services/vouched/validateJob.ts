import { logWithTimestamp } from "@/utils/utils";
import { VouchedJobResponse } from "./types";

export const validateJob = (
	response: VouchedJobResponse,
	jobID: string | number,
) => {
	if (!response) {
		logWithTimestamp(
			`registerVouched/vouchedCredentials: failed to retrieve Vouched job ${jobID}. Exiting.`,
		);
		return { error: "Failed to retrieve Vouched job" };
	}
	// Assert job complete
	if (response.status !== "completed") {
		logWithTimestamp(
			`registerVouched/vouchedCredentials: job status is ${response.status}. Exiting.`,
		);
		return { error: "Job status is not completed." };
	}
	// Assert verifcation passed
	if (!response.result.success) {
		logWithTimestamp(
			`registerVouched/vouchedCredentials: success is ${response.result?.success}. Exiting.`,
		);
		return { error: "Verification failed" };
	}
	// Assert ID not expired if expiration date is present. If not present, assume ID is not expired.
	if (
		response.result.expireDate &&
		new Date(response.result.expireDate) < new Date()
	) {
		logWithTimestamp(
			`registerVouched/vouchedCredentials: ID expired. expireDate is ${response.result.expireDate}. Exiting.`,
		);
		return { error: "ID expired" };
	}
	// Assert no errors in job
	if (response.errors?.length > 0) {
		logWithTimestamp(
			"registerVouched/vouchedCredentials: errors in job (see next log). Exiting.",
		);
		console.log(response.errors);
		const errorNames = response.errors.map((err) => err.type);
		return { error: `Errors in job: ${errorNames}` };
	}
	return { success: true };
};
