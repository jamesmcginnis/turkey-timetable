"""Binary sensor platform for Turkey Timetable."""
from __future__ import annotations

from typing import Any

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import TurkeyTimetableCoordinator


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator: TurkeyTimetableCoordinator = hass.data[DOMAIN][entry.entry_id][
        "coordinator"
    ]
    async_add_entities([TurkeyTimetableLessonInProgressSensor(coordinator, entry.entry_id)])


class TurkeyTimetableLessonInProgressSensor(
    CoordinatorEntity[TurkeyTimetableCoordinator], BinarySensorEntity
):
    """On for exactly as long as a lesson is currently happening.

    Exists so automations (muting a smart speaker, a do-not-disturb light
    outside the door, pausing unrelated notifications) can react to "is a
    lesson on right now" directly, without each one having to independently
    check whether sensor.current_lesson's state is "None" or a real value.
    """

    _attr_has_entity_name = True
    _attr_name = "Lesson In Progress"
    _attr_icon = "mdi:human-male-board"
    _attr_device_class = BinarySensorDeviceClass.RUNNING

    def __init__(self, coordinator: TurkeyTimetableCoordinator, entry_id: str) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry_id}_lesson_in_progress"

    @property
    def is_on(self) -> bool:
        return bool(self.coordinator.data.get("current"))

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        current = self.coordinator.data.get("current")
        if not current:
            return {}
        return {
            "subject": current.get("subject"),
            "tutor": current.get("tutor"),
            "location": current.get("location") or None,
        }
