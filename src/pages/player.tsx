import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/router";

import PlayBar from "@/comp/playbar";
import { NAVIDROME_SESSION_STORAGE_KEY, NavidromeSession } from "@/lib/navidrome-session";

type ApiRouteResult = {
	data?: unknown;
	error?: string;
	status: number;
};

type Song = {
	album?: string;
	artist?: string;
	coverArtId?: string;
	duration?: number;
	id: string;
	title: string;
};

const PLAYER_VOLUME_STORAGE_KEY = "navidrome-player-volume";

const asSongList = (value: unknown): Song[] => {
	if (Array.isArray(value)) {
		return value
			.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
			.map((item) => ({
				album: typeof item.album === "string" ? item.album : undefined,
				artist: typeof item.artist === "string" ? item.artist : undefined,
				coverArtId:
					typeof item.coverArtId === "string"
						? item.coverArtId
						: typeof item.albumId === "string"
							? item.albumId
							: typeof item.id === "string"
								? item.id
								: undefined,
				duration: typeof item.duration === "number" ? item.duration : undefined,
				id: String(item.id ?? ""),
				title: typeof item.title === "string" ? item.title : "Untitled",
			}))
			.filter((song) => song.id.length > 0);
	}

	if (value && typeof value === "object") {
		const maybeContainer = value as { data?: unknown; items?: unknown };
		return asSongList(maybeContainer.items ?? maybeContainer.data);
	}

	return [];
};

const formatDuration = (seconds?: number): string => {
	if (!seconds || seconds <= 0) {
		return "--:--";
	}

	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = Math.floor(seconds % 60);

	return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

const buildStreamUrl = (session: NavidromeSession, songId: string): string => {
	const query = new URLSearchParams({
		credential: session.streamCredential,
		songId,
		serverUrl: session.serverUrl,
		token: session.token,
	});

	return `/api/navidrome-stream?${query.toString()}`;
};

const buildCoverArtUrl = (session: NavidromeSession, coverArtId: string): string => {
	const query = new URLSearchParams({
		credential: session.streamCredential,
		coverArtId,
		serverUrl: session.serverUrl,
		token: session.token,
	});

	return `/api/navidrome-cover?${query.toString()}`;
};

const buildDownloadUrl = (session: NavidromeSession, song: Song): string => {
	const query = new URLSearchParams({
		credential: session.streamCredential,
		name: song.title,
		serverUrl: session.serverUrl,
		songId: song.id,
		token: session.token,
	});

	return `/api/navidrome-download?${query.toString()}`;
};

export default function PlayerPage() {
	const router = useRouter();
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const [session, setSession] = useState<NavidromeSession | null>(null);
	const [songs, setSongs] = useState<Song[]>([]);
	const [currentSongId, setCurrentSongId] = useState<string | null>(null);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [isPlaying, setIsPlaying] = useState(false);
	const [isRandom, setIsRandom] = useState(false);
	const [volume, setVolume] = useState(0.8);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const raw = window.localStorage.getItem(NAVIDROME_SESSION_STORAGE_KEY);
		if (!raw) {
			void router.replace("/");
			return;
		}

		try {
			const parsed = JSON.parse(raw) as NavidromeSession;
			if (!parsed.serverUrl || !parsed.streamCredential || !parsed.token || !parsed.username) {
				window.localStorage.removeItem(NAVIDROME_SESSION_STORAGE_KEY);
				void router.replace("/");
				return;
			}

			setSession(parsed);
		} catch {
			window.localStorage.removeItem(NAVIDROME_SESSION_STORAGE_KEY);
			void router.replace("/");
		}
	}, [router]);

	useEffect(() => {
		if (!session) {
			return;
		}

		const loadSongs = async () => {
			setLoading(true);
			setError(null);

			try {
				const response = await fetch("/api/navidrome-api", {
					body: JSON.stringify({
						controller: "getSongList",
						params: {
							_end: "100",
							_order: "ASC",
							_sort: "title",
							_start: "0",
						},
						path: "song",
						serverUrl: `${session.serverUrl}/api`,
						token: session.token,
					}),
					headers: {
						"Content-Type": "application/json",
					},
					method: "POST",
				});

				const body = (await response.json()) as ApiRouteResult;
				if (!response.ok || body.error) {
					setError(body.error ?? `Unable to load songs (${body.status})`);
					setSongs([]);
					return;
				}

				const nextSongs = asSongList(body.data);
				setSongs(nextSongs);
				if (nextSongs.length > 0) {
					setCurrentSongId((current) => current ?? nextSongs[0].id);
				}
			} catch {
				setError("Unable to load songs from Navidrome");
				setSongs([]);
			} finally {
				setLoading(false);
			}
		};

		void loadSongs();
	}, [session]);

	const currentSong = useMemo(() => {
		return songs.find((song) => song.id === currentSongId) ?? null;
	}, [currentSongId, songs]);

	const streamUrl = useMemo(() => {
		if (!session || !currentSong) {
			return "";
		}

		return buildStreamUrl(session, currentSong.id);
	}, [session, currentSong]);

	const coverArtUrl = useMemo(() => {
		if (!session || !currentSong?.coverArtId) {
			return "";
		}

		return buildCoverArtUrl(session, currentSong.coverArtId);
	}, [session, currentSong]);

	const getRandomSong = (): null | Song => {
		if (songs.length === 0) {
			return null;
		}

		if (songs.length === 1) {
			return songs[0] ?? null;
		}

		const candidateSongs = songs.filter((song) => song.id !== currentSongId);
		if (candidateSongs.length === 0) {
			return null;
		}

		const index = Math.floor(Math.random() * candidateSongs.length);
		return candidateSongs[index] ?? null;
	};

	const handleLogout = () => {
		window.localStorage.removeItem(NAVIDROME_SESSION_STORAGE_KEY);
		void router.push("/");
	};

	const handleSongEnded = () => {
		if (!currentSong) {
			setIsPlaying(false);
			return;
		}

		if (isRandom) {
			const randomSong = getRandomSong();
			if (randomSong) {
				setCurrentSongId(randomSong.id);
				setIsPlaying(true);
				return;
			}
			setIsPlaying(false);
			return;
		}

		const currentIndex = songs.findIndex((song) => song.id === currentSong.id);
		if (currentIndex === -1) {
			setIsPlaying(false);
			return;
		}

		const nextSong = songs[currentIndex + 1];
		if (nextSong) {
			setCurrentSongId(nextSong.id);
			setIsPlaying(true);
		} else {
			setIsPlaying(false);
		}
	};

	const handlePrevious = () => {
		if (!currentSong) {
			return;
		}

		const currentIndex = songs.findIndex((song) => song.id === currentSong.id);
		if (currentIndex <= 0) {
			return;
		}

		const previousSong = songs[currentIndex - 1];
		if (previousSong) {
			setCurrentSongId(previousSong.id);
		}
	};

	const handleNext = () => {
		if (!currentSong) {
			return;
		}

		if (isRandom) {
			const randomSong = getRandomSong();
			if (randomSong) {
				setCurrentSongId(randomSong.id);
				setIsPlaying(true);
			}
			return;
		}

		const currentIndex = songs.findIndex((song) => song.id === currentSong.id);
		if (currentIndex === -1 || currentIndex >= songs.length - 1) {
			return;
		}

		const nextSong = songs[currentIndex + 1];
		if (nextSong) {
			setCurrentSongId(nextSong.id);
		}
	};

	const handlePlayPause = () => {
		const audio = audioRef.current;
		if (!audio) {
			return;
		}

		if (audio.paused) {
			void audio.play();
		} else {
			audio.pause();
		}
	};

	const handleSeek = (value: number) => {
		const audio = audioRef.current;
		if (!audio) {
			return;
		}

		audio.currentTime = value;
		setCurrentTime(value);
	};

	const handleToggleRandom = () => {
		setIsRandom((current) => !current);
	};

	const handleVolumeChange = (value: number) => {
		const nextVolume = Math.max(0, Math.min(1, value));
		setVolume(nextVolume);
	};

	const handleDownload = () => {
		if (!session || !currentSong) {
			return;
		}

		const link = document.createElement("a");
		link.href = buildDownloadUrl(session, currentSong);
		link.download = `${currentSong.title}.mp3`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	};

	useEffect(() => {
		const storedVolume = window.localStorage.getItem(PLAYER_VOLUME_STORAGE_KEY);
		if (!storedVolume) {
			return;
		}

		const parsedVolume = Number(storedVolume);
		if (!Number.isFinite(parsedVolume)) {
			return;
		}

		setVolume(Math.max(0, Math.min(1, parsedVolume)));
	}, []);

	useEffect(() => {
		window.localStorage.setItem(PLAYER_VOLUME_STORAGE_KEY, String(volume));
		const audio = audioRef.current;
		if (!audio) {
			return;
		}

		audio.volume = volume;
	}, [volume]);

	useEffect(() => {
		setCurrentTime(0);
		setDuration(0);
	}, [streamUrl]);

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio || !streamUrl) {
			setIsPlaying(false);
			return;
		}

		if (isPlaying) {
			void audio.play().catch(() => {
				setIsPlaying(false);
			});
		}
	}, [isPlaying, streamUrl]);

	const currentIndex = currentSong ? songs.findIndex((song) => song.id === currentSong.id) : -1;
	const canGoPrevious = currentIndex > 0;
	const canGoNext = isRandom ? songs.length > 1 : currentIndex >= 0 && currentIndex < songs.length - 1;

	const handleAudioTimeUpdate = () => {
		const audio = audioRef.current;
		if (!audio) {
			return;
		}

		setCurrentTime(audio.currentTime || 0);
	};

	const handleAudioLoadedMetadata = () => {
		const audio = audioRef.current;
		if (!audio) {
			return;
		}

		setDuration(audio.duration || 0);
	};

	const handleAudioPlay = () => {
		setIsPlaying(true);
	};

	const handleAudioPause = () => {
		setIsPlaying(false);
	};

	const handleSelectSong = (songId: string) => {
		setCurrentSongId(songId);
		setIsPlaying(true);
	};

	return (
		<div className="min-h-screen bg-zinc-950 px-4 py-8 pb-32 text-zinc-100">
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
				<header className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/80 px-5 py-4">
					<div>
						<p className="text-xs uppercase tracking-[0.15em] text-zinc-400">Navidrome</p>
						<h1 className="text-2xl font-semibold">Simple Music Player</h1>
						<p className="text-sm text-zinc-400">{session ? `Signed in as ${session.username}` : "Loading session..."}</p>
					</div>
					<button
						className="rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800"
						onClick={handleLogout}
						type="button"
					>
						Log out
					</button>
				</header>

				<section className="grid gap-6 md:grid-cols-[340px_1fr]">
					<aside className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
						<h2 className="mb-3 text-sm font-medium text-zinc-300">Now Playing</h2>
						<div className="relative mb-3 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
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
								<div className="flex aspect-square w-full items-center justify-center text-xs text-zinc-500">No cover art</div>
							)}
						</div>
						<div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
							<p className="text-lg font-semibold">{currentSong?.title ?? "No song selected"}</p>
							<p className="mt-1 text-sm text-zinc-400">{currentSong?.artist ?? "Unknown artist"}</p>
							<p className="text-xs text-zinc-500">{currentSong?.album ?? "Unknown album"}</p>
							<p className="mt-3 text-xs text-zinc-500">Duration: {formatDuration(currentSong?.duration)}</p>
						</div>

						<audio
							className="hidden"
							onEnded={handleSongEnded}
							onLoadedMetadata={handleAudioLoadedMetadata}
							onPause={handleAudioPause}
							onPlay={handleAudioPlay}
							onTimeUpdate={handleAudioTimeUpdate}
							ref={audioRef}
							src={streamUrl}
						/>
					</aside>

					<main className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
						<div className="mb-3 flex items-center justify-between">
							<h2 className="text-sm font-medium text-zinc-300">Library Songs</h2>
							<p className="text-xs text-zinc-500">{songs.length} tracks</p>
						</div>

						{loading ? <p className="text-sm text-zinc-400">Loading songs...</p> : null}
						{error ? <p className="text-sm text-red-300">{error}</p> : null}

						<ul className="max-h-[520px] space-y-2 overflow-auto pr-1">
							{songs.map((song) => {
								const isActive = song.id === currentSongId;

								return (
									<li key={song.id}>
										<button
											className={`w-full rounded-lg border px-3 py-2 text-left transition ${
												isActive
													? "border-emerald-400/60 bg-emerald-500/10"
													: "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
											}`}
											onClick={() => handleSelectSong(song.id)}
											type="button"
										>
											<p className="font-medium">{song.title}</p>
											<p className="text-xs text-zinc-400">{song.artist ?? "Unknown artist"}</p>
										</button>
									</li>
								);
							})}
						</ul>
					</main>
				</section>
			</div>

			<PlayBar
				canGoNext={canGoNext}
				canGoPrevious={canGoPrevious}
				canShuffle={songs.length > 1}
				coverArtUrl={coverArtUrl}
				currentTime={currentTime}
				duration={duration}
				isPlaying={isPlaying}
				isRandom={isRandom}
				onDownload={handleDownload}
				onNext={handleNext}
				onPlayPause={handlePlayPause}
				onPrevious={handlePrevious}
				onSeek={handleSeek}
				onToggleRandom={handleToggleRandom}
				onVolumeChange={handleVolumeChange}
				songAlbum={currentSong?.album}
				songArtist={currentSong?.artist}
				songTitle={currentSong?.title}
				volume={volume}
			/>
		</div>
	);
}