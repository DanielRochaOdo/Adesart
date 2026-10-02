import { useEffect, useState } from 'react';
import { Copy, ExternalLink, Link as LinkIcon, Loader2 } from 'lucide-react';
import { EmpresaSearchCard } from './EmpresaSearchCard';
import { Button } from '../Button';
import { Select } from '../Select';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { generateCadastroLinkToken, hashCadastroLinkToken } from '../../lib/cadastroLink';
import { CadastroLinkQrButton } from './CadastroLinkQrButton';
import { LinkActionIconButton } from './LinkActionIconButton';
import { buildPublicAdesaoUrl } from '../../lib/publicUrl';

interface Empresa {
  id: number;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  enderecoEmpresa: any;
  precoPlano: any[];
  exigeMatricula?: number;
  observacoes?: string;
  raw: any;
}

interface VendedorLink {
  id: string;
  name: string | null;
  email: string | null;
  external_id: string | null;
  team_id: string | null;
  team_name: string | null;
}

interface Adesionista {
  id: string;
  name: string | null;
  email: string | null;
  external_id: string | null;
}

interface GeneratedLink {
  url: string;
  empresaNome: string;
  empresaCodigo: number;
}

interface LinkCadastroCardProps {
  onGenerated?: () => void;
}

export function LinkCadastroCard({ onGenerated }: LinkCadastroCardProps) {
  const { profile } = useAuth();
  const [selectedEmpresa, setSelectedEmpresa] = useState<Empresa | null>(null);
  const [vendedores, setVendedores] = useState<VendedorLink[]>([]);
  const [selectedVendedor, setSelectedVendedor] = useState('');
  const [loadingVendedores, setLoadingVendedores] = useState(false);
  const [vendedorError, setVendedorError] = useState('');
  const [adesionistas, setAdesionistas] = useState<Adesionista[]>([]);
  const [selectedAdesionista, setSelectedAdesionista] = useState('');
  const [loadingAdesionistas, setLoadingAdesionistas] = useState(false);
  const [adesionistaError, setAdesionistaError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [generatedLink, setGeneratedLink] = useState<GeneratedLink | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showAuthorizationModal, setShowAuthorizationModal] = useState(false);
  const [requiresAuthorization, setRequiresAuthorization] = useState<boolean | null>(null);
  const resolvedVendedorCodigo = profile?.external_id?.trim() || '0';
  const isGerente = profile?.role === 'GERENTE';

  useEffect(() => {
    if (!profile?.id || !isGerente) {
      setVendedores([]);
      setSelectedVendedor('');
      setVendedorError('');
      return;
    }

    let active = true;
    setLoadingVendedores(true);
    setVendedorError('');

    void (async () => {
      try {
        const [{ data: vendedoresData, error: vendedoresError }, { data: teamsData, error: teamsError }] =
          await Promise.all([
            supabase
              .from('profiles')
              .select('id, name, email, external_id, team_id')
              .eq('role', 'VENDEDOR')
              .eq('is_active', true)
              .not('external_id', 'is', null)
              .not('team_id', 'is', null)
              .order('name'),
            supabase.from('teams').select('id, name').eq('is_active', true).order('name'),
          ]);

        if (vendedoresError) throw vendedoresError;
        if (teamsError) throw teamsError;
        if (!active) return;

        const teamNameById = new Map(
          (teamsData || []).map((team) => [String(team.id), String(team.name || '')]),
        );

        setVendedores(
          (vendedoresData || [])
            .filter((item) => String(item.external_id || '').trim() !== '')
            .map((item) => ({
              ...item,
              team_name: item.team_id ? teamNameById.get(String(item.team_id)) || 'Sem equipe' : 'Sem equipe',
            })),
        );
      } catch (err) {
        if (!active) return;
        console.error('Error loading sellers for manager link:', err);
        setVendedores([]);
        setVendedorError('Não foi possível carregar os vendedores. Atualize a página e tente novamente.');
      } finally {
        if (active) setLoadingVendedores(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [profile?.id, isGerente]);

  // Reutiliza a mesma fonte e os mesmos critérios do seletor em +Adesão.
  useEffect(() => {
    if (!profile?.id) return;
    let active = true;
    setLoadingAdesionistas(true);
    setAdesionistaError('');
    supabase.from('profiles')
      .select('id, name, email, external_id')
      .eq('role', 'ADESIONISTA')
      .eq('is_active', true)
      .not('external_id', 'is', null)
      .order('name')
      .then(({ data, error: fetchError }) => {
        if (!active) return;
        if (fetchError) {
          setAdesionistaError('Não foi possível carregar os adesionistas. Atualize a página para tentar novamente.');
          setAdesionistas([]);
        } else {
          setAdesionistas((data || []).filter(item => String(item.external_id || '').trim() !== ''));
        }
        setLoadingAdesionistas(false);
      });
    return () => { active = false; };
  }, [profile?.id]);

  const handleEmpresaSelected = (empresa: Empresa | null) => {
    setSelectedEmpresa(empresa);
    setSelectedVendedor('');
    setSelectedAdesionista('');
    setGeneratedLink(null);
    setSuccess('');
    setError('');
    setCopySuccess(false);
    setRequiresAuthorization(null);
    setShowAuthorizationModal(Boolean(empresa));
  };

  const handleAuthorizationAnswer = (requires: boolean) => {
    setRequiresAuthorization(requires);
    setShowAuthorizationModal(false);
    setGeneratedLink(null);
    setSuccess('');
    setCopySuccess(false);

    if (requires) {
      setError('O QR Code não tem permissão ser gerado');
      return;
    }

    setError('');
  };

  const handleGenerateLink = async () => {
    setError('');
    setSuccess('');
    setCopySuccess(false);

    if (!profile?.id) {
      setError('Usuário não autenticado');
      return;
    }

    if (!selectedEmpresa) {
      setError('Selecione uma empresa antes de gerar o link');
      return;
    }

    if (requiresAuthorization !== false) {
      setError(
        requiresAuthorization
          ? 'O QR Code não tem permissão ser gerado'
          : 'Informe se a empresa requer autorização antes de gerar o QR Code',
      );
      return;
    }

    const vendedor = isGerente
      ? vendedores.find((item) => item.id === selectedVendedor)
      : null;

    if (isGerente && !vendedor) {
      setError('Selecione um vendedor antes de gerar o link');
      return;
    }

    const adesionista = selectedAdesionista
      ? adesionistas.find(item => item.id === selectedAdesionista)
      : null;
    if (selectedAdesionista && !adesionista) {
      setError('O adesionista selecionado não está disponível. Atualize a lista e tente novamente.');
      return;
    }

    setLoading(true);

    try {
      const rawToken = generateCadastroLinkToken();
      const tokenHash = await hashCadastroLinkToken(rawToken);
      const url = buildPublicAdesaoUrl(rawToken);

      const vendedorId = vendedor?.id || profile.id;
      const vendedorCodigo = vendedor?.external_id?.trim() || resolvedVendedorCodigo;
      const vendedorNome = vendedor?.name || vendedor?.email || profile.name || profile.email;
      const vendedorTeamId = vendedor?.team_id || profile.team_id;

      const payload = {
        created_by: profile.id,
        team_id: vendedorTeamId,
        token_hash: tokenHash,
        link_url: url,
        empresa_codigo: selectedEmpresa.id,
        empresa_nome: selectedEmpresa.nomeFantasia || selectedEmpresa.razaoSocial,
        empresa_cnpj: selectedEmpresa.cnpj || null,
        empresa_raw: selectedEmpresa.raw || selectedEmpresa,
        empresa_exige_matricula: selectedEmpresa.exigeMatricula || 0,
        planos_raw: selectedEmpresa.precoPlano || [],
        vendedor_id: vendedorId,
        vendedor_codigo: vendedorCodigo,
        vendedor_nome: vendedorNome,
        // O banco confirma e preenche codigo/nome canonicos ao inserir o link.
        adesionista_id: adesionista?.id || null,
      };

      const { error: insertError } = await supabase
        .from('cadastro_links')
        .insert(payload);

      if (insertError) {
        throw insertError;
      }

      setGeneratedLink({
        url,
        empresaNome: payload.empresa_nome,
        empresaCodigo: payload.empresa_codigo,
      });
      setSuccess('Link gerado com sucesso');
      onGenerated?.();
    } catch (err) {
      console.error('Error generating cadastro link:', err);
      setError(err instanceof Error ? err.message : 'Erro ao gerar o link');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!generatedLink?.url) return;

    try {
      await navigator.clipboard.writeText(generatedLink.url);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    } catch (err) {
      console.error('Error copying link:', err);
      setError('Não foi possível copiar o link automaticamente');
    }
  };

  return (
    <>
      {showAuthorizationModal && selectedEmpresa && (
        <div className="vm-modal-overlay fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="vm-glass-modal w-full max-w-md overflow-hidden rounded-2xl">
            <div className="vm-glass-modal-bar border-b p-6">
              <h2 className="vm-page-title text-xl font-semibold">A empresa requer autorização?</h2>
              <p className="vm-muted-text mt-2 text-sm">
                Empresa {selectedEmpresa.id} - {selectedEmpresa.nomeFantasia || selectedEmpresa.razaoSocial}
              </p>
            </div>

            <div className="vm-glass-modal-bar flex justify-end gap-3 border-t p-6">
              <Button variant="secondary" onClick={() => handleAuthorizationAnswer(true)}>
                Sim
              </Button>
              <Button onClick={() => handleAuthorizationAnswer(false)}>
                Não
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6 max-w-3xl">
        <div className="vm-cadastro-card rounded-3xl p-6">
          <div className="flex items-start gap-3 mb-6">
            <div className="vm-dashboard-icon rounded-xl bg-emerald-500/10 p-3 text-emerald-700 dark:text-emerald-300">
              <LinkIcon className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h3 className="vm-page-title text-lg font-semibold">Gerar Link de Adesão</h3>
              <p className="vm-muted-text mt-1 text-sm">
                {isGerente
                  ? 'Selecione a empresa e o vendedor responsável pelo link público.'
                  : 'O link será vinculado a esta empresa e ao código de vendedor do usuário logado.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="vm-cadastro-subcard rounded-2xl p-4">
              <p className="vm-meta-text mb-1 text-xs font-semibold uppercase tracking-wide">
                Usuário
              </p>
              <p className="vm-page-title text-sm font-semibold">
                {profile?.name || profile?.email || 'Não identificado'}
              </p>
            </div>

            <div className="vm-cadastro-subcard rounded-2xl p-4">
              <p className="vm-meta-text mb-1 text-xs font-semibold uppercase tracking-wide">
                {isGerente ? 'Vendedor do Link' : 'Código de Vendedor'}
              </p>
              <p className="vm-page-title text-sm font-semibold">
                {isGerente
                  ? (vendedores.find((item) => item.id === selectedVendedor)?.name || 'Selecione um vendedor abaixo')
                  : (profile?.external_id || 'Não configurado - será usado o código 0')}
              </p>
            </div>
          </div>

          <div className="vm-cadastro-subcard mb-6 rounded-2xl p-4">
            <p className="vm-meta-text mb-1 text-xs font-semibold uppercase tracking-wide">
              URL Publica do Link
            </p>
            <p className="vm-muted-text break-all text-sm">
              {String(import.meta.env.VITE_PUBLIC_APP_URL || '').trim() || window.location.origin}
            </p>
          </div>

          <EmpresaSearchCard
            selectedEmpresa={selectedEmpresa}
            onEmpresaSelected={handleEmpresaSelected}
          />

          {error && (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {success && (
            <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
              {success}
            </div>
          )}

          {selectedEmpresa && requiresAuthorization === false && (
            <div className="mt-6 space-y-4">
              {isGerente && (
                <div>
                  <Select
                    label="Vendedor"
                    value={selectedVendedor}
                    onChange={(event) => setSelectedVendedor(event.target.value)}
                    disabled={loading || loadingVendedores || Boolean(vendedorError)}
                    required
                  >
                    <option value="">Selecione um vendedor</option>
                    {vendedores.map((vendedor) => (
                      <option key={vendedor.id} value={vendedor.id}>
                        {vendedor.name || vendedor.email || 'Vendedor sem nome'} — Equipe: {vendedor.team_name || 'Sem equipe'} — ID Externo: {vendedor.external_id}
                      </option>
                    ))}
                  </Select>
                  {loadingVendedores && (
                    <p className="mt-2 text-sm text-slate-500">Carregando vendedores...</p>
                  )}
                  {vendedorError && (
                    <p className="mt-2 text-sm text-red-700">{vendedorError}</p>
                  )}
                  {!loadingVendedores && !vendedorError && vendedores.length === 0 && (
                    <p className="mt-2 text-sm text-amber-700">
                      Nenhum vendedor ativo com ID Externo está disponível.
                    </p>
                  )}
                </div>
              )}

              <Select
                label="Adesionista (Opcional)"
                value={selectedAdesionista}
                onChange={(event) => setSelectedAdesionista(event.target.value)}
                disabled={loading || loadingAdesionistas || Boolean(adesionistaError)}
              >
                <option value="">Selecione um adesionista (opcional)</option>
                {adesionistas.map((adesionista) => (
                  <option key={adesionista.id} value={adesionista.id}>
                    {adesionista.name || adesionista.email || 'Adesionista sem nome'} - Código: {adesionista.external_id}
                  </option>
                ))}
              </Select>
              {adesionistaError && <p className="mt-2 text-sm text-amber-700">{adesionistaError} O campo é opcional.</p>}
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <Button
              onClick={handleGenerateLink}
              disabled={
                loading ||
                !selectedEmpresa ||
                requiresAuthorization !== false ||
                (isGerente && (!selectedVendedor || loadingVendedores || Boolean(vendedorError)))
              }
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Gerando link...
                </>
              ) : (
                <>
                  <LinkIcon className="w-4 h-4 mr-2" />
                  Gerar Link
                </>
              )}
            </Button>
          </div>
        </div>

        {generatedLink && requiresAuthorization === false && (
          <div className="vm-cadastro-card rounded-3xl p-6">
            <h4 className="vm-page-title mb-2 text-base font-semibold">Link Gerado</h4>
            <p className="vm-muted-text mb-4 text-sm">
              Empresa {generatedLink.empresaCodigo} - {generatedLink.empresaNome}
            </p>

            <div className="vm-cadastro-subcard break-all rounded-2xl p-4 text-sm text-slate-700 dark:text-slate-200">
              {generatedLink.url}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="vm-meta-text text-xs">
                {copySuccess ? 'Link copiado para a área de transferencia.' : 'Ações rapidas do link'}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <LinkActionIconButton
                  icon={Copy}
                  label={copySuccess ? 'Link copiado' : 'Copiar link'}
                  tone={copySuccess ? 'success' : 'default'}
                  onClick={handleCopyLink}
                />

                <LinkActionIconButton
                  icon={ExternalLink}
                  label="Abrir link"
                  onClick={() => window.open(generatedLink.url, '_blank', 'noopener,noreferrer')}
                />

                <CadastroLinkQrButton
                  url={generatedLink.url}
                  empresaNome={`${generatedLink.empresaCodigo} - ${generatedLink.empresaNome}`}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
