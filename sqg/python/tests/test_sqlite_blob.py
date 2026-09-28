"""Tests for BLOB parameters and 64-bit INTEGERs in generated SQLite Python code."""
from __future__ import annotations

import sqlite3

from generated.test_sqlite_blob import TestSqliteBlob


def test_round_trips_blobs_and_64bit_integers():
    conn = sqlite3.connect(":memory:")
    TestSqliteBlob.apply_migrations(conn)
    db = TestSqliteBlob(conn)
    data = bytes([0, 0xFF, 0x10, 0x7F])
    db.put_file("a", 4, 1_700_000_000_000, data)

    file = db.get_file("a")
    assert file.size == 4
    assert file.created_at == 1_700_000_000_000
    assert file.data == data
    assert db.read_slice(2, 2, "a") == bytes([0xFF, 0x10])
