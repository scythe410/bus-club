type PresetName = 'decode' | 'dither' | 'terminal' | 'blueprint';
interface Preset {
    /** Glyphs from empty to dense. The first character should be a space. */
    ramp: string;
    /** Glyphs used while a character scrambles. */
    scramble: string;
    /** `ramp` condenses through the ramp before scrambling; `random` scrambles the whole time. */
    mode: 'ramp' | 'random';
    /** How image glyphs are colored: the element's text color, the source pixels, or the accent. */
    color: 'mono' | 'source' | 'accent';
    /** Image cell heights in CSS px, coarse to fine. */
    cells: number[];
    /** Milliseconds between glyph changes. */
    tick: number;
    /** Optional leading cursor glyph shown as each character starts. */
    cursor?: string;
    /** Use the accent color for scramble glyphs. */
    accentGlyphs?: boolean;
}
declare const presets: Record<PresetName, Preset>;
declare function resolvePreset(p: PresetName | Preset | undefined): Preset;

/**
 * Loading mascots. Each one is a small animated vector drawing; the engine renders it
 * through the glyph grid, so it shows up as living ASCII art while content loads.
 * Every draw function fills a w×h box at time t (seconds).
 */
type MascotName = 'spider' | 'ghost' | 'pumpkin' | 'bat';
type MascotDraw = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number, color: string) => void;
declare const mascots: Record<MascotName, MascotDraw>;
/** A custom mascot from an SVG URL or SVG markup, gently floating. */
declare function imageMascot(src: string): MascotDraw;

type Origin = 'center' | 'top-left' | 'pointer' | {
    x: number;
    y: number;
};
/** `fast` (default) keeps data readable within ~400 ms; `cinematic` is the slow showcase wave. */
type Duration = 'fast' | 'cinematic';
interface AsciiRevealOptions {
    /** Built-in preset name or a custom preset object. Default `decode`. */
    preset?: PresetName | Preset;
    /** Playback speed multiplier. 2 is twice as fast. Default 1. */
    speed?: number;
    /** `fast` (default) for data, `cinematic` for heroes and demos. */
    duration?: Duration;
    /** Where the reveal wave starts. Default `center` of the element. */
    origin?: Origin;
    /** Only animate content inside elements matching this selector. */
    selector?: string;
    /** Elements that get the dot-field and corner frame before fading in. Default `[data-ascii="surface"]`. */
    surfaces?: string;
    /** Elements that simply fade in on the wave (buttons, chips). Default `[data-ascii="fade"]`. */
    fades?: string;
    /** Elements rendered through the glyph grid. Default `img, canvas, video, [data-ascii="media"]`. */
    media?: string;
    /** Element the effect draws into. Created automatically when omitted. */
    overlay?: HTMLElement;
    /**
     * Show an animated ASCII mascot while loading instead of the plain shimmer:
     * `spider`, `ghost`, `pumpkin`, `bat`, an SVG URL, SVG markup, or your own draw function.
     */
    mascot?: MascotName | string | MascotDraw | null;
    /**
     * Reveal sections below the fold as they scroll into view instead of all at once.
     * Applies to full reveals (no `within`). Default true.
     */
    lazy?: boolean;
    /** If the device can't keep up (frames over ~45 ms), finish instantly instead of stuttering. Default true. */
    fallback?: boolean;
}
interface RunOptions {
    origin?: Origin;
    /** Limit this run to a part of the tree, for example one card. */
    within?: Element;
    speed?: number;
    duration?: Duration;
    preset?: PresetName | Preset;
    /** Hide only: skip the animation and hide immediately. */
    instant?: boolean;
}
interface AsciiRevealController {
    /** Decode the content into place. Resolves when every target has landed. */
    reveal(options?: RunOptions): Promise<void>;
    /** Scramble the content back out. It stays hidden until the next `reveal()`. */
    hide(options?: RunOptions): Promise<void>;
    /** Show a glyph shimmer (or the mascot) where hidden content was, for loading states. */
    shimmer(on: boolean): void;
    update(options: Partial<AsciiRevealOptions>): void;
    destroy(): void;
}
/** Attach the effect to any element. Works without React. */
declare function createAsciiReveal(root: HTMLElement, options?: AsciiRevealOptions): AsciiRevealController;

type SkeletonVariant = 'dither' | 'scan' | 'braille' | 'terminal';
interface VariantSpec {
    base: string;
    wave: string;
    /** Share of empty cells. */
    gap: number;
    /** >1 favours the lighter glyphs of the ramp. */
    bias: number;
}
declare const SKELETON_VARIANTS: Record<SkeletonVariant, VariantSpec>;
declare const SKELETON_CSS = "\n:where(.ars){position:relative;display:block;font-family:var(--ascii-font,ui-monospace,\"SF Mono\",Menlo,Consolas,monospace);color:var(--ascii-skeleton,currentColor);user-select:none;pointer-events:none;--ars-base:.3;--ars-wave:.9;--ars-band:45%;--ars-speed:1.8s}\n.ars-line,.ars-block{position:relative;display:block;overflow:hidden;white-space:pre;line-height:1.3;contain:inline-size layout paint style}\n.ars-line+.ars-line{margin-top:.55em}\n.ars-block{line-height:1;border-radius:var(--ars-radius,8px);background:color-mix(in srgb,currentColor 6%,transparent)}\n.ars-base{display:block;opacity:var(--ars-base)}\n.ars>canvas{position:absolute;left:0;top:0;pointer-events:none}\n.ars-dither{--ars-base:.22;--ars-wave:.75;--ars-band:55%}\n.ars-dither .ars-line{line-height:1;letter-spacing:-.02em}\n.ars-braille{--ars-base:.35;--ars-wave:1;--ars-band:40%}\n.ars-scan{--ars-base:.28;--ars-wave:.95;--ars-band:38%}\n.ars-terminal{--ars-base:.16;--ars-wave:1;--ars-band:35%;--ars-speed:1.5s;--ars-wave-color:var(--ascii-accent,currentColor)}";
/** A deterministic row of glyphs. */
declare function glyphRow(seed: number, len: number, ramp?: string, gap?: number, bias?: number): string;
interface SkeletonSpec {
    /** Glyph style. Default `dither`. */
    variant?: SkeletonVariant;
    /** Number of text lines. Default 3. */
    lines?: number;
    /** Line widths (CSS). Defaults to a natural paragraph shape. */
    widths?: (string | number)[];
    /** Rows of glyphs for a block (image/avatar) skeleton. Overrides `lines`. */
    rows?: number;
    /** Seed for the glyph pattern. */
    seed?: number;
    /** Include the stylesheet. Default true; set false when you've added `SKELETON_CSS` to the page once. */
    css?: boolean;
    /** Shimmer. Default true. Set false for long lists: a still glyph pattern paints as fast as a gray box. */
    animate?: boolean;
}
/** HTML string for non-React use: `el.innerHTML = asciiSkeletonHTML({ lines: 3 })`, then `animateSkeletons()` to start the shimmer. */
declare function asciiSkeletonHTML(spec?: SkeletonSpec): string;

/** Start the shimmer on one skeleton root (an element with class `ars`). Returns a function that stops it. */
declare function animateSkeleton(root: HTMLElement): () => void;
/** Start the shimmer on every animated skeleton inside `scope` (for markup from `asciiSkeletonHTML`). */
declare function animateSkeletons(scope?: ParentNode): () => void;

export { type AsciiRevealController, type AsciiRevealOptions, type Duration, type MascotDraw, type MascotName, type Origin, type Preset, type PresetName, type RunOptions, SKELETON_CSS, SKELETON_VARIANTS, type SkeletonSpec, type SkeletonVariant, animateSkeleton, animateSkeletons, asciiSkeletonHTML, createAsciiReveal, glyphRow, imageMascot, mascots, presets, resolvePreset };
