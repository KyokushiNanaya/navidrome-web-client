import Image from "next/image";

import type { NavidromeSession } from "@/lib/navidrome-session";
import type { Song } from "@/lib/player-types";
import { buildCoverArtUrl } from "@/lib/player-utils";

type QueuePanelProps = {
	currentSongId: string | null;
	onClearQueue: () => void;
	onClose: () => void;
	onRemoveSong: (songId: string) => void;
	onSelectSong: (songId: string) => void;
	session: NavidromeSession | null;
	songs: Song[];
};

export default function QueuePanel({
	currentSongId,
	onClearQueue,
	onClose,
	onRemoveSong,
	onSelectSong,
	session,
	songs,
}: QueuePanelProps) {
	const currentIndex = songs.findIndex((s) => s.id === currentSongId);

	return (
		<div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/95 shadow-2xl">
			{/* Header */}
			<div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
				<div>
					<h2 className="text-sm font-semibold text-zinc-100">Queue</h2>
					<p className="text-xs text-zinc-500">{songs.length} song{songs.length !== 1 ? "s" : ""}</p>
				</div>
				<div className="flex items-center gap-2">
					{songs.length > 0 ? (
						<button
							className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-400 transition hover:border-red-500/50 hover:text-red-300"
							onClick={onClearQueue}
							type="button"
						>
							Clear all
						</button>
					) : null}
					<button
						aria-label="Close queue"
						className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
						onClick={onClose}
						type="button"
					>
						Close
					</button>
				</div>
			</div>

			{/* Song list */}
			{songs.length === 0 ? (
				<div className="flex min-h-[200px] items-center justify-center px-4 text-center text-sm text-zinc-500">
					Queue is empty. Browse the library and add songs.
				</div>
			) : (
				<ul className="max-h-[520px] overflow-y-auto divide-y divide-zinc-800/50">
					{songs.map((song, index) => {
						const isActive = song.id === currentSongId;
						const coverUrl =
							session && song.coverArtId ? buildCoverArtUrl(session, song.coverArtId) : undefined;

						const positionLabel = index < currentIndex
							? "played"
							: index === currentIndex
								? "now"
								: `+${index - currentIndex}`;

						return (
							<li key={`${song.id}-${index}`}>
								<div
									className={`flex items-center gap-3 px-3 py-2.5 transition ${
										isActive ? "bg-emerald-500/10" : "hover:bg-zinc-800/60"
									}`}
								>
									{/* Position badge */}
									<span
										className={`w-8 shrink-0 text-center text-[10px] font-medium ${
											isActive
												? "text-emerald-400"
												: index < currentIndex
													? "text-zinc-600"
													: "text-zinc-500"
										}`}
									>
										{positionLabel}
									</span>

									{/* Cover art */}
									<div className="relative h-9 w-9 shrink-0 overflow-hidden rounded border border-zinc-700 bg-zinc-800">
										{coverUrl ? (
											<Image
												alt={song.title}
												className="object-cover"
												fill
												sizes="36px"
												src={coverUrl}
											/>
										) : null}
									</div>

									{/* Song info — clickable */}
									<button
										className="min-w-0 flex-1 text-left"
										onClick={() => onSelectSong(song.id)}
										type="button"
									>
										<p
											className={`truncate text-sm font-medium leading-tight ${
												isActive ? "text-emerald-300" : index < currentIndex ? "text-zinc-500" : "text-zinc-100"
											}`}
										>
											{song.title}
										</p>
										<p className="truncate text-xs text-zinc-500">{song.artist ?? "Unknown artist"}</p>
									</button>

									{/* Remove */}
									<button
										aria-label={`Remove ${song.title} from queue`}
										className="shrink-0 rounded p-1 text-zinc-600 transition hover:text-red-400"
										onClick={() => onRemoveSong(song.id)}
										type="button"
									>
										<svg
											className="h-3.5 w-3.5"
											fill="none"
											stroke="currentColor"
											strokeWidth={2}
											viewBox="0 0 24 24"
										>
											<path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
										</svg>
									</button>
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
