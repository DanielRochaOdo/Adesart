package br.com.vendamais.shared.data

import io.ktor.client.HttpClient
import io.ktor.client.engine.darwin.Darwin
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

actual fun createPlatformHttpClient(): HttpClient = HttpClient(Darwin) {
    expectSuccess = false
    install(ContentNegotiation) {
        json(Json {
            ignoreUnknownKeys = true
            explicitNulls = false
            encodeDefaults = false
        })
    }
}
