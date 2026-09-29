package br.com.vendamais.mobile.data.remote

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

internal object CadastroLinkCrypto {
    private val random = SecureRandom()

    fun generateCadastroLinkToken(): String {
        val bytes = ByteArray(32)
        random.nextBytes(bytes)
        return Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString(bytes)
    }

    fun hashCadastroLinkToken(token: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(token.toByteArray())
        return digest.joinToString("") { byte -> "%02x".format(byte) }
    }
}
