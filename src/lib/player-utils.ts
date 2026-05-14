import type { NavidromeSession } from "./navidrome-session";
import type {
	DiscoveryItem,
	DiscoveryQueryConfig,
	DiscoverySortField,
	DiscoverySortOption,
	DiscoveryView,
	Song,
} from "./player-types";

export const DISCOVERY_PAGE_SIZE = 30;

export const PLAYER_VOLUME_STORAGE_KEY = "navidrome-player-volume";

export const DISCOVERY_QUERY_CONFIG: Record<DiscoveryView, DiscoveryQueryConfig> = {
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

export const DISCOVERY_SORT_OPTIONS: Record<DiscoveryView, DiscoverySortOption[]> = {
	Albums: [
		{ label: "Album", value: "title" },
		{ label: "Artist", value: "subtitle" },
		{ label: "Tracks", value: "meta" },
		{ label: "Recently Played", value: "title", serverSortKey: "play_date" },
		{ label: "Most Played", value: "title", serverSortKey: "play_count" },
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
		{ label: "Recently Played", value: "title", serverSortKey: "play_date" },
		{ label: "Most Played", value: "title", serverSortKey: "play_count" },
	],
	Tags: [
		{ label: "Tag Value", value: "title" },
		{ label: "Tag Name", value: "subtitle" },
	],
};

export const toOptionalNumber = (value: unknown): number | undefined => {
	if (typeof value === "number") {
		return value;
	}

	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}

	return undefined;
};

const asRecordArray = (value: unknown): Record<string, unknown>[] => {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
};

export const asSongList = (value: unknown): Song[] => {
	if (Array.isArray(value)) {
		return value
			.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
			.map((item) => {
				const playableId =
					typeof item.mediaFileId === "string"
						? item.mediaFileId
						: typeof item.songId === "string"
							? item.songId
							: typeof item.mediaFile?.id === "string"
								? item.mediaFile.id
								: typeof item.media_file_id === "string"
									? item.media_file_id
									: typeof item.song_id === "string"
										? item.song_id
										: typeof item.id === "string"
											? item.id
											: undefined;

				return {
					album: typeof item.album === "string" ? item.album : undefined,
					artist: typeof item.artist === "string" ? item.artist : undefined,
					coverArtId:
						typeof item.coverArtId === "string"
							? item.coverArtId
							: typeof item.albumId === "string"
								? item.albumId
								: playableId,
					duration: typeof item.duration === "number" ? item.duration : undefined,
					id: playableId ?? "",
					starred: item.starred === true || item.starred === 1,
					title: typeof item.title === "string" ? item.title : "Untitled",
				};
			})
			.filter((song) => song.id.length > 0);
	}

	if (value && typeof value === "object") {
		const maybeContainer = value as { data?: unknown; items?: unknown };
		return asSongList(maybeContainer.items ?? maybeContainer.data);
	}

	return [];
};

export const asRelatedAlbumItems = (value: unknown): DiscoveryItem[] => {
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

export const asDiscoveryItems = (view: DiscoveryView, value: unknown): DiscoveryItem[] => {
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

export const getTotalCountFromHeaders = (result: { headers?: Record<string, string> }, fallback: number): number => {
	const countRaw = result.headers?.["x-total-count"] ?? result.headers?.["X-Total-Count"];
	if (!countRaw) {
		return fallback;
	}

	const parsed = Number(countRaw);
	return Number.isFinite(parsed) ? parsed : fallback;
};

export const formatDuration = (seconds?: number): string => {
	if (!seconds || seconds <= 0) {
		return "--:--";
	}

	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = Math.floor(seconds % 60);

	return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

export const buildStreamUrl = (session: NavidromeSession, songId: string): string => {
	const query = new URLSearchParams({
		credential: session.streamCredential,
		songId,
		serverUrl: session.serverUrl,
		token: session.token,
	});

	return `/api/navidrome-stream?${query.toString()}`;
};

export const buildCoverArtUrl = (session: NavidromeSession, coverArtId: string): string => {
	const query = new URLSearchParams({
		credential: session.streamCredential,
		coverArtId,
		serverUrl: session.serverUrl,
		token: session.token,
	});

	return `/api/navidrome-cover?${query.toString()}`;
};

export const buildDownloadUrl = (session: NavidromeSession, song: Song): string => {
	const query = new URLSearchParams({
		credential: session.streamCredential,
		name: song.title,
		serverUrl: session.serverUrl,
		songId: song.id,
		token: session.token,
	});

	return `/api/navidrome-download?${query.toString()}`;
};

export const buildSubsonicUrl = (
	session: NavidromeSession,
	endpoint: string,
	params?: Record<string, string>,
): string => {
	const query = new URLSearchParams({
		credential: session.streamCredential,
		endpoint,
		serverUrl: session.serverUrl,
		token: session.token,
	});

	if (params && Object.keys(params).length > 0) {
		query.set("params", new URLSearchParams(params).toString());
	}

	return `/api/navidrome-subsonic?${query.toString()}`;
};

export type RepeatMode = "all" | "off" | "one";

export const cycleRepeatMode = (current: RepeatMode): RepeatMode => {
	if (current === "off") return "all";
	if (current === "all") return "one";
	return "off";
};

export const isEditableTarget = (target: EventTarget | null): boolean => {
	if (!(target instanceof HTMLElement)) {
		return false;
	}

	const editableTag = target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA";
	return editableTag || target.isContentEditable;
};

export const sortDiscoveryItems = (
	items: DiscoveryItem[],
	field: DiscoverySortField,
	order: "ASC" | "DESC",
): DiscoveryItem[] => {
	const compareDir = order === "ASC" ? 1 : -1;
	const fieldMap: Record<DiscoverySortField, keyof DiscoveryItem> = {
		meta: "meta",
		subtitle: "subtitle",
		title: "title",
	};
	const targetField = fieldMap[field];

	return [...items].sort((a, b) => {
		const aRaw = (a[targetField] ?? "") as string;
		const bRaw = (b[targetField] ?? "") as string;
		return aRaw.localeCompare(bRaw, undefined, { sensitivity: "base" }) * compareDir;
	});
};
