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
          className="vm-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="vm-glass-modal max-h-[92vh] w-full max-w-sm overflow-hidden rounded-3xl sm:max-w-md"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="vm-glass-modal-bar flex items-start justify-between gap-4 border-b px-4 py-4 sm:px-6 sm:py-5">
              <div>
                <h3 className="vm-page-title text-base font-semibold sm:text-lg">QR Code do Link</h3>
                <p className="vm-muted-text mt-1 text-xs sm:text-sm">
                  Escaneie para abrir a página de adesão.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="vm-glass-nav-item rounded-lg p-2"
                aria-label="Fechar QR Code"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 sm:px-6 py-4 sm:py-6 space-y-4 overflow-y-auto max-h-[calc(92vh-78px)]">
              {empresaNome && (
                <div className="vm-cadastro-subcard rounded-xl px-3 py-3 text-sm text-slate-700 dark:text-slate-200 sm:px-4">
                  {empresaNome}
                </div>
              )}

              <div className="vm-cadastro-subcard flex min-h-[240px] items-center justify-center rounded-2xl p-4 sm:min-h-72 sm:p-6">
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
                <div className="vm-cadastro-subcard break-all rounded-xl p-3 text-[11px] text-slate-600 dark:text-slate-300 sm:p-4 sm:text-xs">
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
