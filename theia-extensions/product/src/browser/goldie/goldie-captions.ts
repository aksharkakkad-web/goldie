// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
// eslint-disable-next-line spaced-comment
/// <reference lib="es2022.intl" />

/**
 * Sentence timing is estimated from text length and the actual clip duration.
 * Uses the media position, never a separate timer, so pause/seek/resume stay together.
 * This is not provider word alignment.
 */
export function estimatedSentence(text: string | undefined, position: number, duration: number): string | undefined {
    if (!text?.trim() || !Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) { return undefined; }
    const sentences = Array.from(new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text), item => item.segment.trim())
        .filter(Boolean).flatMap(sentence => {
            // Bound long sentences so captions remain readable in a narrow IDE panel.
            const words = sentence.split(/\s+/);
            const chunks: string[] = [];
            for (let index = 0; index < words.length; index += 28) { chunks.push(words.slice(index, index + 28).join(' ')); }
            return chunks;
        });
    const weights = sentences.map(sentence => sentence.length);
    const target = Math.min(1, Math.max(0, position / duration)) * weights.reduce((sum, weight) => sum + weight, 0);
    let cumulative = 0;
    for (let index = 0; index < sentences.length; index++) {
        cumulative += weights[index];
        if (target < cumulative || index === sentences.length - 1) { return sentences[index]; }
    }
    return undefined;
}
