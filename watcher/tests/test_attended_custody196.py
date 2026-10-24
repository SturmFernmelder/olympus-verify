"""Temporary synthetic custody only. No user configuration, provider or real game client."""
from __future__ import annotations
import copy
import hashlib
import json
import sys
import tempfile
import urllib.error
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import custody_recovery as recovery
import watcher


class AttendedCustodyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / 'Logs').mkdir()
        self.path = self.root / 'state.json'
        self.cfg = {'worker_url': 'https://example.invalid', 'watcher_token': 'synthetic-only',
                    'verify_secret': 'synthetic-secret', 'wow_dir': str(self.root), 'account': 'SYNTHETIC',
                    'officer_character': 'Synthetic', 'state_file': str(self.path), 'max_outbox': 2}
        self.w = watcher.Watcher(self.cfg)
        self.calls = []
        self.w.worker.call = self.transport

    def tearDown(self):
        self.tmp.cleanup()

    def transport(self, method, path, body=None, retries=3):
        self.calls.append((method, path, copy.deepcopy(body), retries))
        return True, {'ok': True}

    def hold(self, refusal=None, acknowledged=False):
        item = self.w._freeze_original('/ingest/events', {'events': [{'name': 'SYNTHETIC PRIVATE', 'ts': 11}]}, 'test')
        if refusal is not None:
            item['refusal_status'] = refusal
        if acknowledged:
            item['acknowledged'] = True
        self.w.state.d['outbox'] = [item]
        self.w.state.save()
        return item

    def pins(self, lane='outbox'):
        result = recovery.inspect(self.path)
        return result['stateSha256'], result[lane]['itemSha256']

    def resolve(self, action='retire-refused', lane='outbox'):
        state_sha, item_sha = self.pins(lane)
        return recovery.recover(self.path, lane, action, state_sha, item_sha, 'Synthetic attended outcome review')

    def test_inspection_redacts_body_and_has_no_network(self):
        self.hold()
        before = self.path.read_bytes()
        result = recovery.inspect(self.path)
        self.assertEqual(result['outboxCount'], 1)
        self.assertEqual(result['outbox']['classification'], 'unknown-outcome-held')
        self.assertNotIn('SYNTHETIC PRIVATE', json.dumps(result))
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(self.calls, [])

    def test_known_refusal_archives_exact_original_before_retirement_and_keeps_sibling(self):
        original = self.hold(400)
        sibling = self.w._freeze_original('/ingest/events', {'ts': 12}, 'newer')
        self.w.state.d['outbox'].append(sibling)
        self.w.state.save()
        result = self.resolve()
        archive = json.loads(Path(result['archive']).read_bytes())
        self.assertEqual(archive['original'], original)
        self.assertFalse(archive['deliveryAcknowledged'])
        self.assertEqual(json.loads(self.path.read_bytes())['outbox'], [sibling])
        self.assertFalse(result['network'])
        self.assertEqual(self.calls, [])

    def test_persisted_acknowledgment_settles_locally_with_accurate_receipt(self):
        original = self.hold(acknowledged=True)
        result = self.resolve('settle-acknowledged')
        self.assertTrue(result['deliveryAcknowledged'])
        self.assertEqual(json.loads(Path(result['archive']).read_bytes())['original'], original)
        self.assertEqual(json.loads(self.path.read_bytes())['outbox'], [])
        self.assertEqual(self.calls, [])

    def test_recorded_roster_422_can_be_attended_retired_then_verify_delivers(self):
        # Exercise the actual HTTPError classification and durable refusal path;
        # only transport is synthetic. Retirement is local and never a resend.
        actual_call = watcher.Worker.call.__get__(self.w.worker, watcher.Worker)
        with patch.object(self.w.worker, 'call', actual_call), \
                patch.object(self.w.worker.opener, 'open', side_effect=urllib.error.HTTPError(
                    'https://example.invalid/ingest/roster', 422, 'synthetic refusal', {}, None)):
            self.assertIs(self.w.post('/ingest/roster', {'members': []}, 'roster'), watcher.Delivery.HELD)
        original = copy.deepcopy(self.w.state.d['outbox'][0])
        self.assertEqual(original['refusal_status'], 422)
        self.assertEqual(recovery.inspect(self.path)['outbox']['classification'],
                         'recorded-definite-nonapplication-attended-retirement-only')
        result = self.resolve()
        self.assertFalse(result['deliveryAcknowledged'])
        self.assertEqual(json.loads(Path(result['archive']).read_bytes())['original'], original)
        restarted = watcher.Watcher(self.cfg)
        restarted.worker.call = self.transport
        self.assertIs(restarted.post('/ingest/verify', {'ts': 12}, 'verify'), watcher.Delivery.DELIVERED)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.calls[0][1], '/ingest/verify')

    def test_422_other_lane_and_409_possible_application_remain_held(self):
        for status in [422, 409]:
            self.hold(status)  # /ingest/events, not the source-owned roster422 contract
            before = self.path.read_bytes()
            with self.assertRaises(ValueError):
                self.resolve()
            self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(self.calls, [])

    def test_unknown_legacy_changed_and_untrusted_refusal_never_retire(self):
        for kind in ['unknown', 'legacy', 'changed', '409', '502']:
            original = self.hold(int(kind) if kind.isdigit() else None)
            if kind == 'legacy':
                del original['custody']
            if kind == 'changed':
                original['body']['events'][0]['ts'] = 999
            self.w.state.save()
            before = self.path.read_bytes()
            with self.assertRaises(ValueError):
                self.resolve()
            self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(self.calls, [])

    def test_state_and_item_sha_mismatch_refuse_without_archive(self):
        self.hold(400)
        state_sha, item_sha = self.pins()
        for state_pin, item_pin in [('0' * 64, item_sha), (state_sha, '0' * 64)]:
            with self.assertRaises(ValueError):
                recovery.recover(self.path, 'outbox', 'retire-refused', state_pin, item_pin, 'Synthetic reviewed refusal')
        self.assertEqual(list(self.root.glob('state.json.custody-archive-*.json')), [])

    def test_shared_lease_excludes_other_writer_and_does_not_reclaim_by_age(self):
        self.hold(400)
        before = self.path.read_bytes()
        with recovery.StateLease(self.path):
            with self.assertRaises(FileExistsError):
                self.resolve()
            with self.assertRaises(FileExistsError):
                with recovery.StateLease(self.path):
                    self.fail('must not acquire occupied lease')
        self.assertEqual(self.path.read_bytes(), before)

    def test_archive_failure_preserves_state_and_blocks_mutation(self):
        self.hold(400)
        before = self.path.read_bytes()
        with patch.object(recovery, 'private_create', side_effect=OSError('synthetic archive failure')):
            with self.assertRaises(OSError):
                self.resolve()
        self.assertEqual(self.path.read_bytes(), before)

    def test_replace_failure_retains_archive_and_original_state_and_prevents_blind_repeat(self):
        original = self.hold(400)
        before = self.path.read_bytes()
        with patch.object(recovery.os, 'replace', side_effect=OSError('synthetic uncertain replace')):
            with self.assertRaises(OSError):
                self.resolve()
        self.assertEqual(self.path.read_bytes(), before)
        archives = list(self.root.glob('state.json.custody-archive-*.json'))
        self.assertEqual(len(archives), 1)
        self.assertEqual(json.loads(archives[0].read_bytes())['original'], original)
        with self.assertRaises(FileExistsError):
            self.resolve()

    def test_queue_ack_requires_exact_captured_ids_and_settles_together(self):
        original = self.w._freeze_original('/queue/written', {'ids': [7], 'officer': self.w.officer_id}, 'queue')
        original['acknowledged'] = True
        self.w.state.d['queue_written_pending'] = [7]
        self.w.state.d['queue_written_original'] = original
        self.w.state.save()
        result = self.resolve('settle-acknowledged', 'queue-written')
        after = json.loads(self.path.read_bytes())
        self.assertEqual(after['queue_written_pending'], [])
        self.assertIsNone(after['queue_written_original'])
        self.assertEqual(json.loads(Path(result['archive']).read_bytes())['original'], original)
        self.assertEqual(self.calls, [])

    def test_hardlink_and_symlink_state_aliases_are_refused_before_mutation(self):
        self.hold(400)
        before = self.path.read_bytes()
        alias = self.root / 'alias.json'
        alias.hardlink_to(self.path)
        with self.assertRaises(ValueError):
            recovery.inspect(alias)
        with self.assertRaises(ValueError):
            recovery.inspect(self.path)
        self.assertEqual(self.path.read_bytes(), before)
        alias.unlink()
        try:
            alias.symlink_to(self.path)
        except OSError:
            return  # Windows may not grant symbolic-link creation to this synthetic runner.
        with self.assertRaises(ValueError):
            recovery.inspect(alias)
        self.assertEqual(self.path.read_bytes(), before)

    def test_old_lease_release_preserves_replaced_lock(self):
        self.hold(400)
        lease = recovery.StateLease(self.path)
        lease.__enter__()
        # Cross-platform identity change at release: the old handle remains its
        # own, but the path must be treated as another owner's lease.
        with patch.object(recovery, 'regular_identity', return_value=(-1, -1)), patch.object(Path, 'read_bytes') as read:
            lease.__exit__()
            read.assert_not_called()
        self.assertTrue(lease.path.exists())

    def test_same_inode_different_lease_token_is_preserved(self):
        self.hold(400)
        lease = recovery.StateLease(self.path)
        lease.__enter__()
        with patch.object(recovery.json, 'loads', return_value={'token': 'different-owner'}):
            lease.__exit__()
        self.assertTrue(lease.path.exists())

    def test_malformed_nonobject_lock_is_preserved_without_crashing(self):
        self.hold(400)
        lease = recovery.StateLease(self.path)
        lease.__enter__()
        with patch.object(recovery.json, 'loads', return_value=[]):
            lease.__exit__()
        self.assertTrue(lease.path.exists())

    def test_legacy_queue_ids_remain_held_without_fabricating_officer(self):
        self.w.state.d['queue_written_pending'] = [7]
        self.w.state.save()
        before = self.path.read_bytes()
        with self.assertRaises(ValueError):
            recovery.recover(self.path, 'queue-written', 'retire-refused', hashlib.sha256(before).hexdigest(), '0' * 64, 'Synthetic manual review')
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(self.calls, [])

    def test_same_process_ack_settlement_retry_is_local_only_then_new_work_can_resume(self):
        save = self.w.state.save
        writes = 0
        def fail_second():
            nonlocal writes
            writes += 1
            if writes == 2:
                raise OSError('synthetic settlement failure')
            save()
        with patch.object(self.w.state, 'save', side_effect=fail_second):
            self.assertIs(self.w.post('/ingest/events', {'ts': 31}, 'event'), watcher.Delivery.HELD)
        self.assertTrue(self.w._custody_halted)
        self.assertEqual(len(self.calls), 1)
        self.assertTrue(self.w.recover_local_settlement())
        self.assertEqual(len(self.calls), 1)
        self.assertFalse(self.w._custody_halted)
        self.assertEqual(json.loads(self.path.read_bytes())['outbox'], [])
        self.assertFalse(self.w.recover_local_settlement())

    def test_repeated_local_settlement_failure_never_repeats_http(self):
        original = self.hold(acknowledged=True)
        with patch.object(self.w.state, 'save', side_effect=OSError('synthetic failure')):
            self.assertIs(self.w._settle_original(original), watcher.Delivery.HELD)
            self.assertFalse(self.w.recover_local_settlement())
        self.assertTrue(self.w._custody_halted)
        self.assertEqual(self.calls, [])
        self.assertTrue(self.w.recover_local_settlement())
        self.assertEqual(self.calls, [])

    def test_reservation_failure_is_not_misclassified_as_acknowledged_settlement(self):
        with patch.object(self.w.state, 'save', side_effect=OSError('synthetic reservation failure')):
            self.assertIs(self.w.post('/ingest/events', {'ts': 22}, 'event'), watcher.Delivery.NO_CUSTODY)
        self.assertFalse(self.w.recover_local_settlement())
        self.assertTrue(self.w._custody_halted)
        self.assertEqual(self.calls, [])


if __name__ == '__main__':
    unittest.main()
