import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
    modules: ["@wxt-dev/module-react"],
    manifest: {
        name: "Subtext - YouTube Subtitle Viewer",
        description:
            "✨ Get AI summaries, timelines, and articles from any YouTube video. Search transcripts, translate subtitles, and take notes — all in one!",
        version: "0.1.0",
        permissions: ["storage", "activeTab", "cookies"],
        host_permissions: [
            "*://*.youtube.com/*",
            "*://*.googlevideo.com/*",
            "*://inv.nadeko.net/*",
            "*://invidious.nerdvpn.de/*",
            "*://iv.ggtyler.dev/*",
            "*://invidious.privacyredirect.com/*",
            "*://vid.puffyan.us/*",
            "*://*.workers.dev/*",
        ],
        action: {},
        web_accessible_resources: [
            {
                resources: ["transcript-extractor.js"],
                matches: ["*://*.youtube.com/*"],
            },
        ],
    },
    vite: () => ({
        plugins: [tailwindcss()],
    }),
});
