from __future__ import annotations

import pytest
from pydantic import ValidationError

from apps.api.app.core import ensure_schema, iso_now, new_id
from apps.api.app.schemas import PlatformConnectRequest
from tests.test_core import insert_user, make_conn


@pytest.mark.parametrize("platform", ["amazon", "flipkart", "myntra", "ajio", "tatacliq", "nykaa"])
def test_every_supported_platform_can_be_connected(platform: str) -> None:
    """Regression: ISSUE-002 — extension sync could not connect Tata CLiQ or Nykaa.

    Found by /qa on 2026-09-09.
    Report: .gstack/qa-reports/qa-report-127-0-0-1-2026-09-09.md
    """
    assert PlatformConnectRequest(platform=platform).platform == platform


def test_unknown_platform_is_rejected() -> None:
    with pytest.raises(ValidationError):
        PlatformConnectRequest(platform="unknown")


def test_platform_connection_migration_preserves_existing_connections() -> None:
    conn = make_conn()
    user_id = insert_user(conn)
    conn.execute("drop table platform_connections")
    conn.execute(
        """
        create table platform_connections (
            connection_id text primary key,
            user_id text not null references users(user_id) on delete cascade,
            platform text not null check (platform in ('amazon','flipkart','myntra','ajio')),
            auth_token text,
            connected_at text not null,
            last_synced_at text,
            unique(user_id, platform)
        )
        """
    )
    conn.execute(
        "insert into platform_connections values (?, ?, 'amazon', null, ?, ?)",
        (new_id(), user_id, iso_now(), iso_now()),
    )

    ensure_schema(conn)
    conn.execute(
        "insert into platform_connections (connection_id, user_id, platform, auth_token, connected_at, last_synced_at) values (?, ?, 'tatacliq', null, ?, ?)",
        (new_id(), user_id, iso_now(), iso_now()),
    )

    platforms = [row[0] for row in conn.execute("select platform from platform_connections order by platform")]
    assert platforms == ["amazon", "tatacliq"]


def test_connection_migration_adds_confirmation_marker() -> None:
    conn = make_conn()
    columns = {row["name"] for row in conn.execute("pragma table_info(platform_connections)").fetchall()}
    assert "sync_confirmed_at" in columns
