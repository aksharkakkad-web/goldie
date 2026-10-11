// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
// Same waveform normalization and envelope as the supplied voice-orb preview.
export function waveformLevel(samples: Float32Array): number {
    let squares = 0;
    for (const sample of samples) { squares += sample * sample; }
    const rms = samples.length ? Math.sqrt(squares / samples.length) : 0;
    if (!Number.isFinite(rms) || rms <= 0.012) { return 0; }
    return Math.pow(Math.min(1, (rms - 0.012) / (0.22 - 0.012)), 0.72);
}

export function smoothAudioLevel(current: number, target: number, seconds: number): number {
    const bounded = Math.min(1, Math.max(0, current));
    const next = Math.min(1, Math.max(0, target));
    const duration = next > bounded ? 0.035 : 0.26;
    return bounded + (next - bounded) * (1 - Math.exp(-Math.max(0, seconds) / duration));
}
