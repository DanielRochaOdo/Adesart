package br.com.vendamais.mobile.data.remote

import com.google.common.truth.Truth.assertThat
import br.com.vendamais.mobile.data.models.CadastroEndereco
import kotlinx.serialization.json.Json
import org.junit.Test
import org.junit.Assert.assertThrows

class CadastroWorkflowRepositoryMatriculaTest {

    @Test
    fun `reconcileNumeroMatriculaForSend should prefer recent matricula and request persistence when empresa exige`() {
        val result = reconcileNumeroMatriculaForSend(
            empresaExigeMatricula = 1,
            persistedNumeroMatricula = null,
            hintedNumeroMatricula = "  MAT-123  ",
        )

        assertThat(result.numeroMatricula).isEqualTo("MAT-123")
        assertThat(result.shouldPersist).isTrue()
    }

    @Test
    fun `reconcileNumeroMatriculaForSend should keep missing matricula when empresa exige and no recent value`() {
        val result = reconcileNumeroMatriculaForSend(
            empresaExigeMatricula = 1,
            persistedNumeroMatricula = null,
            hintedNumeroMatricula = null,
        )

        assertThat(result.numeroMatricula).isNull()
        assertThat(result.shouldPersist).isFalse()
    }

    @Test
    fun `reconcileNumeroMatriculaForSend should not require persistence when empresa nao exige`() {
        val result = reconcileNumeroMatriculaForSend(
            empresaExigeMatricula = 0,
            persistedNumeroMatricula = null,
            hintedNumeroMatricula = "MAT-999",
        )

        assertThat(result.numeroMatricula).isEqualTo("MAT-999")
        assertThat(result.shouldPersist).isFalse()
    }

    @Test
    fun `reconcileNumeroMatriculaForSend should not persist when recent value equals persisted value`() {
        val result = reconcileNumeroMatriculaForSend(
            empresaExigeMatricula = 1,
            persistedNumeroMatricula = "MAT-555",
            hintedNumeroMatricula = "MAT-555",
        )

        assertThat(result.numeroMatricula).isEqualTo("MAT-555")
        assertThat(result.shouldPersist).isFalse()
    }

    @Test
    fun `validateEnderecoCepForErp should reject missing cep`() {
        val error = assertThrows(IllegalStateException::class.java) {
            validateEnderecoCepForErp(CadastroEndereco(cep = ""))
        }

        assertThat(error.message).isEqualTo("Informe um CEP valido de 8 digitos antes de cadastrar.")
    }

    @Test
    fun `validateEnderecoCepForErp should reject incomplete cep`() {
        val error = assertThrows(IllegalStateException::class.java) {
            validateEnderecoCepForErp(CadastroEndereco(cep = "60110"))
        }

        assertThat(error.message).isEqualTo("Informe um CEP valido de 8 digitos antes de cadastrar.")
    }

    @Test
    fun `validateEnderecoCepForErp should accept masked cep with eight digits`() {
        validateEnderecoCepForErp(CadastroEndereco(cep = "60.110-140"))
    }

    @Test
    fun `validateEnderecoCepForErp should accept nested raw endereco json with cep`() {
        val raw = Json.parseToJsonElement(
            """
            {
              "endereco": {
                "dados": {
                  "codigoPostal": "60110140"
                }
              }
            }
            """.trimIndent(),
        )

        validateEnderecoCepForErp(raw)
    }
}
