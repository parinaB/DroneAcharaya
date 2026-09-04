"""In-process push bus for anything that wants frames as they arrive
rather than polled from the DB -- consumed by the /replay/{session_id}/stream
WebSocket route (app/modules/replay/routes.py).

Not Redis -- there's one backend process serving one session at a time
right now (see ops/infra/README.md); revisit only if that stops being true.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from dataclasses import dataclass

from app.bridge.frame import EngineFrame
from app.modules.inference.schemas import HealthScoreOut


@dataclass
class BroadcastTick:
    """One frame + its health score, published together so a subscriber
    never sees frame.t and health.t disagree -- see service.py's run() loop,
    which now publishes only after both are computed for the same frame.
    health is None only when get_health_score() itself returned nothing
    scoreable (never a lag artifact)."""

    frame: EngineFrame
    health: HealthScoreOut | None


class Broadcaster:
    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue[BroadcastTick]]] = defaultdict(set)

    def subscribe(self, session_id: str) -> asyncio.Queue[BroadcastTick]:
        queue: asyncio.Queue[BroadcastTick] = asyncio.Queue(maxsize=100)
        self._subscribers[session_id].add(queue)
        return queue

    def unsubscribe(self, session_id: str, queue: asyncio.Queue[BroadcastTick]) -> None:
        self._subscribers[session_id].discard(queue)

    def publish(self, session_id: str, tick: BroadcastTick) -> None:
        for queue in list(self._subscribers.get(session_id, ())):
            if queue.full():
                # Backpressure: drop the oldest rather than block the
                # bridge loop -- a slow consumer shouldn't stall replay.
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            queue.put_nowait(tick)


broadcaster = Broadcaster()
