# Turkey Timetable

Turkey Timetable is a Home Assistant integration and Lovelace card for keeping track of a weekly lesson timetable. Designed with an **iPhone-style** look and feel, the card gives you a clean, colour-coded week of lessons with tutors, online meeting details, notes, links and attachments — while the integration turns that timetable into a calendar, lesson sensors and a lesson-starting event for notifications and automations.

The timetable is **shared across the whole household** — everyone sees the same lessons on every device.

> 📦 **One download installs both.** The card is bundled inside the integration and loads into your dashboards automatically — no resource to add.

> ✨ **AI features are optional and off by default.** Turn on **Enable AI Features** in the editor's AI Settings to unlock them — they need a conversation agent such as Google Gemini. With AI off, everything else in the card works as normal.

## Key Features

- **iPhone-style Design** — rounded sheets, day tabs and swipe gestures that feel like a native iOS app
- **Weekly View** — tap through Monday to Sunday, opening on today
- **Colour-coded Lessons** — an iOS Reminders-style palette of 11 colours
- **Search** — filter every lesson by subject or tutor
- **Swipe to Delete** — iOS swipe-list convention on each lesson row
- **Online Lesson Details** — lesson link, meeting ID and passcode, each with one-tap copy
- **Location, Notes, Links and Attachments** — upload files straight from your device
- **Export to PDF** — List View or Grid View
- **Data & Backup** — back up, restore (merge or replace) or reset the timetable
- **Notifications** — choose how far ahead to be reminded, from 1 to 60 minutes
- **Classic or Glass Style** — frosted, translucent Glass with Auto, Light or Dark theme
- **Colour Presets** — Classic, Ocean, Berry and Graphite, plus custom colours
- **Shared by the Household** — stored by the integration, not by any one user or browser

## AI Features

All optional, and each can be switched off individually:

- **Ask Your Timetable** — plain-English questions answered from your actual schedule
- **Quick Add** — describe a lesson in a sentence and it's filled into the New Lesson form
- **Weekly Overview** — a one-tap summary of the shape of your week
- **Fun Fact** — a short, light fact about a lesson's subject
- **Lesson Resources** — an AI overview plus curated study links for GCSE, A-Level and other UK qualifications
- **Practice Resources** — curated free practice-question sites plus a short focus note

Resource links are never AI-generated — they come from a hand-picked list of free, no-sign-up sites.

**Google Gemini** is the recommended and best-tested AI agent. Add the **Google Generative AI** integration (with the **Generative Language API** enabled in Google Cloud Console), then select **Google AI Conversation** in the card's AI Settings. Full step-by-step setup is in the README.

## Integration Entities

- **Calendar** — every lesson as a recurring weekly event
- **Next Lesson** and **Current Lesson** sensors — with full lesson details as attributes
- **Next Reminder** — a timestamp sensor ready to use in a time trigger
- **Lesson In Progress** — a binary sensor that's on while a lesson is running
- **`turkey_timetable_lesson_starting` event** — fired at your chosen reminder time
- **`turkey_timetable.test_notification` action** — test your automations on demand

## Installation

1. Add `https://github.com/jamesmcginnis/turkey-timetable` as an **Integration** custom repository in HACS
2. Search for **Turkey Timetable** and click **Download**
3. Restart Home Assistant
4. Go to **Settings → Devices & Services → + Add Integration**, search for **Turkey Timetable** and click **Submit**
5. Hard-refresh your browser, or close and reopen the HA app on your iPhone
6. Add the **Turkey Timetable Card** to a dashboard

Or copy `custom_components/turkey_timetable` from the [Releases](../../releases/latest) page into `/config/custom_components/`, restart, and add the integration.

## Lesson Reminder Example

```yaml
alias: Lesson reminder
triggers:
  - trigger: event
    event_type: turkey_timetable_lesson_starting
actions:
  - action: notify.mobile_app_your_iphone
    data:
      title: "{{ trigger.event.data.subject }} is starting soon"
      message: "{{ trigger.event.data.subject }} with {{ trigger.event.data.tutor }}"
```

## Quick Start

```yaml
type: custom:turkey-timetable-card
card_style: glass
appearance: auto
glass: 50
ai_features_enabled: true
ai_conversation_agent: conversation.google_generative_ai
exam_board: aqa
year_group: Year 10
```

> **Note:** Everything above can be set from the visual editor. AI features are **off by default** — the example above enables them; leave `ai_features_enabled` out (or set it `false`) for a card with no AI.
