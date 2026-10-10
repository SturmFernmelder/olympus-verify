"""Make bounded public downloads from the preserved, reviewed R6 PDF.

Extraction preserves the source pages and their printed numbering. Each excerpt
gets a new explanatory cover; neither extraction nor this checklist adopts rules.
"""
from pathlib import Path
from io import BytesIO
import hashlib
import json
import sys
from xml.sax.saxutils import escape

from pypdf import PdfReader, PdfWriter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, ListFlowable, ListItem
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'worker/public/static/governance'
SOURCE = OUT / 'olympus-governance-r6.pdf'
EXPECTED = '8bbd9517272718991823aad15920a6ff0250f452a7affbd9141eee3f5129e6de'
if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != EXPECTED:
    raise RuntimeError('Reviewed R6 source changed; stopped')
reader = PdfReader(SOURCE)
if len(reader.pages) != 40 or reader.get_fields():
    raise RuntimeError('Unexpected source document shape')
size = (float(reader.pages[0].mediabox.width), float(reader.pages[0].mediabox.height))
styles = getSampleStyleSheet()
styles.add(ParagraphStyle('OlympusTitle', parent=styles['Title'], fontSize=25, leading=30, textColor=HexColor('#735718'), spaceAfter=20))
styles.add(ParagraphStyle('OlympusBody', parent=styles['BodyText'], fontSize=11, leading=16, spaceAfter=10))
styles.add(ParagraphStyle('OlympusSmall', parent=styles['OlympusBody'], fontSize=9, leading=13))
styles.add(ParagraphStyle('OlympusHeading', parent=styles['Heading2'], fontSize=14, leading=18, spaceBefore=15, spaceAfter=9, keepWithNext=True))
release_only = sys.argv[1:] == ['--release-only']
if sys.argv[1:] and not release_only:
    raise RuntimeError('Unsupported arguments')
previous = json.loads((OUT / 'downloads-manifest.json').read_text(encoding='utf-8')) if release_only else None

def p(text, style='OlympusBody'):
    return Paragraph(escape(text), styles[style])

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(HexColor('#555555'))
    canvas.drawString(48, 30, 'OLYMPUS | Preparation copy | 10 October 2026')
    canvas.drawRightString(size[0] - 48, 30, str(doc.page))
    canvas.restoreState()

def compose(title, story, subject):
    stream = BytesIO()
    doc = SimpleDocTemplate(stream, pagesize=size, leftMargin=48, rightMargin=48, topMargin=55, bottomMargin=52,
                            title=title, author='Olympus governance preparation', subject=subject)
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return PdfReader(BytesIO(stream.getvalue()))

def save(title, filename, front, pages=()):
    dest = OUT / filename
    replace = dest.exists() and release_only and filename == 'olympus-release-preparation.pdf'
    if dest.exists() and not replace:
        raise RuntimeError('Preserve existing output; no overwrite: ' + filename)
    if replace:
        old = next(item for item in previous['artifacts'] if item['file'] == filename)
        if hashlib.sha256(dest.read_bytes()).hexdigest() != old['sha256']:
            raise RuntimeError('Existing authored worksheet changed; stopped')
    writer = PdfWriter()
    for page in front.pages:
        writer.add_page(page)
    for number in pages:
        writer.add_page(reader.pages[number-1])
    writer.add_metadata({'/Title': title, '/Author': 'Olympus governance preparation',
                         '/Subject': 'Preparation copy; no ratification, appointment or permission granted'})
    with dest.open('wb' if replace else 'xb') as output:
        writer.write(output)
    check = PdfReader(dest)
    if len(check.pages) != len(front.pages) + len(pages):
        raise RuntimeError('Page count mismatch')
    for index, number in enumerate(pages, start=len(front.pages)):
        if check.pages[index].extract_text() != reader.pages[number-1].extract_text():
            raise RuntimeError('Source-page text changed')
    return {'file': filename, 'pages': len(check.pages), 'sourcePages': list(pages),
            'bytes': dest.stat().st_size, 'sha256': hashlib.sha256(dest.read_bytes()).hexdigest()}

artifacts = []
extracts = [
    ('Olympus Guild Guide - Draft R6', 'olympus-guide-r6.pdf', [3] + list(range(15, 34)),
     'Office descriptions, the proposed statute, bylaws and model ordinances. The complete charters and source register remain in the full book.'),
    ('Olympus Adoption Checklist - Draft R6', 'olympus-adoption-checklist-r6.pdf', [3, 37, 38],
     'Reading instructions, the blank adoption record, permission checks and the empty Olympus I to X leadership register.'),
    ('Olympus Appointment and News Templates - Draft R6', 'olympus-templates-r6.pdf', [9, 10, 36],
     'Blank appointment, deputy, affiliation, audit and revocation instruments, plus the reusable daily news template.'),
]
for title, filename, pages, description in extracts:
    if release_only:
        continue
    story = [p('OLYMPUS', 'OlympusSmall'), Spacer(1, 35), p(title, 'OlympusTitle'), p(description),
             p('Unratified draft. No appointments issued and no permissions changed.', 'OlympusHeading'),
             p('This is an excerpt from the preserved 40-page successor draft R6. Original page numbers are retained so a reader can cross-check the complete book. Blank signatures stay blank.'),
             p('The authoring date is not an adoption or effective date. Proposed rules and historical source snapshots do not prove current software behavior. Technical release evidence and separately authorized appointments remain independent.'),
             p('Complete book: https://olympus.roachcouncil.com/static/governance/olympus-governance-r6.pdf', 'OlympusSmall'),
             p('Source SHA256: ' + EXPECTED, 'OlympusSmall'),
             p('Included original pages: ' + ', '.join(map(str, pages)), 'OlympusSmall')]
    artifacts.append(save(title, filename, compose(title, story, 'Reviewed R6 excerpts; unratified'), pages))

title = 'Olympus Release Preparation Checklist'
story = [p('OLYMPUS', 'OlympusSmall'), p(title, 'OlympusTitle'),
         p('Operator worksheet - 10 October 2026. Complete each check against the actual release. This worksheet grants no access and executes no action.'),
         p('Release identity', 'OlympusHeading'),
         p('Source commit: ____________________  Worker version: ____________________'),
         p('Deployed AddOn version: __________  Reviewer/date: ____________________'),
         p('1. Publish and verify the intended source', 'OlympusHeading'),
         p('Record the reviewed commit, successful checks and actual deployment version. Verify the canonical website, signed-in member and officer views, public PDF downloads and legacy-host redirect. Check the exact supported write paths at the firewall; keep application authorization enforced.'),
         p('2. Preserve recovery and deletion purposes', 'OlympusHeading'),
         p('Verify the replacement private export and its restore checks before deleting an exact superseded copy. Obtain the owner approval required for that copy and keep the cleanup receipt. Newest-only exports have a 365-day maximum age; deletion replay has its separate fixed 366-day purpose. A database restore must replay current erasures before serving traffic.'),
         p('3. Rehearse an event without accidental announcements', 'OlympusHeading'),
         p('Use the intended organizer and raid destination. Check time zone, start, duration, capacity, sign-up roles and cancellation. Review the Discord preview before publishing. Opt in explicitly to the event reminder. Confirm one delivery and the durable result; reconcile an uncertain result rather than publishing again.'),
         p('4. Check account controls and their real limits', 'OlympusHeading'),
         p('Use approved disposable identities in an isolated test environment for export, withdrawal and erasure. Confirm stale-session refusal, role-removal settlement, ordinary-store projections and the fixed rejection marker. Distinguish serving-account completion from retained active safety cases, independent receipt conversations, Discord message cleanup and private recovery custody. Never erase a real member as a test.'),
         p('5. Attend the real councillor game/browser test', 'OlympusHeading'),
         p('A qualified councillor must use the installed AddOn and browser scanner, and an AddOn-free member must use their own website session and normal in-game whisper. Confirm the exact live realm/build, each actor, character GUID and current native rank, key enrollment, full proof, one-time ingestion and the actual Discord role result. Do not assign High Council or promote an Officer simply to make the test pass. The current five-rank beta roster is distinct from the proposed ten-rank ladder.'),
         p('The councillor game and browser must be online to supply evidence. A continuously available Worker cannot observe the game by itself. An empty eligible councillor pool, unknown provider result or untested client keeps that acceptance check open.'),
         p('6. Keep the beta transition attended', 'OlympusHeading'),
         p('Record the actual beta cutoff and review the exact Olympus guild-rank and leadership assignments before any once-only reset. Leave the reset disabled until that review is complete. Do not invent a shutdown hour or automatically change unrelated server roles. Reconsider full-release appointments separately and preserve the agreed residual-date clock.'),
         p('Final acceptance record', 'OlympusHeading'),
         p('Website checks: __________  Discord checks: __________  Real game/browser check: __________'),
         p('Recovery receipt: ____________________  Remaining holds: ____________________'),
         p('Operator decision/date: ____________________  Scope accepted: ____________________'),
         p('Governance ratification and appointment signatures remain separate. This worksheet is not either reviewer\'s signature.', 'OlympusSmall')]
artifacts.append(save(title, 'olympus-release-preparation.pdf', compose(title, story, 'Operator preparation worksheet; no action performed')))
if release_only:
    artifacts = [item for item in previous['artifacts'] if item['file'] != 'olympus-release-preparation.pdf'] + artifacts
manifest = {'schema': 'olympus-governance-downloads-v1', 'sourceSHA256': EXPECTED,
            'ratified': False, 'appointmentsIssued': False, 'artifacts': artifacts}
manifest_path = OUT / 'downloads-manifest.json'
with manifest_path.open('w' if release_only else 'x', encoding='utf-8', newline='\n') as stream:
    json.dump(manifest, stream, indent=2)
    stream.write('\n')
print(json.dumps(manifest, indent=2))
