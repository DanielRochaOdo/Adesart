package br.com.vendamais.mobile.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import java.io.ByteArrayOutputStream
import java.io.File

data class CompressedErpFile(
    val bytes: ByteArray,
    val fileName: String,
    val mimeType: String,
)

object ErpFileCompressor {
    const val MAX_ERP_BYTES: Int = 5 * 1024 * 1024
    private const val TARGET_BYTES: Int = (MAX_ERP_BYTES * 0.94).toInt()

    fun compress(
        context: Context,
        bytes: ByteArray,
        fileName: String,
        mimeType: String?,
    ): CompressedErpFile {
        if (bytes.size <= MAX_ERP_BYTES) {
            return CompressedErpFile(
                bytes = bytes,
                fileName = fileName,
                mimeType = mimeType.orEmpty().ifBlank { inferMime(fileName) },
            )
        }

        val resolvedMime = mimeType.orEmpty().ifBlank { inferMime(fileName) }
        return when {
            resolvedMime == "application/pdf" || fileName.endsWith(".pdf", ignoreCase = true) ->
                compressPdf(context, bytes, fileName)
            resolvedMime.startsWith("image/") ->
                compressImage(bytes, fileName)
            else -> throw IllegalStateException(
                "Compressao automatica disponivel apenas para PDF, JPG e PNG.",
            )
        }
    }

    private fun compressImage(bytes: ByteArray, fileName: String): CompressedErpFile {
        val original = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            ?: throw IllegalStateException("Nao foi possivel abrir a imagem.")

        try {
            val attempts = listOf(
                1.0f to 82,
                0.88f to 74,
                0.76f to 66,
                0.64f to 58,
                0.52f to 50,
            )

            attempts.forEach { (scale, quality) ->
                val width = (original.width * scale).toInt().coerceAtLeast(1)
                val height = (original.height * scale).toInt().coerceAtLeast(1)
                val resized = if (width == original.width && height == original.height) {
                    original
                } else {
                    Bitmap.createScaledBitmap(original, width, height, true)
                }

                try {
                    val output = ByteArrayOutputStream()
                    resized.compress(Bitmap.CompressFormat.JPEG, quality, output)
                    val candidate = output.toByteArray()
                    if (candidate.size <= TARGET_BYTES) {
                        return CompressedErpFile(
                            bytes = candidate,
                            fileName = compressedName(fileName, "jpg"),
                            mimeType = "image/jpeg",
                        )
                    }
                } finally {
                    if (resized !== original) resized.recycle()
                }
            }
        } finally {
            original.recycle()
        }

        throw IllegalStateException(
            "A imagem nao pode ser reduzida para menos de 5 MB. Selecione outro arquivo.",
        )
    }

    private fun compressPdf(
        context: Context,
        bytes: ByteArray,
        fileName: String,
    ): CompressedErpFile {
        val source = File.createTempFile("adesart-erp-source-", ".pdf", context.cacheDir)
        source.writeBytes(bytes)

        try {
            val scales = listOf(0.86f, 0.72f, 0.6f, 0.5f, 0.42f)
            scales.forEach { scale ->
                val candidate = renderPdf(context, source, scale)
                if (candidate.size <= TARGET_BYTES) {
                    return CompressedErpFile(
                        bytes = candidate,
                        fileName = compressedName(fileName, "pdf"),
                        mimeType = "application/pdf",
                    )
                }
            }
        } finally {
            source.delete()
        }

        throw IllegalStateException(
            "O PDF nao pode ser reduzido para menos de 5 MB automaticamente. Envie uma versao menor.",
        )
    }

    private fun renderPdf(
        context: Context,
        source: File,
        scale: Float,
    ): ByteArray {
        val descriptor = ParcelFileDescriptor.open(source, ParcelFileDescriptor.MODE_READ_ONLY)
        val renderer = PdfRenderer(descriptor)
        val document = PdfDocument()

        try {
            for (index in 0 until renderer.pageCount) {
                renderer.openPage(index).use { page ->
                    val width = (page.width * scale).toInt().coerceAtLeast(320)
                    val height = (page.height * scale).toInt().coerceAtLeast(320)
                    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565)

                    try {
                        bitmap.eraseColor(Color.WHITE)
                        page.render(
                            bitmap,
                            null,
                            null,
                            PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY,
                        )

                        val pageInfo = PdfDocument.PageInfo.Builder(width, height, index + 1).create()
                        val outputPage = document.startPage(pageInfo)
                        outputPage.canvas.drawColor(Color.WHITE)
                        outputPage.canvas.drawBitmap(bitmap, 0f, 0f, null)
                        document.finishPage(outputPage)
                    } finally {
                        bitmap.recycle()
                    }
                }
            }

            val output = ByteArrayOutputStream()
            document.writeTo(output)
            return output.toByteArray()
        } finally {
            document.close()
            renderer.close()
            descriptor.close()
            @Suppress("UNUSED_VARIABLE")
            val ignored = context
        }
    }

    private fun compressedName(fileName: String, extension: String): String {
        val base = fileName.substringBeforeLast('.', fileName)
            .replace(Regex("[^a-zA-Z0-9._-]"), "_")
        return "${base}_comprimido.$extension"
    }

    private fun inferMime(fileName: String): String {
        return when {
            fileName.endsWith(".pdf", ignoreCase = true) -> "application/pdf"
            fileName.endsWith(".png", ignoreCase = true) -> "image/png"
            fileName.endsWith(".jpg", ignoreCase = true) ||
                fileName.endsWith(".jpeg", ignoreCase = true) -> "image/jpeg"
            else -> "application/octet-stream"
        }
    }
}
