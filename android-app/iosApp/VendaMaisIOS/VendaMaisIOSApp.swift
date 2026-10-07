import SwiftUI
import VendaMaisShared

struct VendaMaisComposeView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UIViewController {
        MainViewControllerKt.MainViewController()
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {
    }
}

@main
struct VendaMaisIOSApp: App {
    var body: some Scene {
        WindowGroup {
            VendaMaisComposeView()
                .ignoresSafeArea()
        }
    }
}
