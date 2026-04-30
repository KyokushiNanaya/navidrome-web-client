import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/router";

import PlayBar from "@/comp/playbar";
import { NAVIDROME_SESSION_STORAGE_KEY, NavidromeSession } from "@/lib/navidrome-session";

type ApiRouteResult = {
	data?: unknown;
	error?: string;
	headers?: Record<string, string>;
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

type QueueResponse = {
	current?: number;
	items?: unknown;
	position?: number;
};

type RepeatMode = "all" | "off" | "one";

const DISCOVERY_VIEWS = ["Songs", "Albums", "Artists", "Genres", "Tags", "Playlists"] as const;
type DiscoveryView = (typeof DISCOVERY_VIEWS)[number];

type DiscoveryItem = {
	coverArtId?: string;
	id: string;
	meta?: string;
	song?: Song;
	subtitle?: string;
	title: string;
};

type DiscoveryQueryConfig = {
	controller: string;
	path: string;
	searchKey?: string;
	sortKey: string;
};

type DiscoverySortField = "meta" | "subtitle" | "title";

type DiscoverySortOption = {
	label: string;
	value: DiscoverySortField;
};

type DrilldownDetail = {
	description?: string;
	meta?: string;
	subtitle?: string;
	title: string;
};

type DiscoveryDrilldown = {
	controller: string;
	path: string;
	pathParams?: Record<string, string>;
	meta?: string;
	sourceView: DiscoveryView;
	subtitle?: string;
	title: string;
};

type ActionNotice = {
	isError: boolean;
	text: string;
};

const DISCOVERY_PAGE_SIZE = 30;

const DISCOVERY_QUERY_CONFIG: Record<DiscoveryView, DiscoveryQueryConfig> = {
	Albums: {
		controller: "getAlbumList",
		path: "album",
		searchKey: "name",
		sortKey: "name",
	},
	Artists: {
		controller: "getAlbumArtistList",
		path: "artist",
		searchKey: "name",
		sortKey: "name",
	},
	Genres: {
		controller: "getGenreList",
		path: "genre",
		searchKey: "name",
		sortKey: "name",
	},
	Playlists: {
		controller: "getPlaylistList",
		path: "playlist",
		searchKey: "q",
		sortKey: "name",
	},
	Songs: {
		controller: "getSongList",
		path: "song",
		searchKey: "title",
		sortKey: "title",
	},
	Tags: {
		controller: "getTagList",
		path: "tag",
		searchKey: "tag_value",
		sortKey: "tagValue",
	},
};

const DISCOVERY_SORT_OPTIONS: Record<DiscoveryView, DiscoverySortOption[]> = {
	Albums: [
		{ label: "Album", value: "title" },
		{ label: "Artist", value: "subtitle" },
		{ label: "Tracks", value: "meta" },
	],
	Artists: [
		{ label: "Artist", value: "title" },
		{ label: "Tracks", value: "meta" },
	],
	Genres: [
		{ label: "Genre", value: "title" },
		{ label: "Tracks", value: "meta" },
	],
	Playlists: [
		{ label: "Playlist", value: "title" },
		{ label: "Owner", value: "subtitle" },
		{ label: "Tracks", value: "meta" },
	],
	Songs: [
		{ label: "Title", value: "title" },
		{ label: "Artist", value: "subtitle" },
		{ label: "Album", value: "meta" },
	],
	Tags: [
		{ label: "Tag Value", value: "title" },
		{ label: "Tag Name", value: "subtitle" },
	],
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

const asRecordArray = (value: unknown): Record<string, unknown>[] => {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
};

const asRelatedAlbumItems = (value: unknown): DiscoveryItem[] => {
	return asRecordArray(value).map((record, index) => ({
		coverArtId:
			typeof record.coverArtId === "string"
				? record.coverArtId
				: typeof record.id === "string"
					? record.id
					: undefined,
		id: String(record.id ?? `artist-album-${index}`),
		meta: toOptionalNumber(record.songCount) ? `${toOptionalNumber(record.songCount)} songs` : undefined,
		subtitle: typeof record.artist === "string" ? record.artist : undefined,
		title: typeof record.name === "string" ? record.name : "Untitled album",
	}));
};

const toOptionalNumber = (value: unknown): number | undefined => {
	if (typeof value === "number") {
		return value;
	}

	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}

	return undefined;
};

const getTotalCountFromHeaders = (result: ApiRouteResult, fallback: number): number => {
	const countRaw = result.headers?.["x-total-count"] ?? result.headers?.["X-Total-Count"];
	if (!countRaw) {
		return fallback;
	}

	const parsed = Number(countRaw);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const asDiscoveryItems = (view: DiscoveryView, value: unknown): DiscoveryItem[] => {
	if (view === "Songs") {
		return asSongList(value).map((song) => ({
			coverArtId: song.coverArtId,
			id: song.id,
			meta: song.album,
			song,
			subtitle: song.artist,
			title: song.title,
		}));
	}

	const records = asRecordArray(value);

	if (view === "Albums") {
		return records.map((record, index) => ({
			coverArtId:
				typeof record.coverArtId === "string"
					? record.coverArtId
					: typeof record.id === "string"
						? record.id
						: undefined,
			id: String(record.id ?? `album-${index}`),
			meta: toOptionalNumber(record.songCount) ? `${toOptionalNumber(record.songCount)} songs` : undefined,
			subtitle: typeof record.artist === "string" ? record.artist : undefined,
			title: typeof record.name === "string" ? record.name : "Untitled album",
		}));
	}

	if (view === "Artists") {
		return records.map((record, index) => ({
			coverArtId: typeof record.id === "string" ? record.id : undefined,
			id: String(record.id ?? `artist-${index}`),
			meta: toOptionalNumber(record.songCount) ? `${toOptionalNumber(record.songCount)} songs` : undefined,
			title: typeof record.name === "string" ? record.name : "Unknown artist",
		}));
	}

	if (view === "Genres") {
		return records.map((record, index) => ({
			id: String(record.id ?? `genre-${index}`),
			meta:
				toOptionalNumber(record.songCount) || toOptionalNumber(record.albumCount)
					? `${toOptionalNumber(record.songCount) ?? 0} songs`
					: undefined,
			title:
				typeof record.name === "string"
					? record.name
					: typeof record.genre === "string"
						? record.genre
						: "Unknown genre",
		}));
	}

	if (view === "Tags") {
		return records.map((record, index) => {
			const tagName = typeof record.tagName === "string" ? record.tagName : "tag";
			const tagValue = typeof record.tagValue === "string" ? record.tagValue : "unknown";

			return {
				id: String(record.id ?? `${tagName}-${tagValue}-${index}`),
				meta:
					toOptionalNumber(record.songCount) || toOptionalNumber(record.albumCount)
						? `${toOptionalNumber(record.songCount) ?? 0} songs`
						: undefined,
				subtitle: tagName,
				title: tagValue,
			};
		});
	}

	return records.map((record, index) => ({
		coverArtId:
			typeof record.uploadedImage === "string" || typeof record.coverArtId === "string"
				? String(record.id ?? "")
				: undefined,
		id: String(record.id ?? `playlist-${index}`),
		meta: toOptionalNumber(record.songCount) ? `${toOptionalNumber(record.songCount)} songs` : undefined,
		subtitle: typeof record.ownerName === "string" ? record.ownerName : undefined,
		title: typeof record.name === "string" ? record.name : "Untitled playlist",
	}));
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

const cycleRepeatMode = (current: RepeatMode): RepeatMode => {
	if (current === "off") {
		return "all";
	}

	if (current === "all") {
		return "one";
	}

	return "off";
};

const isEditableTarget = (target: EventTarget | null): boolean => {
	if (!(target instanceof HTMLElement)) {
		return false;
	}

	const editableTag = target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA";
	return editableTag || target.isContentEditable;
};

export default function PlayerPage() {
	const router = useRouter();
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const queuePersistTimerRef = useRef<null | ReturnType<typeof setTimeout>>(null);
	const hasLoadedQueueRef = useRef(false);
	const [session, setSession] = useState<NavidromeSession | null>(null);
	const [songs, setSongs] = useState<Song[]>([]);
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
	const [discoveryTotal, setDiscoveryTotal] = useState(0);
	const [discoveryPage, setDiscoveryPage] = useState(0);
	const [discoveryRefreshVersion, setDiscoveryRefreshVersion] = useState(0);
	const [discoveryError, setDiscoveryError] = useState<string | null>(null);
	const [playlistActionPending, setPlaylistActionPending] = useState(false);
	const [playlistActionNotice, setPlaylistActionNotice] = useState<ActionNotice | null>(null);
	const [currentSongId, setCurrentSongId] = useState<string | null>(null);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [isPlaying, setIsPlaying] = useState(false);
	const [isRandom, setIsRandom] = useState(false);
	const [pendingSeekSeconds, setPendingSeekSeconds] = useState<null | number>(null);
	const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
	const [volume, setVolume] = useState(0.8);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const callNavidromeApi = useCallback(async (payload: Record<string, unknown>): Promise<ApiRouteResult> => {
		const response = await fetch("/api/navidrome-api", {
			body: JSON.stringify(payload),
			headers: {
				"Content-Type": "application/json",
			},
			method: "POST",
		});

		const rawText = await response.text();
		let body: ApiRouteResult = {
			status: response.status,
		};

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

	useEffect(() => {
		const timer = setTimeout(() => {
			setDiscoverySearchDebounced(discoverySearch.trim());
		}, 250);

		return () => {
			clearTimeout(timer);
		};
	}, [discoverySearch]);

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
		if (activeView !== "Songs" || !pendingSongsSearchFromTag) {
			return;
		}

		setDiscoverySearch(pendingSongsSearchFromTag);
		setDiscoverySearchDebounced(pendingSongsSearchFromTag);
		setPendingSongsSearchFromTag(null);
	}, [activeView, pendingSongsSearchFromTag]);

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
					].filter((part): part is string => Boolean(part));

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
					].filter((part): part is string => Boolean(part));

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
					nextDetail.subtitle =
						typeof detail.ownerName === "string" ? detail.ownerName : nextDetail.subtitle;

					const songCount = toOptionalNumber(detail.songCount);
					const durationSeconds = toOptionalNumber(detail.duration);
					const durationMinutes =
						durationSeconds && durationSeconds > 0 ? Math.max(1, Math.round(durationSeconds / 60)) : undefined;
					const metaParts = [
						songCount ? `${songCount} songs` : undefined,
						durationMinutes ? `${durationMinutes} min` : undefined,
					].filter((part): part is string => Boolean(part));

					nextDetail.meta = metaParts.length > 0 ? metaParts.join(" | ") : nextDetail.meta;
					nextDetail.description = typeof detail.comment === "string" ? detail.comment : undefined;
				}

				setDrilldownDetail(nextDetail);
			} finally {
				if (!cancelled) {
					setDrilldownDetailLoading(false);
				}
			}
		};

		void loadDrilldownDetail();

		return () => {
			cancelled = true;
		};
	}, [callNavidromeApi, discoveryDrilldown, session]);

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
			hasLoadedQueueRef.current = false;

			try {
				const body = await callNavidromeApi({
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

	useEffect(() => {
		if (!session) {
			return;
		}

		const loadDiscoveryItems = async () => {
			setDiscoveryLoading(true);
			setDiscoveryError(null);

			const start = discoveryPage * DISCOVERY_PAGE_SIZE;
			const end = start + DISCOVERY_PAGE_SIZE;
			const baseConfig = DISCOVERY_QUERY_CONFIG[activeView];
			const effectiveConfig: DiscoveryQueryConfig = discoveryDrilldown
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
				_sort: effectiveConfig.sortKey,
				_start: String(start),
			};

			if (effectiveConfig.searchKey && discoverySearchDebounced.length > 0) {
				params[effectiveConfig.searchKey] = discoverySearchDebounced;
			}

			if (discoveryDrilldown?.sourceView === "Albums") {
				params.album_id = discoveryDrilldown.pathParams?.id ?? "";
			}

			if (discoveryDrilldown?.sourceView === "Artists") {
				params.artist_id = discoveryDrilldown.pathParams?.id ?? "";
			}

			if (discoveryDrilldown?.sourceView === "Genres") {
				params.genre_id = discoveryDrilldown.pathParams?.id ?? "";
			}

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
		session,
	]);

	useEffect(() => {
		if (!session || songs.length === 0 || hasLoadedQueueRef.current) {
			return;
		}

		const loadQueue = async () => {
			try {
				const body = await callNavidromeApi({
					controller: "getQueue",
					path: "queue",
					serverUrl: `${session.serverUrl}/api`,
					token: session.token,
				});

				if (body.error || body.status !== 200 || !body.data || typeof body.data !== "object") {
					return;
				}

				const queueData = body.data as QueueResponse;
				const queueItems = asSongList(queueData.items);
				const queueIndex = typeof queueData.current === "number" ? queueData.current : 0;
				const queuedSongId = queueItems[queueIndex]?.id;

				if (queuedSongId) {
					const songExists = songs.some((song) => song.id === queuedSongId);
					if (songExists) {
						setCurrentSongId(queuedSongId);
					}
				}

				if (typeof queueData.position === "number" && queueData.position > 0) {
					setPendingSeekSeconds(queueData.position / 1000);
				}
			} catch {
				// Ignore queue restore failure and continue with default playback state.
			} finally {
				hasLoadedQueueRef.current = true;
			}
		};

		void loadQueue();
	}, [callNavidromeApi, session, songs]);

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

	const getRandomSong = useCallback((allowCurrent = false): null | Song => {
		if (songs.length === 0) {
			return null;
		}

		if (songs.length === 1 && allowCurrent) {
			return songs[0] ?? null;
		}

		const candidateSongs = allowCurrent ? songs : songs.filter((song) => song.id !== currentSongId);
		if (candidateSongs.length === 0) {
			return null;
		}

		const index = Math.floor(Math.random() * candidateSongs.length);
		return candidateSongs[index] ?? null;
	}, [currentSongId, songs]);

	const handleLogout = () => {
		window.localStorage.removeItem(NAVIDROME_SESSION_STORAGE_KEY);
		void router.push("/");
	};

	const handleSongEnded = () => {
		if (!currentSong) {
			setIsPlaying(false);
			return;
		}

		if (repeatMode === "one") {
			const audio = audioRef.current;
			if (!audio) {
				setIsPlaying(false);
				return;
			}

			audio.currentTime = 0;
			void audio.play().catch(() => {
				setIsPlaying(false);
			});
			return;
		}

		if (isRandom) {
			const randomSong = getRandomSong(repeatMode === "all");
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

		const nextSong = songs[currentIndex + 1] ?? (repeatMode === "all" ? songs[0] : undefined);
		if (nextSong) {
			setCurrentSongId(nextSong.id);
			setIsPlaying(true);
		} else {
			setIsPlaying(false);
		}
	};

	const handleSeek = useCallback((value: number) => {
		const audio = audioRef.current;
		if (!audio) {
			return;
		}

		audio.currentTime = value;
		setCurrentTime(value);
	}, []);

	const handlePrevious = useCallback(() => {
		if (!currentSong) {
			return;
		}

		if (currentTime > 3) {
			handleSeek(0);
			return;
		}

		const currentIndex = songs.findIndex((song) => song.id === currentSong.id);
		const previousSong = songs[currentIndex - 1] ?? (repeatMode === "all" ? songs[songs.length - 1] : undefined);
		if (previousSong) {
			setCurrentSongId(previousSong.id);
			setIsPlaying(true);
		}
	}, [currentSong, currentTime, handleSeek, repeatMode, songs]);

	const handleNext = useCallback(() => {
		if (!currentSong) {
			return;
		}

		if (isRandom) {
			const randomSong = getRandomSong(repeatMode === "all");
			if (randomSong) {
				setCurrentSongId(randomSong.id);
				setIsPlaying(true);
			}
			return;
		}

		const currentIndex = songs.findIndex((song) => song.id === currentSong.id);
		if (currentIndex === -1) {
			return;
		}

		const nextSong = songs[currentIndex + 1] ?? (repeatMode === "all" ? songs[0] : undefined);
		if (nextSong) {
			setCurrentSongId(nextSong.id);
			setIsPlaying(true);
		}
	}, [currentSong, getRandomSong, isRandom, repeatMode, songs]);

	const handlePlayPause = useCallback(() => {
		const audio = audioRef.current;
		if (!audio) {
			return;
		}

		if (audio.paused) {
			void audio.play();
		} else {
			audio.pause();
		}
	}, []);

	const handleToggleRandom = () => {
		setIsRandom((current) => !current);
	};

	const handleToggleRepeat = () => {
		setRepeatMode((current) => cycleRepeatMode(current));
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
		if (!session || !hasLoadedQueueRef.current || songs.length === 0 || !currentSongId) {
			return;
		}

		const currentIndex = songs.findIndex((song) => song.id === currentSongId);
		if (currentIndex < 0) {
			return;
		}

		if (queuePersistTimerRef.current) {
			clearTimeout(queuePersistTimerRef.current);
		}

		queuePersistTimerRef.current = setTimeout(() => {
			void callNavidromeApi({
				body: {
					current: currentIndex,
					ids: songs.map((song) => song.id),
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

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (isEditableTarget(event.target)) {
				return;
			}

			if (event.code === "Space") {
				event.preventDefault();
				handlePlayPause();
				return;
			}

			if (event.code === "KeyN") {
				event.preventDefault();
				handleNext();
				return;
			}

			if (event.code === "KeyP") {
				event.preventDefault();
				handlePrevious();
				return;
			}

			if (event.code === "ArrowRight") {
				event.preventDefault();
				const current = audioRef.current?.currentTime ?? 0;
				handleSeek(Math.min(current + 5, duration));
				return;
			}

			if (event.code === "ArrowLeft") {
				event.preventDefault();
				const current = audioRef.current?.currentTime ?? 0;
				handleSeek(Math.max(current - 5, 0));
			}
		};

		window.addEventListener("keydown", onKeyDown);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
		};
	}, [duration, handleNext, handlePlayPause, handlePrevious, handleSeek]);

	useEffect(() => {
		if (!("mediaSession" in navigator)) {
			return;
		}

		navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
		navigator.mediaSession.metadata = currentSong
			? new MediaMetadata({
				album: currentSong.album,
				artist: currentSong.artist,
				title: currentSong.title,
				artwork: coverArtUrl
					? [
						{
							sizes: "512x512",
							src: coverArtUrl,
							type: "image/jpeg",
						},
					]
					: undefined,
			})
			: null;

		navigator.mediaSession.setActionHandler("nexttrack", handleNext);
		navigator.mediaSession.setActionHandler("pause", () => {
			audioRef.current?.pause();
		});
		navigator.mediaSession.setActionHandler("play", () => {
			setIsPlaying(true);
			void audioRef.current?.play();
		});
		navigator.mediaSession.setActionHandler("previoustrack", handlePrevious);
		navigator.mediaSession.setActionHandler("seekto", (details) => {
			if (typeof details.seekTime === "number") {
				handleSeek(details.seekTime);
			}
		});

		return () => {
			navigator.mediaSession.setActionHandler("nexttrack", null);
			navigator.mediaSession.setActionHandler("pause", null);
			navigator.mediaSession.setActionHandler("play", null);
			navigator.mediaSession.setActionHandler("previoustrack", null);
			navigator.mediaSession.setActionHandler("seekto", null);
		};
	}, [coverArtUrl, currentSong, handleNext, handlePrevious, handleSeek, isPlaying]);

	const currentIndex = currentSong ? songs.findIndex((song) => song.id === currentSong.id) : -1;
	const canGoPrevious = currentIndex > 0 || (repeatMode === "all" && songs.length > 1);
	const canGoNext =
		isRandom
			? songs.length > 1 || (repeatMode === "all" && songs.length > 0)
			: currentIndex >= 0 && (currentIndex < songs.length - 1 || (repeatMode === "all" && songs.length > 0));

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

		if (pendingSeekSeconds !== null && pendingSeekSeconds >= 0) {
			audio.currentTime = Math.min(pendingSeekSeconds, audio.duration || pendingSeekSeconds);
			setCurrentTime(audio.currentTime || 0);
			setPendingSeekSeconds(null);
		}
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

	const handleSelectDiscoverySong = (item: DiscoveryItem) => {
		const discoverySong = item.song;
		if (!discoverySong) {
			return;
		}

		setSongs((current) => {
			if (current.some((song) => song.id === discoverySong.id)) {
				return current;
			}

			return [...current, discoverySong];
		});

		handleSelectSong(discoverySong.id);
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
		setDiscoveryRefreshVersion((current) => current + 1);
	}, []);

	const handleCreatePlaylist = useCallback(async () => {
		if (!session || playlistActionPending) {
			return;
		}

		const rawName = window.prompt("Playlist name", "New Playlist");
		if (rawName === null) {
			return;
		}

		const name = rawName.trim();
		if (!name) {
			setPlaylistActionNotice({
				isError: true,
				text: "Playlist name cannot be empty.",
			});
			return;
		}

		setPlaylistActionPending(true);
		setPlaylistActionNotice(null);

		try {
			const body = await callNavidromeApi({
				body: { name },
				controller: "createPlaylist",
				path: "playlist",
				serverUrl: `${session.serverUrl}/api`,
				token: session.token,
			});

			if (body.error || body.status < 200 || body.status >= 300) {
				setPlaylistActionNotice({
					isError: true,
					text: body.error ?? `Unable to create playlist (${body.status})`,
				});
				return;
			}

			setPlaylistActionNotice({
				isError: false,
				text: `Playlist \"${name}\" created.`,
			});
			refreshDiscovery();
		} catch {
			setPlaylistActionNotice({
				isError: true,
				text: "Unable to create playlist right now.",
			});
		} finally {
			setPlaylistActionPending(false);
		}
	}, [callNavidromeApi, playlistActionPending, refreshDiscovery, session]);

	const handleRenameCurrentPlaylist = useCallback(async () => {
		if (!session || playlistActionPending || discoveryDrilldown?.sourceView !== "Playlists") {
			return;
		}

		const playlistId = discoveryDrilldown.pathParams?.id;
		if (!playlistId) {
			return;
		}

		const rawName = window.prompt("Rename playlist", discoveryDrilldown.title);
		if (rawName === null) {
			return;
		}

		const name = rawName.trim();
		if (!name) {
			setPlaylistActionNotice({
				isError: true,
				text: "Playlist name cannot be empty.",
			});
			return;
		}

		setPlaylistActionPending(true);
		setPlaylistActionNotice(null);

		try {
			const body = await callNavidromeApi({
				body: { name },
				controller: "updatePlaylist",
				path: "playlist/:id",
				pathParams: { id: playlistId },
				serverUrl: `${session.serverUrl}/api`,
				token: session.token,
			});

			if (body.error || body.status < 200 || body.status >= 300) {
				setPlaylistActionNotice({
					isError: true,
					text: body.error ?? `Unable to rename playlist (${body.status})`,
				});
				return;
			}

			setDiscoveryDrilldown((current) => {
				if (!current || current.sourceView !== "Playlists") {
					return current;
				}

				return {
					...current,
					title: name,
				};
			});

			setDrilldownDetail((current) => {
				if (!current) {
					return current;
				}

				return {
					...current,
					title: name,
				};
			});

			setPlaylistActionNotice({
				isError: false,
				text: "Playlist renamed.",
			});
			refreshDiscovery();
		} catch {
			setPlaylistActionNotice({
				isError: true,
				text: "Unable to rename playlist right now.",
			});
		} finally {
			setPlaylistActionPending(false);
		}
	}, [callNavidromeApi, discoveryDrilldown, playlistActionPending, refreshDiscovery, session]);

	const handleDeleteCurrentPlaylist = useCallback(async () => {
		if (!session || playlistActionPending || discoveryDrilldown?.sourceView !== "Playlists") {
			return;
		}

		const playlistId = discoveryDrilldown.pathParams?.id;
		if (!playlistId) {
			return;
		}

		const confirmed = window.confirm(`Delete playlist \"${discoveryDrilldown.title}\"?`);
		if (!confirmed) {
			return;
		}

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
				setPlaylistActionNotice({
					isError: true,
					text: body.error ?? `Unable to delete playlist (${body.status})`,
				});
				return;
			}

			handleBackFromDrilldown();
			setPlaylistActionNotice({
				isError: false,
				text: "Playlist deleted.",
			});
			refreshDiscovery();
		} catch {
			setPlaylistActionNotice({
				isError: true,
				text: "Unable to delete playlist right now.",
			});
		} finally {
			setPlaylistActionPending(false);
		}
	}, [callNavidromeApi, discoveryDrilldown, playlistActionPending, refreshDiscovery, session]);

	const handleAddCurrentSongToPlaylist = useCallback(async () => {
		if (!session || playlistActionPending || discoveryDrilldown?.sourceView !== "Playlists" || !currentSong) {
			return;
		}

		const playlistId = discoveryDrilldown.pathParams?.id;
		if (!playlistId) {
			return;
		}

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
					setPlaylistActionNotice({
						isError: false,
						text: `Added \"${currentSong.title}\" to playlist.`,
					});
					refreshDiscovery();
					return;
				}

				lastError = body.error ?? `Unable to add song (${body.status})`;
			}

			setPlaylistActionNotice({
				isError: true,
				text: lastError,
			});
		} catch {
			setPlaylistActionNotice({
				isError: true,
				text: "Unable to add song to playlist right now.",
			});
		} finally {
			setPlaylistActionPending(false);
		}
	}, [callNavidromeApi, currentSong, discoveryDrilldown, playlistActionPending, refreshDiscovery, session]);

	const handleRemoveSongFromPlaylist = useCallback(async (songId: string) => {
		if (!session || playlistActionPending || discoveryDrilldown?.sourceView !== "Playlists") {
			return;
		}

		const playlistId = discoveryDrilldown.pathParams?.id;
		if (!playlistId) {
			return;
		}

		setPlaylistActionPending(true);
		setPlaylistActionNotice(null);

		try {
			let lastError = "Unable to remove song from playlist.";
			const trackIndex = discoveryItems.findIndex((item) => item.song?.id === songId);

			const candidateParams: Record<string, string | string[] | undefined>[] = [
				{ id: songId },
				{ ids: [songId] },
				{ songId },
				{ songIds: [songId] },
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
						const index = current.findIndex((item) => item.song?.id === songId);
						if (index < 0) {
							return current;
						}

						const next = [...current];
						next.splice(index, 1);
						return next;
					});
					setDiscoveryTotal((current) => Math.max(0, current - 1));
					setPlaylistActionNotice({
						isError: false,
						text: "Song removed from playlist.",
					});
					refreshDiscovery();
					return;
				}

				lastError = body.error ?? `Unable to remove song (${body.status})`;
			}

			setPlaylistActionNotice({
				isError: true,
				text: lastError,
			});
		} catch {
			setPlaylistActionNotice({
				isError: true,
				text: "Unable to remove song from playlist right now.",
			});
		} finally {
			setPlaylistActionPending(false);
		}
	}, [callNavidromeApi, discoveryDrilldown, discoveryItems, playlistActionPending, refreshDiscovery, session]);

	const handleMovePlaylistSong = useCallback(async (songId: string, direction: "down" | "up") => {
		if (!session || playlistActionPending || discoveryDrilldown?.sourceView !== "Playlists") {
			return;
		}

		const playlistId = discoveryDrilldown.pathParams?.id;
		if (!playlistId) {
			return;
		}

		const fromIndex = discoveryItems.findIndex((item) => item.song?.id === songId);
		if (fromIndex < 0) {
			return;
		}

		const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
		if (toIndex < 0 || toIndex >= discoveryItems.length) {
			return;
		}

		setPlaylistActionPending(true);
		setPlaylistActionNotice(null);

		const movePayloads: Record<string, number>[] = [
			{ to: toIndex },
			{ toIndex },
			{ index: toIndex },
			{ position: toIndex },
			{ newIndex: toIndex },
		];

		try {
			let lastError = "Unable to move playlist item.";

			for (const bodyPayload of movePayloads) {
				const body = await callNavidromeApi({
					body: bodyPayload,
					controller: "movePlaylistItem",
					path: "playlist/:playlistId/tracks/:trackNumber",
					pathParams: {
						playlistId,
						trackNumber: String(fromIndex),
					},
					serverUrl: `${session.serverUrl}/api`,
					token: session.token,
				});

				if (!body.error && body.status >= 200 && body.status < 300) {
					setDiscoveryItems((current) => {
						if (fromIndex < 0 || fromIndex >= current.length || toIndex < 0 || toIndex >= current.length) {
							return current;
						}

						const next = [...current];
						const [movedItem] = next.splice(fromIndex, 1);
						next.splice(toIndex, 0, movedItem);
						return next;
					});

					setPlaylistActionNotice({
						isError: false,
						text: "Playlist order updated.",
					});
					refreshDiscovery();
					return;
				}

				lastError = body.error ?? `Unable to move item (${body.status})`;
			}

			setPlaylistActionNotice({
				isError: true,
				text: lastError,
			});
		} catch {
			setPlaylistActionNotice({
				isError: true,
				text: "Unable to update playlist order right now.",
			});
		} finally {
			setPlaylistActionPending(false);
		}
	}, [callNavidromeApi, discoveryDrilldown, discoveryItems, playlistActionPending, refreshDiscovery, session]);

	const handleToggleDiscoverySortOrder = () => {
		setDiscoverySortOrder((current) => (current === "ASC" ? "DESC" : "ASC"));
	};

	const canDiscoveryPrevious = discoveryPage > 0;
	const canDiscoveryNext =
		discoveryTotal > 0
			? (discoveryPage + 1) * DISCOVERY_PAGE_SIZE < discoveryTotal
			: discoveryItems.length >= DISCOVERY_PAGE_SIZE;
	const supportsDrilldown = activeView === "Albums" || activeView === "Artists" || activeView === "Genres" || activeView === "Playlists";
	const isDiscoveryCardActionable = supportsDrilldown || activeView === "Tags";
	const isPlaylistDrilldown = discoveryDrilldown?.sourceView === "Playlists";
	const effectiveDiscoveryView: DiscoveryView = discoveryDrilldown ? "Songs" : activeView;
	const discoverySortOptions = DISCOVERY_SORT_OPTIONS[effectiveDiscoveryView];
	const sortedDiscoveryItems = useMemo(() => {
		if (isPlaylistDrilldown && effectiveDiscoveryView === "Songs") {
			return discoveryItems;
		}

		const fieldMap: Record<DiscoverySortField, keyof DiscoveryItem> = {
			meta: "meta",
			subtitle: "subtitle",
			title: "title",
		};

		const targetField = fieldMap[discoverySortField];
		const compareDir = discoverySortOrder === "ASC" ? 1 : -1;

		return [...discoveryItems].sort((a, b) => {
			const aRaw = (a[targetField] ?? "") as string;
			const bRaw = (b[targetField] ?? "") as string;
			return aRaw.localeCompare(bRaw, undefined, { sensitivity: "base" }) * compareDir;
		});
	}, [discoveryItems, discoverySortField, discoverySortOrder, effectiveDiscoveryView, isPlaylistDrilldown]);

	const discoverySongs = useMemo(() => {
		if (effectiveDiscoveryView !== "Songs") {
			return [] as Song[];
		}

		return sortedDiscoveryItems.map((item) => item.song).filter((song): song is Song => Boolean(song));
	}, [effectiveDiscoveryView, sortedDiscoveryItems]);

	const handlePlayAllDiscoverySongs = useCallback(() => {
		if (discoverySongs.length === 0) {
			return;
		}

		setSongs(discoverySongs);
		setCurrentSongId(discoverySongs[0].id);
		setIsPlaying(true);
	}, [discoverySongs]);

	const handleQueueAllDiscoverySongs = useCallback(() => {
		if (discoverySongs.length === 0) {
			return;
		}

		setSongs((current) => {
			const byId = new Map(current.map((song) => [song.id, song]));
			discoverySongs.forEach((song) => {
				byId.set(song.id, song);
			});
			return Array.from(byId.values());
		});
	}, [discoverySongs]);

	const hasDiscoverySongs = discoverySongs.length > 0;
	const discoveryCountLabel =
		discoveryTotal > 0 ? `${discoveryTotal} total` : `${discoveryItems.length} shown`;
	const discoveryPageLabel = `Page ${discoveryPage + 1}`;

	return (
		<div className="min-h-screen bg-zinc-950 px-3 py-6 pb-36 text-zinc-100 sm:px-4 sm:py-8 sm:pb-32">
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
				<header className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
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

				<nav className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/70 p-2">
					<ul className="flex w-max items-center gap-2">
						{DISCOVERY_VIEWS.map((view) => {
							const isActive = activeView === view;
							return (
								<li key={view}>
									<button
										className={`rounded-md px-3 py-1.5 text-sm transition ${
											isActive
												? "bg-emerald-500/20 text-emerald-300"
												: "text-zinc-300 hover:bg-zinc-800"
										}`}
										onClick={() => setActiveView(view)}
										type="button"
									>
										{view}
									</button>
								</li>
							);
						})}
					</ul>
				</nav>

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
						<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
							<h2 className="text-sm font-medium text-zinc-300">
								{discoveryDrilldown ? `${activeView} / ${discoveryDrilldown.title}` : activeView}
							</h2>
							<div className="flex items-center gap-2">
								{activeView === "Playlists" && !discoveryDrilldown ? (
									<button
										className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
										disabled={playlistActionPending}
										onClick={handleCreatePlaylist}
										type="button"
									>
										New playlist
									</button>
								) : null}
								<p className="text-xs text-zinc-500">{discoveryCountLabel}</p>
							</div>
						</div>

						{discoveryDrilldown ? (
							<div className="mb-3 space-y-2">
								<div className="flex flex-wrap items-center gap-2">
									<button
										className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 transition hover:bg-zinc-800"
										onClick={handleBackFromDrilldown}
										type="button"
									>
										Back to {activeView}
									</button>
									{effectiveDiscoveryView === "Songs" && sortedDiscoveryItems.length > 0 ? (
										<button
											className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200 transition hover:bg-emerald-500/20"
											onClick={handlePlayAllDiscoverySongs}
											type="button"
										>
											Play all results
										</button>
									) : null}
									{effectiveDiscoveryView === "Songs" && hasDiscoverySongs ? (
										<button
											className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 transition hover:bg-zinc-800"
											onClick={handleQueueAllDiscoverySongs}
											type="button"
										>
											Queue all results
										</button>
									) : null}
									{isPlaylistDrilldown ? (
										<>
											<button
												className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
												disabled={playlistActionPending}
												onClick={handleRenameCurrentPlaylist}
												type="button"
											>
												Rename
											</button>
											<button
												className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
												disabled={playlistActionPending || !currentSong}
												onClick={handleAddCurrentSongToPlaylist}
												type="button"
											>
												Add current song
											</button>
											<button
												className="rounded-md border border-red-500/50 px-2 py-1 text-xs text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
												disabled={playlistActionPending}
												onClick={handleDeleteCurrentPlaylist}
												type="button"
											>
												Delete
											</button>
										</>
									) : null}
								</div>

								{drilldownDetail ? (
									<div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
										<p className="text-sm font-medium text-zinc-100">{drilldownDetail.title}</p>
										{drilldownDetail.subtitle ? (
											<p className="text-xs text-zinc-400">{drilldownDetail.subtitle}</p>
										) : null}
										{drilldownDetail.meta ? <p className="text-xs text-zinc-500">{drilldownDetail.meta}</p> : null}
										{drilldownDetail.description ? (
											<p className="mt-1 line-clamp-2 text-xs text-zinc-400">{drilldownDetail.description}</p>
										) : null}
										{drilldownDetailLoading ? (
											<p className="mt-1 text-xs text-zinc-500">Loading details...</p>
										) : null}
									</div>
								) : null}

								{discoveryDrilldown.sourceView === "Artists" && artistRelatedAlbums.length > 0 ? (
									<div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
										<p className="mb-2 text-xs uppercase tracking-[0.08em] text-zinc-500">Albums</p>
										<ul className="flex max-w-full gap-2 overflow-x-auto pb-1">
											{artistRelatedAlbums.map((item) => (
												<li key={item.id}>
													<button
														className="rounded-md border border-zinc-700 px-2 py-1 text-left text-xs text-zinc-300 transition hover:bg-zinc-800"
														onClick={() => handleOpenAlbumDrilldown(item)}
														type="button"
													>
														<p className="whitespace-nowrap">{item.title}</p>
														{item.meta ? <p className="whitespace-nowrap text-zinc-500">{item.meta}</p> : null}
													</button>
												</li>
											))}
										</ul>
									</div>
								) : null}
							</div>
						) : null}

						<div className="mb-4 grid gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 md:grid-cols-[1fr_auto_auto_auto]">
							<input
								className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500"
								onChange={(event) => setDiscoverySearch(event.target.value)}
								placeholder={`Search ${(discoveryDrilldown ? "songs" : activeView).toLowerCase()}...`}
								type="search"
								value={discoverySearch}
							/>
							<select
								className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500"
								onChange={(event) => setDiscoverySortField(event.target.value as DiscoverySortField)}
								value={discoverySortField}
							>
								{discoverySortOptions.map((option) => (
									<option key={option.value} value={option.value}>
										Sort by {option.label}
									</option>
								))}
							</select>
							<button
								className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800"
								onClick={handleToggleDiscoverySortOrder}
								type="button"
							>
								Sort: {discoverySortOrder}
							</button>
							<div className="flex items-center justify-between gap-2 rounded-md border border-zinc-700 px-2 py-1 md:justify-end">
								<button
									className="rounded px-2 py-1 text-xs text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
									disabled={!canDiscoveryPrevious || discoveryLoading}
									onClick={() => setDiscoveryPage((current) => Math.max(0, current - 1))}
									type="button"
								>
									Prev
								</button>
								<span className="text-xs text-zinc-500">{discoveryPageLabel}</span>
								<button
									className="rounded px-2 py-1 text-xs text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
									disabled={!canDiscoveryNext || discoveryLoading}
									onClick={() => setDiscoveryPage((current) => current + 1)}
									type="button"
								>
									Next
								</button>
							</div>
						</div>

						{loading ? <p className="text-sm text-zinc-400">Loading songs...</p> : null}
						{error ? <p className="text-sm text-red-300">{error}</p> : null}
						{discoveryLoading ? <p className="text-sm text-zinc-400">Loading {activeView.toLowerCase()}...</p> : null}
						{discoveryError ? <p className="text-sm text-red-300">{discoveryError}</p> : null}
						{playlistActionNotice ? (
							<p className={`text-sm ${playlistActionNotice.isError ? "text-red-300" : "text-emerald-300"}`}>
								{playlistActionNotice.text}
							</p>
						) : null}

						{!discoveryLoading && !discoveryError && sortedDiscoveryItems.length === 0 ? (
							<div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-950/40 px-4 text-center text-sm text-zinc-400">
								No {(discoveryDrilldown ? "songs" : activeView).toLowerCase()} found for this filter.
							</div>
						) : null}

						{!discoveryLoading && !discoveryError && sortedDiscoveryItems.length > 0 && effectiveDiscoveryView === "Songs" ? (
							<ul className="max-h-[520px] space-y-2 overflow-auto pr-1">
								{sortedDiscoveryItems.map((item) => {
									const song = item.song;
									if (!song) {
										return null;
									}

									const isActive = song.id === currentSongId;
									const playlistIndex = isPlaylistDrilldown
										? discoveryItems.findIndex((candidate) => candidate.song?.id === song.id)
										: -1;
									const canMoveUp = isPlaylistDrilldown && playlistIndex > 0;
									const canMoveDown =
										isPlaylistDrilldown && playlistIndex >= 0 && playlistIndex < discoveryItems.length - 1;

									return (
										<li key={song.id}>
											<div className="flex items-center gap-2">
												<button
													className={`w-full rounded-lg border px-3 py-2 text-left transition ${
														isActive
															? "border-emerald-400/60 bg-emerald-500/10"
															: "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
													}`}
													onClick={() => handleSelectDiscoverySong(item)}
													type="button"
												>
													<p className="font-medium">{song.title}</p>
													<p className="text-xs text-zinc-400">{song.artist ?? "Unknown artist"}</p>
												</button>
												{isPlaylistDrilldown ? (
													<div className="flex shrink-0 items-center gap-1">
														<button
															className="rounded-md border border-zinc-700 px-2 py-2 text-xs text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
															disabled={playlistActionPending || !canMoveUp}
															onClick={() => {
																void handleMovePlaylistSong(song.id, "up");
															}}
															type="button"
														>
															Up
														</button>
														<button
															className="rounded-md border border-zinc-700 px-2 py-2 text-xs text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
															disabled={playlistActionPending || !canMoveDown}
															onClick={() => {
																void handleMovePlaylistSong(song.id, "down");
															}}
															type="button"
														>
															Down
														</button>
														<button
															className="rounded-md border border-zinc-700 px-2 py-2 text-xs text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
															disabled={playlistActionPending}
															onClick={() => {
																void handleRemoveSongFromPlaylist(song.id);
															}}
															type="button"
														>
															Remove
														</button>
													</div>
												) : null}
											</div>
										</li>
									);
								})}
							</ul>
						) : null}

						{!discoveryLoading && !discoveryError && sortedDiscoveryItems.length > 0 && effectiveDiscoveryView !== "Songs" ? (
							<ul className="grid max-h-[520px] grid-cols-1 gap-2 overflow-auto pr-1 sm:grid-cols-2">
								{sortedDiscoveryItems.map((item) => {
									const itemCoverUrl =
										session && item.coverArtId ? buildCoverArtUrl(session, item.coverArtId) : undefined;

									return (
										<li key={item.id}>
											<button
												className={`flex h-full w-full gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-left transition ${
														isDiscoveryCardActionable ? "hover:border-zinc-700" : ""
												}`}
												disabled={!isDiscoveryCardActionable}
												onClick={() => handleOpenDiscoveryDrilldown(item)}
												type="button"
											>
												<div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-zinc-800 bg-zinc-900">
													{itemCoverUrl ? (
														<Image
															alt={item.title}
															className="object-cover"
															fill
															sizes="48px"
															src={itemCoverUrl}
														/>
													) : null}
												</div>
												<div className="min-w-0">
													<p className="truncate text-sm font-medium text-zinc-100">{item.title}</p>
													{item.subtitle ? <p className="truncate text-xs text-zinc-400">{item.subtitle}</p> : null}
													{item.meta ? <p className="truncate text-xs text-zinc-500">{item.meta}</p> : null}
												</div>
											</button>
										</li>
									);
								})}
							</ul>
						) : null}
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
				onToggleRepeat={handleToggleRepeat}
				onSeek={handleSeek}
				onToggleRandom={handleToggleRandom}
				onVolumeChange={handleVolumeChange}
				repeatMode={repeatMode}
				songAlbum={currentSong?.album}
				songArtist={currentSong?.artist}
				songTitle={currentSong?.title}
				volume={volume}
			/>
		</div>
	);
}