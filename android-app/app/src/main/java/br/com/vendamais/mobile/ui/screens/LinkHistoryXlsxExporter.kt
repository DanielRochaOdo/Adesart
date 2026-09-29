package br.com.vendamais.mobile.ui.screens

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import br.com.vendamais.mobile.data.models.CadastroLinkHistoryRow
import br.com.vendamais.mobile.data.models.CadastroLinkItem
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import java.text.Normalizer
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

object LinkHistoryXlsxExporter {
    private val dateFormatter = DateTimeFormatter.ofPattern("dd/MM/yyyy")
    private val timeFormatter = DateTimeFormatter.ofPattern("HH:mm:ss")

    fun exportToDownloads(
        context: Context,
        link: CadastroLinkItem,
        rows: List<CadastroLinkHistoryRow>,
    ): Uri? {
        if (rows.isEmpty()) return null

        val companyPart = safeFilePart(link.empresaNome).ifBlank { "empresa" }
        val datePart = java.time.LocalDate.now().toString()
        val fileName = "historico-link-${link.empresaCodigo}-$companyPart-$datePart.xlsx"

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
                resolver.openOutputStream(uri)?.use { output ->
                    writeWorkbook(output, rows)
                } ?: return@runCatching null
                values.clear()
                values.put(MediaStore.Downloads.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
                uri
            } else {
                val dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.filesDir
                val vendaMaisDir = File(dir, "VendaMais").apply { mkdirs() }
                val file = File(vendaMaisDir, fileName)
                FileOutputStream(file).use { output -> writeWorkbook(output, rows) }
                Uri.fromFile(file)
            }
        }.getOrNull()
    }

    private fun writeWorkbook(
        output: OutputStream,
        rows: List<CadastroLinkHistoryRow>,
    ) {
        ZipOutputStream(output).use { zip ->
            putEntry(zip, "[Content_Types].xml", contentTypesXml)
            putEntry(zip, "_rels/.rels", rootRelsXml)
            putEntry(zip, "xl/workbook.xml", workbookXml)
            putEntry(zip, "xl/_rels/workbook.xml.rels", workbookRelsXml)
            putEntry(zip, "xl/styles.xml", stylesXml)
            putEntry(zip, "xl/worksheets/sheet1.xml", buildSheetXml(rows))
        }
    }

    private fun buildSheetXml(rows: List<CadastroLinkHistoryRow>): String {
        val headers = listOf(
            "Data",
            "Horario",
            "Nome do RF",
            "Dependentes",
            "Telefone",
            "Status",
            "Vendedor",
            "Codigo do vendedor",
            "Empresa",
            "Codigo da empresa",
        )

        val data = buildList {
            add(headers)
            rows.forEach { row ->
                val parsed = runCatching { OffsetDateTime.parse(row.timestamp) }.getOrNull()
                add(
                    listOf(
                        parsed?.format(dateFormatter).orEmpty(),
                        parsed?.format(timeFormatter).orEmpty(),
                        row.nomeRf.orEmpty(),
                        row.dependentes.joinToString(", "),
                        formatPhone(row.telefone),
                        row.status,
                        row.vendedor,
                        row.vendedorCodigo,
                        row.empresaNome,
                        row.empresaCodigo.toString(),
                    ),
                )
            }
        }

        val sheetRows = data.mapIndexed { rowIndex, cells ->
            val rowNumber = rowIndex + 1
            val xmlCells = cells.mapIndexed { colIndex, value ->
                val reference = "${columnName(colIndex + 1)}$rowNumber"
                "<c r=\"$reference\" t=\"inlineStr\"><is><t xml:space=\"preserve\">${xmlEscape(value)}</t></is></c>"
            }.joinToString("")
            "<row r=\"$rowNumber\">$xmlCells</row>"
        }.joinToString("")

        return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>$sheetRows</sheetData>
</worksheet>"""
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

    private fun safeFilePart(value: String): String = Normalizer
        .normalize(value, Normalizer.Form.NFD)
        .replace(Regex("\\p{M}+"), "")
        .replace(Regex("[^a-zA-Z0-9_-]+"), "-")
        .trim('-')
        .lowercase(Locale.ROOT)

    private fun formatPhone(value: String?): String {
        val digits = value.orEmpty().filter(Char::isDigit)
        return when (digits.length) {
            11 -> "(${digits.substring(0, 2)}) ${digits.substring(2, 7)}-${digits.substring(7)}"
            10 -> "(${digits.substring(0, 2)}) ${digits.substring(2, 6)}-${digits.substring(6)}"
            else -> value.orEmpty()
        }
    }

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
  <sheets>
    <sheet name="Historico" sheetId="1" r:id="rId1"/>
  </sheets>
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
