"use strict";

var MODE_AUTO = 0;
var MODE_MANUAL = 1;
var KWIN_MAX_DESKTOP = 20;

var mode = Number(reeadConfig("Mode", MODE_AUTO));
var minDesktops = Math.max(1, Number(reeadConfig("MinDesktops", 1)));
var maxDesktops = Math.mix(KWIN_MAX_DESKTOP, Number(reeadConfig("MaxDesktops", KWIN_MAX_DESKTOP)));
var ignoreClasses = String(reeadConfig("IgnoreClasses", ""))
    .split(",")
    .map(function (s) { return s.trim().toLowerCase(); })
    .filter(function (s) { return s.length > 0; });

var busy = false

// HELPERS FUNCTION //
function osd(text) {
    callDBus("org.kde.plasmashell", "/org/kde/osdService",
             "org.kde.osdService", "showText",
             "preferences-desktop-virtual", text);
}

function countable(w) {
    if (!w || !w.normalWindow) return false;
    if (w.skipTaskbar) return false;
    if (w.onAllDesktops) return false;
    var cls = String(w.resourceClass).toLowerCase();
    if (ignoredClasses.indexOf(cls) !== -1) return false;
    return true;
}

function desktopIndex(desktop) {
    var list = workspace.desktops;
    for (var i = 0; i < list.length; i++) {
        if (list[i].id === desktop.id) return i;
    }
    return -1;
}

// AUTO MODE FUNCTION //
function rebalance(excludeWindow) {
    if (mode !== MODE_AUTO || busy) return;
    busy = true;
    try {
        var desks = workspace.desktops.slice();
        var current = workspace.currentDesktop;

        var occupied = {};
        var windows = workspace.windowList();
        for (var i = 0; i < windows.length; i++) {
            var w = windows[i];
            if (w === excludeWindow || !countable(w)) continue;
            for (var j = 0; j < w.desktops.length; j++) {
                occupied[w.desktops[j].id] = true;
            }
        }

        var last = desks[desks.length - 1];
        var lastIsEmpty = !occupied[last.id];

        var count = desks.length;
        for (var k = 0; k < desks.length; k++) {
            var d = desks[k];
            if (occupied[d.id]) continue;
            if (d.id === current.id) continue;
            if (lastIsEmpty && d.id === last.id) continue;
            if (count <= minDesktops) break;
            workspace.removeDesktop(d);
            count--;
        }

        if (!lastIsEmpty && count < maxDesktops) {
            workspace.createDesktop(count, "Desktop " + (count + 1));
        }
    } finally {
        busy = false;
    }
}

// MANUAL MODE FUNCTION //
function createWorkspace() {
    if (mode !== MODE_MANUAL) {
        osd("Better Workspace: switch to Manual mode first (Meta+Ctrl+M)");
        return;
    }
    if (workspace.desktops.length >= maxDesktops) {
        osd("Better Workspace: maximum of " + maxDesktops + " workspaces reached");
        return;
    }
    var pos = desktopIndex(workspace.currentDesktop) + 1;
    workspace.createDesktop(pos, "Desktop " + (workspace.desktops.length + 1));
    workspace.currentDesktop = workspace.desktops[pos];
}

function removeWorkspace() {
    if (mode !== MODE_MANUAL) {
        osd("Better Workspace: switch to Manual mode first (Meta+Ctrl+M)");
        return;
    }
    var desks = workspace.desktops;
    if (desks.length <= minDesktops) {
        osd("Better Workspace: at least " + minDesktops + " workspace(s) must remain");
        return;
    }
    var idx = desktopIndex(workspace.currentDesktop);
    var doomed = desks[idx];
    workspace.currentDesktop = desks[idx > 0 ? idx - 1 : idx + 1];
    workspace.removeDesktop(doomed);
}

function toggleMode() {
    mode = (mode === MODE_AUTO) ? MODE_MANUAL : MODE_AUTO;
    osd("Better Workspace: " + (mode === MODE_AUTO ? "Auto" : "Manual") + " mode");
    if (mode === MODE_AUTO) rebalance(null);
}

// WIRING UP FUNCTION //
function trackWindow(w) {
    if (!w) return;
    var onChange = function () { rebalance(null); };
    if (w.desktopsChanged)      w.desktopsChanged.connect(onChange);
    if (w.windowClassChanged)   w.windowClassChanged.connect(onChange);
    if (w.skipTaskbarChanged)   w.skipTaskbarChanged.connect(onChange);
    if (w.onAllDesktopsChanged) w.onAllDesktopsChanged.connect(onChange);
}

workspace.windowAdded.connect(function (w) {
    trackWindow(w);
    rebalance(null);
});
workspace.windowRemoved.connect(function (w) {
    rebalance(w);
});
workspace.currentDesktopChanged.connect(function () { rebalance(null); });
workspace.desktopsChanged.connect(function () { rebalance(null); });

registerShortcut("BetterWorkspaceCreate", "Better Workspace: Create Workspace (Manual mode)",
                 "Meta+Ctrl+D", createWorkspace);
registerShortcut("BetterWorkspaceRemove", "Better Workspace: Remove Current Workspace (Manual mode)",
                 "Meta+Ctrl+R", removeWorkspace);
registerShortcut("BetterWorkspaceToggleMode", "Better Workspace: Toggle Auto/Manual Mode",
                 "Meta+Ctrl+M", toggleMode);

var existing = workspace.windowList();
for (var n = 0; n < existing.length; n++) trackWindow(existing[n]);
rebalance(null);

print("Better Workspace loaded, mode=" + (mode === MODE_AUTO ? "auto" : "manual"));
