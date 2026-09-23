"""Coordinator that recomputes current/next lesson and fires the
lesson-starting event. No external I/O - this just re-derives state from
the in-memory schedule every interval, so a short poll interval is cheap."""
from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.util import dt as dt_util

from .const import COORDINATOR_UPDATE_INTERVAL_SECONDS, EVENT_LESSON_STARTING
from .data import TurkeyTimetableData

_LOGGER = logging.getLogger(__name__)


def lesson_event_payload(instance: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": instance.get("id"),
        "subject": instance.get("subject"),
        "tutor": instance.get("tutor"),
        "day": instance.get("day"),
        "color": instance.get("color"),
        "link": instance.get("link"),
        "notes": instance.get("notes"),
        "start_time": instance["start"].isoformat(),
        "end_time": instance["end"].isoformat(),
    }


class TurkeyTimetableCoordinator(DataUpdateCoordinator):
    """Recomputes current/next lesson and fires notification events."""

    def __init__(self, hass: HomeAssistant, data_manager: TurkeyTimetableData) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name="Turkey Timetable",
            update_interval=timedelta(seconds=COORDINATOR_UPDATE_INTERVAL_SECONDS),
        )
        self.data_manager = data_manager
        self._fired_today: set[str] = set()
        self._fired_date = dt_util.now().date()

    async def _async_update_data(self) -> dict[str, Any]:
        now = dt_util.now()

        if now.date() != self._fired_date:
            self._fired_today.clear()
            self._fired_date = now.date()

        current, upcoming = self.data_manager.current_and_next(now)
        next_reminder_at = None

        if not self.data_manager.lessons:
            _LOGGER.debug("Turkey Timetable: no lessons loaded - nothing to schedule")
        elif upcoming:
            lead_minutes = self.data_manager.settings.get("notification_lead_minutes", 5)
            fire_at = upcoming["start"] - timedelta(minutes=lead_minutes)
            # sensor.next_reminder must respect the Notifications toggle the
            # same way the event does - otherwise an automation triggered
            # directly off the sensor's timestamp (via a `time` trigger)
            # keeps firing even after the user switches notifications off.
            if self.data_manager.settings.get("notifications_enabled"):
                next_reminder_at = fire_at
            fire_key = f"{upcoming.get('id')}|{upcoming['start'].isoformat()}"
            minutes_until_fire = round((fire_at - now).total_seconds() / 60, 1)
            _LOGGER.debug(
                "Turkey Timetable: next lesson '%s' at %s, notify at %s (in %s min, "
                "lead=%s min), notifications_enabled=%s, already fired=%s",
                upcoming.get("subject"),
                upcoming["start"].isoformat(),
                fire_at.isoformat(),
                minutes_until_fire,
                lead_minutes,
                self.data_manager.settings.get("notifications_enabled"),
                fire_key in self._fired_today,
            )

            if (
                self.data_manager.settings.get("notifications_enabled")
                and fire_at <= now
                and fire_key not in self._fired_today
            ):
                self._fired_today.add(fire_key)
                _LOGGER.info(
                    "Turkey Timetable: firing %s for '%s' at %s",
                    EVENT_LESSON_STARTING,
                    upcoming.get("subject"),
                    now.isoformat(),
                )
                self.hass.bus.async_fire(EVENT_LESSON_STARTING, lesson_event_payload(upcoming))

        return {"current": current, "next": upcoming, "next_reminder_at": next_reminder_at}
