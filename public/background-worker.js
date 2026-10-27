/* MediaPipe runs off the studio thread. No camera frames leave this worker. */
importScripts("./vendor/vision_bundle.js");
let segmenter;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      const files = await Vision.FilesetResolver.forVisionTasks(
        new URL("./vendor/wasm", self.location).href,
      );
      const options = {
        baseOptions: {
          modelAssetPath: new URL(
            "./models/selfie_segmenter_landscape.tflite",
            self.location,
          ).href,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      };
      let delegate = "GPU";
      try {
        segmenter = await Vision.ImageSegmenter.createFromOptions(
          files,
          options,
        );
      } catch {
        delegate = "CPU";
        options.baseOptions.delegate = "CPU";
        segmenter = await Vision.ImageSegmenter.createFromOptions(
          files,
          options,
        );
      }
      self.postMessage({
        type: "ready",
        delegate,
        labels: segmenter.getLabels(),
      });
    } else if (data.type === "frame" && segmenter) {
      try {
        segmenter.segmentForVideo(data.bitmap, data.timestamp, (result) => {
          const mask =
            result.confidenceMasks.length > 1
              ? result.confidenceMasks[1]
              : result.confidenceMasks[0];
          const values = mask.getAsFloat32Array();
          const pixels = new Uint8ClampedArray(values.length * 4);
          for (let i = 0; i < values.length; i++) {
            pixels[i * 4] = pixels[i * 4 + 1] = pixels[i * 4 + 2] = 255;
            pixels[i * 4 + 3] = Math.round(
              Math.max(0, Math.min(1, (values[i] - 0.2) / 0.6)) * 255,
            );
          }
          self.postMessage(
            {
              type: "mask",
              width: mask.width,
              height: mask.height,
              pixels: pixels.buffer,
            },
            [pixels.buffer],
          );
        });
      } finally {
        data.bitmap.close();
      }
    }
  } catch {
    data.bitmap?.close();
    self.postMessage({
      type: "error",
      message:
        "Background processing failed. Turn the effect off and try again.",
    });
  }
};
