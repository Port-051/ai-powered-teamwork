"""TeamBrain memory plugin — MVP prototype MemoryProvider.

Local, file-based "team shared brain": every profile that activates this
provider (memory.provider: teambrain in config.yaml) reads from and writes
to the SAME shared store, regardless of which Hermes profile (= which
person's bot) handled the turn. This is a throwaway prototype to validate
that Hermes' memory-provider extension point can carry cross-profile team
knowledge — not the production team-knowledge design (see
port_051/knowledge-layer-design-drafts.md for that).

Store location: ~/.hermes/team_knowledge/store.jsonl (outside any single
profile's HERMES_HOME, so profiles genuinely share it).
"""

from __future__ import annotations

import json
import logging
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from agent.memory_provider import MemoryProvider

logger = logging.getLogger(__name__)

_STORE_PATH = Path.home() / ".hermes" / "team_knowledge" / "store.jsonl"
_MAX_PREFETCH_HITS = 5


def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-zA-Z0-9가-힣]+", text.lower()))


class TeamBrainMemoryProvider(MemoryProvider):
    """Prototype shared team-knowledge provider."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._profile = "unknown"
        self._platform = "unknown"
        self._user_id = "unknown"
        self._session_id = ""

    @property
    def name(self) -> str:
        return "teambrain"

    def is_available(self) -> bool:
        # Local-only, no credentials required. Still opt-in only, since
        # activation always requires memory.provider: teambrain in a
        # profile's own config.yaml (see plugins/memory/__init__.py).
        return True

    def initialize(self, session_id: str, **kwargs) -> None:
        hermes_home = str(kwargs.get("hermes_home", ""))
        self._profile = Path(hermes_home).name if hermes_home else "unknown"
        self._platform = str(kwargs.get("platform", "unknown"))
        self._user_id = str(kwargs.get("user_id", "unknown"))
        self._session_id = session_id
        _STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
        if not _STORE_PATH.exists():
            _STORE_PATH.touch()
        logger.info(
            "TeamBrain provider initialized: profile=%s platform=%s user_id=%s store=%s",
            self._profile, self._platform, self._user_id, _STORE_PATH,
        )

    def system_prompt_block(self) -> str:
        return (
            "# TeamBrain (prototype)\n"
            "You have access to a shared team knowledge store. Relevant entries "
            "from teammates (across different Hermes profiles/bots) may be "
            "injected below as [TeamBrain] context before your turn."
        )

    def _read_all(self) -> List[Dict[str, Any]]:
        if not _STORE_PATH.exists():
            return []
        entries = []
        with self._lock:
            for line in _STORE_PATH.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    entries.append(json.loads(line))
                except Exception:
                    continue
        return entries

    def prefetch(self, query: str, *, session_id: str = "") -> str:
        query_tokens = _tokenize(query)
        if not query_tokens:
            return ""
        entries = self._read_all()
        scored = []
        for e in entries:
            blob = f"{e.get('user','')} {e.get('assistant','')}"
            overlap = query_tokens & _tokenize(blob)
            if overlap:
                scored.append((len(overlap), e))
        scored.sort(key=lambda t: t[0], reverse=True)
        hits = scored[:_MAX_PREFETCH_HITS]
        if not hits:
            return ""
        lines = ["[TeamBrain] Relevant team knowledge from other profiles/teammates:"]
        for _, e in hits:
            who = e.get("profile", "unknown")
            when = e.get("timestamp", "")
            lines.append(f"- ({who}, {when}) {e.get('user','')} -> {e.get('assistant','')}")
        return "\n".join(lines)

    def sync_turn(
        self,
        user_content: str,
        assistant_content: str,
        *,
        session_id: str = "",
        messages: Any = None,
    ) -> None:
        if not user_content:
            return
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "profile": self._profile,
            "platform": self._platform,
            "user_id": self._user_id,
            "session_id": session_id or self._session_id,
            "user": user_content[:2000],
            "assistant": (assistant_content or "")[:2000],
        }
        with self._lock:
            with _STORE_PATH.open("a", encoding="utf-8") as f:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")

    def get_tool_schemas(self) -> List[Dict[str, Any]]:
        return []


def register(ctx) -> None:
    ctx.register_memory_provider(TeamBrainMemoryProvider())
