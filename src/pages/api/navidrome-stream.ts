import type { NextApiRequest, NextApiResponse } from "next";

type StreamQuery = {
	credential?: string | string[];
	songId?: string | string[];
	serverUrl?: string | string[];
	token?: string | string[];
};

const STREAM_VERSION = "1.13.0";
const STREAM_CLIENT = "NavidromeWebClient";

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

	const query = req.query as StreamQuery;
	if (!isString(query.serverUrl) || !isString(query.songId) || !isString(query.credential)) {
		return res.status(400).json({
			error: "serverUrl, songId, and credential query params are required",
		});
	}

	const cleanServerUrl = normalizeServerUrl(query.serverUrl);
	const streamUrl = `${cleanServerUrl}/rest/stream.view?id=${encodeURIComponent(
		query.songId,
	)}&v=${STREAM_VERSION}&c=${STREAM_CLIENT}&${query.credential}`;

	const headers = new Headers();
	if (isString(query.token)) {
		headers.set("x-nd-authorization", `Bearer ${query.token}`);
	}

	if (isString(req.headers.range)) {
		headers.set("range", req.headers.range);
	}

	try {
		const upstream = await fetch(streamUrl, {
			headers,
			method: "GET",
		});

		if (!upstream.ok) {
			const fallbackText = await upstream.text();
			return res.status(upstream.status).json({
				error: fallbackText || "Failed to stream song",
			});
		}

		const contentType = upstream.headers.get("content-type");
		const contentLength = upstream.headers.get("content-length");
		const acceptRanges = upstream.headers.get("accept-ranges");
		const contentRange = upstream.headers.get("content-range");

		if (contentType) {
			res.setHeader("Content-Type", contentType);
		}
		if (contentLength) {
			res.setHeader("Content-Length", contentLength);
		}
		if (acceptRanges) {
			res.setHeader("Accept-Ranges", acceptRanges);
		}
		if (contentRange) {
			res.setHeader("Content-Range", contentRange);
		}

		const bytes = await upstream.arrayBuffer();
		return res.status(upstream.status).send(Buffer.from(bytes));
	} catch {
		return res.status(502).json({ error: "Failed to reach Navidrome stream endpoint" });
	}
}