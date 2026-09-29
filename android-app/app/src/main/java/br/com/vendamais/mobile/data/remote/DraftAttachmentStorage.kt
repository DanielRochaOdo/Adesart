package br.com.vendamais.mobile.data.remote

import android.content.Context
import android.net.Uri
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

data class DraftAttachmentCopyResult(
    val path: String,
    val name: String,
    val mimeType: String,
    val size: Long,
)

object DraftAttachmentStorage {
    private const val MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
    fun getDraftAttachmentDir(context: Context, draftId: String): File {
        return File(File(context.filesDir, "cadastros"), "$draftId/anexos")
    }

    fun getDraftRootDir(context: Context, draftId: String): File {
        return File(context.filesDir, "cadastros/$draftId")
    }

    fun resolveInternalAttachmentFile(context: Context, draftId: String, fileName: String): File {
        return File(getDraftAttachmentDir(context, draftId), fileName)
    }

    fun deleteDraftDirAfterSuccess(context: Context, draftId: String) {
        runCatching {
            getDraftRootDir(context, draftId).deleteRecursively()
        }
    }

    fun deleteDraftDirAfterSuccess(draftRootDir: File?) {
        runCatching {
            draftRootDir?.deleteRecursively()
        }
    }

    fun resolveAttachmentDisplayName(fileName: String): String {
        val trimmed = fileName.trim()
        return trimmed.ifBlank { "anexo-${UUID.randomUUID()}" }
    }

    fun copyBytesToDraftStorage(
        context: Context,
        draftId: String,
        originalName: String,
        mimeType: String,
        bytes: ByteArray,
    ): DraftAttachmentCopyResult {
        require(bytes.size <= MAX_ATTACHMENT_BYTES) {
            "O anexo excede o limite de 5 MB aceito pelo ERP. Escolha um arquivo menor."
        }
        val safeName = resolveAttachmentDisplayName(originalName)
        val dir = getDraftAttachmentDir(context, draftId)
        dir.mkdirs()
        val target = File(dir, "${System.currentTimeMillis()}_${safeName}")
        FileOutputStream(target).use { it.write(bytes) }
        return DraftAttachmentCopyResult(
            path = target.absolutePath,
            name = target.name,
            mimeType = mimeType.ifBlank { "application/octet-stream" },
            size = target.length(),
        )
    }

    fun resolveInternalAttachmentUriPath(path: String): Boolean {
        return File(path).exists()
    }

    fun copyUriToDraftStorage(
        context: Context,
        draftId: String,
        uri: Uri,
        originalName: String,
        mimeType: String,
    ): DraftAttachmentCopyResult {
        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            ?: throw IllegalStateException("Nao foi possivel ler o anexo selecionado.")
        return copyBytesToDraftStorage(context, draftId, originalName, mimeType, bytes)
    }
}
