mod rotate;
mod settings;
mod utils;

extern crate alloc;

use fast_image_resize::{
    FilterType, ResizeAlg, ResizeOptions, Resizer, SrcCropping,
    images::TypedImage,
    pixels::U8x4,
};
use ntsc_rs::{
    NtscEffect, NtscEffectFullSettings,
    yiq_fielding::{BlitInfo, DeinterlaceMode, PixelFormat, Rect, Rgbx, YiqView, pixel_bytes_for},
};

use wasm_bindgen::prelude::*;

//pub use wasm_bindgen_rayon::init_thread_pool;
use web_sys::js_sys::Uint8Array;

use crate::rotate::Rotation;

#[allow(unused_macros)]
macro_rules! console_log {
    ($($t:tt)*) => (::web_sys::console::log_1(&format_args!($($t)*).to_string().into()))
}

#[wasm_bindgen]
pub struct NtscConfigurator(NtscEffectFullSettings);

#[wasm_bindgen]
impl NtscConfigurator {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self(NtscEffectFullSettings::default())
    }
}

#[wasm_bindgen]
#[derive(Default)]
pub struct NtscEffectBuf {
    effect: NtscEffect,
    resizer: Resizer,
    src: Box<[u8]>,
    raw_src: Box<[u8]>,
    effect_buf: Box<[f32]>,
    resize_dst: Box<[u8]>,
    rotate_dst: Box<[u8]>,
    effect_dst: Box<[u8]>,
    input_dimensions: (usize, usize),
}

#[wasm_bindgen]
pub enum ResizeFilter {
    Nearest,
    Bilinear,
    Bicubic,
}

fn maybe_resize<T: Default + Copy>(buf: &mut Box<[T]>, new_len: usize) {
    if buf.len() != new_len {
        *buf = vec![T::default(); new_len].into_boxed_slice();
    }
}

#[wasm_bindgen]
pub struct EffectOutput {
    pub ptr: *const u8,
    pub len: usize,
    pub width: usize,
    pub height: usize,
}

#[wasm_bindgen]
impl NtscEffectBuf {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Default::default()
    }

    /// Update the effect settings.
    #[wasm_bindgen(js_name = "setEffectSettings")]
    pub fn set_effect_settings(&mut self, settings: NtscConfigurator) {
        self.effect = settings.0.into();
    }

    /// Get a pointer to the raw input/source buffer. This is what the effect will read from, and what you should write to.
    #[wasm_bindgen(js_name = "inputBuffer")]
    pub fn input_buffer(&mut self, width: usize, height: usize) -> Uint8Array {
        let new_len = width * height * 4;
        maybe_resize(&mut self.raw_src, new_len);
        maybe_resize(&mut self.src, new_len);
        self.input_dimensions = (width, height);
        unsafe { Uint8Array::view_mut_raw(self.raw_src.as_mut_ptr(), self.raw_src.len()) }
    }

    /// Resize the raw input buffer to a larger size if needed.
    #[wasm_bindgen(js_name = "resizeRawBuffer")]
    pub fn resize_raw_buffer(&mut self, new_len: usize) -> Uint8Array {
        maybe_resize(&mut self.raw_src, new_len);
        unsafe { Uint8Array::view_mut_raw(self.raw_src.as_mut_ptr(), self.raw_src.len()) }
    }

    /// Convert the raw input buffer to tightly packed RGBX format.
    #[wasm_bindgen(js_name = "convertInputFormat")]
    pub fn convert_input_format(
        &mut self,
        width: usize,
        height: usize,
        format: &str,
        plane_offsets: &[usize],
        plane_strides: &[usize],
        matrix: &str,
        full_range: bool,
    ) -> Result<(), String> {
        if format == "RGBA" || format == "RGBX" {
            if plane_offsets.is_empty() || plane_strides.is_empty() {
                return Err("Missing offset or stride for RGBA/RGBX format".to_string());
            }
            let stride = plane_strides[0];
            let offset = plane_offsets[0];
            let row_bytes = width * 4;
            if offset + height * stride > self.raw_src.len() {
                return Err("Plane layout bounds exceeded raw buffer length".to_string());
            }
            if stride == row_bytes && offset == 0 {
                self.src[..row_bytes * height].copy_from_slice(&self.raw_src[..row_bytes * height]);
            } else {
                for r in 0..height {
                    let src_start = offset + r * stride;
                    let dst_start = r * row_bytes;
                    self.src[dst_start..dst_start + row_bytes]
                        .copy_from_slice(&self.raw_src[src_start..src_start + row_bytes]);
                }
            }
            return Ok(());
        }

        if format == "BGRA" || format == "BGRX" {
            if plane_offsets.is_empty() || plane_strides.is_empty() {
                return Err("Missing offset or stride for BGRA/BGRX format".to_string());
            }
            let stride = plane_strides[0];
            let offset = plane_offsets[0];
            let row_bytes = width * 4;
            if offset + height * stride > self.raw_src.len() {
                return Err("Plane layout bounds exceeded raw buffer length".to_string());
            }
            for r in 0..height {
                let src_start = offset + r * stride;
                let dst_start = r * row_bytes;
                let src_row = &self.raw_src[src_start..src_start + row_bytes];
                let dst_row = &mut self.src[dst_start..dst_start + row_bytes];
                for c in 0..width {
                    let b = src_row[c * 4];
                    let g = src_row[c * 4 + 1];
                    let r_val = src_row[c * 4 + 2];
                    let a = src_row[c * 4 + 3];
                    dst_row[c * 4] = r_val;
                    dst_row[c * 4 + 1] = g;
                    dst_row[c * 4 + 2] = b;
                    dst_row[c * 4 + 3] = a;
                }
            }
            return Ok(());
        }

        if format == "NV12" {
            if plane_offsets.len() < 2 || plane_strides.len() < 2 {
                return Err("Missing offsets or strides for NV12 format (requires 2 planes)".to_string());
            }
            let y_offset = plane_offsets[0];
            let y_stride = plane_strides[0];
            let uv_offset = plane_offsets[1];
            let uv_stride = plane_strides[1];

            if y_offset + height * y_stride > self.raw_src.len() || uv_offset + (height / 2) * uv_stride > self.raw_src.len() {
                return Err("NV12 plane layout bounds exceeded raw buffer length".to_string());
            }

            // Select coefficients based on matrix.
            // BT.601 / SMPTE 170M vs BT.709.
            let (cr_r, cb_g, cr_g, cb_b) = if matrix == "bt601" || matrix == "smpte170m" || matrix == "bt470bg" {
                (1.596027, 0.391762, 0.812968, 2.017232)
            } else {
                // Default to BT.709
                (1.792741, 0.213249, 0.532909, 2.112402)
            };

            for r in 0..height {
                let y_row_start = y_offset + r * y_stride;
                let uv_row_start = uv_offset + (r / 2) * uv_stride;
                let dst_row_start = r * width * 4;

                for c in 0..width {
                    let y_val = self.raw_src[y_row_start + c] as f32;
                    let u_val = self.raw_src[uv_row_start + (c / 2) * 2] as f32 - 128.0;
                    let v_val = self.raw_src[uv_row_start + (c / 2) * 2 + 1] as f32 - 128.0;

                    let y_norm = if full_range {
                        y_val
                    } else {
                        (y_val - 16.0) * 1.164383
                    };

                    let red = (y_norm + cr_r * v_val).clamp(0.0, 255.0) as u8;
                    let green = (y_norm - cb_g * u_val - cr_g * v_val).clamp(0.0, 255.0) as u8;
                    let blue = (y_norm + cb_b * u_val).clamp(0.0, 255.0) as u8;

                    let pixel_idx = dst_row_start + c * 4;
                    self.src[pixel_idx] = red;
                    self.src[pixel_idx + 1] = green;
                    self.src[pixel_idx + 2] = blue;
                    self.src[pixel_idx + 3] = 255;
                }
            }
            return Ok(());
        }

        if format == "I420" {
            if plane_offsets.len() < 3 || plane_strides.len() < 3 {
                return Err("Missing offsets or strides for I420 format (requires 3 planes)".to_string());
            }
            let y_offset = plane_offsets[0];
            let y_stride = plane_strides[0];
            let u_offset = plane_offsets[1];
            let u_stride = plane_strides[1];
            let v_offset = plane_offsets[2];
            let v_stride = plane_strides[2];

            if y_offset + height * y_stride > self.raw_src.len()
                || u_offset + (height / 2) * u_stride > self.raw_src.len()
                || v_offset + (height / 2) * v_stride > self.raw_src.len()
            {
                return Err("I420 plane layout bounds exceeded raw buffer length".to_string());
            }

            let (cr_r, cb_g, cr_g, cb_b) = if matrix == "bt601" || matrix == "smpte170m" || matrix == "bt470bg" {
                (1.596027, 0.391762, 0.812968, 2.017232)
            } else {
                (1.792741, 0.213249, 0.532909, 2.112402)
            };

            for r in 0..height {
                let y_row_start = y_offset + r * y_stride;
                let u_row_start = u_offset + (r / 2) * u_stride;
                let v_row_start = v_offset + (r / 2) * v_stride;
                let dst_row_start = r * width * 4;

                for c in 0..width {
                    let y_val = self.raw_src[y_row_start + c] as f32;
                    let u_val = self.raw_src[u_row_start + (c / 2)] as f32 - 128.0;
                    let v_val = self.raw_src[v_row_start + (c / 2)] as f32 - 128.0;

                    let y_norm = if full_range {
                        y_val
                    } else {
                        (y_val - 16.0) * 1.164383
                    };

                    let red = (y_norm + cr_r * v_val).clamp(0.0, 255.0) as u8;
                    let green = (y_norm - cb_g * u_val - cr_g * v_val).clamp(0.0, 255.0) as u8;
                    let blue = (y_norm + cb_b * u_val).clamp(0.0, 255.0) as u8;

                    let pixel_idx = dst_row_start + c * 4;
                    self.src[pixel_idx] = red;
                    self.src[pixel_idx + 1] = green;
                    self.src[pixel_idx + 2] = blue;
                    self.src[pixel_idx + 3] = 255;
                }
            }
            return Ok(());
        }

        if format == "I420A" {
            if plane_offsets.len() < 4 || plane_strides.len() < 4 {
                return Err("Missing offsets or strides for I420A format (requires 4 planes)".to_string());
            }
            let y_offset = plane_offsets[0];
            let y_stride = plane_strides[0];
            let u_offset = plane_offsets[1];
            let u_stride = plane_strides[1];
            let v_offset = plane_offsets[2];
            let v_stride = plane_strides[2];
            let a_offset = plane_offsets[3];
            let a_stride = plane_strides[3];

            if y_offset + height * y_stride > self.raw_src.len()
                || u_offset + (height / 2) * u_stride > self.raw_src.len()
                || v_offset + (height / 2) * v_stride > self.raw_src.len()
                || a_offset + height * a_stride > self.raw_src.len()
            {
                return Err("I420A plane layout bounds exceeded raw buffer length".to_string());
            }

            let (cr_r, cb_g, cr_g, cb_b) = if matrix == "bt601" || matrix == "smpte170m" || matrix == "bt470bg" {
                (1.596027, 0.391762, 0.812968, 2.017232)
            } else {
                (1.792741, 0.213249, 0.532909, 2.112402)
            };

            for r in 0..height {
                let y_row_start = y_offset + r * y_stride;
                let u_row_start = u_offset + (r / 2) * u_stride;
                let v_row_start = v_offset + (r / 2) * v_stride;
                let a_row_start = a_offset + r * a_stride;
                let dst_row_start = r * width * 4;

                for c in 0..width {
                    let y_val = self.raw_src[y_row_start + c] as f32;
                    let u_val = self.raw_src[u_row_start + (c / 2)] as f32 - 128.0;
                    let v_val = self.raw_src[v_row_start + (c / 2)] as f32 - 128.0;
                    let a_val = self.raw_src[a_row_start + c];

                    let y_norm = if full_range {
                        y_val
                    } else {
                        (y_val - 16.0) * 1.164383
                    };

                    let red = (y_norm + cr_r * v_val).clamp(0.0, 255.0) as u8;
                    let green = (y_norm - cb_g * u_val - cr_g * v_val).clamp(0.0, 255.0) as u8;
                    let blue = (y_norm + cb_b * u_val).clamp(0.0, 255.0) as u8;

                    let pixel_idx = dst_row_start + c * 4;
                    self.src[pixel_idx] = red;
                    self.src[pixel_idx + 1] = green;
                    self.src[pixel_idx + 2] = blue;
                    self.src[pixel_idx + 3] = a_val;
                }
            }
            return Ok(());
        }

        Err(format!("Unsupported video pixel format: {}", format))
    }

    /// Apply the effect in-place on the contents of the source buffer, writing to and returning
    /// the destination buffer.
    ///
    /// Pipeline: input -> [resize] -> [rotate] -> [effect] -> output.
    /// Each optional step writes to its own intermediate buffer; the final result always ends up
    /// in `self.effect_dst`.
    #[wasm_bindgen(js_name = "applyEffect")]
    pub fn apply_effect(
        &mut self,
        frame_num: usize,
        resize_width: usize,
        resize_height: usize,
        resize_filter: ResizeFilter,
        pad_to_even: bool,
        effect_enabled: bool,
        rotation: Rotation,
        rect_top: u32,
        rect_right: u32,
        rect_bottom: u32,
        rect_left: u32,
    ) -> Result<EffectOutput, String> {
        const BYTES_PER_PIXEL: usize = pixel_bytes_for::<Rgbx, u8>();

        // dst_width/dst_height are the resize target (pre-rotation). The actual frame dimensions after rotation may
        // differ for 90/270 degrees.
        let (frame_w, frame_h) = rotation.output_dimensions(resize_width, resize_height);

        let (frame_w_padded, frame_h_padded) = if pad_to_even {
            (frame_w.div_ceil(2) * 2, frame_h.div_ceil(2) * 2)
        } else {
            (frame_w, frame_h)
        };

        let needs_resize = self.input_dimensions != (resize_width, resize_height);
        let needs_rotate = rotation != Rotation::None;

        // Allocate the final output buffer.
        let new_dst_len = frame_w_padded * frame_h_padded * BYTES_PER_PIXEL;
        maybe_resize(&mut self.effect_dst, new_dst_len);

        // Step 1: resize
        if needs_resize {
            maybe_resize(
                &mut self.resize_dst,
                resize_width * resize_height * BYTES_PER_PIXEL,
            );

            let resize_alg = match resize_filter {
                ResizeFilter::Nearest => ResizeAlg::Nearest,
                ResizeFilter::Bilinear => ResizeAlg::Convolution(FilterType::Bilinear),
                ResizeFilter::Bicubic => ResizeAlg::Convolution(FilterType::CatmullRom),
            };
            let resize_options = ResizeOptions {
                algorithm: resize_alg,
                cropping: SrcCropping::None,
                mul_div_alpha: false,
            };

            let src_image = TypedImage::<'_, U8x4>::from_buffer(
                self.input_dimensions.0 as u32,
                self.input_dimensions.1 as u32,
                &mut self.src,
            )
            .map_err(|e| e.to_string())?;
            let mut dst_image = TypedImage::<'_, U8x4>::from_buffer(
                resize_width as u32,
                resize_height as u32,
                &mut self.resize_dst,
            )
            .map_err(|e| e.to_string())?;

            self.resizer
                .resize_typed(&src_image, &mut dst_image, &resize_options)
                .map_err(|e| e.to_string())?;
        } else {
            maybe_resize(&mut self.resize_dst, 0);
        }

        // Step 2: rotate
        if needs_rotate {
            maybe_resize(
                &mut self.rotate_dst,
                frame_w * frame_h * BYTES_PER_PIXEL,
            );
            let rotate_src = if needs_resize {
                &*self.resize_dst
            } else {
                &*self.src
            };
            rotate::rotate(
                rotate_src,
                &mut self.rotate_dst,
                resize_width,
                resize_height,
                rotation,
            );
        } else {
            maybe_resize(&mut self.rotate_dst, 0);
        }

        // Step 3: effect
        if effect_enabled {
            // Resolve the "current" buffer: the output of whichever pipeline step ran last.
            // In every case this buffer holds exactly frame_w × frame_h pixels.
            let pre_effect_src: &[u8] = if needs_rotate {
                &self.rotate_dst
            } else if needs_resize {
                &self.resize_dst
            } else {
                &self.src
            };

            let new_yiq_len =
                YiqView::max_buf_length_for((frame_w, frame_h), self.effect.use_field);
            maybe_resize(&mut self.effect_buf, new_yiq_len);

            let field = self.effect.use_field.to_yiq_field(frame_num);
            let mut view = YiqView::from_parts(
                &mut self.effect_buf[..YiqView::buf_length_for((frame_w, frame_h), field)],
                (frame_w, frame_h),
                field,
            );
            view.set_from_strided_buffer::<Rgbx, u8, _>(
                pre_effect_src,
                BlitInfo::from_full_frame(frame_w, frame_h, frame_w * BYTES_PER_PIXEL),
                (),
            );
            self.effect
                .apply_effect_to_yiq(&mut view, frame_num, [1.0, 1.0]);

            let dst_rect = Rect::new(
                rect_top as usize,
                rect_left as usize,
                rect_bottom as usize,
                rect_right as usize,
            );

            // If we're not filling the entire destination frame, we're in split-screen mode and
            // need the post-resize/rotate, pre-effect frame as a backdrop. This does not handle
            // padding to even dimensions, but those two code paths never overlap (we pad when
            // rendering, split-screen only in the preview).
            if dst_rect.left != 0
                || dst_rect.top != 0
                || dst_rect.right != frame_w
                || dst_rect.bottom != frame_h
            {
                debug_assert!(
                    frame_w_padded == frame_w && frame_h_padded == frame_h,
                    "split-screen backdrop copy assumes no padding"
                );
                self.effect_dst[..pre_effect_src.len()].copy_from_slice(pre_effect_src);
            }

            let dst_blit_info = BlitInfo {
                rect: dst_rect,
                destination: (dst_rect.left, dst_rect.top),
                row_bytes: frame_w_padded * 4,
                other_buffer_height: frame_h_padded,
                flip_y: false,
            };

            view.write_to_strided_buffer::<Rgbx, u8, _>(
                &mut self.effect_dst,
                dst_blit_info,
                DeinterlaceMode::Bob,
                (),
            );
        } else {
            maybe_resize(&mut self.effect_buf, 0);

            // When there is no padding, the last intermediate buffer and effect_dst are the
            // same size, so we can swap them in O(1) instead of doing a full-frame memcpy.
            // This is safe because JS gets a fresh Uint8Array view from inputBuffer() each
            // frame and never retains it across applyEffect calls, so swapping self.src is
            // fine too.
            let no_padding =
                frame_w_padded == frame_w && frame_h_padded == frame_h;
            if no_padding {
                if needs_rotate {
                    std::mem::swap(&mut self.rotate_dst, &mut self.effect_dst);
                } else if needs_resize {
                    std::mem::swap(&mut self.resize_dst, &mut self.effect_dst);
                } else {
                    std::mem::swap(&mut self.src, &mut self.effect_dst);
                }
            } else {
                let pre_effect_src: &[u8] = if needs_rotate {
                    &self.rotate_dst
                } else if needs_resize {
                    &self.resize_dst
                } else {
                    &self.src
                };

                // Copy pre-effect source into the output buffer, accounting for possible
                // padding. The zip naturally stops after frame_h rows (the real data),
                // leaving the padded row for the height fixup below.
                if frame_w_padded != frame_w {
                    for (dst_row, src_row) in self
                        .effect_dst
                        .chunks_exact_mut(frame_w_padded * BYTES_PER_PIXEL)
                        .zip(pre_effect_src.chunks_exact(frame_w * BYTES_PER_PIXEL))
                    {
                        dst_row[..frame_w * BYTES_PER_PIXEL].copy_from_slice(src_row);
                    }
                } else {
                    self.effect_dst[..pre_effect_src.len()].copy_from_slice(pre_effect_src);
                }
            }
        }

        // Padding fixup
        if frame_w_padded != frame_w {
            for row in self
                .effect_dst
                .chunks_exact_mut(frame_w_padded * BYTES_PER_PIXEL)
            {
                let (written, remainder) = row.split_at_mut(frame_w * BYTES_PER_PIXEL);
                remainder.copy_from_slice(&written[written.len() - Rgbx::NUM_COMPONENTS..]);
            }
        }
        if frame_h_padded != frame_h {
            let last_dst_rows =
                &mut self.effect_dst[(frame_w_padded * BYTES_PER_PIXEL) * (frame_h_padded - 2)..];
            let (second_last_dst_row, last_dst_row) =
                last_dst_rows.split_at_mut(frame_w_padded * BYTES_PER_PIXEL);
            last_dst_row.copy_from_slice(second_last_dst_row);
        }

        Ok(EffectOutput {
            ptr: self.effect_dst.as_ptr(),
            len: self.effect_dst.len(),
            width: frame_w_padded,
            height: frame_h_padded,
        })
    }
}
