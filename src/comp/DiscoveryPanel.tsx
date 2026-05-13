import Image from "next/image";
import { useCallback } from "react";
import { modals } from "@mantine/modals";
import { Text, TextInput } from "@mantine/core";

import type { NavidromeSession } from "@/lib/navidrome-session";
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
import { DISCOVERY_PAGE_SIZE } from "@/lib/player-utils";
import {
	buildCoverArtUrl,
	DISCOVERY_QUERY_CONFIG,
	DISCOVERY_SORT_OPTIONS,
	sortDiscoveryItems,
} from "@/lib/player-utils";

type DiscoveryPanelProps = {
	// State
	activeView: DiscoveryView;
	artistRelatedAlbums: DiscoveryItem[];
	currentSong: Song | null;
	discoveryDrilldown: DiscoveryDrilldown | null;
	discoveryError: string | null;
	discoveryItems: DiscoveryItem[];
	discoveryLoading: boolean;
	discoveryPage: number;
	discoverySearch: string;
	discoverySortField: DiscoverySortField;
	discoverySortOrder: "ASC" | "DESC";
	discoveryTotal: number;
	drilldownDetail: DrilldownDetail | null;
	drilldownDetailLoading: boolean;
	error: string | null;
	loading: boolean;
	playlistActionNotice: ActionNotice | null;
	playlistActionPending: boolean;
	currentSongId: string | null;
	session: NavidromeSession | null;
	showQueue: boolean;

	// Callbacks
	callNavidromeApi: (payload: Record<string, unknown>) => Promise<ApiRouteResult>;
	onAddCurrentSongToPlaylist: () => void;
	onBackFromDrilldown: () => void;
	onDeletePlaylist: () => void;
	onOpenAlbumDrilldown: (item: DiscoveryItem) => void;
	onOpenDrilldown: (item: DiscoveryItem) => void;
	onPlayAllDiscoverySongs: () => void;
	onQueueAllDiscoverySongs: () => void;
	onRefreshDiscovery: () => void;
	onRemoveSongFromPlaylist: (songId: string) => void;
	onMoveSongInPlaylist: (songId: string, direction: "up" | "down") => void;
	onSelectDiscoverySong: (item: DiscoveryItem) => void;
	onSetActiveView: (view: DiscoveryView) => void;
	onSetDiscoveryPage: (page: number | ((p: number) => number)) => void;
	onSetDiscoverySearch: (search: string) => void;
	onSetDiscoverySortField: (field: DiscoverySortField) => void;
	onSetDiscoverySortOrder: (order: "ASC" | "DESC") => void;
	onSetSortOption: (field: DiscoverySortField, serverSortKey: string | undefined) => void;
	onSetPlaylistActionNotice: (notice: ActionNotice | null) => void;
	onSetPlaylistActionPending: (pending: boolean) => void;
	onToggleQueue: () => void;
	onStarSong: (song: Song) => void;
};

export default function DiscoveryPanel({
	activeView,
	artistRelatedAlbums,
	currentSong,
	discoveryDrilldown,
	discoveryError,
	discoveryItems,
	discoveryLoading,
	discoveryPage,
	discoverySearch,
	discoverySortField,
	discoverySortOrder,
	discoveryTotal,
	drilldownDetail,
	drilldownDetailLoading,
	error,
	loading,
	playlistActionNotice,
	playlistActionPending,
	currentSongId,
	session,
	showQueue,
	callNavidromeApi,
	onAddCurrentSongToPlaylist,
	onBackFromDrilldown,
	onDeletePlaylist,
	onOpenAlbumDrilldown,
	onOpenDrilldown,
	onPlayAllDiscoverySongs,
	onQueueAllDiscoverySongs,
	onRefreshDiscovery,
	onRemoveSongFromPlaylist,
	onMoveSongInPlaylist,
	onSelectDiscoverySong,
	onSetActiveView,
	onSetDiscoveryPage,
	onSetDiscoverySearch,
	onSetDiscoverySortField,
	onSetDiscoverySortOrder,
	onSetPlaylistActionNotice,
	onSetPlaylistActionPending,
	onToggleQueue,
	onStarSong,
	onSetSortOption,
}: DiscoveryPanelProps) {
	const isPlaylistDrilldown = discoveryDrilldown?.sourceView === "Playlists";
	const effectiveDiscoveryView: DiscoveryView = discoveryDrilldown ? "Songs" : activeView;
	const discoverySortOptions = DISCOVERY_SORT_OPTIONS[effectiveDiscoveryView];

	const supportsDrilldown =
		activeView === "Albums" || activeView === "Artists" || activeView === "Genres" || activeView === "Playlists";
	const isDiscoveryCardActionable = supportsDrilldown || activeView === "Tags";

	const canDiscoveryPrevious = discoveryPage > 0;
	const canDiscoveryNext =
		discoveryTotal > 0
			? (discoveryPage + 1) * DISCOVERY_PAGE_SIZE < discoveryTotal
			: discoveryItems.length >= DISCOVERY_PAGE_SIZE;

	const sortedDiscoveryItems = (() => {
		if (isPlaylistDrilldown && effectiveDiscoveryView === "Songs") {
			return discoveryItems;
		}
		return sortDiscoveryItems(discoveryItems, discoverySortField, discoverySortOrder);
	})();

	const discoverySongs = effectiveDiscoveryView === "Songs"
		? sortedDiscoveryItems.map((item) => item.song).filter((s): s is Song => Boolean(s))
		: [];

	const hasDiscoverySongs = discoverySongs.length > 0;
	const discoveryCountLabel =
		discoveryTotal > 0 ? `${discoveryTotal} total` : `${discoveryItems.length} shown`;
	const discoveryPageLabel = `Page ${discoveryPage + 1}`;

	// --- Playlist modal handlers (use Mantine modals instead of window.prompt/confirm) ---

	const handleCreatePlaylist = useCallback(() => {
		if (!session || playlistActionPending) return;

		let inputValue = "New Playlist";

		modals.open({
			title: "New Playlist",
			children: (
				<div className="flex flex-col gap-4">
					<TextInput
						defaultValue={inputValue}
						label="Playlist name"
						onChange={(e) => { inputValue = e.currentTarget.value; }}
						placeholder="My playlist"
					/>
					<div className="flex justify-end gap-2">
						<button
							className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
							onClick={() => modals.closeAll()}
							type="button"
						>
							Cancel
						</button>
						<button
							className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
							onClick={async () => {
								const name = inputValue.trim();
								if (!name) {
									onSetPlaylistActionNotice({ isError: true, text: "Playlist name cannot be empty." });
									modals.closeAll();
									return;
								}
								modals.closeAll();
								onSetPlaylistActionPending(true);
								onSetPlaylistActionNotice(null);
								try {
									const body = await callNavidromeApi({
										body: { name },
										controller: "createPlaylist",
										path: "playlist",
										serverUrl: `${session.serverUrl}/api`,
										token: session.token,
									});
									if (body.error || body.status < 200 || body.status >= 300) {
										onSetPlaylistActionNotice({ isError: true, text: body.error ?? `Unable to create playlist (${body.status})` });
										return;
									}
									onSetPlaylistActionNotice({ isError: false, text: `Playlist "${name}" created.` });
									onRefreshDiscovery();
								} catch {
									onSetPlaylistActionNotice({ isError: true, text: "Unable to create playlist right now." });
								} finally {
									onSetPlaylistActionPending(false);
								}
							}}
							type="button"
						>
							Create
						</button>
					</div>
				</div>
			),
		});
	}, [session, playlistActionPending, callNavidromeApi, onRefreshDiscovery, onSetPlaylistActionNotice, onSetPlaylistActionPending]);

	const handleRenamePlaylist = useCallback(() => {
		if (!session || playlistActionPending || discoveryDrilldown?.sourceView !== "Playlists") return;
		const playlistId = discoveryDrilldown.pathParams?.id;
		if (!playlistId) return;

		let inputValue = discoveryDrilldown.title;

		modals.open({
			title: "Rename Playlist",
			children: (
				<div className="flex flex-col gap-4">
					<TextInput
						defaultValue={inputValue}
						label="New name"
						onChange={(e) => { inputValue = e.currentTarget.value; }}
					/>
					<div className="flex justify-end gap-2">
						<button
							className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
							onClick={() => modals.closeAll()}
							type="button"
						>
							Cancel
						</button>
						<button
							className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
							onClick={async () => {
								const name = inputValue.trim();
								if (!name) {
									onSetPlaylistActionNotice({ isError: true, text: "Playlist name cannot be empty." });
									modals.closeAll();
									return;
								}
								modals.closeAll();
								onSetPlaylistActionPending(true);
								onSetPlaylistActionNotice(null);
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
										onSetPlaylistActionNotice({ isError: true, text: body.error ?? `Unable to rename playlist (${body.status})` });
										return;
									}
									// Update drilldown title via parent callback (we'll handle via onRefreshDiscovery + onSetActiveView roundtrip)
									// For now: signal success and let parent re-fetch
									onSetPlaylistActionNotice({ isError: false, text: "Playlist renamed." });
									onRefreshDiscovery();
								} catch {
									onSetPlaylistActionNotice({ isError: true, text: "Unable to rename playlist right now." });
								} finally {
									onSetPlaylistActionPending(false);
								}
							}}
							type="button"
						>
							Rename
						</button>
					</div>
				</div>
			),
		});
	}, [session, playlistActionPending, discoveryDrilldown, callNavidromeApi, onRefreshDiscovery, onSetPlaylistActionNotice, onSetPlaylistActionPending]);

	const handleDeletePlaylist = useCallback(() => {
		if (!session || playlistActionPending || discoveryDrilldown?.sourceView !== "Playlists") return;

		modals.openConfirmModal({
			title: "Delete Playlist",
			children: (
				<Text size="sm">
					Delete &quot;{discoveryDrilldown.title}&quot;? This action cannot be undone.
				</Text>
			),
			labels: { confirm: "Delete", cancel: "Cancel" },
			confirmProps: { color: "red" },
			onConfirm: onDeletePlaylist,
		});
	}, [session, playlistActionPending, discoveryDrilldown, onDeletePlaylist]);

	return (
		<main className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
			{/* Header */}
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
					{/* Queue toggle button */}
					<button
						className={`rounded-md border px-2 py-1 text-xs transition ${
							showQueue
								? "border-emerald-400/60 bg-emerald-500/15 text-emerald-300"
								: "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
						}`}
						onClick={onToggleQueue}
						type="button"
					>
						Queue
					</button>
				</div>
			</div>

			{/* Tab nav */}
			<nav className="mb-3 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/40 p-1.5">
				<ul className="flex w-max items-center gap-1">
					{DISCOVERY_VIEWS.map((view) => {
						const isActive = activeView === view;
						return (
							<li key={view}>
								<button
									className={`rounded-md px-3 py-1.5 text-sm transition ${
										isActive
											? "bg-emerald-500/20 text-emerald-300"
											: "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
									}`}
									onClick={() => onSetActiveView(view)}
									type="button"
								>
									{view}
								</button>
							</li>
						);
					})}
				</ul>
			</nav>

			{/* Drilldown header */}
			{discoveryDrilldown ? (
				<div className="mb-3 space-y-2">
					<div className="flex flex-wrap items-center gap-2">
						<button
							className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 transition hover:bg-zinc-800"
							onClick={onBackFromDrilldown}
							type="button"
						>
							&larr; Back to {activeView}
						</button>
						{effectiveDiscoveryView === "Songs" && sortedDiscoveryItems.length > 0 ? (
							<button
								className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200 transition hover:bg-emerald-500/20"
								onClick={onPlayAllDiscoverySongs}
								type="button"
							>
								Play all
							</button>
						) : null}
						{effectiveDiscoveryView === "Songs" && hasDiscoverySongs ? (
							<button
								className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 transition hover:bg-zinc-800"
								onClick={onQueueAllDiscoverySongs}
								type="button"
							>
								Queue all
							</button>
						) : null}
						{isPlaylistDrilldown ? (
							<>
								<button
									className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
									disabled={playlistActionPending}
									onClick={handleRenamePlaylist}
									type="button"
								>
									Rename
								</button>
								<button
									className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
									disabled={playlistActionPending || !currentSong}
									onClick={onAddCurrentSongToPlaylist}
									type="button"
								>
									Add current song
								</button>
								<button
									className="rounded-md border border-red-500/50 px-2 py-1 text-xs text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
									disabled={playlistActionPending}
									onClick={handleDeletePlaylist}
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

					{/* Artist's related albums */}
					{discoveryDrilldown.sourceView === "Artists" && artistRelatedAlbums.length > 0 ? (
						<div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
							<p className="mb-2 text-xs uppercase tracking-[0.08em] text-zinc-500">Albums</p>
							<ul className="flex max-w-full gap-2 overflow-x-auto pb-1">
								{artistRelatedAlbums.map((item) => (
									<li key={item.id}>
										<button
											className="rounded-md border border-zinc-700 px-2 py-1 text-left text-xs text-zinc-300 transition hover:bg-zinc-800"
											onClick={() => onOpenAlbumDrilldown(item)}
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

			{/* Search / Sort / Pagination controls */}
			<div className="mb-4 grid gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 sm:grid-cols-[1fr_auto_auto_auto]">
				<input
					className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500"
					onChange={(event) => onSetDiscoverySearch(event.target.value)}
					placeholder={`Search ${(discoveryDrilldown ? "songs" : activeView).toLowerCase()}...`}
					type="search"
					value={discoverySearch}
				/>
				<select
					className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500"
					onChange={(event) => {
						const parsed = JSON.parse(event.target.value) as { field: DiscoverySortField; serverSortKey?: string };
						onSetSortOption(parsed.field, parsed.serverSortKey);
						onSetDiscoverySortField(parsed.field);
					}}
					value={JSON.stringify({ field: discoverySortField })}
				>
					{discoverySortOptions.map((option) => (
						<option
							key={`${option.value}-${option.serverSortKey ?? ""}`}
							value={JSON.stringify({ field: option.value, serverSortKey: option.serverSortKey })}
						>
							Sort: {option.label}
						</option>
					))}
				</select>
				<button
					className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800"
					onClick={() => onSetDiscoverySortOrder(discoverySortOrder === "ASC" ? "DESC" : "ASC")}
					type="button"
				>
					{discoverySortOrder === "ASC" ? "A→Z" : "Z→A"}
				</button>
				<div className="flex items-center justify-between gap-2 rounded-md border border-zinc-700 px-2 py-1 sm:justify-end">
					<button
						className="rounded px-2 py-1 text-xs text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
						disabled={!canDiscoveryPrevious || discoveryLoading}
						onClick={() => onSetDiscoveryPage((p) => Math.max(0, p - 1))}
						type="button"
					>
						Prev
					</button>
					<span className="text-xs text-zinc-500">{discoveryPageLabel}</span>
					<button
						className="rounded px-2 py-1 text-xs text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
						disabled={!canDiscoveryNext || discoveryLoading}
						onClick={() => onSetDiscoveryPage((p) => p + 1)}
						type="button"
					>
						Next
					</button>
				</div>
			</div>

			{/* Status messages */}
			{loading ? <p className="mb-2 text-sm text-zinc-400">Loading songs...</p> : null}
			{error ? <p className="mb-2 text-sm text-red-300">{error}</p> : null}
			{discoveryLoading ? <p className="mb-2 text-sm text-zinc-400">Loading {activeView.toLowerCase()}...</p> : null}
			{discoveryError ? <p className="mb-2 text-sm text-red-300">{discoveryError}</p> : null}
			{playlistActionNotice ? (
				<p className={`mb-2 text-sm ${playlistActionNotice.isError ? "text-red-300" : "text-emerald-300"}`}>
					{playlistActionNotice.text}
				</p>
			) : null}

			{/* Empty state */}
			{!discoveryLoading && !discoveryError && sortedDiscoveryItems.length === 0 ? (
				<div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-950/40 px-4 text-center text-sm text-zinc-400">
					No {(discoveryDrilldown ? "songs" : activeView).toLowerCase()} found for this filter.
				</div>
			) : null}

			{/* Song list view */}
			{!discoveryLoading && !discoveryError && sortedDiscoveryItems.length > 0 && effectiveDiscoveryView === "Songs" ? (
				<ul className="max-h-[520px] space-y-1.5 overflow-auto pr-1">
					{sortedDiscoveryItems.map((item) => {
						const song = item.song;
						if (!song) return null;

						const isActive = song.id === currentSongId;
						const playlistIndex = isPlaylistDrilldown
							? discoveryItems.findIndex((c) => c.song?.id === song.id)
							: -1;
						const canMoveUp = isPlaylistDrilldown && playlistIndex > 0;
						const canMoveDown =
							isPlaylistDrilldown && playlistIndex >= 0 && playlistIndex < discoveryItems.length - 1;

						return (
							<li key={song.id}>
								<div className="flex items-center gap-1.5">
									<button
										className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
											isActive
												? "border-emerald-400/60 bg-emerald-500/10"
												: "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
										}`}
										onClick={() => handleSelectDiscoverySong(item)}
										type="button"
									>
										<div className="min-w-0 flex-1">
											<p className="truncate text-sm font-medium">{song.title}</p>
											<p className="truncate text-xs text-zinc-400">{song.artist ?? "Unknown artist"}</p>
										</div>
										{/* Star indicator */}
										{song.starred ? (
											<span className="shrink-0 text-emerald-400" title="Starred">★</span>
										) : null}
									</button>

									{/* Star button */}
									<button
										aria-label={song.starred ? "Unstar song" : "Star song"}
										className={`shrink-0 rounded-md border px-2 py-2 text-sm transition ${
											song.starred
												? "border-emerald-400/60 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
												: "border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
										}`}
										onClick={() => onStarSong(song)}
										title={song.starred ? "Unstar" : "Star"}
										type="button"
									>
										{song.starred ? "★" : "☆"}
									</button>

									{/* Playlist controls */}
									{isPlaylistDrilldown ? (
										<div className="flex shrink-0 items-center gap-1">
											<button
												className="rounded-md border border-zinc-700 px-2 py-2 text-xs text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
												disabled={playlistActionPending || !canMoveUp}
												onClick={() => onMoveSongInPlaylist(song.id, "up")}
												type="button"
											>
												↑
											</button>
											<button
												className="rounded-md border border-zinc-700 px-2 py-2 text-xs text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
												disabled={playlistActionPending || !canMoveDown}
												onClick={() => onMoveSongInPlaylist(song.id, "down")}
												type="button"
											>
												↓
											</button>
											<button
												className="rounded-md border border-zinc-700 px-2 py-2 text-xs text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
												disabled={playlistActionPending}
												onClick={() => onRemoveSongFromPlaylist(song.id)}
												type="button"
											>
												✕
											</button>
										</div>
									) : null}
								</div>
							</li>
						);
					})}
				</ul>
			) : null}

			{/* Card grid view */}
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
									onClick={() => onOpenDrilldown(item)}
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
										{item.subtitle ? (
											<p className="truncate text-xs text-zinc-400">{item.subtitle}</p>
										) : null}
										{item.meta ? (
											<p className="truncate text-xs text-zinc-500">{item.meta}</p>
										) : null}
									</div>
								</button>
							</li>
						);
					})}
				</ul>
			) : null}
		</main>
	);

	function handleSelectDiscoverySong(item: DiscoveryItem) {
		onSelectDiscoverySong(item);
	}
}
