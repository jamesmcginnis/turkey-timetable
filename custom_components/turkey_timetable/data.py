"""Shared schedule data manager for Turkey Timetable.

Owns the canonical lessons/settings data (persisted via HA's Store helper)
and the pure logic for expanding recurring weekly lessons into concrete
datetime instances. The card is the primary editor of this data, but the
integration is the source of truth once a lesson has been pushed to it via
the `turkey_timetable.update_schedule` service - this is what lets calendar
triggers and sensors work even if the card/browser isn't open.
"""
from __future__ import annotations

from datetime import datetime, time, timedelta
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import DEFAULT_SETTINGS, STORAGE_KEY, STORAGE_VERSION, WEEKDAYS


def _parse_hhmm(value: str) -> time:
    hour, minute = value.split(":")
    return time(hour=int(hour), minute=int(minute))


class TurkeyTimetableData:
    """Holds lessons + settings for one config entry and persists them."""

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self.hass = hass
        self._store: Store = Store(hass, STORAGE_VERSION, f"{STORAGE_KEY}_{entry_id}")
        self.lessons: list[dict[str, Any]] = []
        self.settings: dict[str, Any] = dict(DEFAULT_SETTINGS)

    async def async_load(self) -> None:
        stored = await self._store.async_load()
        if stored:
            self.lessons = stored.get("lessons", [])
            self.settings = {**DEFAULT_SETTINGS, **stored.get("settings", {})}

    async def async_save(self) -> None:
        await self._store.async_save(
            {"lessons": self.lessons, "settings": self.settings}
        )

    async def async_update_schedule(
        self, lessons: list[dict[str, Any]], settings: dict[str, Any] | None
    ) -> None:
        self.lessons = lessons
        if settings:
            self.settings = {**self.settings, **settings}
        await self.async_save()

    def instances_for_range(
        self, start: datetime, end: datetime
    ) -> list[dict[str, Any]]:
        """Expand recurring lessons into concrete (start, end) instances.

        Returns a list of dicts: the original lesson plus resolved
        `start`/`end` datetimes, for every occurrence between start and end.
        """
        instances: list[dict[str, Any]] = []
        tz = dt_util.DEFAULT_TIME_ZONE
        current = start.date()
        last = end.date()

        while current <= last:
            weekday_name = WEEKDAYS[current.weekday()]

            for lesson in self.lessons:
                if lesson.get("day") != weekday_name:
                    continue

                start_time = _parse_hhmm(lesson["start_time"])
                end_time = _parse_hhmm(lesson["end_time"])
                lesson_start = datetime.combine(current, start_time, tzinfo=tz)
                lesson_end = datetime.combine(current, end_time, tzinfo=tz)

                if lesson_start < end and lesson_end > start:
                    instances.append({**lesson, "start": lesson_start, "end": lesson_end})

            current += timedelta(days=1)

        instances.sort(key=lambda item: item["start"])
        return instances

    def current_and_next(self, now: datetime) -> tuple[dict | None, dict | None]:
        """Return (current_instance, next_instance) relative to `now`."""
        window_start = now - timedelta(days=1)
        window_end = now + timedelta(days=8)
        instances = self.instances_for_range(window_start, window_end)

        current = None
        upcoming = None
        for instance in instances:
            if instance["start"] <= now < instance["end"]:
                current = instance
            elif instance["start"] > now and upcoming is None:
                upcoming = instance
        return current, upcoming
