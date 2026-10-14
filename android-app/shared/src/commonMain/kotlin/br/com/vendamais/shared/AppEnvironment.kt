package br.com.vendamais.shared

object VendaMaisEnvironment {
    const val publicAppUrl: String = "https://vendamais.odontoart.com"
    const val privacyPolicyUrl: String = "https://odontoart.com/privacy-policy/"
}

enum class VendaMaisClient {
    WEB,
    ANDROID,
    IOS,
}

data class ParityPolicy(
    val clients: Set<VendaMaisClient> = VendaMaisClient.entries.toSet(),
    val synchronizedByDefault: Boolean = true,
)
