export function formatCPF(value: string): string {
  if (!value) return '';
  const numbers = value.replace(/\D/g, '');

  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 6) return `${numbers.slice(0, 3)}.${numbers.slice(3)}`;
  if (numbers.length <= 9) {
    return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6)}`;
  }

  return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6, 9)}-${numbers.slice(9, 11)}`;
}

export function removeCPFMask(cpf: string): string {
  if (!cpf) return '';
  return cpf.replace(/\D/g, '');
}

export function getDuplicateCpfError(
  cpf: string,
  otherCpfs: Array<string | null | undefined>,
  titularCpf?: string | null,
): string | null {
  const normalizedCpf = removeCPFMask(cpf);
  if (normalizedCpf.length !== 11) return null;

  if (normalizedCpf === removeCPFMask(titularCpf || '')) {
    return 'O CPF do dependente não pode ser igual ao do titular.';
  }

  if (otherCpfs.some((otherCpf) => removeCPFMask(otherCpf || '') === normalizedCpf)) {
    return 'Este CPF já foi informado para outro dependente.';
  }

  return null;
}

export function validateCPF(cpf: string): boolean {
  const numbers = removeCPFMask(cpf);

  if (numbers.length !== 11) return false;

  if (/^(\d)\1{10}$/.test(numbers)) return false;

  let sum = 0;
  let remainder;

  for (let i = 1; i <= 9; i++) {
    sum += parseInt(numbers.substring(i - 1, i)) * (11 - i);
  }

  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(numbers.substring(9, 10))) return false;

  sum = 0;
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(numbers.substring(i - 1, i)) * (12 - i);
  }

  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(numbers.substring(10, 11))) return false;

  return true;
}

export function formatPhone(phone: string): string {
  if (!phone) return '';
  const numbers = phone.replace(/\D/g, '');

  if (numbers.length === 11) {
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
  }

  if (numbers.length === 10) {
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 6)}-${numbers.slice(6)}`;
  }

  return numbers;
}

export function normalizeMobilePhone(phone: string): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '').slice(0, 11);
}

export function formatMobilePhone(phone: string): string {
  if (!phone) return '';

  const numbers = normalizeMobilePhone(phone);

  if (numbers.length <= 2) return `(${numbers}`;
  if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;

  return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)} ${numbers.slice(7)}`;
}

export function formatCEP(cep: string): string {
  if (!cep) return '';
  const numbers = cep.replace(/\D/g, '');

  if (numbers.length <= 5) return numbers;
  return `${numbers.slice(0, 5)}-${numbers.slice(5, 8)}`;
}

export function formatDate(date: string | Date): string {
  if (!date) return '';

  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [year, month, day] = date.split('-');
    return `${day}/${month}/${year}`;
  }

  const d = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(d.getTime())) return '';

  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();

  return `${day}/${month}/${year}`;
}

export function formatDateFromISO(isoDate: string): string {
  if (!isoDate) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    const [year, month, day] = isoDate.split('-');
    return `${day}/${month}/${year}`;
  }

  return formatDate(isoDate);
}

export function parseISODate(isoDate: string): Date | null {
  try {
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

export function normalizeToISO(date: string): string {
  if (!date) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
    const [dd, mm, yyyy] = date.split('/');
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  return '';
}
