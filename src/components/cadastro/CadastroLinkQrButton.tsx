import { useEffect, useState } from 'react';
import { Download, ExternalLink, Loader2, QrCode, X } from 'lucide-react';
import QRCode from 'qrcode';
import { Button } from '../Button';
import { LinkActionIconButton } from './LinkActionIconButton';

interface CadastroLinkQrButtonProps {
  url?: string | null;
  empresaNome?: string;
  disabled?: boolean;
  className?: string;
  buttonLabel?: string;
  iconOnly?: boolean;
}

export function CadastroLinkQrButton({
  url,
  empresaNome,
  disabled = false,
  className = '',
  buttonLabel = 'Gerar QRCode',
  iconOnly = true,
}: CadastroLinkQrButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !url) {
      return;
    }

    let active = true;

    const generateQrCode = async () => {
      setLoading(true);
      setError('');

      try {
        const dataUrl = await QRCode.toDataURL(url, {
          width: 320,
          margin: 2,
          color: {
            dark: '#0f172a',
            light: '#ffffff',
          },
        });

        if (active) {
          setQrCodeDataUrl(dataUrl);
        }
      } catch (err) {
        console.error('Error generating QR code:', err);
        if (active) {
          setError('Não foi possível gerar o QR Code');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    generateQrCode();

    return () => {
      active = false;
    };
  }, [open, url]);

  const handleDownload = () => {
    if (!qrCodeDataUrl) return;

    const link = document.createElement('a');
    link.href = qrCodeDataUrl;
    link.download = `qrcode-cadastro-${(empresaNome || 'link').replace(/\s+/g, '-').toLowerCase()}.png`;
    link.click();
  };

  return (
    <>
      {iconOnly ? (
        <LinkActionIconButton
          icon={QrCode}
          label={buttonLabel}
          onClick={() => setOpen(true)}
          disabled={disabled || !url}
          className={className}
        />
      ) : (
        <Button
          type="button"
          variant="secondary"
          onClick={() => setOpen(true)}
          disabled={disabled || !url}
          className={className}
        >
          <QrCode className="w-4 h-4 mr-2" />
          {buttonLabel}
        </Button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm sm:max-w-md max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-200">
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-slate-800">QR Code do Link</h3>
                <p className="text-xs sm:text-sm text-slate-600 mt-1">
                  Escaneie para abrir a pagina de adesao.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                aria-label="Fechar QR Code"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 sm:px-6 py-4 sm:py-6 space-y-4 overflow-y-auto max-h-[calc(92vh-78px)]">
              {empresaNome && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 sm:px-4 py-3 text-sm text-slate-700">
                  {empresaNome}
                </div>
              )}

              <div className="flex items-center justify-center min-h-[240px] sm:min-h-72 bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-6">
                {loading ? (
                  <div className="text-center text-slate-600">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-emerald-600" />
                    <p className="text-sm">Gerando QR Code...</p>
                  </div>
                ) : error ? (
                  <p className="text-sm text-red-600 text-center">{error}</p>
                ) : (
                  <img
                    src={qrCodeDataUrl}
                    alt="QR Code do link de adesão"
                    className="w-full max-w-[220px] sm:max-w-[280px] aspect-square object-contain"
                  />
                )}
              </div>

              {url && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 sm:p-4 text-[11px] sm:text-xs text-slate-600 break-all">
                  {url}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleDownload}
                  disabled={!qrCodeDataUrl}
                  className="w-full sm:flex-1"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Baixar PNG
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => url && window.open(url, '_blank', 'noopener,noreferrer')}
                  disabled={!url}
                  className="w-full sm:flex-1"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Abrir Link
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
