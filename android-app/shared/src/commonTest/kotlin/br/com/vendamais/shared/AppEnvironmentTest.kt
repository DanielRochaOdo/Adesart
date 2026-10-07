package br.com.vendamais.shared

import kotlin.test.Test
import kotlin.test.assertTrue

class AppEnvironmentTest {
    @Test
    fun publicAppUsesHttps() {
        assertTrue(VendaMaisEnvironment.publicAppUrl.startsWith("https://"))
    }

    @Test
    fun parityDefaultsToAllClients() {
        val policy = ParityPolicy()
        assertTrue(policy.synchronizedByDefault)
        assertTrue(policy.clients.containsAll(VendaMaisClient.entries))
    }
}
