package br.com.vendamais.mobile.data.remote

import br.com.vendamais.mobile.AppConfig
import br.com.vendamais.mobile.data.auth.SavedSession
import io.ktor.client.HttpClient
import io.ktor.client.statement.HttpResponse
import io.ktor.client.call.body
import io.ktor.client.plugins.ClientRequestException
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.isSuccess
import io.ktor.http.contentType
import kotlinx.coroutines.delay
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import java.io.IOException

internal fun HttpRequestBuilder.applyAuthHeaders(session: SavedSession) {
    header("apikey", AppConfig.supabaseAnonKey)
    header(HttpHeaders.Authorization, "Bearer ${session.accessToken}")
    header(HttpHeaders.Accept, "application/json")
}

internal suspend inline fun <reified T> HttpClient.safeGet(
    url: String,
    json: Json,
    crossinline builder: HttpRequestBuilder.() -> Unit = {},
): T {
    return try {
        val response = get(url, builder)
        if (!response.status.isSuccess()) throw response.toReadableException(json)
        response.body()
    } catch (exception: ClientRequestException) {
        throw exception.toReadableException(json)
    }
}

internal suspend inline fun <reified T> HttpClient.safePost(
    url: String,
    json: Json,
    body: Any? = null,
    crossinline builder: HttpRequestBuilder.() -> Unit = {},
): T {
    val recoverErpCadastroSend = url.contains("/functions/v1/erp-novo-usuario2")
    val maxAttempts = if (recoverErpCadastroSend) 6 else 1
    var attempt = 1

    while (true) {
        try {
            val response = post(url) {
                if (body != null) {
                    contentType(ContentType.Application.Json)
                    when (body) {
                        is JsonElement -> setBody(body.toString())
                        else -> setBody(body)
                    }
                }
                builder()
            }

            if (recoverErpCadastroSend && response.status.value == 409 && attempt < maxAttempts) {
                delay((attempt * 1500L).coerceAtMost(5000L))
                attempt++
                continue
            }

            if (!response.status.isSuccess()) throw response.toReadableException(json)
            return response.body()
        } catch (exception: ClientRequestException) {
            if (recoverErpCadastroSend && exception.response.status.value == 409 && attempt < maxAttempts) {
                delay((attempt * 1500L).coerceAtMost(5000L))
                attempt++
                continue
            }
            throw exception.toReadableException(json)
        } catch (exception: Throwable) {
            val normalizedMessage = exception.message.orEmpty().lowercase()
            val retryableTransportFailure =
                exception is IOException ||
                    normalizedMessage.contains("socket timeout") ||
                    normalizedMessage.contains("timed out") ||
                    normalizedMessage.contains("timeout") ||
                    normalizedMessage.contains("connection reset") ||
                    normalizedMessage.contains("connection refused") ||
                    normalizedMessage.contains("unexpected end of stream")

            if (recoverErpCadastroSend && retryableTransportFailure && attempt < maxAttempts) {
                delay((attempt * 1500L).coerceAtMost(5000L))
                attempt++
                continue
            }

            if (recoverErpCadastroSend && retryableTransportFailure) {
                throw IllegalStateException(
                    "O servidor ainda esta processando o cadastro. Aguarde alguns segundos e tente novamente; o reenvio e protegido contra duplicidade.",
                    exception,
                )
            }

            throw exception
        }
    }
}

internal suspend inline fun <reified T> HttpClient.safePatch(
    url: String,
    json: Json,
    body: Any? = null,
    crossinline builder: HttpRequestBuilder.() -> Unit = {},
): T {
    return try {
        val response = request(url) {
            method = HttpMethod.Patch
            if (body != null) {
                contentType(ContentType.Application.Json)
                when (body) {
                    is JsonElement -> setBody(body.toString())
                    else -> setBody(body)
                }
            }
            builder()
        }
        if (!response.status.isSuccess()) throw response.toReadableException(json)
        response.body()
    } catch (exception: ClientRequestException) {
        throw exception.toReadableException(json)
    }
}

internal suspend inline fun <reified T> HttpClient.safeDelete(
    url: String,
    json: Json,
    crossinline builder: HttpRequestBuilder.() -> Unit = {},
): T {
    return try {
        val response = delete(url, builder)
        if (!response.status.isSuccess()) throw response.toReadableException(json)
        response.body()
    } catch (exception: ClientRequestException) {
        throw exception.toReadableException(json)
    }
}

internal suspend fun HttpClient.safeDeleteNoContent(
    url: String,
    json: Json,
    builder: HttpRequestBuilder.() -> Unit = {},
) {
    try {
        val response = delete(url, builder)
        if (!response.status.isSuccess()) throw response.toReadableException(json)
    } catch (exception: ClientRequestException) {
        throw exception.toReadableException(json)
    }
}

internal suspend fun HttpClient.safePutBytes(
    url: String,
    json: Json,
    bytes: ByteArray,
    contentTypeValue: String,
    builder: HttpRequestBuilder.() -> Unit = {},
) {
    try {
        val response = put(url) {
            contentType(ContentType.parse(contentTypeValue))
            setBody(bytes)
            builder()
        }
        if (!response.status.isSuccess()) throw response.toReadableException(json)
    } catch (exception: ClientRequestException) {
        throw exception.toReadableException(json)
    }
}

private suspend fun ClientRequestException.toReadableException(json: Json): IllegalStateException {
    return response.toReadableException(json)
}

private suspend fun HttpResponse.toReadableException(json: Json): IllegalStateException {
    val body = body<String>()
    val parsed = runCatching {
        json.parseToJsonElement(body)
    }.getOrNull()

    val message = when (parsed) {
        is JsonObject -> {
            parsed["message"]?.asString()
                ?: parsed["error"]?.asString()
                ?: parsed["hint"]?.asString()
                ?: parsed["details"]?.asString()
        }
        is JsonPrimitive -> parsed.content.takeIf { it.isNotBlank() }
        else -> null
    }

    return IllegalStateException(message ?: "Falha ao consultar o backend.")
}

private fun JsonElement.asString(): String? = when (this) {
    is JsonPrimitive -> content.takeIf { it.isNotBlank() }
    is JsonObject -> toString()
    else -> toString()
}
