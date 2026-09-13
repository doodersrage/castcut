import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildComfyViewPath,
  buildComfyViewSrcSet,
  contentTypeForViewBytes,
  extractImagesFromOutputs,
  GALLERY_STRIP_THUMB_WIDTH,
  GALLERY_THUMB_SRCSET_WIDTHS,
  GALLERY_THUMB_WIDTH,
  isHtmlVideoContentType,
  isHtmlVideoContainer,
  isHtmlVideoViewUrl,
  isMotionViewUrl,
  isAnimatedImageBytes,
  isGalleryMotionOutput,
  resolveComfyOutputMediaKind,
  shouldSkipGalleryThumbProxy,
  shouldUseHtmlVideoElement,
  sniffMediaContentType,
} from "./comfyui-outputs";

describe("comfyui outputs view paths", () => {
  const image = {
    filename: "out.png",
    subfolder: "Castcut",
    type: "output",
  };

  it("builds full and width-capped view paths", () => {
    const full = buildComfyViewPath("http://127.0.0.1:8188", image);
    assert.match(full, /\/api\/comfyui\/view\?/);
    assert.doesNotMatch(full, /[?&]w=/);

    const thumb = buildComfyViewPath("http://127.0.0.1:8188/", image, {
      width: GALLERY_THUMB_WIDTH,
    });
    assert.match(thumb, new RegExp(`[?&]w=${GALLERY_THUMB_WIDTH}\\b`));

    const strip = buildComfyViewPath("http://127.0.0.1:8188", image, {
      width: GALLERY_STRIP_THUMB_WIDTH,
    });
    assert.match(strip, new RegExp(`[?&]w=${GALLERY_STRIP_THUMB_WIDTH}\\b`));

    const clip = buildComfyViewPath(
      "http://127.0.0.1:8188",
      { filename: "clip.webp", subfolder: "", type: "output", format: "image/webp" },
      { width: GALLERY_THUMB_WIDTH },
    );
    assert.doesNotMatch(clip, /[?&]w=/);
    assert.match(clip, /filename=clip\.webp/);
  });

  it("builds responsive srcSet entries", () => {
    const srcSet = buildComfyViewSrcSet("http://127.0.0.1:8188", image);
    for (const width of GALLERY_THUMB_SRCSET_WIDTHS) {
      assert.match(srcSet, new RegExp(`w=${width} ${width}w`));
    }
  });
});

describe("comfyui output media kind resolution", () => {
  it("treats plain photo formats as images", () => {
    assert.equal(resolveComfyOutputMediaKind({ filename: "out.png" }), "image");
    assert.equal(resolveComfyOutputMediaKind({ filename: "out.jpg" }), "image");
    assert.equal(
      resolveComfyOutputMediaKind({ filename: "out.bin", format: "image/png" }),
      "image",
    );
  });

  it("treats mp4/webm and format-tagged gif/webp as video for gallery rendering", () => {
    assert.equal(resolveComfyOutputMediaKind({ filename: "clip.mp4" }), "video");
    assert.equal(resolveComfyOutputMediaKind({ filename: "clip.webm" }), "video");
    // Bare .gif/.webp are ambiguous (still vs animated) — prefer image unless
    // Comfy tagged image/gif|webp or video/* (see resolveComfyOutputMediaKind).
    assert.equal(resolveComfyOutputMediaKind({ filename: "clip.gif" }), "image");
    assert.equal(resolveComfyOutputMediaKind({ filename: "clip.webp" }), "image");
    assert.equal(
      resolveComfyOutputMediaKind({ filename: "out.bin", format: "video/h264-mp4" }),
      "video",
    );
    assert.equal(
      resolveComfyOutputMediaKind({ filename: "out.bin", format: "image/gif" }),
      "video",
    );
    assert.equal(
      resolveComfyOutputMediaKind({ filename: "out.bin", format: "image/webp" }),
      "video",
    );
  });

  it("treats mp4 as video even when Comfy tags image/png", () => {
    assert.equal(
      resolveComfyOutputMediaKind({ filename: "clip.mp4", format: "image/png" }),
      "video",
    );
    assert.equal(isHtmlVideoContainer({ filename: "clip.mp4", format: "image/png" }), true);
    assert.equal(isHtmlVideoContainer({ filename: "clip.webp", format: "image/webp" }), false);
    assert.equal(isGalleryMotionOutput({ filename: "clip.webp", format: "image/webp" }), true);
    assert.equal(isGalleryMotionOutput({ filename: "Castcut_02188_.webp" }), true);
    assert.equal(isGalleryMotionOutput({ filename: "out.png" }), false);
    assert.equal(shouldSkipGalleryThumbProxy("clip.webp"), true);
    assert.equal(shouldSkipGalleryThumbProxy("out.png"), false);
    assert.equal(
      isHtmlVideoViewUrl("/api/comfyui/view?filename=clip.mp4&w=1600"),
      true,
    );
    assert.equal(
      isMotionViewUrl("/api/comfyui/view?filename=clip.webp&type=output"),
      true,
    );
  });

  it("prefers the explicit format hint over the file extension", () => {
    // ComfyUI sometimes emits a generic filename with the real kind only in `format`.
    assert.equal(
      resolveComfyOutputMediaKind({ filename: "ComfyUI_00001_.png", format: "video/webp" }),
      "video",
    );
  });

  it("extracts refs from both the images and gifs output keys", () => {
    const images = extractImagesFromOutputs({
      "6": {
        images: [{ filename: "frame.png", subfolder: "Castcut", type: "output" }],
      },
      "7": {
        gifs: [
          {
            filename: "clip.webp",
            subfolder: "Castcut",
            type: "output",
            format: "image/webp",
          },
        ],
      },
    });

    assert.equal(images.length, 2);
    assert.equal(images[0]?.filename, "clip.webp");
    assert.equal(images[1]?.filename, "frame.png");
    assert.equal(images[0]?.format, "image/webp");
    assert.equal(resolveComfyOutputMediaKind(images[0]!), "video");
  });

  it("prefers mp4 clips over preview stills and reads videos[] outputs", () => {
    const images = extractImagesFromOutputs({
      "6": {
        images: [{ filename: "preview.png", subfolder: "Castcut", type: "output" }],
      },
      "9": {
        videos: [
          { filename: "clip.mp4", subfolder: "Castcut", type: "output", format: "video/mp4" },
        ],
      },
    });
    assert.equal(images[0]?.filename, "clip.mp4");
    assert.equal(images[1]?.filename, "preview.png");
    assert.equal(
      shouldUseHtmlVideoElement("video", "/api/comfyui/view?filename=ComfyUI_00001_.png"),
      true,
    );
    assert.equal(
      shouldUseHtmlVideoElement("video", "/api/comfyui/view?filename=clip.webp"),
      false,
    );
  });

  it("extracts SaveAudio and SaveGLB output keys and prefers them over preview stills", () => {
    const images = extractImagesFromOutputs({
      "6": {
        images: [{ filename: "preview.png", subfolder: "mesh", type: "output" }],
      },
      "7": {
        audio: [
          { filename: "clip.flac", subfolder: "audio", type: "output", format: "audio/flac" },
        ],
      },
      "8": {
        "3d": [{ filename: "shape.glb", subfolder: "mesh", type: "output" }],
      },
    });
    assert.equal(images[0]?.filename, "clip.flac");
    assert.equal(images[1]?.filename, "shape.glb");
    assert.equal(images[2]?.filename, "preview.png");
    assert.equal(resolveComfyOutputMediaKind(images[0]!), "audio");
    assert.equal(resolveComfyOutputMediaKind(images[1]!), "mesh");
  });
});

describe("view proxy content types", () => {
  it("overrides ComfyUI image/png and octet-stream labels for mp4 filenames", () => {
    assert.equal(contentTypeForViewBytes("clip.mp4", "image/png"), "video/mp4");
    assert.equal(
      contentTypeForViewBytes("clip.mp4", "application/octet-stream"),
      "video/mp4",
    );
    assert.equal(contentTypeForViewBytes("clip.webm", null), "video/webm");
    assert.equal(isHtmlVideoContentType("video/mp4"), true);
    assert.equal(isHtmlVideoContentType("image/png"), false);
  });

  it("sniffs ISO BMFF bytes even when the filename looks like a png", () => {
    const ftyp = Buffer.alloc(16);
    ftyp.write("ftyp", 4);
    assert.equal(sniffMediaContentType(ftyp), "video/mp4");
    assert.equal(
      contentTypeForViewBytes("ComfyUI_00001_.png", "image/png", ftyp),
      "video/mp4",
    );
  });

  it("keeps still-image types for png/jpeg filenames", () => {
    assert.equal(contentTypeForViewBytes("out.png", "image/png"), "image/png");
    assert.equal(contentTypeForViewBytes("out.jpg", undefined), "image/jpeg");
  });

  it("uses audio and mesh MIME types instead of image/png", () => {
    assert.equal(contentTypeForViewBytes("out.wav", "application/octet-stream"), "audio/wav");
    assert.equal(contentTypeForViewBytes("out.flac", null), "audio/flac");
    assert.equal(contentTypeForViewBytes("shape.glb", "image/png"), "model/gltf-binary");
    assert.equal(shouldSkipGalleryThumbProxy("out.wav"), true);
    assert.equal(shouldSkipGalleryThumbProxy("shape.glb"), true);
  });

  it("detects animated webp VP8X bytes so thumbs are not flattened", () => {
    const animated = Buffer.alloc(21);
    animated.write("RIFF", 0);
    animated.write("WEBP", 8);
    animated.write("VP8X", 12);
    animated[20] = 0x02;
    assert.equal(isAnimatedImageBytes("clip.webp", animated), true);

    const still = Buffer.alloc(21);
    still.write("RIFF", 0);
    still.write("WEBP", 8);
    still.write("VP8 ", 12);
    assert.equal(isAnimatedImageBytes("photo.webp", still), false);
    assert.equal(isAnimatedImageBytes("loop.gif", Buffer.alloc(6)), true);
  });
});
