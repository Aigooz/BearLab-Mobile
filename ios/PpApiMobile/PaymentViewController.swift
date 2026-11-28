import UIKit
import WebKit

final class PaymentViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private let action: URL
    private let fields: [String: Any]
    private let onClose: () -> Void
    private var webView: WKWebView!
    private let spinner = UIActivityIndicatorView(style: .medium)
    private var failureAlert: UIAlertController?
    private var closed = false

    init(action: URL, fields: [String: Any], onClose: @escaping () -> Void) {
        self.action = action
        self.fields = fields
        self.onClose = onClose
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "BearLab 充值"
        view.backgroundColor = UIColor(red: 247 / 255, green: 249 / 255, blue: 252 / 255, alpha: 1)
        navigationItem.rightBarButtonItem = UIBarButtonItem(
            title: "关闭", style: .plain, target: self, action: #selector(close)
        )

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.isOpaque = false
        webView.backgroundColor = view.backgroundColor
        view.addSubview(webView)

        spinner.translatesAutoresizingMaskIntoConstraints = false
        spinner.color = .secondaryLabel
        view.addSubview(spinner)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            spinner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
        spinner.startAnimating()
        webView.loadHTMLString(Self.formHTML(action: action, fields: fields), baseURL: Self.origin(of: action))
    }

    @objc private func close() {
        finish()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        guard !closed, isBeingDismissed || navigationController?.isBeingDismissed == true else { return }
        closed = true
        onClose()
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if url.scheme?.lowercased() == "https", Self.isSafeWebURL(url) {
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
            openPaymentApp(url)
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, Self.isSafeWebURL(url) {
            webView.load(URLRequest(url: url))
        } else if let url = navigationAction.request.url {
            openPaymentApp(url)
        }
        return nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        spinner.stopAnimating()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showFailure()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showFailure()
    }

    private func showFailure() {
        spinner.stopAnimating()
        guard presentedViewController == nil, failureAlert == nil else { return }
        let alert = UIAlertController(
            title: "无法打开支付页面",
            message: "订单可能已经创建，请返回充值中心重新发起并核对充值记录。",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "返回充值", style: .cancel) { [weak self] _ in
            guard let self else { return }
            self.failureAlert = nil
            self.finish()
        })
        failureAlert = alert
        present(alert, animated: true)
    }

    private func openPaymentApp(_ url: URL) {
        let scheme = url.scheme?.lowercased() ?? ""
        guard ["alipays", "weixin", "alipay", "wechat"].contains(scheme) else {
            let alert = UIAlertController(
                title: "无法打开支付应用",
                message: "请返回支付页面重试。",
                preferredStyle: .alert
            )
            alert.addAction(UIAlertAction(title: "好", style: .default))
            present(alert, animated: true)
            return
        }
        UIApplication.shared.open(url, options: [:]) { [weak self] opened in
            guard !opened, let self else { return }
            let alert = UIAlertController(
                title: "未找到支付应用",
                message: "请安装对应的支付应用后重试。",
                preferredStyle: .alert
            )
            alert.addAction(UIAlertAction(title: "好", style: .default))
            self.present(alert, animated: true)
        }
    }

    private static func origin(of url: URL) -> URL? {
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        components.path = "/"
        components.query = nil
        components.fragment = nil
        return components.url
    }

    private static func isSafeWebURL(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "https",
              let host = url.host, !host.isEmpty,
              url.user == nil, url.password == nil else { return false }
        return true
    }

    private func finish() {
        guard !closed else { return }
        closed = true
        failureAlert = nil
        let callback = onClose
        dismiss(animated: true, completion: callback)
    }

    private static func formHTML(action: URL, fields: [String: Any]) -> String {
        let inputs = fields.map { name, value in
            "<input type=\"hidden\" name=\"\(htmlAttribute(name))\" value=\"\(htmlAttribute(String(describing: value)))\">"
        }.joined()
        return """
        <!doctype html>
        <html lang="zh-Hans">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
          <style>
            html,body{margin:0;min-height:100%;background:#f7f9fc}
            body{display:grid;place-items:center;font:15px/1.5 -apple-system,sans-serif;color:#41596d}
            .card{margin:16px;padding:22px;max-width:440px;border:1px solid #dfe7f0;border-radius:14px;background:#fff;text-align:center}
          </style>
        </head>
        <body>
          <div class="card">正在跳转到安全支付页面…</div>
          <form id="payment" method="post" action="\(htmlAttribute(action.absoluteString))">\(inputs)</form>
          <script>document.getElementById('payment').submit()</script>
        </body>
        </html>
        """
    }

    private static func htmlAttribute(_ value: String) -> String {
        value.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
    }
}
