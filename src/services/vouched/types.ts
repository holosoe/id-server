export interface GetVouchedJobResponse {
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
	items: VouchedJobResponse[];
}

export interface VouchedJobResponse {
	id: string;
	status: "completed" | "pending" | "failed";
	completed?: boolean;
	accountReviewed?: unknown;
	submitted: string;
	updatedAt: string;
	reviewedAt?: unknown;
	accountGroupSid?: unknown;
	reviewSuccess?: unknown;
	review?: unknown;
	request: {
		type: string;
		callbackURL?: unknown;
		requestInfo?: {
			ipaddress: string;
			useragent: string;
			referer?: string;
		};
		parameters?: {
			phone?: string;
			scannedBarcode?: boolean;
		};
		properties?: unknown;
	};
	surveyPoll?: unknown;
	surveyMessage?: unknown;
	surveyAt?: unknown;
	result: {
		id?: string;
		firstName?: string;
		lastName?: string;
		middleName?: string;
		dob?: string;
		address?: string;
		eyeColor?: string;
		height?: string;
		weight?: string;
		expireDate?: string;
		issueDate?: string;
		birthDate?: string;
		class?: string;
		endorsements?: string;
		motorcycle?: unknown;
		idFields: {
			name: string;
		}[];
		gender?: Gender;
		unverifiedIdAddress?: string[];
		barcodeData?: {
			firstName?: string;
			lastName?: string;
			middleName?: string;
			id?: string;
			expireDate?: string;
			birthDate?: string;
			issueDate?: string;
		};
		idType?: unknown;
		ipFraudCheck?: {
			ipFraud: boolean;
			count: number;
			jobIdList: string[];
		};
		clientOutput?: {
			theme: string;
			client: string;
			capture: {
				id: string;
				back_id?: string;
				face_match?: string;
			};
			includeBarcode: boolean;
		};
		geoLocation?: unknown;
		idAddress?: {
			unit?: string;
			streetNumber: string;
			street: string;
			city: string;
			state: string;
			country: string;
			postalCode: string;
			postalCodeSuffix?: string;
		};
		type?: string;
		hasPDF417Back?: boolean;
		country?: string;
		state?: string;
		version?: unknown;
		confidences?: {
			id: number;
			idQuality?: number;
			idExpired?: number;
			idGlareQuality?: number;
			idCrosscheckDarkweb?: unknown;
			idCrosscheckIdentity?: number;
			idCrosscheckActivity?: number;
			birthDateMatch?: unknown;
			nameMatch?: unknown;
			selfie?: number;
			selfieSunglasses?: number;
			selfieEyeglasses?: number;
			idMatch?: unknown;
			faceMatch?: number;
			barcode?: number;
			barcodeMatch?: number;
			idAml?: number;
		};
		success: boolean;
		successWithSuggestion?: boolean;
		warnings?: boolean;
		ipAddress?: {
			city?: string;
			country: string;
			state?: string;
			postalCode?: string;
			location: {
				latitude: number;
				longitude: number;
			};
			userType: string;
			isp: string;
			organization: string;
			isAnonymous: boolean;
			isAnonymousVpn: boolean;
			isAnonymousHosting: boolean;
			confidence: number;
			warnings?: string;
		};
		aml?: {
			data: {
				id: number;
				ref: string;
				dob?: string;
				matchStatus: string;
				riskLevel: string;
				submittedTerm: string;
				totalHits: number;
				updatedAt: string;
				totalMatches: number;
				hits: {
					aka?: unknown;
					politicalPositions?: unknown;
					countries?: unknown;
					matches?: unknown;
				};
			};
		};
		crosscheck?: {
			gender: GenderDistribution;
			darkWeb?: unknown;
			address?: {
				errors: unknown[];
				warnings: {
					type: string;
					message: string;
				}[];
				isMatch: boolean;
				isValid: boolean;
				name: string;
				ageRange: AgeRange;
				type: string;
				isForwarder: boolean;
				isCommercial: boolean;
			};
			email?: unknown;
			phone?: {
				errors: unknown[];
				warnings: unknown[];
				isMatch: boolean;
				isValid: boolean;
				name?: string;
				ageRange?: AgeRange;
				carrier: string;
				type: string;
				isPrepaid: boolean;
				isDisposable: boolean;
				isCommercial: boolean;
			};
			ageRange?: AgeRange;
			confidences: {
				identity: number;
				activity: number;
				darkweb?: unknown;
			};
		};
		aamva?: {
			enabled: boolean;
			hasErrors: boolean;
			hasWarnings: boolean;
			createdAt?: string;
			updatedAt?: string;
			status?: string;
			statusMessage: string;
			completedAt?: string;
			confidenceScore?: number;
		};
		hasPDF417Front?: unknown;
		captureBackId?: boolean;
		featuresEnabled?: {
			aamvaEnabled: boolean;
			aamvaBillable: boolean;
			crosscheckEnabled: boolean;
			crosscheckBillable: boolean;
			darkwebEnabled: boolean;
			darkwebBillable: boolean;
			idvBillable: boolean;
			physicalAddressBillable: boolean;
			ipAddressBillable: boolean;
			faceMatchEnabled: boolean;
			faceMatchBillable: boolean;
		};
	};
	errors: (
		| {
				type: string;
				message: string;
				warning: boolean;
				suggestion: string;
		  }
		| {
				type: string;
				message: string;
		  }
		| {
				type: string;
				message: string;
				warning?: boolean;
				suggestion?: string;
		  }
	)[];
	accountId?: string;
	secondaryPhotos?: unknown;
	signals?: {
		category: string;
		message: string;
		type: string;
		fields: string[][];
		property: string;
	}[];
}

interface AgeRange {
	to: number;
	from: number;
}

interface Gender {
	gender?: string;
	genderDistribution: GenderDistribution;
}

interface GenderDistribution {
	man?: number;
	woman?: number;
}
