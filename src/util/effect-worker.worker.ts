import init, {
    NtscSettingsList,
    ResizeFilter,
    NtscEffectBuf,
    Rotation,
    setPanicHook,
} from '../../ntsc-rs-web-wrapper/build/ntsc_rs_web_wrapper';

import {postMessageFromWorker, type MessageFromWorker, type MessageToWorker} from './worker-rpc';
import Queuetex from './async-queue';
import encodePng from './encode-png';
import textLightUrl from '../assets/fonts/thmanyahseriftext-Light.otf';
import textBoldUrl from '../assets/fonts/thmanyahseriftext-Bold.otf';
import textBlackUrl from '../assets/fonts/thmanyahseriftext-Black.otf';
import displayLightUrl from '../assets/fonts/thmanyahserifdisplay-Light.otf';
import displayBoldUrl from '../assets/fonts/thmanyahserifdisplay-Bold.otf';
import displayBlackUrl from '../assets/fonts/thmanyahserifdisplay-Black.otf';
import vcrFontUrl from '../assets/fonts/VCR_OSD_MONO_1.001.ttf';

export type TextOverlayPosition = 'center' | 'top' | 'bottom';
export type TitleFontFamily = 't-serif-light' | 't-serif-bold' | 't-serif-black' | 't-display-light' | 't-display-bold' | 't-display-black';
export type DateTimePosition = 'bottom-right' | 'bottom-left';

export type RenderFrame = {
    frame: VideoFrame,
    resizeHeight: number | null,
    resizeFilter: ResizeFilter,
    effectEnabled: boolean,
    rotation: Rotation,
    frameNum: number,
    padToEven: boolean,
    outputRect: {
        top: number,
        right: number,
        bottom: number,
        left: number,
    } | null,
    titleEnabled: boolean,
    titleText: string,
    titleDuration: number,
    titleFontSize: number,
    titlePosition: TextOverlayPosition,
    titleFontFamily: TitleFontFamily,
    vhsDateTimeEnabled: boolean,
    vhsDateTimePosition: DateTimePosition,
    vhsDateTimeUseCustom: boolean,
    vhsCustomDate: string,
    vhsDateTimeSize: number,
};

export type WorkerSchema =
    | {
        request: {
            name: 'init';
            message: {module: WebAssembly.Module};
        };
        response: {
            name: 'initialized';
            message: null;
        };
    }
    | {
        request: {
            name: 'render-frame-to-bitmap';
            message: RenderFrame;
        };
        response: {
            name: 'rendered-frame-to-bitmap';
            message: ImageBitmap;
        };
    }
    | {
        request: {
            name: 'render-frame-to-videoframe';
            message: RenderFrame;
        };
        response: {
            name: 'rendered-frame-to-videoframe';
            message: VideoFrame;
        };
    }
    | {
        request: {
            name: 'render-frame-to-png';
            message: RenderFrame;
        };
        response: {
            name: 'rendered-frame-to-png';
            message: Blob;
        };
    }
    | {
        request: {
            name: 'update-settings';
            message: string;
        };
        response: never;
    }
    | {
        request: never;
        response: {
            name: 'panicked';
            message: string;
        };
    };

const wasmMutex = new Queuetex(null);
let effectData: Promise<{
    effect: NtscEffectBuf,
    settingsList: NtscSettingsList,
    memory: WebAssembly.Memory,
}> | null = null;

function checkEffectData(effectData: Promise<{
    effect: NtscEffectBuf,
    settingsList: NtscSettingsList,
}> | null): asserts effectData {
    if (effectData === null) throw new Error('Not initialized');
};

const listener = async(event: MessageEvent) => {
    const message = event.data as MessageToWorker<WorkerSchema>;

    try {
        switch (message.type) {
            case 'init': {
                effectData = (async() => {
                    const {memory} = await init({module_or_path: message.message.module});
                    setPanicHook((errMessage: string) => {
                        postMessageFromWorker<WorkerSchema>({
                            type: 'panicked',
                            message: errMessage,
                            originId: null,
                        });
                    });

                    for (const [family, url] of [
                        ['TSerif Light', textLightUrl],
                        ['TSerif Bold', textBoldUrl],
                        ['TSerif Black', textBlackUrl],
                        ['TDisplay Light', displayLightUrl],
                        ['TDisplay Bold', displayBoldUrl],
                        ['TDisplay Black', displayBlackUrl],
                        ['VCR OSD Mono', vcrFontUrl],
                    ] as const) {
                        try {
                            const font = new FontFace(family, `url(${url})`);
                            await font.load();
                            self.fonts.add(font);
                        } catch {
                            // Font failed to load, fall back to sans-serif
                        }
                    }

                    return {
                        effect: new NtscEffectBuf(),
                        settingsList: new NtscSettingsList(),
                        memory,
                    };
                })();
                await effectData;
                postMessageFromWorker<WorkerSchema>({
                    type: 'initialized',
                    message: null,
                    originId: message.id,
                });
                break;
            }
            case 'render-frame-to-bitmap': {
                try {
                    const data = await renderFrame(message.message, 'imagebitmap');
                    postMessageFromWorker<WorkerSchema>({
                        type: 'rendered-frame-to-bitmap',
                        message: data,
                        originId: message.id,
                    }, [data]);
                } finally {
                    message.message.frame.close();
                }
                break;
            }
            case 'render-frame-to-videoframe': {
                try {
                    const data = await renderFrame(message.message, 'videoframe');
                    postMessageFromWorker<WorkerSchema>({
                        type: 'rendered-frame-to-videoframe',
                        message: data,
                        originId: message.id,
                    }, [data]);
                } finally {
                    message.message.frame.close();
                }
                break;
            }
            case 'render-frame-to-png': {
                try {
                    const data = await renderFrame(message.message, 'pngBlob');
                    postMessageFromWorker<WorkerSchema>({
                        type: 'rendered-frame-to-png',
                        message: data,
                        originId: message.id,
                    });
                } finally {
                    message.message.frame.close();
                }
                break;
            }
            case 'update-settings': {
                checkEffectData(effectData);
                const {effect, settingsList} = await effectData;
                await wasmMutex.withValue(() => {
                    effect.setEffectSettings(settingsList.settingsFromJSON(message.message));
                });
                break;
            }
            case 'close': {
                removeEventListener('message', listener);
                checkEffectData(effectData);
                const {effect, settingsList} = await effectData;
                void wasmMutex.withValue(() => {
                    effect.free();
                    settingsList.free();
                });
                break;
            }
        }
    } catch (error) {
        postMessage({
            type: 'error',
            message: error,
            originId: message.id,
        } satisfies MessageFromWorker<WorkerSchema>);
    }
};

export type Formats = {
    imagebitmap: ImageBitmap,
    videoframe: VideoFrame,
    pngBlob: Blob,
};

const renderFrame = async<F extends keyof Formats>(
    {frame, rotation, resizeHeight, resizeFilter, effectEnabled, frameNum, padToEven, outputRect, titleEnabled, titleText, titleDuration, titleFontSize, titlePosition, titleFontFamily, vhsDateTimeEnabled, vhsDateTimePosition, vhsDateTimeUseCustom, vhsCustomDate, vhsDateTimeSize}: RenderFrame,
    format: F,
): Promise<Formats[F]> => {
    checkEffectData(effectData);
    const {effect, memory} = await effectData;
    return await wasmMutex.withValue(async() => {
        const visibleRect = frame.visibleRect!;
        let outputWidth, outputHeight;
        if (resizeHeight !== null) {
            const resizedWidth = Math.round(
                visibleRect.width * resizeHeight /  visibleRect.height);
            outputWidth = resizedWidth;
            outputHeight = resizeHeight;
        } else {
            outputWidth = visibleRect.width;
            outputHeight = visibleRect.height;
        }
        let sourceFrameWasm = effect.inputBuffer(visibleRect.width, visibleRect.height);
        // For some stupid reason, this method is async! Why is a simple colorspace conversion async? The committee
        // says so, so it must be! Sync bad, async good! Race conditions are muuuuuch better than two frames of
        // jank! Async good, jank bad! Never mind that the WebAssembly memory might be invalidated by the time we're
        // *finished copying into it* by some other WASM method being called, and the only way to work around this
        // is to disallow *any* other WASM calls while we're busy doing a glorified memcpy asynchronously, or
        // introduce *another* intermediate array copy that the web committees all seem to pretend are completely
        // free. The best part, get this, drawing to a canvas is completely synchronous! Oh, that means we *could*
        // use `getImageData` to do things entirely synchronously, but that results in another intermediate copy and
        // Firefox now RANDOMIZES the pixel data for security-theater reasons. I greatly look forward to debugging a
        // bajillion different race conditions because the committees who design these APIs never have to actually
        // use them.
        // On iOS Safari, calling copyTo with format conversion options crashes or is ignored.
        // We call copyTo without conversion options (which copies the frame's native layout reliably)
        // and handle format and stride conversion in WebAssembly.
        let layouts;
        try {
            layouts = await frame.copyTo(sourceFrameWasm);
        } catch (e) {
            if (e instanceof RangeError || (e && typeof e === 'object' && 'name' in e && e.name === 'RangeError')) {
                // If it failed because the raw buffer was too small (due to large strides or padding),
                // resize it to 8 bytes per pixel (way larger than any layout would need) and retry.
                const requiredSize = visibleRect.width * visibleRect.height * 8;
                sourceFrameWasm = effect.resizeRawBuffer(requiredSize);
                layouts = await frame.copyTo(sourceFrameWasm);
            } else {
                throw e;
            }
        }

        effect.convertInputFormat(
            visibleRect.width,
            visibleRect.height,
            frame.format ?? 'RGBA',
            new Uint32Array(layouts.map(l => l.offset)),
            new Uint32Array(layouts.map(l => l.stride)),
            frame.colorSpace?.matrix ?? 'bt709',
            frame.colorSpace?.fullRange ?? false
        );
        // The rect must be in post-rotation coordinates because the Rust pipeline applies the effect after rotation.
        // 90/270-deg rotations swap width and height.
        const rotationSwaps = rotation === Rotation.Cw90 || rotation === Rotation.Cw270;
        const frameWidth = rotationSwaps ? outputHeight : outputWidth;
        const frameHeight = rotationSwaps ? outputWidth : outputHeight;
        const rect = outputRect ? {
            top: Math.max(0, Math.min(Math.round(outputRect.top * frameHeight), frameHeight)),
            left: Math.max(0, Math.min(Math.round(outputRect.left * frameWidth), frameWidth)),
            bottom: Math.max(0, Math.min(Math.round(outputRect.bottom * frameHeight), frameHeight)),
            right: Math.max(0, Math.min(Math.round(outputRect.right * frameWidth), frameWidth)),
        } : {
            top: 0,
            left: 0,
            bottom: frameHeight,
            right: frameWidth,
        };
        rect.bottom = Math.max(rect.bottom, rect.top);
        rect.right = Math.max(rect.right, rect.left);
        const dstFrameWasm = effect.applyEffect(
            frameNum,
            outputWidth,
            outputHeight,
            resizeFilter,
            padToEven,
            effectEnabled,
            rotation,
            rect.top,
            rect.right,
            rect.bottom,
            rect.left,
        );
        const frameTimestamp = frame.timestamp;
        const showTitle = titleEnabled && titleText && titleDuration > 0 && frameTimestamp < titleDuration * 1_000_000;

        let dstFrameClamped = new Uint8ClampedArray(
            memory.buffer,
            dstFrameWasm.ptr,
            dstFrameWasm.len,
        );
        const frameW = dstFrameWasm.width;
        const frameH = dstFrameWasm.height;

        if (showTitle) {
            const canvas = new OffscreenCanvas(frameW, frameH);
            const ctx = canvas.getContext('2d')!;
            const imageData = new ImageData(dstFrameClamped, frameW, frameH);
            ctx.putImageData(imageData, 0, 0);

            const fontSize = Math.max(16, Math.round(titleFontSize * frameH / 480));
            const fontFamilyMap: Record<TitleFontFamily, string> = {
                't-serif-light': "'TSerif Light'",
                't-serif-bold': "'TSerif Bold'",
                't-serif-black': "'TSerif Black'",
                't-display-light': "'TDisplay Light'",
                't-display-bold': "'TDisplay Bold'",
                't-display-black': "'TDisplay Black'",
            };
            ctx.font = `${fontSize}px ${fontFamilyMap[titleFontFamily] ?? "'TSerif Light'"}, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const padding = Math.round(frameH * 0.05);
            const maxWidth = frameW - padding * 2;
            let y: number;
            switch (titlePosition) {
                case 'top':
                    y = padding + fontSize;
                    ctx.textBaseline = 'top';
                    break;
                case 'bottom':
                    y = frameH - padding - fontSize;
                    ctx.textBaseline = 'bottom';
                    break;
                default:
                    y = frameH / 2;
                    break;
            }

            const lines = wrapText(ctx, titleText, maxWidth);
            const lineHeight = fontSize * 1.3;
            const totalHeight = lines.length * lineHeight;

            if (titlePosition === 'center') {
                y -= totalHeight / 2;
                ctx.textBaseline = 'top';
            }

            ctx.shadowColor = 'black';
            ctx.shadowBlur = Math.round(fontSize * 0.15);
            ctx.fillStyle = 'white';
            for (const line of lines) {
                ctx.fillText(line, frameW / 2, y, maxWidth);
                y += lineHeight;
            }

            const imageDataOut = ctx.getImageData(0, 0, frameW, frameH);
            dstFrameClamped = imageDataOut.data;
        }

        if (vhsDateTimeEnabled) {
            let dateStr: string;
            if (vhsDateTimeUseCustom) {
                const [y, m, d] = vhsCustomDate.split('-');
                dateStr = `${y}-${m}-${d}`;
            } else {
                const now = new Date();
                const y = String(now.getFullYear());
                const m = String(now.getMonth() + 1).padStart(2, '0');
                const d = String(now.getDate()).padStart(2, '0');
                dateStr = `${y}-${m}-${d}`;
            }

            const canvas = new OffscreenCanvas(frameW, frameH);
            const ctx = canvas.getContext('2d')!;
            const imageData = new ImageData(dstFrameClamped, frameW, frameH);
            ctx.putImageData(imageData, 0, 0);

            const fontSize = Math.max(10, Math.round(frameH * vhsDateTimeSize / 1000));
            const padding = Math.round(frameH * 0.02);

            ctx.font = `${fontSize}px 'VCR OSD Mono', monospace`;
            ctx.textBaseline = 'bottom';
            ctx.shadowColor = 'black';
            ctx.shadowBlur = Math.round(fontSize * 0.2);
            ctx.fillStyle = 'white';

            let x: number;
            if (vhsDateTimePosition === 'bottom-left') {
                ctx.textAlign = 'left';
                x = padding;
            } else {
                ctx.textAlign = 'right';
                x = frameW - padding;
            }

            ctx.fillText(dateStr, x, frameH - padding, frameW - padding * 2);

            const imageDataOut = ctx.getImageData(0, 0, frameW, frameH);
            dstFrameClamped = imageDataOut.data;
        }

        switch (format) {
            case 'imagebitmap':
                return await createImageBitmap(
                    new ImageData(dstFrameClamped, frameW, frameH),
                    {
                        premultiplyAlpha: 'none',
                        colorSpaceConversion: 'none',
                    },
                ) as Formats[F];
            case 'videoframe':
                return new VideoFrame(dstFrameClamped, {
                    format: 'RGBX',
                    codedWidth: frameW,
                    codedHeight: frameH,
                    timestamp: frameTimestamp,
                    duration: frame.duration ?? undefined,
                }) as Formats[F];
            case 'pngBlob': {
                const blob = await encodePng(
                    new ImageData(dstFrameClamped, frameW, frameH),
                    false,
                );
                return blob as Formats[F];
            }
        }
    });
};

function wrapText(ctx: OffscreenCanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (ctx.measureText(testLine).width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
}

addEventListener('message', listener);
