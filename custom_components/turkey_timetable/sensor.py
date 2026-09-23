"""Sensor platform for Turkey Timetable."""
from __future__ import annotations

from datetime import timedelta
from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.util import dt as dt_util

from .const import COLOR_PALETTE, DOMAIN
from .coordinator import TurkeyTimetableCoordinator


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator: TurkeyTimetableCoordinator = hass.data[DOMAIN][entry.entry_id][
        "coordinator"
    ]
    async_add_entities(
        [
            TurkeyTimetableLessonSensor(coordinator, entry.entry_id, "next"),
            TurkeyTimetableLessonSensor(coordinator, entry.entry_id, "current"),
            TurkeyTimetableNextReminderSensor(coordinator, entry.entry_id),
        ]
    )


class TurkeyTimetableLessonSensor(
    CoordinatorEntity[TurkeyTimetableCoordinator], SensorEntity
):
    """Sensor for either the current or the next lesson."""

    _attr_has_entity_name = True
    _attr_icon = "mdi:school-outline"

    def __init__(
        self, coordinator: TurkeyTimetableCoordinator, entry_id: str, kind: str
    ) -> None:
        super().__init__(coordinator)
        self._kind = kind  # "current" or "next"
        self._attr_name = "Current Lesson" if kind == "current" else "Next Lesson"
        self._attr_unique_id = f"{entry_id}_{kind}_lesson"

    @property
    def _instance(self) -> dict | None:
        return self.coordinator.data.get(self._kind)

    @property
    def native_value(self) -> str:
        instance = self._instance
        if not instance:
            return "None"
        if instance.get("tutor"):
            return f"{instance['subject']} - {instance['tutor']}"
        return instance["subject"]

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        instance = self._instance
        if not instance:
            return {}
        attrs = {
            "subject": instance.get("subject"),
            "tutor": instance.get("tutor"),
            "day": instance.get("day"),
            "start_time": instance["start"].isoformat(),
            "end_time": instance["end"].isoformat(),
            "color": instance.get("color"),
            "color_hex": COLOR_PALETTE.get(instance.get("color"), COLOR_PALETTE["blue"]),
            "link": instance.get("link") or None,
            "meeting_id": instance.get("meeting_id") or None,
            "passcode": instance.get("passcode") or None,
            "notes": instance.get("notes") or None,
            "location": instance.get("location") or None,
            "attachments": instance.get("attachments", []),
            "links": instance.get("links", []),
            "online_lessons": instance.get("online_lessons", []),
        }
        if self._kind == "next":
            settings = self.coordinator.data_manager.settings
            lead_minutes = settings.get("notification_lead_minutes", 5)
            minutes_until_start = round((instance["start"] - dt_util.now()).total_seconds() / 60, 1)
            attrs["minutes_until_start"] = minutes_until_start
            attrs["notify_at"] = (instance["start"] - timedelta(minutes=lead_minutes)).isoformat()
            attrs["notifications_enabled"] = settings.get("notifications_enabled")
            attrs["reminder_minutes"] = lead_minutes
        return attrs


class TurkeyTimetableNextReminderSensor(
    CoordinatorEntity[TurkeyTimetableCoordinator], SensorEntity
):
    """The exact timestamp the next lesson_starting event will fire at.

    Deliberately a separate entity from the Next Lesson sensor's notify_at
    attribute (which shows the same value) - a timestamp device_class sensor
    can be used directly as the `at:` target of a `time` trigger, which
    fires at that exact moment via HA's own scheduler and automatically
    re-arms whenever this sensor updates to point at the following lesson.
    """

    _attr_has_entity_name = True
    _attr_name = "Next Reminder"
    _attr_icon = "mdi:bell-ring-outline"
    _attr_device_class = SensorDeviceClass.TIMESTAMP

    def __init__(self, coordinator: TurkeyTimetableCoordinator, entry_id: str) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry_id}_next_reminder"

    @property
    def native_value(self):
        return self.coordinator.data.get("next_reminder_at")

