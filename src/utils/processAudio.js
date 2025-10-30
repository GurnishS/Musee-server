const fs = require('fs');
const os = require('os');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const { blobServiceClient, containerName } = require('../db/config');
const { v4: uuidv4 } = require('uuid');
const mime = require('mime-types');

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const containerClient = blobServiceClient ? blobServiceClient.getContainerClient(containerName) : null;

function ffprobe(filePath) {
    return new Promise((resolve, reject) => ffmpeg.ffprobe(filePath, (err, metadata) => (err ? reject(err) : resolve(metadata))));
}

function convertToOgg(inputPath, outputPath, bitrateKbps) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .noVideo()
            .audioCodec('libvorbis')
            .audioBitrate(`${bitrateKbps}k`)
            .save(outputPath)
            .on('end', () => resolve(outputPath))
            .on('error', reject);
    });
}

function convertToMp3(inputPath, outputPath, bitrateKbps) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .noVideo()
            .audioCodec('libmp3lame')
            .audioBitrate(`${bitrateKbps}k`)
            .save(outputPath)
            .on('end', () => resolve(outputPath))
            .on('error', reject);
    });
}

async function uploadToBlob(localPath, blobName) {
    if (!containerClient) throw new Error('Azure Blob Storage not configured');
    // ensure container exists (create if missing)
    try {
        await containerClient.createIfNotExists();
    } catch (e) {
        // ignore errors here, upload will surface actual problem
        console.warn('Could not create or verify container:', e?.message || e);
    }

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const ext = path.extname(localPath).toLowerCase();
    let mimeType = mime.lookup(localPath) || 'application/octet-stream';
    if (ext === '.m3u8') mimeType = 'application/vnd.apple.mpegurl';
    else if (ext === '.ts') mimeType = 'video/mp2t';
    await blockBlobClient.uploadFile(localPath, {
        blobHTTPHeaders: { blobContentType: mimeType },
    });
    // Return blob path (name) instead of absolute URL. We'll sign it when serving.
    return blockBlobClient.name;
}

function getAudioFileFromReq(req) {
    if (req.files && req.files.audio && req.files.audio.length) return req.files.audio[0];
    if (req.file) return req.file;
    return null;
}

// Helper: process audio buffer and upload variants to blob storage for a given trackId
async function processAudioBuffer(audioFile, trackId) {
    if (!audioFile) throw new Error('No audio file provided');
    if (!blobServiceClient) throw new Error('Azure Blob Storage not configured');

    const tmpDir = path.join(os.tmpdir(), 'musee_audio');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const originalName = path.parse(audioFile.originalname || 'audio').name;
    const infile = path.join(tmpDir, `${uuidv4()}_${originalName}${path.extname(audioFile.originalname) || '.in'}`);

    // write buffer to temp file (multer memoryStorage)
    if (audioFile.buffer) {
        fs.writeFileSync(infile, audioFile.buffer);
    } else if (audioFile.path) {
        // disk storage
        fs.copyFileSync(audioFile.path, infile);
    } else {
        throw new Error('Unsupported audio file input');
    }

    const metadata = await ffprobe(infile);
    const bitrate = metadata?.format?.bit_rate ? Math.round(Number(metadata.format.bit_rate) / 1000) : null;
    if (!bitrate) throw new Error('Unable to determine audio bitrate');

    // variants to generate (kbps)
    const variants = [96, 160, 320];
    const generated = {};

    // create mp3 at original bitrate
    const mp3Ext = 'mp3';
    const mp3Filename = `track_${trackId}_${bitrate}k.${mp3Ext}`;
    const mp3Local = path.join(tmpDir, mp3Filename);
    await convertToMp3(infile, mp3Local, bitrate);
    const mp3Blob = `audio/${mp3Filename}`;
    const mp3Path = await uploadToBlob(mp3Local, mp3Blob);
    generated[`${bitrate}k_mp3`] = mp3Path;

    // create ogg variants up to original bitrate
    for (const kb of variants) {
        if (bitrate >= kb) {
            const oggExt = 'ogg';
            const oggFilename = `track_${trackId}_${kb}k.${oggExt}`;
            const oggLocal = path.join(tmpDir, oggFilename);
            await convertToOgg(infile, oggLocal, kb);
            const oggBlob = `audio/${oggFilename}`;
            const oggPath = await uploadToBlob(oggLocal, oggBlob);
            generated[`${kb}k_ogg`] = oggPath;
        }
    }

    // Generate HLS variants and master playlist
    const hlsRootDir = path.join(tmpDir, `hls_${trackId}_${uuidv4()}`);
    fs.mkdirSync(hlsRootDir, { recursive: true });

    async function generateHlsVariant(kb) {
        const vDir = path.join(hlsRootDir, `v${kb}`);
        fs.mkdirSync(vDir, { recursive: true });
        const segPattern = path.join(vDir, 'seg_%05d.ts');
        const playlistPath = path.join(vDir, 'index.m3u8');
        await new Promise((resolve, reject) => {
            ffmpeg(infile)
                .noVideo()
                .audioCodec('aac')
                .audioBitrate(`${kb}k`)
                .format('hls')
                .outputOptions([
                    '-hls_time 4',
                    '-hls_playlist_type vod',
                    `-hls_segment_filename ${segPattern.replace(/\\/g, '/')}`,
                ])
                .output(playlistPath)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });
    }

    for (const kb of variants) {
        await generateHlsVariant(kb);
    }

    // Write master.m3u8
    const masterPath = path.join(hlsRootDir, 'master.m3u8');
    const masterContent = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXT-X-INDEPENDENT-SEGMENTS',
        '#EXT-X-STREAM-INF:BANDWIDTH=128000,CODECS="mp4a.40.2"',
        'v96/index.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=192000,CODECS="mp4a.40.2"',
        'v160/index.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=384000,CODECS="mp4a.40.2"',
        'v320/index.m3u8',
        ''
    ].join('\n');
    fs.writeFileSync(masterPath, masterContent, 'utf8');

    // Upload HLS tree under hls/track_<trackId>/
    async function uploadDir(localDir, baseBlobPrefix) {
        const entries = fs.readdirSync(localDir, { withFileTypes: true });
        for (const ent of entries) {
            const local = path.join(localDir, ent.name);
            const rel = path.relative(hlsRootDir, local).replace(/\\/g, '/');
            const blobName = `${baseBlobPrefix}/${rel}`;
            if (ent.isDirectory()) {
                await uploadDir(local, baseBlobPrefix);
            } else {
                await uploadToBlob(local, blobName);
            }
        }
    }
    const hlsPrefix = `hls/track_${trackId}`;
    await uploadDir(hlsRootDir, hlsPrefix);

    // cleanup temp files
    try { fs.unlinkSync(infile); } catch (e) { }
    Object.keys(generated).forEach((k) => {
        const fname = generated[k].split('/').pop();
        const local = path.join(tmpDir, fname);
        try { if (fs.existsSync(local)) fs.unlinkSync(local); } catch (e) { }
    });

    return { bitrate, files: generated, hls: { master: `${hlsPrefix}/master.m3u8` } };
}

module.exports = { processAudioBuffer };
