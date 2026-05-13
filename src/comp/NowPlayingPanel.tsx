import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

import type { NavidromeSession } from "@/lib/navidrome-session";
import type { LyricsData, Song } from "@/lib/player-types";
import { buildCoverArtUrl, buildSubsonicUrl, formatDuration } from "@/lib/player-utils";

type NowPlayingPanelProps = {
	currentSong: Song | null;
	session: NavidromeSession | null;
};

export default function NowPlayingPanel({ currentSong, session }: NowPlayingPanelProps) {
	const [showLyrics, setShowLyrics] = useState(false);
	const [lyrics, setLyrics] = useState<LyricsData | null>(null);
	const [lyricsLoading, setLyricsLoading] = useState(false);

	const coverArtUrl = session && currentSong?.coverArtId
		? buildCoverArtUrl(session, currentSong.coverArtId)
		: "";

	const loadLyrics = useCallback(async () => {
		if (!session || !currentSong) {
			setLyrics(null);
			return;
		}

		setLyricsLoading(true);
		setLyrics(null);

		try {
			const url = buildSubsonicUrl(session, "getLyrics.view", {
				artist: currentSong.artist ?? "",
				title: currentSong.title,
			});

			const response = await fetch(url);
			if (!response.ok) {
				return;
			}

			const result = await response.json() as { data?: unknown };
			const data = result.data as Record<string, unknown> | null | undefined;
			if (!data) return;

			// Subsonic response: { "subsonic-response": { lyrics: { artist, title, value } } }
			const subsonicResponse = data["subsonic-response"] as Record<string, unknown> | undefined;
			const lyricsObj = subsonicResponse?.lyrics as Record<string, unknown> | undefined;

			if (lyricsObj) {
				setLyrics({
					artist: typeof lyricsObj.artist === "string" ? lyricsObj.artist : undefined,
					title: typeof lyricsObj.title === "string" ? lyricsObj.title : undefined,
					value: typeof lyricsObj.value === "string" ? lyricsObj.value : undefined,
				});
			}
		} catch {
			// Silently fail — lyrics are optional
		} finally {
			setLyricsLoading(false);
		}
	}, [session, currentSong]);

	// Load lyrics when song changes and lyrics panel is open
	useEffect(() => {
		setLyrics(null);
		if (showLyrics && currentSong) {
			void loadLyrics();
		}
	}, [currentSong?.id, showLyrics]); // eslint-disable-line react-hooks/exhaustive-deps

	const handleToggleLyrics = () => {
		const next = !showLyrics;
		setShowLyrics(next);
		if (next && currentSong && !lyrics) {
			void loadLyrics();
		}
	};

	return (
		<aside className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
			<h2 className="text-sm font-medium text-zinc-300">Now Playing</h2>

			{/* Cover art */}
			<div className="relative overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
				{coverArtUrl ? (
					<Image
						alt={currentSong?.title ?? "Cover art"}
						className="aspect-square w-full object-cover"
						height={420}
						sizes="(max-width: 768px) 100vw, 340px"
						src={coverArtUrl}
						width={420}
					/>
				) : (
					<div className="flex aspect-square w-full items-center justify-center text-xs text-zinc-500">
						No cover art
					</div>
				)}
			</div>

			{/* Song info */}
			<div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
				<p className="text-lg font-semibold leading-tight">{currentSong?.title ?? "No song selected"}</p>
				<p className="mt-1 text-sm text-zinc-400">{currentSong?.artist ?? "Unknown artist"}</p>
				<p className="text-xs text-zinc-500">{currentSong?.album ?? "Unknown album"}</p>
				<div className="mt-3 flex items-center justify-between">
					<p className="text-xs text-zinc-500">Duration: {formatDuration(currentSong?.duration)}</p>
					{currentSong ? (
						<button
							className={`rounded-md border px-2 py-1 text-xs transition ${
								showLyrics
									? "border-emerald-400/60 bg-emerald-500/15 text-emerald-300"
									: "border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
							}`}
							onClick={handleToggleLyrics}
							type="button"
						>
							Lyrics
						</button>
					) : null}
				</div>
			</div>

			{/* Lyrics panel */}
			{showLyrics ? (
				<div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
					<p className="mb-2 text-xs uppercase tracking-[0.08em] text-zinc-500">Lyrics</p>
					{lyricsLoading ? (
						<p className="text-xs text-zinc-500">Loading lyrics...</p>
					) : lyrics?.value ? (
						<pre className="max-h-64 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">
							{lyrics.value}
						</pre>
					) : (
						<p className="text-xs text-zinc-500">
							{currentSong ? "No lyrics available for this song." : "Select a song to view lyrics."}
						</p>
					)}
				</div>
			) : null}
		</aside>
	);
}
