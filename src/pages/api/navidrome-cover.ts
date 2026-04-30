import type { NextApiRequest, NextApiResponse } from "next";

type CoverQuery = {
	coverArtId?: string | string[];
	credential?: string | string[];
	serverUrl?: string | string[];
	token?: string | string[];
};

const API_VERSION = "1.13.0";
const API_CLIENT = "NavidromeWebClient";

const isString = (value: string | string[] | undefined): value is string => {
	return typeof value === "string" && value.trim().length > 0;
};

const normalizeServerUrl = (value: string): string => {
	return value.replace(/\/+$/, "");
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		res.setHeader("Allow", "GET");
		return res.status(405).json({ error: "Method Not Allowed" });
	}

	const query = req.query as CoverQuery;
	if (!isString(query.serverUrl) || !isString(query.coverArtId) || !isString(query.credential)) {
		return res.status(400).json({
			error: "serverUrl, coverArtId, and credential query params are required",
		});
	}

	const cleanServerUrl = normalizeServerUrl(query.serverUrl);
	const coverUrl = `${cleanServerUrl}/rest/getCoverArt.view?id=${encodeURIComponent(
		query.coverArtId,
	)}&v=${API_VERSION}&c=${API_CLIENT}&${query.credential}`;

	const headers = new Headers();
	if (isString(query.token)) {
		headers.set("x-nd-authorization", `Bearer ${query.token}`);
	}

	try {
		const upstream = await fetch(coverUrl, {
			headers,
			method: "GET",
		});

		if (!upstream.ok) {
			const fallbackText = await upstream.text();
			return res.status(upstream.status).json({
				error: fallbackText || "Failed to load cover art",
			});
		}

		const contentType = upstream.headers.get("content-type") || "image/jpeg";
		const cacheControl = upstream.headers.get("cache-control") || "public, max-age=3600";
		res.setHeader("Content-Type", contentType);
		res.setHeader("Cache-Control", cacheControl);

		const bytes = await upstream.arrayBuffer();
		return res.status(upstream.status).send(Buffer.from(bytes));
	} catch {
		return res.status(502).json({ error: "Failed to reach Navidrome cover endpoint" });
	}
}
