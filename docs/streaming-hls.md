# Adaptive Streaming (HLS) for Musee

This guide explains how to deliver secure, adaptive (HLS) audio streaming from Azure Blob Storage to your Flutter app.

## Overview

You will:
- Generate HLS outputs (master playlist + multiple bitrate variants + segments) per track.
- Store them privately in Azure Blob Storage.
- Serve them to authenticated users securely using one of two patterns:
  1) Signed URLs (SAS) with server-side playlist rewrite.
  2) API proxy for playlists and segments.
- Play them in Flutter using `just_audio` (recommended) or `video_player`.

---

## 1) Storage layout and settings

- Keep your blob container PRIVATE (no anonymous access). Reuse `AZURE_STORAGE_CONTAINER` (default `media`).
- Suggested layout per track:

```
media/
  hls/
    track_<track_id>/
      master.m3u8
      v96/
        index.m3u8
        seg_00001.ts
        seg_00002.ts
        ...
      v160/
        index.m3u8
        seg_00001.ts
        ...
      v320/
        index.m3u8
        seg_00001.ts
        ...
```

Notes:
- Use short segment durations (e.g., 4–6s) for better seek/start latency.
- Optional: Put Azure CDN in front of the Blob endpoint for lower latency and caching.
- If you plan to expose the CDN with SAS URLs, configure the CDN to forward query parameters.

CORS (only needed if you expose SAS URLs to clients directly):
- Allowed origins: your web/Flutter web domain(s)
- Allowed methods: GET, HEAD
- Allowed headers: Range (not strictly required for HLS), Origin
- Expose headers: Content-Length, Content-Type

---

## 2) Generate HLS variants with ffmpeg

Extend `src/utils/processAudio.js` to produce HLS outputs. Example ffmpeg command (audio-only):

```bash
ffmpeg -i input.wav \
  -filter_complex "[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,asplit=3[a1][a2][a3]" \
  -map [a1] -c:a aac -b:a 96k  -hls_time 4 -hls_playlist_type vod -hls_segment_filename v96/seg_%05d.ts  v96/index.m3u8 \
  -map [a2] -c:a aac -b:a 160k -hls_time 4 -hls_playlist_type vod -hls_segment_filename v160/seg_%05d.ts v160/index.m3u8 \
  -map [a3] -c:a aac -b:a 320k -hls_time 4 -hls_playlist_type vod -hls_segment_filename v320/seg_%05d.ts v320/index.m3u8
```

Then write a `master.m3u8` that references the variant playlists:

```m3u8
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-STREAM-INF:BANDWIDTH=128000,CODECS="mp4a.40.2"
v96/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=192000,CODECS="mp4a.40.2"
v160/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=384000,CODECS="mp4a.40.2"
v320/index.m3u8
```

Finally upload the whole folder `hls/track_<id>/...` to Azure Blob Storage, preserving paths.

Implementation tips in Node:
- Use `containerClient.getBlockBlobClient(path).uploadFile(localPath, { blobHTTPHeaders: { blobContentType: 'application/vnd.apple.mpegurl' }})` for `.m3u8`.
- Set `blobContentType: 'video/mp2t'` for `.ts` segments.

---

## 3) Secure delivery patterns

Choose ONE of the following.

### A) Signed URLs (SAS) with playlist rewrite (balanced)

- Keep container private.
- When a user requests a track stream, your API:
  1) Authenticates the user.
  2) Generates short-lived SAS URLs (e.g., 30–60 minutes) for `master.m3u8` and all variant/segment paths.
  3) Rewrites the `master.m3u8` to point to absolute URLs with SAS for variant playlists (and optionally rewrites each variant playlist to include SAS on segment URIs).
  4) Returns the rewritten master.

Pros: Offloads bandwidth to Blob/CDN, no permanent URLs, good security.
Cons: Need to rewrite playlists and choose a TTL >= track duration.

Azure SDK hint:
- Use `@azure/storage-blob` and `StorageSharedKeyCredential` (requires `AZURE_STORAGE_ACCOUNT` and `AZURE_STORAGE_ACCOUNT_KEY`).
- Generate SAS per blob using `generateBlobSASQueryParameters` with `permissions: r`.

Endpoint shapes (implemented):
- `GET /api/user/tracks/:id/hls/master.m3u8` → returns rewritten master playlist with SAS URLs to variant playlists.
- `GET /api/user/tracks/:id/hls/v:bitrate/index.m3u8` → returns rewritten variant playlist with SAS URLs to segment files.

### B) Proxy playlists and segments via API (most secure)

- Keep container private.
- Your API serves:
  - `GET /api/user/tracks/:id/hls/master.m3u8` → reads the original master from Blob, rewrites URIs to proxied paths like `/api/user/tracks/:id/hls/v96/index.m3u8` and returns it.
  - `GET /api/user/tracks/:id/hls/v:bitrate/index.m3u8` → returns the variant playlist with segment URIs rewritten to proxied segment URLs.
  - `GET /api/user/tracks/:id/hls/v:bitrate/:segment` → streams the `.ts` from Blob to client.

Pros: No SAS exposed; enforce auth per request; flexible.
Cons: Your server handles all traffic (consider CDN in front of API, caching headers, rate limits).

Implementation notes:
- For `.m3u8` responses, set `Content-Type: application/vnd.apple.mpegurl`.
- For `.ts` responses, set `Content-Type: video/mp2t`.
- No Range is required for HLS segments, but keep responses cacheable (`Cache-Control: private, max-age=60`) if desired.

---

## 4) Schema/API changes

- Minimal DB addition (optional): store `hls_path` for a track, e.g., `hls/track_<id>/master.m3u8`.
  - Option A: create `track_streams` table: `(track_id UUID PK, hls_path TEXT, created_at TIMESTAMPTZ)`.
  - Option B: reuse `track_audios` with `ext = 'm3u8'` and `path` = master playlist path.
- User API:
  - HLS endpoints added (SAS rewrite):
    - `GET /api/user/tracks/:id/hls/master.m3u8`
    - `GET /api/user/tracks/:id/hls/v:bitrate/index.m3u8`
  - `GET /api/user/tracks/:id` can optionally include an `hls` object in the future (e.g., availability or convenience URL).

---

## 5) Flutter client

Use `just_audio` (recommended). ExoPlayer/AVPlayer handle HLS on Android/iOS.

```dart
import 'package:just_audio/just_audio.dart';

final player = AudioPlayer();

Future<void> playHls(String masterUrlOrApiEndpoint) async {
  await player.setUrl(masterUrlOrApiEndpoint, headers: {
    // If using tokened API endpoints, include Authorization here
    // 'Authorization': 'Bearer <JWT>',
  });
  await player.play();
}
```

Notes:
- If using signed (SAS) URLs, no extra headers needed; pass the master.m3u8 SAS URL.
- If using proxied API, pass the API URL and include Authorization header.
- For background playback: pair `just_audio` with `audio_service` / `just_audio_background`.

---

## 6) Practical recommendations

- Start with Pattern A (SAS + rewrite) if you want CDN offload and simpler scaling. Choose TTL >= track length + buffer (e.g., 60 minutes). Refresh by reloading the master if needed.
- Use Pattern B (proxy) if you need strict control/DRM-like behavior or per-request auditing.
- Keep segments small (4–6s). Generate 2–3 bitrates (96/160/320 kbps) for a good balance.
- Set correct Content-Types on blobs (`application/vnd.apple.mpegurl` for .m3u8, `video/mp2t` for .ts).

---

## 7) Next steps checklist

1. Update `processAudio.js` to emit HLS artifacts for each track and upload to Blob under `hls/track_<id>/...`.
2. Add a minimal schema field to store `hls_path` or put a row in `track_audios` with `ext='m3u8'`.
3. Implement either:
   - A: An endpoint that rewrites master/variants with SAS URLs, or
   - B: Proxied endpoints for master/variants/segments.
4. Expose the stream URL in `GET /api/user/tracks/:id` (e.g., `hls: { available: true, url: "/api/user/tracks/:id/hls/master.m3u8" }`).
5. In Flutter, use `just_audio` and `setUrl()` with the provided URL (point to the API HLS master endpoint).

### Example Flutter usage

```dart
final masterUrl = 'https://your-api.example.com/api/user/tracks/<track_id>/hls/master.m3u8';
await player.setUrl(masterUrl, headers: {
  'Authorization': 'Bearer <JWT>',
});
await player.play();
```

If you'd like, I can generate the code scaffolding for Pattern A or B and wire it into your user routes.
