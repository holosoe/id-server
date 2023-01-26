import { env } from "@/constants";
import axios, { AxiosResponse } from "axios";
import type { Request, Response } from "express";
import assert from "assert/strict";
import { VouchedJobResponse, GetVouchedJobResponse } from "./types";
import { logWithTimestamp, sendEmail } from "@/utils/utils";
import { DailyVerificationCount } from "@/init";

const headers = {
	"X-API-Key": env.VOUCHED_PRIVATE_KEY,
	Accept: "application/json",
};
const baseUrl =
	env.TESTING === "true"
		? "http://localhost:3005/vouched"
		: "https://verify.vouched.id/";

const getData = <T>(response: AxiosResponse<T>) => response.data;

export const getVouchedJob = async (jobID: string | number) =>
	axios
		.get<GetVouchedJobResponse>(`${baseUrl}/api/jobs?id=${jobID}`, {
			headers,
		})
		.then(getData)
		.then((job) => {
			assert.equal(
				job.items.length,
				1,
				`There should be exactly one job with ID ${jobID}`,
			);
			return { success: true, job: job.items[0] } as const;
		})
		.catch((error) => {
			console.error(`Error getting job with ID ${jobID}`, error);
			return { success: false, error } as const;
		});

export const getJob = async (jobId: string) => {
	const response = await axios.get<VouchedJobResponse>(
		`${baseUrl}/api/jobs/${jobId}`,
		{
			headers,
		},
	);
	return response.data;
};

export const redactVouchedJob = async (jobId: string) =>
	axios
		.delete(`${baseUrl}/api/jobs/${jobId}`, {
			headers,
		})
		.then((res) => res.data);

// Use pageSize=1 so that the response is as small as possible
export const getJobs = async (page: number = 1, pageSize: number = 1) =>
	axios
		.get<{ total: number; items: VouchedJobResponse[] }>(
			`${baseUrl}/api/jobs?page=${page}&pageSize=${pageSize}`,
			{
				headers,
			},
		)
		.then((response) => response.data);

/**
 * Get the total number of Vouched jobs in our account
 */
async function getJobCount(_: Request, res: Response) {
	logWithTimestamp("vouched/job-count: Entered");

	try {
		const jobCount = (await getJobs()).total || 0;
		logWithTimestamp(`vouched/job-count: jobCount==${jobCount}`);

		const today = new Date().toISOString().slice(0, 10);

		// Asynchronously update jobCount in db.
		(async () => {
			const jobs: VouchedJobResponse[] = [];
			const pageSize = 100;
			for (let page = 1; page <= Math.ceil(jobCount / pageSize); page++) {
				jobs.push(...((await getJobs(page, pageSize)).items ?? []));
			}
			const jobsToday = jobs.filter(
				(job) => job.submitted?.slice(0, 10) === today,
			);

			const jobCountToday = jobsToday.length;

			// Increment jobCount in today's verification count doc. If doc doesn't exist,
			// create it, and set Vouched jobCount to today's job count.
			// findOneAndUpdate is used so that the operation is atomic.
			await DailyVerificationCount.findOneAndUpdate(
				{ date: today },
				{ "vouched.jobCount": jobCountToday },
				{ upsert: true },
			).exec();
		})();

		const verificationCountDoc = await DailyVerificationCount.findOne({
			date: today,
		}).exec();
		const jobCountToday = verificationCountDoc?.vouched?.jobCount || 0;

		// Send 2 emails after 5k verifications
		if (jobCountToday > 5000 && jobCountToday <= 5002) {
			for (const email of env.ADMIN_EMAILS) {
				const subject = "Vouched job count for the day exceeded 5000!!";
				const message = `Vouched job count for the day is ${jobCount}.`;
				await sendEmail(email, subject, message, "");
			}
		}

		return res.status(200).json({ total: jobCount, today: jobCountToday });
	} catch (err) {
		console.log(`${err}`);
		return res
			.status(500)
			.json({ error: "An error occurred while getting the job count" });
	}
}

export { getJobCount };
