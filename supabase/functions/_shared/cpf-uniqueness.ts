const normalizeDigits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

export type DuplicateParticipantCpf = {
  cpf: string;
  dependentIndex: number;
  matchesTitular: boolean;
};

export const findDuplicateParticipantCpf = (
  titularCpf: unknown,
  dependents: unknown[],
  allowTitularRecord = false,
): DuplicateParticipantCpf | null => {
  const normalizedTitularCpf = normalizeDigits(titularCpf);
  const seen = new Set<string>();
  if (normalizedTitularCpf.length === 11) seen.add(normalizedTitularCpf);
  let titularRecordSkipped = false;

  for (let index = 0; index < dependents.length; index += 1) {
    const dependent = dependents[index] as Record<string, unknown> | null;
    const cpf = normalizeDigits(dependent?.cpf ?? dependent?.numeroCpfDependente ?? dependent?.cpfDependente);
    if (cpf.length !== 11) continue;
    if (allowTitularRecord && !titularRecordSkipped &&
      Number(dependent?.tipo) === 1 && cpf === normalizedTitularCpf) {
      titularRecordSkipped = true;
      continue;
    }
    if (seen.has(cpf)) {
      return {
        cpf,
        dependentIndex: index,
        matchesTitular: cpf === normalizedTitularCpf,
      };
    }
    seen.add(cpf);
  }

  return null;
};

export const duplicateParticipantCpfResponse = (duplicate: DuplicateParticipantCpf) => ({
  error: duplicate.matchesTitular
    ? "O CPF do dependente nao pode ser igual ao do titular."
    : `O CPF do dependente ${duplicate.dependentIndex + 1} ja foi informado para outro dependente.`,
  code: "DUPLICATE_PARTICIPANT_CPF",
  dependentIndex: duplicate.dependentIndex,
});
