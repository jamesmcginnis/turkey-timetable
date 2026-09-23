"""Config flow for Turkey Timetable."""
from __future__ import annotations

from homeassistant import config_entries

from .const import DOMAIN


class TurkeyTimetableConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Turkey Timetable."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Single-step setup - all data entry happens in the card."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            return self.async_create_entry(title="Turkey Timetable", data={})

        return self.async_show_form(step_id="user")
