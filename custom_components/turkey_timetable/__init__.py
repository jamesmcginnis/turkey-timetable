"""The Turkey Timetable integration."""
from __future__ import annotations

from pathlib import Path

import voluptuous as vol

from homeassistant.components import persistent_notification, websocket_api
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv
from homeassistant.loader import async_get_integration

from .const import DOMAIN, EVENT_LESSON_STARTING, SERVICE_TEST_NOTIFICATION, SERVICE_UPDATE_SCHEDULE
from .coordinator import TurkeyTimetableCoordinator, lesson_event_payload
from .data import TurkeyTimetableData
from .http import TurkeyTimetableUploadView

PLATFORMS = ["calendar", "sensor", "binary_sensor"]

# The Lovelace card ships inside the integration and is loaded into the
# frontend automatically, so one HACS download installs both - HACS only
# allows a repository to be added under a single category.
CARD_FILENAME = "turkey-timetable-card.js"
CARD_URL = f"/{DOMAIN}/{CARD_FILENAME}"

LESSON_SCHEMA = vol.Schema(
    {
        vol.Required("id"): cv.string,
        vol.Required("day"): cv.string,
        vol.Required("start_time"): cv.string,
        vol.Required("end_time"): cv.string,
        vol.Required("subject"): cv.string,
        vol.Optional("tutor", default=""): cv.string,
        vol.Optional("color", default="blue"): cv.string,
        vol.Optional("link", default=""): cv.string,
        vol.Optional("meeting_id", default=""): cv.string,
        vol.Optional("passcode", default=""): cv.string,
        vol.Optional("notes", default=""): cv.string,
        vol.Optional("location", default=""): cv.string,
        vol.Optional("attachments", default=[]): [
            vol.Schema({vol.Required("name"): cv.string, vol.Required("url"): cv.string})
        ],
        vol.Optional("links", default=[]): [
            vol.Schema({vol.Required("name"): cv.string, vol.Required("url"): cv.string})
        ],
        vol.Optional("online_lessons", default=[]): [
            vol.Schema({vol.Required("name"): cv.string, vol.Required("url"): cv.string})
        ],
    }
)

UPDATE_SCHEDULE_SCHEMA = vol.Schema(
    {
        vol.Required("lessons"): [LESSON_SCHEMA],
        vol.Optional("settings", default={}): dict,
    }
)


@websocket_api.websocket_command({vol.Required("type"): "turkey_timetable/get_schedule"})
@websocket_api.async_response
async def websocket_get_schedule(hass: HomeAssistant, connection, msg: dict) -> None:
    """Return the shared lessons + settings straight from the integration's
    own storage - not scoped to any one HA user, unlike frontend/get_user_data.
    This is what makes the timetable the same for every household member
    regardless of which HA account they're logged in as, or which device
    they're on. Available to any authenticated user, not just admins - the
    whole point is every household member can read it."""
    entry_data = next(iter(hass.data.get(DOMAIN, {}).values()), None)
    if not entry_data:
        connection.send_error(msg["id"], "not_found", "Turkey Timetable is not set up")
        return
    data_manager: TurkeyTimetableData = entry_data["data_manager"]
    connection.send_result(
        msg["id"], {"lessons": data_manager.lessons, "settings": data_manager.settings}
    )


async def _async_register_card(hass: HomeAssistant) -> None:
    """Serve the bundled card and add it to every dashboard (once per run)."""
    if hass.data.get(f"{DOMAIN}_card_registered"):
        return
    card_path = Path(__file__).parent / "www" / CARD_FILENAME
    await hass.http.async_register_static_paths(
        [StaticPathConfig(CARD_URL, str(card_path), True)]
    )
    # Version query string busts the browser cache after each update.
    integration = await async_get_integration(hass, DOMAIN)
    add_extra_js_url(hass, f"{CARD_URL}?v={integration.version}")
    hass.data[f"{DOMAIN}_card_registered"] = True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Turkey Timetable from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    await _async_register_card(hass)

    data_manager = TurkeyTimetableData(hass, entry.entry_id)
    await data_manager.async_load()

    coordinator = TurkeyTimetableCoordinator(hass, data_manager)
    await coordinator.async_config_entry_first_refresh()

    hass.data[DOMAIN][entry.entry_id] = {
        "data_manager": data_manager,
        "coordinator": coordinator,
    }

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # Kept outside hass.data[DOMAIN] deliberately - that dict is iterated by
    # handle_update_schedule() below as "all config entries", so anything
    # that isn't an entry's data must live somewhere else.
    if not hass.data.get(f"{DOMAIN}_upload_view_registered"):
        hass.http.register_view(TurkeyTimetableUploadView(hass))
        hass.data[f"{DOMAIN}_upload_view_registered"] = True

    if not hass.data.get(f"{DOMAIN}_ws_registered"):
        websocket_api.async_register_command(hass, websocket_get_schedule)
        hass.data[f"{DOMAIN}_ws_registered"] = True

    async def handle_update_schedule(call: ServiceCall) -> None:
        """Handle turkey_timetable.update_schedule.

        Applies to every configured Turkey Timetable entry - in practice
        there is normally just one, but this keeps behaviour sane if the
        integration is ever set up more than once.
        """
        lessons = call.data["lessons"]
        settings = call.data.get("settings", {})
        for entry_data in hass.data[DOMAIN].values():
            await entry_data["data_manager"].async_update_schedule(lessons, settings)
            await entry_data["coordinator"].async_request_refresh()

    if not hass.services.has_service(DOMAIN, SERVICE_UPDATE_SCHEDULE):
        hass.services.async_register(
            DOMAIN,
            SERVICE_UPDATE_SCHEDULE,
            handle_update_schedule,
            schema=UPDATE_SCHEDULE_SCHEMA,
        )

    async def handle_test_notification(call: ServiceCall) -> None:
        """Handle turkey_timetable.test_notification.

        Fires the lesson-starting event immediately for whichever lesson is
        currently "next", ignoring the notify-lead-time setting entirely -
        this exists purely so an automation listening for that event can be
        tested on demand from Developer Tools -> Actions, instead of
        waiting for a real lesson's lead time to arrive. If nothing fires,
        the problem is upstream of the automation (no lessons scheduled, or
        the integration itself); if the automation still doesn't do
        anything when this does fire, the problem is in the automation.
        """
        fired = False
        for entry_data in hass.data[DOMAIN].values():
            coordinator: TurkeyTimetableCoordinator = entry_data["coordinator"]
            upcoming = (coordinator.data or {}).get("next")
            if not upcoming:
                continue
            fired = True
            hass.bus.async_fire(EVENT_LESSON_STARTING, lesson_event_payload(upcoming))
        if not fired:
            persistent_notification.async_create(
                hass,
                "No upcoming lesson found to test with - add a lesson in the "
                "card first, or check the integration is receiving your schedule.",
                title="Turkey Timetable test notification",
            )

    if not hass.services.has_service(DOMAIN, SERVICE_TEST_NOTIFICATION):
        hass.services.async_register(DOMAIN, SERVICE_TEST_NOTIFICATION, handle_test_notification)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
        if not hass.data[DOMAIN]:
            hass.services.async_remove(DOMAIN, SERVICE_UPDATE_SCHEDULE)
            hass.services.async_remove(DOMAIN, SERVICE_TEST_NOTIFICATION)
    return unload_ok
