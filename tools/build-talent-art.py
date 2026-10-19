"""Validate the finite .170 talent-art snapshot; restore missing exact bytes only with --download.

Default: python tools/build-talent-art.py
Optional existing Pillow decoder check: add --verify-images (no installation is performed).
Explicit missing-file restoration: add --download. Existing mismatches are never overwritten.

These are exact fan-distributed Blizzard JPEGs, not publisher-signed original-client
attestations. The data CC-BY licence does not cover Blizzard artwork. Source and
limitations remain in the pinned art-provenance.json; no remote map or code is loaded.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import ssl
import stat
import struct
import sys
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'worker/public/static/talents'
MAX_BYTES = 1024 * 1024
PINS = {
    'art-provenance.json': '777232d6c462961f902b6ead528d971451ca0a5c0ebcbf07a3083faa4df33745',
    'art.json': '4ddf849cea41c422b9ece452eb4ef41d9401499cf3b959318e6f0e170b3bf91d',
    'data.json': '8b174d764836675b2b759050f441e2dfe12c7bad6a5b279ef39b05d8b1288a0c',
}
SOURCE_DATA = '260cf99b52db5fd0085043d4d3c2d5dde1b47dffe88b9696c94caccc9fb03588'
REVISION = '260cf99b52db'
SOURCE = re.compile(r'https://talentsforever\.com/assets/(?:icons/([a-z0-9_]+)\.jpg\?i=4|bg/([1-9][0-9]*)\.jpg)\Z')
CLASSES = {'warrior', 'paladin', 'hunter', 'rogue', 'priest', 'shaman', 'mage', 'warlock', 'druid'}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def unique_json(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate JSON key')
        result[key] = value
    return result


def snapshot():
    values = {}
    for name, expected in PINS.items():
        raw = (ART / name).read_bytes()
        if sha(raw) != expected:
            raise ValueError('pinned input mismatch: ' + name)
        values[name] = json.loads(raw, object_pairs_hook=unique_json)
    provenance, mapping, data = (values[name] for name in ('art-provenance.json', 'art.json', 'data.json'))
    if provenance.get('schema') != 'olympus-talents-art-provenance-v1' or provenance.get('sourceSite') != 'https://talentsforever.com/' or provenance.get('sourceDataSHA256') != SOURCE_DATA or provenance.get('mappingRevision') != REVISION:
        raise ValueError('provenance identity mismatch')
    if provenance.get('counts') != {'classes': 9, 'trees': 27, 'talents': 466, 'uniqueIcons': 369, 'backgrounds': 27}:
        raise ValueError('provenance inventory mismatch')
    if mapping.get('schema') != 'olympus-talents-art-v1' or mapping.get('revision') != REVISION or data.get('revision') != REVISION:
        raise ValueError('mapping/data revision mismatch')
    classes = data['classes']
    class_ids = {row['id'] for row in classes}
    tree_ids = {row['id'] + '-' + tree['id'] for row in classes for tree in row['trees']}
    talent_ids = {talent['id'] for row in classes for tree in row['trees'] for talent in tree['talents']}
    ranks = sum(len(talent['descriptions']) for row in classes for tree in row['trees'] for talent in tree['talents'])
    if len(classes) != 9 or class_ids != CLASSES or len(tree_ids) != 27 or len(talent_ids) != 466 or ranks != 1313:
        raise ValueError('finite talent data inventory mismatch')
    if mapping['classIcons'] != {key: '/static/wow/class-' + key + '.png' for key in CLASSES} or set(mapping['talentIcons']) != talent_ids or set(mapping['treeIcons']) != tree_ids or set(mapping['treeBackgrounds']) != tree_ids:
        raise ValueError('complete local mapping required')
    assets = provenance.get('assets')
    if not isinstance(assets, list) or len(assets) != 396:
        raise ValueError('exact396 assets required')
    paths, urls, icons, backgrounds = set(), set(), set(), set()
    for row in assets:
        if set(row) != {'path', 'sourceURL', 'bytes', 'sha256', 'width', 'height', 'conversion'}:
            raise ValueError('asset record shape mismatch')
        match = SOURCE.fullmatch(row['sourceURL'])
        if not match:
            raise ValueError('source URL is outside the fixed JPEG endpoints')
        filename = ('icon-' + match[1] if match[1] else 'bg-' + match[2]) + '.jpg'
        if row['path'] != 'worker/public/static/wow/talents/' + filename or row['path'] in paths or row['sourceURL'] in urls:
            raise ValueError('asset target/source identity mismatch')
        if type(row['bytes']) is not int or not 0 < row['bytes'] <= MAX_BYTES or not re.fullmatch('[a-f0-9]{64}', row['sha256']):
            raise ValueError('asset byte pin invalid')
        if any(type(row[key]) is not int for key in ('width', 'height')) or (row['width'], row['height']) not in ((56, 56), (64, 64), (300, 331)) or row['conversion'] != 'none; exact downloaded JPEG bytes':
            raise ValueError('asset dimensions/conversion invalid')
        if (match[1] and (row['width'], row['height']) == (300, 331)) or (match[2] and (row['width'], row['height']) != (300, 331)):
            raise ValueError('asset dimensions do not match its finite category')
        paths.add(row['path']); urls.add(row['sourceURL'])
        (icons if match[1] else backgrounds).add('/' + row['path'].removeprefix('worker/public/'))
    if len(icons) != 369 or len(backgrounds) != 27 or set(mapping['talentIcons'].values()) | set(mapping['treeIcons'].values()) != icons or set(mapping['treeBackgrounds'].values()) != backgrounds:
        raise ValueError('art maps must cover exactly the finite local inventory')
    return sorted(assets, key=lambda row: row['path'])


def target_path(relative):
    target = ROOT / relative
    if not target.resolve().is_relative_to(ROOT):
        raise ValueError('target escapes repository')
    current = ROOT
    for part in Path(relative).parts:
        current /= part
        if current.is_symlink() or (hasattr(current, 'is_junction') and current.is_junction()):
            raise ValueError('linked asset target refused')
    if target.exists() and not stat.S_ISREG(target.stat().st_mode):
        raise ValueError('non-file asset target refused')
    return target


def jpeg_dimensions(raw):
    # Read bounded JPEG segments, without decoding pixels or accepting other formats.
    if raw[:2] != b'\xff\xd8' or raw[-2:] != b'\xff\xd9':
        raise ValueError('exact JPEG framing required')
    offset = 2
    while offset < len(raw):
        if raw[offset] != 255:
            raise ValueError('invalid JPEG segment')
        while offset < len(raw) and raw[offset] == 255:
            offset += 1
        if offset >= len(raw):
            break
        marker = raw[offset]; offset += 1
        if marker in (0xD9, 0xDA):
            break
        if marker == 0x01 or 0xD0 <= marker <= 0xD8:
            continue
        if offset + 2 > len(raw):
            break
        size = struct.unpack_from('>H', raw, offset)[0]
        if size < 2 or offset + size > len(raw):
            raise ValueError('invalid JPEG segment length')
        if marker in (0xC0, 0xC1, 0xC2):
            if size < 8 or raw[offset + 2] != 8:
                raise ValueError('unsupported JPEG frame')
            height, width = struct.unpack_from('>HH', raw, offset + 3)
            return width, height
        offset += size
    raise ValueError('supported JPEG dimensions unavailable')


def validate(raw, row, image_module=None):
    if len(raw) != row['bytes'] or len(raw) > MAX_BYTES or sha(raw) != row['sha256']:
        raise ValueError('existing/downloaded asset byte mismatch: ' + row['path'])
    if jpeg_dimensions(raw) != (row['width'], row['height']):
        raise ValueError('asset dimension mismatch: ' + row['path'])
    if image_module is not None:
        with image_module.open(io.BytesIO(raw)) as image:
            if image.format != 'JPEG' or image.size != (row['width'], row['height']):
                raise ValueError('decoder format/dimensions mismatch')
            image.verify()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


def download(row):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect(), urllib.request.HTTPSHandler(context=ssl.create_default_context()))
    request = urllib.request.Request(row['sourceURL'], headers={'Accept': 'image/jpeg', 'Accept-Encoding': 'identity', 'User-Agent': 'Olympus-finite-talent-art/170'})
    with opener.open(request, timeout=20) as response:
        if response.status != 200 or response.geturl() != row['sourceURL'] or response.headers.get_content_type() != 'image/jpeg' or response.headers.get('Content-Encoding', 'identity').lower() != 'identity':
            raise ValueError('exact direct JPEG response required')
        length = response.headers.get('Content-Length')
        if length is not None and (not length.isdecimal() or int(length) != row['bytes'] or int(length) > MAX_BYTES):
            raise ValueError('download byte length mismatch')
        raw = bytearray()
        while len(raw) <= MAX_BYTES:
            chunk = response.read(min(65536, MAX_BYTES + 1 - len(raw)))
            if not chunk:
                return bytes(raw)
            raw.extend(chunk)
        raise ValueError('download exceeds1MiB limit')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download', action='store_true', help='restore missing pinned JPEGs only; never overwrite an existing file')
    parser.add_argument('--verify-images', action='store_true', help='also verify JPEG structure using already-installed Pillow')
    args = parser.parse_args()
    image_module = None
    if args.verify_images:
        from PIL import Image
        image_module = Image
    rows = snapshot()
    missing = []
    directory = target_path(rows[0]['path']).parent
    if directory.exists() and (not directory.is_dir() or {entry.name for entry in directory.iterdir()} - {Path(row['path']).name for row in rows}):
        raise ValueError('unlisted asset directory entry refused')
    # Validate every existing file before any explicitly requested network activity.
    for row in rows:
        target = target_path(row['path'])
        if target.exists():
            with target.open('rb') as existing:
                validate(existing.read(MAX_BYTES + 1), row, image_module)
        else:
            missing.append(row)
    if missing and not args.download:
        raise ValueError(str(len(missing)) + ' pinned assets missing; no network attempted (explicit --download required)')
    for row in missing:
        raw = download(row)
        validate(raw, row, image_module)
        target = target_path(row['path']); target.parent.mkdir(parents=True, exist_ok=True)
        target = target_path(row['path'])
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_BINARY', 0) | getattr(os, 'O_NOFOLLOW', 0)
        with os.fdopen(os.open(target, flags, 0o644), 'wb') as output:
            output.write(raw)
    print(json.dumps({'result': 'PASS', 'revision': REVISION, 'classes': 9, 'trees': 27, 'talents': 466, 'assets': len(rows), 'downloaded': len(missing), 'networkEnabled': args.download, 'pillowVerified': args.verify_images, 'inputSHA256': PINS}, sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, ImportError, urllib.error.URLError) as error:
        print('REFUSED ' + str(error), file=sys.stderr)
        raise SystemExit(1)
