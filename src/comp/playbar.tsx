import { useState } from "react";
import Image from "next/image";

import type { EqualizerBand, EqualizerPreset } from "@/lib/player-types";

type PlayBarProps = {
	canGoNext: boolean;
	canGoPrevious: boolean;
	canShuffle: boolean;
	coverArtUrl?: string;
	currentTime: number;
	duration: number;
	equalizerBands: EqualizerBand[];
	equalizerEnabled: boolean;
	equalizerPreset: string;
	equalizerPresets: EqualizerPreset[];
	isPlaying: boolean;
	isRandom: boolean;
	onDownload: () => void;
	onEqualizerBandChange: (index: number, gain: number) => void;
	onEqualizerEnabledChange: (enabled: boolean) => void;
	onEqualizerPresetChange: (preset: string) => void;
	onEqualizerReset: () => void;
	onNext: () => void;
	onPlayPause: () => void;
	onPrevious: () => void;
	onToggleRepeat: () => void;
	onSeek: (value: number) => void;
	onToggleRandom: () => void;
	onVolumeChange: (value: number) => void;
	repeatMode: "all" | "off" | "one";
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
	equalizerBands,
	equalizerEnabled,
	equalizerPreset,
	equalizerPresets,
	isPlaying,
	isRandom,
	onDownload,
	onEqualizerBandChange,
	onEqualizerEnabledChange,
	onEqualizerPresetChange,
	onEqualizerReset,
	onNext,
	onPlayPause,
	onPrevious,
	onToggleRepeat,
	onSeek,
	onToggleRandom,
	onVolumeChange,
	repeatMode,
	songAlbum,
	songArtist,
	songTitle,
	volume,
}: PlayBarProps) {
	const [showEqualizer, setShowEqualizer] = useState(false);
	const max = duration > 0 ? duration : 0;
	const value = Math.min(currentTime, max || 0);
	const safeVolume = Math.max(0, Math.min(1, volume));

	return (
		<footer className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800/80 bg-zinc-900/95 backdrop-blur">
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3">
				{showEqualizer ? (
					<div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-3">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div>
								<p className="text-sm font-semibold text-zinc-100">10-Band Equalizer</p>
								<p className="text-xs text-zinc-500">Adjust gain from -12 dB to +12 dB.</p>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<label className="flex items-center gap-2 rounded-md border border-zinc-700 px-2 py-1.5 text-xs text-zinc-400">
									Preset
									<select
										className="bg-zinc-950 text-sm text-zinc-100 outline-none"
										onChange={(event) => onEqualizerPresetChange(event.target.value)}
										value={equalizerPreset}
									>
										{equalizerPreset === "Custom" ? <option value="Custom">Custom</option> : null}
										{equalizerPresets.map((preset) => (
											<option key={preset.name} value={preset.name}>{preset.name}</option>
										))}
									</select>
								</label>
								<button
									className={`rounded-md border px-3 py-1.5 text-sm transition ${
										equalizerEnabled
											? "border-emerald-400/60 bg-emerald-500/15 text-emerald-300"
											: "border-zinc-700 text-zinc-200 hover:bg-zinc-800"
									}`}
									onClick={() => onEqualizerEnabledChange(!equalizerEnabled)}
									type="button"
								>
									EQ {equalizerEnabled ? "On" : "Off"}
								</button>
								<button
									className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 transition hover:bg-zinc-800"
									onClick={onEqualizerReset}
									type="button"
								>
									Reset
								</button>
							</div>
						</div>

						<div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
							{equalizerBands.map((band, index) => (
								<div key={band.frequency} className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2">
									<div className="mb-2 flex items-center justify-between gap-2">
										<span className="text-xs font-medium text-zinc-200">{band.label}</span>
										<span className="text-xs text-zinc-500">{Math.round(band.gain)} dB</span>
									</div>
									<input
										aria-label={`Equalizer ${band.label} hertz`}
										className="h-1 w-full cursor-pointer accent-emerald-500"
										max={12}
										min={-12}
										onChange={(event) => onEqualizerBandChange(index, Number(event.target.value))}
										step={1}
										type="range"
										value={Math.round(band.gain)}
									/>
									<div className="mt-1 flex justify-between text-[10px] text-zinc-600">
										<span>-12</span>
										<span>0</span>
										<span>+12</span>
									</div>
								</div>
							))}
						</div>
					</div>
				) : null}

				<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
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
							aria-label="Cycle repeat mode"
							className={`rounded-md border px-3 py-1.5 text-sm transition ${
								repeatMode === "off"
									? "border-zinc-700 text-zinc-200 hover:bg-zinc-800"
									: "border-emerald-400/60 bg-emerald-500/15 text-emerald-300"
							}`}
							onClick={onToggleRepeat}
							type="button"
						>
							Repeat: {repeatMode}
						</button>
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
							aria-expanded={showEqualizer}
							aria-label="Toggle equalizer controls"
							className={`rounded-md border px-3 py-1.5 text-sm transition ${
								showEqualizer ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-300" : "border-zinc-700 text-zinc-200 hover:bg-zinc-800"
							}`}
							onClick={() => setShowEqualizer((value) => !value)}
							type="button"
						>
							EQ
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
								className="h-1 w-20 cursor-pointer accent-emerald-500 sm:w-24"
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
