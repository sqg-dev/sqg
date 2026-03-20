"""Tests for generated PostgreSQL Python code.

Requires a running PostgreSQL instance. Start one with:
    just start-pg

Uses the same Docker container as the Java tests.
"""
from __future__ import annotations

import os
import uuid

import psycopg
import pytest

from generated.test_pg import (
    GetAllTasksRow,
    GetBigintRecordRow,
    GetUuidByIdRow,
    TestPg,
    Users1Row,
)

PG_DSN = os.environ.get(
    "PG_DSN",
    "host=localhost port=15432 dbname=sqg-db user=sqg password=secret",
)


@pytest.fixture
def conn():
    """Connect to PostgreSQL, apply migrations, and clean up after each test."""
    try:
        c = psycopg.connect(PG_DSN, autocommit=True)
    except psycopg.OperationalError:
        pytest.skip("PostgreSQL not available (start with: just start-pg)")

    # Drop all tables/types before each test for a clean slate
    with c.cursor() as cur:
        cur.execute("DROP TABLE IF EXISTS tricky_test, uuid_test, bigint_test, tasks, users, _sqg_migrations CASCADE")
        cur.execute("DROP TYPE IF EXISTS task_status, tricky_enum CASCADE")

    TestPg.apply_migrations(c)

    # Seed test data
    with c.cursor() as cur:
        cur.execute("""
            INSERT INTO tasks (title, status, tags, priority_scores) VALUES
                ('Task 1', 'active', ARRAY['urgent', 'backend'], ARRAY[10, 20, 30]),
                ('Task 2', 'pending', ARRAY['frontend'], ARRAY[5, 15])
        """)
        cur.execute("""
            INSERT INTO tricky_test (val) VALUES ('hello'), ('HELLO'), (' hello'), (' hello '), ('hello_1')
        """)
        cur.execute("""
            INSERT INTO uuid_test (id, label) VALUES ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'test-uuid')
        """)

    yield c
    c.close()


@pytest.fixture
def db(conn):
    """Create a TestPg instance with basic user data."""
    q = TestPg(conn)
    conn.execute(
        "INSERT INTO users (id, name, email) VALUES (%s, %s, %s)",
        ("1", "Alice", "alice@example.com"),
    )
    conn.execute(
        "INSERT INTO users (id, name, email) VALUES (%s, %s, %s)",
        ("2", "Bob", None),
    )
    return q


class TestMigrations:
    def test_get_migrations_returns_list(self):
        migrations = TestPg.get_migrations()
        assert isinstance(migrations, list)
        assert len(migrations) > 0

    def test_apply_migrations_creates_tables(self, conn):
        with conn.cursor() as cur:
            cur.execute("SELECT table_name FROM information_schema.tables WHERE table_name = 'users'")
            assert cur.fetchone() is not None

    def test_apply_migrations_idempotent(self, conn):
        TestPg.apply_migrations(conn)


class TestBasicQueries:
    def test_users1_returns_all(self, db):
        rows = db.users_1()
        assert len(rows) == 2
        assert isinstance(rows[0], Users1Row)
        assert rows[0].name == "Alice"

    def test_users1_raw(self, db):
        rows = db.users_1_raw()
        assert len(rows) == 2
        assert isinstance(rows[0], tuple)

    def test_users2_pluck_one(self, db):
        result = db.users_2()
        assert result == "1"

    def test_users4_one(self, db):
        result = db.users_4()
        assert result is not None
        assert result.email == "alice@example.com"

    def test_users6_with_param(self, db):
        result = db.users_6(name="Alice")
        assert result is not None
        assert result.name == "Alice"

    def test_users6_not_found(self, db):
        result = db.users_6(name="Nobody")
        assert result is None

    def test_users7_list_with_param(self, db):
        rows = db.users_7(name="Alice")
        assert len(rows) == 1


class TestEnumQueries:
    def test_get_tasks_by_status(self, conn):
        db = TestPg(conn)
        rows = db.get_tasks_by_status(status="active")
        assert len(rows) == 1
        assert rows[0].title == "Task 1"
        assert rows[0].status == "active"

    def test_get_all_tasks(self, conn):
        db = TestPg(conn)
        rows = db.get_all_tasks()
        assert len(rows) == 2
        assert isinstance(rows[0], GetAllTasksRow)

    def test_insert_task(self, conn):
        db = TestPg(conn)
        db.insert_task(
            title="New Task",
            status="pending",
            tags=["test"],
            priority_scores=[1, 2],
        )
        rows = db.get_all_tasks()
        assert len(rows) == 3

    def test_tricky_enum_values(self, conn):
        db = TestPg(conn)
        rows = db.get_tricky_values()
        assert len(rows) == 5
        vals = [r.val for r in rows]
        assert "hello" in vals
        assert "HELLO" in vals


class TestArrayQueries:
    def test_get_task_tags(self, conn):
        db = TestPg(conn)
        tags = db.get_task_tags()
        assert tags == ["urgent", "backend"]

    def test_get_task_priorities(self, conn):
        db = TestPg(conn)
        priorities = db.get_task_priorities()
        assert priorities == [10, 20, 30]


class TestBigintQueries:
    def test_bigint_record(self, conn):
        db = TestPg(conn)
        conn.execute(
            "INSERT INTO bigint_test (id, serial_id, small_id, regular_id, amount, name) VALUES (%s, %s, %s, %s, %s, %s)",
            (1, 100, 5, 42, 9999999999, "test"),
        )
        result = db.get_bigint_record(id=1)
        assert result is not None
        assert isinstance(result, GetBigintRecordRow)
        assert result.amount == 9999999999

    def test_bigint_amount_pluck(self, conn):
        db = TestPg(conn)
        conn.execute(
            "INSERT INTO bigint_test (id, serial_id, amount, name) VALUES (%s, %s, %s, %s)",
            (2, 200, 42, "test2"),
        )
        result = db.get_bigint_amount(id=2)
        assert result == 42

    def test_count_bigint(self, conn):
        db = TestPg(conn)
        result = db.count_bigint_test()
        assert isinstance(result, int)


class TestUuidQueries:
    def test_get_uuid_by_id(self, conn):
        db = TestPg(conn)
        result = db.get_uuid_by_id(id="a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11")
        assert result is not None
        assert isinstance(result, GetUuidByIdRow)
        assert result.label == "test-uuid"

    def test_insert_and_get_uuid(self, conn):
        db = TestPg(conn)
        test_id = "b1ffcd00-1d1c-5ff9-cc7e-7ccaae491b22"
        db.insert_uuid(id=test_id, label="inserted")
        result = db.get_uuid_by_id(id=test_id)
        assert result is not None
        assert result.label == "inserted"


class TestDataclassProperties:
    def test_rows_are_frozen(self, db):
        rows = db.users_1()
        with pytest.raises(AttributeError):
            rows[0].name = "modified"  # type: ignore

    def test_rows_have_equality(self, db):
        rows1 = db.users_1()
        rows2 = db.users_1()
        assert rows1[0] == rows2[0]
