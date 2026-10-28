import { formatCPF, formatDate, formatDateFromISO, removeCPFMask } from './cpf';

export interface LemmitPessoa {
  cpf?: string | null;
  nome?: string | null;
  data_nascimento?: string | null;
  sexo?: string | null;
  nome_mae?: string | null;
  celulares?: Array<{
    ddd?: number | null;
    numero?: string | null;
    plus?: boolean | null;
    ranking?: number | null;
    whatsapp?: boolean | null;
  }>;
  fixos?: Array<{
    ddd?: number | null;
    numero?: string | null;
    ranking?: number | null;
  }>;
  emails?: Array<{
    email?: string | null;
    ranking?: number | null;
    possui_cookie?: boolean | null;
  }>;
  enderecos?: Array<{
    endereco?: string | null;
    tipo_logradouro?: string | null;
    titulo_logradouro?: string | null;
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    uf?: string | null;
    cep?: string | null;
    tipo?: string | null;
    ranking?: number | null;
  }>;
  [key: string]: unknown;
}

export interface LemitResponse {
  data_consulta?: string;
  pessoa?: LemmitPessoa;
  [key: string]: unknown;
}

export interface CadastroContato {
  tipo: 'celular' | 'fixo' | 'email' | 'whatsapp';
  valor: string;
  principal?: boolean;
}

export interface CadastroEndereco {
  cep: string;
  tipoLogradouro: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  idTipoLogradouro?: number;
  idBairro?: number;
  idMunicipio?: number;
  idUf?: number;
  ufSigla?: string;
}

export interface Dependente {
  tipo: number;
  nome: string;
  dataNascimento: string;
  cpf: string;
  sexo: number;
  sexoDescricao: string;
  plano: number;
  planoValor: string;
  nomeMae: string;
  carenciaAtendimento: number;
  funcionarioCadastro: number;
}

export interface ContatoResponsavelFinanceiro {
  tipo: number;
  dado: string;
}

export interface CadastroFormData {
  cpf: string;
  nome: string;
  dataNascimento: string;
  sexo: string;
  sexoCodigo: number;
  contatos: CadastroContato[];
  endereco: CadastroEndereco;
  nomeMae?: string;
  dependentes?: Dependente[];
  numeroMatricula?: string;
}

export function mapLemitToCadastro(lemitData: LemitResponse | null, cpf: string): Partial<CadastroFormData> {
  const pessoa = lemitData?.pessoa;

  if (!pessoa || !lemitData) {
    return {
      cpf: removeCPFMask(cpf),
      nome: '',
      dataNascimento: '',
      sexo: '',
      sexoCodigo: 0,
      contatos: [],
    };
  }

  const contatos: CadastroContato[] = [];

  if (pessoa.celulares && Array.isArray(pessoa.celulares)) {
    const celularesComPlus = pessoa.celulares
      .filter(cel => cel.plus === true)
      .sort((a, b) => (a.ranking || 999) - (b.ranking || 999));

    celularesComPlus.forEach((cel, index) => {
      if (cel.numero) {
        const ddd = cel.ddd ? String(cel.ddd) : '';
        const numero = `${ddd}${cel.numero}`;
        contatos.push({
          tipo: cel.whatsapp ? 'whatsapp' : 'celular',
          valor: removeCPFMask(numero),
          principal: index === 0,
        });
      }
    });
  }

  if (pessoa.fixos && Array.isArray(pessoa.fixos)) {
    pessoa.fixos
      .sort((a, b) => (a.ranking || 999) - (b.ranking || 999))
      .forEach((tel) => {
        if (tel.numero) {
          const ddd = tel.ddd ? String(tel.ddd) : '';
          const numero = `${ddd}${tel.numero}`;
          contatos.push({
            tipo: 'fixo',
            valor: removeCPFMask(numero),
            principal: false,
          });
        }
      });
  }

  if (pessoa.emails && Array.isArray(pessoa.emails)) {
    pessoa.emails
      .sort((a, b) => (a.ranking || 999) - (b.ranking || 999))
      .forEach((emailObj, index) => {
        if (emailObj.email) {
          contatos.push({
            tipo: 'email',
            valor: emailObj.email,
            principal: index === 0,
          });
        }
      });
  }

  let endereco: CadastroEndereco | undefined;
  if (pessoa.enderecos && Array.isArray(pessoa.enderecos) && pessoa.enderecos.length > 0) {
    const endLemmit = pessoa.enderecos
      .filter(e => e.ranking === 1)
      .sort((a, b) => (a.ranking || 999) - (b.ranking || 999))[0] || pessoa.enderecos[0];

    const cepLimpo = endLemmit.cep ? removeCPFMask(endLemmit.cep) : '';

    endereco = {
      cep: cepLimpo,
      tipoLogradouro: endLemmit.tipo_logradouro || '',
      logradouro: endLemmit.logradouro || '',
      numero: endLemmit.numero || '',
      complemento: endLemmit.complemento || '',
      bairro: endLemmit.bairro || '',
      cidade: endLemmit.cidade || '',
      uf: endLemmit.uf || '',
    };
  }

  let sexoCodigo = 0;
  const sexoStr = (pessoa.sexo || '').toUpperCase();
  if (sexoStr === 'M' || sexoStr === 'MASCULINO') {
    sexoCodigo = 1;
  } else if (sexoStr === 'F' || sexoStr === 'FEMININO') {
    sexoCodigo = 0;
  }

  let dataNascimento = '';
  if (pessoa.data_nascimento) {
    try {
      const date = new Date(pessoa.data_nascimento);
      dataNascimento = date.toISOString().split('T')[0];
    } catch (e) {
      dataNascimento = pessoa.data_nascimento;
    }
  }

  return {
    cpf: removeCPFMask(cpf),
    nome: pessoa.nome || '',
    dataNascimento: dataNascimento,
    sexo: sexoStr,
    sexoCodigo,
    contatos,
    endereco,
    nomeMae: pessoa.nome_mae || undefined,
  };
}

export function buildERPPayload(
  cadastro: CadastroFormData,
  empresaId: number,
  vendedorCodigo?: string | null,
  funcionarioCadastroId?: number | null,
  userRole?: string | null,
  userExternalId?: string | null,
  adesionistaCodigo?: string | null
): Record<string, unknown> {
  const sexoDescricao = cadastro.sexoCodigo === 1 ? 'Masculino' : 'Feminino';

  let codigoVendedor = 0;
  let codigoAdesionista = 0;

  if (userRole === 'VENDEDOR' && userExternalId) {
    codigoVendedor = parseInt(userExternalId);
  } else if (vendedorCodigo) {
    codigoVendedor = parseInt(vendedorCodigo);
  }

  if (adesionistaCodigo) {
    codigoAdesionista = parseInt(adesionistaCodigo);
  }

  const funcionarioCadastroCode = userExternalId
    ? parseInt(userExternalId)
    : (funcionarioCadastroId || 0);

  const contatosRespFin = cadastro.contatos.map(contato => {
    let tipo: number;
    if (contato.tipo === 'celular') {
      tipo = 8;
    } else if (contato.tipo === 'whatsapp') {
      tipo = 10;
    } else if (contato.tipo === 'fixo') {
      tipo = 1;
    } else if (contato.tipo === 'email') {
      tipo = 50;
    } else {
      tipo = 8;
    }

    return {
      tipo,
      dado: contato.valor,
    };
  });

  const responsavelFinanceiro: Record<string, any> = {
    codigoContrato: empresaId.toString(),
    nome: cadastro.nome,
    dataNascimento: formatDateFromISO(cadastro.dataNascimento),
    cpf: formatCPF(cadastro.cpf),
    sexo: cadastro.sexoCodigo,
    grupoFaturamento: 0,
    sexoDescricao: sexoDescricao,
    identidadeNumero: '123456789',
    identidadeOrgaoExpeditor: 'SSPDS',
    endereco: {
      cep: cadastro.endereco.cep,
      tipoLogradouro: cadastro.endereco.idTipoLogradouro?.toString() || '816',
      logradouro: cadastro.endereco.logradouro,
      numero: cadastro.endereco.numero,
      complemento: cadastro.endereco.complemento || 'N/D',
      bairro: cadastro.endereco.idBairro?.toString() || '1262',
      municipio: cadastro.endereco.idMunicipio?.toString() || '2',
      uf: cadastro.endereco.idUf?.toString() || '5',
      descricaoUf: cadastro.endereco.ufSigla || cadastro.endereco.uf,
    },
    contatoResponsavelFinanceiro: contatosRespFin,
    fl_AlteraSituacao: 1,
  };

  if (cadastro.numeroMatricula) {
    responsavelFinanceiro.Matricula = cadastro.numeroMatricula;
  }

  responsavelFinanceiro.dataApresentacao = new Date().toISOString();

  const parceiroObj: Record<string, any> = {
    codigo: codigoVendedor,
    tipoCobranca: 1,
  };

  if (codigoAdesionista > 0) {
    parceiroObj.adesionista = codigoAdesionista;
  }

  const payload = {
    dados: {
      parceiro: parceiroObj,
      parcelaRetidaComissao: '0',
      responsavelFinanceiro: responsavelFinanceiro,
      dependente: [
        ...(cadastro.dependentes || []).map((dep) => ({
          tipo: dep.tipo,
          nome: dep.nome,
          dataNascimento: formatDateFromISO(dep.dataNascimento),
          cpf: formatCPF(dep.cpf),
          sexo: dep.sexo,
          sexoDescricao: dep.sexoDescricao,
          plano: dep.plano,
          planoValor: dep.planoValor,
          nomeMae: dep.nomeMae,
          carenciaAtendimento: 1,
          funcionarioCadastro: funcionarioCadastroCode,
        })),
      ],
    },
    empresa: empresaId.toString(),
  };

  return payload;
}
