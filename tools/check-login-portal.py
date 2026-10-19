"""Offline finite login-render byte/container verifier; browser/visual acceptance is separate.

Prepared actual output pins are below; Root still owns final browser acceptance. Default
and --check read three fixed local files and print one result. There are no writes,
downloads, subprocesses, encoders, package operations or game/account-file reads.
This validates exact reviewed derivative bytes, not visual fidelity or a published movie.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import stat
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
VIDEO = 'worker/public/static/wow/login/dark-portal.webm'
POSTER = 'worker/public/static/wow/login/dark-portal-poster.jpg'
PROVENANCE = 'worker/public/static/wow/login/dark-portal-provenance.json'
MAX_MEDIA_BYTES = 5 * 1024 * 1024
MAX_PROVENANCE_BYTES = 64 * 1024
# Exact measured derivative output/source proof; no visual/seam qualification inferred.
# Do not replace these with values read from the public provenance or from CLI args.
EXPECTED = {'worker/public/static/wow/login/dark-portal.webm': {'bytes': 3405603, 'sha256': '930ca8937c601245c7893cdc46750de3eca729c5fa9b91ef11dc08d87687521c', 'metadata': {'docType': 'webm', 'codec': 'V_VP9', 'width': 960, 'height': 540, 'audioTracks': 0, 'timestampScaleNs': 1000000, 'durationNs': 120000000000, 'clusterCount': 29, 'containerFrameCount': 2867, 'firstFrameTimestampNs': 0, 'lastFrameTimestampNs': 119966000000, 'lastExplicitFrameEndNs': None}}, 'worker/public/static/wow/login/dark-portal-poster.jpg': {'bytes': 132023, 'sha256': 'c2c0820f50c6cf1944e88e5fd54f2b421df1955ebe7842cb976ac5599f191050', 'metadata': {'format': 'JPEG', 'width': 960, 'height': 540, 'components': 3, 'sofMarker': 192}}}
PROVENANCE_SHA256 = 'ec87cd525ae9419d18d0caae6885919de4c8899ed751b0fa74ede3ca0f88edc3'
RENDERER_SOURCE_SHA256 = '715170ea535ded090c1e544189ac6df62fcda9afe779ec1b84fb3de7e762622f'
CAPTURE_RECIPE_SHA256 = '482cfd1e565e4d88a89d6542e40d969ecdeb25152dd3ff1bd841633e9087da3f'
# The immutable extracted closure: one M2, two SFID skins and its 25 TXID textures.
# These are provenance records only. This verifier NEVER opens those source files.
SOURCE_INPUTS = (
    {'path': 'wow_classic_era-1.15.9.70003/interface/glues/models/ui_mainmenu/ui_mainmenu.m2',
     'bytes': 435248,
     'sha256': 'c29a0225bdc64db8c90192ce586e6ffc89b6a4b75c3e9555fd6995467bb6238f'},
    {'path': 'wow_classic_era-1.15.9.70003/interface/glues/models/ui_mainmenu/ui_mainmenu00.skin',
     'bytes': 110464,
     'sha256': '15c5173c81fc1dae449f8b90cb3a8a3f2561a6ae62f33b515621db4bad44d0b9'},
    {'path': 'wow_classic_era-1.15.9.70003/interface/glues/models/ui_mainmenu/ui_mainmenu01.skin',
     'bytes': 110464,
     'sha256': 'eb2ee1862e16247ad302ad3e2f3c423af8e1b9e86538dd8f720873309fdbff77'},
    {'path': 'wow_classic_era-1.15.9.70003/textures/fdid-123938.blp',
     'bytes': 1540,
     'sha256': 'c98765a9ea6de7f764b4aed4628be86c783f2060ded91829318d580fa0425304'},
    {'path': 'wow_classic_era-1.15.9.70003/textures/fdid-131949.blp',
     'bytes': 44876,
     'sha256': '32d52149f96fd89fa363fea9cf99cfaa6c474c77699a6e9e0e66d3ef0bcf2791'},
    {'path': 'wow_classic_era-1.15.9.70003/textures/fdid-131950.blp',
     'bytes': 3916,
     'sha256': '2dcbde269d3df7a907f284a359759d644b5b69daba339c8a3c36c95a3be60552'},
    {'path': 'wow_classic_era-1.15.9.70003/textures/fdid-131951.blp',
     'bytes': 44876,
     'sha256': '2f05b827675ed9ef66b1165028a191e092f4206aed978bd100f384b7a8d7e107'},
    {'path': 'wow_classic_era-1.15.9.70003/textures/fdid-131952.blp',
     'bytes': 44876,
     'sha256': 'a57a1225f120dcb65f3f278bd60b22bf01e56b99f0e74933c492c18b028832f6'},
    {'path': 'wow_classic_era-1.15.9.70003/textures/fdid-131953.blp',
     'bytes': 44876,
     'sha256': '038430d55c170a0a3dda4867fecd76298fd9deef00200e1b88cf36acf01428a8'},
    {'path': 'wow_classic_era-1.15.9.70003/textures/fdid-131954.blp',
     'bytes': 44876,
     'sha256': 'cf46a33267224d33adff73bee79c36f934e02882a97a40406d637486eb4cfeb5'},
    {'path': 'wow_classic_era-1.15.9.70003/textures/fdid-131955.blp',
     'bytes': 44876,
     'sha256': 'f53e88ac3393fa6dad4b0447c5026f63f20c79f083d2be7e2951e4e50db91d0a'},
    {'path': 'wow_classic_era-1.15.9.70003/textures/fdid-131956.blp',
     'bytes': 44876,
     'sha256': '534ec92df06d1bc49149b5e8eb533ed55479189813323cdb1848458ab44267f1'},
    {'path': 'wow_classic_era-1.15.9.70003/textures/fdid-131957.blp',
     'bytes': 44876,
     'sha256': '7c108b03292497fdf4897d6ba953d7f406776fcd025116fbd6f61345766d2307'},
    {'path': 'wow_classic_era-1.15.9.70003/textures/fdid-131958.blp',
     'bytes': 44876,
     'sha256': '4b61c011ce4a5e189c3ee1651b3a1b6bbab990b55a440c5e9384e496dce01ac0'},
    {'path': 'wow_classic_era-1.15.9.70003/textures/fdid-131959.blp',
     'bytes': 23044,
     'sha256': 'da58458cf7cd749f9606a4e7409cfba1a4eba95de0cdf80d707850a013572ffa'},
    {'path': 'wow_classic_era-1.15.9.70003/textures/fdid-131960.blp',
     'bytes': 3916,
     'sha256': 'f7c1d1c82260a91e496402d1c724da23f86359fdcf4d273aaf6c88d23cd7424f'},
    {'path': 'wow_classic_era-1.15.9.70003/textures/fdid-131961.blp',
     'bytes': 2556,
     'sha256': 'a8e43991ff7d76e66a6426a4e23512a32cbcbe004ed86aac81cff3b59dc23a98'},
    {'path': 'wow_classic_era-1.15.9.70003/textures/fdid-131962.blp',
     'bytes': 88580,
     'sha256': '979721b5c2852c3a5688fe13f6ecdf2f43707bdec99053a23ac1ed7230eb4892'},
    {'path': 'wow_classic_era-1.15.9.70003/textures/fdid-131963.blp',
     'bytes': 23044,
     'sha256': 'e87e2b19dbb11069989362447a49a98b1f975714753c4beb2468c7f5b5f47b75'},
    {'path': 'wow_classic_era-1.15.9.70003/textures/fdid-131964.blp',
     'bytes': 88580,
     'sha256': '2e8ce1d2826f6b1277778a5f4000b77290037eb65f41354708941635bbb04568'},
    {'path': 'wow_classic_era-1.15.9.70003/textures/fdid-131965.blp',
     'bytes': 44876,
     'sha256': '0e6b9eb46d37ead21c88d435f907518573390f0846d5539ed5ec7d3693887f94'},
    {'path': 'wow_classic_era-1.15.9.70003/textures/fdid-131966.blp',
     'bytes': 12108,
     'sha256': 'b82b2250667dd9b05badc4a672e96ac6906204b23bad29916b81bf00501556c8'},
    {'path': 'wow_classic_era-1.15.9.70003/textures/fdid-131967.blp',
     'bytes': 2564,
     'sha256': '122c4c2e33941fdb8871beb8ebe8f6fe8dd812d1dbdeb56d07bfbcfd400bed1a'},
    {'path': 'wow_classic_era-1.15.9.70003/textures/fdid-131968.blp',
     'bytes': 12108,
     'sha256': '00ed7da1451c9c152936bc3b69145124a9de329e476c4ad8256f9e1908d8dd23'},
    {'path': 'wow_classic_era-1.15.9.70003/textures/fdid-131969.blp',
     'bytes': 12108,
     'sha256': 'af7244e7fddcabd7b95862b20ff3b4f37cd126e63cb6cc455aec828fd6d618f4'},
    {'path': 'wow_classic_era-1.15.9.70003/textures/fdid-132028.blp',
     'bytes': 88580,
     'sha256': '2655032dced74f7cd373d8130466fe0b0d436c116339cba710d464ec76dee331'},
    {'path': 'wow_classic_era-1.15.9.70003/textures/fdid-165414.blp',
     'bytes': 6660,
     'sha256': '050193f2df7a2f06566b2aa6b538c657317f3fa424b8a03d29ccd009c9e8c4f6'},
    {'path': 'wow_classic_era-1.15.9.70003/textures/fdid-197765.blp',
     'bytes': 88580,
     'sha256': 'b3fdb39ab65a42e9d0906ffa36c3a6dbcb16ca6ef1cf9520077f6e771a96a366'},
)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def unique_json(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate provenance JSON key')
        result[key] = value
    return result


def local_bytes(relative, cap):
    if relative not in (VIDEO, POSTER, PROVENANCE):
        raise ValueError('not one of the three fixed paths')
    target = ROOT / relative
    current = ROOT
    for part in Path(relative).parts:
        current /= part
        if current.is_symlink() or (hasattr(current, 'is_junction') and current.is_junction()):
            raise ValueError('linked local target refused: ' + relative)
    if not target.resolve().is_relative_to(ROOT) or not stat.S_ISREG(target.lstat().st_mode):
        raise ValueError('target must be a contained regular file: ' + relative)
    if not 0 < target.stat().st_size <= cap:
        raise ValueError('local byte cap: ' + relative)
    with target.open('rb') as stream:
        raw = stream.read(cap + 1)
    if not 0 < len(raw) <= cap:
        raise ValueError('local byte cap: ' + relative)
    return raw


def vint(raw, offset, end, identifier=False):
    if offset >= end or raw[offset] == 0:
        raise ValueError('invalid EBML variable integer')
    length = 1
    while not raw[offset] & (1 << (8 - length)):
        length += 1
    if length > (4 if identifier else 8) or offset + length > end:
        raise ValueError('truncated or unsupported EBML integer')
    value = int.from_bytes(raw[offset:offset + length], 'big')
    if identifier:
        return value, offset + length, False
    value &= (1 << (7 * length)) - 1
    return value, offset + length, value == (1 << (7 * length)) - 1


def element(raw, offset, end, unknown_ids=()):
    tag, payload, _ = vint(raw, offset, end, True)
    size, payload, unknown = vint(raw, payload, end)
    if unknown and tag not in unknown_ids:
        raise ValueError('unsupported unknown-size EBML element')
    stop = end if unknown else payload + size
    if stop > end:
        raise ValueError('EBML element exceeds its container')
    return tag, payload, stop, unknown


def children(raw, start, end):
    while start < end:
        tag, payload, stop, _ = element(raw, start, end)
        yield tag, payload, stop
        start = stop


def uint(raw, start, end):
    if not 1 <= end - start <= 8:
        raise ValueError('unsupported EBML unsigned integer')
    return int.from_bytes(raw[start:end], 'big')


def fields(raw, start, end, wanted):
    result = {}
    for tag, payload, stop in children(raw, start, end):
        if tag in wanted:
            if tag in result:
                raise ValueError('duplicate WebM metadata field')
            result[tag] = (payload, stop)
    return result


def inspect_webm(raw):
    # Fixed-level EBML parsing only; no compressed picture/audio decoder is claimed.
    if raw[:4] != b'\x1aE\xdf\xa3':
        raise ValueError('WebM EBML magic required')
    tag, head, head_end, _ = element(raw, 0, len(raw))
    header = fields(raw, head, head_end, {0x4282})
    if 0x4282 not in header or raw[slice(*header[0x4282])] != b'webm':
        raise ValueError('WebM DocType required')
    segment, start, end, _ = element(raw, head_end, len(raw), {0x18538067})
    if segment != 0x18538067 or end != len(raw):
        raise ValueError('one complete WebM Segment required')
    info = tracks = None
    clusters = []
    segment_tags = {0x114D9B74, 0x1549A966, 0x1654AE6B, 0x1F43B675, 0x1C53BB6B, 0x1941A469, 0x1043A770, 0x1254C367}
    while start < end:
        tag, payload, stop, unknown = element(raw, start, end, {0x1F43B675})
        if tag == 0x1549A966:
            if info is not None:
                raise ValueError('duplicate Segment Info')
            info = (payload, stop)
        elif tag == 0x1654AE6B:
            if tracks is not None:
                raise ValueError('duplicate Tracks')
            tracks = (payload, stop)
        elif tag == 0x1F43B675:
            cluster_end = stop
            if unknown:
                position = payload
                while position < end:
                    child_tag, _, child_end, _ = element(raw, position, end, {0x1F43B675})
                    if child_tag in segment_tags:
                        cluster_end = position
                        break
                    position = child_end
            clusters.append((payload, cluster_end))
            stop = cluster_end
        start = stop
    if info is None or tracks is None or not clusters:
        raise ValueError('WebM Info, Tracks and encoded clusters required')
    timing = fields(raw, *info, {0x2AD7B1, 0x4489})
    scale = uint(raw, *timing[0x2AD7B1]) if 0x2AD7B1 in timing else 1000000
    if scale <= 0:
        raise ValueError('positive WebM timecode scale required')
    duration = None
    if 0x4489 in timing:
        a, b = timing[0x4489]
        if b - a not in (4, 8):
            raise ValueError('invalid WebM Duration float')
        ticks = struct.unpack('>f' if b - a == 4 else '>d', raw[a:b])[0]
        if not math.isfinite(ticks) or ticks <= 0:
            raise ValueError('invalid WebM Duration')
        duration = round(ticks * scale)
    entries = [(a, b) for tag, a, b in children(raw, *tracks) if tag == 0xAE]
    if len(entries) != 1:
        raise ValueError('exactly one video track and no audio/extra tracks required')
    track = fields(raw, *entries[0], {0xD7, 0x83, 0x86, 0xE0, 0x23E383, 0x6D80})
    if not {0xD7, 0x83, 0x86, 0xE0}.issubset(track) or uint(raw, *track[0x83]) != 1 or 0x6D80 in track:
        raise ValueError('unencrypted video-only WebM track required')
    number = uint(raw, *track[0xD7])
    codec = raw[slice(*track[0x86])].decode('ascii')
    if number <= 0 or codec not in ('V_VP8', 'V_VP9'):
        raise ValueError('finite VP8/VP9 video contract required')
    video = fields(raw, *track[0xE0], {0xB0, 0xBA})
    if set(video) != {0xB0, 0xBA}:
        raise ValueError('actual encoded pixel dimensions required')
    width, height = uint(raw, *video[0xB0]), uint(raw, *video[0xBA])
    if width <= 0 or height <= 0:
        raise ValueError('positive encoded pixel dimensions required')
    default_ns = uint(raw, *track[0x23E383]) if 0x23E383 in track else None
    timestamps, explicit_ends = [], []

    def block(a, b, cluster_time, block_duration=None):
        block_track, pos, unknown = vint(raw, a, b)
        if unknown or block_track != number or pos + 3 >= b:
            raise ValueError('encoded block must belong to the sole video track')
        relative = struct.unpack_from('>h', raw, pos)[0]
        if raw[pos + 2] & 6:
            raise ValueError('laced frames are outside this finite capture contract')
        timestamp = (cluster_time + relative) * scale
        if timestamp < 0:
            raise ValueError('negative encoded frame timestamp')
        timestamps.append(timestamp)
        known_duration = block_duration * scale if block_duration is not None else default_ns
        if known_duration is not None:
            explicit_ends.append(timestamp + known_duration)

    for a, b in clusters:
        parts = list(children(raw, a, b))
        clock = [(x, y) for tag, x, y in parts if tag == 0xE7]
        if len(clock) != 1:
            raise ValueError('one actual Cluster timestamp required')
        cluster_time = uint(raw, *clock[0])
        for tag, x, y in parts:
            if tag == 0xA3:
                block(x, y, cluster_time)
            elif tag == 0xA0:
                group = fields(raw, x, y, {0xA1, 0x9B})
                if 0xA1 not in group:
                    raise ValueError('BlockGroup must contain its encoded block')
                block(*group[0xA1], cluster_time, uint(raw, *group[0x9B]) if 0x9B in group else None)
    if not timestamps:
        raise ValueError('actual encoded video frames required')
    return {
        'docType': 'webm', 'codec': codec, 'width': width, 'height': height,
        'audioTracks': 0, 'timestampScaleNs': scale, 'durationNs': duration,
        'clusterCount': len(clusters), 'containerFrameCount': len(timestamps),
        'firstFrameTimestampNs': min(timestamps), 'lastFrameTimestampNs': max(timestamps),
        'lastExplicitFrameEndNs': max(explicit_ends) if len(explicit_ends) == len(timestamps) else None,
    }


def inspect_jpeg(raw):
    if raw[:2] != b'\xff\xd8' or raw[-2:] != b'\xff\xd9':
        raise ValueError('JPEG framing required')
    offset = 2
    while offset < len(raw):
        if raw[offset] != 255:
            raise ValueError('invalid JPEG segment')
        while offset < len(raw) and raw[offset] == 255:
            offset += 1
        if offset >= len(raw):
            break
        marker = raw[offset]
        offset += 1
        if marker in (0xD9, 0xDA):
            break
        if marker == 0x01 or 0xD0 <= marker <= 0xD8:
            continue
        if offset + 2 > len(raw):
            raise ValueError('truncated JPEG segment')
        size = struct.unpack_from('>H', raw, offset)[0]
        if size < 2 or offset + size > len(raw):
            raise ValueError('invalid JPEG segment length')
        if marker in (0xC0, 0xC1, 0xC2):
            if size < 8 or raw[offset + 2] != 8:
                raise ValueError('supported 8-bit JPEG SOF required')
            height, width = struct.unpack_from('>HH', raw, offset + 3)
            components = raw[offset + 7]
            if size != 8 + 3 * components or components not in (1, 3) or min(width, height) <= 0:
                raise ValueError('invalid JPEG frame dimensions/components')
            return {'format': 'JPEG', 'width': width, 'height': height, 'components': components, 'sofMarker': marker}
        offset += size
    raise ValueError('actual supported JPEG dimensions unavailable')


def check():
    hashes = [PROVENANCE_SHA256, RENDERER_SOURCE_SHA256, CAPTURE_RECIPE_SHA256]
    if any(not isinstance(value, str) or re.fullmatch('[a-f0-9]{64}', value) is None for value in hashes):
        raise ValueError('UNQUALIFIED: actual provenance, renderer and capture recipe pins are unfilled')
    for expected in EXPECTED.values():
        if type(expected['bytes']) is not int or not 0 < expected['bytes'] <= MAX_MEDIA_BYTES or not isinstance(expected['sha256'], str) or re.fullmatch('[a-f0-9]{64}', expected['sha256']) is None or not isinstance(expected['metadata'], dict):
            raise ValueError('UNQUALIFIED: actual media byte/SHA/metadata pins are unfilled')
    if len(SOURCE_INPUTS) != 28:
        raise ValueError('exact retained28-source closure required')
    raw_provenance = local_bytes(PROVENANCE, MAX_PROVENANCE_BYTES)
    if sha(raw_provenance) != PROVENANCE_SHA256:
        raise ValueError('exact public provenance hash mismatch')
    provenance = json.loads(raw_provenance, object_pairs_hook=unique_json)
    if provenance.get('schema') != 'olympus-login-dark-portal-render-v1' or provenance.get('kind') != 'local-render-from-blizzard-client-assets' or provenance.get('publisherOriginalMovie') is not False or provenance.get('sourceBuild') != '1.15.9.70003':
        raise ValueError('derived-render provenance identity mismatch')
    if provenance.get('sourceInputs') != list(SOURCE_INPUTS) or provenance.get('rendererSourceSHA256') != RENDERER_SOURCE_SHA256 or provenance.get('captureRecipeSHA256') != CAPTURE_RECIPE_SHA256 or 'verifierSHA256' in provenance:
        raise ValueError('source closure/recipe mismatch or verifier/provenance hash cycle')
    measured = []
    for relative, inspector in ((VIDEO, inspect_webm), (POSTER, inspect_jpeg)):
        raw = local_bytes(relative, MAX_MEDIA_BYTES)
        expected = EXPECTED[relative]
        if len(raw) != expected['bytes'] or sha(raw) != expected['sha256']:
            raise ValueError('exact render output byte pin mismatch: ' + relative)
        metadata = inspector(raw)
        if metadata != expected['metadata']:
            raise ValueError('actual container metadata differs from reviewed pin: ' + relative)
        measured.append({'path': relative, 'bytes': len(raw), 'sha256': sha(raw), 'metadata': metadata})
    return {'status': 'EXACT_REVIEWED_DERIVATIVE_BYTES_MATCH', 'files': measured,
            'sourceInputCount': 28, 'writes': 0, 'network': 0, 'gameFileReads': 0,
            'limits': 'Container metadata/hash validation is not pixel fidelity, seamless particle periodicity, a published Blizzard movie or an all-copy/account-data claim.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='check the fixed local files (also the default)')
    parser.parse_args()
    try:
        print(json.dumps(check(), separators=(',', ':')))
        return 0
    except (ValueError, OSError, UnicodeError, struct.error) as error:
        print(json.dumps({'status': 'REFUSED', 'reason': str(error), 'qualified': False}), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
