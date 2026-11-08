# Coral Me Mine Café lobby

The static website stays on its existing host. The lobby runs as a separate Cloudflare Worker and creates a fresh Excalidraw room for each pair. The two-minute timer starts when both players are ready. The drawing stays open in Excalidraw when time expires.

## Test locally

From the project folder, open two terminals and run one command in each.

```text
npx wrangler dev --config lobby/wrangler.toml --port 8787
npx http-server . -p 8000
```

Open `http://127.0.0.1:8000` in two browser windows. Enter the café from the shipwreck and click **Find a partner** in both windows. To test actual collaboration, use separate browser profiles or devices and open the shared canvas in each. Return to the café and click **I'm ready** in both windows. Both clocks should begin at 2:00.

## Put the lobby online

1. In `lobby/wrangler.toml`, set `ALLOWED_ORIGINS` to your published site's origin if it differs from the default. Use the scheme and hostname only, without the repository path.
2. From the project folder, run `npx wrangler login` and then `npx wrangler deploy --config lobby/wrangler.toml`.
3. Copy the Worker URL printed by Wrangler. In `index.html`, set `data-lobby-url` on `#cafe-scene` to that URL with `https://` changed to `wss://` and `/cafe-lobby` appended. For example, `wss://coral-me-mine-lobby.example.workers.dev/cafe-lobby`.
4. Publish the updated site as usual and test from two browser profiles.
