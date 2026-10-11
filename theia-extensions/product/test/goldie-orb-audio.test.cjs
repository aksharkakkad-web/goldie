// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GoldieAudioPlayer } = require('../lib/browser/goldie/goldie-audio-player');
const { waveformLevel, smoothAudioLevel } = require('../lib/browser/goldie/goldie-audio-level');

test('waveform gate and envelope separate silence from speech at different frame rates', () => {
    assert.equal(waveformLevel(new Float32Array(16)), 0);
    assert.equal(waveformLevel(new Float32Array(16).fill(0.005)), 0);
    assert.equal(waveformLevel(new Float32Array(16).fill(1)), 1);
    const one = smoothAudioLevel(0, 1, 1 / 30);
    const two = smoothAudioLevel(smoothAudioLevel(0, 1, 1 / 60), 1, 1 / 60);
    assert.ok(Math.abs(one - two) < 1e-10);
    assert.ok(smoothAudioLevel(1, 0, 1 / 30) > 1 - one);
});

test('one audible analysis path per element, retained on replay and released on disposal', async () => {
    const originals = { Audio: global.Audio, AudioContext: global.AudioContext, raf: global.requestAnimationFrame, caf: global.cancelAnimationFrame };
    const frames = new Map(); let frameId = 0; let sources = 0; let rms = 0.1; let closed = false;
    const nodes = [];
    class Node {
        connections = []; disconnected = false; fftSize = 1024;
        connect(node) { this.connections.push(node); }
        disconnect() { this.disconnected = true; }
        getFloatTimeDomainData(samples) { samples.fill(rms); }
    }
    class Context {
        state = 'running'; destination = {};
        createAnalyser() { const node = new Node(); nodes.push(node); return node; }
        createMediaElementSource() { sources++; const node = new Node(); nodes.push(node); return node; }
        async close() { closed = true; }
    }
    class Media {
        events = {}; currentTime = 0; ended = false;
        addEventListener(name, handler) { (this.events[name] ??= []).push(handler); }
        emit(name) { for (const handler of this.events[name] ?? []) { handler(); } }
        async play() { this.emit('play'); }
        pause() { this.emit('pause'); }
        removeAttribute() {} load() {}
    }
    global.Audio = Media; global.AudioContext = Context;
    global.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
    global.cancelAnimationFrame = id => frames.delete(id);
    const runFrame = time => { const queued = [...frames.values()]; frames.clear(); for (const callback of queued) { callback(time); } };
    const player = new GoldieAudioPlayer();
    try {
        const speech = { mimeType: 'audio/wav', dataBase64: 'YQ==' };
        player.load('lesson', speech); await player.play(); runFrame(0);
        assert.ok(player.audioLevelRef.current > 0);
        assert.equal(sources, 1); assert.equal(nodes[1].connections[0], nodes[0]);
        assert.equal(nodes[0].connections.length, 1);
        player.pause(); assert.equal(player.audioLevelRef.current, 0); assert.equal(frames.size, 0);
        await player.play(); assert.equal(sources, 1);
        rms = 0; runFrame(16); assert.equal(player.audioLevelRef.current, 0);
        player.load('answer', speech); await player.play(); runFrame(32);
        assert.equal(sources, 2);
        player.select('lesson'); await player.play(); assert.equal(sources, 2);
        player.dispose(); assert.equal(frames.size, 0); assert.equal(player.audioLevelRef.current, 0);
        assert.ok(closed); assert.ok(nodes.every(node => node.disconnected));
    } finally {
        player.dispose(); global.Audio = originals.Audio; global.AudioContext = originals.AudioContext;
        global.requestAnimationFrame = originals.raf; global.cancelAnimationFrame = originals.caf;
    }
});
