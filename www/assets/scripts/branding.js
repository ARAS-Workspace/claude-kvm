"use strict";

/** @type {string} */
const ASCII_ART = `
 █████╗ ██████╗  █████╗ ███████╗
██╔══██╗██╔══██╗██╔══██╗██╔════╝
███████║██████╔╝███████║███████╗
██╔══██║██╔══██╗██╔══██║╚════██║
██║  ██║██║  ██║██║  ██║███████║
╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝
`;

/** @type {string} */
const COPYRIGHT = "Copyright (C) 2026 Rıza Emre ARAS <r.emrearas@proton.me>";

/** Prints ASCII logo to the browser console. */
function printConsoleBranding() {
    console.log(`%c${ASCII_ART}`, "color: #d4845a; font-family: monospace; font-weight: bold;");
    console.log("%cRemote Access, Artificial Intelligence", "color: #737373; font-family: monospace; font-size: 11px;");
    console.log(`%c${COPYRIGHT}`, "color: #525252; font-family: monospace; font-size: 11px;");
}

printConsoleBranding();