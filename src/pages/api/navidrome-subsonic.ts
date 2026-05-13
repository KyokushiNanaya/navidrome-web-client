import type { NextApiRequest, NextApiResponse } from "next";

type SubsonicQuery = {
	credential?: string | string[];
	endpoint?: string | string[];
	params?: string | string[];
	serverUrl?: string | string[];
	token?: string | string[];
};

const SUBSONIC_VERSION = "1.13.0";
const SUBSONIC_CLIENT = "NavidromeWebClient";

const isString = (value: string | string[] | undefined): value is string => {
	return typeof value === "string" && value.trim().length > 0;
};

const normalizeServerUrl = (value: string): string => {
	return value.replace(/\/+$/, "");
};

/**
 * Generic Subsonic REST API proxy.
 * Used for features not available in the Navidrome REST API:
 *   - star / unstar (star.view / unstar.view)
 *   - lyrics (getLyrics.view)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		res.setHeader("Allow", "GET");
		return res.status(405).json({ error: "Method Not Allowed" });
	}

	const query = req.query as SubsonicQuery;

	if (!isString(query.serverUrl) || !isString(query.endpoint) || !isString(query.credential)) {
		return res.status(400).json({
			error: "serverUrl, endpoint, and credential query params are required",
		});
	}

	const cleanServerUrl = normalizeServerUrl(query.serverUrl);

	const upstreamUrl = new URL(`${cleanServerUrl}/rest/${query.endpoint}`);
	upstreamUrl.searchParams.set("v", SUBSONIC_VERSION);
	upstreamUrl.searchParams.set("c", SUBSONIC_CLIENT);
	upstreamUrl.searchParams.set("f", "json");

	// Parse the credential string (u=...&t=...&s=...) and add to URL
	const credParams = new URLSearchParams(query.credential);
	credParams.forEach((value, key) => {
		upstreamUrl.searchParams.set(key, value);
	});

	// Add any additional params
	if (isString(query.params)) {
		const extraParams = new URLSearchParams(query.params);
		extraParams.forEach((value, key) => {
			upstreamUrl.searchParams.set(key, value);
		});
	}

	const headers = new Headers();
	if (isString(query.token)) {
		headers.set("x-nd-authorization", `Bearer ${query.token}`);
	}

	try {
		const upstream = await fetch(upstreamUrl.toString(), {
			headers,
			method: "GET",
		});

		const contentType = upstream.headers.get("content-type") ?? "";

		if (contentType.includes("application/json")) {
			const data = await upstream.json() as unknown;
			return res.status(upstream.status).json({ data, status: upstream.status });
		}

		const text = await upstream.text();
		return res.status(upstream.status).json({ data: text, status: upstream.status });
	} catch {
		return res.status(502).json({ error: "Failed to reach Navidrome subsonic endpoint" });
	}
}
