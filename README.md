# LTAD 2026 — Live Lung Word Mosaic

Frontend prototype for the **Lung Transplant Awareness Day 2026** campaign on
[lungtransplantawarenessday.org](https://lungtransplantawarenessday.org/).

The final product will be a custom WordPress plugin. This repository currently
contains the standalone frontend used to validate the visual design and
word-cloud behavior before the WordPress integration is built.

## Campaign concept

On October 9, visitors will be invited to answer:

> **What is the one word you hold onto today?**

Each visitor will submit a single word of up to 20 characters. Approved words
will build a live word cloud inside a lung silhouette. Duplicate words will not
be drawn separately; their frequency will increase their visual size, similar
to a traditional WordPress tag cloud.

## What this prototype demonstrates

- The lung-shaped word-cloud layout.
- Word sizing based on submission frequency.
- A visual empty state before the first contribution.
- Manual submissions within the current browser session.
- Simulated incoming submissions for testing how the wall changes over time.
- Crossfades and re-layouts as words are added.
- Sample data for design review.

This prototype is intentionally frontend-only. It does not connect to
WordPress, a database, or other visitors' browser sessions.

## Prototype testing controls

The interface includes two controls intended only for development and client
review:

- **Start empty / Load sample data** resets the wall or restores the sample
  dataset.
- **Pause / Resume live submissions** controls a local simulation that adds a
  sample word approximately every seven seconds.

The simulated submissions are not real network activity and do not represent
contributions from other visitors.

The prototype can also be started with query parameters:

| Parameter | Behavior |
| --- | --- |
| `?empty=1` | Starts with no submitted words. |
| `?demo=0` | Disables simulated incoming submissions. |
| `?empty=1&demo=0` | Starts empty with simulation disabled. |

## Run locally

The project is a static site with no build step or package installation.
Because it uses JavaScript modules, it must be opened through a local web
server rather than by double-clicking `index.html`.

```bash
cd /path/to/ltad-word-mosaic
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

To test the empty state without simulated submissions:

```text
http://localhost:8000/?empty=1&demo=0
```

## Current validation

The frontend currently accepts a submission when it:

- Contains exactly one word.
- Contains no more than 20 characters.
- Uses letters, numbers, apostrophes, or hyphens.

This is input-format validation only. Content moderation is not implemented in
the prototype.

## Not implemented yet

The following requirements belong to the WordPress plugin phase and are not
present in this repository yet:

- WordPress plugin packaging and integration.
- Persistent storage of submissions.
- Synchronization between visitors.
- Real-time delivery of approved submissions.
- Automatic filtering with the client-provided negative-word list.
- Moderation workflow.
- A limit of approximately one contribution per visitor per hour.
- Automatic opening and closing of contributions on October 9.
- WordPress security controls, including nonces and API validation.
- Administrative review and contribution export, pending final client
  confirmation.

The production interface must not claim that submissions are moderated in real
time until moderation and negative-word filtering are connected.

## Planned WordPress architecture

The existing renderer and visual interface will be retained. The plugin phase
will add the WordPress-specific application layer around them:

1. A shortcode or block for placing the experience on the campaign page.
2. A WordPress REST endpoint for accepting validated submissions.
3. Persistent storage and aggregation of duplicate words.
4. Negative-word filtering and any required moderation workflow.
5. Rate limiting and abuse protection.
6. Polling, Server-Sent Events, or another suitable mechanism for live updates.
7. Campaign-date controls based on the site's configured timezone.
8. An optional administrative screen and export workflow.

The final approach may change after the remaining administrative requirements
are confirmed with the client.

## Project structure

```text
index.html                  Prototype page and interface
assets/
  lung-mask.png             Lung silhouette mask used by the renderer
src/
  app.js                    UI controller and prototype simulation
  styles.css                Visual styling
  mosaic-renderer.js        Lung-mask rendering and word-cloud layout
  word-store.js             In-memory counts and input-format validation
  instances.js              Frequency data to drawable word instances
  palette.js                Word color tiers
  seed-data.js              Sample data and simulated-submission pool
```

## Rendering approach

`assets/lung-mask.png` is opaque outside the lungs and transparent inside them.
The renderer applies the mask before running wordcloud2, keeping words inside
the lung silhouette and away from the central gap.

Word sizes are relative to frequency. Repeated submissions increase the count
of one normalized entry instead of producing duplicate entries. Additional
smaller instances help maintain visual density, while a light placeholder layer
keeps the lungs recognizable when the wall contains few or no contributions.

## Credits

Word layout is powered by
[wordcloud2.js](https://github.com/timdream/wordcloud2.js). The Archivo typeface,
lung silhouette, visual reference, and campaign branding were supplied for the
project.
