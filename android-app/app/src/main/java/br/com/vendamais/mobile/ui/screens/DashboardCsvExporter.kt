package br.com.vendamais.mobile.ui.screens

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import br.com.vendamais.mobile.data.models.CadastroResumo
import kotlinx.serialization.json.jsonArray
import java.io.File
import java.io.FileOutputStream
import java.nio.charset.StandardCharsets
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

object DashboardCsvExporter {
    private val dateFormatter = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")

    fun exportToDownloads(context: Context, cadastros: List<CadastroResumo>): Uri? {
        if (cadastros.isEmpty()) return null
        val fileName = "adesart-dashboard-${java.time.LocalDate.now()}.csv"
        val bytes = buildCsv(cadastros).toByteArray(StandardCharsets.UTF_8)
        return runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, fileName)
                    put(MediaStore.Downloads.MIME_TYPE, "text/csv")
                    put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/VendaMais")
                    put(MediaStore.Downloads.IS_PENDING, 1)
                }
                val resolver = context.contentResolver
                val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    ?: return@runCatching null
                resolver.openOutputStream(uri)?.use { it.write(bytes) } ?: return@runCatching null
                values.clear()
                values.put(MediaStore.Downloads.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
                uri
            } else {
                val dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.filesDir
                val target = File(dir, "VendaMais").apply { mkdirs() }
                val file = File(target, fileName)
                FileOutputStream(file).use { it.write(bytes) }
                Uri.fromFile(file)
            }
        }.getOrNull()
    }

    private fun buildCsv(cadastros: List<CadastroResumo>): String {
        val header = listOf(
            "Data de criacao",
            "Tipo",
            "Situacao",
            "Equipe",
            "Vendedor",
            "Adesionista",
            "Empresa",
            "Plano",
            "Canal",
            "Total de vidas no cadastro",
        )
        val lines = cadastros.map { cadastro ->
            listOf(
                formatDate(cadastro.createdAt),
                if (cadastro.tipoCadastro == "cadastro") "Cadastro" else "Inclusao de dependente",
                cadastro.status,
                cadastro.teamId.orEmpty(),
                cadastro.vendedorNome.orEmpty(),
                cadastro.adesionistaNome.orEmpty(),
                cadastro.empresaNome.orEmpty(),
                cadastro.planoNome.orEmpty(),
                if (cadastro.fluxoPublico == true || !cadastro.origemLinkId.isNullOrBlank()) "Link / QR Code" else "Interno",
                if (cadastro.tipoCadastro == "cadastro") dashboardLives(cadastro).toString() else "",
            )
        }
        return buildString {
            append('﻿')
            appendLine(header.joinToString(";") { csvCell(it) })
            lines.forEach { row -> appendLine(row.joinToString(";") { csvCell(it) }) }
        }
    }

    private fun dashboardLives(cadastro: CadastroResumo): Int {
        val array = runCatching { cadastro.dependentes?.jsonArray }.getOrNull()
        return if (array == null) 1 else maxOf(1, array.size)
    }

    private fun formatDate(value: String): String =
        runCatching { OffsetDateTime.parse(value).format(dateFormatter) }.getOrDefault(value)

    private fun csvCell(value: String): String {
        val safe = if (value.firstOrNull() in setOf('=', '+', '-', '@', '\t', '\r')) "'$value" else value
        return "\"" + safe.replace("\"", "\"\"") + "\""
    }
}
