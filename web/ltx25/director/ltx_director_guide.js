// SPDX-License-Identifier: GPL-3.0-only
// Derived from LTX-2.5-Director by CGlide (https://github.com/CGlide/LTX-2.5-Director, GPL-3.0),
// itself a fork of WhatDreamsCost's LTX Director (https://github.com/WhatDreamsCost/WhatDreamsCost-ComfyUI, GPL-3.0).
// Modified for TJ NODE STUDIO ONE: node keys CS25 -> TJ25, routes /ltx_director* -> /ltx25_one/director/*, upload folder renamed.
// GPL-3.0 only: do NOT copy this file into the web project (see PORT_LEDGER).
const { app } = window.comfyAPI.app;

// LTX Director Guide is a pure pass-through processor node.
// All configuration (images, insert frames, strengths) comes from
// the guide_data output of Prompt Relay Encode (Timeline).
app.registerExtension({
    name: "Comfy.LTXDirectorGuideTJ25",
    async nodeCreated(node) {
        if (node.comfyClass !== "LTXDirectorGuideTJ25") return;

        // Hide retake_mode widget on LiteGraph as it is dynamically auto-detected from the timeline data.
        const w = node.widgets?.find(x => x.name === "retake_mode");
        if (w) {
            w.hidden = true;
            if (!w.options) w.options = {};
            w.options.hidden = true;
            if (!window.LiteGraph || !window.LiteGraph.vueNodesMode) {
                w.computeSize = () => [0, -4];
                w.draw = () => { };
            }
            if (w.element) w.element.style.display = "none";
        }
    },
});