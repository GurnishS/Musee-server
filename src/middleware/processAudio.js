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
    const mimeType = mime.lookup(localPath) || 'application/octet-stream';
    await blockBlobClient.uploadFile(localPath, {
        blobHTTPHeaders: { blobContentType: mimeType },
    });
    return blockBlobClient.url;
}

function getAudioFileFromReq(req) {
    if (req.files && req.files.audio && req.files.audio.length) return req.files.audio[0];
    if (req.file) return req.file;
    return null;
}

async function processAndUploadAudio(req, res, next) {
    const audioFile = getAudioFileFromReq(req);
    if (!audioFile) return next(); // nothing to do

    // ensure Azure is configured
    if (!blobServiceClient || !containerClient) {
        console.error('Azure blob storage not configured');
        return res.status(500).json({ error: 'Storage not configured' });
    }

    // ensure track id exists or create one so uploads have deterministic path
    const trackId = (req.body && req.body.track_id && typeof req.body.track_id === 'string') ? req.body.track_id : uuidv4();
    req.body = req.body || {};
    req.body.track_id = trackId;

    const tmpDir = path.join(os.tmpdir(), 'musee_audio');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const originalName = path.parse(audioFile.originalname || 'audio').name;
    const infile = path.join(tmpDir, `${uuidv4()}_${originalName}${path.extname(audioFile.originalname) || '.in'}`);

    try {
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
        const mp3Url = await uploadToBlob(mp3Local, mp3Blob);
        generated[`${bitrate}k_mp3`] = mp3Url;

        // create ogg variants up to original bitrate
        for (const kb of variants) {
            if (bitrate >= kb) {
                const oggExt = 'ogg';
                const oggFilename = `track_${trackId}_${kb}k.${oggExt}`;
                const oggLocal = path.join(tmpDir, oggFilename);
                await convertToOgg(infile, oggLocal, kb);
                const oggBlob = `audio/${oggFilename}`;
                const oggUrl = await uploadToBlob(oggLocal, oggBlob);
                generated[`${kb}k_ogg`] = oggUrl;
            }
        }

        // attach processed info to request
        req.audioInfo = {
            bitrate,
            files: generated,
        };

        // cleanup temp files
        try { fs.unlinkSync(infile); } catch (e) { }
        Object.keys(generated).forEach((k) => {
            const fname = generated[k].split('/').pop();
            const local = path.join(tmpDir, fname);
            try { if (fs.existsSync(local)) fs.unlinkSync(local); } catch (e) { }
        });

        next();
    } catch (err) {
        console.error('Audio processing error:', err?.message || err);
        // attempt cleanup
        try { if (fs.existsSync(infile)) fs.unlinkSync(infile); } catch (e) { }
        return res.status(400).json({ error: err?.message || 'audio processing failed' });
    }
}

module.exports = processAndUploadAudio;
