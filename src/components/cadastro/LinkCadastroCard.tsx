import { useState } from 'react';
import { Copy, ExternalLink, Link as LinkIcon, Loader2 } from 'lucide-react';
import { EmpresaSearchCard } from './EmpresaSearchCard';
import { Button } from '../Button';
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [generatedLink, setGeneratedLink] = useState<GeneratedLink | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showAuthorizationModal, setShowAuthorizationModal] = useState(false);
  const [requiresAuthorization, setRequiresAuthorization] = useState<boolean | null>(null);
  const resolvedVendedorCodigo = profile?.external_id?.trim() || '0';

  const handleEmpresaSelected = (empresa: Empresa | null) => {
    setSelectedEmpresa(empresa);
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
      setError('Usuario nao autenticado');
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

    setLoading(true);

    try {
      const rawToken = generateCadastroLinkToken();
      const tokenHash = await hashCadastroLinkToken(rawToken);
      const url = buildPublicAdesaoUrl(rawToken);

      const payload = {
        created_by: profile.id,
        team_id: profile.team_id,
        token_hash: tokenHash,
        link_url: url,
        empresa_codigo: selectedEmpresa.id,
        empresa_nome: selectedEmpresa.nomeFantasia || selectedEmpresa.razaoSocial,
        empresa_cnpj: selectedEmpresa.cnpj || null,
        empresa_raw: selectedEmpresa.raw || selectedEmpresa,
        empresa_exige_matricula: selectedEmpresa.exigeMatricula || 0,
        planos_raw: selectedEmpresa.precoPlano || [],
        vendedor_id: profile.id,
        vendedor_codigo: resolvedVendedorCodigo,
        vendedor_nome: profile.name || profile.email,
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
      setError('Nao foi possivel copiar o link automaticamente');
    }
  };

  return (
    <>
      {showAuthorizationModal && selectedEmpresa && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-40">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold text-slate-800">A empresa requer autorização?</h2>
              <p className="text-sm text-slate-600 mt-2">
                Empresa {selectedEmpresa.id} - {selectedEmpresa.nomeFantasia || selectedEmpresa.razaoSocial}
              </p>
            </div>

            <div className="flex justify-end gap-3 p-6 bg-slate-50">
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
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-start gap-3 mb-6">
            <div className="p-3 rounded-lg bg-emerald-50">
              <LinkIcon className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800">Gerar Link de Adesao</h3>
              <p className="text-sm text-slate-600 mt-1">
                O link sera vinculado a esta empresa e ao codigo de vendedor do usuario logado.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Usuario
              </p>
              <p className="text-sm font-medium text-slate-800">
                {profile?.name || profile?.email || 'Nao identificado'}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Codigo de Vendedor
              </p>
              <p className="text-sm font-medium text-slate-800">
                {profile?.external_id || 'Nao configurado - sera usado o codigo 0'}
              </p>
            </div>
          </div>

          <div className="mb-6 bg-slate-50 border border-slate-200 rounded-lg p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              URL Publica do Link
            </p>
            <p className="text-sm text-slate-700 break-all">
              {String(import.meta.env.VITE_PUBLIC_APP_URL || '').trim() || window.location.origin}
            </p>
          </div>

          <EmpresaSearchCard
            selectedEmpresa={selectedEmpresa}
            onEmpresaSelected={handleEmpresaSelected}
          />

          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
              {success}
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <Button
              onClick={handleGenerateLink}
              disabled={loading || !selectedEmpresa || requiresAuthorization !== false}
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
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h4 className="text-base font-semibold text-slate-800 mb-2">Link Gerado</h4>
            <p className="text-sm text-slate-600 mb-4">
              Empresa {generatedLink.empresaCodigo} - {generatedLink.empresaNome}
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 break-all text-sm text-slate-700">
              {generatedLink.url}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                {copySuccess ? 'Link copiado para a area de transferencia.' : 'Acoes rapidas do link'}
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
