"""Constants for the Turkey Timetable integration."""

DOMAIN = "turkey_timetable"

EVENT_LESSON_STARTING = f"{DOMAIN}_lesson_starting"

SERVICE_UPDATE_SCHEDULE = "update_schedule"
SERVICE_TEST_NOTIFICATION = "test_notification"

STORAGE_VERSION = 1
STORAGE_KEY = f"{DOMAIN}_schedule"

DEFAULT_NOTIFICATION_LEAD_MINUTES = 15

COORDINATOR_UPDATE_INTERVAL_SECONDS = 30

WEEKDAYS = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]

# Fixed iOS Reminders-style colour palette. The card only ever stores the
# key (e.g. "blue") against a lesson - never a raw hex value - so the
# palette can be re-themed in one place on both sides.
COLOR_PALETTE = {
    "red": "#FF3B30",
    "orange": "#FF9500",
    "yellow": "#FFCC00",
    "green": "#34C759",
    "teal": "#30B0C7",
    "blue": "#007AFF",
    "indigo": "#5856D6",
    "purple": "#AF52DE",
    "pink": "#FF2D55",
    "brown": "#A2845E",
    "gray": "#8E8E93",
}

DEFAULT_SETTINGS = {
    "notifications_enabled": True,
    "notification_lead_minutes": DEFAULT_NOTIFICATION_LEAD_MINUTES,
}
