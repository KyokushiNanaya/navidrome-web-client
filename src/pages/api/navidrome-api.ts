import type { NextApiRequest, NextApiResponse } from "next";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type ApiRequestBody = {
	body?: unknown;
	headers?: Record<string, string>;
	method?: HttpMethod;
	params?: Record<string, string | string[] | undefined>;
	path: string;
	serverUrl: string;
	token?: string;
};

type ApiResponseBody = {
	data?: unknown;
	error?: string;
	headers?: Record<string, string>;
	status: number;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const ALLOWED_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const isNonEmptyString = (value: unknown): value is string => {
	return typeof value === "string" && value.trim().length > 0;
};

const normalizeServerUrl = (serverUrl: string): string => {
	return serverUrl.replace(/\/+$/, "");
};

const parsePath = (fullPath: string): { params: URLSearchParams; path: string } => {
	const [rawPath, rawParams] = fullPath.split("?");
	const params = new URLSearchParams(rawParams ?? "");
	const normalizedParams = new URLSearchParams();

	params.forEach((value, key) => {
		if (value === "undefined" || value === "null") {
			return;
		}

		const indexedMatch = key.match(/^(.*)\[(\d+)\]$/);
		if (indexedMatch) {
			normalizedParams.append(indexedMatch[1], value);
			return;
		}

		normalizedParams.append(key, value);
	});

	return {
		params: normalizedParams,
		path: rawPath,
	};
};

const appendObjectParams = (
	current: URLSearchParams,
	params?: Record<string, string | string[] | undefined>,
): URLSearchParams => {
	if (!params) {
		return current;
	}

	const next = new URLSearchParams(current);

	Object.entries(params).forEach(([key, value]) => {
		if (typeof value === "undefined") {
			return;
		}

		if (Array.isArray(value)) {
			value.forEach((item) => {
				if (item !== "undefined" && item !== "null") {
					next.append(key, item);
				}
			});
			return;
		}

		if (value !== "undefined" && value !== "null") {
			next.append(key, value);
		}
	});

	return next;
};

const responseHeadersToObject = (headers: Headers): Record<string, string> => {
	const output: Record<string, string> = {};
	headers.forEach((value, key) => {
		output[key] = value;
	});
	return output;
};

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse<ApiResponseBody>,
) {
	if (req.method !== "POST") {
		res.setHeader("Allow", "POST");
		return res.status(405).json({ error: "Method Not Allowed", status: 405 });
	}

	const payload = req.body as Partial<ApiRequestBody>;
	const method = (payload.method ?? "GET") as HttpMethod;

	if (!ALLOWED_METHODS.includes(method)) {
		return res.status(400).json({ error: "Invalid HTTP method", status: 400 });
	}

	if (!isNonEmptyString(payload.serverUrl) || !isNonEmptyString(payload.path)) {
		return res.status(400).json({
			error: "serverUrl and path are required",
			status: 400,
		});
	}

	const serverBaseUrl = normalizeServerUrl(payload.serverUrl);
	const { path, params } = parsePath(payload.path);
	const mergedParams = appendObjectParams(params, payload.params);
	const upstreamUrl = new URL(`${serverBaseUrl}/${path.replace(/^\/+/, "")}`);
	upstreamUrl.search = mergedParams.toString();

	const requestHeaders = new Headers();
	requestHeaders.set("Content-Type", "application/json");

	if (payload.headers) {
		Object.entries(payload.headers).forEach(([key, value]) => {
			requestHeaders.set(key, value);
		});
	}

	if (payload.token && !requestHeaders.has("x-nd-authorization")) {
		requestHeaders.set("x-nd-authorization", `Bearer ${payload.token}`);
	}

	const abortController = new AbortController();
	const timeout = setTimeout(() => {
		abortController.abort();
	}, DEFAULT_TIMEOUT_MS);

	try {
		const upstreamResponse = await fetch(upstreamUrl, {
			body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(payload.body ?? {}),
			headers: requestHeaders,
			method,
			signal: abortController.signal,
		});

		const contentType = upstreamResponse.headers.get("content-type") ?? "";
		const data = contentType.includes("application/json")
			? await upstreamResponse.json()
			: await upstreamResponse.text();

		return res.status(upstreamResponse.status).json({
			data,
			headers: responseHeadersToObject(upstreamResponse.headers),
			status: upstreamResponse.status,
		});
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			return res.status(504).json({
				error: "Request to Navidrome timed out",
				status: 504,
			});
		}

		return res.status(502).json({
			error: "Failed to reach Navidrome server",
			status: 502,
		});
	} finally {
		clearTimeout(timeout);
	}
}