from __future__ import annotations

from apps.api.app import main as api_main
from apps.api.app.schemas import CategoryPreferencesRequest

from tests.test_core import insert_user, make_conn


def test_onboarding_accepts_deserialized_behavior_vector() -> None:
    """Regression: ISSUE-001 — onboarding crashed when database JSON was already decoded.

    Found by /qa on 2026-09-09.
    Report: .gstack/qa-reports/qa-report-127-0-0-1-2026-09-09.md
    """
    conn = make_conn()
    user_id = insert_user(conn, behavior={"Electronics": 0.5, "Audio": 0.5})
    user = api_main.fetch_one(conn, "select * from users where user_id = ?", (user_id,))

    result = api_main.onboarding_preferences(
        CategoryPreferencesRequest(answers=["Audio"]),
        user=user,
        conn=conn,
    )

    assert result == {"answers": ["Audio"], "saved": True}
    saved = api_main.fetch_one(conn, "select * from users where user_id = ?", (user_id,))
    assert saved["onboarding_answers"] == ["Audio"]
    assert saved["behavior_vector"]["Audio"] > saved["behavior_vector"]["Electronics"]
