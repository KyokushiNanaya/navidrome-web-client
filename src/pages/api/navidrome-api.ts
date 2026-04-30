import type { NextApiRequest, NextApiResponse } from "next";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type PathParamValue = number | string;

type NavidromeControllerDefinition = {
	method: HttpMethod;
	path: string;
};

const NAVIDROME_CONTROLLERS = {
	addToPlaylist: {
		method: "POST",
		path: "playlist/:id/tracks",
	},
	authenticate: {
		method: "POST",
		path: "auth/login",
	},
	createPlaylist: {
		method: "POST",
		path: "playlist",
	},
	deleteArtistImage: {
		method: "DELETE",
		path: "artist/:id/image",
	},
	deleteInternetRadioStation: {
		method: "DELETE",
		path: "radio/:id",
	},
	deleteInternetRadioStationImage: {
		method: "DELETE",
		path: "radio/:id/image",
	},
	deletePlaylist: {
		method: "DELETE",
		path: "playlist/:id",
	},
	deletePlaylistImage: {
		method: "DELETE",
		path: "playlist/:id/image",
	},
	getAlbumArtistDetail: {
		method: "GET",
		path: "artist/:id",
	},
	getAlbumArtistList: {
		method: "GET",
		path: "artist",
	},
	getAlbumDetail: {
		method: "GET",
		path: "album/:id",
	},
	getAlbumList: {
		method: "GET",
		path: "album",
	},
	getGenreList: {
		method: "GET",
		path: "genre",
	},
	getPlaylistDetail: {
		method: "GET",
		path: "playlist/:id",
	},
	getPlaylistList: {
		method: "GET",
		path: "playlist",
	},
	getPlaylistSongList: {
		method: "GET",
		path: "playlist/:id/tracks",
	},
	getQueue: {
		method: "GET",
		path: "queue",
	},
	getRadioList: {
		method: "GET",
		path: "radio",
	},
	getSongDetail: {
		method: "GET",
		path: "song/:id",
	},
	getSongList: {
		method: "GET",
		path: "song",
	},
	getTagList: {
		method: "GET",
		path: "tag",
	},
	getUserList: {
		method: "GET",
		path: "user",
	},
	movePlaylistItem: {
		method: "PUT",
		path: "playlist/:playlistId/tracks/:trackNumber",
	},
	removeFromPlaylist: {
		method: "DELETE",
		path: "playlist/:id/tracks",
	},
	saveQueue: {
		method: "POST",
		path: "queue",
	},
	shareItem: {
		method: "POST",
		path: "share",
	},
	updateInternetRadioStation: {
		method: "PUT",
		path: "radio/:id",
	},
	updatePlaylist: {
		method: "PUT",
		path: "playlist/:id",
	},
	uploadArtistImage: {
		method: "POST",
		path: "artist/:id/image",
	},
	uploadInternetRadioStationImage: {
		method: "POST",
		path: "radio/:id/image",
	},
	uploadPlaylistImage: {
		method: "POST",
		path: "playlist/:id/image",
	},
} as const satisfies Record<string, NavidromeControllerDefinition>;

type NavidromeControllerName = keyof typeof NAVIDROME_CONTROLLERS;

type ApiRequestBody = {
	body?: unknown;
	controller?: NavidromeControllerName;
	headers?: Record<string, string>;
	method?: HttpMethod;
	params?: Record<string, string | string[] | undefined>;
	pathParams?: Record<string, PathParamValue | undefined>;
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
const CONTROLLER_NAMES = Object.keys(NAVIDROME_CONTROLLERS) as NavidromeControllerName[];

const isNonEmptyString = (value: unknown): value is string => {
	return typeof value === "string" && value.trim().length > 0;
};

const normalizeServerUrl = (serverUrl: string): string => {
	return serverUrl.replace(/\/+$/, "");
};

const resolveControllerPath = (
	templatePath: string,
	pathParams?: Record<string, PathParamValue | undefined>,
): string => {
	return templatePath.replace(/:([a-zA-Z0-9_]+)/g, (_match, key: string) => {
		const value = pathParams?.[key];
		if (typeof value === "undefined") {
			throw new Error(`Missing path parameter: ${key}`);
		}

		return encodeURIComponent(String(value));
	});
};

const resolveRequestPathAndMethod = (
	payload: Partial<ApiRequestBody>,
): { method: HttpMethod; path: string } => {
	if (payload.controller) {
		const controller = NAVIDROME_CONTROLLERS[payload.controller];
		if (!controller) {
			throw new Error(`Unknown controller: ${payload.controller}`);
		}

		return {
			method: controller.method,
			path: resolveControllerPath(controller.path, payload.pathParams),
		};
	}

	const method = (payload.method ?? "GET") as HttpMethod;
	if (!ALLOWED_METHODS.includes(method)) {
		throw new Error("Invalid HTTP method");
	}

	if (!isNonEmptyString(payload.path)) {
		throw new Error("path is required");
	}

	return {
		method,
		path: payload.path,
	};
};

const buildRequestBody = (
	method: HttpMethod,
	body: unknown,
	requestHeaders: Headers,
): BodyInit | undefined => {
	if (method === "GET" || method === "DELETE") {
		return undefined;
	}

	if (typeof body === "undefined") {
		return undefined;
	}

	if (typeof body === "string") {
		return body;
	}

	if (body instanceof URLSearchParams) {
		if (!requestHeaders.has("content-type")) {
			requestHeaders.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8");
		}
		return body;
	}

	if (!requestHeaders.has("content-type")) {
		requestHeaders.set("content-type", "application/json");
	}

	return JSON.stringify(body);
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

	if (!isNonEmptyString(payload.serverUrl)) {
		return res.status(400).json({
			error: "serverUrl is required",
			status: 400,
		});
	}

	let resolvedRequest: { method: HttpMethod; path: string };
	try {
		resolvedRequest = resolveRequestPathAndMethod(payload);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Invalid request payload";
		const errorMessage = message.startsWith("Unknown controller")
			? `${message}. Available controllers: ${CONTROLLER_NAMES.join(", ")}`
			: message;

		return res.status(400).json({
			error: errorMessage,
			status: 400,
		});
	}

	const serverBaseUrl = normalizeServerUrl(payload.serverUrl);
	const { path, params } = parsePath(resolvedRequest.path);
	const mergedParams = appendObjectParams(params, payload.params);
	const upstreamUrl = new URL(`${serverBaseUrl}/${path.replace(/^\/+/, "")}`);
	upstreamUrl.search = mergedParams.toString();

	const requestHeaders = new Headers();

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

	const requestBody = buildRequestBody(resolvedRequest.method, payload.body, requestHeaders);

	try {
		const upstreamResponse = await fetch(upstreamUrl, {
			body: requestBody,
			headers: requestHeaders,
			method: resolvedRequest.method,
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