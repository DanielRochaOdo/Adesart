package br.com.vendamais.mobile.data.remote

import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * Contrato de envio Android = Web.
 * Uma operação tem identidade própria independente de edições no formulário.
 * Não considerar "CPF ativo" como prova de que ESTA operação foi concluída.
 */
internal object ErpSendOperation {
    fun cadastroKey(cadastroId: String): String =
        "cadastro:${requireId(cadastroId)}"

    fun inclusaoKey(cadastroId: String?): String =
        "inclusao-dependente:${requireId(cadastroId)}"

    fun confirmedSameCadastro(row: JsonObject?): JsonObject? {
        if (row?.get("status")?.jsonPrimitive?.contentOrNull != "enviado") return null
        val response = row["erp_response"] as? JsonObject ?: return null
        if (response["success"]?.jsonPrimitive?.booleanOrNull != true) return null
        val data = response["data"] as? JsonObject ?: return null
        val dados = data["dados"]
        if (dados == null || dados == JsonNull) return null
        return response
    }

    private fun requireId(value: String?): String =
        value?.trim()?.takeIf { it.isNotBlank() }
            ?: throw IllegalStateException("O cadastro precisa ser salvo antes do envio ao ERP.")
}
