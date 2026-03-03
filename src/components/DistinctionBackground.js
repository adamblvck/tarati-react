import React, { useRef, useEffect, useCallback } from 'react';

// ────────────────────────────────────────────────────────────
// DistinctionBackground
//
// Animated canvas overlay that renders floating "Laws of Form"
// distinction marks (the Spencer-Brown cross / ┐ shape).
// Marks fade in, drift, rotate, and fade out continuously.
//
// Drop this component anywhere — it renders a fixed canvas
// behind all content. Configure via props.
// ────────────────────────────────────────────────────────────

const DEFAULTS = {
	maxParticles:   14,
	spawnInterval:  1800,       // ms between new spawns
	lifetime:       [5000, 10000],
	sizeRange:      [28, 72],
	opacityRange:   [0.035, 0.10],
	driftSpeed:     [0.08, 0.35],
	rotationSpeed:  [-0.002, 0.002],
	color:          '#000',
	variants:       ['single', 'nested', 'doubleRight', 'doubleUpper'],
	fadeInRatio:    0.2,
	fadeOutRatio:   0.3,
	lineWidth:      1.5,
};

// ── Helpers ──

function rand(min, max) {
	return Math.random() * (max - min) + min;
}

function pickRandom(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}

// ── Shape renderers ──
// Each draws a Laws of Form distinction (upper-right-edge mark)
// centered at the canvas origin. The caller handles translate / rotate.

function drawSingle(ctx, s) {
	// Basic ┐ mark: horizontal bar with vertical descender on the right
	ctx.beginPath();
	ctx.moveTo(-s * 0.5, -s * 0.3);
	ctx.lineTo( s * 0.3, -s * 0.3);
	ctx.lineTo( s * 0.3,  s * 0.45);
	ctx.stroke();
}

function drawNested(ctx, s) {
	// Re-entry form: an outer ┐ containing a smaller inner ┐
	ctx.beginPath();
	ctx.moveTo(-s * 0.5, -s * 0.4);
	ctx.lineTo( s * 0.4, -s * 0.4);
	ctx.lineTo( s * 0.4,  s * 0.5);
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo(-s * 0.2, -s * 0.1);
	ctx.lineTo( s * 0.15, -s * 0.1);
	ctx.lineTo( s * 0.15,  s * 0.3);
	ctx.stroke();
}

function drawDoubleRight(ctx, s) {
	// Two ┐ marks sharing a continuous horizontal, verticals at two points
	ctx.beginPath();
	ctx.moveTo(-s * 0.5, -s * 0.15);
	ctx.lineTo(-s * 0.05, -s * 0.15);
	ctx.lineTo(-s * 0.05,  s * 0.4);
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo(-s * 0.05, -s * 0.15);
	ctx.lineTo( s * 0.4,  -s * 0.15);
	ctx.lineTo( s * 0.4,   s * 0.4);
	ctx.stroke();
}

function drawDoubleUpper(ctx, s) {
	// Outer ┐ with a second shorter ┐ inset below its horizontal
	ctx.beginPath();
	ctx.moveTo(-s * 0.5, -s * 0.4);
	ctx.lineTo( s * 0.4, -s * 0.4);
	ctx.lineTo( s * 0.4,  s * 0.5);
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo(-s * 0.3, -s * 0.08);
	ctx.lineTo( s * 0.12, -s * 0.08);
	ctx.lineTo( s * 0.12,  s * 0.28);
	ctx.stroke();
}

const DRAW_MAP = {
	single:      drawSingle,
	nested:      drawNested,
	// doubleRight: drawDoubleRight,
	// doubleUpper: drawDoubleUpper,
};

// ── Particle factory ──

function createParticle(w, h, cfg) {
	const lifetime = rand(cfg.lifetime[0], cfg.lifetime[1]);
	return {
		x:             rand(0, w),
		y:             rand(0, h),
		size:          rand(cfg.sizeRange[0], cfg.sizeRange[1]),
		rotation:      rand(0, Math.PI * 2),
		rotationSpeed: rand(cfg.rotationSpeed[0], cfg.rotationSpeed[1]),
		dx:            rand(-cfg.driftSpeed[1], cfg.driftSpeed[1]),
		dy:            rand(-cfg.driftSpeed[1], cfg.driftSpeed[1]),
		maxOpacity:    rand(cfg.opacityRange[0], cfg.opacityRange[1]),
		variant:       pickRandom(cfg.variants),
		lifetime,
		age:           0,
		fadeInEnd:     lifetime * cfg.fadeInRatio,
		fadeOutStart:  lifetime * (1 - cfg.fadeOutRatio),
	};
}

// ── Component ──

const DistinctionBackground = ({
	maxParticles  = DEFAULTS.maxParticles,
	spawnInterval = DEFAULTS.spawnInterval,
	lifetime      = DEFAULTS.lifetime,
	sizeRange     = DEFAULTS.sizeRange,
	opacityRange  = DEFAULTS.opacityRange,
	driftSpeed    = DEFAULTS.driftSpeed,
	rotationSpeed = DEFAULTS.rotationSpeed,
	color         = DEFAULTS.color,
	variants      = DEFAULTS.variants,
	fadeInRatio   = DEFAULTS.fadeInRatio,
	fadeOutRatio  = DEFAULTS.fadeOutRatio,
	lineWidth     = DEFAULTS.lineWidth,
}) => {
	const canvasRef     = useRef(null);
	const particlesRef  = useRef([]);
	const animFrameRef  = useRef(null);
	const lastSpawnRef  = useRef(0);
	const lastTimeRef   = useRef(0);
	const dimsRef       = useRef({ width: 0, height: 0 });

	// Keep latest config in a ref so the animation loop always reads current values
	const cfgRef = useRef(null);
	cfgRef.current = {
		maxParticles, spawnInterval, lifetime, sizeRange,
		opacityRange, driftSpeed, rotationSpeed, color,
		variants, fadeInRatio, fadeOutRatio, lineWidth,
	};

	// ── Resize handler ──

	const syncSize = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const dpr = window.devicePixelRatio || 1;
		const w = window.innerWidth;
		const h = window.innerHeight;
		canvas.width  = w * dpr;
		canvas.height = h * dpr;
		canvas.style.width  = `${w}px`;
		canvas.style.height = `${h}px`;
		const ctx = canvas.getContext('2d');
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		dimsRef.current = { width: w, height: h };
	}, []);

	// ── Animation loop ──

	const tick = useCallback((timestamp) => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext('2d');
		const { width, height } = dimsRef.current;
		const cfg = cfgRef.current;

		const dt = lastTimeRef.current ? timestamp - lastTimeRef.current : 16;
		lastTimeRef.current = timestamp;

		// Spawn
		if (
			timestamp - lastSpawnRef.current > cfg.spawnInterval &&
			particlesRef.current.length < cfg.maxParticles
		) {
			particlesRef.current.push(createParticle(width, height, cfg));
			lastSpawnRef.current = timestamp;
		}

		// Clear (using device-pixel dimensions)
		const dpr = window.devicePixelRatio || 1;
		ctx.clearRect(0, 0, width * dpr, height * dpr);

		// Update & draw each particle
		particlesRef.current = particlesRef.current.filter((p) => {
			p.age += dt;
			if (p.age >= p.lifetime) return false;

			p.x += p.dx;
			p.y += p.dy;
			p.rotation += p.rotationSpeed;

			// Fade envelope
			let alpha = p.maxOpacity;
			if (p.age < p.fadeInEnd) {
				alpha *= p.age / p.fadeInEnd;
			} else if (p.age > p.fadeOutStart) {
				alpha *= 1 - (p.age - p.fadeOutStart) / (p.lifetime - p.fadeOutStart);
			}

			ctx.save();
			ctx.translate(p.x, p.y);
			ctx.rotate(p.rotation);
			ctx.strokeStyle = cfg.color;
			ctx.globalAlpha = Math.max(0, alpha);
			ctx.lineWidth   = cfg.lineWidth;
			ctx.lineCap     = 'square';

			const drawFn = DRAW_MAP[p.variant] || drawSingle;
			drawFn(ctx, p.size);

			ctx.restore();
			return true;
		});

		animFrameRef.current = requestAnimationFrame(tick);
	}, []);

	// ── Bootstrap ──

	useEffect(() => {
		syncSize();
		window.addEventListener('resize', syncSize);

		// Pre-seed particles so the canvas isn't empty on first render
		const { width, height } = dimsRef.current;
		const seedCount = Math.min(
			Math.ceil(cfgRef.current.maxParticles * 0.6),
			cfgRef.current.maxParticles,
		);
		for (let i = 0; i < seedCount; i++) {
			const p = createParticle(width, height, cfgRef.current);
			p.age = rand(0, p.lifetime * 0.6);
			particlesRef.current.push(p);
		}

		animFrameRef.current = requestAnimationFrame(tick);

		return () => {
			window.removeEventListener('resize', syncSize);
			if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
		};
	}, [syncSize, tick]);

	return (
		<canvas
			ref={canvasRef}
			aria-hidden="true"
			style={{
				position: 'fixed',
				inset: 0,
				zIndex: 0,
				pointerEvents: 'none',
			}}
		/>
	);
};

export default DistinctionBackground;
