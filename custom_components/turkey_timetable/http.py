"""Upload endpoint for lesson attachments.

Lets the card upload a file directly (via the browser's native file picker)
instead of requiring a pre-existing share link. Files are saved under
config/www/turkey_timetable_attachments/ so Home Assistant's own static
file serving can return them at /local/turkey_timetable_attachments/<name>
- no extra web server or auth handling needed to view them afterwards.
"""
from __future__ import annotations

import logging
import os
import re
import secrets

from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

UPLOAD_DIR_NAME = "turkey_timetable_attachments"
MAX_UPLOAD_BYTES = 300 * 1024 * 1024  # 300 MB


def _safe_filename(name: str) -> str:
    name = os.path.basename(name or "attachment")
    name = re.sub(r"[^A-Za-z0-9._-]", "_", name)
    name = name.strip("._") or "attachment"
    return name[-100:]


class TurkeyTimetableUploadView(HomeAssistantView):
    """Accepts a multipart file upload and stores it under config/www."""

    url = "/api/turkey_timetable/upload"
    name = "api:turkey_timetable:upload"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def post(self, request: web.Request) -> web.Response:
        reader = await request.multipart()
        field = await reader.next()

        if field is None or field.name != "file":
            return self.json_message("No file provided", status_code=400)

        data = await field.read(decode=False)
        if len(data) > MAX_UPLOAD_BYTES:
            return self.json_message(
                "File too large (max 300 MB)", status_code=413
            )

        original_name = field.filename or "attachment"
        safe_name = _safe_filename(original_name)
        unique_name = f"{secrets.token_hex(4)}_{safe_name}"

        upload_dir = self.hass.config.path("www", UPLOAD_DIR_NAME)

        def _write() -> None:
            os.makedirs(upload_dir, exist_ok=True)
            with open(os.path.join(upload_dir, unique_name), "wb") as fh:
                fh.write(data)

        try:
            await self.hass.async_add_executor_job(_write)
        except OSError as err:
            _LOGGER.error("Failed to save attachment upload: %s", err)
            return self.json_message("Could not save file", status_code=500)

        return self.json(
            {"url": f"/local/{UPLOAD_DIR_NAME}/{unique_name}", "name": original_name}
        )
