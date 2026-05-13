// Shared types for the player

export type Song = {
	album?: string;
	artist?: string;
	coverArtId?: string;
	duration?: number;
	id: string;
	starred?: boolean;
	title: string;
};

export type QueueResponse = {
	current?: number;
	items?: unknown;
	position?: number;
};

export type RepeatMode = "all" | "off" | "one";

export const DISCOVERY_VIEWS = ["Songs", "Albums", "Artists", "Genres", "Tags", "Playlists"] as const;
export type DiscoveryView = (typeof DISCOVERY_VIEWS)[number];

export type DiscoveryItem = {
	coverArtId?: string;
	id: string;
	meta?: string;
	song?: Song;
	subtitle?: string;
	title: string;
};

export type DiscoveryQueryConfig = {
	controller: string;
	path: string;
	searchKey?: string;
	sortKey: string;
};

export type DiscoverySortField = "meta" | "subtitle" | "title";

export type DiscoverySortOption = {
	label: string;
	/** Server-side _sort param override (if different from the field's default sortKey) */
	serverSortKey?: string;
	value: DiscoverySortField;
};

export type DrilldownDetail = {
	description?: string;
	meta?: string;
	subtitle?: string;
	title: string;
};

export type DiscoveryDrilldown = {
	controller: string;
	path: string;
	pathParams?: Record<string, string>;
	meta?: string;
	sourceView: DiscoveryView;
	subtitle?: string;
	title: string;
};

export type ActionNotice = {
	isError: boolean;
	text: string;
};

export type ApiRouteResult = {
	data?: unknown;
	error?: string;
	headers?: Record<string, string>;
	status: number;
};

export type LyricsData = {
	artist?: string;
	title?: string;
	value?: string;
};
