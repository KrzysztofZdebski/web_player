# Streams

Generated HLS packages are written here.

From the exercise root:

```bash
scripts/create-sample-source.sh media/source.mp4 60
scripts/generate-hls.sh media/source.mp4 player/streams/sample
```

The player expects the default generated master playlist at:

```text
streams/sample/master.m3u8
```
