package br.com.vendamais.mobile.data.remote

import com.google.common.truth.Truth.assertThat
import br.com.vendamais.mobile.data.models.CadastroBaseData
import br.com.vendamais.mobile.data.models.CadastroContato
import br.com.vendamais.mobile.data.models.CadastroDetalhe
import br.com.vendamais.mobile.data.models.CadastroEndereco
import br.com.vendamais.mobile.data.models.DependenteCadastro
import org.junit.Test
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull

class CadastroPayloadBuilderTest {

    @Test
    fun `normalizeDigits should keep only numbers`() {
        val normalized = CadastroPayloadBuilder.normalizeDigits("529.982.247-25")
        assertThat(normalized).isEqualTo("52998224725")
    }

    @Test
    fun `validateCpf should return true for valid cpf`() {
        val isValid = CadastroPayloadBuilder.validateCpf("52998224725")
        assertThat(isValid).isTrue()
    }

    @Test
    fun `validateCpf should return false for repeated digits`() {
        val isValid = CadastroPayloadBuilder.validateCpf("11111111111")
        assertThat(isValid).isFalse()
    }

    @Test
    fun `validateCpf should return false for wrong check digits`() {
        val isValid = CadastroPayloadBuilder.validateCpf("12345678900")
        assertThat(isValid).isFalse()
    }

    @Test
    fun `detailToBaseData should parse endereco when API returns JSON string`() {
        val cadastro = cadastroDetalheBase(
            endereco = JsonPrimitive("""{"cep":"60110140","logradouro":"Rua A","bairro":"Centro","cidade":"Fortaleza","uf":"CE"}"""),
        )

        val base = CadastroPayloadBuilder.detailToBaseData(JSON, cadastro)

        assertThat(base.endereco).isNotNull()
        assertThat(base.endereco?.cep).isEqualTo("60110140")
        assertThat(base.endereco?.logradouro).isEqualTo("Rua A")
        assertThat(base.endereco?.cidade).isEqualTo("Fortaleza")
        assertThat(base.endereco?.uf).isEqualTo("CE")
    }

    @Test
    fun `detailToBaseData should parse contatos when API returns JSON string`() {
        val cadastro = cadastroDetalheBase(
            contatos = JsonPrimitive("""[{"tipo":"celular","valor":"85999999999","principal":true}]"""),
        )

        val base = CadastroPayloadBuilder.detailToBaseData(JSON, cadastro)

        assertThat(base.contatos).hasSize(1)
        assertThat(base.contatos.first().tipo).isEqualTo("celular")
        assertThat(base.contatos.first().valor).isEqualTo("85999999999")
        assertThat(base.contatos.first().principal).isTrue()
    }

    @Test
    fun `detailToBaseData should carry numero matricula when present`() {
        val cadastro = cadastroDetalheBase()
            .copy(numeroMatricula = "  MAT-123  ")

        val base = CadastroPayloadBuilder.detailToBaseData(JSON, cadastro)

        assertThat(base.numeroMatricula).isEqualTo("MAT-123")
    }

    @Test
    fun `buildErpPayload should include Matricula and dataApresentacao`() {
        val base = CadastroBaseData(
            cpf = "52998224725",
            nome = "Cliente Teste",
            dataNascimento = "1990-01-01",
            sexo = "M",
            sexoCodigo = 1,
            contatos = listOf(
                CadastroContato(
                    tipo = "celular",
                    valor = "85999999999",
                    principal = true,
                ),
            ),
            endereco = CadastroEndereco(
                cep = "60110140",
                logradouro = "Rua A",
                numero = "123",
                bairro = "Centro",
                cidade = "Fortaleza",
                uf = "CE",
                ufSigla = "CE",
            ),
            nomeMae = "Mae Teste",
            numeroMatricula = "MAT-123",
        )
        val dependentes = listOf(
            DependenteCadastro(
                tipo = 1,
                nome = "Cliente Teste",
                dataNascimento = "1990-01-01",
                cpf = "52998224725",
                sexo = 1,
                sexoDescricao = "Masculino",
                plano = 468945133,
                planoValor = "13,00",
                nomeMae = "Mae Teste",
                carenciaAtendimento = 0,
                funcionarioCadastro = 123,
            ),
        )

        val payload = CadastroPayloadBuilder.buildErpPayload(
            cadastro = base,
            dependentes = dependentes,
            empresaId = 1,
            vendedorCodigo = "10",
            funcionarioCadastroId = 123,
            userRole = "CADASTRO",
            userExternalId = "123",
            adesionistaCodigo = null,
        )

        val responsavel = payload["dados"]
            ?.jsonObject
            ?.get("responsavelFinanceiro")
            ?.jsonObject
        assertThat(responsavel).isNotNull()
        assertThat(responsavel?.get("Matricula")?.jsonPrimitive?.contentOrNull).isEqualTo("MAT-123")
        assertThat(responsavel?.get("dataApresentacao")?.jsonPrimitive?.contentOrNull).isNotEmpty()
    }

    @Test
    fun `firstDependenteCodigo should read scalar codigo returned by NovoUsuario2`() {
        val response = JSON.parseToJsonElement(
            """{"success":true,"data":{"dados":{"codigo":12345}}}""",
        )

        assertThat(CadastroPayloadBuilder.firstDependenteCodigo(response)).isEqualTo(12345)
    }

    @Test
    fun `firstDependenteCodigo should keep legacy dependentes array compatibility`() {
        val response = JSON.parseToJsonElement(
            """{"success":true,"data":{"dados":{"dependentes":[{"codigo":54321}]}}}""",
        )

        assertThat(CadastroPayloadBuilder.firstDependenteCodigo(response)).isEqualTo(54321)
    }

    private fun cadastroDetalheBase(
        contatos: kotlinx.serialization.json.JsonElement? = null,
        endereco: kotlinx.serialization.json.JsonElement? = null,
    ): CadastroDetalhe {
        return CadastroDetalhe(
            id = "cad-1",
            status = "incompleto",
            nome = "Cliente Teste",
            cpf = "52998224725",
            dataNascimento = "1990-01-01",
            sexoCodigo = 1,
            nomeMae = "Mae Teste",
            contatos = contatos,
            endereco = endereco,
            createdAt = "2026-01-01T00:00:00Z",
            updatedAt = "2026-01-01T00:00:00Z",
        )
    }

    companion object {
        private val JSON = Json { ignoreUnknownKeys = true }
    }
}
