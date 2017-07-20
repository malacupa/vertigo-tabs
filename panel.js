const $create = document.createElement.bind(document)

document.addEventListener("contextmenu", event => event.preventDefault())
const $container = document.querySelector("#tabs")
var window_id;
var loaded = {}
var current_tab_id = null
//var tabs = []
var tabs_by_id = {}
var detached_tabs = {}   // maps which detached tab refers to which real tab
var probable_parents = {}

function on_tab_click(e) {
    id = parseInt(this.dataset.id)
    browser.tabs.update(id, {active: true}).then((tab) => {
        //console.log("click on tab", tab)
    })
}

function create_li(tab) {
    var li = $create("li")

    li.dataset.id = tab.id
    tabs_by_id[tab.id] = li

    li.className = "tab"
    if (tab.highlighted) {
        li.classList.add("highlighted")
        loaded[tab.id] = true
    }
    if (loaded[tab.id]) {
        li.classList.add("loaded")
    }
    if (tab.active) {
        current_tab_id = tab.id
    }

    var favicon = $create("div")
    favicon.className = "favicon"
    var img = $create("img")
    if (tab.favIconUrl) {
        img.src = tab.favIconUrl
        img.onerror = () => {
            favicon.classList.add("no-favicon")
        }
    } else {
        favicon.classList.add("no-favicon")
    }
    favicon.appendChild(img)
    li.appendChild(favicon)

    var title = $create("span")
    title.textContent = tab.title
    li.appendChild(title)
    li.addEventListener("click", on_tab_click)
    return li
}

function fill_content() {
    browser.tabs.query({windowId: window_id}).then((window_tabs) => {
        $container.textContent = ""
        //tabs = []
        tabs_by_id = {}
        window_tabs.forEach((tab, i) => {
            var li = create_li(tab)
            $container.appendChild(li)
            //tabs.push(li)
        })
    })
}

function on_remove_tab(tabId, windowInfo) {
    if (window_id != windowInfo.windowId) {
        return
    }
    //console.info("on_remove_tab", current_tab_id, tabId)
    if (current_tab_id == tabId) {
        current_tab_id = null
    }
    var $tab = tabs_by_id[tabId]
    if (!$tab && detached_tabs[tabId]) {
        // tab isn't in the list because it's detached, remove its linked tab
        $tab = tabs_by_id[detached_tabs[tabId]]
    }
    $tab.remove()
    delete tabs_by_id[tabId]
}

function on_update_tab(tabId, changes, state) {
    if (window_id != state.windowId) {
        return  // doesn't concert this window
    }

    var $tab = tabs_by_id[tabId]
    if (!$tab) {
        //console.error("Tab hasn't been created yet? on_update_tab can't proceed")
        return  // nothing we can do, tab hasn't been created yet
    }
    favicon = $tab.children[0]
    if (changes.status == "loading") {
        favicon.children[0].src = "loading.png"
        favicon.classList.remove("no-favicon")
    }
    if (changes.title) {
        $tab.children[1].textContent = changes.title
    }
    if (changes.status == "complete") {
        if (state.favIconUrl) {
            favicon.children[0].src = state.favIconUrl
        } else {
            favicon.classList.add("no-favicon")
        }
    }
}

function insert_tab_at(index, tab) {
    var $tabs = $container.querySelectorAll(".tab")
    $container.insertBefore(tab, $tabs[index])
}

function on_create_tab(tab) {
    if (window_id != tab.windowId) {
        return
    }
    probable_parents[tab.id] = current_tab_id
    //console.info("on_create_tab", tab)
    if (tab.highlighted) {
        unhighlight_current_tab()
    }
    loaded[tab.id] = true
    var li = create_li(tab)
    insert_tab_at(tab.index, li)
    tabs_by_id[tab.id] = li
}

function on_moved_tab(tabId, opts) {
    var $tab = tabs_by_id[tabId]
    var new_index = opts.toIndex
    if (opts.fromIndex < new_index) {
        new_index += 1
    }
    insert_tab_at(new_index, $tab)
}

function unhighlight_current_tab() {
    if (current_tab_id) {
        //console.info("unhighlight_current_tab", current_tab_id)
        var $tab = tabs_by_id[current_tab_id]
        $tab.classList.remove("highlighted")
    }
}

function change_current_tab(active_info) {
    if (window_id != active_info.windowId) {
        return
    }

    let new_current_id = active_info.tabId
    loaded[new_current_id] = true

    if (detached_tabs[new_current_id]) {
        new_current_id = detached_tabs[new_current_id]
    }

    // current active tab
    var $tab = tabs_by_id[new_current_id]
    if (!$tab) {
        //console.error("ABORT change_current_tab")
        //console.info("new:", new_current_id, tabs_by_id[new_current_id])
        //console.info("old:", current_tab_id, tabs_by_id[current_tab_id])
        return  // abort, maybe a tab detached or something
    }

    // previous active tab
    unhighlight_current_tab()

    $tab.classList.add("highlighted")
    $tab.classList.add("loaded")

    current_tab_id = new_current_id
}

function on_detach_tab(tabId, opts) {
    if (opts.oldWindowId != window_id) {
        return  // doesn't concern this window
    }
    //console.info("on_detach_tab", tabId, opts)
    var $tabs = $container.querySelectorAll(".tab")
    li = $tabs[opts.oldPosition]
    tabs_by_id[tabId] = li
    if (li) {
        $container.removeChild(li) // li might not have been inserted
    }

    // last tab switched to is probably the current one
    var probable_parent = probable_parents[tabId]
    if (detached_tabs[tabId]) {
        probable_parent = detached_tabs[tabId]
    }
    if (!probable_parent) {
        // no new tab has been created, so current tab is best heuristic
        probable_parent = current_tab_id
    }
    detached_tabs[tabId] = probable_parent
    //console.log("PROBABLE PARENT USED:", probable_parent)
}

function attach_logger(event_prop) {
    function listener(arg1, arg2, arg3) {
        console.debug(event_prop, arg1, arg2, arg3)
    }
    browser.tabs[event_prop].addListener(listener)
}

const to_log = [
    "onActivated", "onAttached", "onCreated",
    "onDetached", "onMoved", "onReplaced", "onRemoved",
    "onUpdated", "onZoomChange"
    //"onHighlighted",
]
//to_log.forEach(attach_logger)


browser.tabs.onUpdated.addListener(on_update_tab)

browser.tabs.onActivated.addListener(change_current_tab)
browser.tabs.onRemoved.addListener(on_remove_tab)

browser.tabs.onCreated.addListener(on_create_tab)

browser.tabs.onMoved.addListener(on_moved_tab)

browser.tabs.onDetached.addListener(on_detach_tab)
//browser.tabs.onAttached.addListener(on_detach_tab)

browser.windows.getCurrent().then((window_info) => {
    window_id = window_info.id
    fill_content()
})
