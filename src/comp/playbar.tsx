import Image from "next/image";

type PlayBarProps = {
	canGoNext: boolean;
	canGoPrevious: boolean;
	canShuffle: boolean;
	coverArtUrl?: string;
	currentTime: number;
	duration: number;
	isPlaying: boolean;
	isRandom: boolean;
	onDownload: () => void;
	onNext: () => void;
	onPlayPause: () => void;
	onPrevious: () => void;
	onSeek: (value: number) => void;
	onToggleRandom: () => void;
	onVolumeChange: (value: number) => void;
	songAlbum?: string;
	songArtist?: string;
	songTitle?: string;
	volume: number;
};

const formatTime = (seconds: number): string => {
	if (!Number.isFinite(seconds) || seconds <= 0) {
		return "0:00";
	}

	const minutes = Math.floor(seconds / 60);
	const remaining = Math.floor(seconds % 60);

	return `${minutes}:${remaining.toString().padStart(2, "0")}`;
};

export default function PlayBar({
	canGoNext,
	canGoPrevious,
	canShuffle,
	coverArtUrl,
	currentTime,
	duration,
	isPlaying,
	isRandom,
	onDownload,
	onNext,
	onPlayPause,
	onPrevious,
	onSeek,
	onToggleRandom,
	onVolumeChange,
	songAlbum,
	songArtist,
	songTitle,
	volume,
}: PlayBarProps) {
	const max = duration > 0 ? duration : 0;
	const value = Math.min(currentTime, max || 0);
	const safeVolume = Math.max(0, Math.min(1, volume));

	return (
		<footer className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800/80 bg-zinc-900/95 backdrop-blur">
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3">
				<div className="flex items-center justify-between gap-3">
					<div className="flex min-w-0 items-center gap-3">
						<div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-zinc-800 bg-zinc-950">
							{coverArtUrl ? (
								<Image
									alt={songTitle ?? "Cover art"}
									className="object-cover"
									fill
									sizes="48px"
									src={coverArtUrl}
								/>
							) : (
								<div className="flex h-full w-full items-center justify-center text-[10px] text-zinc-500">No Art</div>
							)}
						</div>
						<div className="min-w-0">
							<p className="truncate text-sm font-semibold text-zinc-100">{songTitle ?? "No song selected"}</p>
							<p className="truncate text-xs text-zinc-400">
								{songArtist ?? "Unknown artist"}
								{songAlbum ? ` - ${songAlbum}` : ""}
							</p>
						</div>
					</div>

					<div className="flex flex-wrap items-center justify-end gap-2">
						<button
							aria-label="Toggle random playback"
							className={`rounded-md border px-3 py-1.5 text-sm transition ${
								isRandom ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-300" : "border-zinc-700 text-zinc-200 hover:bg-zinc-800"
							}`}
							disabled={!canShuffle}
							onClick={onToggleRandom}
							type="button"
						>
							Random
						</button>
						<button
							aria-label="Previous song"
							className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
							disabled={!canGoPrevious}
							onClick={onPrevious}
							type="button"
						>
							Prev
						</button>
						<button
							aria-label={isPlaying ? "Pause" : "Play"}
							className="rounded-md bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
							onClick={onPlayPause}
							type="button"
						>
							{isPlaying ? "Pause" : "Play"}
						</button>
						<button
							aria-label="Next song"
							className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
							disabled={!canGoNext}
							onClick={onNext}
							type="button"
						>
							Next
						</button>
						<button
							aria-label="Download current song"
							className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 transition hover:bg-zinc-800"
							onClick={onDownload}
							type="button"
						>
							Download
						</button>
						<div className="flex items-center gap-2 rounded-md border border-zinc-700 px-2 py-1.5">
							<span className="text-xs text-zinc-400">Vol</span>
							<input
								className="h-1 w-24 cursor-pointer accent-emerald-500"
								max={100}
								min={0}
								onChange={(event) => onVolumeChange(Number(event.target.value) / 100)}
								type="range"
								value={Math.round(safeVolume * 100)}
							/>
						</div>
					</div>
				</div>

				<div className="flex items-center gap-3">
					<span className="w-10 text-right text-xs text-zinc-400">{formatTime(currentTime)}</span>
					<input
						className="h-1 w-full cursor-pointer accent-emerald-500"
						max={max}
						min={0}
						onChange={(event) => onSeek(Number(event.target.value))}
						type="range"
						value={Number.isFinite(value) ? value : 0}
					/>
					<span className="w-10 text-xs text-zinc-400">{formatTime(duration)}</span>
				</div>
			</div>
		</footer>
	);
}
