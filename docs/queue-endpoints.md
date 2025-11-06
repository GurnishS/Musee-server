# User Queue API

Base path: `/api/user/queue` (requires user auth)

Redis-backed per-user playback queue, stored as a Redis list at key `user:queue:<userId>`.

## Endpoints

### GET /api/user/queue
Fetch current queue for the authenticated user.

Behavior:
- Server will auto-top-up the queue to a minimum of 10 tracks if it has fewer items, filling with random published tracks (placeholder until recommendations are built).

Query:
- `expand=1` optional — when set, returns track details instead of just IDs.

Response:
```
{ items: [string | Track], total: number }
```

### POST /api/user/queue/add
Append one or more tracks to the end of the queue.

Body:
```
{ "track_id": "uuid" }
# or
{ "track_ids": ["uuid", "uuid", ...] }
```

Response:
```
{ ok: true, total: number }
```

### DELETE /api/user/queue/:track_id
Remove the first occurrence of a track from the queue.

Behavior:
- After removal, the server auto-top-ups to maintain at least 10 tracks, if possible.

Response:
```
{ ok: true, removed: number }
```

### POST /api/user/queue/reorder
Move a track from one index to another within the queue.

Body:
```
{ "fromIndex": number, "toIndex": number }
```

Response:
```
{ ok: true, items: [string] }
```

### POST /api/user/queue/clear
Clear the queue.

Response:
```
{ ok: true }
```

### POST /api/user/queue/play
Reset the queue to the selected track followed by 10 auto-generated tracks.

Body:
```
{ "track_id": "uuid" }
```

Query:
- `expand=1` optional — when set, returns track details for the new queue.

Response:
```
{ items: [string | Track], total: number }
```

Behavior:
- After seeding [clicked + 10], the server ensures the queue still has at least 10 items (in case of duplicates or limited catalog).

Notes:
- Auto-generation uses a simple random-offset selection of published tracks as placeholders.
- Track details include: `track_id, title, duration, created_at, hls { master, variants[] }, artists[]`.
- The minimum-10 behavior is applied on GET, DELETE, and PLAY endpoints.

## Redis configuration

Set either `REDIS_URL` (recommended) or these vars:
- `REDIS_HOST` (default: 127.0.0.1)
- `REDIS_PORT` (default: 6379)
- `REDIS_PASSWORD` (optional)

Docker example (compose):
```
services:
  redis:
    image: redis:7
    ports:
      - "6379:6379"
```

In `.env`:
```
REDIS_URL=redis://localhost:6379
```
