# Followers API

This document describes the followers table and the user-facing API for following and unfollowing users. In Musee, artists are a type of user, so following artists uses the same follower mechanism.

## Table schema

PostgreSQL table (managed in Supabase):

```
create table public.followers (
  follower_id uuid not null,
  following_id uuid not null,
  created_at timestamp without time zone null default now(),
  constraint followers_pkey primary key (follower_id, following_id),
  constraint followers_follower_id_fkey foreign key (follower_id) references users (user_id) on update cascade on delete cascade,
  constraint followers_following_id_fkey foreign key (following_id) references users (user_id) on update cascade on delete cascade
);
```

Notes:
- Composite primary key enforces uniqueness (a user can follow another user once).
- On delete cascade cleans up relations if either user is deleted.
- The `users` table maintains counters: `followers_count` and `followings_count`, which are recalculated on follow/unfollow.

## Authentication

All endpoints are under `/api/user` and require a valid Bearer token. The server uses Supabase Auth to validate the access token.

## Endpoints

Base path: `/api/user/follows`

- Follow a user
  - Method: POST
  - Path: `/:id`
  - Description: Authenticated user follows the target user `id`.
  - Responses:
    - 200: `{ ok: true, message: "Following" }`
    - 400: Cannot follow yourself
    - 404: Target user not found

- Unfollow a user
  - Method: DELETE
  - Path: `/:id`
  - Description: Authenticated user unfollows the target user `id`.
  - Responses:
    - 200: `{ ok: true, message: "Unfollowed" }`

- Check follow status
  - Method: GET
  - Path: `/status/:id`
  - Description: Returns whether the authenticated user follows `id`.
  - Response: `{ following: boolean }`

- List my followers
  - Method: GET
  - Path: `/followers`
  - Query:
    - `limit` (default 20, max 100)
    - `page` (zero-based index)
  - Response: `{ items: [{ user_id, name, avatar_url }...], total, page, limit }`

- List who I follow
  - Method: GET
  - Path: `/following`
  - Query:
    - `limit` (default 20, max 100)
    - `page` (zero-based index)
    - `type` (optional) — when `type=artist`, the list is filtered to users with `user_type === 'artist'` for recommendations use.
  - Response: `{ items: [{ user_id, name, avatar_url, user_type }...], total, page, limit }`

## Behavior and constraints

- Idempotency: Following an already-followed user returns success without duplication. Unfollowing a non-existent follow also returns success.
- Self-follow is not allowed and returns 400.
- Counters: After follow/unfollow, both users have `followers_count`/`followings_count` recalculated.
- Sorting: Lists are ordered by relation `created_at` descending.

## Usage examples

Follow a user (id = `TARGET_UUID`):
- Request: `POST /api/user/follows/TARGET_UUID`
- Response: `{ ok: true, message: "Following" }`

Unfollow a user:
- Request: `DELETE /api/user/follows/TARGET_UUID`
- Response: `{ ok: true, message: "Unfollowed" }`

Check status:
- Request: `GET /api/user/follows/status/TARGET_UUID`
- Response: `{ following: true | false }`

List followers:
- Request: `GET /api/user/follows/followers?limit=20&page=0`
- Response: `{ items: [...], total: 123, page: 0, limit: 20 }`

List following (artists only):
- Request: `GET /api/user/follows/following?limit=20&page=0&type=artist`
- Response: `{ items: [...], total: 42, page: 0, limit: 20 }`

## Recommendations note

To recommend tracks from artists a user follows, fetch `GET /api/user/follows/following?type=artist`, then use those artist user IDs to drive your track queries.