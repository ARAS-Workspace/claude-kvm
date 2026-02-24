"use strict";

/** Toggles between dark and light theme, persists choice to localStorage. */
function toggleTheme() {
    /** @type {HTMLElement} */
    const html = document.documentElement;
    /** @type {string | null} */
    const current = html.getAttribute("data-theme");
    /** @type {"dark" | "light"} */
    const next = current === "dark" ? "light" : "dark";
    html.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
}

/** Initialises theme from localStorage or system preference. */
(function initTheme() {
    /** @type {string | null} */
    const saved = localStorage.getItem("theme");
    if (saved) {
        document.documentElement.setAttribute("data-theme", saved);
    } else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
        document.documentElement.setAttribute("data-theme", "light");
    }
})();