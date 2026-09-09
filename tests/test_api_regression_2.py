from __future__ import annotations

import pytest
from pydantic import ValidationError

from apps.api.app.schemas import PlatformConnectRequest


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
