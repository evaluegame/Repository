import SwiftUI
import WebKit

struct ProfitWebView: UIViewRepresentable {
    let url = URL(string: "https://profit-tracker-emil.onrender.com")!

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

@main
struct ProfitApp: App {
    var body: some Scene {
        WindowGroup { ProfitWebView().ignoresSafeArea() }
    }
}
