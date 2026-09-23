# Turkey Timetable

Turkey Timetable is a Home Assistant integration and Lovelace card for keeping track of a weekly lesson timetable. Designed with an **iPhone-style** look and feel, the card gives you a clean, colour-coded week of lessons with tutors, online meeting details, notes, links and attachments — while the integration turns that timetable into real Home Assistant entities: a calendar, current / next lesson sensors, a lesson-in-progress binary sensor and a lesson-starting event you can build notifications and automations around.

The timetable is **shared across the whole household** — it's stored by the integration, not in any one browser or Home Assistant user account, so everyone sees the same lessons on every device.

> 📦 **One download installs both.** The card is bundled inside the integration and is loaded into your dashboards automatically — there's no separate resource to add.

> ✨ **AI features are optional and off by default.** Turn on **Enable AI Features** in the card editor's AI Settings to unlock them — they need a conversation agent such as Google Gemini (see [AI Features Setup](#-ai-features-setup-optional) below). With AI off, everything else in the card works as normal.

![Home Assistant](https://img.shields.io/badge/Home%20Assistant-2026+-blue)
![HACS](https://img.shields.io/badge/HACS-Custom-orange)

**Step 1 — Add the repository to HACS:**

[![Open your Home Assistant instance and add this repository to HACS.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=jamesmcginnis&repository=turkey-timetable&category=integration)

**Step 2 — After downloading and restarting, add the integration:**

[![Open your Home Assistant instance and start setting up Turkey Timetable.](https://my.home-assistant.io/badges/config_flow_start.svg)](https://my.home-assistant.io/redirect/config_flow_start/?domain=turkey_timetable)

---

## 🛠️ Installation

### Via HACS (Recommended)

1. Click the **Add to HACS** button above, or in Home Assistant open **HACS** → **⋮ menu** (top right) → **Custom repositories**
2. Add `https://github.com/jamesmcginnis/turkey-timetable` as an **Integration** repository, then close
3. Search for **Turkey Timetable** and click **Download**
4. **Restart Home Assistant**
5. Click the **Add Integration** button above, or go to **Settings → Devices & Services → + Add Integration** and search for **Turkey Timetable**
6. Click **Submit** — there's nothing to fill in, all lessons and settings are entered from the card
7. Hard-refresh your browser (Cmd+Shift+R on Mac) or close and reopen the Home Assistant app on your iPhone
8. Edit a dashboard, click **+ Add Card** and search for **Turkey Timetable Card**

### Manual

1. Download this repository from [Releases](../../releases/latest)
2. Copy the `custom_components/turkey_timetable` folder into `/config/custom_components/` on your Home Assistant instance
3. Restart Home Assistant, then add the integration under **Settings → Devices & Services → + Add Integration**
4. Hard-refresh your browser and add the **Turkey Timetable Card** to a dashboard

> 💡 **You don't need to add a dashboard resource.** The integration serves the card and registers it automatically. If you previously added `turkey-timetable-card.js` as a resource by hand, remove it under **Settings → Dashboards → Resources** so only the bundled copy loads.

---

## 🤖 AI Features Setup (Optional)

AI features are **off by default** — the card works fully without them. To unlock them (Ask Your Timetable, Quick Add, Weekly Overview, Fun Fact, Lesson Resources and Practice Resources), turn on **Enable AI Features** at the top of the card editor's **AI Settings** section, then set up a conversation agent. **Google Gemini** is the recommended and best-tested agent:

### Step 1 — Enable the Generative Language API

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and sign in
2. Create a new project (or select an existing one)
3. Go to **APIs & Services → Library**
4. Search for **Generative Language API** and click **Enable**

> ⚠️ This step is essential. An API key without the Generative Language API enabled will return errors immediately.

### Step 2 — Create an API Key

1. In Google Cloud Console go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → API key** and copy the key

### Step 3 — Add Google Generative AI to Home Assistant

1. In Home Assistant go to **Settings → Devices & Services → + Add Integration**
2. Search for **Google Generative AI** and select it
3. Paste your API key and click Submit
4. Click the **gear icon ⚙️** next to **Google AI Conversation**
5. Uncheck **Recommended model settings**, select a current **Flash** model and save

### Step 4 — Configure the Card

In the card's visual editor, open the **AI Settings** section, turn on **Enable AI Features**, and select **Google AI Conversation** from the AI Agent dropdown. Optionally set your **Exam Board** and **Year Group** so Lesson Resources and Practice Resources are pitched at the right level.

> 💡 Other conversation agents (Claude, OpenAI, Ollama, etc., added via **Settings → Voice Assistants**) may also work, but Google Gemini is the recommended and best-tested option.

### Free Tier

Gemini's free tier is generous for a timetable card. The card caches Lesson Resources and the Weekly Overview so repeat views don't use extra requests — Practice Resources is deliberately regenerated each time for variety. If you see a rate-limit error, your daily quota is exhausted and will reset the next day.

---

## ✨ Features

### Timetable Card

- 📱 **iPhone-style design** — rounded sheets, day tabs and swipe gestures that feel like a native iOS app
- 🗓️ **Weekly view** — tap through Monday to Sunday, opening on today
- 🎨 **Colour-coded lessons** — an iOS Reminders-style palette of 11 colours
- 🔍 **Search** — filter every lesson by subject or tutor
- 👈 **Swipe to delete** — iOS swipe-list convention on each lesson row
- 💻 **Online lesson details** — lesson link, meeting ID / username and passcode, each with one-tap copy
- 📍 **Location and notes** for every lesson
- 🔗 **Links and online lessons** — attach any number of named links to a lesson
- 📎 **Attachments** — upload files straight from your device's file picker (up to 300 MB each); they're stored on your Home Assistant server
- 📄 **Export to PDF** — in **List View** or **Grid View**
- 💾 **Data & Backup** — back up to a JSON file, restore (merge or replace), or reset the timetable
- 🔔 **Notifications** — switch on/off and choose how far ahead to be reminded (1–60 minutes)
- 🏠 **Shared by the household** — every user and device sees the same timetable

### Appearance

- **Classic** or **Glass** style — Glass is a frosted, translucent surface with blur and soft highlights
- **Theme** — Auto (follows your Home Assistant theme), Light or Dark
- **Glass slider** — from Clear to Frosted
- **Colour presets** — Classic, Ocean, Berry and Graphite, plus custom Accent, Delete and Switch colours
- Colours are automatically adjusted to stay readable in both light and dark themes; lesson colours are never changed

### AI Features

All optional, and each can be switched off individually in the editor:

- **Ask Your Timetable** — ask a question in plain English, answered from your actual schedule
- **Quick Add** — describe a lesson in a sentence and it's filled into the New Lesson form for you to check and save
- **Weekly Overview** — a one-tap summary of the shape of your week
- **Fun Fact** — a short, light fact about a lesson's subject
- **Lesson Resources** — for lessons mentioning a UK qualification level (GCSE, A-Level, KS1–4, SATs, BTEC, IB, National 5, Highers and more), an AI overview plus curated study links
- **Practice Resources** — a curated set of free practice-question sites, plus a short AI note on what to focus on

> 🔒 **Resource links are never AI-generated.** Every clickable link comes from a small hand-picked list of genuinely free sites that need no sign-up (such as BBC Bitesize, Oak National Academy and Physics & Maths Tutor). The AI only writes the text around them.

### Integration

- 📅 **Calendar entity** — your recurring lessons as a standard Home Assistant calendar
- ⏭️ **Next Lesson** and ▶️ **Current Lesson** sensors with full lesson details as attributes
- 🔔 **Next Reminder** timestamp sensor — ready to use directly in a time trigger
- 🟢 **Lesson In Progress** binary sensor
- 📣 **`turkey_timetable_lesson_starting` event**, fired at your chosen reminder time
- 🧪 **Test notification action** for testing automations on demand
- 📡 Runs entirely locally — no cloud services and no polling of external APIs

---

## 📊 Entities

| Entity | Description |
|--------|-------------|
| `calendar.timetable` | Every lesson as a recurring weekly calendar event |
| `sensor.next_lesson` | The next lesson (`Subject - Tutor`), with attributes including `start_time`, `end_time`, `link`, `meeting_id`, `passcode`, `location`, `notes`, `color_hex`, `minutes_until_start` and `notify_at` |
| `sensor.current_lesson` | The lesson happening now, or `None` |
| `sensor.next_reminder` | Timestamp of the next reminder (empty when notifications are switched off) |
| `binary_sensor.lesson_in_progress` | On for exactly as long as a lesson is running |

> Entity IDs may differ slightly on your system — check **Settings → Devices & Services → Turkey Timetable**.

### Actions

| Action | Description |
|--------|-------------|
| `turkey_timetable.update_schedule` | Replaces the stored timetable. The card calls this automatically whenever you save a change |
| `turkey_timetable.test_notification` | Fires the lesson-starting event immediately for the next lesson — run it from **Developer Tools → Actions** to test an automation without waiting |

---

## 🔔 Notification Automations

Turn on **Notifications** in the card's Settings and choose **Notify Before**. Then pick whichever trigger you prefer:

### Using the event

```yaml
alias: Lesson reminder
triggers:
  - trigger: event
    event_type: turkey_timetable_lesson_starting
actions:
  - action: notify.mobile_app_your_iphone
    data:
      title: "{{ trigger.event.data.subject }} is starting soon"
      message: >
        {{ trigger.event.data.subject }}
        {% if trigger.event.data.tutor %}with {{ trigger.event.data.tutor }}{% endif %}
        at {{ as_timestamp(trigger.event.data.start_time) | timestamp_custom('%H:%M') }}
      data:
        url: "{{ trigger.event.data.link }}"
```

The event includes `id`, `subject`, `tutor`, `day`, `color`, `link`, `notes`, `start_time` and `end_time`.

### Using the Next Reminder sensor

```yaml
triggers:
  - trigger: time
    at: sensor.next_reminder
```

This fires at exactly the reminder time and re-arms itself for the following lesson automatically.

### Using the calendar

```yaml
triggers:
  - trigger: calendar
    event: start
    offset: "-0:10:00"
    entity_id: calendar.timetable
```

### Lesson in progress

Use `binary_sensor.lesson_in_progress` to mute a smart speaker, turn on a do-not-disturb light outside the door, or pause other notifications while a lesson is on.

---

## 📋 Quick Start

```yaml
type: custom:turkey-timetable-card
max_list_height: 340
card_style: glass
appearance: auto
glass: 50
accent_color: '#0A84FF'
delete_color: '#FF3B30'
switch_color: '#34C759'
ai_features_enabled: true
ai_conversation_agent: conversation.google_generative_ai
exam_board: aqa
year_group: Year 10
ai_enable_ask: true
ai_enable_quick_add: true
ai_enable_weekly_overview: true
ai_enable_fun_fact: true
ai_enable_resources: true
ai_enable_practice_resources: true
```

> **Note:** Everything above can be set from the visual editor. AI features are **off by default** — the example above enables them; leave `ai_features_enabled` out (or set it `false`) for a card with no AI. Your AI agent's entity ID may differ — pick it from the editor's dropdown.

### Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `max_list_height` | `340` | Maximum height of the lesson list in pixels |
| `card_style` | `classic` | `classic` or `glass` |
| `appearance` | `auto` | Glass theme: `auto`, `light` or `dark` |
| `glass` | `50` | Glass transparency, `0` (clear) to `100` (frosted) |
| `accent_color` | `#0a84ff` | Buttons, links, selected day and highlights |
| `delete_color` | `#ff3b30` | Swipe-to-delete and destructive actions |
| `switch_color` | `#34c759` | Toggle switches when turned on |
| `ai_features_enabled` | `false` | Master switch for all AI features |
| `ai_conversation_agent` | *(Home Assistant)* | Conversation agent used for AI features |
| `exam_board` | — | `aqa`, `edexcel`, `ocr`, `wjec`, `ccea` or `sqa` |
| `year_group` | — | `Year 1` to `Year 13` |
| `ai_enable_ask` | `true` | Ask Your Timetable |
| `ai_enable_quick_add` | `true` | Quick Add |
| `ai_enable_weekly_overview` | `true` | Weekly Overview |
| `ai_enable_fun_fact` | `true` | Fun Fact |
| `ai_enable_resources` | `true` | Lesson Resources |
| `ai_enable_practice_resources` | `true` | Practice Resources |

---

## 🔧 Troubleshooting

**The card doesn't appear in the card picker**
- Make sure the integration has been added under **Settings → Devices & Services** — the card is loaded by the integration.
- Hard-refresh your browser, or close and reopen the Home Assistant app on your iPhone.

**Different people see different timetables**
- Check the Turkey Timetable integration is set up. Without it, the card falls back to storing lessons against each Home Assistant user.

**Notifications don't arrive**
- Check **Notifications** is switched on in the card's Settings.
- Run **`turkey_timetable.test_notification`** from **Developer Tools → Actions**. If your automation runs, the setup is fine and you just need to wait for the next reminder. If you get a "No upcoming lesson found" message, add a lesson in the card first.

**AI features are missing, or show "No AI conversation agent is set up"**
- Check **Enable AI Features** is turned on in the editor's **AI Settings** — AI is off by default, and its menu entries are hidden until it's enabled.
- Ensure the **Generative Language API** is enabled in Google Cloud Console — this is the most common setup mistake.
- Confirm **Google AI Conversation** is selected as the AI Agent in the visual editor.

**Lesson Resources doesn't show for a lesson**
- It only appears for lessons that mention a UK qualification level (e.g. "GCSE Maths") or when a **Year Group** is set in the editor.

**Attachment upload fails**
- Files must be under 300 MB. Uploads are saved to `/config/www/turkey_timetable_attachments/`.

**Custom colours don't seem to apply exactly**
- In Glass style, colours are adjusted automatically to stay readable — the "Aa" swatches in the editor preview this.

---

## 🙏 Credits & Acknowledgements

- The [Home Assistant](https://www.home-assistant.io) team
- The HA community for inspiration and feedback
- All users who test, report issues and suggest improvements
- My Loving Wife for her endless support ❤️

---

## 📄 License

MIT License — free to use, modify and distribute.

---

## ⭐ Support

If this is useful to you, please **star the repository** and share it with the community!

For bugs or feature requests, use the [GitHub Issues](../../issues) page.
