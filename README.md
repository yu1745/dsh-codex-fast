# Codex Fast

Open the model selector in a Codex conversation and choose **Normal** or **Fast** under **Codex speed**. Fast requests the priority service tier on subsequent requests. The upstream provider decides whether to honor it.

The choice is stored per conversation. New child conversations inherit it. `/fast` toggles Fast, and `/ultrafast` preserves the legacy command. The two-option control shows a legacy UltraFast choice as Fast until you switch back to Normal.

This standalone bundle replaces the `yu-codex-fast` entry of the legacy DSH Extensions bundle. When migrating, remove the legacy speed entry and its composer control to avoid registering the same commands twice. Existing per-conversation settings are preserved.

Compatible with DSH `0.2.2-rc.3`. Build with `npm ci --ignore-scripts` and `npm run build`. Run tests with `npm test`.
