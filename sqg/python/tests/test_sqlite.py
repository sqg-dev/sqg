"""Tests for generated SQLite Python code."""
from __future__ import annotations

import sqlite3

import pytest

from generated.test_sqlite import TestSqlite


@pytest.fixture
def conn():
    """Create an in-memory SQLite connection with migrations applied."""
    c = sqlite3.connect(":memory:")
    TestSqlite.apply_migrations(c)
    yield c
    c.close()


@pytest.fixture
def db(conn):
    """Create a TestSqlite instance with test data inserted."""
    q = TestSqlite(conn)
    conn.execute(
        "INSERT INTO users (id, name, email) VALUES (?, ?, ?)",
        ("1", "Alice", "alice@example.com"),
    )
    conn.execute(
        "INSERT INTO users (id, name, email) VALUES (?, ?, ?)",
        ("2", "Bob", None),
    )
    conn.commit()
    return q


class TestMigrations:
    def test_get_migrations_returns_list(self):
        migrations = TestSqlite.get_migrations()
        assert isinstance(migrations, list)
        assert len(migrations) > 0

    def test_apply_migrations_creates_table(self, conn):
        cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        assert cursor.fetchone() is not None

    def test_apply_migrations_idempotent(self, conn):
        # Applying migrations again should not raise
        TestSqlite.apply_migrations(conn)


class TestQueries:
    def test_users1_returns_all_rows(self, db):
        rows = db.users_1()
        assert len(rows) == 2
        assert rows[0].id == "1"
        assert rows[0].name == "Alice"
        assert rows[0].email == "alice@example.com"
        assert rows[1].id == "2"
        assert rows[1].name == "Bob"
        assert rows[1].email is None

    def test_users1_raw_returns_tuples(self, db):
        rows = db.users_1_raw()
        assert len(rows) == 2
        assert isinstance(rows[0], tuple)
        assert rows[0] == ("1", "Alice", "alice@example.com")

    def test_users2_pluck_one(self, db):
        result = db.users_2()
        assert result == "1"

    def test_users2_raw(self, db):
        result = db.users_2_raw()
        assert isinstance(result, tuple)

    def test_users3_pluck_one(self, db):
        result = db.users_3()
        assert isinstance(result, str)

    def test_users4_one(self, db):
        result = db.users_4()
        assert result is not None
        assert result.email == "alice@example.com"
        assert result.name == "Alice"

    def test_users4_raw(self, db):
        result = db.users_4_raw()
        assert isinstance(result, tuple)

    def test_users5_with_count(self, db):
        rows = db.users_5()
        assert len(rows) == 1
        assert rows[0].count == 10

    def test_users6_with_param(self, db):
        result = db.users_6(name="Alice")
        assert result is not None
        assert result.name == "Alice"
        assert result.email == "alice@example.com"

    def test_users6_not_found(self, db):
        result = db.users_6(name="Nobody")
        assert result is None

    def test_users7_returns_list(self, db):
        rows = db.users_7(name="Alice")
        assert len(rows) == 1
        assert rows[0].name == "Alice"

    def test_users7_raw(self, db):
        rows = db.users_7_raw(name="Alice")
        assert len(rows) == 1
        assert isinstance(rows[0], tuple)


class TestReservedWords:
    def test_reserved_word_column_names(self, db):
        result = db.reserved_word_test()
        assert result is not None
        # 'class' is a Python keyword -> class_
        assert result.class_ == "Alice"
        # 'type' is NOT a keyword (it's a builtin), used as-is
        assert result.type == "alice@example.com"


class TestDataclassProperties:
    def test_rows_are_frozen(self, db):
        rows = db.users_1()
        with pytest.raises(AttributeError):
            rows[0].name = "modified"  # type: ignore

    def test_rows_are_hashable(self, db):
        rows = db.users_1()
        # frozen dataclasses are hashable
        s = {rows[0], rows[1]}
        assert len(s) == 2

    def test_rows_have_equality(self, db):
        rows1 = db.users_1()
        rows2 = db.users_1()
        assert rows1[0] == rows2[0]
