import { supabase } from '../lib/supabase';

export interface UploadedFile {
  nome: string;
  path: string;
  mime: string;
  size: number;
}

export interface UploadProgress {
  percent: number;
  status: 'uploading' | 'completed' | 'error';
}

export const ERP_MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILE_SIZE = ERP_MAX_FILE_SIZE;
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];

function sanitizeFileName(fileName: string): string {
  return fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
}

export async function uploadToStorage(
  file: File,
  userId: string,
  bucket: string = 'cadastros-temp-files',
  prefix: string = ''
): Promise<UploadedFile> {
  if (!file) {
    throw new Error('Nenhum arquivo selecionado');
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Tipo de arquivo não permitido. Use JPG, PNG ou PDF');
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error('Arquivo muito grande. Tamanho máximo: 5MB');
  }

  const sanitizedName = sanitizeFileName(file.name);
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const fileName = `${timestamp}_${random}_${sanitizedName}`;
  const filePath = prefix ? `${userId}/${prefix}/${fileName}` : `${userId}/${fileName}`;

  try {
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Erro ao fazer upload: ${uploadError.message}`);
    }

    return {
      nome: file.name,
      path: filePath,
      mime: file.type,
      size: file.size
    };
  } catch (error) {
    console.error('Error in uploadToStorage:', error);
    throw error instanceof Error ? error : new Error('Erro desconhecido ao fazer upload');
  }
}

export async function deleteFromStorage(
  path: string,
  bucket: string = 'cadastros-temp-files'
): Promise<void> {
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([path]);

    if (error) {
      console.warn('Error deleting file from storage:', error);
    }
  } catch (error) {
    console.warn('Failed to delete file from storage:', error);
  }
}

export function validateFile(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'Nenhum arquivo selecionado' };
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: 'Apenas arquivos JPG, PNG ou PDF são permitidos' };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'Arquivo muito grande. Tamanho máximo: 5MB' };
  }

  return { valid: true };
}
