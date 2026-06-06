# Scripts

Run these scripts from the `web_player` directory.

## Create sample source

```bash
scripts/create-sample-source.sh media/source.mp4 60
```

Creates a deterministic H.264/AAC MP4 sample using FFmpeg test sources.

## Generate HLS

```bash
scripts/generate-hls.sh media/source.mp4 docs/streams/sample
```

Creates a master playlist and three media playlists: `180p`, `360p` and `720p`.

## Serve player

```bash
scripts/serve-player.sh 8008
```

Serves `docs/` at:

```text
http://127.0.0.1:8008/
```
