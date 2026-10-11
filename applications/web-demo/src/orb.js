// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
// Same merged desktop shaders; only the host lifecycle differs from React/Theia.
import { vertexShader, fragmentShader } from '/orb-shaders.js';

export function mountOrb(canvas, getLevel) {
    const resources = []; let frame; let observer; let gl;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const dispose = () => {
        cancelAnimationFrame(frame); observer?.disconnect();
        for (const [kind, resource] of resources) { gl?.[kind](resource); }
    };
    try {
        gl = canvas.getContext('webgl', { alpha: false, antialias: true, premultipliedAlpha: true });
        if (!gl) { throw new Error('No WebGL'); }
        const shader = (type, source) => {
            const result = gl.createShader(type); resources.push(['deleteShader', result]);
            gl.shaderSource(result, source); gl.compileShader(result);
            if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) { throw new Error('Orb shader failed'); }
            return result;
        };
        const vertex = shader(gl.VERTEX_SHADER, `attribute vec3 position;\nattribute vec2 uv;\n${vertexShader}`);
        const fragment = shader(gl.FRAGMENT_SHADER, fragmentShader);
        const program = gl.createProgram(); resources.push(['deleteProgram', program]);
        gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { throw new Error('Orb linking failed'); }
        gl.useProgram(program);
        const attribute = (name, size, values) => {
            const buffer = gl.createBuffer(); resources.push(['deleteBuffer', buffer]);
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
            const location = gl.getAttribLocation(program, name); gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
        };
        attribute('position', 3, [-1, -1, 0, 3, -1, 0, -1, 3, 0]); attribute('uv', 2, [0, 0, 2, 0, 0, 2]);
        const uniforms = Object.fromEntries(['iTime', 'flowTime', 'iResolution', 'hue', 'rot', 'noiseScale', 'innerRadius', 'audioLevel', 'ambientMotion'].map(name => [name, gl.getUniformLocation(program, name)]));
        gl.uniform1f(uniforms.hue, 0); gl.uniform1f(uniforms.noiseScale, 0.65); gl.uniform1f(uniforms.innerRadius, 0.1);
        gl.clearColor(5 / 255, 6 / 255, 8 / 255, 1); gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        const resize = () => {
            const size = canvas.getBoundingClientRect(); const ratio = Math.min(devicePixelRatio || 1, 1.75);
            canvas.width = Math.max(1, Math.round(size.width * ratio)); canvas.height = Math.max(1, Math.round(size.height * ratio));
            gl.viewport(0, 0, canvas.width, canvas.height);
        };
        observer = new ResizeObserver(resize); observer.observe(canvas); resize();
        const start = performance.now(); let previous = start; let rotation = 0; let flow = 0;
        const draw = now => {
            const dt = Math.min(0.1, Math.max(0, (now - previous) / 1000)); previous = now;
            const level = Math.min(1, Math.max(0, getLevel() || 0)); const ambient = preference.matches ? 0 : 1;
            rotation += dt * 0.23 * (ambient + level * 1.8); flow += dt * (0.42 * ambient + level * 2.4);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.uniform1f(uniforms.iTime, preference.matches ? 0 : (now - start) / 1000);
            gl.uniform1f(uniforms.flowTime, flow); gl.uniform3f(uniforms.iResolution, canvas.width, canvas.height, 1);
            gl.uniform1f(uniforms.rot, rotation); gl.uniform1f(uniforms.audioLevel, level); gl.uniform1f(uniforms.ambientMotion, ambient);
            gl.drawArrays(gl.TRIANGLES, 0, 3); frame = requestAnimationFrame(draw);
        };
        frame = requestAnimationFrame(draw);
        return dispose;
    } catch { dispose(); canvas.parentElement.classList.add('no-webgl'); return () => {}; }
}
