package br.com.vendamais.mobile.data.remote

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertThrows
import org.junit.Test

class ErpSendOperationTest {
    @Test fun `mesma nova adesao preserva identidade independente do conteudo`() {
        assertThat(ErpSendOperation.cadastroKey(" id-123 ")).isEqualTo("cadastro:id-123")
        assertThat(ErpSendOperation.cadastroKey("id-123")).isEqualTo("cadastro:id-123")
    }

    @Test fun `inclusao de dependente exige identidade persistida`() {
        assertThat(ErpSendOperation.inclusaoKey("id-456")).isEqualTo("inclusao-dependente:id-456")
        assertThrows(IllegalStateException::class.java) {
            ErpSendOperation.inclusaoKey(null)
        }
    }

    @Test fun `somente resposta real de sucesso para o mesmo cadastro permite reconciliar`() {
        val committed = buildJsonObject {
            put("status", "enviado")
            put("erp_response", buildJsonObject {
                put("success", true)
                put("data", buildJsonObject {
                    put("dados", buildJsonObject { put("codigo", 9001) })
                })
            })
        }
        assertThat(ErpSendOperation.confirmedSameCadastro(committed)).isNotNull()
    }

    @Test fun `CPF ativo ou rascunho nao equivale a envio concluido`() {
        val activeCpfOnly = buildJsonObject {
            put("status", "incompleto")
            put("erp_response", buildJsonObject {
                put("error", "Este CPF ja possui uma adesao ativa")
            })
        }
        val invalidSuccess = buildJsonObject {
            put("status", "enviado")
            put("erp_response", buildJsonObject {
                put("success", true)
            })
        }
        assertThat(ErpSendOperation.confirmedSameCadastro(activeCpfOnly)).isNull()
        assertThat(ErpSendOperation.confirmedSameCadastro(invalidSuccess)).isNull()
    }
}
