export const NAVIDROME_SESSION_STORAGE_KEY = "navidrome-session";

export type NavidromeSession = {
	serverUrl: string;
	streamCredential: string;
	token: string;
	username: string;
};

export type NavidromeAuthenticateResponse = {
	id?: string;
	isAdmin?: boolean;
	subsonicSalt?: string;
	subsonicToken?: string;
	token?: string;
	username?: string;
};

export const normalizeServerUrl = (value: string): string => {
	return value.replace(/\/+$/, "");
};

export const buildSubsonicCredential = (
	username: string,
	salt: string,
	token: string,
): string => {
	const params = new URLSearchParams({
		s: salt,
		t: token,
		u: username,
	});

	return params.toString();
};

export const isValidAuthenticateResponse = (
	value: unknown,
): value is Required<Pick<NavidromeAuthenticateResponse, "subsonicSalt" | "subsonicToken" | "token">> &
	NavidromeAuthenticateResponse => {
	if (!value || typeof value !== "object") {
		return false;
	}

	const maybeAuth = value as NavidromeAuthenticateResponse;

	return Boolean(maybeAuth.subsonicSalt && maybeAuth.subsonicToken && maybeAuth.token);
};