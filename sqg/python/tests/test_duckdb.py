"""Tests for generated DuckDB Python code."""
from __future__ import annotations

import datetime

import duckdb
import pytest

from generated.test_duckdb import (
    ActionsAppender,
    ActionsRow,
    AllRow,
    EventsAppender,
    EventsRow,
    LogEntriesAppender,
    LogEntriesRow,
    TestDuckdb,
    UsersAppender,
    UsersRow,
)


@pytest.fixture
def conn():
    """Create an in-memory DuckDB connection with migrations applied."""
    c = duckdb.connect(":memory:")
    TestDuckdb.apply_migrations(c)
    yield c
    c.close()


@pytest.fixture
def db(conn):
    """Create a TestDuckdb instance with test data inserted."""
    q = TestDuckdb(conn)
    q.insert(name="Alice", email="alice@example.com")
    q.insert(name="Bob", email="bob@example.com")
    return q


class TestMigrations:
    def test_get_migrations_returns_list(self):
        migrations = TestDuckdb.get_migrations()
        assert isinstance(migrations, list)
        assert len(migrations) > 0

    def test_apply_migrations_creates_tables(self, conn):
        result = conn.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_name = 'users'"
        ).fetchone()
        assert result is not None

    def test_apply_migrations_idempotent(self, conn):
        # Applying migrations again should not raise
        TestDuckdb.apply_migrations(conn)


class TestExec:
    def test_insert(self, conn):
        db = TestDuckdb(conn)
        db.insert(name="Charlie", email="charlie@example.com")
        rows = db.all()
        assert len(rows) == 1
        assert rows[0].name == "Charlie"

    def test_update_email(self, db):
        rows = db.all()
        user_id = rows[0].id
        db.update_email(id=user_id, email="newalice@example.com")
        updated = db.by_id(id=user_id)
        assert updated is not None
        assert updated.email == "newalice@example.com"

    def test_delete(self, db):
        rows = db.all()
        assert len(rows) == 2
        db.delete(id=rows[0].id)
        remaining = db.all()
        assert len(remaining) == 1


class TestQueryAll:
    def test_all_returns_typed_rows(self, db):
        rows = db.all()
        assert len(rows) == 2
        assert isinstance(rows[0], AllRow)
        assert rows[0].a == "abc"
        assert rows[0].x == 1
        assert rows[0].name == "Alice"

    def test_all_raw_returns_tuples(self, db):
        rows = db.all_raw()
        assert len(rows) == 2
        assert isinstance(rows[0], tuple)


class TestQueryPluck:
    def test_all_emails_returns_strings(self, db):
        emails = db.all_emails()
        assert len(emails) == 2
        assert "alice@example.com" in emails
        assert "bob@example.com" in emails

    def test_all_emails_raw_returns_tuples(self, db):
        rows = db.all_emails_raw()
        assert isinstance(rows[0], tuple)


class TestQueryOne:
    def test_by_id_found(self, db):
        rows = db.all()
        result = db.by_id(id=rows[0].id)
        assert result is not None
        assert result.name == "Alice"

    def test_by_id_not_found(self, db):
        result = db.by_id(id=99999)
        assert result is None

    def test_by_email(self, db):
        result = db.by_email(email="bob@example.com")
        assert result is not None
        assert result.name == "Bob"

    def test_by_email_raw(self, db):
        result = db.by_email_raw(email="bob@example.com")
        assert result is not None
        assert isinstance(result, tuple)


class TestQueryPluckOne:
    def test_get_id_by_email(self, db):
        result = db.get_id_by_email(email="alice@example.com")
        assert result is not None
        assert isinstance(result, int)

    def test_get_id_by_email_not_found(self, db):
        result = db.get_id_by_email(email="nobody@example.com")
        assert result is None


class TestComplexTypes:
    def test_list_query(self, conn):
        db = TestDuckdb(conn)
        rows = db.test_list()
        assert len(rows) == 1
        assert rows[0].names == ["a", "b", "c"]

    def test_list_pluck(self, conn):
        db = TestDuckdb(conn)
        rows = db.test_list_2()
        assert rows[0] == ["a", "b", "c"]

    def test_list_pluck_one(self, conn):
        db = TestDuckdb(conn)
        result = db.test_list_3()
        assert result == ["a", "b", "c"]

    def test_map_query(self, conn):
        db = TestDuckdb(conn)
        rows = db.test_map()
        assert len(rows) == 1
        assert rows[0].props == {"a": 1}

    def test_map_int_keys(self, conn):
        db = TestDuckdb(conn)
        rows = db.test_map_2()
        assert rows[0].props == {1: 2}

    def test_struct_query_raw(self, conn):
        db = TestDuckdb(conn)
        rows = db.test_struct_raw()
        assert len(rows) == 1
        data = rows[0][0]
        assert data["test"] == 1
        assert data["name"] == "abc"
        assert data["nested"]["test"] is True

    def test_struct_pluck_one(self, conn):
        db = TestDuckdb(conn)
        result = db.test_struct_3()
        assert result is not None
        assert result["test"] == 1

    def test_nested_structs_raw(self, conn):
        db = TestDuckdb(conn)
        result = db.test_nested_structs_raw()
        assert result is not None
        data = result[0]
        assert data["v"] == 1
        assert data["x"]["v"] == 2


class TestArrayParams:
    def test_insert_event_with_array(self, conn):
        db = TestDuckdb(conn)
        db.insert_event(id=1, name="event1", tags=["tag1", "tag2"])
        db.insert_event(id=2, name="event2", tags=[])

        events = db.all_events()
        assert len(events) == 2
        assert events[0].tags == ["tag1", "tag2"]
        assert events[1].tags == []


class TestAppenders:
    def test_users_appender(self, conn):
        db = TestDuckdb(conn)
        appender = db.create_users_appender()
        appender.append(UsersRow(id=100, name="Appended", email="a@b.com"))
        appender.close()

        rows = db.all()
        assert len(rows) == 1
        assert rows[0].name == "Appended"

    def test_users_appender_many(self, conn):
        db = TestDuckdb(conn)
        appender = db.create_users_appender()
        appender.append_many([
            UsersRow(id=1, name="One", email="one@example.com"),
            UsersRow(id=2, name="Two", email="two@example.com"),
            UsersRow(id=3, name="Three", email="three@example.com"),
        ])
        appender.close()

        rows = db.all()
        assert len(rows) == 3

    def test_events_appender(self, conn):
        db = TestDuckdb(conn)
        appender = db.create_events_appender()
        appender.append(EventsRow(id=1, name="e1", tags=["x", "y"]))
        appender.close()

        events = db.all_events()
        assert len(events) == 1
        assert events[0].tags == ["x", "y"]

    def test_log_entries_appender_with_timestamp(self, conn):
        db = TestDuckdb(conn)
        ts = datetime.datetime(2025, 1, 15, 10, 30, 0, tzinfo=datetime.timezone.utc)
        appender = db.create_log_entries_appender()
        appender.append(LogEntriesRow(id=1, message="hello", created_at=ts))
        appender.close()

        rows = db.all_log_entries()
        assert len(rows) == 1
        assert rows[0].message == "hello"
        # DuckDB returns timestamptz in local timezone; compare as UTC
        result_utc = rows[0].created_at.astimezone(datetime.timezone.utc)
        assert result_utc == ts


class TestDataclassProperties:
    def test_rows_are_frozen(self, db):
        rows = db.all()
        with pytest.raises(AttributeError):
            rows[0].name = "modified"  # type: ignore

    def test_rows_are_hashable(self, db):
        rows = db.all()
        s = {rows[0], rows[1]}
        assert len(s) == 2

    def test_rows_have_equality(self, db):
        rows1 = db.all()
        rows2 = db.all()
        assert rows1[0] == rows2[0]


class TestMultipleParams:
    def test_actions_by_user_id_and_action(self, conn):
        db = TestDuckdb(conn)
        # No data, should return empty list
        rows = db.actions_by_user_id_and_action(user_id=1, action="click")
        assert rows == []

    def test_top_users(self, conn):
        db = TestDuckdb(conn)
        rows = db.top_users()
        assert isinstance(rows, list)
