"""Calendar platform for Turkey Timetable.

Exposes the timetable as a standard HA calendar entity, so `calendar`
automation triggers (with an offset) work out of the box even without the
custom `turkey_timetable_lesson_starting` event.
"""
from __future__ import annotations

from datetime import datetime

from homeassistant.components.calendar import CalendarEntity, CalendarEvent
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.util import dt as dt_util

from .const import DOMAIN
from .coordinator import TurkeyTimetableCoordinator
from .data import TurkeyTimetableData


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    entry_data = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(
        [
            TurkeyTimetableCalendar(
                entry_data["coordinator"], entry_data["data_manager"], entry.entry_id
            )
        ]
    )


def _to_calendar_event(instance: dict) -> CalendarEvent:
    title = instance["subject"]
    if instance.get("tutor"):
        title = f"{instance['subject']} - {instance['tutor']}"
    description_parts = []
    if instance.get("notes"):
        description_parts.append(instance["notes"])
    if instance.get("link"):
        description_parts.append(instance["link"])
    return CalendarEvent(
        start=instance["start"],
        end=instance["end"],
        summary=title,
        description="\n".join(description_parts) or None,
    )


class TurkeyTimetableCalendar(CoordinatorEntity[TurkeyTimetableCoordinator], CalendarEntity):
    """Calendar entity backed by the timetable's recurring lessons."""

    _attr_has_entity_name = True
    _attr_name = "Timetable"
    _attr_icon = "mdi:calendar-clock"

    def __init__(
        self,
        coordinator: TurkeyTimetableCoordinator,
        data_manager: TurkeyTimetableData,
        entry_id: str,
    ) -> None:
        super().__init__(coordinator)
        self._data_manager = data_manager
        self._attr_unique_id = f"{entry_id}_calendar"

    @property
    def event(self) -> CalendarEvent | None:
        current = self.coordinator.data.get("current")
        if current:
            return _to_calendar_event(current)
        upcoming = self.coordinator.data.get("next")
        return _to_calendar_event(upcoming) if upcoming else None

    async def async_get_events(
        self, hass: HomeAssistant, start_date: datetime, end_date: datetime
    ) -> list[CalendarEvent]:
        instances = self._data_manager.instances_for_range(
            dt_util.as_local(start_date), dt_util.as_local(end_date)
        )
        return [_to_calendar_event(instance) for instance in instances]
