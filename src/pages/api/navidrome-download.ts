import type { NextApiRequest, NextApiResponse } from "next";

type DownloadQuery = {
	credential?: string | string[];
	name?: string | string[];
	serverUrl?: string | string[];
	songId?: string | string[];
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

const sanitizeFileName = (value: string): string => {
	return value.replace(/[\\/:*?"<>|]/g, "_");
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		res.setHeader("Allow", "GET");
		return res.status(405).json({ error: "Method Not Allowed" });
	}

	const query = req.query as DownloadQuery;
	if (!isString(query.serverUrl) || !isString(query.songId) || !isString(query.credential)) {
		return res.status(400).json({
			error: "serverUrl, songId, and credential query params are required",
		});
	}

	const cleanServerUrl = normalizeServerUrl(query.serverUrl);
	const downloadUrl = `${cleanServerUrl}/rest/download.view?id=${encodeURIComponent(
		query.songId,
	)}&v=${API_VERSION}&c=${API_CLIENT}&${query.credential}`;

	const headers = new Headers();
	if (isString(query.token)) {
		headers.set("x-nd-authorization", `Bearer ${query.token}`);
	}

	try {
		const upstream = await fetch(downloadUrl, {
			headers,
			method: "GET",
		});

		if (!upstream.ok) {
			const fallbackText = await upstream.text();
			return res.status(upstream.status).json({
				error: fallbackText || "Failed to download song",
			});
		}

		const contentType = upstream.headers.get("content-type") || "application/octet-stream";
		const contentLength = upstream.headers.get("content-length");
		const originalDisposition = upstream.headers.get("content-disposition");

		res.setHeader("Content-Type", contentType);
		if (contentLength) {
			res.setHeader("Content-Length", contentLength);
		}

		if (originalDisposition) {
			res.setHeader("Content-Disposition", originalDisposition);
		} else {
			const fallbackName = isString(query.name) ? sanitizeFileName(query.name) : `song-${query.songId}`;
			res.setHeader(
				"Content-Disposition",
				`attachment; filename*=UTF-8''${encodeURIComponent(fallbackName)}.mp3`,
			);
		}

		const bytes = await upstream.arrayBuffer();
		return res.status(upstream.status).send(Buffer.from(bytes));
	} catch {
		return res.status(502).json({ error: "Failed to reach Navidrome download endpoint" });
	}
}
