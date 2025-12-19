import { mount } from "./render/mount.js";
import { renderLayout } from "./ui/layout.js";

const root = document.getElementById("app");
mount(root, renderLayout());

// Nota: PR0 no hace nada más. No routing. No storage. No API.
