const viewdata = JSON.parse(window.atob("@@data@@"));

// Jellyfin may start more than one bitrate detection at the same time. When
// the server is behind a proxy, duplicate BitrateTest downloads can serialize
// and leave playback/navigation waiting for a request that never reaches the
// web client's nominal timeout. Coalesce identical tests and briefly reuse
// their completed response while preserving the measured network speed.
let fetchDelegate = window.fetch.bind(window);
const bitrateTestCache = new Map();
const bitrateTestRequests = new Map();
const bitrateTestCacheLifetime = 60 * 1000;

function bitrateTestResponse(snapshot) {
    return new Response(snapshot.body.slice(0), {
        status: snapshot.status,
        statusText: snapshot.statusText,
        headers: snapshot.headers
    });
}

function guardedFetch(input, init) {
    const url = typeof input === 'string' ? input : input && input.url;
    if (!url || !/\/Playback\/BitrateTest(?:\?|$)/.test(url)) {
        return fetchDelegate(input, init);
    }

    const cached = bitrateTestCache.get(url);
    if (cached && Date.now() - cached.completedAt < bitrateTestCacheLifetime) {
        return Promise.resolve(bitrateTestResponse(cached));
    }

    let request = bitrateTestRequests.get(url);
    if (!request) {
        request = fetchDelegate(input, init).then(async response => {
            const snapshot = {
                body: await response.arrayBuffer(),
                status: response.status,
                statusText: response.statusText,
                headers: Array.from(response.headers.entries()),
                completedAt: Date.now()
            };
            bitrateTestCache.set(url, snapshot);
            return snapshot;
        }).finally(() => bitrateTestRequests.delete(url));
        bitrateTestRequests.set(url, request);
    }

    return request.then(bitrateTestResponse);
}

window.fetch = guardedFetch;

// The web client can start two complete detectBitrate() chains during startup.
// They use separate request contexts, so coalescing window.fetch alone does not
// cover both of them. Patch the active ApiClient as soon as it is published and
// share one result across callers. The web client already stores the result for
// an hour; this short cache also covers callers that explicitly force a retest.
const bitrateDetectionCacheLifetime = 60 * 1000;
const bitrateDetectionTimeout = 6 * 1000;
const fallbackBitrate = 10 * 1000 * 1000;

function patchBitrateDetection(apiClient) {
    if (!apiClient || apiClient.__nativeBitrateDetectionPatched ||
        typeof apiClient.detectBitrate !== 'function') {
        return;
    }

    const detectBitrate = apiClient.detectBitrate.bind(apiClient);
    let request;
    let result;
    let completedAt = 0;

    apiClient.detectBitrate = function(force) {
        if (result !== undefined &&
            Date.now() - completedAt < bitrateDetectionCacheLifetime) {
            return Promise.resolve(result);
        }

        if (!request) {
            const detection = Promise.resolve(detectBitrate(force));
            const boundedDetection = new Promise((resolve, reject) => {
                let settled = false;
                const timer = window.setTimeout(() => {
                    if (!settled) {
                        settled = true;
                        resolve(apiClient.lastDetectedBitrate || fallbackBitrate);
                    }
                }, bitrateDetectionTimeout);

                detection.then(value => {
                    if (!settled) {
                        settled = true;
                        window.clearTimeout(timer);
                        resolve(value);
                    }
                }, error => {
                    if (!settled) {
                        settled = true;
                        window.clearTimeout(timer);
                        reject(error);
                    }
                });
            });

            request = boundedDetection.then(value => {
                result = value;
                completedAt = Date.now();
                return value;
            }).finally(() => {
                request = null;
            });
        }

        return request;
    };

    Object.defineProperty(apiClient, '__nativeBitrateDetectionPatched', {
        value: true
    });
}

function installPerformanceGuards() {
    // The web client's fetch polyfill and ApiClient global are installed after
    // DocumentCreation, so take the final fetch implementation as our delegate
    // and patch the client once it exists.
    if (window.fetch !== guardedFetch) {
        fetchDelegate = window.fetch.bind(window);
        window.fetch = guardedFetch;
    }

    patchBitrateDetection(window.ApiClient);
    return !!(window.ApiClient &&
        window.ApiClient.__nativeBitrateDetectionPatched);
}

document.addEventListener('DOMContentLoaded', installPerformanceGuards);
window.addEventListener('load', installPerformanceGuards);

const performanceGuardTimer = window.setInterval(() => {
    if (installPerformanceGuards()) {
        window.clearInterval(performanceGuardTimer);
    }
}, 250);

const features = [
    "filedownload",
    "displaylanguage",
    "htmlaudioautoplay",
    "htmlvideoautoplay",
    "externallinks",
    "clientsettings",
    "multiserver",
    "remotecontrol",
    "fullscreenchange",
    "filedownload",
    "remotevideo",
    "displaymode",
    "screensaver",
    "fileinput"
];

const plugins = [
    'mpvVideoPlayer',
    'mpvAudioPlayer',
    'jmpInputPlugin'
];

// Native extension files are tiny and can change independently of the bundled
// web client. Use a per-launch URL so an old service-worker cache cannot keep
// running a player implementation from a previous app version.
const extensionCacheToken = Date.now().toString(36);

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

// Add plugin loaders
for (const plugin of plugins) {
    window[plugin] = async () => {
        await loadScript(`${viewdata.scriptPath}${plugin}.js?v=${extensionCacheToken}`);
        return window["_" + plugin];
    };
}

window.NativeShell = {
    openUrl(url, target) {
        window.api.system.openExternalUrl(url);
    },

    downloadFile(downloadInfo) {
        window.api.system.openExternalUrl(downloadInfo.url);
    },

    openClientSettings() {
        showSettingsModal();
    },

    getPlugins() {
        return plugins;
    }
};

function getDeviceProfile() {
    return {
        'Name': 'MacJMP',
        'MusicStreamingTranscodingBitrate': 1280000,
        'TimelineOffsetSeconds': 5,
        'TranscodingProfiles': [
            {'Type': 'Audio'},
            {
                'Container': 'ts',
                'Type': 'Video',
                'Protocol': 'hls',
                'AudioCodec': 'aac,mp3,ac3,opus,flac,vorbis',
                'VideoCodec': 'h264,h265,hevc,mpeg4,mpeg2video',
                'MaxAudioChannels': '6'
            },
            {'Container': 'jpeg', 'Type': 'Photo'}
        ],
        'DirectPlayProfiles': [{'Type': 'Video'}, {'Type': 'Audio'}, {'Type': 'Photo'}],
        'ResponseProfiles': [],
        'ContainerProfiles': [],
        'CodecProfiles': [],
        'SubtitleProfiles': [
            {'Format': 'srt', 'Method': 'External'},
            {'Format': 'srt', 'Method': 'Embed'},
            {'Format': 'ass', 'Method': 'External'},
            {'Format': 'ass', 'Method': 'Embed'},
            {'Format': 'sub', 'Method': 'Embed'},
            {'Format': 'sub', 'Method': 'External'},
            {'Format': 'ssa', 'Method': 'Embed'},
            {'Format': 'ssa', 'Method': 'External'},
            {'Format': 'smi', 'Method': 'Embed'},
            {'Format': 'smi', 'Method': 'External'},
            {'Format': 'pgssub', 'Method': 'Embed'},
            {'Format': 'dvdsub', 'Method': 'Embed'},
            {'Format': 'pgs', 'Method': 'Embed'}
        ]
    };
}

async function createApi() {
    await loadScript('qrc:///qtwebchannel/qwebchannel.js');
    const channel = await new Promise((resolve) => {
        /*global QWebChannel */
        new QWebChannel(window.qt.webChannelTransport, resolve);
    });
    return channel.objects;
}

window.NativeShell.AppHost = {
    init() {
        window.apiPromise = createApi();
        (async () => {
            window.api = await window.apiPromise;
        })();
    },
    getDefaultLayout() {
        return viewdata.mode;
    },
    supports(command) {
        return features.includes(command.toLowerCase());
    },
    getDeviceProfile,
    getSyncProfile: getDeviceProfile,
    appName() {
        return "MacJMP";
    },
    appVersion() {
        return navigator.userAgent.split(" ")[1];
    },
    deviceName() {
        return viewdata.deviceName;
    }
};

async function showSettingsModal() {
    let settings = await new Promise(resolve => {
        window.api.settings.settingDescriptions(resolve);
    });

    const modalContainer = document.createElement("div");
    modalContainer.className = "dialogContainer";
    modalContainer.style.backgroundColor = "rgba(0,0,0,0.5)";
    modalContainer.addEventListener("click", e => {
        if (e.target == modalContainer) {
            modalContainer.remove();
        }
    });
    document.body.appendChild(modalContainer);

    const modalContainer2 = document.createElement("div");
    modalContainer2.className = "focuscontainer dialog dialog-fixedSize dialog-small formDialog opened";
    modalContainer.appendChild(modalContainer2);

    const modalHeader = document.createElement("div");
    modalHeader.className = "formDialogHeader";
    modalContainer2.appendChild(modalHeader);

    const title = document.createElement("h3");
    title.className = "formDialogHeaderTitle";
    title.textContent = "MacJMP Settings";
    modalHeader.appendChild(title);
    
    const modalContents = document.createElement("div");
    modalContents.className = "formDialogContent smoothScrollY";
    modalContents.style.paddingTop = "2em";
    modalContents.style.paddingBottom = "10em";
    modalContainer2.appendChild(modalContents);
    
    for (let section of settings) {
        const group = document.createElement("fieldset");
        group.className = "editItemMetadataForm editMetadataForm dialog-content-centered";
        group.style.border = 0;
        group.style.outline = 0;
        modalContents.appendChild(group);

        const createSection = async (clear) => {
            if (clear) {
                group.innerHTML = "";
            }

            const values = await new Promise(resolve => {
                window.api.settings.allValues(section.key, resolve);
            });

            const legend = document.createElement("legend");
            const legendHeader = document.createElement("h2");
            legendHeader.textContent = section.key;
            legendHeader.style.textTransform = "capitalize";
            legend.appendChild(legendHeader);
            group.appendChild(legend);

            for (const setting of section.settings) {
                const label = document.createElement("label");
                label.className = "inputContainer";
                label.style.marginBottom = "1.8em";
                label.style.display = "block";
                label.style.textTransform = "capitalize";
                if (setting.options) {
                    const safeValues = {};
                    const control = document.createElement("select");
                    control.className = "emby-select-withcolor emby-select";
                    for (const option of setting.options) {
                        safeValues[String(option.value)] = option.value;
                        const opt = document.createElement("option");
                        opt.value = option.value;
                        opt.selected = option.value == values[setting.key];
                        let optionName = option.title;
                        const swTest = `${section.key}.${setting.key}.`;
                        const swTest2 = `${section.key}.`;
                        if (optionName.startsWith(swTest)) {
                            optionName = optionName.substring(swTest.length);
                        } else if (optionName.startsWith(swTest2)) {
                            optionName = optionName.substring(swTest2.length);
                        }
                        opt.appendChild(document.createTextNode(optionName));
                        control.appendChild(opt);
                    }
                    control.addEventListener("change", async (e) => {
                        await new Promise(resolve => {
                            window.api.settings.setValue(section.key, setting.key, safeValues[e.target.value], resolve);
                        });

                        if (setting.key == "devicetype") {
                            section = (await new Promise(resolve => {
                                window.api.settings.settingDescriptions(resolve);
                            })).filter(x => x.key == section.key)[0];
                            createSection(true);
                        }
                    });
                    const labelText = document.createElement('label');
                    labelText.className = "inputLabel";
                    labelText.textContent = setting.key + ": ";
                    label.appendChild(labelText);
                    label.appendChild(control);
                } else {
                    const control = document.createElement("input");
                    control.type = "checkbox";
                    control.checked = values[setting.key];
                    control.addEventListener("change", e => {
                        window.api.settings.setValue(section.key, setting.key, e.target.checked);
                    });
                    label.appendChild(control);
                    label.appendChild(document.createTextNode(" " + setting.key));
                }
                group.appendChild(label);
            }
        };
        createSection();
    }

    const closeContainer = document.createElement("div");
    closeContainer.className = "formDialogFooter";
    modalContents.appendChild(closeContainer);

    const close = document.createElement("button");
    close.className = "raised button-cancel block btnCancel formDialogFooterItem emby-button";
    close.textContent = "Close"
    close.addEventListener("click", () => {
        modalContainer.remove();
    });
    closeContainer.appendChild(close);
}
