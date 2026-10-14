package br.com.vendamais.shared.data

import io.ktor.client.HttpClient

expect fun createPlatformHttpClient(): HttpClient
