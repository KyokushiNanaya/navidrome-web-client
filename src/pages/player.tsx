import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";

import PlayBar from "@/comp/playbar";
import NowPlayingPanel from "@/comp/NowPlayingPanel";
import DiscoveryPanel from "@/comp/DiscoveryPanel";
import QueuePanel from "@/comp/QueuePanel";

import { NAVIDROME_SESSION_STORAGE_KEY, NavidromeSession } from "@/lib/navidrome-session";
import type {
	ActionNotice,
	ApiRouteResult,
	DiscoveryDrilldown,
	DiscoveryItem,
	DiscoverySortField,
	DiscoveryView,
	DrilldownDetail,
	Song,
} from "@/lib/player-types";
import { DISCOVERY_VIEWS } from "@/lib/player-types";
import {
	asSongList,
	asDiscoveryItems,
	asRelatedAlbumItems,
	buildDownloadUrl,
	buildStreamUrl,
	buildCoverArtUrl,
	buildSubsonicUrl,
	cycleRepeatMode,
	DISCOVERY_PAGE_SIZE,
	DISCOVERY_QUERY_CONFIG,
	DISCOVERY_SORT_OPTIONS,
	getTotalCountFromHeaders,
	isEditableTarget,
	PLAYER_VOLUME_STORAGE_KEY,
	sortDiscoveryItems,
	toOptionalNumber,
} from "@/lib/player-utils";

type RepeatMode = "all" | "off" | "one";

type QueueResponse = {
	current?: number;
	items?: unknown;
	position?: number;
};

export default function PlayerPage() {
	const router = useRouter();
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const queuePersistTimerRef = useRef<null | ReturnType<typeof setTimeout>>(null);
	const hasLoadedQueueRef = useRef(false);

	// Session
	const [session, setSession] = useState<NavidromeSession | null>(null);

	// Playback state
	const [songs, setSongs] = useState<Song[]>([]);
	const [currentSongId, setCurrentSongId] = useState<string | null>(null);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [isPlaying, setIsPlaying] = useState(false);
	const [isRandom, setIsRandom] = useState(false);
	const [pendingSeekSeconds, setPendingSeekSeconds] = useState<null | number>(null);
	const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
	const [volume, setVolume] = useState(0.8);

	// App loading
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// UI state
	const [showQueue, setShowQueue] = useState(false);

	// Discovery state
	const [activeView, setActiveView] = useState<DiscoveryView>("Songs");
	const [discoveryDrilldown, setDiscoveryDrilldown] = useState<DiscoveryDrilldown | null>(null);
	const [drilldownDetail, setDrilldownDetail] = useState<DrilldownDetail | null>(null);
	const [drilldownDetailLoading, setDrilldownDetailLoading] = useState(false);
	const [artistRelatedAlbums, setArtistRelatedAlbums] = useState<DiscoveryItem[]>([]);
	const [discoveryItems, setDiscoveryItems] = useState<DiscoveryItem[]>([]);
	const [discoveryLoading, setDiscoveryLoading] = useState(false);
	const [discoverySearch, setDiscoverySearch] = useState("");
	const [discoverySearchDebounced, setDiscoverySearchDebounced] = useState("");
	const [pendingSongsSearchFromTag, setPendingSongsSearchFromTag] = useState<null | string>(null);
	const [discoverySortField, setDiscoverySortField] = useState<DiscoverySortField>("title");
	const [discoverySortOrder, setDiscoverySortOrder] = useState<"ASC" | "DESC">("ASC");
	// serverSortKey overrides the default sortKey for the _sort param (e.g. "play_date", "play_count")
	const [discoverySortServerKey, setDiscoverySortServerKey] = useState<string | undefined>(undefined);
	const [discoveryTotal, setDiscoveryTotal] = useState(0);
	const [discoveryPage, setDiscoveryPage] = useState(0);
	const [discoveryRefreshVersion, setDiscoveryRefreshVersion] = useState(0);
	const [discoveryError, setDiscoveryError] = useState<string | null>(null);

	// Playlist action state
	const [playlistActionPending, setPlaylistActionPending] = useState(false);
	const [playlistActionNotice, setPlaylistActionNotice] = useState<ActionNotice | null>(null);

	// ─── API helper ──────────────────────────────────────────────────────────────

	const callNavidromeApi = useCallback(async (payload: Record<string, unknown>): Promise<ApiRouteResult> => {
		const response = await fetch("/api/navidrome-api", {
			body: JSON.stringify(payload),
			headers: { "Content-Type": "application/json" },
			method: "POST",
		});

		const rawText = await response.text();
		let body: ApiRouteResult = { status: response.status };

		if (rawText.trim().length > 0) {
			try {
				const parsed = JSON.parse(rawText) as Partial<ApiRouteResult>;
				body = {
					data: parsed.data,
					error: parsed.error,
					headers: parsed.headers,
					status: typeof parsed.status === "number" ? parsed.status : response.status,
				};
			} catch {
				body = {
					data: response.ok ? rawText : undefined,
					error: response.ok ? undefined : rawText,
					status: response.status,
				};
			}
		}

		if (!response.ok && !body.error) {
			body.error = `Request failed with status ${response.status}`;
		}

		return body;
	}, []);

	// ─── Search debounce ─────────────────────────────────────────────────────────

	useEffect(() => {
		const timer = setTimeout(() => {
			setDiscoverySearchDebounced(discoverySearch.trim());
		}, 250);
		return () => clearTimeout(timer);
	}, [discoverySearch]);

	// ─── Reset page on view/search/sort changes ───────────────────────────────────

	useEffect(() => {
		setDiscoveryPage(0);
	}, [activeView, discoverySearchDebounced, discoverySortOrder]);

	useEffect(() => {
		setPlaylistActionNotice(null);
	}, [activeView, discoveryDrilldown]);

	useEffect(() => {
		setDiscoveryDrilldown(null);
		setDrilldownDetail(null);
		setDrilldownDetailLoading(false);
		setArtistRelatedAlbums([]);
		setDiscoverySearch("");
		setDiscoverySearchDebounced("");
		setDiscoverySortServerKey(undefined);
		const defaultSortField = DISCOVERY_SORT_OPTIONS[activeView][0]?.value ?? "title";
		setDiscoverySortField(defaultSortField);
	}, [activeView]);

	useEffect(() => {
		setDiscoveryPage(0);
		if (discoveryDrilldown) {
			setDiscoverySortField("title");
		}
	}, [discoveryDrilldown]);

	useEffect(() => {
		if (activeView !== "Songs" || !pendingSongsSearchFromTag) return;
		setDiscoverySearch(pendingSongsSearchFromTag);
		setDiscoverySearchDebounced(pendingSongsSearchFromTag);
		setPendingSongsSearchFromTag(null);
	}, [activeView, pendingSongsSearchFromTag]);

	// ─── Load drilldown detail ────────────────────────────────────────────────────

	useEffect(() => {
		if (!discoveryDrilldown) {
			setDrilldownDetail(null);
			setDrilldownDetailLoading(false);
			setArtistRelatedAlbums([]);
			return;
		}

		setArtistRelatedAlbums([]);
		setDrilldownDetail({
			meta: discoveryDrilldown.meta,
			subtitle: discoveryDrilldown.subtitle,
			title: discoveryDrilldown.title,
		});

		const drilldownId = discoveryDrilldown.pathParams?.id;
		if (!session || !drilldownId) {
			setDrilldownDetailLoading(false);
			return;
		}

		const detailControllerMap: Partial<Record<DiscoveryView, { controller: string; path: string }>> = {
			Albums: { controller: "getAlbumDetail", path: "album/:id" },
			Artists: { controller: "getAlbumArtistDetail", path: "artist/:id" },
			Playlists: { controller: "getPlaylistDetail", path: "playlist/:id" },
		};

		const detailConfig = detailControllerMap[discoveryDrilldown.sourceView];
		if (!detailConfig) {
			setDrilldownDetailLoading(false);
			return;
		}

		let cancelled = false;

		const loadDrilldownDetail = async () => {
			setDrilldownDetailLoading(true);
			try {
				const body = await callNavidromeApi({
					controller: detailConfig.controller,
					path: detailConfig.path,
					pathParams: { id: drilldownId },
					serverUrl: `${session.serverUrl}/api`,
					token: session.token,
				});

				if (cancelled || body.error || body.status !== 200 || !body.data || typeof body.data !== "object") {
					return;
				}

				const detail = body.data as Record<string, unknown>;
				const nextDetail: DrilldownDetail = {
					meta: discoveryDrilldown.meta,
					subtitle: discoveryDrilldown.subtitle,
					title: discoveryDrilldown.title,
				};

				if (discoveryDrilldown.sourceView === "Albums") {
					nextDetail.title = typeof detail.name === "string" ? detail.name : nextDetail.title;
					nextDetail.subtitle = typeof detail.artist === "string" ? detail.artist : nextDetail.subtitle;
					const songCount = toOptionalNumber(detail.songCount);
					const year = toOptionalNumber(detail.maxYear ?? detail.minYear ?? detail.year);
					const metaParts = [
						songCount ? `${songCount} songs` : undefined,
						year ? String(year) : undefined,
					].filter((p): p is string => Boolean(p));
					nextDetail.meta = metaParts.length > 0 ? metaParts.join(" | ") : nextDetail.meta;
					nextDetail.description = typeof detail.comment === "string" ? detail.comment : undefined;
				}

				if (discoveryDrilldown.sourceView === "Artists") {
					nextDetail.title = typeof detail.name === "string" ? detail.name : nextDetail.title;
					const songCount = toOptionalNumber(detail.songCount);
					const albumCount = toOptionalNumber(detail.albumCount);
					const metaParts = [
						albumCount ? `${albumCount} albums` : undefined,
						songCount ? `${songCount} songs` : undefined,
					].filter((p): p is string => Boolean(p));
					nextDetail.meta = metaParts.length > 0 ? metaParts.join(" | ") : nextDetail.meta;
					nextDetail.description = typeof detail.biography === "string" ? detail.biography : undefined;
					const relatedAlbums =
						asRelatedAlbumItems(detail.albums).length > 0
							? asRelatedAlbumItems(detail.albums)
							: asRelatedAlbumItems(detail.album);
					setArtistRelatedAlbums(relatedAlbums);
				}

				if (discoveryDrilldown.sourceView === "Playlists") {
					nextDetail.title = typeof detail.name === "string" ? detail.name : nextDetail.title;
					nextDetail.subtitle = typeof detail.ownerName === "string" ? detail.ownerName : nextDetail.subtitle;
					const songCount = toOptionalNumber(detail.songCount);
					const durationSeconds = toOptionalNumber(detail.duration);
					const durationMinutes =
						durationSeconds && durationSeconds > 0 ? Math.max(1, Math.round(durationSeconds / 60)) : undefined;
					const metaParts = [
						songCount ? `${songCount} songs` : undefined,
						durationMinutes ? `${durationMinutes} min` : undefined,
					].filter((p): p is string => Boolean(p));
					nextDetail.meta = metaParts.length > 0 ? metaParts.join(" | ") : nextDetail.meta;
					nextDetail.description = typeof detail.comment === "string" ? detail.comment : undefined;
				}

				setDrilldownDetail(nextDetail);
			} finally {
				if (!cancelled) setDrilldownDetailLoading(false);
			}
		};

		void loadDrilldownDetail();
		return () => { cancelled = true; };
	}, [callNavidromeApi, discoveryDrilldown, session]);

	// ─── Session init ─────────────────────────────────────────────────────────────

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

	// ─── Load initial songs ───────────────────────────────────────────────────────

	useEffect(() => {
		if (!session) return;

		const loadSongs = async () => {
			setLoading(true);
			setError(null);
			hasLoadedQueueRef.current = false;

			try {
				const body = await callNavidromeApi({
					controller: "getSongList",
					params: { _end: "100", _order: "ASC", _sort: "title", _start: "0" },
					path: "song",
					serverUrl: `${session.serverUrl}/api`,
					token: session.token,
				});

				if (body.error || body.status !== 200) {
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
	}, [callNavidromeApi, session]);

	// ─── Load discovery items ─────────────────────────────────────────────────────

	useEffect(() => {
		if (!session) return;

		const loadDiscoveryItems = async () => {
			setDiscoveryLoading(true);
			setDiscoveryError(null);

			const start = discoveryPage * DISCOVERY_PAGE_SIZE;
			const end = start + DISCOVERY_PAGE_SIZE;
			const baseConfig = DISCOVERY_QUERY_CONFIG[activeView];
			const effectiveConfig = discoveryDrilldown
				? {
					controller: discoveryDrilldown.controller,
					path: discoveryDrilldown.path,
					searchKey: "title",
					sortKey: DISCOVERY_QUERY_CONFIG.Songs.sortKey,
				}
				: baseConfig;

			const params: Record<string, string> = {
				_end: String(end),
				_order: discoverySortOrder,
				_sort: discoverySortServerKey ?? effectiveConfig.sortKey,
				_start: String(start),
			};

			if (effectiveConfig.searchKey && discoverySearchDebounced.length > 0) {
				params[effectiveConfig.searchKey] = discoverySearchDebounced;
			}

			if (discoveryDrilldown?.sourceView === "Albums") params.album_id = discoveryDrilldown.pathParams?.id ?? "";
			if (discoveryDrilldown?.sourceView === "Artists") params.artist_id = discoveryDrilldown.pathParams?.id ?? "";
			if (discoveryDrilldown?.sourceView === "Genres") params.genre_id = discoveryDrilldown.pathParams?.id ?? "";

			try {
				const body = await callNavidromeApi({
					controller: effectiveConfig.controller,
					params,
					path: effectiveConfig.path,
					pathParams: discoveryDrilldown?.pathParams,
					serverUrl: `${session.serverUrl}/api`,
					token: session.token,
				});

				if (body.error || body.status !== 200) {
					setDiscoveryError(body.error ?? `Unable to load ${activeView.toLowerCase()}`);
					setDiscoveryItems([]);
					setDiscoveryTotal(0);
					return;
				}

				const parseView = discoveryDrilldown ? "Songs" : activeView;
				const items = asDiscoveryItems(parseView, body.data);
				setDiscoveryItems(items);
				setDiscoveryTotal(getTotalCountFromHeaders(body, items.length));
			} catch {
				setDiscoveryError(`Unable to load ${activeView.toLowerCase()}`);
				setDiscoveryItems([]);
				setDiscoveryTotal(0);
			} finally {
				setDiscoveryLoading(false);
			}
		};

		void loadDiscoveryItems();
	}, [
		activeView,
		callNavidromeApi,
		discoveryDrilldown,
		discoveryPage,
		discoveryRefreshVersion,
		discoverySearchDebounced,
		discoverySortOrder,
		discoverySortServerKey,
		session,
	]);

	// ─── Load queue ───────────────────────────────────────────────────────────────

	useEffect(() => {
		if (!session || songs.length === 0 || hasLoadedQueueRef.current) return;

		const loadQueue = async () => {
			try {
				const body = await callNavidromeApi({
					controller: "getQueue",
					path: "queue",
					serverUrl: `${session.serverUrl}/api`,
					token: session.token,
				});

				if (body.error || body.status !== 200 || !body.data || typeof body.data !== "object") return;

				const queueData = body.data as QueueResponse;
				const queueItems = asSongList(queueData.items);
				const queueIndex = typeof queueData.current === "number" ? queueData.current : 0;
				const queuedSongId = queueItems[queueIndex]?.id;

				if (queuedSongId) {
					const songExists = songs.some((song) => song.id === queuedSongId);
					if (songExists) setCurrentSongId(queuedSongId);
				}

				if (typeof queueData.position === "number" && queueData.position > 0) {
					setPendingSeekSeconds(queueData.position / 1000);
				}
			} catch {
				// Ignore queue restore failure
			} finally {
				hasLoadedQueueRef.current = true;
			}
		};

		void loadQueue();
	}, [callNavidromeApi, session, songs]);

	// ─── Computed values ──────────────────────────────────────────────────────────

	const currentSong = useMemo(
		() => songs.find((song) => song.id === currentSongId) ?? null,
		[currentSongId, songs],
	);

	const streamUrl = useMemo(() => {
		if (!session || !currentSong) return "";
		return buildStreamUrl(session, currentSong.id);
	}, [session, currentSong]);

	const coverArtUrl = useMemo(() => {
		if (!session || !currentSong?.coverArtId) return "";
		return buildCoverArtUrl(session, currentSong.coverArtId);
	}, [session, currentSong]);

	const currentIndex = currentSong ? songs.findIndex((s) => s.id === currentSong.id) : -1;
	const canGoPrevious = currentIndex > 0 || (repeatMode === "all" && songs.length > 1);
	const canGoNext =
		isRandom
			? songs.length > 1 || (repeatMode === "all" && songs.length > 0)
			: currentIndex >= 0 && (currentIndex < songs.length - 1 || (repeatMode === "all" && songs.length > 0));

	// ─── Playback helpers ─────────────────────────────────────────────────────────

	const getRandomSong = useCallback(
		(allowCurrent = false): null | Song => {
			if (songs.length === 0) return null;
			if (songs.length === 1 && allowCurrent) return songs[0] ?? null;
			const candidates = allowCurrent ? songs : songs.filter((s) => s.id !== currentSongId);
			if (candidates.length === 0) return null;
			return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
		},
		[currentSongId, songs],
	);

	const handleSeek = useCallback((value: number) => {
		const audio = audioRef.current;
		if (!audio) return;
		audio.currentTime = value;
		setCurrentTime(value);
	}, []);

	const handlePrevious = useCallback(() => {
		if (!currentSong) return;
		if (currentTime > 3) { handleSeek(0); return; }
		const idx = songs.findIndex((s) => s.id === currentSong.id);
		const prev = songs[idx - 1] ?? (repeatMode === "all" ? songs[songs.length - 1] : undefined);
		if (prev) { setCurrentSongId(prev.id); setIsPlaying(true); }
	}, [currentSong, currentTime, handleSeek, repeatMode, songs]);

	const handleNext = useCallback(() => {
		if (!currentSong) return;
		if (isRandom) {
			const rand = getRandomSong(repeatMode === "all");
			if (rand) { setCurrentSongId(rand.id); setIsPlaying(true); }
			return;
		}
		const idx = songs.findIndex((s) => s.id === currentSong.id);
		if (idx === -1) return;
		const next = songs[idx + 1] ?? (repeatMode === "all" ? songs[0] : undefined);
		if (next) { setCurrentSongId(next.id); setIsPlaying(true); }
	}, [currentSong, getRandomSong, isRandom, repeatMode, songs]);

	const handlePlayPause = useCallback(() => {
		const audio = audioRef.current;
		if (!audio) return;
		if (audio.paused) void audio.play(); else audio.pause();
	}, []);

	const handleSongEnded = () => {
		if (!currentSong) { setIsPlaying(false); return; }

		if (repeatMode === "one") {
			const audio = audioRef.current;
			if (!audio) { setIsPlaying(false); return; }
			audio.currentTime = 0;
			void audio.play().catch(() => setIsPlaying(false));
			return;
		}

		if (isRandom) {
			const rand = getRandomSong(repeatMode === "all");
			if (rand) { setCurrentSongId(rand.id); setIsPlaying(true); }
			else setIsPlaying(false);
			return;
		}

		const idx = songs.findIndex((s) => s.id === currentSong.id);
		if (idx === -1) { setIsPlaying(false); return; }
		const next = songs[idx + 1] ?? (repeatMode === "all" ? songs[0] : undefined);
		if (next) { setCurrentSongId(next.id); setIsPlaying(true); }
		else setIsPlaying(false);
	};

	const handleLogout = () => {
		window.localStorage.removeItem(NAVIDROME_SESSION_STORAGE_KEY);
		void router.push("/");
	};

	const handleDownload = () => {
		if (!session || !currentSong) return;
		const link = document.createElement("a");
		link.href = buildDownloadUrl(session, currentSong);
		link.download = `${currentSong.title}.mp3`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	};

	// ─── Volume persistence ───────────────────────────────────────────────────────

	useEffect(() => {
		const stored = window.localStorage.getItem(PLAYER_VOLUME_STORAGE_KEY);
		if (!stored) return;
		const parsed = Number(stored);
		if (Number.isFinite(parsed)) setVolume(Math.max(0, Math.min(1, parsed)));
	}, []);

	useEffect(() => {
		window.localStorage.setItem(PLAYER_VOLUME_STORAGE_KEY, String(volume));
		const audio = audioRef.current;
		if (audio) audio.volume = volume;
	}, [volume]);

	useEffect(() => {
		setCurrentTime(0);
		setDuration(0);
	}, [streamUrl]);

	// ─── Queue persistence ────────────────────────────────────────────────────────

	useEffect(() => {
		if (!session || !hasLoadedQueueRef.current || songs.length === 0 || !currentSongId) return;
		const idx = songs.findIndex((s) => s.id === currentSongId);
		if (idx < 0) return;

		if (queuePersistTimerRef.current) clearTimeout(queuePersistTimerRef.current);

		queuePersistTimerRef.current = setTimeout(() => {
			void callNavidromeApi({
				body: {
					current: idx,
					ids: songs.map((s) => s.id),
					position: Math.max(0, Math.round(currentTime * 1000)),
				},
				controller: "saveQueue",
				path: "queue",
				serverUrl: `${session.serverUrl}/api`,
				token: session.token,
			});
		}, 1800);

		return () => {
			if (queuePersistTimerRef.current) {
				clearTimeout(queuePersistTimerRef.current);
				queuePersistTimerRef.current = null;
			}
		};
	}, [callNavidromeApi, currentSongId, currentTime, session, songs]);

	// ─── Audio play state sync ────────────────────────────────────────────────────

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio || !streamUrl) { setIsPlaying(false); return; }
		if (isPlaying) void audio.play().catch(() => setIsPlaying(false));
	}, [isPlaying, streamUrl]);

	// ─── Keyboard shortcuts ───────────────────────────────────────────────────────

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (isEditableTarget(event.target)) return;

			if (event.code === "Space") { event.preventDefault(); handlePlayPause(); return; }
			if (event.code === "KeyN") { event.preventDefault(); handleNext(); return; }
			if (event.code === "KeyP") { event.preventDefault(); handlePrevious(); return; }
			if (event.code === "ArrowRight") {
				event.preventDefault();
				handleSeek(Math.min((audioRef.current?.currentTime ?? 0) + 5, duration));
				return;
			}
			if (event.code === "ArrowLeft") {
				event.preventDefault();
				handleSeek(Math.max((audioRef.current?.currentTime ?? 0) - 5, 0));
			}
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [duration, handleNext, handlePlayPause, handlePrevious, handleSeek]);

	// ─── OS Media Session ─────────────────────────────────────────────────────────

	useEffect(() => {
		if (!("mediaSession" in navigator)) return;

		navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
		navigator.mediaSession.metadata = currentSong
			? new MediaMetadata({
				album: currentSong.album,
				artist: currentSong.artist,
				title: currentSong.title,
				artwork: coverArtUrl ? [{ sizes: "512x512", src: coverArtUrl, type: "image/jpeg" }] : undefined,
			})
			: null;

		navigator.mediaSession.setActionHandler("nexttrack", handleNext);
		navigator.mediaSession.setActionHandler("pause", () => audioRef.current?.pause());
		navigator.mediaSession.setActionHandler("play", () => { setIsPlaying(true); void audioRef.current?.play(); });
		navigator.mediaSession.setActionHandler("previoustrack", handlePrevious);
		navigator.mediaSession.setActionHandler("seekto", (d) => { if (typeof d.seekTime === "number") handleSeek(d.seekTime); });

		return () => {
			navigator.mediaSession.setActionHandler("nexttrack", null);
			navigator.mediaSession.setActionHandler("pause", null);
			navigator.mediaSession.setActionHandler("play", null);
			navigator.mediaSession.setActionHandler("previoustrack", null);
			navigator.mediaSession.setActionHandler("seekto", null);
		};
	}, [coverArtUrl, currentSong, handleNext, handlePrevious, handleSeek, isPlaying]);

	// ─── Audio element event handlers ─────────────────────────────────────────────

	const handleAudioTimeUpdate = () => {
		const audio = audioRef.current;
		if (audio) setCurrentTime(audio.currentTime || 0);
	};

	const handleAudioLoadedMetadata = () => {
		const audio = audioRef.current;
		if (!audio) return;
		setDuration(audio.duration || 0);
		if (pendingSeekSeconds !== null && pendingSeekSeconds >= 0) {
			audio.currentTime = Math.min(pendingSeekSeconds, audio.duration || pendingSeekSeconds);
			setCurrentTime(audio.currentTime || 0);
			setPendingSeekSeconds(null);
		}
	};

	// ─── Discovery handlers ───────────────────────────────────────────────────────

	const handleSelectSong = (songId: string) => {
		setCurrentSongId(songId);
		setIsPlaying(true);
	};

	const handleSelectDiscoverySong = (item: DiscoveryItem) => {
		const song = item.song;
		if (!song) return;

		setSongs((current) => {
			if (current.some((s) => s.id === song.id)) return current;
			return [...current, song];
		});
		handleSelectSong(song.id);
	};

	const handleOpenDiscoveryDrilldown = (item: DiscoveryItem) => {
		if (activeView === "Tags") {
			setPendingSongsSearchFromTag(item.title);
			setActiveView("Songs");
			setDiscoveryPage(0);
			return;
		}

		if (activeView === "Albums") {
			setDiscoveryDrilldown({
				controller: "getSongList",
				meta: item.meta,
				path: "song",
				pathParams: { id: item.id },
				sourceView: "Albums",
				subtitle: item.subtitle,
				title: item.title,
			});
			return;
		}

		if (activeView === "Artists") {
			setDiscoveryDrilldown({
				controller: "getSongList",
				meta: item.meta,
				path: "song",
				pathParams: { id: item.id },
				sourceView: "Artists",
				subtitle: item.subtitle,
				title: item.title,
			});
			return;
		}

		if (activeView === "Genres") {
			setDiscoveryDrilldown({
				controller: "getSongList",
				meta: item.meta,
				path: "song",
				pathParams: { id: item.id },
				sourceView: "Genres",
				subtitle: item.subtitle,
				title: item.title,
			});
			return;
		}

		if (activeView === "Playlists") {
			setDiscoveryDrilldown({
				controller: "getPlaylistSongList",
				meta: item.meta,
				path: "playlist/:id/tracks",
				pathParams: { id: item.id },
				sourceView: "Playlists",
				subtitle: item.subtitle,
				title: item.title,
			});
		}
	};

	const handleOpenAlbumDrilldown = useCallback((item: DiscoveryItem) => {
		setDiscoveryDrilldown({
			controller: "getSongList",
			meta: item.meta,
			path: "song",
			pathParams: { id: item.id },
			sourceView: "Albums",
			subtitle: item.subtitle,
			title: item.title,
		});
	}, []);

	const handleBackFromDrilldown = () => {
		setDiscoveryDrilldown(null);
		setDrilldownDetail(null);
		setDrilldownDetailLoading(false);
		setDiscoveryPage(0);
	};

	const refreshDiscovery = useCallback(() => {
		setDiscoveryRefreshVersion((v) => v + 1);
	}, []);

	// ─── Playlist CRUD ────────────────────────────────────────────────────────────

	const handleDeleteCurrentPlaylist = useCallback(async () => {
		if (!session || playlistActionPending || discoveryDrilldown?.sourceView !== "Playlists") return;
		const playlistId = discoveryDrilldown.pathParams?.id;
		if (!playlistId) return;

		setPlaylistActionPending(true);
		setPlaylistActionNotice(null);

		try {
			const body = await callNavidromeApi({
				controller: "deletePlaylist",
				path: "playlist/:id",
				pathParams: { id: playlistId },
				serverUrl: `${session.serverUrl}/api`,
				token: session.token,
			});

			if (body.error || body.status < 200 || body.status >= 300) {
				setPlaylistActionNotice({ isError: true, text: body.error ?? `Unable to delete playlist (${body.status})` });
				return;
			}

			handleBackFromDrilldown();
			setPlaylistActionNotice({ isError: false, text: "Playlist deleted." });
			refreshDiscovery();
		} catch {
			setPlaylistActionNotice({ isError: true, text: "Unable to delete playlist right now." });
		} finally {
			setPlaylistActionPending(false);
		}
	}, [callNavidromeApi, discoveryDrilldown, playlistActionPending, refreshDiscovery, session]);

	const handleAddCurrentSongToPlaylist = useCallback(async () => {
		if (!session || playlistActionPending || discoveryDrilldown?.sourceView !== "Playlists" || !currentSong) return;
		const playlistId = discoveryDrilldown.pathParams?.id;
		if (!playlistId) return;

		setPlaylistActionPending(true);
		setPlaylistActionNotice(null);

		const candidateBodies: Record<string, unknown>[] = [
			{ ids: [currentSong.id] },
			{ id: currentSong.id },
			{ songIds: [currentSong.id] },
		];

		try {
			let lastError = "Unable to add song to playlist.";
			for (const requestBody of candidateBodies) {
				const body = await callNavidromeApi({
					body: requestBody,
					controller: "addToPlaylist",
					path: "playlist/:id/tracks",
					pathParams: { id: playlistId },
					serverUrl: `${session.serverUrl}/api`,
					token: session.token,
				});
				if (!body.error && body.status >= 200 && body.status < 300) {
					setPlaylistActionNotice({ isError: false, text: `Added "${currentSong.title}" to playlist.` });
					refreshDiscovery();
					return;
				}
				lastError = body.error ?? `Unable to add song (${body.status})`;
			}
			setPlaylistActionNotice({ isError: true, text: lastError });
		} catch {
			setPlaylistActionNotice({ isError: true, text: "Unable to add song to playlist right now." });
		} finally {
			setPlaylistActionPending(false);
		}
	}, [callNavidromeApi, currentSong, discoveryDrilldown, playlistActionPending, refreshDiscovery, session]);

	const handleRemoveSongFromPlaylist = useCallback(async (songId: string) => {
		if (!session || playlistActionPending || discoveryDrilldown?.sourceView !== "Playlists") return;
		const playlistId = discoveryDrilldown.pathParams?.id;
		if (!playlistId) return;

		setPlaylistActionPending(true);
		setPlaylistActionNotice(null);

		try {
			let lastError = "Unable to remove song from playlist.";
			const trackIndex = discoveryItems.findIndex((item) => item.song?.id === songId);

			const candidateParams: Record<string, string | string[] | undefined>[] = [
				{ id: songId }, { ids: [songId] }, { songId }, { songIds: [songId] },
			];
			if (trackIndex >= 0) {
				candidateParams.push({ index: String(trackIndex) });
				candidateParams.push({ trackNumber: String(trackIndex) });
			}

			for (const params of candidateParams) {
				const body = await callNavidromeApi({
					controller: "removeFromPlaylist",
					params,
					path: "playlist/:id/tracks",
					pathParams: { id: playlistId },
					serverUrl: `${session.serverUrl}/api`,
					token: session.token,
				});
				if (!body.error && body.status >= 200 && body.status < 300) {
					setDiscoveryItems((current) => {
						const idx = current.findIndex((item) => item.song?.id === songId);
						if (idx < 0) return current;
						const next = [...current];
						next.splice(idx, 1);
						return next;
					});
					setDiscoveryTotal((t) => Math.max(0, t - 1));
					setPlaylistActionNotice({ isError: false, text: "Song removed from playlist." });
					refreshDiscovery();
					return;
				}
				lastError = body.error ?? `Unable to remove song (${body.status})`;
			}
			setPlaylistActionNotice({ isError: true, text: lastError });
		} catch {
			setPlaylistActionNotice({ isError: true, text: "Unable to remove song from playlist right now." });
		} finally {
			setPlaylistActionPending(false);
		}
	}, [callNavidromeApi, discoveryDrilldown, discoveryItems, playlistActionPending, refreshDiscovery, session]);

	const handleMovePlaylistSong = useCallback(async (songId: string, direction: "down" | "up") => {
		if (!session || playlistActionPending || discoveryDrilldown?.sourceView !== "Playlists") return;
		const playlistId = discoveryDrilldown.pathParams?.id;
		if (!playlistId) return;

		const fromIndex = discoveryItems.findIndex((item) => item.song?.id === songId);
		if (fromIndex < 0) return;

		const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
		if (toIndex < 0 || toIndex >= discoveryItems.length) return;

		setPlaylistActionPending(true);
		setPlaylistActionNotice(null);

		const movePayloads: Record<string, number>[] = [
			{ to: toIndex }, { toIndex }, { index: toIndex }, { position: toIndex }, { newIndex: toIndex },
		];

		try {
			let lastError = "Unable to move playlist item.";
			for (const bodyPayload of movePayloads) {
				const body = await callNavidromeApi({
					body: bodyPayload,
					controller: "movePlaylistItem",
					path: "playlist/:playlistId/tracks/:trackNumber",
					pathParams: { playlistId, trackNumber: String(fromIndex) },
					serverUrl: `${session.serverUrl}/api`,
					token: session.token,
				});
				if (!body.error && body.status >= 200 && body.status < 300) {
					setDiscoveryItems((current) => {
						if (fromIndex < 0 || fromIndex >= current.length || toIndex < 0 || toIndex >= current.length) return current;
						const next = [...current];
						const [moved] = next.splice(fromIndex, 1);
						next.splice(toIndex, 0, moved);
						return next;
					});
					setPlaylistActionNotice({ isError: false, text: "Playlist order updated." });
					refreshDiscovery();
					return;
				}
				lastError = body.error ?? `Unable to move item (${body.status})`;
			}
			setPlaylistActionNotice({ isError: true, text: lastError });
		} catch {
			setPlaylistActionNotice({ isError: true, text: "Unable to update playlist order right now." });
		} finally {
			setPlaylistActionPending(false);
		}
	}, [callNavidromeApi, discoveryDrilldown, discoveryItems, playlistActionPending, refreshDiscovery, session]);

	// ─── Play / Queue all ─────────────────────────────────────────────────────────

	const effectiveDiscoveryViewForSongs: DiscoveryView = discoveryDrilldown ? "Songs" : activeView;

	const sortedDiscoveryItems = useMemo(() => {
		const isPlaylistDrilldown = discoveryDrilldown?.sourceView === "Playlists";
		if (isPlaylistDrilldown && effectiveDiscoveryViewForSongs === "Songs") return discoveryItems;
		return sortDiscoveryItems(discoveryItems, discoverySortField, discoverySortOrder);
	}, [discoveryDrilldown, discoveryItems, discoverySortField, discoverySortOrder, effectiveDiscoveryViewForSongs]);

	const discoverySongs = useMemo(() => {
		if (effectiveDiscoveryViewForSongs !== "Songs") return [] as Song[];
		return sortedDiscoveryItems.map((item: DiscoveryItem) => item.song).filter((s: Song | undefined): s is Song => Boolean(s));
	}, [effectiveDiscoveryViewForSongs, sortedDiscoveryItems]);

	const handlePlayAllDiscoverySongs = useCallback(() => {
		if (discoverySongs.length === 0) return;
		setSongs(discoverySongs);
		setCurrentSongId(discoverySongs[0].id);
		setIsPlaying(true);
	}, [discoverySongs]);

	const handleQueueAllDiscoverySongs = useCallback(() => {
		if (discoverySongs.length === 0) return;
		setSongs((current) => {
			const byId = new Map(current.map((s) => [s.id, s]));
			discoverySongs.forEach((s) => byId.set(s.id, s));
			return Array.from(byId.values());
		});
	}, [discoverySongs]);

	// ─── Star / Unstar ────────────────────────────────────────────────────────────

	const handleStarSong = useCallback(async (song: Song) => {
		if (!session) return;

		const endpoint = song.starred ? "unstar.view" : "star.view";
		const url = buildSubsonicUrl(session, endpoint, { id: song.id });

		// Optimistic update
		const updateStarred = (starred: boolean) => {
			setSongs((current) => current.map((s) => s.id === song.id ? { ...s, starred } : s));
			setDiscoveryItems((current) =>
				current.map((item) =>
					item.song?.id === song.id ? { ...item, song: { ...item.song, starred } } : item,
				),
			);
		};

		updateStarred(!song.starred);

		try {
			const response = await fetch(url);
			if (!response.ok) {
				// Revert on failure
				updateStarred(song.starred ?? false);
			}
		} catch {
			updateStarred(song.starred ?? false);
		}
	}, [session]);

	// ─── Queue management ─────────────────────────────────────────────────────────

	const handleRemoveFromQueue = useCallback((songId: string) => {
		setSongs((current) => {
			const next = current.filter((s) => s.id !== songId);
			return next;
		});
		// If the removed song was playing, move to next
		if (songId === currentSongId) {
			const idx = songs.findIndex((s) => s.id === songId);
			const next = songs[idx + 1] ?? songs[idx - 1] ?? null;
			if (next) {
				setCurrentSongId(next.id);
				setIsPlaying(true);
			} else {
				setCurrentSongId(null);
				setIsPlaying(false);
			}
		}
	}, [currentSongId, songs]);

	const handleClearQueue = useCallback(() => {
		setSongs([]);
		setCurrentSongId(null);
		setIsPlaying(false);
	}, []);

	// ─── Render ───────────────────────────────────────────────────────────────────

	return (
		<div className="min-h-screen bg-zinc-950 pb-36 text-zinc-100">
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-3 py-4 sm:px-4 sm:py-6">

				{/* Header */}
				<header className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<p className="text-xs uppercase tracking-[0.15em] text-zinc-500">Navidrome</p>
						<h1 className="text-xl font-semibold sm:text-2xl">Simple Music Player</h1>
						<p className="text-xs text-zinc-400">{session ? `Signed in as ${session.username}` : "Loading session..."}</p>
					</div>
					<button
						className="self-start rounded-md border border-zinc-700 px-3 py-2 text-sm transition hover:bg-zinc-800 sm:self-auto"
						onClick={handleLogout}
						type="button"
					>
						Log out
					</button>
				</header>

				{/* Main layout: Now Playing + Discovery */}
				<section className="grid gap-4 lg:grid-cols-[320px_1fr]">
					{/* Left: Now Playing */}
					<div className="flex flex-col gap-4">
						<NowPlayingPanel currentSong={currentSong} session={session} />

						{/* Queue panel (inline below Now Playing on larger screens, full-width on mobile when open) */}
						{showQueue ? (
							<QueuePanel
								currentSongId={currentSongId}
								onClearQueue={handleClearQueue}
								onClose={() => setShowQueue(false)}
								onRemoveSong={handleRemoveFromQueue}
								onSelectSong={handleSelectSong}
								session={session}
								songs={songs}
							/>
						) : null}
					</div>

					{/* Right: Discovery */}
					<DiscoveryPanel
						activeView={activeView}
						artistRelatedAlbums={artistRelatedAlbums}
						callNavidromeApi={callNavidromeApi}
						currentSong={currentSong}
						currentSongId={currentSongId}
						discoveryDrilldown={discoveryDrilldown}
						discoveryError={discoveryError}
						discoveryItems={discoveryItems}
						discoveryLoading={discoveryLoading}
						discoveryPage={discoveryPage}
						discoverySearch={discoverySearch}
						discoverySortField={discoverySortField}
						discoverySortOrder={discoverySortOrder}
						discoveryTotal={discoveryTotal}
						drilldownDetail={drilldownDetail}
						drilldownDetailLoading={drilldownDetailLoading}
						error={error}
						loading={loading}
						onAddCurrentSongToPlaylist={() => { void handleAddCurrentSongToPlaylist(); }}
						onBackFromDrilldown={handleBackFromDrilldown}
						onDeletePlaylist={() => { void handleDeleteCurrentPlaylist(); }}
						onMoveSongInPlaylist={(id, dir) => { void handleMovePlaylistSong(id, dir); }}
						onOpenAlbumDrilldown={handleOpenAlbumDrilldown}
						onOpenDrilldown={handleOpenDiscoveryDrilldown}
						onPlayAllDiscoverySongs={handlePlayAllDiscoverySongs}
						onQueueAllDiscoverySongs={handleQueueAllDiscoverySongs}
						onRefreshDiscovery={refreshDiscovery}
						onRemoveSongFromPlaylist={(id) => { void handleRemoveSongFromPlaylist(id); }}
						onSelectDiscoverySong={handleSelectDiscoverySong}
						onSetActiveView={(view) => {
							setActiveView(view);
							setDiscoveryDrilldown(null);
						}}
						onSetDiscoveryPage={setDiscoveryPage}
						onSetDiscoverySearch={setDiscoverySearch}
						onSetDiscoverySortField={setDiscoverySortField}
						onSetDiscoverySortOrder={setDiscoverySortOrder}
						onSetSortOption={(field, serverKey) => {
							setDiscoverySortField(field);
							setDiscoverySortServerKey(serverKey);
						}}
						onSetPlaylistActionNotice={setPlaylistActionNotice}
						onSetPlaylistActionPending={setPlaylistActionPending}
						onStarSong={(song) => { void handleStarSong(song); }}
						onToggleQueue={() => setShowQueue((v) => !v)}
						playlistActionNotice={playlistActionNotice}
						playlistActionPending={playlistActionPending}
						session={session}
						showQueue={showQueue}
					/>
				</section>
			</div>

			{/* Hidden audio element */}
			<audio
				className="hidden"
				onEnded={handleSongEnded}
				onLoadedMetadata={handleAudioLoadedMetadata}
				onPause={() => setIsPlaying(false)}
				onPlay={() => setIsPlaying(true)}
				onTimeUpdate={handleAudioTimeUpdate}
				ref={audioRef}
				src={streamUrl}
			/>

			{/* PlayBar */}
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
				onToggleRepeat={() => setRepeatMode((r) => cycleRepeatMode(r))}
				onToggleRandom={() => setIsRandom((r) => !r)}
				onVolumeChange={(v) => setVolume(Math.max(0, Math.min(1, v)))}
				repeatMode={repeatMode}
				songAlbum={currentSong?.album}
				songArtist={currentSong?.artist}
				songTitle={currentSong?.title}
				volume={volume}
			/>
		</div>
	);
}
