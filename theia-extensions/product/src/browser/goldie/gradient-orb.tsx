/********************************************************************************
 * Copyright (C) 2026 Goldie contributors.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';

export interface GradientOrbConfig {
    background?: string;
    hue?: number;
    rotationSpeed?: number;
    noiseScale?: number;
    innerRadius?: number;
}

export interface GradientOrbLevelRef { current: number; }

interface GradientOrbProps {
    config?: GradientOrbConfig;
    className?: string;
    levelRef?: GradientOrbLevelRef;
    reducedMotion?: boolean;
}

const defaults: Required<GradientOrbConfig> = {
    background: '#050608',
    hue: 0,
    rotationSpeed: 0.23,
    noiseScale: 0.65,
    innerRadius: 0.1,
};

// Shader source is intentionally unchanged from voice-orb-preview/src/GradientOrb.tsx.
const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float iTime;
  uniform float flowTime;
  uniform vec3 iResolution;
  uniform float hue;
  uniform float rot;
  uniform float noiseScale;
  uniform float innerRadius;
  uniform float audioLevel;
  uniform float ambientMotion;

  varying vec2 vUv;

  vec3 rgb2yiq(vec3 c) {
    return vec3(
      dot(c, vec3(0.299, 0.587, 0.114)),
      dot(c, vec3(0.596, -0.274, -0.322)),
      dot(c, vec3(0.211, -0.523, 0.312))
    );
  }

  vec3 yiq2rgb(vec3 c) {
    return vec3(
      c.x + 0.956 * c.y + 0.621 * c.z,
      c.x - 0.272 * c.y - 0.647 * c.z,
      c.x - 1.106 * c.y + 1.703 * c.z
    );
  }

  vec3 adjustHue(vec3 color, float hueDeg) {
    float hueRad = radians(hueDeg);
    vec3 yiq = rgb2yiq(color);
    float cosA = cos(hueRad);
    float sinA = sin(hueRad);
    yiq.yz = vec2(yiq.y * cosA - yiq.z * sinA, yiq.y * sinA + yiq.z * cosA);
    return yiq2rgb(yiq);
  }

  vec3 hash33(vec3 p3) {
    p3 = fract(p3 * vec3(0.1031, 0.11369, 0.13787));
    p3 += dot(p3, p3.yxz + 19.19);
    return -1.0 + 2.0 * fract(vec3(p3.x + p3.y, p3.x + p3.z, p3.y + p3.z) * p3.zyx);
  }

  float snoise3(vec3 p) {
    const float K1 = 0.333333333;
    const float K2 = 0.166666667;
    vec3 i = floor(p + (p.x + p.y + p.z) * K1);
    vec3 d0 = p - (i - (i.x + i.y + i.z) * K2);
    vec3 e = step(vec3(0.0), d0 - d0.yzx);
    vec3 i1 = e * (1.0 - e.zxy);
    vec3 i2 = 1.0 - e.zxy * (1.0 - e);
    vec3 d1 = d0 - (i1 - K2);
    vec3 d2 = d0 - (i2 - K1);
    vec3 d3 = d0 - 0.5;
    vec4 h = max(0.6 - vec4(dot(d0, d0), dot(d1, d1), dot(d2, d2), dot(d3, d3)), 0.0);
    vec4 n = h * h * h * h * vec4(
      dot(d0, hash33(i)),
      dot(d1, hash33(i + i1)),
      dot(d2, hash33(i + i2)),
      dot(d3, hash33(i + 1.0))
    );
    return dot(vec4(31.316), n);
  }

  vec4 extractAlpha(vec3 colorIn) {
    float a = max(max(colorIn.r, colorIn.g), colorIn.b);
    return vec4(colorIn.rgb / (a + 1e-5), a);
  }

  const vec3 baseColor0 = vec3(0.239, 0.353, 1.0);
  const vec3 baseColor1 = vec3(0.616, 0.0, 1.0);
  const vec3 baseColor2 = vec3(1.0, 0.373, 0.122);
  const vec3 baseColor3 = vec3(0.0);

  float light1(float intensity, float attenuation, float dist) {
    return intensity / (1.0 + dist * attenuation);
  }

  float light2(float intensity, float attenuation, float dist) {
    return intensity / (1.0 + dist * dist * attenuation);
  }

  vec4 draw(vec2 uv) {
    vec3 color0 = adjustHue(baseColor0, hue);
    vec3 color1 = adjustHue(baseColor1, hue);
    vec3 color2 = adjustHue(baseColor2, hue);
    vec3 color3 = adjustHue(baseColor3, hue);

    float len = length(uv);
    float invLen = len > 0.0 ? 1.0 / len : 0.0;
    float pulse = sin(iTime * 1.35) * 0.012 * ambientMotion;
    float energy = pow(audioLevel, 0.78);
    float reactiveScale = 1.0 + energy * 0.14;
    uv /= reactiveScale;
    len = length(uv);
    invLen = len > 0.0 ? 1.0 / len : 0.0;

    float noiseFlow = mix(iTime * 0.35, flowTime, 0.78);
    float n0 = snoise3(vec3(uv * (noiseScale + energy * 0.28), noiseFlow)) * 0.5 + 0.5;
    float deformation = (n0 - 0.5) * energy * 0.16;
    float r0 = mix(
      mix(innerRadius + pulse, 1.0, 0.4),
      mix(innerRadius + pulse, 1.0, 0.6),
      n0
    ) + deformation;

    float d0 = distance(uv, (r0 * invLen) * uv);
    float v0 = light1(1.0 + energy * 0.8, mix(10.0, 5.8, energy), d0);
    v0 *= smoothstep(r0 * (1.05 + energy * 0.035), r0, len);
    float cl = cos(atan(uv.y, uv.x) + flowTime * 1.7) * 0.5 + 0.5;

    float a = flowTime * -0.9;
    vec2 pos = vec2(cos(a), sin(a)) * r0;
    float d = distance(uv, pos);
    float v1 = light2(1.5 + energy * 1.1, 5.0, d);
    v1 *= light1(1.0, mix(50.0, 25.0, energy), d0);

    float v2 = smoothstep(1.0, mix(innerRadius, 1.0, n0 * 0.5), len);
    float v3 = smoothstep(innerRadius, mix(innerRadius, 1.0, 0.5), len);

    vec3 col = mix(color1, color2, cl);
    col = mix(col, color0, n0);
    col = mix(color3, col, v0);
    col = (col + v1) * v2 * v3 * (1.0 + energy * 0.18);
    col = clamp(col, 0.0, 1.0);

    return extractAlpha(col);
  }

  void main() {
    vec2 center = iResolution.xy * 0.5;
    float size = min(iResolution.x, iResolution.y);
    vec2 uv = (vUv * iResolution.xy - center) / size * 2.0;

    float s = sin(rot);
    float c = cos(rot);
    uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);

    vec4 col = draw(uv);
    gl_FragColor = vec4(col.rgb * col.a, col.a);
  }
`;

function shader(gl: WebGLRenderingContext, kind: number, source: string): WebGLShader {
    const result = gl.createShader(kind);
    if (!result) { throw new Error('Goldie could not create the orb shader.'); }
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
        const detail = gl.getShaderInfoLog(result) ?? 'Unknown shader error';
        gl.deleteShader(result);
        throw new Error(detail);
    }
    return result;
}

export function GradientOrb({ config: overrides, className = '', levelRef, reducedMotion = false }: GradientOrbProps): React.ReactElement {
    const canvasRef = React.useRef<HTMLCanvasElement | undefined>(undefined);
    const [renderFailed, setRenderFailed] = React.useState(false);
    const [systemReducedMotion, setSystemReducedMotion] = React.useState(
        () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    );
    const config = React.useMemo(() => ({ ...defaults, ...overrides }), [
        overrides?.background, overrides?.hue, overrides?.innerRadius, overrides?.noiseScale, overrides?.rotationSpeed
    ]);

    React.useEffect(() => {
        const query = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
        if (!query) { return undefined; }
        const updatePreference = (): void => setSystemReducedMotion(query.matches);
        query.addEventListener('change', updatePreference);
        updatePreference();
        return () => query.removeEventListener('change', updatePreference);
    }, []);

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) { return undefined; }
        let gl: WebGLRenderingContext | undefined;
        let vertex: WebGLShader | undefined;
        let fragment: WebGLShader | undefined;
        let program: WebGLProgram | undefined;
        let position: WebGLBuffer | undefined;
        let uv: WebGLBuffer | undefined;
        let observer: ResizeObserver | undefined;
        let frame = 0;
        const dispose = (): void => {
            cancelAnimationFrame(frame);
            observer?.disconnect();
            if (!gl) { return; }
            if (position) { gl.deleteBuffer(position); }
            if (uv) { gl.deleteBuffer(uv); }
            if (program) { gl.deleteProgram(program); }
            if (vertex) { gl.deleteShader(vertex); }
            if (fragment) { gl.deleteShader(fragment); }
        };
        try {
            gl = canvas.getContext('webgl', { alpha: false, antialias: true, premultipliedAlpha: true }) ?? undefined;
            if (!gl) { throw new Error('WebGL is unavailable.'); }
            const context = gl;
            // Three injects these attributes before compiling ShaderMaterial. Raw WebGL needs the same declarations.
            vertex = shader(context, context.VERTEX_SHADER, `attribute vec3 position;\nattribute vec2 uv;\n${vertexShader}`);
            fragment = shader(context, context.FRAGMENT_SHADER, fragmentShader);
            program = context.createProgram() ?? undefined;
            if (!program) { throw new Error('Goldie could not create the orb program.'); }
            context.attachShader(program, vertex);
            context.attachShader(program, fragment);
            context.linkProgram(program);
            if (!context.getProgramParameter(program, context.LINK_STATUS)) { throw new Error('Goldie could not link the orb program.'); }
            context.useProgram(program);

            position = context.createBuffer() ?? undefined;
            uv = context.createBuffer() ?? undefined;
            if (!position || !uv) { throw new Error('Goldie could not create the orb geometry.'); }
            const positionLocation = context.getAttribLocation(program, 'position');
            const uvLocation = context.getAttribLocation(program, 'uv');
            context.bindBuffer(context.ARRAY_BUFFER, position);
            context.bufferData(context.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), context.STATIC_DRAW);
            context.enableVertexAttribArray(positionLocation);
            context.vertexAttribPointer(positionLocation, 3, context.FLOAT, false, 0, 0);
            context.bindBuffer(context.ARRAY_BUFFER, uv);
            context.bufferData(context.ARRAY_BUFFER, new Float32Array([0, 0, 2, 0, 0, 2]), context.STATIC_DRAW);
            context.enableVertexAttribArray(uvLocation);
            context.vertexAttribPointer(uvLocation, 2, context.FLOAT, false, 0, 0);

            const uniform = (name: string): WebGLUniformLocation | null => context.getUniformLocation(program!, name);
            const iTime = uniform('iTime');
            const flowTime = uniform('flowTime');
            const iResolution = uniform('iResolution');
            const hue = uniform('hue');
            const rot = uniform('rot');
            const noiseScale = uniform('noiseScale');
            const innerRadius = uniform('innerRadius');
            const audioLevel = uniform('audioLevel');
            const ambientMotion = uniform('ambientMotion');
            context.uniform1f(hue, config.hue);
            context.uniform1f(noiseScale, config.noiseScale);
            context.uniform1f(innerRadius, config.innerRadius);
            context.clearColor(5 / 255, 6 / 255, 8 / 255, 1);
            context.enable(context.BLEND);
            context.blendFuncSeparate(context.SRC_ALPHA, context.ONE_MINUS_SRC_ALPHA, context.ONE, context.ONE_MINUS_SRC_ALPHA);

            const started = performance.now();
            let previous = started;
            let rotation = 0;
            let flow = 0;
            const resize = (): void => {
                const bounds = canvas.getBoundingClientRect();
                const dpr = Math.min(globalThis.devicePixelRatio || 1, 1.75);
                const width = Math.max(1, Math.round(bounds.width * dpr));
                const height = Math.max(1, Math.round(bounds.height * dpr));
                if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
                context.viewport(0, 0, width, height);
            };
            observer = new ResizeObserver(resize);
            observer.observe(canvas);
            resize();

            const draw = (now: number): void => {
                const delta = Math.min(0.1, Math.max(0, (now - previous) / 1000));
                previous = now;
                const level = Math.min(1, Math.max(0, levelRef?.current ?? 0));
                const ambient = systemReducedMotion || reducedMotion ? 0 : 1;
                rotation += delta * config.rotationSpeed * (ambient + level * 1.8);
                flow += delta * (0.42 * ambient + level * 2.4);
                context.clear(context.COLOR_BUFFER_BIT);
                context.uniform1f(iTime, (now - started) / 1000);
                context.uniform1f(flowTime, flow);
                context.uniform3f(iResolution, canvas.width, canvas.height, canvas.width / Math.max(1, canvas.height));
                context.uniform1f(rot, rotation);
                context.uniform1f(audioLevel, level);
                context.uniform1f(ambientMotion, ambient);
                context.drawArrays(context.TRIANGLES, 0, 3);
                frame = requestAnimationFrame(draw);
            };
            frame = requestAnimationFrame(draw);
            setRenderFailed(false);
            return dispose;
        } catch {
            dispose();
            setRenderFailed(true);
            return undefined;
        }
    }, [config, levelRef, reducedMotion, systemReducedMotion]);

    if (renderFailed) {
        return <div className={`goldie-gradient-orb goldie-gradient-orb-fallback ${className}`} role='img'
            aria-label='Goldie voice orb. Animation is unavailable.' style={{ backgroundColor: config.background }} />;
    }
    return <canvas ref={element => { canvasRef.current = element ?? undefined; }} className={`goldie-gradient-orb ${className}`}
        style={{ backgroundColor: config.background }} aria-hidden='true' />;
}
