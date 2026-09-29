package br.com.vendamais.mobile.ui.screens

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import br.com.vendamais.mobile.data.models.CadastroResumo
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

object PendingCadastrosXlsxExporter {
    private val dateTimeFormatter = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")

    fun exportToDownloads(
        context: Context,
        cadastros: List<CadastroResumo>,
        statusLabels: Map<String, String>,
    ): Uri? {
        if (cadastros.isEmpty()) return null
        val fileName = "adesoes-pendentes-${java.time.LocalDate.now()}.xlsx"
        return runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, fileName)
                    put(
                        MediaStore.Downloads.MIME_TYPE,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    )
                    put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/VendaMais")
                    put(MediaStore.Downloads.IS_PENDING, 1)
                }
                val resolver = context.contentResolver
                val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    ?: return@runCatching null
                resolver.openOutputStream(uri)?.use { writeWorkbook(it, cadastros, statusLabels) }
                    ?: return@runCatching null
                values.clear()
                values.put(MediaStore.Downloads.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
                uri
            } else {
                val dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.filesDir
                val target = File(dir, "VendaMais").apply { mkdirs() }
                val file = File(target, fileName)
                FileOutputStream(file).use { writeWorkbook(it, cadastros, statusLabels) }
                Uri.fromFile(file)
            }
        }.getOrNull()
    }

    private fun writeWorkbook(
        output: OutputStream,
        cadastros: List<CadastroResumo>,
        statusLabels: Map<String, String>,
    ) {
        ZipOutputStream(output).use { zip ->
            putEntry(zip, "[Content_Types].xml", contentTypesXml)
            putEntry(zip, "_rels/.rels", rootRelsXml)
            putEntry(zip, "xl/workbook.xml", workbookXml)
            putEntry(zip, "xl/_rels/workbook.xml.rels", workbookRelsXml)
            putEntry(zip, "xl/styles.xml", stylesXml)
            putEntry(zip, "xl/worksheets/sheet1.xml", buildSheetXml(cadastros, statusLabels))
        }
    }

    private fun buildSheetXml(
        cadastros: List<CadastroResumo>,
        statusLabels: Map<String, String>,
    ): String {
        val headers = listOf(
            "Data",
            "Tipo",
            "Titular",
            "CPF",
            "Empresa",
            "Codigo da empresa",
            "Vendedor",
            "Adesionista",
            "Situacao",
        )
        val rows = buildList {
            add(headers)
            cadastros.forEach { cadastro ->
                add(
                    listOf(
                        formatDate(cadastro.createdAt),
                        if (cadastro.tipoCadastro == "inclusao_dependente") "Inclusao de Dependente" else "Cadastro",
                        cadastro.nome.orEmpty(),
                        formatCpf(cadastro.cpf),
                        cadastro.empresaNome.orEmpty(),
                        cadastro.empresaCodigo?.toString().orEmpty(),
                        cadastro.vendedorNome.orEmpty(),
                        cadastro.adesionistaNome.orEmpty(),
                        cadastro.statusAdesaoId?.let { statusLabels[it] }.orEmpty()
                            .ifBlank { cadastro.status },
                    ),
                )
            }
        }
        val sheetRows = rows.mapIndexed { rowIndex, cells ->
            val rowNumber = rowIndex + 1
            val xmlCells = cells.mapIndexed { colIndex, value ->
                val ref = "${columnName(colIndex + 1)}$rowNumber"
                "<c r=\"$ref\" t=\"inlineStr\"><is><t xml:space=\"preserve\">${xmlEscape(value)}</t></is></c>"
            }.joinToString("")
            "<row r=\"$rowNumber\">$xmlCells</row>"
        }.joinToString("")
        return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>$sheetRows</sheetData>
</worksheet>"""
    }

    private fun formatDate(value: String): String =
        runCatching { OffsetDateTime.parse(value).format(dateTimeFormatter) }.getOrDefault(value)

    private fun formatCpf(value: String): String {
        val digits = value.filter(Char::isDigit)
        return if (digits.length == 11) {
            "${digits.substring(0, 3)}.${digits.substring(3, 6)}.${digits.substring(6, 9)}-${digits.substring(9)}"
        } else value
    }

    private fun columnName(index: Int): String {
        var value = index
        val result = StringBuilder()
        while (value > 0) {
            val remainder = (value - 1) % 26
            result.append(('A'.code + remainder).toChar())
            value = (value - 1) / 26
        }
        return result.reverse().toString()
    }

    private fun putEntry(zip: ZipOutputStream, name: String, value: String) {
        zip.putNextEntry(ZipEntry(name))
        zip.write(value.toByteArray(Charsets.UTF_8))
        zip.closeEntry()
    }

    private fun xmlEscape(value: String): String = value
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&apos;")

    private val contentTypesXml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>"""

    private val rootRelsXml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"""

    private val workbookXml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="AdesoesPendentes" sheetId="1" r:id="rId1"/></sheets>
</workbook>"""

    private val workbookRelsXml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"""

    private val stylesXml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>"""
}
