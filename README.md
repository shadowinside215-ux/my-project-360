# 360 Panorama Creator

A mobile-friendly web app to capture, stitch, and view interactive 360-degree panoramas.

## Features
- **Capture Mode**: Take multiple photos using your device's camera.
- **Stitch Mode**: Naive grid-based stitching into an equirectangular panorama.
- **View Mode**: Interactive 360 viewer using Three.js.
- **Save**: Download the final panorama as a JPEG.

## Deployment to Netlify
1. Connect your GitHub repository to Netlify.
2. Set the **Build command** to `npm run build`.
3. Set the **Publish directory** to `dist`.
4. (Optional) Add your `GEMINI_API_KEY` as an environment variable in Netlify if you plan to use AI features.

The `netlify.toml` file is already included to handle these settings automatically.
