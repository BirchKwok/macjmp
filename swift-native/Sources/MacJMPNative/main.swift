import AppKit
import WebKit

private enum MacJMPDefaults {
    static let serverURL = "serverURL"
}

let application = NSApplication.shared
let applicationDelegate = ApplicationDelegate()
application.delegate = applicationDelegate
application.setActivationPolicy(.regular)
application.run()

final class ApplicationDelegate: NSObject, NSApplicationDelegate {
    private var browserWindowController: BrowserWindowController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let controller = BrowserWindowController()
        browserWindowController = controller
        installMainMenu(for: controller)
        controller.showWindow(nil)
        controller.openInitialServer()
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    private func installMainMenu(for controller: BrowserWindowController) {
        let mainMenu = NSMenu()

        let appMenuItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About MacJMP", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit MacJMP", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appMenuItem.submenu = appMenu
        mainMenu.addItem(appMenuItem)

        let navigationMenuItem = NSMenuItem()
        let navigationMenu = NSMenu(title: "Navigation")
        navigationMenu.addItem(targeting: controller, title: "Connect to Server…", action: #selector(BrowserWindowController.chooseServer), keyEquivalent: "l")
        navigationMenu.addItem(targeting: controller, title: "Back", action: #selector(BrowserWindowController.goBack), keyEquivalent: "[")
        navigationMenu.addItem(targeting: controller, title: "Forward", action: #selector(BrowserWindowController.goForward), keyEquivalent: "]")
        navigationMenu.addItem(targeting: controller, title: "Reload", action: #selector(BrowserWindowController.reload), keyEquivalent: "r")
        navigationMenuItem.submenu = navigationMenu
        mainMenu.addItem(navigationMenuItem)

        let windowMenuItem = NSMenuItem()
        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(withTitle: "Toggle Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f").keyEquivalentModifierMask = [.command, .control]
        windowMenuItem.submenu = windowMenu
        mainMenu.addItem(windowMenuItem)
        NSApplication.shared.windowsMenu = windowMenu

        NSApplication.shared.mainMenu = mainMenu
    }
}

final class BrowserWindowController: NSWindowController, WKNavigationDelegate, WKUIDelegate {
    private let webView: WKWebView

    init() {
        let configuration = WKWebViewConfiguration()
        configuration.allowsAirPlayForMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.preferences.isElementFullscreenEnabled = true

        webView = WKWebView(frame: .zero, configuration: configuration)
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 800),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "MacJMP"
        window.center()
        window.contentView = webView
        window.tabbingMode = .disallowed
        window.setFrameAutosaveName("MacJMPMainWindow")
        super.init(window: window)

        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.customUserAgent = "MacJMP Swift Prototype"
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func openInitialServer() {
        if let argument = CommandLine.arguments.dropFirst().first,
           let url = validatedServerURL(argument) {
            open(url, persist: true)
            return
        }

        if let saved = UserDefaults.standard.string(forKey: MacJMPDefaults.serverURL),
           let url = validatedServerURL(saved) {
            open(url, persist: false)
            return
        }

        chooseServer()
    }

    @objc func chooseServer() {
        let alert = NSAlert()
        alert.messageText = "Connect to Jellyfin"
        alert.informativeText = "Enter the full address of your Jellyfin server, including http:// or https://."
        alert.addButton(withTitle: "Connect")
        alert.addButton(withTitle: "Cancel")

        let input = NSTextField(frame: NSRect(x: 0, y: 0, width: 420, height: 24))
        input.placeholderString = "https://jellyfin.example.com"
        input.stringValue = UserDefaults.standard.string(forKey: MacJMPDefaults.serverURL) ?? ""
        alert.accessoryView = input
        alert.window.initialFirstResponder = input

        guard alert.runModal() == .alertFirstButtonReturn else { return }
        guard let url = validatedServerURL(input.stringValue) else {
            showInvalidAddressAlert()
            return
        }
        open(url, persist: true)
    }

    @objc func goBack() {
        if webView.canGoBack { webView.goBack() }
    }

    @objc func goForward() {
        if webView.canGoForward { webView.goForward() }
    }

    @objc func reload() {
        webView.reload()
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
            webView.load(URLRequest(url: url))
        }
        return nil
    }

    private func open(_ url: URL, persist: Bool) {
        if persist {
            UserDefaults.standard.set(url.absoluteString, forKey: MacJMPDefaults.serverURL)
        }
        webView.load(URLRequest(url: url))
        window?.title = "MacJMP — \(url.host ?? url.absoluteString)"
    }

    private func validatedServerURL(_ value: String) -> URL? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let components = URLComponents(string: trimmed),
              let scheme = components.scheme?.lowercased(),
              ["http", "https"].contains(scheme),
              components.host != nil else {
            return nil
        }
        return components.url
    }

    private func showInvalidAddressAlert() {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "Invalid server address"
        alert.informativeText = "Use a complete HTTP or HTTPS address."
        alert.runModal()
    }
}

private extension NSMenu {
    @discardableResult
    func addItem(targeting target: AnyObject, title: String, action: Selector, keyEquivalent: String) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: keyEquivalent)
        item.target = target
        addItem(item)
        return item
    }
}
