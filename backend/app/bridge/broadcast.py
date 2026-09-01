"""In-process push bus for anything that wants frames as they arrive
rather than polled from the DB (a future WS endpoint for Unreal/frontend).

Not Redis -- there's one backend process serving one session at a time
right now (see ops/infra/README.md); revisit only if that stops being true.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict

from app.bridge.frame import EngineFrame


class Broadcaster:
    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue[EngineFrame]]] = defaultdict(set)

    def subscribe(self, session_id: str) -> asyncio.Queue[EngineFrame]:
        queue: asyncio.Queue[EngineFrame] = asyncio.Queue(maxsize=100)
        self._subscribers[session_id].add(queue)
        return queue

    def unsubscribe(self, session_id: str, queue: asyncio.Queue[EngineFrame]) -> None:
        self._subscribers[session_id].discard(queue)

    def publish(self, session_id: str, frame: EngineFrame) -> None:
        for queue in list(self._subscribers.get(session_id, ())):
            if queue.full():
                # Backpressure: drop the oldest rather than block the
                # bridge loop -- a slow consumer shouldn't stall replay.
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            queue.put_nowait(frame)


broadcaster = Broadcaster()
